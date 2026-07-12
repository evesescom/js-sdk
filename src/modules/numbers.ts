import type { Eveses } from '../client';
import type {
  ActivationCreateRequest,
  CatalogCountriesResponse,
  CatalogPricingDuration,
  CatalogPricingResponse,
  CatalogServicesResponse,
  CatalogServiceWithDurations,
  Order,
  OrderMode,
  OrderSms,
  OrderSmsBundle,
} from '../types';

/**
 * Numbers namespace — the unified SMS surface for the v1 API. Merges what were
 * previously the separate `activations` (order lifecycle) and `catalog`
 * (countries / products / pricing) modules into one product family under
 * `/api/v1/numbers/*`.
 *
 * Order lifecycle:
 *   - POST   /api/v1/numbers/orders                    create
 *   - GET    /api/v1/numbers/orders/{uuid}             get
 *   - GET    /api/v1/numbers/orders/{uuid}/sms         sms
 *   - POST   /api/v1/numbers/orders/{uuid}/{cancel,finish,retry,repeat,auto-renew}
 *   - GET    /api/v1/numbers/orders                    list
 *   - POST   /api/v1/numbers/orders/batch              batch
 *
 * Catalog (read-only metadata):
 *   - GET    /api/v1/numbers/pricing
 *   - GET    /api/v1/numbers/countries
 *   - GET    /api/v1/numbers/products     (the "services" list)
 *   - GET    /api/v1/numbers/carriers
 *   - GET    /api/v1/numbers/states
 */
export class Numbers {
  constructor(private readonly client: Eveses) {}

  // -------------------------------------------------------------------------
  // Order lifecycle
  // -------------------------------------------------------------------------

  /**
   * Create an order (activation by default; pass mode="rent" for rentals).
   *
   * Accepts an `idempotencyKey` which is sent both as the `Idempotency-Key`
   * HTTP header (preferred by the gateway) and in the JSON body (accepted by
   * the controller for non-HTTP transports).
   */
  async create(req: ActivationCreateRequest): Promise<Order> {
    const headers: Record<string, string> = {};
    if (req.idempotencyKey) {
      headers['Idempotency-Key'] = req.idempotencyKey;
    }

    const body: Record<string, unknown> = {
      mode: req.mode ?? 'activation',
      country: req.country,
      service: req.service,
    };
    if (req.durationMinutes !== undefined) body.duration_minutes = req.durationMinutes;
    if (req.idempotencyKey !== undefined) body.idempotency_key = req.idempotencyKey;
    if (req.maxPriceCents !== undefined) body.max_price_cents = req.maxPriceCents;

    const res = await this.client.request<{ data: Record<string, unknown> }>({
      method: 'POST',
      path: '/api/v1/numbers/orders',
      body,
      headers,
    });
    return mapOrder(res.data);
  }

  /**
   * Create several orders in one call. Accepts an array of create requests and
   * returns the created orders in the same order.
   */
  async batch(reqs: ActivationCreateRequest[]): Promise<Order[]> {
    const orders = reqs.map((req) => {
      const o: Record<string, unknown> = {
        mode: req.mode ?? 'activation',
        country: req.country,
        service: req.service,
      };
      if (req.durationMinutes !== undefined) o.duration_minutes = req.durationMinutes;
      if (req.maxPriceCents !== undefined) o.max_price_cents = req.maxPriceCents;
      return o;
    });

    const res = await this.client.request<{ data: unknown }>({
      method: 'POST',
      path: '/api/v1/numbers/orders/batch',
      body: { orders },
    });
    return Array.isArray(res.data)
      ? (res.data as Record<string, unknown>[]).map(mapOrder)
      : [];
  }

  /** Get a single order. */
  async get(orderId: string): Promise<Order> {
    const res = await this.client.request<{ data: Record<string, unknown> }>({
      method: 'GET',
      path: `/api/v1/numbers/orders/${encodeURIComponent(orderId)}`,
    });
    return mapOrder(res.data);
  }

