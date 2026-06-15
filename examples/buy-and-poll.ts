/**
 * buy-and-poll.ts — Full activation lifecycle.
 *
 * Run me
 * ------
 *   cd sdk/js
 *   npm install
 *   export EVESES_API_KEY=sk_live_xxx
 *   # Type-check:   npx tsc --noEmit -p examples/tsconfig.json
 *   # Run via tsx:  npx tsx examples/buy-and-poll.ts
 *   # Ctrl-C at any point to cancel the active order cleanly.
 *
 * What it does
 * ------------
 * 1. Creates an activation order for COUNTRY/SERVICE.
 * 2. Polls `sms()` every 5s for up to 5 minutes, looking for an incoming SMS.
 * 3. On SMS: prints the text and calls `finish()` to commit the spend.
 * 4. On Ctrl-C OR poll timeout: calls `cancel()` to release the number and
 *    refund the held balance back into available.
 *
 * Gotchas
 * -------
 * - `sms()` returns BOTH `stored` (delivered via webhook) and `fresh`
 *   (pulled on demand). We de-duplicate by id and take the first.
 * - Don't poll faster than 5s — the API will 429. The SDK auto-retries
 *   once on 429 using Retry-After, but heavy polling burns through that
 *   allowance fast.
 * - Always `finish()` or `cancel()`. A dangling order keeps your held
 *   balance locked until server-side expiry.
 */

import { randomUUID } from 'node:crypto';

import {
  Eveses,
  EvesesError,
  EvesesNotFoundError,
  type Order,
  type OrderSms,
} from '../src/index';

const API_KEY = process.env.EVESES_API_KEY ?? 'sk_test_placeholder';
const COUNTRY = process.env.EVESES_COUNTRY ?? 'ua';
const SERVICE = process.env.EVESES_SERVICE ?? 'telegram';

const POLL_INTERVAL_MS = 5_000;
const POLL_TIMEOUT_MS = 5 * 60 * 1_000;

function dedupeSms(stored: OrderSms[], fresh: OrderSms[]): OrderSms[] {
  const seen = new Set<number>();
  const out: OrderSms[] = [];
  for (const sms of [...stored, ...fresh]) {
    if (seen.has(sms.id)) continue;
    seen.add(sms.id);
    out.push(sms);
  }
  return out;
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(new Error('aborted'));
    const t = setTimeout(resolve, ms);
    signal.addEventListener('abort', () => {
      clearTimeout(t);
      reject(new Error('aborted'));
    });
  });
}

async function pollForSms(
  client: Eveses,
  order: Order,
  signal: AbortSignal,
): Promise<OrderSms | null> {
  const deadline = Date.now() + POLL_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (signal.aborted) return null;
    const bundle = await client.activations.sms(order.orderId);
    const messages = dedupeSms(bundle.stored, bundle.fresh);
    if (messages.length > 0) return messages[0]!;
    const remaining = Math.max(0, Math.round((deadline - Date.now()) / 1000));
    console.log(`  ...no SMS yet, sleeping ${POLL_INTERVAL_MS / 1000}s (deadline in ${remaining}s)`);
    try {
      await sleep(POLL_INTERVAL_MS, signal);
    } catch {
      return null; // aborted
    }
  }
  return null;
}

async function main(): Promise<void> {
  const client = new Eveses({ apiKey: API_KEY });
  const controller = new AbortController();
  let order: Order | undefined;

  // SIGINT handler — flip the abort signal so the poll loop bails out.
  process.on('SIGINT', () => {
    console.log('\nCancellation requested — releasing the number…');
    controller.abort();
  });

  try {
    order = await client.activations.create({
      country: COUNTRY,
      service: SERVICE,
      idempotencyKey: randomUUID(),
    });
    console.log(`Created order ${order.orderId} → phone ${order.phone ?? '?'}`);
    console.log('Polling for SMS (Ctrl-C to cancel the order)…');

    const sms = await pollForSms(client, order, controller.signal);

    if (controller.signal.aborted) {
      try {
        await client.activations.cancel(order.orderId);
        console.log('Cancelled cleanly.');
      } catch (err) {
        if (err instanceof EvesesNotFoundError) {
          console.log('Order already in a terminal state; nothing to cancel.');
        } else {
          throw err;
        }
      }
      return;
    }

    if (!sms) {
      console.log('Timed out waiting for SMS — cancelling and refunding held balance.');
      await client.activations.cancel(order.orderId);
      return;
    }

    console.log(`Got SMS from ${sms.sender ?? 'unknown'}: ${JSON.stringify(sms.text)}`);
    const finished = await client.activations.finish(order.orderId);
    console.log(`Order ${finished.orderId} finished (status=${finished.status}).`);
  } catch (err) {
    if (err instanceof EvesesError) {
      console.error(`SDK error (${err.status}): ${err.message}`);
    } else {
      throw err;
    }
  }
}

await main();
