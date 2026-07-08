/**
 * proxies-unblocker-emails.ts — a tour of the three product modules added to
 * the Eveses JS/TS SDK: proxies, web unblocker, and emails.
 *
 * Run me
 * ------
 *   cd sdk/js
 *   npm install
 *   export EVESES_API_KEY=sk_live_xxx
 *   # Type-check:   npx tsc --noEmit -p examples/tsconfig.json
 *   # Run via tsx:  npx tsx examples/proxies-unblocker-emails.ts
 *
 * What it does
 * ------------
 * 1. PROXIES: read the residential package ladder, quote 5 GB, buy it
 *    (idempotent), then toggle auto-renew on a per-IP order (illustrative).
 * 2. WEB UNBLOCKER: quote a request bundle, buy it (idempotent).
 * 3. EMAILS: list catch-all domains, rent an address (idempotent), then poll
 *    the inbox via `emails.get(uuid)` (the reseller sync mechanism).
 *
 * Money is integer cents; currency is USD. All purchase calls accept an
 * optional `idempotencyKey` (sent as the `Idempotency-Key` header) so they are
 * safe to retry — generate one key per user intent, not per HTTP attempt.
 */

import { randomUUID } from 'node:crypto';

import { Eveses, EvesesError } from '../src/index';

const API_KEY = process.env.EVESES_API_KEY ?? 'sk_test_placeholder';
const fmt = (cents: number) => (cents / 100).toFixed(2);

async function main(): Promise<void> {
  const client = new Eveses({ apiKey: API_KEY });

  try {
    // ── 1. Proxies (residential, metered per GB) ─────────────────────────────
    const { packages } = await client.proxies.packages();
    console.log(`Residential ladder: ${packages.length} rungs`);

    const proxyQuote = await client.proxies.quote({ type: 'residential', gb: 5 });
    console.log(`5 GB quote: ${fmt(proxyQuote.priceCents ?? 0)} ${proxyQuote.currency ?? 'USD'}`);

    const proxyOrder = await client.proxies.purchase({
      type: 'residential',
      gb: 5,
      idempotencyKey: randomUUID(),
    });
    console.log(`Bought proxy order ${proxyOrder.uuid} (${fmt(proxyOrder.priceCents)} USD)`);

    // Static (per-IP) management — extend / auto-renew take the order uuid.
    // (Guarded so the example still runs on residential-only accounts.)
    if (proxyOrder.extendable) {
      await client.proxies.autoRenew(proxyOrder.uuid, true);
      console.log('Auto-renew enabled on the per-IP order.');
    }

    // ── 2. Web Unblocker (billed per successful request) ─────────────────────
    const wuQuote = await client.webUnblocker.quote({ requests: 10_000 });
    console.log(`10k requests: ${fmt(wuQuote.priceCents)} USD (${wuQuote.per1kCents}¢ / 1k)`);

    const wuOrder = await client.webUnblocker.purchase({
      requests: 10_000,
      idempotencyKey: randomUUID(),
    });
    console.log(`Bought web-unblocker order ${wuOrder.uuid}`);

    // ── 3. Emails (rent an inbox, then poll it) ──────────────────────────────
    const { domains } = await client.emails.domains();
    const domain = domains[0]?.domain ?? 'example.com';

    const emailOrder = await client.emails.purchase({ domain, idempotencyKey: randomUUID() });
    console.log(`Rented ${emailOrder.address} (${emailOrder.uuid})`);

    // `emails.get(uuid)` is the inbox-refresh mechanism — poll it for new mail.
    const inbox = await client.emails.get(emailOrder.uuid);
    console.log(`Inbox has ${inbox.messageCount} message(s).`);
    for (const msg of inbox.messages) {
      console.log(`  • ${msg.subject ?? '(no subject)'} — from ${msg.from ?? '?'}`);
    }
  } catch (err) {
    if (err instanceof EvesesError) {
      console.error(`SDK error (${err.status}): ${err.message}`);
    } else {
      throw err;
    }
  }
}

await main();
