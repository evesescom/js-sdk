/**
 * Tests for the marketplace module. Injects a fake fetch (no network).
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

test('marketplace.catalog sends only provided filters and maps groupBy → group_by', async () => {
  const { fn, calls } = makeFetch([{ status: 200, body: { groups: [] } }]);
  const client = new Eveses({ apiKey: 'k', baseUrl: 'https://x.test', fetch: fn });
  await client.marketplace.catalog({ category: 'telegram', country: 'US', twofa: true, groupBy: 'attributes' });

  const url = new URL(calls[0].url);
  assert.equal(url.pathname, '/api/public/marketplace/catalog');
  assert.equal(url.searchParams.get('category'), 'telegram');
  assert.equal(url.searchParams.get('country'), 'US');
  assert.equal(url.searchParams.get('twofa'), 'true');
  assert.equal(url.searchParams.get('group_by'), 'attributes');
  // origin/format omitted when not provided
  assert.equal(url.searchParams.has('origin'), false);
  assert.equal(url.searchParams.has('format'), false);
});

test('marketplace.catalog with no opts sends a bare request', async () => {
  const { fn, calls } = makeFetch([{ status: 200, body: { items: [] } }]);
  const client = new Eveses({ apiKey: 'k', baseUrl: 'https://x.test', fetch: fn });
  await client.marketplace.catalog();
  const url = new URL(calls[0].url);
  assert.equal(url.pathname, '/api/public/marketplace/catalog');
  assert.equal([...url.searchParams.keys()].length, 0);
});

test('marketplace.categories + filters hit the public endpoints', async () => {
  const { fn, calls } = makeFetch([
    { status: 200, body: { categories: [] } },
    { status: 200, body: { filters: [] } },
  ]);
  const client = new Eveses({ apiKey: 'k', baseUrl: 'https://x.test', fetch: fn });
  await client.marketplace.categories();
  assert.equal(new URL(calls[0].url).pathname, '/api/public/marketplace/categories');

  await client.marketplace.filters('telegram');
  const u = new URL(calls[1].url);
  assert.equal(u.pathname, '/api/public/marketplace/filters');
  assert.equal(u.searchParams.get('category'), 'telegram');
});

test('marketplace.quote posts category + sku', async () => {
  const { fn, calls } = makeFetch([{ status: 200, body: { price_cents: 500 } }]);
  const client = new Eveses({ apiKey: 'k', baseUrl: 'https://x.test', fetch: fn });
  await client.marketplace.quote({ category: 'telegram', sku: 'tg_us_autoreg' });
  assert.equal(new URL(calls[0].url).pathname, '/api/v1/marketplace/quote');
  assert.equal(calls[0].init.method, 'POST');
  assert.deepEqual(JSON.parse(String(calls[0].init.body)), { category: 'telegram', sku: 'tg_us_autoreg' });
});

test('marketplace.buy posts body + Idempotency-Key header', async () => {
  const { fn, calls } = makeFetch([{ status: 201, body: { uuid: 'mk_1' } }]);
  const client = new Eveses({ apiKey: 'k', baseUrl: 'https://x.test', fetch: fn });
  await client.marketplace.buy(
    { category: 'telegram', sku: 'tg_us_autoreg', quantity: 2, inputs: { note: 'x' } },
    { idempotencyKey: 'idem-mk' },
  );
  assert.equal(new URL(calls[0].url).pathname, '/api/v1/marketplace/buy');
  assert.equal(calls[0].init.method, 'POST');
  assert.deepEqual(JSON.parse(String(calls[0].init.body)), {
    category: 'telegram',
    sku: 'tg_us_autoreg',
    quantity: 2,
    inputs: { note: 'x' },
  });
  const headers = calls[0].init.headers as Record<string, string>;
  assert.equal(headers['Idempotency-Key'], 'idem-mk');
});

test('marketplace.orders / order / reveal hit the v1 routes', async () => {
  const { fn, calls } = makeFetch([
    { status: 200, body: { orders: [] } },
    { status: 200, body: { uuid: 'mk_1' } },
    { status: 200, body: { secret: 's' } },
  ]);
  const client = new Eveses({ apiKey: 'k', baseUrl: 'https://x.test', fetch: fn });

  await client.marketplace.orders();
  assert.equal(new URL(calls[0].url).pathname, '/api/v1/marketplace/orders');

  await client.marketplace.order('mk_1');
  assert.equal(new URL(calls[1].url).pathname, '/api/v1/marketplace/orders/mk_1');

  await client.marketplace.reveal('mk_1');
  assert.equal(new URL(calls[2].url).pathname, '/api/v1/marketplace/orders/mk_1/reveal');
  assert.equal(calls[2].init.method, 'POST');
});

test('proxy.locationsDetail builds the detail query', async () => {
  const { fn, calls } = makeFetch([{ status: 200, body: { type: 'residential', country: 'US', geo: {} } }]);
  const client = new Eveses({ apiKey: 'k', baseUrl: 'https://x.test', fetch: fn });
  await client.proxy.locationsDetail('US');
  const url = new URL(calls[0].url);
  assert.equal(url.pathname, '/api/v1/proxy/locations/detail');
  assert.equal(url.searchParams.get('type'), 'residential');
  assert.equal(url.searchParams.get('country'), 'US');
});
