# @eveses/sdk

Official JavaScript / TypeScript SDK for the [Eveses](https://eveses.com) developer API.
Activations, wallet, catalog (countries / services / pricing), and webhook signature verification — works on Node 18+ and any runtime that ships `fetch` + `crypto`.

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
  // baseUrl defaults to https://api.eveses.com
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

## Configuration

```ts
new Eveses({
  apiKey: '…',
  baseUrl: 'https://api.eveses.com', // override per environment
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

## License

MIT
