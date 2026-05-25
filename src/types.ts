/**
 * Public types for the Eveses SDK.
 *
 * The Eveses API uses snake_case JSON. This SDK exposes camelCase to JS/TS
 * consumers and translates at the wire boundary.
 */

export type OrderMode = 'activation' | 'rent';

export type OrderStatus =
  | 'pending'
  | 'waiting_sms'
  | 'sms_received'
  | 'active'
  | 'finished'
  | 'cancelled'
  | 'expired';

/**
 * Input to `client.activations.create`.
 */
export interface ActivationCreateRequest {
  /** ISO 3166-1 alpha-2 country code, lowercased (e.g. "ua"). */
  country: string;
  /** Service / target code (e.g. "telegram", "wa"). */
  service: string;
  /** "activation" (default) or "rent". */
  mode?: OrderMode;
  /** Rent mode only — rental duration in minutes (>= 1). */
  durationMinutes?: number;
  /** Optional idempotency key (max 128 chars). Sent as Idempotency-Key header. */
  idempotencyKey?: string;
  /** Optional max acceptable price in cents (1..1,000,000). */
  maxPriceCents?: number;
}

/**
 * The on-the-wire shape returned by /api/account/orders for a single order.
 * Eveses paginated/show endpoints wrap this under `{ data: ... }`.
 */
export interface Order {
  orderId: string;
  status: OrderStatus;
  phone?: string;
  country?: string;
  service?: string;
  mode?: OrderMode;
  priceCents?: number;
  expiresAt?: string;
  createdAt?: string;
  /** Original snake_case server payload, for forward-compat. */
  raw?: Record<string, unknown>;
}

/** SMS message attached to an order. */
export interface OrderSms {
  id: number;
  text: string;
  sender?: string;
  receivedAt?: string;
}

/** Response of `client.activations.sms`. */
export interface OrderSmsBundle {
  orderId: string;
  stored: OrderSms[];
  fresh: OrderSms[];
}

/** Response of `client.wallet.balance`. */
export interface WalletBalance {
  balance: number;
  heldBalance: number;
  availableBalance: number;
  currency: string;
}

/** Response of `client.catalog.countries`. */
export interface CatalogCountriesResponse {
  mode: OrderMode;
  /** ISO 3166-1 alpha-2 codes (lowercased), e.g. ["ua", "pl", "de"]. */
  countries: string[];
}

/** Response of `client.catalog.services`. */
export interface CatalogServicesResponse {
  mode: OrderMode;
  /** Echoed back when supplied — informational on the v1 endpoint. */
  country?: string;
  currency?: string;
  /** Service / product codes, e.g. ["telegram", "wa", "vk"]. */
  services: string[];
}

/** A single price/duration combination returned inside `CatalogPricingResponse.services[].durations`. */
export interface CatalogPricingDuration {
  durationMinutes: number;
  /** Price in minor units (cents) when available. */
  priceCents?: number;
  /** Price in major units (rendered for the chosen currency). */
  price?: number;
  currency?: string;
  /** Whether stock is currently available for this combination. */
  available?: boolean;
  /** Raw snake_case server payload, for forward-compat. */
  raw?: Record<string, unknown>;
}

/** A single service entry inside `CatalogPricingResponse`. */
export interface CatalogServiceWithDurations {
  name: string;
  durations: CatalogPricingDuration[];
}

/** Response of `client.catalog.pricing`. */
export interface CatalogPricingResponse {
  mode: OrderMode;
  country: string;
  currency?: string;
  /** The service code that was requested. */
  service?: string;
  /** Typically a single entry when filtered by service; the API returns a list. */
  services: CatalogServiceWithDurations[];
}

/** SDK construction options. */
export interface EvesesOptions {
  /** Sanctum API token (kind=api_key). Required. */
  apiKey: string;
  /** Base URL. Defaults to https://api.eveses.io. */
  baseUrl?: string;
  /** Request timeout in ms (default 30_000). */
  timeoutMs?: number;
  /** Custom fetch implementation (for tests / non-Node runtimes). */
  fetch?: typeof fetch;
  /** Extra headers merged into every request. */
  defaultHeaders?: Record<string, string>;
  /** User-Agent override. */
  userAgent?: string;
}

/**
 * Internal: a paginated Laravel response shape, partially unwrapped.
 * We expose `items` to consumers and keep paging info next to it.
 */
export interface Paginated<T> {
  items: T[];
  currentPage: number;
  perPage: number;
  total: number;
}