  /**
   * Fetch SMS for an order — combines stored (delivered via webhook) with
   * fresh (pulled from the upstream provider on demand).
   */
  async sms(orderId: string): Promise<OrderSmsBundle> {
    const res = await this.client.request<{ data: Record<string, unknown> }>({
      method: 'GET',
      path: `/api/v1/numbers/orders/${encodeURIComponent(orderId)}/sms`,
    });
    const data = (res.data ?? {}) as Record<string, unknown>;
    return {
      orderId: String(data.order_id ?? orderId),
      stored: mapSmsList(data.stored),
      fresh: mapSmsList(data.fresh),
    };
  }

  /** Cancel an order (releases number, refunds where the upstream supports it). */
  async cancel(orderId: string): Promise<Order> {
    return this.action(orderId, 'cancel');
  }

  /** Mark order as finished (after consuming the SMS). */
  async finish(orderId: string): Promise<Order> {
    return this.action(orderId, 'finish');
  }

  /** Retry — request another SMS for the same order (re-poll upstream). */
  async retry(orderId: string): Promise<Order> {
    return this.action(orderId, 'retry');
  }

  /** Repeat — buy the same number/service again as a fresh order. */
  async repeat(orderId: string): Promise<Order> {
    return this.action(orderId, 'repeat');
  }

  /** Toggle auto-renew on a rental order. */
  async autoRenew(orderId: string, enabled: boolean): Promise<Order> {
    const res = await this.client.request<{ data: Record<string, unknown> }>({
      method: 'POST',
      path: `/api/v1/numbers/orders/${encodeURIComponent(orderId)}/auto-renew`,
      body: { enabled },
    });
    return mapOrder(res.data);
  }

  private async action(orderId: string, verb: string): Promise<Order> {
    const res = await this.client.request<{ data: Record<string, unknown> }>({
      method: 'POST',
      path: `/api/v1/numbers/orders/${encodeURIComponent(orderId)}/${verb}`,
    });
    return mapOrder(res.data);
  }

  // -------------------------------------------------------------------------
  // Catalog (countries / products / pricing / carriers / states)
  // -------------------------------------------------------------------------

  /**
   * List all countries that have stock for the given mode.
   *
   * @returns Object with the requested mode echoed back and a flat
   *          `countries` array of ISO-3166-1 alpha-2 codes.
   */
  async countries(opts: { mode?: OrderMode } = {}): Promise<CatalogCountriesResponse> {
    const mode = opts.mode ?? 'activation';
    const res = await this.client.request<{ data: Record<string, unknown> }>({
      method: 'GET',
      path: '/api/v1/numbers/countries',
      query: { mode },
    });
    const d = res.data ?? {};
    return {
      mode: (typeof d.mode === 'string' ? d.mode : mode) as OrderMode,
      countries: Array.isArray(d.countries) ? (d.countries as unknown[]).map(String) : [],
    };
  }

  /**
   * List all services / products available globally for the given mode.
   *
   * The `country` and `currency` parameters are accepted for symmetry with
   * the wider catalog API but are currently informational on the v1
   * endpoint, which returns the unified product list.
   */
  async products(
    opts: { mode?: OrderMode; country?: string; currency?: string } = {},
  ): Promise<CatalogServicesResponse> {
    const mode = opts.mode ?? 'activation';
    const res = await this.client.request<{ data: Record<string, unknown> }>({
      method: 'GET',
      path: '/api/v1/numbers/products',
      query: { mode },
    });
    const d = res.data ?? {};
    return {
      mode: (typeof d.mode === 'string' ? d.mode : mode) as OrderMode,
      country: opts.country?.toLowerCase(),
      currency: opts.currency?.toUpperCase(),
      services: Array.isArray(d.products) ? (d.products as unknown[]).map(String) : [],
    };
  }

  /** List mobile carriers available for a country (rent targeting). */
  async carriers(opts: { country: string; mode?: OrderMode } = { country: '' }): Promise<Record<string, unknown>> {
    return this.client.request({
      method: 'GET',
      path: '/api/v1/numbers/carriers',
      query: { country: opts.country?.toLowerCase(), mode: opts.mode },
    });
  }

