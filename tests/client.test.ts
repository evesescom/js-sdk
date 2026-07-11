/**
 * Tests for @eveses/sdk.
 *
 * Uses Node's built-in test runner (node:test), no external deps. Run with:
 *   npm run build && node --test tests/
 * Or directly against the .ts sources (Node 22+):
 *   node --experimental-strip-types --test tests/client.test.ts
 *
 * Each test injects a fake `fetch` so we never touch the network.
 */

import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { createHmac } from 'node:crypto';

import { Eveses } from '../src/client';
import { Webhooks } from '../src/modules/webhooks';
import { EvesesAuthError, EvesesValidationError } from '../src/errors';

interface FakeCall {
  url: string;
  init: RequestInit;
}

/** Build a fake fetch that returns a queue of canned responses. */
function makeFetch(responses: Array<{ status: number; body?: unknown; headers?: Record<string, string> }>) {
  const calls: FakeCall[] = [];
  const queue = [...responses];
  const fn: typeof fetch = async (input, init) => {
    calls.push({ url: String(input), init: init ?? {} });
    const next = queue.shift();
    if (!next) throw new Error('fake fetch: no more responses queued');
    const headers = new Headers({ 'Content-Type': 'application/json', ...(next.headers ?? {}) });
    const body = next.body === undefined ? '' : JSON.stringify(next.body);
    return new Response(body, { status: next.status, headers });
  };
  return { fn, calls };
}

test('activations.create posts JSON, sends Bearer + Idempotency-Key, maps response', async () => {
  const { fn, calls } = makeFetch([
    {
      status: 200,
      body: {
        data: {
          order_id: '01HABC',
          status: 'waiting_sms',
          phone: '+380635551822',
          price_cents: 50,
          expires_at: '2026-05-05T12:00:00Z',
        },
      },
    },
  ]);

  const client = new Eveses({ apiKey: 'sk_test', baseUrl: 'https://api.example.test', fetch: fn });
  const order = await client.activations.create({
    country: 'ua',
    service: 'telegram',
    idempotencyKey: 'idem-1',
    maxPriceCents: 100,
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://api.example.test/api/account/orders');
  assert.equal(calls[0].init.method, 'POST');
  const headers = calls[0].init.headers as Record<string, string>;
  assert.equal(headers.Authorization, 'Bearer sk_test');
  assert.equal(headers['Idempotency-Key'], 'idem-1');
  assert.equal(headers['Content-Type'], 'application/json');
  const sentBody = JSON.parse(String(calls[0].init.body));
  assert.deepEqual(sentBody, {
    mode: 'activation',
    country: 'ua',
    service: 'telegram',
    idempotency_key: 'idem-1',
    max_price_cents: 100,
  });

  assert.equal(order.orderId, '01HABC');
  assert.equal(order.status, 'waiting_sms');
  assert.equal(order.priceCents, 50);
});

test('429 triggers exactly one retry, honouring Retry-After', async () => {
  const { fn, calls } = makeFetch([
    { status: 429, body: { message: 'slow down' }, headers: { 'Retry-After': '0' } },
    { status: 200, body: { data: { order_id: 'X', status: 'waiting_sms' } } },
  ]);
  const client = new Eveses({ apiKey: 'k', baseUrl: 'https://api.example.test', fetch: fn });
  const order = await client.activations.get('X');
  assert.equal(calls.length, 2);
  assert.equal(order.orderId, 'X');
});

test('non-2xx maps to typed error subclasses', async () => {
  const { fn: fnAuth } = makeFetch([{ status: 401, body: { message: 'Unauthenticated.' } }]);
  const c1 = new Eveses({ apiKey: 'k', baseUrl: 'https://x.test', fetch: fnAuth });
  await assert.rejects(c1.wallet.balance(), (err: unknown) => {
    assert.ok(err instanceof EvesesAuthError);
    assert.equal((err as EvesesAuthError).status, 401);
    return true;
  });

  const { fn: fnVal } = makeFetch([
    { status: 422, body: { message: 'The country field is required.', errors: { country: ['required'] } } },
  ]);
  const c2 = new Eveses({ apiKey: 'k', baseUrl: 'https://x.test', fetch: fnVal });
  await assert.rejects(
    c2.activations.create({ country: '', service: 'telegram' }),
    (err: unknown) => {
      assert.ok(err instanceof EvesesValidationError);
      assert.equal((err as EvesesValidationError).status, 422);
      assert.deepEqual((err as EvesesValidationError).errors, { country: ['required'] });
      return true;
    },
  );
});

test('wallet.balance maps snake_case to camelCase', async () => {
  const { fn } = makeFetch([
    {
      status: 200,
      body: { data: { balance: 12500, held_balance: 250, available_balance: 12250, currency: 'USD' } },
    },
  ]);
  const client = new Eveses({ apiKey: 'k', baseUrl: 'https://x.test', fetch: fn });
  const w = await client.wallet.balance();
  assert.deepEqual(w, { balance: 12500, heldBalance: 250, availableBalance: 12250, currency: 'USD' });
});

test('Webhooks.verify accepts a valid sha256= signature within tolerance', () => {
  const secret = 'whsec_test';
  const body = JSON.stringify({ event: 'order.sms_received', data: { order_id: 'X' } });
  const ts = Math.floor(Date.now() / 1000);
  const sig = 'sha256=' + createHmac('sha256', secret).update(`${ts}.${body}`).digest('hex');

  assert.equal(Webhooks.verify(body, sig, secret, { timestamp: ts }), true);
  assert.equal(Webhooks.verify(body, sig, 'wrong-secret', { timestamp: ts }), false);
  assert.equal(Webhooks.verify(body + 'tamper', sig, secret, { timestamp: ts }), false);
});

test('Webhooks.verify rejects stale timestamps outside tolerance', () => {
  const secret = 'whsec_test';
  const body = '{}';
  const ts = Math.floor(Date.now() / 1000) - 10_000; // very old
  const sig = 'sha256=' + createHmac('sha256', secret).update(`${ts}.${body}`).digest('hex');
  assert.equal(Webhooks.verify(body, sig, secret, { timestamp: ts }), false);
  // But passes when tolerance disabled.
  assert.equal(Webhooks.verify(body, sig, secret, { timestamp: ts, toleranceSeconds: 0 }), true);
});
