/**
 * Tests for the captcha module. Injects a fake fetch (no network).
 */

import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { Eveses } from '../src/client';
import { EvesesError } from '../src/errors';

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

test('captcha.solve polls until ready and returns the solution', async () => {
  const { fn, calls } = makeFetch([
    { status: 201, body: { task_id: 7, status: 'queued', price_micro_usd: 3392, retry_after: 0 } },
    { status: 200, body: { status: 'processing', retry_after: 0 } },
    { status: 200, body: { status: 'ready', solution: 'TOK', retry_after: 0 } },
  ]);

  const client = new Eveses({ apiKey: 'k', baseUrl: 'https://x.test', fetch: fn });
  const res = await client.captcha.solve('RecaptchaV2TaskProxyless', { websiteURL: 'x', websiteKey: 'k' });

  assert.equal(res.taskId, 7);
  assert.equal(res.status, 'ready');
  assert.equal(res.solution, 'TOK');
  assert.equal(res.priceMicroUsd, 3392);

  assert.equal(calls[0].url, 'https://x.test/api/v1/captcha/solve');
  assert.equal(calls[0].init.method, 'POST');
  assert.deepEqual(JSON.parse(String(calls[0].init.body)), {
    type: 'RecaptchaV2TaskProxyless',
    params: { websiteURL: 'x', websiteKey: 'k' },
  });
  assert.equal(calls[1].url, 'https://x.test/api/v1/captcha/result/7');
});

test('captcha.solve throws on a failed task', async () => {
  const { fn } = makeFetch([
    { status: 201, body: { task_id: 9, status: 'queued', retry_after: 0 } },
    { status: 200, body: { status: 'failed', error: 'ERROR_CAPTCHA_UNSOLVABLE', retry_after: 0 } },
  ]);
  const client = new Eveses({ apiKey: 'k', baseUrl: 'https://x.test', fetch: fn });
  await assert.rejects(
    client.captcha.solve('ImageToTextTask', {}),
    (err: unknown) => {
      assert.ok(err instanceof EvesesError);
      assert.match((err as EvesesError).message, /ERROR_CAPTCHA_UNSOLVABLE/);
      return true;
    },
  );
});

test('captcha.solve sends the Idempotency-Key header', async () => {
  const { fn, calls } = makeFetch([
    { status: 201, body: { task_id: 3, status: 'ready', solution: 'A', retry_after: 0 } },
  ]);
  const client = new Eveses({ apiKey: 'k', baseUrl: 'https://x.test', fetch: fn });
  const res = await client.captcha.solve('ImageToTextTask', {}, { idempotencyKey: 'idem-c' });
  assert.equal(res.solution, 'A');
  const headers = calls[0].init.headers as Record<string, string>;
  assert.equal(headers['Idempotency-Key'], 'idem-c');
});