  /** List regional states/sub-divisions available for a country (US-style targeting). */
  async states(opts: { country: string; mode?: OrderMode } = { country: '' }): Promise<Record<string, unknown>> {
    return this.client.request({
      method: 'GET',
      path: '/api/v1/numbers/states',
      query: { country: opts.country?.toLowerCase(), mode: opts.mode },
    });
  }

  /**
   * Get pricing for a country/service pair. The v1 endpoint returns a list
   * of "services" (typically a single one when filtered by product), each
   * carrying one or more `durations` (1 entry for activations, multiple for
   * rentals).
   */
  async pricing(opts: {
    mode?: OrderMode;
    country: string;
    service: string;
    currency?: string;
    durationMinutes?: number;
  }): Promise<CatalogPricingResponse> {
    if (!opts || !opts.country) {
      throw new Error('country is required');
    }
    if (!opts.service) {
      throw new Error('service is required');
    }

    const mode = opts.mode ?? 'activation';
    const res = await this.client.request<{ data: Record<string, unknown> }>({
      method: 'GET',
      path: '/api/v1/numbers/pricing',
      query: {
        mode,
        country: opts.country.toLowerCase(),
        product: opts.service,
        duration: opts.durationMinutes,
        currency: opts.currency?.toUpperCase(),
      },
    });

    const d = res.data ?? {};
    const services: CatalogServiceWithDurations[] = Array.isArray(d.services)
      ? (d.services as unknown[]).map(mapServiceEntry)
      : [];

    return {
      mode: (typeof d.mode === 'string' ? d.mode : mode) as OrderMode,
      country: typeof d.country === 'string' ? d.country : opts.country.toLowerCase(),
      currency: typeof d.currency === 'string' ? d.currency : opts.currency?.toUpperCase(),
      service: opts.service,
      services,
    };
  }
}

function mapOrder(data: Record<string, unknown> | undefined): Order {
  const d = data ?? {};
  return {
    orderId: String(d.order_id ?? d.uuid ?? ''),
    status: (d.status as Order['status']) ?? 'pending',
    phone: typeof d.phone === 'string' ? d.phone : undefined,
    country: typeof d.country === 'string' ? d.country : undefined,
    service: typeof d.service === 'string' ? d.service : undefined,
    mode: (d.mode as Order['mode']) ?? undefined,
    priceCents: typeof d.price_cents === 'number' ? d.price_cents : undefined,
    expiresAt: typeof d.expires_at === 'string' ? d.expires_at : undefined,
    createdAt: typeof d.created_at === 'string' ? d.created_at : undefined,
    raw: d,
  };
}

function mapSmsList(value: unknown): OrderSms[] {
  if (!Array.isArray(value)) return [];
  return value.map((m) => {
    const r = (m ?? {}) as Record<string, unknown>;
    return {
      id: typeof r.id === 'number' ? r.id : 0,
      text: typeof r.text === 'string' ? r.text : '',
      sender: typeof r.sender === 'string' ? r.sender : undefined,
      receivedAt: typeof r.received_at === 'string' ? r.received_at : undefined,
    };
  });
}

function mapServiceEntry(value: unknown): CatalogServiceWithDurations {
  const r = (value ?? {}) as Record<string, unknown>;
  return {
    name: typeof r.name === 'string' ? r.name : '',
    durations: Array.isArray(r.durations)
      ? (r.durations as unknown[]).map(mapDuration)
      : [],
  };
}

function mapDuration(value: unknown): CatalogPricingDuration {
  const r = (value ?? {}) as Record<string, unknown>;
  return {
    durationMinutes: typeof r.duration_minutes === 'number' ? r.duration_minutes : 0,
    priceCents: typeof r.price_cents === 'number' ? r.price_cents : undefined,
    price: typeof r.price === 'number' ? r.price : undefined,
    currency: typeof r.currency === 'string' ? r.currency : undefined,
    available:
      typeof r.available === 'boolean'
        ? r.available
        : typeof r.in_stock === 'boolean'
          ? r.in_stock
          : undefined,
    raw: r,
  };
}
