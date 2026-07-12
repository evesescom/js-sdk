/**
 * Tests for the proxy module. Injects a fake fetch (no network).
 */

import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { Eveses } from '../src/client';

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

test('proxy.purchase (residential) posts gb + subscription and Idempotency-Key', async () => {
  const { fn, calls } = makeFetch([
    {
      status: 201,
      body: { uuid: 'px_abc', type: 'residential', kind: 'metered', gb: 10, status: 'active', price_cents: 900, auto_extend: false, extendable: false },
    },
  ]);

  const client = new Eveses({ apiKey: 'k', baseUrl: 'https://x.test', fetch: fn });
  const order = await client.proxy.purchase({ type: 'residential', gb: 10, subscription: true, idempotencyKey: 'idem-px' });

  assert.equal(calls[0].url, 'https://x.test/api/v1/proxy/orders');
  assert.equal(calls[0].init.method, 'POST');
  assert.deepEqual(JSON.parse(String(calls[0].init.body)), { type: 'residential', gb: 10, subscription: true });
  const headers = calls[0].init.headers as Record<string, string>;
  assert.equal(headers['Idempotency-Key'], 'idem-px');

  assert.equal(order.uuid, 'px_abc');
  assert.equal(order.status, 'active');
  assert.equal(order.priceCents, 900);
  assert.equal(order.currency, 'USD');
  assert.equal(order.gb, 10);
  assert.equal(order.raw?.kind, 'metered');
});

test('proxy.purchase (static) posts the selection', async () => {
  const { fn, calls } = makeFetch([
    { status: 201, body: { uuid: 'px_isp', type: 'isp', status: 'active', price_cents: 300 } },
  ]);
  const client = new Eveses({ apiKey: 'k', baseUrl: 'https://x.test', fetch: fn });
  await client.proxy.purchase({
    type: 'isp',
    selection: { productId: 9, planId: 4, locationId: 51, locationName: 'Australia', quantity: 3 },
  });
  assert.deepEqual(JSON.parse(String(calls[0].init.body)), {
    type: 'isp',
    product_id: 9,
    plan_id: 4,
    location_id: 51,
    location_name: 'Australia',
    quantity: 3,
  });
});

test('proxy.quote (residential) builds the query string', async () => {
  const { fn, calls } = makeFetch([{ status: 200, body: { price_cents: 900, gb: 10, currency: 'USD' } }]);
  const client = new Eveses({ apiKey: 'k', baseUrl: 'https://x.test', fetch: fn });
  const quote = await client.proxy.quote({ type: 'residential', gb: 10, subscription: true });

  const url = new URL(calls[0].url);
  assert.equal(url.pathname, '/api/v1/proxy/quote');
  assert.equal(url.searchParams.get('type'), 'residential');
  assert.equal(url.searchParams.get('gb'), '10');
  assert.equal(url.searchParams.get('subscription'), 'true');
  assert.equal(quote.price_cents, 900);
});

test('proxy.list maps residential, subscription, and orders', async () => {
  const { fn, calls } = makeFetch([
    {
      status: 200,
      body: {
        residential: { host: 'proxy.eveses.com', username: 'u', password: 'p', traffic_gb_available: 5, traffic_gb_used: 1 },
        subscription: { status: 'active', gb: 10, discount_pct: 15, renew_failures: 0 },
        orders: [{ uuid: 'px_1', type: 'isp', status: 'active', price_cents: 300 }],
      },
    },
  ]);
  const client = new Eveses({ apiKey: 'k', baseUrl: 'https://x.test', fetch: fn });
  const list = await client.proxy.list();

  assert.equal(calls[0].url, 'https://x.test/api/v1/proxy/orders');
  assert.equal(list.residential?.username, 'u');
  assert.equal(list.subscription?.status, 'active');
  assert.equal(list.subscription?.discountPct, 15);
  assert.equal(list.orders.length, 1);
  assert.equal(list.orders[0].uuid, 'px_1');
});

test('proxy.extend and proxy.autoRenew hit the order sub-routes', async () => {
  const { fn, calls } = makeFetch([
    { status: 200, body: { uuid: 'px_1', type: 'isp', status: 'active', price_cents: 300 } },
    { status: 200, body: { uuid: 'px_1', type: 'isp', status: 'active', price_cents: 300, auto_extend: true } },
  ]);
  const client = new Eveses({ apiKey: 'k', baseUrl: 'https://x.test', fetch: fn });

  await client.proxy.extend('px_1', 30);
  assert.equal(calls[0].url, 'https://x.test/api/v1/proxy/orders/px_1/extend');
  assert.deepEqual(JSON.parse(String(calls[0].init.body)), { days: 30 });

  const order = await client.proxy.autoRenew('px_1', true);
  assert.equal(calls[1].url, 'https://x.test/api/v1/proxy/orders/px_1/auto-renew');
  assert.deepEqual(JSON.parse(String(calls[1].init.body)), { enabled: true });
  assert.equal(order.autoExtend, true);
});

test('proxy.subscriptionPause posts to the subscription route', async () => {
  const { fn, calls } = makeFetch([{ status: 200, body: { status: 'paused', gb: 10, discount_pct: 15 } }]);
  const client = new Eveses({ apiKey: 'k', baseUrl: 'https://x.test', fetch: fn });
  const sub = await client.proxy.subscriptionPause();
  assert.equal(calls[0].url, 'https://x.test/api/v1/proxy/subscription/pause');
  assert.equal(calls[0].init.method, 'POST');
  assert.equal(sub.status, 'paused');
});
