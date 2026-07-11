import type { Eveses } from '../client';
import { EvesesError } from '../errors';
import type { CaptchaSolution, CaptchaSolveOptions, CaptchaStatus } from '../types';

const DEFAULT_TIMEOUT_SEC = 180;

/**
 * Captcha-solving namespace — resells 2captcha, billed pay-per-use from the
 * wallet (count-on-success). Hits the account-scoped endpoints
 * `/api/account/captcha/*`.
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
    }>({ method: 'POST', path: '/api/account/captcha/solve', body, headers });

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
      }>({ method: 'GET', path: `/api/account/captcha/result/${encodeURIComponent(String(taskId))}` });

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

function sleep(ms: number): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, ms));
}
