import type { Eveses } from '../client';
import type {
  ProxyList,
  ProxyOrder,
  ProxyPurchaseRequest,
  ProxyQuoteRequest,
  ProxyStaticSelection,
  ProxySubscription,
  ProxyType,
} from '../types';

/**
 * Proxy namespace — buy and manage residential (metered, per-GB) and static
 * (per-IP: ISP / datacenter / IPv6 / sneaker / mobile) proxies. Hits the
 * versioned endpoints `/api/v1/proxy/*`.
 *
 * The provider stays invisible: connection details are returned under the
 * white-label host.
 */
export class Proxy {
  constructor(private readonly client: Eveses) {}

  /** Consolidated price list (residential GB ladder + static per-IP catalogue). */
  async pricing(): Promise<Record<string, unknown>> {
    return this.client.request({ method: 'GET', path: '/api/v1/proxy/pricing' });
  }

  /** White-label connection endpoints: regional entry subdomains + HTTP/SOCKS5 ports. */
  async endpoints(): Promise<Record<string, unknown>> {
    return this.client.request({ method: 'GET', path: '/api/v1/proxy/endpoints' });
  }

  /**
   * Available targeting for a proxy type: residential geo (countries/regions/
   * sets) or a static family's catalogue locations. Defaults to residential.
   */
  async locations(type: ProxyType = 'residential'): Promise<Record<string, unknown>> {
    return this.client.request({
      method: 'GET',
      path: '/api/v1/proxy/locations',
      query: { type },
    });
  }

  /**
   * Per-country residential state / city / ISP geo drill-down for a picker.
   *
   * Returns the raw geo payload:
   * `{ type, country, geo: { country, states:[{code,name,cities?:[{code,name}]}],
   * cities:[{code,name,isps?:[{code,name}]}], tokens:{country,city,state,isp} } }`.
   */
  async locationsDetail(country: string, type: ProxyType = 'residential'): Promise<Record<string, unknown>> {
    return this.client.request({
      method: 'GET',
      path: '/api/v1/proxy/locations/detail',
      query: { type, country },
    });
  }

  /**
   * Estimate a purchase before buying (residential GB or a static selection).
   * Returns the raw quote payload.
   */
  async quote(req: ProxyQuoteRequest): Promise<Record<string, unknown>> {
    const type = req.type ?? 'residential';
    const query: Record<string, string | number | boolean | undefined> = { type };
    if (type === 'residential') {
      query.gb = req.gb;
      if (req.subscription) query.subscription = true;
    } else if (req.selection) {
      query.product_id = req.selection.productId;
      query.plan_id = req.selection.planId;
      query.location_id = req.selection.locationId;
      query.quantity = req.quantity ?? 1;
      for (const [questionId, answer] of Object.entries(req.extraRequirements ?? {})) {
        query[`extra_requirements[${questionId}]`] = String(answer);
      }
    }
    return this.client.request({ method: 'GET', path: '/api/v1/proxy/quote', query });
  }

  /** Buy proxies (residential GB top-up or static IPs). Returns the created order. */
  async purchase(req: ProxyPurchaseRequest): Promise<ProxyOrder> {
    const type = req.type ?? 'residential';
    const headers: Record<string, string> = {};
    if (req.idempotencyKey) headers['Idempotency-Key'] = req.idempotencyKey;

    const body: Record<string, unknown> = { type };
    if (type === 'residential') {
      body.gb = req.gb;
      if (req.subscription) body.subscription = true;
    } else if (req.selection) {
      body.product_id = req.selection.productId;
      body.plan_id = req.selection.planId;
      body.location_id = req.selection.locationId;
      if (req.selection.locationName !== undefined) body.location_name = req.selection.locationName;
      body.quantity = req.selection.quantity ?? 1;
      if (req.extraRequirements && Object.keys(req.extraRequirements).length > 0) {
        body.extra_requirements = req.extraRequirements;
      }
      if (req.extraRequirementLabels && Object.keys(req.extraRequirementLabels).length > 0) {
        body.extra_requirement_labels = req.extraRequirementLabels;
      }
    }

    const res = await this.client.request<Record<string, unknown>>({
      method: 'POST',
      path: '/api/v1/proxy/orders',
      body,
      headers,
    });
    return mapOrder(res);
  }

  /**
   * The user's proxies: residential sub-user connection, subscription, and
   * per-IP orders.
   */
  async list(): Promise<ProxyList> {
    const res = await this.client.request<Record<string, unknown>>({
      method: 'GET',
      path: '/api/v1/proxy/orders',
    });
    return {
      residential: (res.residential as Record<string, unknown> | null) ?? null,
      subscription: res.subscription ? mapSubscription(res.subscription as Record<string, unknown>) : null,
      orders: Array.isArray(res.orders) ? (res.orders as Record<string, unknown>[]).map(mapOrder) : [],
    };
  }

