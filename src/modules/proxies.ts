import type { Eveses } from '../client';
import type {
  ProxyOrder,
  ProxyOverview,
  ProxyPurchaseRequest,
  ProxyQuote,
  ProxyQuoteRequest,
  ProxyResidentialPurchaseRequest,
  ProxyResidentialQuoteRequest,
  ProxyStaticPurchaseRequest,
  ProxyStaticQuoteRequest,
  ProxySubscription,
  ResidentialAccess,
  ResidentialPackagesResponse,
  ResidentialPackage,
  StaticCatalogResponse,
  StaticProduct,
} from '../types';

const BASE = '/api/account/proxies';

/**
 * Proxies namespace — residential (metered, per-GB) and static (per-IP) proxies.
 *
 * Hits `/api/account/proxies/*`. These endpoints return flat JSON (no
 * `{data:...}` envelope); the SDK unwraps defensively and maps snake_case →
 * camelCase, keeping the original payload on each object's `.raw`.
 */
export class Proxies {
  constructor(private readonly client: Eveses) {}

  /** The user's proxies: residential connection + subscription + order history. */
  async list(): Promise<ProxyOverview> {
    const d = unwrap(await this.client.request<unknown>({ method: 'GET', path: BASE }));
    return {
      residential: d.residential ? mapResidentialAccess(d.residential) : null,
      subscription: d.subscription ? mapSubscription(d.subscription) : null,
      orders: mapArray(d.orders, mapOrder),
    };
  }

  /** Residential GB package ladder (price, per-GB, discount). */
  async packages(): Promise<ResidentialPackagesResponse> {
    const d = unwrap(await this.client.request<unknown>({ method: 'GET', path: `${BASE}/packages` }));
    return {
      packages: mapArray(d.packages, mapResidentialPackage),
      currency: str(d.currency) ?? 'USD',
    };
  }

  /** Static (per-IP) catalogue — products / plans / locations with user prices. */
  async catalog(): Promise<StaticCatalogResponse> {
    const d = unwrap(await this.client.request<unknown>({ method: 'GET', path: `${BASE}/catalog` }));
    return {
      products: mapArray(d.products, mapStaticProduct),
      currency: str(d.currency) ?? 'USD',
    };
  }

  /**
   * Available targeting. For residential, returns `{ type, geo }`; for a static
   * family, returns `{ type, products }`. Returned leniently as a raw map.
   */
  async locations(opts: { type?: string } = {}): Promise<Record<string, unknown>> {
    return unwrap(
      await this.client.request<unknown>({
        method: 'GET',
        path: `${BASE}/locations`,
        query: { type: opts.type },
      }),
    );
  }

  /** Residential usage timeline for a date window (YYYY-MM-DD). */
  async usage(opts: { from?: string; to?: string } = {}): Promise<Record<string, unknown>> {
    return unwrap(
      await this.client.request<unknown>({
        method: 'GET',
        path: `${BASE}/usage`,
        query: { from: opts.from, to: opts.to },
      }),
    );
  }

  /**
   * Quote a purchase before buying. Pass a residential `{ gb }` request or a
   * static `{ type, productId, planId, locationId }` selection.
   */
  async quote(req: ProxyQuoteRequest): Promise<ProxyQuote> {
    const query = isStaticQuote(req)
      ? {
          type: req.type,
          product_id: req.productId,
          plan_id: req.planId,
          location_id: req.locationId,
          quantity: req.quantity,
        }
      : {
          type: req.type ?? 'residential',
          gb: (req as ProxyResidentialQuoteRequest).gb,
          subscription: (req as ProxyResidentialQuoteRequest).subscription,
        };

    const d = unwrap(await this.client.request<unknown>({ method: 'GET', path: `${BASE}/quote`, query }));
    return mapQuote(d);
  }

  /**
   * Buy proxies (residential GB top-up or static IPs). Pass `idempotencyKey`
   * to make the request safe to retry — it is sent as the `Idempotency-Key`
   * header (mirrors `activations.create`).
   */
  async purchase(req: ProxyPurchaseRequest): Promise<ProxyOrder> {
    const headers: Record<string, string> = {};
    if (req.idempotencyKey) headers['Idempotency-Key'] = req.idempotencyKey;

    const body: Record<string, unknown> = isStaticPurchase(req)
      ? {
          type: req.type,
          product_id: req.productId,
          plan_id: req.planId,
          location_id: req.locationId,
          location_name: req.locationName,
          quantity: req.quantity,
        }
      : {
          type: (req as ProxyResidentialPurchaseRequest).type ?? 'residential',
          gb: (req as ProxyResidentialPurchaseRequest).gb,
          subscription: (req as ProxyResidentialPurchaseRequest).subscription,
        };

    const d = unwrap(
      await this.client.request<unknown>({ method: 'POST', path: `${BASE}/purchase`, body, headers }),
    );
    return mapOrder(d);
  }

  /** Cancel the residential subscription (stop auto-renewal; traffic stays). */
  async cancelSubscription(): Promise<ProxySubscription> {
    return this.subscriptionAction('cancel');
  }

  /** Pause the residential subscription (skip renewals until resumed). */
  async pauseSubscription(): Promise<ProxySubscription> {
    return this.subscriptionAction('pause');
  }

  /** Resume the residential subscription (next renewal a month out). */
  async resumeSubscription(): Promise<ProxySubscription> {
    return this.subscriptionAction('resume');
  }

