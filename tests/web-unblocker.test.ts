/**
 * Tests for client.webUnblocker.* — list / packages / quote / purchase /
 * subscription. Same fake-fetch style as client.test.ts; flat envelope.
 */

import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { Eveses } from '../dist/client.js';

interface FakeCall {
  url: string;
  init: RequestInit;
}

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

test('webUnblocker.list maps access, subscription and orders', async () => {
  const { fn, calls } = makeFetch([
    {
      status: 200,
      body: {
        access: {
          host: 'unblock.eveses.com',
          port: 12323,
          username: 'wu',
          password: 'pw',
          example: 'unblock.eveses.com:12323:wu:pw',
          curl: 'curl ...',
          requests_purchased: 10000,
          requests_used: 250,
          requests_remaining: 9750,
        },
        subscription: {
          status: 'active',
          requests: 10000,
          discount_pct: 10,
          next_renews_at: '2026-07-01T00:00:00+00:00',
          renew_failures: 0,
        },
        orders: [
          { uuid: 'wo-1', product: 'web_unblocker', requests: 10000, status: 'active', price_cents: 500, currency: 'USD', created_at: '2026-06-01T00:00:00+00:00' },
        ],
      },
    },
  ]);
  const client = new Eveses({ apiKey: 'k', baseUrl: 'https://api.example.test', fetch: fn });
  const res = await client.webUnblocker.list();

  assert.equal(calls[0].url, 'https://api.example.test/api/account/web-unblocker');
  assert.ok(res.access);
  assert.equal(res.access.port, 12323);
  assert.equal(res.access.requestsRemaining, 9750);
  assert.ok(res.subscription);
  assert.equal(res.subscription.requests, 10000);
  assert.equal(res.orders[0].uuid, 'wo-1');
  assert.equal(res.orders[0].product, 'web_unblocker');
});

test('webUnblocker.packages maps the request-bundle ladder', async () => {
  const { fn, calls } = makeFetch([
    {
      status: 200,
      body: {
        packages: [
          { requests: 10000, per_1k_cents: 90, total_cents: 900, base_per_1k_cents: 100, discount_pct: 10, recommended: true, currency: 'USD' },
        ],
        currency: 'USD',
      },
    },
  ]);
  const client = new Eveses({ apiKey: 'k', baseUrl: 'https://x.test', fetch: fn });
  const res = await client.webUnblocker.packages();
  assert.equal(calls[0].url, 'https://x.test/api/account/web-unblocker/packages');
  assert.equal(res.packages[0].requests, 10000);
  assert.equal(res.packages[0].per1kCents, 90);
  assert.equal(res.packages[0].basePer1kCents, 100);
  assert.equal(res.packages[0].recommended, true);
});

test('webUnblocker.quote forwards requests + subscription', async () => {
  const { fn, calls } = makeFetch([
    { status: 200, body: { product: 'web_unblocker', requests: 5000, unit: 'request', price_cents: 500, per_1k_cents: 100, currency: 'USD' } },
  ]);
  const client = new Eveses({ apiKey: 'k', baseUrl: 'https://x.test', fetch: fn });
  const q = await client.webUnblocker.quote({ requests: 5000, subscription: true });

  const url = new URL(calls[0].url);
  assert.equal(url.pathname, '/api/account/web-unblocker/quote');
  assert.equal(url.searchParams.get('requests'), '5000');
  assert.equal(url.searchParams.get('subscription'), 'true');
  assert.equal(q.requests, 5000);
  assert.equal(q.per1kCents, 100);
  assert.equal(q.unit, 'request');
});

test('webUnblocker.purchase posts body, sends Idempotency-Key, maps 201', async () => {
  const { fn, calls } = makeFetch([
    { status: 201, body: { uuid: 'wo-2', product: 'web_unblocker', requests: 10000, status: 'active', price_cents: 900, currency: 'USD', created_at: '2026-06-24T00:00:00+00:00' } },
  ]);
  const client = new Eveses({ apiKey: 'sk', baseUrl: 'https://api.example.test', fetch: fn });
  const order = await client.webUnblocker.purchase({ requests: 10000, subscription: false, idempotencyKey: 'idem-wu' });

  assert.equal(calls[0].url, 'https://api.example.test/api/account/web-unblocker/purchase');
  assert.equal(calls[0].init.method, 'POST');
  assert.equal((calls[0].init.headers as Record<string, string>)['Idempotency-Key'], 'idem-wu');
  assert.deepEqual(JSON.parse(String(calls[0].init.body)), { requests: 10000, subscription: false });
  assert.equal(order.uuid, 'wo-2');
  assert.equal(order.requests, 10000);
  assert.equal(order.priceCents, 900);
});

test('webUnblocker.resumeSubscription posts to /subscription/resume', async () => {
  const { fn, calls } = makeFetch([
    { status: 200, body: { status: 'active', requests: 10000, discount_pct: 10, next_renews_at: '2026-08-01T00:00:00+00:00', renew_failures: 0 } },
  ]);
  const client = new Eveses({ apiKey: 'k', baseUrl: 'https://x.test', fetch: fn });
  const sub = await client.webUnblocker.resumeSubscription();
  assert.equal(calls[0].url, 'https://x.test/api/account/web-unblocker/subscription/resume');
  assert.equal(calls[0].init.method, 'POST');
  assert.equal(sub.status, 'active');
  assert.equal(sub.requests, 10000);
});
