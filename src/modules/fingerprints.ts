import type { Eveses } from '../client';
import type { Fingerprint, FingerprintParams } from '../types';

/**
 * Fingerprints namespace — resells 2captcha's Fingerprint API, billed
 * pay-per-use from the wallet (count-on-success). Unlike captcha-solving this
 * is synchronous: one request returns a complete fingerprint. Hits the
 * account-scoped endpoints `/api/account/fingerprints/*`.
 */
export class Fingerprints {
  constructor(private readonly client: Eveses) {}

  /** Generate a browser fingerprint from the given filter params. */
  async generate(params: FingerprintParams = {}): Promise<Fingerprint> {
    return this.request('/api/account/fingerprints/generate', params);
  }

  /** Fetch a random fingerprint, optionally narrowed by the given filter params. */
  async random(params: FingerprintParams = {}): Promise<Fingerprint> {
    return this.request('/api/account/fingerprints/random', params);
  }

  private async request(path: string, params: FingerprintParams): Promise<Fingerprint> {
    const res = await this.client.request<{
      fingerprint: Record<string, unknown>;
      price_micro_usd?: number;
    }>({ method: 'POST', path, body: params });

    return { fingerprint: res.fingerprint, priceMicroUsd: res.price_micro_usd };
  }
}
