import type { Eveses } from '../client';
import type { WalletBalance } from '../types';

/**
 * Wallet namespace. Hits the versioned endpoint `/api/v1/wallet`.
 */
export class Wallet {
  constructor(private readonly client: Eveses) {}

  /** Snapshot of total balance, currently held, and available (balance - held). */
  async balance(): Promise<WalletBalance> {
    const res = await this.client.request<{ data: Record<string, unknown> }>({
      method: 'GET',
      path: '/api/v1/wallet',
    });
    const d = res.data ?? {};
    return {
      balance: numberOr(d.balance, 0),
      heldBalance: numberOr(d.held_balance, 0),
      availableBalance: numberOr(d.available_balance, 0),
      currency: typeof d.currency === 'string' ? d.currency : 'USD',
    };
  }
}

function numberOr(value: unknown, fallback: number): number {
  return typeof value === 'number' ? value : fallback;
}
