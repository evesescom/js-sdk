import type { Eveses } from '../client';
import { EvesesError } from '../errors';
import type {
  CaptchaSolution,
  CaptchaSolveOptions,
  CaptchaStatus,
  CaptchaUsage,
  CaptchaUsageListOptions,
} from '../types';

const DEFAULT_TIMEOUT_SEC = 180;

/**
 * Captcha-solving namespace — resells 2captcha, billed pay-per-use from the
 * wallet (count-on-success). Hits the versioned endpoints `/api/v1/captcha/*`.
 */
export class Captcha {
  constructor(private readonly client: Eveses) {}

  /**
   * Blocking solve: submits the task, then polls the result endpoint honouring
   * the API's `retry_after` until the task is `ready`/`failed` or `timeoutSec`
   * elapses. Returns the solution, or throws EvesesError on failure/timeout.
   */
  async solve(
    type: string,
    params: Record<string, unknown> = {},
    opts: CaptchaSolveOptions = {},
  ): Promise<CaptchaSolution> {
    const headers: Record<string, string> = {};
    if (opts.idempotencyKey) headers['Idempotency-Key'] = opts.idempotencyKey;

    const body: Record<string, unknown> = { type, params };
    if (opts.callbackUrl !== undefined) body.callback_url = opts.callbackUrl;

    const started = await this.client.request<{
      task_id: number;
      status: CaptchaStatus;
      solution?: string | null;
      error?: string | null;
      price_micro_usd?: number;
      retry_after?: number;
    }>({ method: 'POST', path: '/api/v1/captcha/solve', body, headers });

    const taskId = started.task_id;
    const priceMicroUsd = started.price_micro_usd;
    const deadline = Date.now() + (opts.timeoutSec ?? DEFAULT_TIMEOUT_SEC) * 1000;
    let retryAfter = started.retry_after ?? 5;

    // Fast-path: some transports may return a resolved status immediately.
    if (started.status === 'ready' || started.status === 'failed') {
      return this.finalise(taskId, started.status, started.solution ?? undefined, started.error ?? undefined, priceMicroUsd);
    }

    for (;;) {
      await sleep(retryAfter * 1000);

      const res = await this.client.request<{
        status: CaptchaStatus;
        solution?: string | null;
        error?: string | null;
        retry_after?: number;
      }>({ method: 'GET', path: `/api/v1/captcha/result/${encodeURIComponent(String(taskId))}` });

      retryAfter = res.retry_after ?? retryAfter;

      if (res.status === 'ready' || res.status === 'failed') {
        return this.finalise(taskId, res.status, res.solution ?? undefined, res.error ?? undefined, priceMicroUsd);
      }

      if (Date.now() >= deadline) {
        throw new EvesesError(`Captcha task ${taskId} timed out before resolving`, 0, {
          code: 'captcha_timeout',
          body: { taskId },
        });
      }
    }
  }

  /** Per-solve retail rates by captcha type. */
  async rates(): Promise<Record<string, unknown>> {
    return this.client.request({ method: 'GET', path: '/api/v1/captcha/rates' });
  }

  /**
   * Captcha task history (there is no "orders" concept for captcha — usage is
   * the per-solve billing ledger). Cursor-paginated, newest first.
   */
  async usage(opts: CaptchaUsageListOptions = {}): Promise<CaptchaUsage> {
    const query: Record<string, string | number | undefined> = {
      status: opts.status,
      type: opts.type,
      cursor: opts.cursor,
      limit: opts.limit,
    };
    if (opts.createdGte !== undefined) query['created[gte]'] = opts.createdGte;
    if (opts.createdLte !== undefined) query['created[lte]'] = opts.createdLte;

    const res = await this.client.request<Record<string, unknown>>({
      method: 'GET',
      path: '/api/v1/captcha/usage',
      query,
    });
    const meta = (res.meta ?? {}) as Record<string, unknown>;
    return {
      data: Array.isArray(res.data) ? (res.data as Record<string, unknown>[]).map(mapUsageItem) : [],
      nextCursor: typeof meta.next_cursor === 'string' ? meta.next_cursor : undefined,
      hasMore: meta.has_more === true,
      unbilledMicroUsd: typeof meta.unbilled_micro_usd === 'number' ? meta.unbilled_micro_usd : undefined,
      unbilledCents: typeof meta.unbilled_cents === 'number' ? meta.unbilled_cents : undefined,
    };
  }

  private finalise(
    taskId: number,
    status: CaptchaStatus,
    solution: string | undefined,
    error: string | undefined,
    priceMicroUsd: number | undefined,
  ): CaptchaSolution {
    if (status === 'failed') {
      throw new EvesesError(`Captcha task ${taskId} failed: ${error ?? 'unknown error'}`, 0, {
        code: 'captcha_failed',
        body: { taskId, error },
      });
    }
    return { taskId, status, solution, error, priceMicroUsd };
  }
}

function mapUsageItem(r: Record<string, unknown>): CaptchaUsage['data'][number] {
  return {
    id: typeof r.id === 'number' ? r.id : 0,
    type: typeof r.type === 'string' ? r.type : '',
    status: (r.status as CaptchaStatus | 'ready') ?? 'queued',
    costMicroUsd: typeof r.cost_micro_usd === 'number' ? r.cost_micro_usd : undefined,
    costCents: typeof r.cost_cents === 'number' ? r.cost_cents : undefined,
    createdAt: typeof r.created_at === 'string' ? r.created_at : undefined,
    resolvedAt: typeof r.resolved_at === 'string' ? r.resolved_at : undefined,
    error: typeof r.error === 'string' ? r.error : undefined,
    raw: r,
  };
}

function sleep(ms: number): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, ms));
}
