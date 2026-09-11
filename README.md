# @eveses/sdk

Official JavaScript / TypeScript SDK for the [Eveses](https://eveses.com) developer API
(`/api/v1`). SMS numbers (activations & rentals + catalog), wallet, proxies, web-unblocker,
temporary email inboxes, product trials, captcha solving, a unified order feed, consolidated
pricing, remaining quotas, and webhook signature verification — works on Node 18+ and any
runtime that ships `fetch` + `crypto`.

## Install

```bash
npm install @eveses/sdk
# or
pnpm add @eveses/sdk
# or
yarn add @eveses/sdk
```

## Quickstart

```ts
import { Eveses } from '@eveses/sdk';

const client = new Eveses({
  apiKey: process.env.EVESES_API_KEY!,
  // baseUrl defaults to https://api.eveses.io
});

const order = await client.numbers.create({
  country: 'ua',
  service: 'telegram',
  idempotencyKey: crypto.randomUUID(),
});
console.log(order.orderId, order.phone);

const wallet = await client.wallet.balance();
console.log(`${wallet.availableBalance / 100} ${wallet.currency}`);
```

## Authentication

Every request sends `Authorization: Bearer <apiKey>`. Generate an API key from your dashboard
(`Settings → API keys`). The token is a Sanctum personal-access token with `kind=api_key`.

## Modules

The client exposes one namespace per product family:

| Namespace | What it does |
| --- | --- |
| `client.numbers` | Create / read / cancel / finish / retry / repeat / auto-renew SMS orders + batch, pull SMS, and read the numbers catalog (pricing / countries / products / carriers / states). |
| `client.wallet` | Read the wallet balance (total / held / available). |
| `client.proxy` | Buy & manage residential (per-GB) and static (per-IP) proxies. |
| `client.webUnblocker` | Buy & manage request-credit bundles for the unblocking proxy. |
| `client.emails` | Buy & manage temporary email inboxes and read their messages. |
| `client.marketplace` | Browse the digital-goods marketplace (catalog / categories / filters) and purchase (quote / buy / orders / order / reveal). |
| `client.trial` | Check trial status and subscribe to product trials. |
| `client.captcha` | Solve captchas (pay-per-use, count-on-success) + rates + usage. |
| `client.orders` | Unified cross-product order history (normalised `OrderView`). |
| `client.pricing` | Consolidated price list across all products. |
| `client.quotas` | Remaining prepaid balances (trial credits, metered allowances). |
| `client.me` | The authenticated account, incl. `abilities` + `features`. |
| `client.webhooks` | Static HMAC-SHA256 signature verification (also `Webhooks` at the root). |

## Numbers

The unified SMS surface (`/api/v1/numbers/*`) — order lifecycle **and** the
read-only catalog live under one namespace.

```ts
// Create
const order = await client.numbers.create({
  country: 'ua',
  service: 'telegram',
  mode: 'activation',           // or 'rent'
  durationMinutes: 60,          // rent only
  maxPriceCents: 100,           // optional ceiling
  idempotencyKey: 'my-uuid',    // optional, also sent as Idempotency-Key header
});

// Buy several in one call
const orders = await client.numbers.batch([
  { country: 'ua', service: 'telegram' },
  { country: 'pl', service: 'wa' },
]);

// Read
const fresh = await client.numbers.get(order.orderId);
const sms   = await client.numbers.sms(order.orderId);
//   sms.stored — delivered to us via upstream webhook
//   sms.fresh  — pulled from the upstream provider on demand

// Lifecycle
await client.numbers.cancel(order.orderId);      // refund-where-supported
await client.numbers.finish(order.orderId);      // mark consumed
await client.numbers.retry(order.orderId);       // re-poll for another SMS
await client.numbers.repeat(order.orderId);      // buy the same number again
await client.numbers.autoRenew(order.orderId, true);  // rentals only

// Catalog (drives order-creation UX)
const { countries } = await client.numbers.countries({ mode: 'activation' });
const { services }  = await client.numbers.products({ mode: 'activation', country: 'ua' });
const pricing       = await client.numbers.pricing({ mode: 'activation', country: 'ua', service: 'telegram' });
//   pricing.services[0].durations[0].priceCents → 50
const carriers      = await client.numbers.carriers({ country: 'us' });
const states        = await client.numbers.states({ country: 'us' });
```

`mode` accepts `'activation' | 'rent'`. For rentals, pass `durationMinutes` to
`pricing(...)` to filter to a single duration.

## Proxy

Buy and manage residential (metered, per-GB) and static (per-IP: ISP / datacenter /
IPv6 / sneaker / mobile) proxies. The upstream provider stays invisible — connection
details come back under the white-label host.

```ts
// Browse
const pricing   = await client.proxy.pricing();                     // residential GB ladder + static catalogue
const endpoints = await client.proxy.endpoints();                   // white-label host + ports
const locations = await client.proxy.locations('residential');      // targeting options
const geo       = await client.proxy.locationsDetail('us');         // per-country states / cities / ISPs

// Quote → buy (residential, per-GB)
await client.proxy.quote({ type: 'residential', gb: 5 });
const resi = await client.proxy.purchase({
  type: 'residential',
  gb: 5,
  subscription: true,                 // start a monthly auto-renewing plan
  idempotencyKey: crypto.randomUUID(),
});

// Quote → buy (static, per-IP)
const ip = await client.proxy.purchase({
  type: 'isp',
  selection: { productId: 1, planId: 2, locationId: 42, quantity: 3 },
});

// Manage
const mine = await client.proxy.list();                 // { residential, subscription, orders }
const one  = await client.proxy.get(ip.uuid);           // a single per-IP order
await client.proxy.extend(ip.uuid, 30);                 // re-charge a per-IP order for N days
await client.proxy.autoRenew(ip.uuid, true);            // toggle auto-extend
await client.proxy.resetSessions();                     // rotate residential sticky sessions
await client.proxy.usage({ from: '2026-06-01', to: '2026-06-30' });

// Residential subscription lifecycle
await client.proxy.subscriptionPause();
await client.proxy.subscriptionResume();
await client.proxy.subscriptionCancel();
```

## Web Unblocker

Buy and manage request-credit bundles (metered, per-request) for the headless-browser
unblocking proxy.

```ts
const pricing = await client.webUnblocker.pricing();
await client.webUnblocker.quote(10_000, /* subscription */ true);

const order = await client.webUnblocker.purchase(
  { requests: 10_000, subscription: true },
  crypto.randomUUID(),                 // optional idempotency key
);

const { connection, subscription } = await client.webUnblocker.list();

await client.webUnblocker.subscriptionPause();
await client.webUnblocker.subscriptionResume();
await client.webUnblocker.subscriptionCancel();
```

## Emails

Buy and manage temporary / private email inboxes, then read their messages.

```ts
const pricing = await client.emails.pricing();          // prices + available domains (under `domains`)
await client.emails.quote({ domain: 'example.com' });

const inbox = await client.emails.purchase(
  { domain: 'example.com' },
  crypto.randomUUID(),                 // optional idempotency key
);
console.log(inbox.address);

const inboxes = await client.emails.list();             // include released: list(true)
const one     = await client.emails.get(inbox.address); // inbox routes are keyed on the email address

const page = await client.emails.messages(inbox.address, { page: 1, perPage: 20 });
for (const msg of page.items) console.log(msg.from, msg.subject);

await client.emails.markRead(inbox.address, page.items[0].id);
await client.emails.release(inbox.address);             // delete the inbox early
```

## Marketplace

Browse the provider-agnostic digital-goods storefront and buy from it. The upstream
supplier is **never** exposed — products are described purely by normalized attributes:
`country` (ISO-3166-1 alpha-2, e.g. `US`, or a region slug: `mix` / `cis` / `eu` /
`asia` / `africa` / `latam`), `origin` (`autoreg` | `selfreg` | `real` | `retrieve`),
`format` (`tdata` | `session_json` | `session`), and `twofa` (boolean). The catalogue,
categories, and filters live on the public API; quote / buy / orders are authenticated.

```ts
// Discover what you can filter and browse by
const filters    = await client.marketplace.filters('accounts');   // facets for one category
const categories = await client.marketplace.categories();          // all categories

// Browse the catalogue (only the filters you pass are sent)
const catalog = await client.marketplace.catalog({
  category: 'accounts',
  country: 'US',
  origin: 'autoreg',
  groupBy: 'attributes',            // 'country' | 'attributes' (maps to group_by)
});
// group_by='country'    → items bucketed by country
// group_by='attributes' → same-type products collapse into one card:
//   catalog.groups[i].prices_cents  → the per-variant price ladder
//   catalog.groups[i].has_attributes → whether the group carries attribute variants
// Plain catalog (no groupBy) returns catalog.items instead.

// Purchase flow: quote → buy → track → reveal
const quote = await client.marketplace.quote({ category: 'accounts', sku: 'tg-us-autoreg' });

const bought = await client.marketplace.buy(
  { category: 'accounts', sku: 'tg-us-autoreg', quantity: 2 },
  { idempotencyKey: crypto.randomUUID() },   // sent as the Idempotency-Key header
);

const orders = await client.marketplace.orders();         // your marketplace orders
const one    = await client.marketplace.order(bought.uuid as string);
const secret = await client.marketplace.reveal(bought.uuid as string);  // delivered secret(s)
```

## Trial

Check active trial state across products and subscribe to product trials.

```ts
const status = await client.trial.status();
for (const s of status.services) console.log(s.service, s.active, s.expiresAt);

await client.trial.subscribe(['web-unblocker', 'proxies']);
```

## Captcha

Solve captchas, billed pay-per-use from the wallet (count-on-success). `solve` is
blocking: it submits the task and polls until the task resolves or `timeoutSec` elapses,
throwing `EvesesError` on failure/timeout.

```ts
const result = await client.captcha.solve(
  'recaptcha_v2',
  { websiteURL: 'https://example.com', websiteKey: '6Lc…' },
  { timeoutSec: 120, idempotencyKey: crypto.randomUUID() },
);
console.log(result.solution, result.priceMicroUsd);

// Per-solve rates and the billing/usage ledger
const rates = await client.captcha.rates();
const usage = await client.captcha.usage({ status: 'ready', limit: 50 });
for (const t of usage.data) console.log(t.type, t.status, t.costCents);
//   usage.nextCursor / usage.hasMore for pagination
//   usage.unbilledMicroUsd — accrued-but-unbilled total
```

## Orders, pricing, quotas

Cross-product aggregates for unified dashboards.

```ts
// Unified order feed (numbers | proxy | webunblocker | emails — NOT captcha)
const feed = await client.orders.list({ service: 'proxy,numbers', limit: 50 });
for (const o of feed.data) console.log(o.source, o.status, o.amountCents, o.detailUrl);
const single = await client.orders.get('b1f2…-uuid');   // normalised OrderView for any product

// Every product's prices in one call
const allPrices = await client.pricing.all();

// Remaining prepaid balances (a key is omitted when the user has none)
const q = await client.quotas.all();
//   q.trial / q.proxy / q.webunblocker → QuotaEntry[]

// The authenticated account — gate product UI on features instead of build flags
const me = await client.me.get();
if (me.features.proxy) { /* show proxies */ }
console.log(me.abilities); // e.g. ["*"]
```

## Webhook verification

Eveses signs every outbound webhook delivery with HMAC-SHA256 over `${timestamp}.${rawBody}`.
Two headers carry the proof:

- `X-Eveses-Signature` — e.g. `sha256=abc123…`
- `X-Eveses-Timestamp` — unix seconds

Use the static `Webhooks.verify` helper. Pass the **raw** request body (a string), not the
parsed JSON — JSON.parse + JSON.stringify reorders keys and breaks the signature.

```ts
import express from 'express';
import { Webhooks } from '@eveses/sdk';

const app = express();
app.post(
  '/eveses-webhook',
  express.raw({ type: 'application/json' }),
  (req, res) => {
    const ok = Webhooks.verify(
      req.body.toString('utf8'),
      req.header('x-eveses-signature'),
      process.env.EVESES_WEBHOOK_SECRET!,
      { timestamp: req.header('x-eveses-timestamp') },
    );
    if (!ok) return res.status(401).send('bad signature');

    const { event, data } = JSON.parse(req.body.toString('utf8'));
    // handle event …
    res.status(204).end();
  },
);
```

## Errors

All non-2xx responses throw a typed subclass of `EvesesError`:

| Status | Class |
| --- | --- |
| 400 / 422 | `EvesesValidationError` (with `.errors`) |
| 401 | `EvesesAuthError` |
| 403 | `EvesesForbiddenError` |
| 404 | `EvesesNotFoundError` |
| 429 | `EvesesRateLimitError` (only after the 1 auto-retry is exhausted) |
| 5xx | `EvesesServerError` |
| other | `EvesesError` |

```ts
import { EvesesValidationError } from '@eveses/sdk';

try {
  await client.numbers.create({ country: '', service: '' });
} catch (err) {
  if (err instanceof EvesesValidationError) {
    console.error(err.errors);
  } else {
    throw err;
  }
}
```

## API surface

Every call in this SDK targets the versioned `/api/v1/*` surface. Authentication
is unchanged — a Sanctum bearer token (`Authorization: Bearer <apiKey>`). Notable
consolidations in v1: SMS lifecycle **and** catalog live together under
`/api/v1/numbers/*` (the `numbers` namespace); proxy / web-unblocker / emails each
expose `/orders` (buy + list) and `/pricing`; and `orders`, `pricing`, and `quotas`
provide cross-product aggregates. Every `/v1` response also carries
`RateLimit-Limit` / `RateLimit-Remaining` / `RateLimit-Reset` headers (plus
`Retry-After` on a 429) for backoff.

## Configuration

```ts
new Eveses({
  apiKey: '…',
  baseUrl: 'https://api.eveses.io', // override per environment
  timeoutMs: 30_000,
  fetch: globalThis.fetch,           // inject for tests
  defaultHeaders: { 'X-Trace-Id': 't1' },
  userAgent: 'my-app/1.2.3',
});
```

## Development

```bash
npm install
npm run build
node --test tests/
```

## Changelog

### 0.6.0

- **Per-IP proxy orders can now carry paid options.** `quote` and `purchase`
  accept `extra_requirements` — a map of upstream question id to the buyer's
  answer, for a city, a subnet, an ISP, or multi-device access. The SDKs
  previously built the request from a fixed field list and dropped anything
  else silently: you could pass the options, get no error, and receive a plain
  address.
- These answers **move the price**, often steeply. Measured on one US ISP
  address: $2.00 plain, $5.00 with three-device access, $5.60 with a location
  request on top. Quote with exactly the answers you intend to buy with, or you
  will be shown one price and charged another.
- A free-text answer is a **request, not a reservation**. An order that cannot
  be filled is cancelled and refunded, so the risk is not the buyer's.
- `purchase` also takes optional `extra_requirement_labels`, stored on the
  order so it reads "Multi-device access: 3 Devices" rather than "9: 4".

### 0.5.2

- **The `numbers` namespace now actually exists in the code.** It has been
  documented here since 0.4.0 as the merge of `activations` + `catalog`, but
  the released packages still shipped the old split modules — following this
  README produced a compile/attribute error. The code now matches what this
  document has been promising: `numbers`, plus `me`, `orders`, `pricing` and
  `quotas`. All four SDKs expose the identical surface.
- If you are upgrading from a release where `activations`/`catalog` worked,
  those names are gone: `activations.create` → `numbers.create`, and the
  catalog lookups move under `numbers` as well.
- Fixed `npm test`: it ran `node --test tests/`, which cannot load a
  TypeScript file, so the suite exited before a single assertion. Restored the
  compile-then-run script and the `typecheck` command.


### 0.5.1

- Docs: added a Marketplace usage section to the README; patch release.

### 0.5.0

- **New `marketplace` module** — browse the digital-goods marketplace
  (`catalog` / `categories` / `filters`) and purchase (`quote` / `buy` /
  `orders` / `order` / `reveal`). The public catalog supports attribute filters
  (country / origin / format / twofa) and `group_by` = `country` | `attributes`
  — with `attributes`, same-type products collapse into one card whose variants
  carry `prices_cents`.
- **New `proxy.locationsDetail(country, type)`** — per-country residential
  state / city / ISP geo drill-down for a location picker.
- Default `userAgent` bumped to `@eveses/sdk-js/0.5.0`.

### 0.4.0

- **Moved to `/api/v1/*`.** Every request path was repointed from the legacy
  `/api/account/*` surface to the versioned `/api/v1/*` surface. Base URL and
  Bearer auth are unchanged.
- **`numbers` module (merge).** The old `activations` and `catalog` modules were
  merged into a single `client.numbers` namespace over `/api/v1/numbers/*`:
  order lifecycle `create` / `get` / `sms` / `cancel` / `finish` / `retry` /
  `repeat` / `autoRenew` + `batch`, plus catalog `pricing` / `countries` /
  `products` / `carriers` / `states`.
- **`webUnblocker` renamed** on the wire — `/api/account/web-unblocker/*` →
  `/api/v1/webunblocker/*` (de-hyphenated); buy/list now under `/orders`,
  price list under `/pricing`.
- **`proxy` / `emails` repointed** — buy/list under `/orders`, price list under
  `/pricing`; proxy adds `get(uuid)`; emails inbox routes are keyed on the email
  address; `emails.domains()` → `emails.pricing()` (domains under the `domains` key).
- **New `orders` module** — unified cross-product order feed (`GET /api/v1/orders`
  + `/{uuid}`), normalised into `OrderView`.
- **New `pricing` module** — consolidated price list (`GET /api/v1/pricing`).
- **New `quotas` module** — remaining prepaid balances (`GET /api/v1/quotas`).
- **New `me` module** — the authenticated account, now carrying `abilities` +
  `features` (`GET /api/v1/me`).
- **`captcha.usage()` added** (`GET /api/v1/captcha/usage`) alongside the kept
  `solve` / result-poll / `rates`.
- **Removed the `fingerprints` module** — the product is gone.
- Default `userAgent` bumped to `@eveses/sdk-js/0.4.0`.

### 0.3.0

- **New `proxy` module** — residential (per-GB) and static (per-IP: ISP / datacenter /
  IPv6 / sneaker / mobile) proxies: `packages`, `endpoints`, `catalog`, `locations`,
  `quote`, `purchase`, `list`, `extend`, `autoRenew`, `resetSessions`, `usage`, `trial`,
  and residential `subscriptionPause` / `subscriptionResume` / `subscriptionCancel`.
- **New `webUnblocker` module** — request-credit bundles for the unblocking proxy:
  `packages`, `quote`, `purchase`, `trial`, `access`, and subscription pause/resume/cancel.
- **New `emails` module** — temporary email inboxes: `domains`, `quote`, `purchase`,
  `list`, `get`, `messages` (paginated), `markRead`, `release`.
- **New `trial` module** — `status` and `subscribe` for product trials.
- **New `captcha` module** — blocking `solve` (submit + poll, count-on-success billing).
- **New `fingerprints` module** — synchronous `generate` and `random` browser fingerprints.
- Module reorg: `proxies` → `proxy`, `web-unblocker` → `webUnblocker`.
- Default `userAgent` bumped to `@eveses/sdk-js/0.3.0`.

### 0.2.0

- Added the `catalog` module (`countries` / `services` / `pricing`) over the
  `/api/v1/numbers/*` routes.
- Wallet balance and activation lifecycle (`create` / `get` / `sms` / `cancel` / `finish`).
- Static `Webhooks.verify` HMAC-SHA256 signature helper.

## License

MIT
