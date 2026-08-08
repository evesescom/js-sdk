/**
 * marketplace.ts — Browse the Eveses digital-goods marketplace.
 *
 * Run me
 * ------
 *   cd sdk/js
 *   npm install
 *   export EVESES_API_KEY=sk_live_xxx
 *   # Type-check:   npx tsc --noEmit -p examples/tsconfig.json
 *   # Run via tsx:  npx tsx examples/marketplace.ts
 *
 * What it does
 * ------------
 * 1. Builds an authenticated client (Bearer Sanctum API-key token).
 * 2. Reads the filter facets for one category (country / origin / format / twofa).
 * 3. Lists the marketplace categories.
 * 4. Browses the catalog grouped by attributes, then prints a few groups
 *    with their `prices_cents` variants.
 *
 * Grouping note
 * -------------
 * With `groupBy: 'attributes'`, same-type products collapse into one card
 * whose variants carry `prices_cents`; the public catalog is unauthenticated,
 * but the buy/reveal flow (commented out below) needs an API key and spends
 * real money, so it is left disabled by default.
 */

import { randomUUID } from 'node:crypto';

import {
  Eveses,
  EvesesAuthError,
  EvesesError,
  EvesesValidationError,
} from '../src/index';

const API_KEY = process.env.EVESES_API_KEY ?? 'sk_test_placeholder';
const CATEGORY = process.env.EVESES_MARKETPLACE_CATEGORY ?? 'accounts';
const COUNTRY = process.env.EVESES_MARKETPLACE_COUNTRY ?? 'US';

async function main(): Promise<void> {
  const client = new Eveses({ apiKey: API_KEY });

  try {
    // Filter facets tell you which country / origin / format / twofa values
    // are actually sellable in this category — drive your picker off these.
    const filters = await client.marketplace.filters(CATEGORY);
    console.log(`Filters for '${CATEGORY}':`, JSON.stringify(filters).slice(0, 200));

    // The top-level category list (e.g. accounts, keys, subscriptions…).
    const categories = await client.marketplace.categories();
    console.log('Categories:', JSON.stringify(categories).slice(0, 200));

    // Browse grouped by attributes: same-type products fold into one card
    // whose variants carry `prices_cents`.
    const catalog = await client.marketplace.catalog({
      category: CATEGORY,
      country: COUNTRY,
      origin: 'autoreg',
      groupBy: 'attributes',
    });

    const groups = Array.isArray(catalog.groups) ? catalog.groups : [];
    console.log(`${groups.length} group(s) for ${CATEGORY}/${COUNTRY}/autoreg:`);
    for (const group of groups.slice(0, 3)) {
      const g = group as Record<string, unknown>;
      const title = typeof g.title === 'string' ? g.title : (g.name ?? '(untitled)');
      console.log(`  • ${String(title)} — prices_cents=${JSON.stringify(g.prices_cents)}`);
    }

    // ---------------------------------------------------------------------
    // Purchase flow (kept commented so running this script spends nothing).
    //
    // Pick a SKU from the catalog, quote it, then buy with an idempotency key
    // (stable per user intent). `reveal` returns the delivered secret(s) once
    // the order is fulfilled.
    // ---------------------------------------------------------------------
    // const sku = 'accounts_us_autoreg_tdata';
    // const quote = await client.marketplace.quote({ category: CATEGORY, sku });
    // console.log('Quote:', quote);
    //
    // const order = await client.marketplace.buy(
    //   { category: CATEGORY, sku, quantity: 1 },
    //   { idempotencyKey: randomUUID() },
    // );
    // console.log('Bought:', order);
    //
    // const uuid = String((order as Record<string, unknown>).uuid ?? '');
    // const secret = await client.marketplace.reveal(uuid);
    // console.log('Revealed:', secret);
    void randomUUID; // keep the import referenced while the flow is disabled
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
