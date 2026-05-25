import type { Eveses } from '../client';
import type { WalletBalance } from '../types';

/**
 * Wallet namespace.
 *
 * Hits `/api/account/wallet`. There is no `/api/v1/wallet` in the current
 * spec — see the package README for the v1-vs-account-scoped route gap.
 */
export class Wallet {
  constructor(private readonly client: Eveses) {}

  /** Snapshot of total balance, currently held, and available (balance - held). */
  async balance(): Promise<WalletBalance> {
    const res = await this.client.request<{ data: Record<string, unknown> }>({
      method: 'GET',
      path: '/api/account/wallet',
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
