/**
 * Tests for the fingerprints module. Injects a fake fetch (no network).
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

test('fingerprints.generate returns the payload and price', async () => {
  const { fn, calls } = makeFetch([
    { status: 200, body: { fingerprint: { id: 'fp_1', userAgent: { value: 'UA' } }, price_micro_usd: 1600 } },
  ]);

  const client = new Eveses({ apiKey: 'k', baseUrl: 'https://x.test', fetch: fn });
  const res = await client.fingerprints.generate({ country: 'US' });

  assert.equal(res.fingerprint.id, 'fp_1');
  assert.equal(res.priceMicroUsd, 1600);

  assert.equal(calls[0].url, 'https://x.test/api/account/fingerprints/generate');
  assert.equal(calls[0].init.method, 'POST');
  assert.deepEqual(JSON.parse(String(calls[0].init.body)), { country: 'US' });
});

test('fingerprints.random hits the random endpoint', async () => {
  const { fn, calls } = makeFetch([
    { status: 200, body: { fingerprint: { id: 'fp_r' } } },
  ]);

  const client = new Eveses({ apiKey: 'k', baseUrl: 'https://x.test', fetch: fn });
  const res = await client.fingerprints.random({ tags: 'macOS' });

  assert.equal(res.fingerprint.id, 'fp_r');
  assert.equal(calls[0].url, 'https://x.test/api/account/fingerprints/random');
  assert.deepEqual(JSON.parse(String(calls[0].init.body)), { tags: 'macOS' });
});
