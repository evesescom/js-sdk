# `@eveses/sdk` — examples

Three runnable scripts that exercise the SDK end-to-end. Written in
TypeScript, targeting Node 20+ with ESM and top-level `await`.

| File | What it shows |
| --- | --- |
| `quickstart.ts` | Construct the client, check wallet balance, list services, buy ONE activation with an idempotency key. |
| `buy-and-poll.ts` | Full activation lifecycle: create → poll SMS every 5s for 5 min → `finish()` (or `cancel()` on Ctrl-C / timeout). |
| `webhook-server.ts` | Minimal `node:http` server that verifies `X-Eveses-Signature` with `Webhooks.verify` and prints the parsed payload. |

## Prerequisites

```bash
cd sdk/js
npm install                                  # installs typescript + @types/node

# Get a Sanctum API-key token (kind=api_key) from the Eveses dashboard.
export EVESES_API_KEY=sk_live_xxx

# For the webhook server only:
export EVESES_WEBHOOK_SECRET=whsec_xxx
```

Type-check everything:

```bash
npx tsc --noEmit -p examples/tsconfig.json
```

Run any example with [`tsx`](https://github.com/privatenumber/tsx) (or
`ts-node`, or precompile with `tsc`):

```bash
npx tsx examples/quickstart.ts
npx tsx examples/buy-and-poll.ts
npx tsx examples/webhook-server.ts
```
