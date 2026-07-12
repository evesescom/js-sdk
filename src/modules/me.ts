import type { Eveses } from '../client';
import type { Me } from '../types';

/**
 * Me namespace — the authenticated account. The v1 payload now also carries
 * `abilities` (what THIS token can do) and `features` (which product entry
 * points to show).
 *
 *   - GET /api/v1/me
 */
export class MeModule {
  constructor(private readonly client: Eveses) {}

  /** Fetch the authenticated account, including `abilities` + `features`. */
  async get(): Promise<Me> {
    const res = await this.client.request<{ data?: Record<string, unknown> } & Record<string, unknown>>({
      method: 'GET',
      path: '/api/v1/me',
    });
    const d = (res.data && typeof res.data === 'object' ? res.data : res) as Record<string, unknown>;
    return {
      id: typeof d.id === 'number' ? d.id : typeof d.id === 'string' ? d.id : undefined,
      email: typeof d.email === 'string' ? d.email : undefined,
      abilities: Array.isArray(d.abilities) ? (d.abilities as unknown[]).map(String) : [],
      features:
        d.features && typeof d.features === 'object'
          ? (d.features as Record<string, boolean>)
          : {},
      raw: d,
    };
  }
}
