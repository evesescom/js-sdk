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
 * Input to `client.numbers.create`.
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
 * The on-the-wire shape returned by /api/v1/numbers/orders for a single order.
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

/** Response of `client.numbers.sms`. */
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

/** Response of `client.numbers.countries`. */
export interface CatalogCountriesResponse {
  mode: OrderMode;
  /** ISO 3166-1 alpha-2 codes (lowercased), e.g. ["ua", "pl", "de"]. */
  countries: string[];
}

/** Response of `client.numbers.products`. */
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

/** Response of `client.numbers.pricing`. */
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

/** Terminal + interim status of a captcha task. */
export type CaptchaStatus = 'queued' | 'processing' | 'ready' | 'failed';

/** Options for `client.captcha.solve`. */
export interface CaptchaSolveOptions {
  /** Optional client webhook to also receive the result (POSTed by the API). */
  callbackUrl?: string;
  /** Idempotency key — replays return the same task instead of a new solve. */
  idempotencyKey?: string;
  /** Max seconds to block waiting for the result (default 180). */
  timeoutSec?: number;
}

/** Resolved captcha task returned by `client.captcha.solve`. */
export interface CaptchaSolution {
  taskId: number;
  status: CaptchaStatus;
  /** Present when status === 'ready'. */
  solution?: string;
  /** Present when status === 'failed'. */
  error?: string;
  priceMicroUsd?: number;
}

/** Terminal + interim status of a captcha usage item. */
export type CaptchaUsageStatus = 'queued' | 'processing' | 'ready' | 'failed';

/** A single captcha task in the usage ledger. */
export interface CaptchaUsageItem {
  id: number;
  type: string;
  status: CaptchaUsageStatus;
  /** Micro-USD cost — use this (or `costCents`), NOT a cents-only field. */
  costMicroUsd?: number;
  costCents?: number;
  createdAt?: string;
  resolvedAt?: string;
  error?: string;
  /** Original snake_case server payload, for forward-compat. */
  raw?: Record<string, unknown>;
}

/** Filter params for `client.captcha.usage`. */
export interface CaptchaUsageListOptions {
  status?: string;
  type?: string;
  /** ISO-8601 lower bound on created_at. */
  createdGte?: string;
  /** ISO-8601 upper bound on created_at. */
  createdLte?: string;
  cursor?: string;
  /** Default 20, max 100. */
  limit?: number;
}

/** Response of `client.captcha.usage` — cursor-paginated task history. */
export interface CaptchaUsage {
  data: CaptchaUsageItem[];
  nextCursor?: string;
  hasMore: boolean;
  /** Accrued-but-unbilled totals across the ledger. */
  unbilledMicroUsd?: number;
  unbilledCents?: number;
}

/**
 * Proxy family. `residential` is metered (per-GB); the rest are static
 * (per-IP).
 */
export type ProxyType = 'residential' | 'isp' | 'datacenter' | 'ipv6' | 'sneaker' | 'mobile';

/** A per-IP product/plan/location selection for `quote` / `purchase`. */
export interface ProxyStaticSelection {
  productId: number;
  planId: number;
  locationId: number;
  /** Optional human location label stored on the order (purchase only). */
  locationName?: string;
  /** Number of IPs (default 1). */
  quantity?: number;
}

/** Input to `client.proxy.quote`. */
export interface ProxyQuoteRequest {
  /** Defaults to 'residential'. */
  type?: ProxyType;
  /** GB to quote (residential only). */
  gb?: number;
  /** Request the subscription price (residential only). */
  subscription?: boolean;
  /** Product/plan/location (per-IP types only). */
  selection?: ProxyStaticSelection;
  /** Number of IPs (per-IP types only; default 1). */
  quantity?: number;
  /**
   * Paid options, keyed by the upstream question id from `pricing()`.
   *
   * They MOVE THE PRICE, often steeply — measured on one US ISP address:
   * $2.00 plain, $5.00 with three-device access, $5.60 with a location request
   * on top. Quote with exactly the answers you intend to buy with, or you will
   * be shown one price and charged another.
   */
  extraRequirements?: Record<string, string>;
}

