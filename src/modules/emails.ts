import type { Eveses } from '../client';
import type {
  EmailMessage,
  EmailMessageListOptions,
  EmailOrder,
  EmailPurchaseRequest,
  EmailQuoteRequest,
  Paginated,
} from '../types';

/**
 * Emails namespace — buy and manage temporary/private email inboxes. Hits the
 * versioned endpoints `/api/v1/emails/*`.
 */
export class Emails {
  constructor(private readonly client: Eveses) {}

  /**
   * Price list, including the available sending domains (under the `domains`
   * key), optionally filtered by site. Returns the raw pricing payload.
   */
  async pricing(site?: string): Promise<Record<string, unknown>> {
    return this.client.request({
      method: 'GET',
      path: '/api/v1/emails/pricing',
      query: { site },
    });
  }

  /** Estimate an inbox purchase before buying. */
  async quote(req: EmailQuoteRequest): Promise<Record<string, unknown>> {
    return this.client.request({
      method: 'GET',
      path: '/api/v1/emails/quote',
      query: { domain: req.domain, site: req.site, provider: req.provider },
    });
  }

  /** Buy an email inbox. Returns the created order. */
  async purchase(req: EmailPurchaseRequest, idempotencyKey?: string): Promise<EmailOrder> {
    const headers: Record<string, string> = {};
    const key = idempotencyKey ?? req.idempotencyKey;
    if (key) headers['Idempotency-Key'] = key;

    const body: Record<string, unknown> = { domain: req.domain };
    if (req.site !== undefined) body.site = req.site;
    if (req.provider !== undefined) body.provider = req.provider;

    const res = await this.client.request<Record<string, unknown>>({
      method: 'POST',
      path: '/api/v1/emails/orders',
      body,
      headers,
    });
    return mapOrder(res);
  }

  /**
   * List the user's email inboxes.
   * Pass `includeReleased: true` to include already-released inboxes.
   */
  async list(includeReleased?: boolean): Promise<EmailOrder[]> {
    const query: Record<string, string | number | boolean | undefined> = {};
    if (includeReleased) query.include_released = 1;

    const res = await this.client.request<unknown[]>({
      method: 'GET',
      path: '/api/v1/emails/orders',
      query,
    });
    return Array.isArray(res) ? res.map((r) => mapOrder(r as Record<string, unknown>)) : [];
  }

  /** Get a single inbox by email address. */
  async get(email: string): Promise<EmailOrder> {
    const res = await this.client.request<Record<string, unknown>>({
      method: 'GET',
      path: `/api/v1/emails/${encodeURIComponent(email)}`,
    });
    return mapOrder(res);
  }

  /** Paginated list of messages received in an inbox. */
  async messages(email: string, opts: EmailMessageListOptions = {}): Promise<Paginated<EmailMessage>> {
    const res = await this.client.request<Record<string, unknown>>({
      method: 'GET',
      path: `/api/v1/emails/${encodeURIComponent(email)}/messages`,
      query: { page: opts.page, per_page: opts.perPage },
    });
    const items = Array.isArray(res.data)
      ? (res.data as Record<string, unknown>[]).map(mapMessage)
      : [];
    return {
      items,
      currentPage: typeof res.current_page === 'number' ? res.current_page : 1,
      perPage: typeof res.per_page === 'number' ? res.per_page : items.length,
      total: typeof res.total === 'number' ? res.total : items.length,
    };
  }

  /** Mark a specific message in an inbox as read. */
  async markRead(email: string, messageId: number): Promise<Record<string, unknown>> {
    return this.client.request({
      method: 'POST',
      path: `/api/v1/emails/${encodeURIComponent(email)}/messages/${encodeURIComponent(String(messageId))}/read`,
    });
  }

  /** Release (delete) an inbox early. */
  async release(email: string): Promise<Record<string, unknown>> {
    return this.client.request({
      method: 'DELETE',
      path: `/api/v1/emails/${encodeURIComponent(email)}`,
    });
  }
}

function mapOrder(r: Record<string, unknown>): EmailOrder {
  return {
    uuid: typeof r.uuid === 'string' ? r.uuid : '',
    domain: typeof r.domain === 'string' ? r.domain : '',
    address: typeof r.address === 'string' ? r.address : '',
    provider: typeof r.provider === 'string' ? r.provider : undefined,
    site: typeof r.site === 'string' ? r.site : undefined,
    status: typeof r.status === 'string' ? r.status : '',
    priceCents: typeof r.price_cents === 'number' ? r.price_cents : 0,
    currency: typeof r.currency === 'string' ? r.currency : 'USD',
    expiresAt: typeof r.expires_at === 'string' ? r.expires_at : undefined,
    createdAt: typeof r.created_at === 'string' ? r.created_at : undefined,
    released: r.released === true,
    raw: r,
  };
}

function mapMessage(r: Record<string, unknown>): EmailMessage {
  return {
    id: typeof r.id === 'number' ? r.id : 0,
    subject: typeof r.subject === 'string' ? r.subject : undefined,
    from: typeof r.from === 'string' ? r.from : undefined,
    body: typeof r.body === 'string' ? r.body : undefined,
    bodyHtml: typeof r.body_html === 'string' ? r.body_html : undefined,
    read: r.read === true,
    receivedAt: typeof r.received_at === 'string' ? r.received_at : undefined,
    raw: r,
  };
}

// Re-export the input types under the module for ergonomic imports.
export type {
  EmailMessage,
  EmailMessageListOptions,
  EmailOrder,
  EmailPurchaseRequest,
  EmailQuoteRequest,
};
