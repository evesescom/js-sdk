# @eveses/sdk

Official JavaScript / TypeScript SDK for the [Eveses](https://eveses.com) developer API.
SMS activations & rentals, wallet, catalog (countries / services / pricing), proxies,
web-unblocker, temporary email inboxes, product trials, captcha solving, browser
fingerprints, and webhook signature verification — works on Node 18+ and any runtime
that ships `fetch` + `crypto`.

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

const order = await client.activations.create({
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
| `client.activations` | Create / read / cancel / finish SMS activations & rentals, pull SMS. |
| `client.wallet` | Read the wallet balance (total / held / available). |
| `client.catalog` | Read-only countries / services / pricing metadata. |
| `client.proxy` | Buy & manage residential (per-GB) and static (per-IP) proxies. |
| `client.webUnblocker` | Buy & manage request-credit bundles for the unblocking proxy. |
| `client.emails` | Buy & manage temporary email inboxes and read their messages. |
| `client.trial` | Check trial status and subscribe to product trials. |
| `client.captcha` | Solve captchas (pay-per-use, count-on-success). |
| `client.fingerprints` | Generate / fetch browser fingerprints (pay-per-use). |
| `client.webhooks` | Static HMAC-SHA256 signature verification (also `Webhooks` at the root). |

## Activations

```ts
// Create
const order = await client.activations.create({
  country: 'ua',
  service: 'telegram',
  mode: 'activation',           // or 'rent'
  durationMinutes: 60,          // rent only
  maxPriceCents: 100,           // optional ceiling
  idempotencyKey: 'my-uuid',    // optional, also sent as Idempotency-Key header
});

// Read
const fresh = await client.activations.get(order.orderId);
const sms   = await client.activations.sms(order.orderId);
//   sms.stored — delivered to us via upstream webhook
//   sms.fresh  — pulled from the upstream provider on demand

// Lifecycle
await client.activations.cancel(order.orderId);  // refund-where-supported
await client.activations.finish(order.orderId);  // mark consumed
```

## Catalog (countries / services / pricing)

Read-only metadata for driving order-creation UX. All three calls hit the
API-key-authenticated `/api/v1/numbers/*` routes, so the same Bearer token
that creates orders can populate selectors and price tables.

```ts
const { countries } = await client.catalog.countries({ mode: 'activation' });
const { services }  = await client.catalog.services({ mode: 'activation', country: 'ua' });
const pricing       = await client.catalog.pricing({ mode: 'activation', country: 'ua', service: 'telegram' });
//   pricing.services[0].durations[0].priceCents → 50
```

`mode` accepts `'activation' | 'rent'`. For rentals, pass `durationMinutes` to
`pricing(...)` to filter to a single duration.

## Proxy

Buy and manage residential (metered, per-GB) and static (per-IP: ISP / datacenter /
IPv6 / sneaker / mobile) proxies. The upstream provider stays invisible — connection
details come back under the white-label host.

```ts
// Browse
const packages  = await client.proxy.packages();                    // residential GB ladder
const endpoints = await client.proxy.endpoints();                   // white-label host + ports
const catalog   = await client.proxy.catalog();                     // static (per-IP) products
const locations = await client.proxy.locations('residential');      // targeting options

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
const packages = await client.webUnblocker.packages();
await client.webUnblocker.quote(10_000, /* subscription */ true);

const order = await client.webUnblocker.purchase(
  { requests: 10_000, subscription: true },
  crypto.randomUUID(),                 // optional idempotency key
);

const { connection, subscription } = await client.webUnblocker.access();

await client.webUnblocker.subscriptionPause();
await client.webUnblocker.subscriptionResume();
await client.webUnblocker.subscriptionCancel();
```

## Emails

Buy and manage temporary / private email inboxes, then read their messages.

```ts
const domains = await client.emails.domains();          // available sending domains
await client.emails.quote({ domain: 'example.com' });

const inbox = await client.emails.purchase(
  { domain: 'example.com' },
  crypto.randomUUID(),                 // optional idempotency key
);
console.log(inbox.address);

const inboxes = await client.emails.list();             // include released: list(true)
const one     = await client.emails.get(inbox.uuid);

const page = await client.emails.messages(inbox.uuid, { page: 1, perPage: 20 });
for (const msg of page.items) console.log(msg.from, msg.subject);

await client.emails.markRead(inbox.uuid, page.items[0].id);
await client.emails.release(inbox.uuid);                // delete the inbox early
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
```

## Fingerprints

Generate browser fingerprints, billed pay-per-use from the wallet (count-on-success).
Unlike captcha solving this is synchronous — one request returns a complete fingerprint.

```ts
const fp = await client.fingerprints.generate({ tags: 'Windows', country: 'us' });
console.log(fp.fingerprint, fp.priceMicroUsd);

const random = await client.fingerprints.random({ min_browser_version: 130 });
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
  await client.activations.create({ country: '', service: '' });
} catch (err) {
  if (err instanceof EvesesValidationError) {
    console.error(err.errors);
  } else {
    throw err;
  }
}
```

## API surface vs OpenAPI

The Eveses public OpenAPI spec exposes the customer-facing endpoints under
`/api/account/*` (legacy account scope) and `/api/v1/numbers/*` (new versioned
public API). For API-key consumers (`kind=api_key` Sanctum tokens), the
v1 surface is currently a **thin wrapper** around the same controllers — orders
and wallet are still served from `/api/account/*`. This SDK targets the
account-scoped routes, which is where v1 reads & writes terminate today. When
v1 ships its own activations / wallet routes, you can override the base URL
without changing call sites; the response shapes are identical.

The newer product families (proxy, web-unblocker, emails, trial, captcha,
fingerprints) are served exclusively from the account-scoped `/api/account/*`
namespace and are exposed here 1:1.

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
