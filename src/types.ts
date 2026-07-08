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

// ─────────────────────────────────────────────────────────────────────────────
// Proxies
//
// Two families:
//   - "residential" — metered, billed per GB (optional monthly subscription).
//   - static per-IP — "isp" | "datacenter" | "ipv6" | "mobile" | "sneaker".
//
// The Eveses proxy endpoints return flat JSON (no `{data:...}` envelope); the
// SDK maps snake_case → camelCase and keeps the original payload on `.raw`.
// ─────────────────────────────────────────────────────────────────────────────

/** Static (per-IP) proxy family. */
export type ProxyStaticType = 'isp' | 'datacenter' | 'ipv6' | 'mobile' | 'sneaker';

/** Any proxy type the API accepts on `type=`. */
export type ProxyType = 'residential' | ProxyStaticType;

/** White-label residential (metered) connection + remaining traffic. */
export interface ResidentialAccess {
  host: string;
  ports: { http: number; socks5: number };
  username: string;
  password: string;
  example: string;
  curl: string;
  trafficGbAvailable: number;
  trafficGbUsed: number;
}

/** A residential (or web-unblocker) monthly subscription. */
export interface ProxySubscription {
  status: string;
  /** Present for residential subscriptions (GB/month). */
  gb?: number;
  /** Present for web-unblocker subscriptions (requests/month). */
  requests?: number;
  discountPct: number;
  nextRenewsAt?: string;
  renewFailures: number;
  raw?: Record<string, unknown>;
}

/** A single proxy order (residential top-up or a per-IP purchase). */
export interface ProxyOrder {
  uuid: string;
  type: string;
  kind: string;
  gb: number | null;
  quantity: number;
  location?: string | null;
  status: string;
  priceCents: number;
  currency: string;
  proxies: unknown[] | null;
  autoExtend: boolean;
  extendable: boolean;
  expiresAt?: string;
  createdAt?: string;
  raw?: Record<string, unknown>;
}

/** Response of `client.proxies.list`. */
export interface ProxyOverview {
  residential: ResidentialAccess | null;
  subscription: ProxySubscription | null;
  orders: ProxyOrder[];
}

/** A residential GB package rung (from the pricing ladder). */
export interface ResidentialPackage {
  gb: number;
  perGbCents: number;
  recommended?: boolean;
  /** Original snake_case payload — carries any extra ladder fields. */
  raw?: Record<string, unknown>;
}

/** Response of `client.proxies.packages`. */
export interface ResidentialPackagesResponse {
  packages: ResidentialPackage[];
  currency: string;
}

/** A plan inside a static product. `priceCents === null` ⇒ price via /quote. */
export interface StaticPlan {
  id: number;
  name?: string;
  priceCents: number | null;
  minQuantity?: number;
  maxQuantity?: number;
}

/** A targetable location inside a static product. */
export interface StaticLocation {
  id: number;
  name?: string;
  outOfStock: boolean;
}

/** A static (per-IP) product with its plans + locations. */
export interface StaticProduct {
  id: number;
  type: string;
  name?: string;
  plans: StaticPlan[];
  locations: StaticLocation[];
}

/** Response of `client.proxies.catalog`. */
export interface StaticCatalogResponse {
  products: StaticProduct[];
  currency: string;
}

/**
 * A proxy quote. The wire shape varies by family (residential vs static), so
 * this is intentionally lenient: common fields are surfaced and the full
 * server map is kept on `.raw`.
 */
export interface ProxyQuote {
  type?: string;
  gb?: number;
  quantity?: number;
  priceCents?: number;
  currency?: string;
  discountPct?: number;
  perGbCents?: number;
  raw: Record<string, unknown>;
}

/** Input to `client.proxies.quote` (residential). */
export interface ProxyResidentialQuoteRequest {
  type?: 'residential';
  gb: number;
  subscription?: boolean;
}

/** Input to `client.proxies.quote` (static per-IP). */
export interface ProxyStaticQuoteRequest {
  type: ProxyStaticType;
  productId: number;
  planId: number;
  locationId: number;
  quantity?: number;
}

export type ProxyQuoteRequest = ProxyResidentialQuoteRequest | ProxyStaticQuoteRequest;

/** Input to `client.proxies.purchase` (residential). */
export interface ProxyResidentialPurchaseRequest {
  type?: 'residential';
  gb: number;
  subscription?: boolean;
  /** Optional idempotency key. Sent as the `Idempotency-Key` header. */
  idempotencyKey?: string;
}

