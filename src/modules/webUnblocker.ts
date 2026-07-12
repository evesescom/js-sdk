import type { Eveses } from '../client';
import type {
  WebUnblockerAccess,
  WebUnblockerOrder,
  WebUnblockerPurchaseRequest,
  WebUnblockerQuoteRequest,
  WebUnblockerSubscription,
} from '../types';

/**
 * Web Unblocker namespace — buy and manage request-credit bundles (metered,
 * per-request) for the headless-browser unblocking proxy. Hits the versioned
 * endpoints `/api/v1/webunblocker/*`.
 */
export class WebUnblocker {
  constructor(private readonly client: Eveses) {}

  /** Available request-bundle packages (volume tiers + discount). */
  async pricing(): Promise<Record<string, unknown>> {
    return this.client.request({ method: 'GET', path: '/api/v1/webunblocker/pricing' });
  }

  /**
   * Estimate a purchase before buying.
   * Pass `subscription: true` to get the monthly-subscription price.
   */
  async quote(requests: number, subscription?: boolean): Promise<Record<string, unknown>> {
    const query: Record<string, string | number | boolean | undefined> = { requests };
    if (subscription) query.subscription = 1;
    return this.client.request({
      method: 'GET',
      path: '/api/v1/webunblocker/quote',
      query,
    });
  }

  /** Buy a request-credit bundle (or start a subscription). Returns the created order. */
  async purchase(req: WebUnblockerPurchaseRequest, idempotencyKey?: string): Promise<WebUnblockerOrder> {
    const headers: Record<string, string> = {};
    const key = idempotencyKey ?? req.idempotencyKey;
    if (key) headers['Idempotency-Key'] = key;

    const body: Record<string, unknown> = { requests: req.requests };
    if (req.subscription) body.subscription = true;

    const res = await this.client.request<Record<string, unknown>>({
      method: 'POST',
      path: '/api/v1/webunblocker/orders',
      body,
      headers,
    });
    return mapOrder(res);
  }

  /** Activate the free trial for Web Unblocker (one-shot per account). */
  async trial(): Promise<Record<string, unknown>> {
    return this.client.request({ method: 'POST', path: '/api/v1/webunblocker/trial' });
  }

  /** The user's web-unblocker orders, connection credentials, and subscription block. */
  async list(): Promise<WebUnblockerAccess> {
    const res = await this.client.request<Record<string, unknown>>({
      method: 'GET',
      path: '/api/v1/webunblocker/orders',
    });
    return {
      connection: (res.connection as Record<string, unknown> | null) ?? null,
      subscription: res.subscription
        ? mapSubscription(res.subscription as Record<string, unknown>)
        : null,
    };
  }

  /** Cancel the web-unblocker subscription (stop auto-renewal; credits stay). */
  async subscriptionCancel(): Promise<WebUnblockerSubscription> {
    return this.subscriptionAction('cancel');
  }

  /** Pause the web-unblocker subscription (skip renewals until resumed). */
  async subscriptionPause(): Promise<WebUnblockerSubscription> {
    return this.subscriptionAction('pause');
  }

  /** Resume the web-unblocker subscription (next renewal a month out). */
  async subscriptionResume(): Promise<WebUnblockerSubscription> {
    return this.subscriptionAction('resume');
  }

  private async subscriptionAction(action: 'cancel' | 'pause' | 'resume'): Promise<WebUnblockerSubscription> {
    const res = await this.client.request<Record<string, unknown>>({
      method: 'POST',
      path: `/api/v1/webunblocker/subscription/${action}`,
    });
    return mapSubscription(res);
  }
}

function mapOrder(r: Record<string, unknown>): WebUnblockerOrder {
  return {
    uuid: typeof r.uuid === 'string' ? r.uuid : '',
    requests: typeof r.requests === 'number' ? r.requests : 0,
    status: typeof r.status === 'string' ? r.status : '',
    priceCents: typeof r.price_cents === 'number' ? r.price_cents : 0,
    currency: typeof r.currency === 'string' ? r.currency : 'USD',
    expiresAt: typeof r.expires_at === 'string' ? r.expires_at : undefined,
    createdAt: typeof r.created_at === 'string' ? r.created_at : undefined,
    raw: r,
  };
}

function mapSubscription(r: Record<string, unknown>): WebUnblockerSubscription {
  return {
    status: typeof r.status === 'string' ? r.status : '',
    requests: typeof r.requests === 'number' ? r.requests : 0,
    nextRenewsAt: typeof r.next_renews_at === 'string' ? r.next_renews_at : undefined,
  };
}

// Re-export the input types under the module for ergonomic imports.
export type {
  WebUnblockerAccess,
  WebUnblockerOrder,
  WebUnblockerPurchaseRequest,
  WebUnblockerQuoteRequest,
  WebUnblockerSubscription,
};
