import type { EvesesOptions } from './types';
import {
  EvesesAuthError,
  EvesesError,
  EvesesForbiddenError,
  EvesesNotFoundError,
  EvesesRateLimitError,
  EvesesServerError,
  EvesesValidationError,
} from './errors';
import { Activations } from './modules/activations';
import { Catalog } from './modules/catalog';
import { Wallet } from './modules/wallet';
import { Webhooks } from './modules/webhooks';

const DEFAULT_BASE_URL = 'https://api.eveses.io';
const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_USER_AGENT = '@eveses/sdk-js/0.1.0';

/** Internal request shape used by every module. */
export interface RequestOptions {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  path: string;
  query?: Record<string, string | number | boolean | undefined>;
  body?: unknown;
  /** Header overrides for this single request (e.g. Idempotency-Key). */
  headers?: Record<string, string>;
}

/**
 * Eveses SDK client.
 *
 * @example
 *   const client = new Eveses({ apiKey: process.env.EVESES_API_KEY! });
 *   const order = await client.activations.create({ country: 'ua', service: 'telegram' });
 */
export class Eveses {
  public readonly activations: Activations;
  public readonly wallet: Wallet;
  public readonly catalog: Catalog;
  /** Static-like webhook helpers (also exported as `Webhooks` from the package root). */
  public readonly webhooks: typeof Webhooks;

  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;
  private readonly defaultHeaders: Record<string, string>;
  private readonly userAgent: string;

  constructor(opts: EvesesOptions) {
    if (!opts || !opts.apiKey) {
      throw new EvesesError('apiKey is required', 0);
    }
    this.apiKey = opts.apiKey;
    this.baseUrl = (opts.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, '');
    this.timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.fetchImpl = opts.fetch ?? globalThis.fetch;
    this.defaultHeaders = opts.defaultHeaders ?? {};
    this.userAgent = opts.userAgent ?? DEFAULT_USER_AGENT;

    if (typeof this.fetchImpl !== 'function') {
      throw new EvesesError(
        'No fetch implementation found. Pass `fetch` in options or run on Node 18+.',
        0,
      );
    }

    this.activations = new Activations(this);
    this.wallet = new Wallet(this);
    this.catalog = new Catalog(this);
    this.webhooks = Webhooks;
  }

  /**
   * Perform a single authenticated request. Handles:
   *   - URL building + query string
   *   - JSON body serialisation
   *   - Bearer auth header
   *   - timeout via AbortController
   *   - one automatic retry on 429 (using Retry-After if present)
   *   - error mapping → EvesesError subclasses
   *
   * Returns the raw parsed JSON body. Module wrappers translate the shape.
   */
  public async request<T = unknown>(opts: RequestOptions): Promise<T> {
    const url = this.buildUrl(opts.path, opts.query);
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.apiKey}`,
      Accept: 'application/json',
      'User-Agent': this.userAgent,
      ...this.defaultHeaders,
      ...(opts.headers ?? {}),
    };

    let body: BodyInit | undefined;
    if (opts.body !== undefined && opts.body !== null) {
      headers['Content-Type'] = headers['Content-Type'] ?? 'application/json';
      body = JSON.stringify(opts.body);
    }

    return this.executeWithRetry<T>(url, { method: opts.method, headers, body });
  }

  private async executeWithRetry<T>(url: string, init: RequestInit, attempt = 0): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    let response: Response;
    try {
      response = await this.fetchImpl(url, { ...init, signal: controller.signal });
    } catch (err) {
      clearTimeout(timer);
      const msg = err instanceof Error ? err.message : 'Network error';
      throw new EvesesError(`Network error: ${msg}`, 0);
    }
    clearTimeout(timer);

    if (response.status === 429 && attempt === 0) {
      const retryAfter = parseRetryAfter(response.headers.get('Retry-After'));
      // 1 retry only, per spec.
      await sleep(retryAfter * 1000);
      return this.executeWithRetry<T>(url, init, attempt + 1);
    }

    return this.parseResponse<T>(response);
  }

  private async parseResponse<T>(response: Response): Promise<T> {
    const contentType = response.headers.get('Content-Type') ?? '';
    let parsed: unknown = undefined;
    if (contentType.includes('application/json')) {
      try {
        parsed = await response.json();
      } catch {
        parsed = undefined;
      }
    } else {
      try {
        parsed = await response.text();
      } catch {
        parsed = undefined;
      }
    }

    if (response.ok) {
      return parsed as T;
    }

    const message = extractMessage(parsed) ?? response.statusText ?? `HTTP ${response.status}`;
    switch (response.status) {
      case 401:
        throw new EvesesAuthError(message, parsed);
      case 403:
        throw new EvesesForbiddenError(message, parsed);
      case 404:
        throw new EvesesNotFoundError(message, parsed);
      case 422:
      case 400:
        throw new EvesesValidationError(message, response.status, parsed);
      case 429: {
        const retryAfter = parseRetryAfter(response.headers.get('Retry-After'));
        throw new EvesesRateLimitError(message, retryAfter, parsed);
      }
      default:
        if (response.status >= 500) {
          throw new EvesesServerError(message, response.status, parsed);
        }
        throw new EvesesError(message, response.status, { body: parsed });
    }
  }

  private buildUrl(path: string, query?: RequestOptions['query']): string {
    const normalised = path.startsWith('/') ? path : `/${path}`;
    const url = new URL(`${this.baseUrl}${normalised}`);
    if (query) {
      for (const [k, v] of Object.entries(query)) {
        if (v === undefined || v === null) continue;
        url.searchParams.set(k, String(v));
      }
    }
    return url.toString();
  }
}

function sleep(ms: number): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseRetryAfter(header: string | null): number {
  if (!header) return 1;
  const asInt = Number.parseInt(header, 10);
  if (!Number.isNaN(asInt) && asInt >= 0) return Math.min(asInt, 60);
  // HTTP-date form — fall back to 1s.
  return 1;
}

function extractMessage(body: unknown): string | undefined {
  if (!body || typeof body !== 'object') return undefined;
  const b = body as Record<string, unknown>;
  if (typeof b.message === 'string') return b.message;
  if (typeof b.error === 'string') return b.error;
  return undefined;
}
