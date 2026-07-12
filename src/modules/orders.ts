import type { Eveses } from '../client';
import type { OrderListOptions, OrderView, OrderViewPage } from '../types';

/**
 * Orders namespace — the global, cross-product order history. Normalises every
 * product's orders (numbers / proxy / webunblocker / emails) into a single
 * `OrderView` shape. Captcha is NOT here (see `client.captcha.usage()`).
 *
 *   - GET /api/v1/orders          list (cursor-paginated, newest first)
 *   - GET /api/v1/orders/{uuid}   a single normalised order (any product)
 */
export class Orders {
  constructor(private readonly client: Eveses) {}

  /**
   * List orders across all products. Cursor-paginated, newest first.
   * Filter by `service`, `status`, and created-at range.
   */
  async list(opts: OrderListOptions = {}): Promise<OrderViewPage> {
    const query: Record<string, string | number | undefined> = {
      service: opts.service,
      status: opts.status,
      cursor: opts.cursor,
      limit: opts.limit,
    };
    if (opts.createdGte !== undefined) query['created[gte]'] = opts.createdGte;
    if (opts.createdLte !== undefined) query['created[lte]'] = opts.createdLte;

    const res = await this.client.request<Record<string, unknown>>({
      method: 'GET',
      path: '/api/v1/orders',
      query,
    });
    const meta = (res.meta ?? {}) as Record<string, unknown>;
    return {
      data: Array.isArray(res.data) ? (res.data as Record<string, unknown>[]).map(mapOrderView) : [],
      nextCursor: typeof meta.next_cursor === 'string' ? meta.next_cursor : undefined,
      hasMore: meta.has_more === true,
    };
  }

  /** Get a single normalised order by UUID (any product). */
  async get(uuid: string): Promise<OrderView> {
    const res = await this.client.request<Record<string, unknown>>({
      method: 'GET',
      path: `/api/v1/orders/${encodeURIComponent(uuid)}`,
    });
    // Endpoint may wrap under `data` or return the view directly.
    const d = (res.data && typeof res.data === 'object' ? res.data : res) as Record<string, unknown>;
    return mapOrderView(d);
  }
}

function mapOrderView(r: Record<string, unknown>): OrderView {
  return {
    source: (r.source as OrderView['source']) ?? 'numbers',
    id: typeof r.id === 'string' ? r.id : String(r.id ?? ''),
    status: typeof r.status === 'string' ? r.status : '',
    amountCents: typeof r.amount_cents === 'number' ? r.amount_cents : undefined,
    currency: typeof r.currency === 'string' ? r.currency : undefined,
    title: typeof r.title === 'string' ? r.title : undefined,
    createdAt: typeof r.created_at === 'string' ? r.created_at : undefined,
    expiresAt: typeof r.expires_at === 'string' ? r.expires_at : undefined,
    detailUrl: typeof r.detail_url === 'string' ? r.detail_url : undefined,
    raw: r,
  };
}
