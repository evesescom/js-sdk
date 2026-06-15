/**
 * quickstart.ts — Hello-world for the Eveses JS/TS SDK.
 *
 * Run me
 * ------
 *   cd sdk/js
 *   npm install
 *   export EVESES_API_KEY=sk_live_xxx
 *   # Type-check:   npx tsc --noEmit -p examples/tsconfig.json
 *   # Run via tsx:  npx tsx examples/quickstart.ts
 *
 * What it does
 * ------------
 * 1. Builds an authenticated client (Bearer Sanctum API-key token).
 * 2. Reads the wallet balance (so you can see currency + available funds).
 * 3. Lists service codes for one country.
 * 4. Buys ONE activation, passing an idempotency key.
 *
 * Idempotency note
 * ----------------
 * We send a random `idempotencyKey` so this script is safe to retry on
 * network blips: the API returns the SAME order on a retry rather than
 * charging you twice for two numbers. In production, generate the key
 * once per *user intent* (when the user clicks Buy), not per HTTP attempt.
 */

import { randomUUID } from 'node:crypto';

import {
  Eveses,
  EvesesAuthError,
  EvesesError,
  EvesesValidationError,
} from '../src/index';

const API_KEY = process.env.EVESES_API_KEY ?? 'sk_test_placeholder';
const COUNTRY = process.env.EVESES_COUNTRY ?? 'ua';
const SERVICE = process.env.EVESES_SERVICE ?? 'telegram';

async function main(): Promise<void> {
  // The constructor only checks that the key is non-empty; the first
  // real request is where 401s surface. We catch the whole EvesesError
  // family at the boundary.
  const client = new Eveses({ apiKey: API_KEY });

  try {
    // Wallet balance is reported in MINOR units (cents). Mind the split:
    //   availableBalance — spendable right now
    //   heldBalance      — reserved against in-flight orders
    //   balance          — availableBalance + heldBalance
    const wallet = await client.wallet.balance();
    const fmt = (cents: number) => (cents / 100).toFixed(2);
    console.log(
      `Wallet: ${fmt(wallet.availableBalance)} ${wallet.currency} available ` +
        `(held: ${fmt(wallet.heldBalance)})`,
    );

    // `services()` is the global product catalog for the mode; `country`
    // is informational on v1 today.
    const services = await client.catalog.services({ mode: 'activation', country: COUNTRY });
    console.log(`${services.services.length} services available (mode=${services.mode})`);
    if (!services.services.includes(SERVICE)) {
      console.warn(`Warning: '${SERVICE}' not in catalog — request may 404.`);
    }

    // The idempotency key MUST be stable across retries of the same intent.
    // randomUUID() is fine because we call create() exactly once.
    const order = await client.activations.create({
      country: COUNTRY,
      service: SERVICE,
      mode: 'activation',
      idempotencyKey: randomUUID(),
    });
    console.log(
      `Created order ${order.orderId}: phone=${order.phone ?? '?'} status=${order.status}`,
    );
    console.log('Next: poll client.activations.sms(order.orderId) for the code.');
  } catch (err) {
    if (err instanceof EvesesAuthError) {
      console.error('Auth failed — check EVESES_API_KEY (must start with sk_).');
    } else if (err instanceof EvesesValidationError) {
      console.error(`Validation failed: ${err.message}`);
      if (err.errors) {
        for (const [field, msgs] of Object.entries(err.errors)) {
          console.error(`  ${field}: ${msgs.join(', ')}`);
        }
      }
    } else if (err instanceof EvesesError) {
      console.error(`SDK error (${err.status}): ${err.message}`);
    } else {
      throw err;
    }
  }
}

await main();