  private async subscriptionAction(action: 'cancel' | 'pause' | 'resume'): Promise<ProxySubscription> {
    const d = unwrap(
      await this.client.request<unknown>({ method: 'POST', path: `${BASE}/subscription/${action}` }),
    );
    return mapSubscription(d);
  }

  /** Extend a static (per-IP) order for another period (re-charges its price). */
  async extend(orderUuid: string, opts: { days?: number } = {}): Promise<ProxyOrder> {
    const body: Record<string, unknown> = {};
    if (opts.days !== undefined) body.days = opts.days;
    const d = unwrap(
      await this.client.request<unknown>({
        method: 'POST',
        path: `${BASE}/${encodeURIComponent(orderUuid)}/extend`,
        body: Object.keys(body).length ? body : undefined,
      }),
    );
    return mapOrder(d);
  }

  /** Toggle auto-renew (auto_extend) on a per-IP order. */
  async autoRenew(orderUuid: string, enabled: boolean): Promise<ProxyOrder> {
    const d = unwrap(
      await this.client.request<unknown>({
        method: 'POST',
        path: `${BASE}/${encodeURIComponent(orderUuid)}/auto-renew`,
        body: { enabled },
      }),
    );
    return mapOrder(d);
  }
}

function isStaticQuote(req: ProxyQuoteRequest): req is ProxyStaticQuoteRequest {
  return !!req.type && req.type !== 'residential';
}

function isStaticPurchase(req: ProxyPurchaseRequest): req is ProxyStaticPurchaseRequest {
  return !!req.type && req.type !== 'residential';
}

// ── mappers ─────────────────────────────────────────────────────────────────

function mapResidentialAccess(value: unknown): ResidentialAccess {
  const r = obj(value);
  const ports = obj(r.ports);
  return {
    host: str(r.host) ?? '',
    ports: { http: num(ports.http, 0), socks5: num(ports.socks5, 0) },
    username: str(r.username) ?? '',
    password: str(r.password) ?? '',
    example: str(r.example) ?? '',
    curl: str(r.curl) ?? '',
    trafficGbAvailable: num(r.traffic_gb_available, 0),
    trafficGbUsed: num(r.traffic_gb_used, 0),
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

function mapOrder(value: unknown): ProxyOrder {
  const r = obj(value);
  return {
    uuid: str(r.uuid) ?? '',
    type: str(r.type) ?? '',
    kind: str(r.kind) ?? '',
    gb: typeof r.gb === 'number' ? r.gb : null,
    quantity: num(r.quantity, 0),
    location: r.location === null ? null : str(r.location),
    status: str(r.status) ?? '',
    priceCents: num(r.price_cents, 0),
    currency: str(r.currency) ?? 'USD',
    proxies: Array.isArray(r.proxies) ? (r.proxies as unknown[]) : null,
    autoExtend: bool(r.auto_extend),
    extendable: bool(r.extendable),
    expiresAt: str(r.expires_at),
    createdAt: str(r.created_at),
    raw: r,
  };
}

function mapResidentialPackage(value: unknown): ResidentialPackage {
  const r = obj(value);
  return {
    gb: num(r.gb, 0),
    perGbCents: num(r.per_gb_cents, 0),
    recommended: typeof r.recommended === 'boolean' ? r.recommended : undefined,
    raw: r,
  };
}

function mapStaticProduct(value: unknown): StaticProduct {
  const r = obj(value);
  return {
    id: num(r.id, 0),
    type: str(r.type) ?? '',
    name: str(r.name),
    plans: mapArray(r.plans, (p) => {
      const pl = obj(p);
      return {
        id: num(pl.id, 0),
        name: str(pl.name),
        priceCents: typeof pl.price_cents === 'number' ? pl.price_cents : null,
        minQuantity: typeof pl.min_quantity === 'number' ? pl.min_quantity : undefined,
        maxQuantity: typeof pl.max_quantity === 'number' ? pl.max_quantity : undefined,
      };
    }),
    locations: mapArray(r.locations, (l) => {
      const loc = obj(l);
      return { id: num(loc.id, 0), name: str(loc.name), outOfStock: bool(loc.out_of_stock) };
    }),
  };
}

function mapQuote(value: unknown): ProxyQuote {
  const r = obj(value);
  return {
    type: str(r.type),
    gb: typeof r.gb === 'number' ? r.gb : undefined,
    quantity: typeof r.quantity === 'number' ? r.quantity : undefined,
    priceCents: typeof r.price_cents === 'number' ? r.price_cents : undefined,
    currency: str(r.currency),
    discountPct: typeof r.discount_pct === 'number' ? r.discount_pct : undefined,
    perGbCents: typeof r.per_gb_cents === 'number' ? r.per_gb_cents : undefined,
    raw: r,
  };
}

// ── shared response helpers (flat-or-enveloped) ──────────────────────────────

/**
 * Unwrap a `{ data: ... }` envelope if present, else return the payload flat.
 * The proxy/web-unblocker/email endpoints respond flat, but this keeps the
 * modules resilient to a future envelope change.
 */
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

function bool(value: unknown): boolean {
  return value === true;
}

function mapArray<T>(value: unknown, fn: (v: unknown) => T): T[] {
  return Array.isArray(value) ? value.map(fn) : [];
}