/** Input to `client.proxies.purchase` (static per-IP). */
export interface ProxyStaticPurchaseRequest {
  type: ProxyStaticType;
  productId: number;
  planId: number;
  locationId: number;
  locationName?: string;
  quantity?: number;
  /** Optional idempotency key. Sent as the `Idempotency-Key` header. */
  idempotencyKey?: string;
}

export type ProxyPurchaseRequest = ProxyResidentialPurchaseRequest | ProxyStaticPurchaseRequest;

// ─────────────────────────────────────────────────────────────────────────────
// Web Unblocker — an anti-bot scraping endpoint, billed per successful request.
// ─────────────────────────────────────────────────────────────────────────────

/** White-label Web Unblocker connection + request quota. */
export interface WebUnblockerAccess {
  host: string;
  port: number;
  username: string;
  password: string;
  example: string;
  curl: string;
  requestsPurchased: number;
  requestsUsed: number;
  requestsRemaining: number;
}

/** A single Web Unblocker order (a request-bundle top-up). */
export interface WebUnblockerOrder {
  uuid: string;
  product: 'web_unblocker';
  requests: number;
  status: string;
  priceCents: number;
  currency: string;
  createdAt?: string;
  raw?: Record<string, unknown>;
}

/** Response of `client.webUnblocker.list`. */
export interface WebUnblockerOverview {
  access: WebUnblockerAccess | null;
  subscription: ProxySubscription | null;
  orders: WebUnblockerOrder[];
}

/** A Web Unblocker request-bundle rung. */
export interface WebUnblockerPackage {
  requests: number;
  per1kCents: number;
  totalCents: number;
  basePer1kCents: number;
  discountPct: number;
  recommended?: boolean;
  currency: string;
  raw?: Record<string, unknown>;
}

/** Response of `client.webUnblocker.packages`. */
export interface WebUnblockerPackagesResponse {
  packages: WebUnblockerPackage[];
  currency: string;
}

/** Response of `client.webUnblocker.quote`. */
export interface WebUnblockerQuote {
  product: 'web_unblocker';
  requests: number;
  unit: string;
  priceCents: number;
  per1kCents: number;
  currency: string;
  raw: Record<string, unknown>;
}

/** Input to `client.webUnblocker.purchase`. */
export interface WebUnblockerPurchaseRequest {
  requests: number;
  subscription?: boolean;
  /** Optional idempotency key. Sent as the `Idempotency-Key` header. */
  idempotencyKey?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Emails — rent an inbox address (our catch-all domains or a reseller) and read
// its mail.
// ─────────────────────────────────────────────────────────────────────────────

/** A single received message. `body` may be plain text or HTML. */
export interface EmailMessage {
  from?: string;
  subject?: string;
  body?: string;
  receivedAt?: string;
  raw?: Record<string, unknown>;
}

/**
 * A rented email address / order. `get(uuid)` additionally populates
 * `messages` (and live-syncs reseller inboxes).
 */
export interface EmailOrder {
  uuid: string;
  address: string;
  domain: string;
  site?: string | null;
  status: string;
  priceCents: number;
  currency: string;
  messageCount: number;
  expiresAt?: string;
  createdAt?: string;
  /** Populated by `get(uuid)`; empty on list rows. */
  messages: EmailMessage[];
  raw?: Record<string, unknown>;
}

/** A rentable email domain. */
export interface EmailDomain {
  provider?: string;
  domain: string;
  priceCents: number;
  available: boolean;
  raw?: Record<string, unknown>;
}

/** Response of `client.emails.domains`. */
export interface EmailDomainsResponse {
  domains: EmailDomain[];
  currency: string;
}

/** Response of `client.emails.quote`. */
export interface EmailQuote {
  domain: string;
  provider?: string;
  priceCents: number;
  currency: string;
  raw: Record<string, unknown>;
}

/** Input to `client.emails.quote`. */
export interface EmailQuoteRequest {
  domain: string;
  site?: string;
  provider?: string;
}

/** Input to `client.emails.purchase`. */
export interface EmailPurchaseRequest {
  domain: string;
  site?: string;
  provider?: string;
  /** Optional idempotency key. Sent as the `Idempotency-Key` header. */
  idempotencyKey?: string;
}
