/**
 * Tests for client.proxies.* — list / packages / catalog / quote / purchase /
 * subscription / extend / auto-renew.
 *
 * Same fake-fetch style as client.test.ts; never touches the network. The
 * proxy endpoints return FLAT JSON (no `{data:...}` envelope).
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

test('proxies.list maps residential access, subscription and orders (flat envelope)', async () => {
  const { fn, calls } = makeFetch([
    {
      status: 200,
      body: {
        residential: {
          host: 'proxy.eveses.com',
          ports: { http: 12321, socks5: 32325 },
          username: 'u1',
          password: 'p1',
          example: 'proxy.eveses.com:12321:u1:p1',
          curl: 'curl ...',
          traffic_gb_available: 4.5,
          traffic_gb_used: 0.5,
        },
        subscription: {
          status: 'active',
          gb: 10,
          discount_pct: 15,
          next_renews_at: '2026-07-01T00:00:00+00:00',
          renew_failures: 0,
        },
        orders: [
          {
            uuid: 'ord-1',
            type: 'residential',
            kind: 'residential',
            gb: 5,
            quantity: 1,
            location: null,
            status: 'active',
            price_cents: 700,
            currency: 'USD',
            proxies: null,
            auto_extend: false,
            extendable: false,
            expires_at: null,
            created_at: '2026-06-01T00:00:00+00:00',
          },
        ],
      },
    },
  ]);
  const client = new Eveses({ apiKey: 'k', baseUrl: 'https://api.example.test', fetch: fn });

  const res = await client.proxies.list();
  assert.equal(calls[0].url, 'https://api.example.test/api/account/proxies');
  assert.equal(calls[0].init.method, 'GET');
  assert.equal((calls[0].init.headers as Record<string, string>).Authorization, 'Bearer k');

  assert.ok(res.residential);
  assert.equal(res.residential.host, 'proxy.eveses.com');
  assert.equal(res.residential.ports.http, 12321);
  assert.equal(res.residential.trafficGbAvailable, 4.5);
  assert.ok(res.subscription);
  assert.equal(res.subscription.gb, 10);
  assert.equal(res.subscription.discountPct, 15);
  assert.equal(res.orders.length, 1);
  assert.equal(res.orders[0].uuid, 'ord-1');
  assert.equal(res.orders[0].priceCents, 700);
});

test('proxies.packages maps residential package ladder', async () => {
  const { fn, calls } = makeFetch([
    {
      status: 200,
      body: { packages: [{ gb: 1, per_gb_cents: 150, recommended: true }], currency: 'USD' },
    },
  ]);
  const client = new Eveses({ apiKey: 'k', baseUrl: 'https://x.test', fetch: fn });
  const res = await client.proxies.packages();
  assert.equal(calls[0].url, 'https://x.test/api/account/proxies/packages');
  assert.equal(res.packages[0].gb, 1);
  assert.equal(res.packages[0].perGbCents, 150);
  assert.equal(res.packages[0].recommended, true);
  assert.equal(res.currency, 'USD');
});

test('proxies.quote (residential) forwards gb + subscription', async () => {
  const { fn, calls } = makeFetch([
    { status: 200, body: { type: 'residential', gb: 5, price_cents: 700, currency: 'USD', per_gb_cents: 140, discount_pct: 0 } },
  ]);
  const client = new Eveses({ apiKey: 'k', baseUrl: 'https://x.test', fetch: fn });
  const q = await client.proxies.quote({ type: 'residential', gb: 5, subscription: true });

  const url = new URL(calls[0].url);
  assert.equal(url.pathname, '/api/account/proxies/quote');
  assert.equal(url.searchParams.get('type'), 'residential');
  assert.equal(url.searchParams.get('gb'), '5');
  assert.equal(url.searchParams.get('subscription'), 'true');
  assert.equal(q.priceCents, 700);
  assert.equal(q.perGbCents, 140);
  assert.equal(q.raw.type, 'residential');
});

test('proxies.quote (static) forwards product/plan/location/quantity', async () => {
  const { fn, calls } = makeFetch([
    { status: 200, body: { type: 'isp', quantity: 2, price_cents: 400, currency: 'USD' } },
  ]);
  const client = new Eveses({ apiKey: 'k', baseUrl: 'https://x.test', fetch: fn });
  const q = await client.proxies.quote({ type: 'isp', productId: 7, planId: 3, locationId: 9, quantity: 2 });

  const url = new URL(calls[0].url);
  assert.equal(url.searchParams.get('type'), 'isp');
  assert.equal(url.searchParams.get('product_id'), '7');
  assert.equal(url.searchParams.get('plan_id'), '3');
  assert.equal(url.searchParams.get('location_id'), '9');
  assert.equal(url.searchParams.get('quantity'), '2');
  assert.equal(q.quantity, 2);
  assert.equal(q.priceCents, 400);
});

test('proxies.purchase (residential) posts body, sends Idempotency-Key, maps 201', async () => {
  const { fn, calls } = makeFetch([
    {
      status: 201,
      body: {
        uuid: 'ord-2',
        type: 'residential',
        kind: 'residential',
        gb: 5,
        quantity: 1,
        location: null,
        status: 'active',
        price_cents: 700,
        currency: 'USD',
        proxies: null,
        auto_extend: false,
        extendable: false,
        expires_at: null,
        created_at: '2026-06-24T00:00:00+00:00',
      },
    },
  ]);
  const client = new Eveses({ apiKey: 'sk', baseUrl: 'https://api.example.test', fetch: fn });
  const order = await client.proxies.purchase({ type: 'residential', gb: 5, subscription: true, idempotencyKey: 'idem-p' });

  assert.equal(calls[0].url, 'https://api.example.test/api/account/proxies/purchase');
  assert.equal(calls[0].init.method, 'POST');
  const headers = calls[0].init.headers as Record<string, string>;
  assert.equal(headers['Idempotency-Key'], 'idem-p');
  assert.deepEqual(JSON.parse(String(calls[0].init.body)), { type: 'residential', gb: 5, subscription: true });
  assert.equal(order.uuid, 'ord-2');
  assert.equal(order.gb, 5);
  assert.equal(order.priceCents, 700);
});

test('proxies.purchase (static) posts snake_case selection body', async () => {
  const { fn, calls } = makeFetch([
    {
      status: 201,
      body: { uuid: 'ord-3', type: 'isp', kind: 'static', gb: null, quantity: 2, status: 'active', price_cents: 400, currency: 'USD', proxies: [], auto_extend: false, extendable: true },
    },
  ]);
  const client = new Eveses({ apiKey: 'k', baseUrl: 'https://x.test', fetch: fn });
  const order = await client.proxies.purchase({
    type: 'isp',
    productId: 7,
    planId: 3,
    locationId: 9,
    locationName: 'US',
    quantity: 2,
    idempotencyKey: 'idem-s',
  });

  assert.deepEqual(JSON.parse(String(calls[0].init.body)), {
    type: 'isp',
    product_id: 7,
    plan_id: 3,
    location_id: 9,
    location_name: 'US',
    quantity: 2,
  });
  assert.equal(order.uuid, 'ord-3');
  assert.equal(order.gb, null);
  assert.equal(order.extendable, true);
});

test('proxies.autoRenew posts { enabled } to /{uuid}/auto-renew and maps order', async () => {
  const { fn, calls } = makeFetch([
    { status: 200, body: { uuid: 'ord-3', type: 'isp', kind: 'static', gb: null, quantity: 1, status: 'active', price_cents: 200, currency: 'USD', proxies: [], auto_extend: true, extendable: true } },
  ]);
  const client = new Eveses({ apiKey: 'k', baseUrl: 'https://x.test', fetch: fn });
  const order = await client.proxies.autoRenew('ord-3', true);

  assert.equal(calls[0].url, 'https://x.test/api/account/proxies/ord-3/auto-renew');
  assert.equal(calls[0].init.method, 'POST');
  assert.deepEqual(JSON.parse(String(calls[0].init.body)), { enabled: true });
  assert.equal(order.autoExtend, true);
});

test('proxies.extend posts { days } to /{uuid}/extend', async () => {
  const { fn, calls } = makeFetch([
    { status: 200, body: { uuid: 'ord-3', type: 'isp', kind: 'static', gb: null, quantity: 1, status: 'active', price_cents: 200, currency: 'USD', proxies: [], auto_extend: false, extendable: true } },
  ]);
  const client = new Eveses({ apiKey: 'k', baseUrl: 'https://x.test', fetch: fn });
  const order = await client.proxies.extend('ord-3', { days: 30 });

  assert.equal(calls[0].url, 'https://x.test/api/account/proxies/ord-3/extend');
  assert.deepEqual(JSON.parse(String(calls[0].init.body)), { days: 30 });
  assert.equal(order.uuid, 'ord-3');
});

test('proxies.resetSessions posts to /sessions/reset', async () => {
  const { fn, calls } = makeFetch([{ status: 200, body: { reset: true } }]);
  const client = new Eveses({ apiKey: 'k', baseUrl: 'https://x.test', fetch: fn });
  await client.proxies.resetSessions();
  assert.equal(calls[0].url, 'https://x.test/api/account/proxies/sessions/reset');
  assert.equal(calls[0].init.method, 'POST');
});

test('proxies.cancelSubscription posts to /subscription/cancel', async () => {
  const { fn, calls } = makeFetch([
    { status: 200, body: { status: 'cancelled', gb: 10, discount_pct: 15, next_renews_at: null, renew_failures: 0 } },
  ]);
  const client = new Eveses({ apiKey: 'k', baseUrl: 'https://x.test', fetch: fn });
  const sub = await client.proxies.cancelSubscription();
  assert.equal(calls[0].url, 'https://x.test/api/account/proxies/subscription/cancel');
  assert.equal(calls[0].init.method, 'POST');
  assert.equal(sub.status, 'cancelled');
});