/** Input to `client.proxy.purchase`. */
export interface ProxyPurchaseRequest {
  /** Defaults to 'residential'. */
  type?: ProxyType;
  /** GB to buy (residential only). */
  gb?: number;
  /** Start a monthly auto-renewing subscription (residential only). */
  subscription?: boolean;
  /** Product/plan/location + quantity (per-IP types only). */
  selection?: ProxyStaticSelection;
  /**
   * Send the SAME answers the quote was taken with: buying without them after
   * quoting with them sells at the plain price and leaves the premium unpaid.
   *
   * A free-text answer (a city, a subnet) is a REQUEST, not a reservation — an
   * order that cannot be filled is cancelled and refunded.
   */
  extraRequirements?: Record<string, string>;
  /** Optional labels, stored on the order so it reads "Multi-device access: 3 Devices". */
  extraRequirementLabels?: Record<string, string>;
  /** Idempotency key — replays return the same order. Sent as Idempotency-Key. */
  idempotencyKey?: string;
}

/** A proxy order returned by `client.proxy.purchase` / `list` / `extend`. */
export interface ProxyOrder {
  uuid: string;
  type: string;
  kind?: string;
  /** Residential GB bought, when applicable. */
  gb?: number;
  /** Per-IP quantity, when applicable. */
  quantity?: number;
  location?: string;
  status: string;
  priceCents: number;
  currency: string;
  /** Provider connection rows (shape varies per family). */
  proxies?: unknown;
  autoExtend: boolean;
  extendable: boolean;
  expiresAt?: string;
  createdAt?: string;
  /** Original snake_case server payload, for forward-compat. */
  raw?: Record<string, unknown>;
}

/** The residential subscription block. */
export interface ProxySubscription {
  status: string;
  gb: number;
  discountPct: number;
  nextRenewsAt?: string;
  renewFailures: number;
}

/** Response of `client.proxy.list`. */
export interface ProxyList {
  /** Residential sub-user connection block (host/ports/username/password), or null. */
  residential: Record<string, unknown> | null;
  subscription: ProxySubscription | null;
  orders: ProxyOrder[];
}

// ---------------------------------------------------------------------------
// Web Unblocker
// ---------------------------------------------------------------------------

/** Input to `client.webUnblocker.quote`. */
export interface WebUnblockerQuoteRequest {
  requests: number;
  subscription?: boolean;
}

/** Input to `client.webUnblocker.purchase`. */
export interface WebUnblockerPurchaseRequest {
  requests: number;
  subscription?: boolean;
  /** Idempotency key — replays return the same order. Sent as Idempotency-Key. */
  idempotencyKey?: string;
}

/** An order returned by `client.webUnblocker.purchase`. */
export interface WebUnblockerOrder {
  uuid: string;
  requests: number;
  status: string;
  priceCents: number;
  currency: string;
  expiresAt?: string;
  createdAt?: string;
  /** Original snake_case server payload, for forward-compat. */
  raw?: Record<string, unknown>;
}

/** Subscription block returned by `client.webUnblocker.access`. */
export interface WebUnblockerSubscription {
  status: string;
  requests: number;
  nextRenewsAt?: string;
}

/** Response of `client.webUnblocker.access`. */
export interface WebUnblockerAccess {
  /** Connection credentials / endpoint block. */
  connection: Record<string, unknown> | null;
  subscription: WebUnblockerSubscription | null;
}

// ---------------------------------------------------------------------------
// Emails
// ---------------------------------------------------------------------------

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
  /** Idempotency key — replays return the same order. Sent as Idempotency-Key. */
  idempotencyKey?: string;
}

