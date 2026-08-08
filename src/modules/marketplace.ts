import type { Eveses } from '../client';

/**
 * Marketplace namespace — a provider-agnostic storefront that hides the upstream
 * supplier behind normalized attributes. Public catalogue lives under
 * `/api/public/marketplace/*`; authenticated purchase + order lifecycle under
 * `/api/v1/marketplace/*`.
 *
 * Attribute normalization:
 *   - country: ISO-3166-1 alpha-2 uppercase, or a region slug
 *     (`mix` / `cis` / `eu` / `asia` / `africa` / `latam`)
 *   - origin:  `autoreg` | `selfreg` | `real` | `retrieve`
 *   - format:  `tdata` | `session_json` | `session`
 *   - twofa:   boolean
 *   - group_by=attributes yields groups whose variants carry `prices_cents`.
 */
export class Marketplace {
  constructor(private readonly client: Eveses) {}

  /**
   * Browse the public catalogue. Only provided filters are sent. Set `groupBy`
   * to fold items into grouped variants (mapped to the `group_by` query param).
   *
   * @returns `{ items: [...] }`, or `{ groups: [...] }` when `groupBy` is set.
   */
  async catalog(opts: {
    category?: string;
    country?: string;
    origin?: string;
    format?: string;
    twofa?: boolean;
    groupBy?: 'country' | 'attributes';
  } = {}): Promise<Record<string, unknown>> {
    const query: Record<string, string | number | boolean | undefined> = {};
    if (opts.category !== undefined) query.category = opts.category;
    if (opts.country !== undefined) query.country = opts.country;
    if (opts.origin !== undefined) query.origin = opts.origin;
    if (opts.format !== undefined) query.format = opts.format;
    if (opts.twofa !== undefined) query.twofa = opts.twofa;
    if (opts.groupBy !== undefined) query.group_by = opts.groupBy;
    return this.client.request({
      method: 'GET',
      path: '/api/public/marketplace/catalog',
      query,
    });
  }

  /** List the marketplace categories. */
  async categories(): Promise<Record<string, unknown>> {
    return this.client.request({ method: 'GET', path: '/api/public/marketplace/categories' });
  }

  /** Available filter facets, optionally scoped to a single category. */
  async filters(category?: string): Promise<Record<string, unknown>> {
    const query: Record<string, string | number | boolean | undefined> = {};
    if (category !== undefined) query.category = category;
    return this.client.request({ method: 'GET', path: '/api/public/marketplace/filters', query });
  }

  /** Estimate the price of a SKU before buying. */
  async quote(req: { category: string; sku: string }): Promise<Record<string, unknown>> {
    return this.client.request({
      method: 'POST',
      path: '/api/v1/marketplace/quote',
      body: { category: req.category, sku: req.sku },
    });
  }

  /**
   * Buy a SKU. Accepts an optional `idempotencyKey` sent as the
   * `Idempotency-Key` HTTP header (same as `proxy.purchase`).
   */
  async buy(
    req: { category: string; sku: string; quantity?: number; inputs?: Record<string, unknown> },
    opts: { idempotencyKey?: string } = {},
  ): Promise<Record<string, unknown>> {
    const headers: Record<string, string> = {};
    if (opts.idempotencyKey) headers['Idempotency-Key'] = opts.idempotencyKey;

    const body: Record<string, unknown> = { category: req.category, sku: req.sku };
    if (req.quantity !== undefined) body.quantity = req.quantity;
    if (req.inputs !== undefined) body.inputs = req.inputs;

    return this.client.request({
      method: 'POST',
      path: '/api/v1/marketplace/buy',
      body,
      headers,
    });
  }

  /** The user's marketplace orders. */
  async orders(): Promise<Record<string, unknown>> {
    return this.client.request({ method: 'GET', path: '/api/v1/marketplace/orders' });
  }

  /** Get a single marketplace order by UUID. */
  async order(uuid: string): Promise<Record<string, unknown>> {
    return this.client.request({
      method: 'GET',
      path: `/api/v1/marketplace/orders/${encodeURIComponent(uuid)}`,
    });
  }

  /** Reveal the delivered secret(s) for a purchased order. */
  async reveal(uuid: string): Promise<Record<string, unknown>> {
    return this.client.request({
      method: 'POST',
      path: `/api/v1/marketplace/orders/${encodeURIComponent(uuid)}/reveal`,
    });
  }
}
