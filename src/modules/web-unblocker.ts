import type { Eveses } from '../client';
import type {
  ProxySubscription,
  WebUnblockerAccess,
  WebUnblockerOrder,
  WebUnblockerOverview,
  WebUnblockerPackage,
  WebUnblockerPackagesResponse,
  WebUnblockerPurchaseRequest,
  WebUnblockerQuote,
} from '../types';

const BASE = '/api/account/web-unblocker';

/**
 * Web Unblocker namespace — an anti-bot scraping endpoint billed per successful
 * request. Separate product from proxies; the provider stays invisible.
 *
 * Hits `/api/account/web-unblocker/*`. Responses are flat JSON; the SDK unwraps
 * defensively and maps snake_case → camelCase.
 */
export class WebUnblocker {
  constructor(private readonly client: Eveses) {}

  /** The user's Web Unblocker: connection credentials + quota + order history. */
  async list(): Promise<WebUnblockerOverview> {
    const d = unwrap(await this.client.request<unknown>({ method: 'GET', path: BASE }));
    return {
      access: d.access ? mapAccess(d.access) : null,
      subscription: d.subscription ? mapSubscription(d.subscription) : null,
      orders: mapArray(d.orders, mapOrder),
    };
  }

  /** Request-bundle ladder (price, per-1k rate, discount). */
  async packages(): Promise<WebUnblockerPackagesResponse> {
    const d = unwrap(await this.client.request<unknown>({ method: 'GET', path: `${BASE}/packages` }));
    return {
      packages: mapArray(d.packages, mapPackage),
      currency: str(d.currency) ?? 'USD',
    };
  }

  /** Quote a purchase before buying. Custom request amounts are allowed. */
  async quote(opts: { requests: number; subscription?: boolean }): Promise<WebUnblockerQuote> {
    const d = unwrap(
      await this.client.request<unknown>({
        method: 'GET',
        path: `${BASE}/quote`,
        query: { requests: opts.requests, subscription: opts.subscription },
      }),
    );
    return mapQuote(d);
  }

  /**
   * Buy a request bundle (top up the user's pool). Pass `idempotencyKey` to
   * make the request safe to retry — sent as the `Idempotency-Key` header.
   */
  async purchase(req: WebUnblockerPurchaseRequest): Promise<WebUnblockerOrder> {
    const headers: Record<string, string> = {};
    if (req.idempotencyKey) headers['Idempotency-Key'] = req.idempotencyKey;

    const body: Record<string, unknown> = { requests: req.requests };
    if (req.subscription !== undefined) body.subscription = req.subscription;

    const d = unwrap(
      await this.client.request<unknown>({ method: 'POST', path: `${BASE}/purchase`, body, headers }),
    );
    return mapOrder(d);
  }

  /** Cancel the monthly subscription (stop auto-renewal; requests stay). */
  async cancelSubscription(): Promise<ProxySubscription> {
    return this.subscriptionAction('cancel');
  }

  /** Pause the subscription (skip renewals until resumed). */
  async pauseSubscription(): Promise<ProxySubscription> {
    return this.subscriptionAction('pause');
  }

  /** Resume the subscription (next renewal a month out). */
  async resumeSubscription(): Promise<ProxySubscription> {
    return this.subscriptionAction('resume');
  }

  private async subscriptionAction(action: 'cancel' | 'pause' | 'resume'): Promise<ProxySubscription> {
    const d = unwrap(
      await this.client.request<unknown>({ method: 'POST', path: `${BASE}/subscription/${action}` }),
    );
    return mapSubscription(d);
  }
}

// ── mappers ─────────────────────────────────────────────────────────────────

function mapAccess(value: unknown): WebUnblockerAccess {
  const r = obj(value);
  return {
    host: str(r.host) ?? '',
    port: num(r.port, 0),
    username: str(r.username) ?? '',
    password: str(r.password) ?? '',
    example: str(r.example) ?? '',
    curl: str(r.curl) ?? '',
    requestsPurchased: num(r.requests_purchased, 0),
    requestsUsed: num(r.requests_used, 0),
    requestsRemaining: num(r.requests_remaining, 0),
  };
}

function mapOrder(value: unknown): WebUnblockerOrder {
  const r = obj(value);
  return {
    uuid: str(r.uuid) ?? '',
    product: 'web_unblocker',
    requests: num(r.requests, 0),
    status: str(r.status) ?? '',
    priceCents: num(r.price_cents, 0),
    currency: str(r.currency) ?? 'USD',
    createdAt: str(r.created_at),
    raw: r,
  };
}

function mapPackage(value: unknown): WebUnblockerPackage {
  const r = obj(value);
  return {
    requests: num(r.requests, 0),
    per1kCents: num(r.per_1k_cents, 0),
    totalCents: num(r.total_cents, 0),
    basePer1kCents: num(r.base_per_1k_cents, 0),
    discountPct: num(r.discount_pct, 0),
    recommended: typeof r.recommended === 'boolean' ? r.recommended : undefined,
    currency: str(r.currency) ?? 'USD',
    raw: r,
  };
}

function mapQuote(value: unknown): WebUnblockerQuote {
  const r = obj(value);
  return {
    product: 'web_unblocker',
    requests: num(r.requests, 0),
    unit: str(r.unit) ?? 'request',
    priceCents: num(r.price_cents, 0),
    per1kCents: num(r.per_1k_cents, 0),
    currency: str(r.currency) ?? 'USD',
    raw: r,
  };
}

function mapSubscription(value: unknown): ProxySubscription {
  const r = obj(value);
  return {
    status: str(r.status) ?? '',
    gb: typeof r.gb === 'number' ? r.gb : undefined,
    requests: typeof r.requests === 'number' ? r.requests : undefined,
    discountPct: num(r.discount_pct, 0),
    nextRenewsAt: str(r.next_renews_at),
    renewFailures: num(r.renew_failures, 0),
    raw: r,
  };
}

// ── shared response helpers (flat-or-enveloped) ──────────────────────────────

function unwrap(value: unknown): Record<string, unknown> {
  const r = obj(value);
  if ('data' in r && r.data && typeof r.data === 'object' && !Array.isArray(r.data)) {
    return r.data as Record<string, unknown>;
  }
  return r;
}

function obj(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

function str(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function num(value: unknown, fallback: number): number {
  return typeof value === 'number' ? value : fallback;
}

function mapArray<T>(value: unknown, fn: (v: unknown) => T): T[] {
  return Array.isArray(value) ? value.map(fn) : [];
}