/** A single email inbox order. */
export interface EmailOrder {
  uuid: string;
  domain: string;
  address: string;
  provider?: string;
  site?: string;
  status: string;
  priceCents: number;
  currency: string;
  expiresAt?: string;
  createdAt?: string;
  released: boolean;
  /** Original snake_case server payload, for forward-compat. */
  raw?: Record<string, unknown>;
}

/** A single message inside an inbox. */
export interface EmailMessage {
  id: number;
  subject?: string;
  from?: string;
  body?: string;
  bodyHtml?: string;
  read: boolean;
  receivedAt?: string;
  /** Original snake_case server payload, for forward-compat. */
  raw?: Record<string, unknown>;
}

/** Pagination options for `client.emails.messages`. */
export interface EmailMessageListOptions {
  page?: number;
  perPage?: number;
}

// ---------------------------------------------------------------------------
// Trial
// ---------------------------------------------------------------------------

/** A single service entry inside `TrialStatus`. */
export interface TrialServiceStatus {
  service: string;
  active: boolean;
  expiresAt?: string;
}

/** Response of `client.trial.status`. */
export interface TrialStatus {
  services: TrialServiceStatus[];
  /** Original snake_case server payload, for forward-compat. */
  raw?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Orders (global, cross-product feed)
// ---------------------------------------------------------------------------

/** The product a global order belongs to. */
export type OrderSource = 'numbers' | 'proxy' | 'webunblocker' | 'emails';

/** A normalised order from the global `/api/v1/orders` feed. */
export interface OrderView {
  source: OrderSource;
  id: string;
  /** Canonical status: pending|active|awaiting|completed|expired|canceled|failed. */
  status: string;
  amountCents?: number;
  currency?: string;
  title?: string;
  createdAt?: string;
  /** May be null/absent for some products. */
  expiresAt?: string;
  /** Deep-link to the product-native order resource. */
  detailUrl?: string;
  /** Original snake_case server payload, for forward-compat. */
  raw?: Record<string, unknown>;
}

/** Filter params for `client.orders.list`. */
export interface OrderListOptions {
  /** Comma-separated services, e.g. "numbers,proxy". */
  service?: string;
  /** Canonical status filter. */
  status?: string;
  /** ISO-8601 lower bound on created_at. */
  createdGte?: string;
  /** ISO-8601 upper bound on created_at. */
  createdLte?: string;
  cursor?: string;
  /** Default 20, max 100. */
  limit?: number;
}

/** Cursor-paginated page of `OrderView`s. */
export interface OrderViewPage {
  data: OrderView[];
  nextCursor?: string;
  hasMore: boolean;
}

// ---------------------------------------------------------------------------
// Quotas
// ---------------------------------------------------------------------------

/** A single remaining-quota entry. */
export interface QuotaEntry {
  /** Present on trial entries (e.g. "sms"). */
  service?: string;
  /** Present on metered entries (e.g. "iproyal"). */
  provider?: string;
  /** Counter unit, e.g. "count" | "gb" | "requests". */
  unit?: string;
  remaining?: number;
  total?: number;
  used?: number;
  expiresAt?: string;
  /** Original snake_case server payload, for forward-compat. */
  raw?: Record<string, unknown>;
}

/**
 * Response of `client.quotas.all`. Only products with a decrementing counter
 * are present; a key is omitted when the user has none.
 */
export interface Quotas {
  trial?: QuotaEntry[];
  proxy?: QuotaEntry[];
  webunblocker?: QuotaEntry[];
  /** Original snake_case server payload, for forward-compat. */
  raw?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Me
// ---------------------------------------------------------------------------

/**
 * The authenticated account. The v1 payload adds `abilities` (what THIS token
 * can do) and `features` (which product entry points to show).
 */
export interface Me {
  id?: number | string;
  email?: string;
  /** What this token can do, e.g. ["*"]. */
  abilities: string[];
  /** Product feature gates, e.g. { proxy: true, captcha: false }. */
  features: Record<string, boolean>;
  /** Full snake_case server payload — carries all remaining `me` fields. */
  raw: Record<string, unknown>;
}
