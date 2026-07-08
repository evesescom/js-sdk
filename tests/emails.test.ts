/**
 * Tests for client.emails.* — list / domains / quote / purchase / get / delete.
 * Same fake-fetch style as client.test.ts; flat envelope.
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

test('emails.list maps the rented addresses array', async () => {
  const { fn, calls } = makeFetch([
    {
      status: 200,
      body: {
        emails: [
          { uuid: 'em-1', address: 'a@x.io', domain: 'x.io', site: null, status: 'active', price_cents: 30, currency: 'USD', message_count: 0, expires_at: '2026-07-24T00:00:00+00:00', created_at: '2026-06-24T00:00:00+00:00' },
        ],
      },
    },
  ]);
  const client = new Eveses({ apiKey: 'k', baseUrl: 'https://api.example.test', fetch: fn });
  const emails = await client.emails.list();

  assert.equal(calls[0].url, 'https://api.example.test/api/account/emails');
  assert.equal(emails.length, 1);
  assert.equal(emails[0].uuid, 'em-1');
  assert.equal(emails[0].address, 'a@x.io');
  assert.equal(emails[0].priceCents, 30);
  assert.equal(emails[0].messageCount, 0);
  assert.deepEqual(emails[0].messages, []);
});

test('emails.domains forwards site and maps domains + currency', async () => {
  const { fn, calls } = makeFetch([
    {
      status: 200,
      body: { domains: [{ provider: 'catchall', domain: 'x.io', price_cents: 30, available: true }], currency: 'USD' },
    },
  ]);
  const client = new Eveses({ apiKey: 'k', baseUrl: 'https://x.test', fetch: fn });
  const res = await client.emails.domains({ site: 'shop.com' });

  const url = new URL(calls[0].url);
  assert.equal(url.pathname, '/api/account/emails/domains');
  assert.equal(url.searchParams.get('site'), 'shop.com');
  assert.equal(res.domains[0].domain, 'x.io');
  assert.equal(res.domains[0].priceCents, 30);
  assert.equal(res.domains[0].available, true);
  assert.equal(res.currency, 'USD');
});

test('emails.quote forwards domain/site/provider', async () => {
  const { fn, calls } = makeFetch([
    { status: 200, body: { domain: 'x.io', provider: 'catchall', price_cents: 30, currency: 'USD' } },
  ]);
  const client = new Eveses({ apiKey: 'k', baseUrl: 'https://x.test', fetch: fn });
  const q = await client.emails.quote({ domain: 'x.io', site: 'shop.com', provider: 'catchall' });

  const url = new URL(calls[0].url);
  assert.equal(url.searchParams.get('domain'), 'x.io');
  assert.equal(url.searchParams.get('site'), 'shop.com');
  assert.equal(url.searchParams.get('provider'), 'catchall');
  assert.equal(q.priceCents, 30);
  assert.equal(q.provider, 'catchall');
});

test('emails.purchase posts body, sends Idempotency-Key, maps 201', async () => {
  const { fn, calls } = makeFetch([
    { status: 201, body: { uuid: 'em-2', address: 'b@x.io', domain: 'x.io', site: null, status: 'active', price_cents: 30, currency: 'USD', message_count: 0, expires_at: null, created_at: '2026-06-24T00:00:00+00:00' } },
  ]);
  const client = new Eveses({ apiKey: 'sk', baseUrl: 'https://api.example.test', fetch: fn });
  const order = await client.emails.purchase({ domain: 'x.io', provider: 'catchall', idempotencyKey: 'idem-em' });

  assert.equal(calls[0].url, 'https://api.example.test/api/account/emails/purchase');
  assert.equal(calls[0].init.method, 'POST');
  assert.equal((calls[0].init.headers as Record<string, string>)['Idempotency-Key'], 'idem-em');
  assert.deepEqual(JSON.parse(String(calls[0].init.body)), { domain: 'x.io', provider: 'catchall' });
  assert.equal(order.uuid, 'em-2');
  assert.equal(order.address, 'b@x.io');
});

test('emails.get fetches /{uuid} and maps messages (inbox refresh)', async () => {
  const { fn, calls } = makeFetch([
    {
      status: 200,
      body: {
        uuid: 'em-1',
        address: 'a@x.io',
        domain: 'x.io',
        site: null,
        status: 'received',
        price_cents: 30,
        currency: 'USD',
        message_count: 1,
        expires_at: null,
        created_at: '2026-06-24T00:00:00+00:00',
        messages: [
          { from: 'no-reply@svc.com', subject: 'Your code', body: '123456', received_at: '2026-06-24T10:00:00+00:00' },
        ],
      },
    },
  ]);
  const client = new Eveses({ apiKey: 'k', baseUrl: 'https://x.test', fetch: fn });
  const order = await client.emails.get('em-1');

  assert.equal(calls[0].url, 'https://x.test/api/account/emails/em-1');
  assert.equal(calls[0].init.method, 'GET');
  assert.equal(order.messageCount, 1);
  assert.equal(order.messages.length, 1);
  assert.equal(order.messages[0].subject, 'Your code');
  assert.equal(order.messages[0].from, 'no-reply@svc.com');
  assert.equal(order.messages[0].receivedAt, '2026-06-24T10:00:00+00:00');
});

test('emails.delete DELETEs /{uuid} and returns cancelled address', async () => {
  const { fn, calls } = makeFetch([
    { status: 200, body: { uuid: 'em-1', address: 'a@x.io', domain: 'x.io', site: null, status: 'cancelled', price_cents: 30, currency: 'USD', message_count: 0, expires_at: null, created_at: '2026-06-24T00:00:00+00:00' } },
  ]);
  const client = new Eveses({ apiKey: 'k', baseUrl: 'https://x.test', fetch: fn });
  const order = await client.emails.delete('em-1');

  assert.equal(calls[0].url, 'https://x.test/api/account/emails/em-1');
  assert.equal(calls[0].init.method, 'DELETE');
  assert.equal(order.status, 'cancelled');
});
