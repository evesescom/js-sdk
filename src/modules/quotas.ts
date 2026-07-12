import type { Eveses } from '../client';
import type { Quotas } from '../types';

/**
 * Quotas namespace — remaining prepaid balances (trial credits, metered
 * proxy/webunblocker allowances). Only products with a decrementing counter
 * appear; a key is omitted when the user has none.
 *
 *   - GET /api/v1/quotas
 */
export class QuotasModule {
  constructor(private readonly client: Eveses) {}

  /** Fetch all remaining prepaid balances. */
  async all(): Promise<Quotas> {
    const res = await this.client.request<Record<string, unknown>>({
      method: 'GET',
      path: '/api/v1/quotas',
    });
    return {
      trial: mapEntries(res.trial),
      proxy: mapEntries(res.proxy),
      webunblocker: mapEntries(res.webunblocker),
      raw: res,
    };
  }
}

function mapEntries(value: unknown): Quotas['trial'] {
  if (!Array.isArray(value)) return undefined;
  return (value as Record<string, unknown>[]).map((r) => ({
    service: typeof r.service === 'string' ? r.service : undefined,
    provider: typeof r.provider === 'string' ? r.provider : undefined,
    unit: typeof r.unit === 'string' ? r.unit : undefined,
    remaining: typeof r.remaining === 'number' ? r.remaining : undefined,
    total: typeof r.total === 'number' ? r.total : undefined,
    used: typeof r.used === 'number' ? r.used : undefined,
    expiresAt: typeof r.expires_at === 'string' ? r.expires_at : undefined,
    raw: r,
  }));
}
