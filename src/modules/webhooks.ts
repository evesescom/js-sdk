import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Webhook signature verification.
 *
 * Eveses signs every webhook delivery with HMAC-SHA256 over `${timestamp}.${body}`,
 * using the endpoint's signing secret. Two headers carry the proof:
 *   - X-Eveses-Signature  → "sha256=<hex>"
 *   - X-Eveses-Timestamp  → unix seconds (string)
 *
 * `verify` accepts either:
 *   1. The `X-Eveses-Signature` header value plus the `X-Eveses-Timestamp` value
 *      (recommended — `verify(rawBody, signatureHeader, secret, { timestamp })`)
 *   2. The signature header alone, in which case the timestamp must be embedded
 *      in the body (some legacy delivery formats). For the current Eveses
 *      payload shape this means you SHOULD pass `timestamp` explicitly.
 *
 * Constant-time comparison via Node's `timingSafeEqual`.
 */
export class Webhooks {
  /**
   * Verify a webhook payload.
   *
   * @param rawBody          The raw request body string (NOT the parsed JSON).
   * @param signatureHeader  Value of `X-Eveses-Signature`, e.g. "sha256=abc123…".
   * @param secret           The endpoint signing secret.
   * @param opts             Options object — `timestamp` is the value of
   *                         `X-Eveses-Timestamp`. Optional `toleranceSeconds`
   *                         (default 300) bounds how far the timestamp may
   *                         drift from "now".
   *
   * @returns `true` if the signature is valid and within tolerance, else `false`.
   */
  static verify(
    rawBody: string,
    signatureHeader: string | null | undefined,
    secret: string,
    opts: { timestamp?: string | number; toleranceSeconds?: number } = {},
  ): boolean {
    if (!signatureHeader || !secret) return false;
    if (typeof rawBody !== 'string') return false;

    const expectedHex = stripPrefix(signatureHeader);
    if (!expectedHex || !/^[a-f0-9]+$/i.test(expectedHex)) return false;

    const tsRaw = opts.timestamp;
    if (tsRaw === undefined || tsRaw === null || tsRaw === '') return false;
    const ts = Number(tsRaw);
    if (!Number.isFinite(ts) || ts <= 0) return false;

    const tolerance = opts.toleranceSeconds ?? 300;
    if (tolerance > 0) {
      const now = Math.floor(Date.now() / 1000);
      if (Math.abs(now - ts) > tolerance) return false;
    }

    const computed = createHmac('sha256', secret).update(`${ts}.${rawBody}`).digest('hex');
    return safeCompareHex(computed, expectedHex);
  }
}

function stripPrefix(value: string): string {
  const trimmed = value.trim();
  return trimmed.startsWith('sha256=') ? trimmed.slice('sha256='.length) : trimmed;
}

function safeCompareHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  try {
    const aBuf = Buffer.from(a, 'hex');
    const bBuf = Buffer.from(b, 'hex');
    if (aBuf.length !== bBuf.length || aBuf.length === 0) return false;
    return timingSafeEqual(aBuf, bBuf);
  } catch {
    return false;
  }
}
