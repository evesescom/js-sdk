import type { Eveses } from '../client';
import type {
  CatalogCountriesResponse,
  CatalogPricingDuration,
  CatalogPricingResponse,
  CatalogServicesResponse,
  CatalogServiceWithDurations,
  OrderMode,
} from '../types';

/**
 * Catalog namespace — read-only metadata used to drive the UX before
 * creating an order: which countries / services are available, and how
 * much each combination costs.
 *
 * The SDK targets the API-key-authenticated v1 routes:
 *   - GET /api/v1/numbers/countries?mode=
 *   - GET /api/v1/numbers/products?mode=     (the "services" list)
 *   - GET /api/v1/numbers/pricing?mode=&country=&product=&duration=
 *
 * Note on the wire shape: the v1 list endpoint is named `products` for legacy
 * reasons — it returns the same flat string list the rest of the SDK calls
 * "services". The pricing endpoint takes `product=` on the wire, which we
 * accept here under the friendlier `service` name.
 */
export class Catalog {
  constructor(private readonly client: Eveses) {}

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
  async services(
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
