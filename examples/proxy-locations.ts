/**
 * proxy-locations.ts — Drill into residential proxy geo targeting.
 *
 * Run me
 * ------
 *   cd sdk/js
 *   npm install
 *   export EVESES_API_KEY=sk_live_xxx
 *   # Type-check:   npx tsc --noEmit -p examples/tsconfig.json
 *   # Run via tsx:  npx tsx examples/proxy-locations.ts
 *
 * What it does
 * ------------
 * 1. Builds an authenticated client (Bearer Sanctum API-key token).
 * 2. Lists the residential targeting options (countries / regions / sets).
 * 3. Drills into ONE country with `locationsDetail` and prints its
 *    states / cities (the per-country geo payload that powers a picker).
 */

import {
  Eveses,
  EvesesAuthError,
  EvesesError,
  EvesesValidationError,
} from '../src/index';

const API_KEY = process.env.EVESES_API_KEY ?? 'sk_test_placeholder';
const COUNTRY = process.env.EVESES_PROXY_COUNTRY ?? 'us';

async function main(): Promise<void> {
  const client = new Eveses({ apiKey: API_KEY });

  try {
    // Top-level targeting: the countries / regions / sets you can buy.
    const locations = await client.proxy.locations('residential');
    console.log('Residential targeting:', JSON.stringify(locations).slice(0, 200));

    // Per-country drill-down: states, cities and ISPs under one country.
    const detail = await client.proxy.locationsDetail(COUNTRY);
    const geo = (detail.geo as Record<string, unknown> | undefined) ?? {};

    const states = Array.isArray(geo.states) ? geo.states : [];
    console.log(`${states.length} state(s) in ${COUNTRY.toUpperCase()}:`);
    for (const state of states.slice(0, 5)) {
      const s = state as Record<string, unknown>;
      const cities = Array.isArray(s.cities) ? s.cities : [];
      console.log(`  • ${String(s.name ?? s.code)} — ${cities.length} city/cities`);
    }

    const cities = Array.isArray(geo.cities) ? geo.cities : [];
    console.log(`${cities.length} city/cities listed at country level:`);
    for (const city of cities.slice(0, 5)) {
      const c = city as Record<string, unknown>;
      console.log(`  • ${String(c.name ?? c.code)}`);
    }
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
