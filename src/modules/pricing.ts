import type { Eveses } from '../client';

/**
 * Pricing namespace — every product's prices in one call.
 *
 *   - GET /api/v1/pricing   consolidated price list across all products
 *
 * The response carries a top-level `currency` plus per-product blocks
 * (`numbers`, `proxy`, `webunblocker`, `emails`, `captcha`). The shape varies
 * per product, so this returns the raw payload; use the per-service pricing
 * methods (`client.numbers.pricing()`, `client.proxy.pricing()`, …) for typed
 * per-product access.
 */
export class Pricing {
  constructor(private readonly client: Eveses) {}

  /** Consolidated price list across all products. */
  async all(): Promise<Record<string, unknown>> {
    return this.client.request({ method: 'GET', path: '/api/v1/pricing' });
  }
}
