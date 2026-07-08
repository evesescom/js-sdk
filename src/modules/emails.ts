import type { Eveses } from '../client';
import type {
  EmailDomain,
  EmailDomainsResponse,
  EmailMarkReadResult,
  EmailMessage,
  EmailMessagesPage,
  EmailOrder,
  EmailPurchaseRequest,
  EmailQuote,
  EmailQuoteRequest,
} from '../types';

const BASE = '/api/account/emails';

/**
 * Emails namespace — rent an inbox address (our catch-all domains or a
 * reseller) and read its mail. The provider stays invisible.
 *
 * Hits `/api/account/emails/*`. Responses are flat JSON; the SDK unwraps
 * defensively and maps snake_case → camelCase.
 */
export class Emails {
  constructor(private readonly client: Eveses) {}

  /**
   * The user's rented addresses (list rows carry no messages). Pass
   * `includeReleased` to also return released/cancelled addresses (sent as
   * `?include_released=1`; omitted otherwise).
   */
  async list(includeReleased = false): Promise<EmailOrder[]> {
    const d = unwrap(
      await this.client.request<unknown>({
        method: 'GET',
        path: BASE,
        query: includeReleased ? { include_released: 1 } : undefined,
      }),
    );
    return mapArray(d.emails, mapOrder);
  }

  /**
   * Rentable domains (our price). Pass `site` for reseller providers; our
   * own catch-all domains ignore it.
   */
  async domains(opts: { site?: string } = {}): Promise<EmailDomainsResponse> {
    const d = unwrap(
      await this.client.request<unknown>({
        method: 'GET',
        path: `${BASE}/domains`,
        query: { site: opts.site },
      }),
    );
    return {
      domains: mapArray(d.domains, mapDomain),
      currency: str(d.currency) ?? 'USD',
    };
  }

  /** Price a concrete pick before renting. */
  async quote(req: EmailQuoteRequest): Promise<EmailQuote> {
    const d = unwrap(
      await this.client.request<unknown>({
        method: 'GET',
        path: `${BASE}/quote`,
        query: { domain: req.domain, site: req.site, provider: req.provider },
      }),
    );
    return mapQuote(d);
  }

  /**
   * Rent an address. Pass `idempotencyKey` to make the request safe to retry —
   * sent as the `Idempotency-Key` header.
   */
  async purchase(req: EmailPurchaseRequest): Promise<EmailOrder> {
    const headers: Record<string, string> = {};
    if (req.idempotencyKey) headers['Idempotency-Key'] = req.idempotencyKey;

    const body: Record<string, unknown> = { domain: req.domain };
    if (req.site !== undefined) body.site = req.site;
    if (req.provider !== undefined) body.provider = req.provider;

    const d = unwrap(
      await this.client.request<unknown>({ method: 'POST', path: `${BASE}/purchase`, body, headers }),
    );
    return mapOrder(d);
  }

  /**
   * Fetch one address + its received messages. This call also live-syncs
   * reseller inboxes upstream — it is the inbox-refresh mechanism, so poll it.
   */
  async get(uuid: string): Promise<EmailOrder> {
    const d = unwrap(
      await this.client.request<unknown>({
        method: 'GET',
        path: `${BASE}/${encodeURIComponent(uuid)}`,
      }),
    );
    return mapOrder(d);
  }

  /**
   * Paginated message feed for one address. `perPage` maps to the `per_page`
   * query param. Like `get`, this also live-syncs reseller inboxes upstream.
   */
  async messages(uuid: string, page = 1, perPage = 20): Promise<EmailMessagesPage> {
    const d = unwrap(
      await this.client.request<unknown>({
        method: 'GET',
        path: `${BASE}/${encodeURIComponent(uuid)}/messages`,
        query: { page, per_page: perPage },
      }),
    );
    return mapMessagesPage(d);
  }

  /** Mark a single message read. */
  async markRead(uuid: string, messageId: string): Promise<EmailMarkReadResult> {
    const d = unwrap(
      await this.client.request<unknown>({
        method: 'POST',
        path: `${BASE}/${encodeURIComponent(uuid)}/messages/${encodeURIComponent(messageId)}/read`,
      }),
    );
    return mapMarkRead(d);
  }

  /** Release an address (soft cancel — stops receiving; no refund). */
  async delete(uuid: string): Promise<EmailOrder> {
    const d = unwrap(
      await this.client.request<unknown>({
        method: 'DELETE',
        path: `${BASE}/${encodeURIComponent(uuid)}`,
      }),
    );
    return mapOrder(d);
  }
}

// ── mappers ─────────────────────────────────────────────────────────────────

function mapOrder(value: unknown): EmailOrder {
  const r = obj(value);
  return {
    uuid: str(r.uuid) ?? '',
    address: str(r.address) ?? '',
    domain: str(r.domain) ?? '',
    site: r.site === null ? null : str(r.site),
    status: str(r.status) ?? '',
    priceCents: num(r.price_cents, 0),
    currency: str(r.currency) ?? 'USD',
    messageCount: num(r.message_count, 0),
    expiresAt: str(r.expires_at),
    createdAt: str(r.created_at),
    messages: mapArray(r.messages, mapMessage),
    raw: r,
  };
}

function mapMessage(value: unknown): EmailMessage {
  const r = obj(value);
  return {
    id: str(r.id),
    from: str(r.from),
    subject: str(r.subject),
    body: str(r.body),
    receivedAt: str(r.received_at),
    readAt: r.read_at === null ? null : str(r.read_at),
    isRead: typeof r.is_read === 'boolean' ? r.is_read : undefined,
    raw: r,
  };
}

function mapMessagesPage(value: unknown): EmailMessagesPage {
  const r = obj(value);
  return {
    messages: mapArray(r.messages, mapMessage),
    page: num(r.page, 1),
    perPage: num(r.per_page, 0),
    total: num(r.total, 0),
    hasMore: r.has_more === true,
    raw: r,
  };
}

function mapMarkRead(value: unknown): EmailMarkReadResult {
  const r = obj(value);
  return {
    id: str(r.id) ?? '',
    read: r.read === true,
    raw: r,
  };
}

function mapDomain(value: unknown): EmailDomain {
  const r = obj(value);
  return {
    provider: str(r.provider),
    domain: str(r.domain) ?? '',
    priceCents: num(r.price_cents, 0),
    available: r.available === true,
    raw: r,
  };
}

function mapQuote(value: unknown): EmailQuote {
  const r = obj(value);
  return {
    domain: str(r.domain) ?? '',
    provider: str(r.provider),
    priceCents: num(r.price_cents, 0),
    currency: str(r.currency) ?? 'USD',
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
