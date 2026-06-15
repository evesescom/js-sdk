/**
 * webhook-server.ts — Minimal stdlib HTTP server that verifies Eveses webhooks.
 *
 * Run me
 * ------
 *   cd sdk/js
 *   npm install
 *   export EVESES_WEBHOOK_SECRET=whsec_xxx   # from your endpoint settings
 *   export PORT=8787                          # optional
 *   # Type-check:   npx tsc --noEmit -p examples/tsconfig.json
 *   # Run via tsx:  npx tsx examples/webhook-server.ts
 *   # Point Eveses at  http://localhost:8787/eveses/webhook
 *   # (use ngrok / cloudflared in real life — Eveses needs a public URL.)
 *
 * What it does
 * ------------
 * - Listens on POST /eveses/webhook
 * - Buffers the RAW request body BEFORE any JSON parsing (signature is
 *   over raw bytes — JSON.parse + JSON.stringify would reorder keys and
 *   invalidate the HMAC).
 * - Calls `Webhooks.verify` with X-Eveses-Signature + X-Eveses-Timestamp.
 *   Default tolerance is 300s — older deliveries are rejected (replay
 *   protection).
 * - Returns 200 on success, 401 on bad signature, 400 on malformed body.
 *
 * Uses Node's built-in `http` module so there are no dependencies beyond
 * the SDK itself. Swap `http.createServer` for an Express handler if you
 * want middleware — `Webhooks.verify` doesn't care where the bytes come
 * from, only that you give it the EXACT bytes the server signed.
 *
 * Gotchas
 * -------
 * - Express's `bodyParser.json()` discards the raw bytes. Use
 *   `express.raw({ type: 'application/json' })` instead, or save the raw
 *   buffer in a `verify` callback before parsing.
 * - `Webhooks.verify` returns false for ANY failure (missing header, bad
 *   hex, expired timestamp). That's not an error — it just means "not a
 *   valid Eveses delivery".
 * - Replay-protection window is 300s. Don't widen it unless your handler
 *   is idempotent and you have a very good reason.
 * - Respond within ~10s. Enqueue heavy work and ACK fast.
 */

import http from 'node:http';

import { Webhooks } from '../src/index';

const WEBHOOK_SECRET = process.env.EVESES_WEBHOOK_SECRET ?? 'whsec_placeholder';
const PORT = Number.parseInt(process.env.PORT ?? '8787', 10);
const PATH = '/eveses/webhook';

const server = http.createServer((req, res) => {
  if (req.method !== 'POST' || req.url !== PATH) {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'not_found' }));
    return;
  }

  // Stream the body into a single Buffer so we can hand the EXACT bytes
  // to Webhooks.verify. Don't switch to req.setEncoding('utf8'): some
  // multi-byte chars would split across chunks.
  const chunks: Buffer[] = [];
  req.on('data', (c) => chunks.push(c));
  req.on('end', () => {
    const rawBody = Buffer.concat(chunks).toString('utf8');

    // Node lowercases header names; we use the canonical casing for docs.
    const signature = (req.headers['x-eveses-signature'] as string | undefined) ?? null;
    const timestampHeader = req.headers['x-eveses-timestamp'];
    const timestamp = Array.isArray(timestampHeader) ? timestampHeader[0] : timestampHeader;

    const ok = Webhooks.verify(rawBody, signature, WEBHOOK_SECRET, {
      timestamp,
      toleranceSeconds: 300,
    });

    if (!ok) {
      // Don't leak which check failed — that's a signature-forgery oracle.
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'invalid_signature' }));
      return;
    }

    let payload: unknown;
    try {
      payload = rawBody ? JSON.parse(rawBody) : {};
    } catch {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'invalid_json' }));
      return;
    }

    const type =
      payload && typeof payload === 'object' && 'type' in payload
        ? (payload as { type?: unknown }).type
        : '?';
    console.log(`Received verified webhook: type=${String(type)}`);
    console.log(JSON.stringify(payload, null, 2));

    // ACK fast. Real handlers should enqueue the event and respond here.
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ received: true }));
  });
});

server.listen(PORT, () => {
  console.log(`Listening on http://0.0.0.0:${PORT}${PATH}`);
  console.log('Configure this URL on your Eveses webhook endpoint.');
});
