/**
 * Tests for client.catalog.* — countries / services / pricing.
 *
 * Same fake-fetch style as client.test.ts; never touches the network.
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

test('catalog.countries hits /api/v1/numbers/countries with mode and maps the array', async () => {
  const { fn, calls } = makeFetch([
    { status: 200, body: { data: { mode: 'activation', countries: ['ua', 'pl', 'de'] } } },
  ]);
  const client = new Eveses({ apiKey: 'k', baseUrl: 'https://api.example.test', fetch: fn });

  const res = await client.catalog.countries();
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://api.example.test/api/v1/numbers/countries?mode=activation');
  assert.equal(calls[0].init.method, 'GET');
  const headers = calls[0].init.headers as Record<string, string>;
  assert.equal(headers.Authorization, 'Bearer k');
  assert.equal(res.mode, 'activation');
  assert.deepEqual(res.countries, ['ua', 'pl', 'de']);
});

test('catalog.countries forwards mode=rent', async () => {
  const { fn, calls } = makeFetch([
    { status: 200, body: { data: { mode: 'rent', countries: ['ua'] } } },
  ]);
  const client = new Eveses({ apiKey: 'k', baseUrl: 'https://x.test', fetch: fn });
  const res = await client.catalog.countries({ mode: 'rent' });
  assert.ok(calls[0].url.includes('mode=rent'));
  assert.equal(res.mode, 'rent');
});

test('catalog.services hits /api/v1/numbers/products and returns service codes', async () => {
  const { fn, calls } = makeFetch([
    { status: 200, body: { data: { mode: 'activation', products: ['telegram', 'wa'] } } },
  ]);
  const client = new Eveses({ apiKey: 'k', baseUrl: 'https://api.example.test', fetch: fn });
  const res = await client.catalog.services({ mode: 'activation', country: 'UA', currency: 'usd' });

  assert.equal(calls[0].url, 'https://api.example.test/api/v1/numbers/products?mode=activation');
  assert.deepEqual(res.services, ['telegram', 'wa']);
  // SDK normalises country/currency casing for round-trip echo.
  assert.equal(res.country, 'ua');
  assert.equal(res.currency, 'USD');
});

test('catalog.pricing requires country and service', async () => {
  const { fn } = makeFetch([]);
  const client = new Eveses({ apiKey: 'k', baseUrl: 'https://x.test', fetch: fn });
  // @ts-expect-error — exercising runtime guard
  await assert.rejects(client.catalog.pricing({ service: 'telegram' }), /country is required/);
  // @ts-expect-error — exercising runtime guard
  await assert.rejects(client.catalog.pricing({ country: 'ua' }), /service is required/);
});

test('catalog.pricing maps services -> durations and forwards filters', async () => {
  const { fn, calls } = makeFetch([
    {
      status: 200,
      body: {
        data: {
          mode: 'activation',
          country: 'ua',
          currency: 'USD',
          services: [
            {
              name: 'telegram',
              durations: [
                { duration_minutes: 0, price_cents: 50, price: 0.5, currency: 'USD', in_stock: true },
              ],
            },
          ],
        },
      },
    },
  ]);
  const client = new Eveses({ apiKey: 'k', baseUrl: 'https://api.example.test', fetch: fn });
  const res = await client.catalog.pricing({
    mode: 'activation',
    country: 'UA',
    service: 'telegram',
    currency: 'usd',
  });

  const url = new URL(calls[0].url);
  assert.equal(url.pathname, '/api/v1/numbers/pricing');
  assert.equal(url.searchParams.get('mode'), 'activation');
  assert.equal(url.searchParams.get('country'), 'ua');
  assert.equal(url.searchParams.get('product'), 'telegram');
  assert.equal(url.searchParams.get('currency'), 'USD');

  assert.equal(res.services.length, 1);
  assert.equal(res.services[0].name, 'telegram');
  assert.equal(res.services[0].durations[0].priceCents, 50);
  assert.equal(res.services[0].durations[0].available, true);
  assert.equal(res.currency, 'USD');
});