  /** Get a single proxy order by UUID. */
  async get(orderUuid: string): Promise<ProxyOrder> {
    const res = await this.client.request<Record<string, unknown>>({
      method: 'GET',
      path: `/api/v1/proxy/orders/${encodeURIComponent(orderUuid)}`,
    });
    return mapOrder(res);
  }

  /**
   * Extend a static (per-IP) order for another period (re-charges its price).
   * `days` defaults to 30.
   */
  async extend(orderUuid: string, days = 30): Promise<ProxyOrder> {
    const res = await this.client.request<Record<string, unknown>>({
      method: 'POST',
      path: `/api/v1/proxy/orders/${encodeURIComponent(orderUuid)}/extend`,
      body: { days },
    });
    return mapOrder(res);
  }

  /** Toggle auto-renew (auto_extend) on a per-IP order. */
  async autoRenew(orderUuid: string, enabled: boolean): Promise<ProxyOrder> {
    const res = await this.client.request<Record<string, unknown>>({
      method: 'POST',
      path: `/api/v1/proxy/orders/${encodeURIComponent(orderUuid)}/auto-renew`,
      body: { enabled },
    });
    return mapOrder(res);
  }

  /** Reset the residential sticky sessions (next request rotates IPs). */
  async resetSessions(): Promise<Record<string, unknown>> {
    return this.client.request({ method: 'POST', path: '/api/v1/proxy/sessions-reset' });
  }

  /** Activate the free trial for proxies (one-shot per account). */
  async trial(): Promise<Record<string, unknown>> {
    return this.client.request({ method: 'POST', path: '/api/v1/proxy/trial' });
  }

  /** Residential usage analytics — daily traffic/requests timeline + top hosts. */
  async usage(opts: { from?: string; to?: string } = {}): Promise<Record<string, unknown>> {
    return this.client.request({
      method: 'GET',
      path: '/api/v1/proxy/usage',
      query: { from: opts.from, to: opts.to },
    });
  }

  /** Cancel the residential subscription (stop auto-renewal; traffic stays). */
  async subscriptionCancel(): Promise<ProxySubscription> {
    return this.subscriptionAction('cancel');
  }

  /** Pause the residential subscription (skip renewals until resumed). */
  async subscriptionPause(): Promise<ProxySubscription> {
    return this.subscriptionAction('pause');
  }

  /** Resume the residential subscription (next renewal a month out). */
  async subscriptionResume(): Promise<ProxySubscription> {
    return this.subscriptionAction('resume');
  }

  private async subscriptionAction(action: 'cancel' | 'pause' | 'resume'): Promise<ProxySubscription> {
    const res = await this.client.request<Record<string, unknown>>({
      method: 'POST',
      path: `/api/v1/proxy/subscription/${action}`,
    });
    return mapSubscription(res);
  }
}

function mapOrder(r: Record<string, unknown>): ProxyOrder {
  return {
    uuid: typeof r.uuid === 'string' ? r.uuid : '',
    type: typeof r.type === 'string' ? r.type : '',
    kind: typeof r.kind === 'string' ? r.kind : undefined,
    gb: typeof r.gb === 'number' ? r.gb : undefined,
    quantity: typeof r.quantity === 'number' ? r.quantity : undefined,
    location: typeof r.location === 'string' ? r.location : undefined,
    status: typeof r.status === 'string' ? r.status : '',
    priceCents: typeof r.price_cents === 'number' ? r.price_cents : 0,
    currency: typeof r.currency === 'string' ? r.currency : 'USD',
    proxies: r.proxies,
    autoExtend: r.auto_extend === true,
    extendable: r.extendable === true,
    expiresAt: typeof r.expires_at === 'string' ? r.expires_at : undefined,
    createdAt: typeof r.created_at === 'string' ? r.created_at : undefined,
    raw: r,
  };
}

function mapSubscription(r: Record<string, unknown>): ProxySubscription {
  return {
    status: typeof r.status === 'string' ? r.status : '',
    gb: typeof r.gb === 'number' ? r.gb : 0,
    discountPct: typeof r.discount_pct === 'number' ? r.discount_pct : 0,
    nextRenewsAt: typeof r.next_renews_at === 'string' ? r.next_renews_at : undefined,
    renewFailures: typeof r.renew_failures === 'number' ? r.renew_failures : 0,
  };
}

// Re-export the input types under the module for ergonomic imports.
export type {
  ProxyList,
  ProxyOrder,
  ProxyPurchaseRequest,
  ProxyQuoteRequest,
  ProxyStaticSelection,
  ProxySubscription,
  ProxyType,
};
