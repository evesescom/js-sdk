import type { Eveses } from '../client';
import type { TrialServiceStatus, TrialStatus } from '../types';

/**
 * Trial namespace — check active trial state and subscribe to product trials.
 * Hits the versioned endpoints `/api/v1/trial/*`.
 */
export class Trial {
  constructor(private readonly client: Eveses) {}

  /** Fetch the user's current trial status across all services. */
  async status(): Promise<TrialStatus> {
    const res = await this.client.request<Record<string, unknown>>({
      method: 'GET',
      path: '/api/v1/trial',
    });
    const services = Array.isArray(res.services)
      ? (res.services as Record<string, unknown>[]).map(mapServiceStatus)
      : [];
    return { services, raw: res };
  }

  /**
   * Subscribe to one or more product trials.
   * Pass an array of service keys, e.g. `['web-unblocker', 'proxies']`.
   */
  async subscribe(services: string[]): Promise<TrialStatus> {
    const res = await this.client.request<Record<string, unknown>>({
      method: 'POST',
      path: '/api/v1/trial/subscribe',
      body: { services },
    });
    const mapped = Array.isArray(res.services)
      ? (res.services as Record<string, unknown>[]).map(mapServiceStatus)
      : [];
    return { services: mapped, raw: res };
  }
}

function mapServiceStatus(r: Record<string, unknown>): TrialServiceStatus {
  return {
    service: typeof r.service === 'string' ? r.service : '',
    active: r.active === true,
    expiresAt: typeof r.expires_at === 'string' ? r.expires_at : undefined,
  };
}

// Re-export the input types under the module for ergonomic imports.
export type { TrialServiceStatus, TrialStatus };
