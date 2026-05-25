import type { Eveses } from '../client';
import type {
  ActivationCreateRequest,
  Order,
  OrderSms,
  OrderSmsBundle,
} from '../types';

/**
 * Activations / orders namespace.
 *
 * Note: there is currently no dedicated `/api/v1/activations` route; v1 is a
 * thin wrapper around the account-scoped order endpoints for API-key consumers
 * (Sanctum tokens with kind=api_key). This module hits `/api/account/orders/*`.
 * If/when v1 ships, only the path constants below need to change.
 */
export class Activations {
  constructor(private readonly client: Eveses) {}

  /**
   * Create an order (activation by default; pass mode="rent" for rentals).
   *
   * Accepts an `idempotencyKey` which is sent both as the `Idempotency-Key`
   * HTTP header (preferred by the gateway) and in the JSON body (accepted by
   * the controller for non-HTTP transports).
   */
  async create(req: ActivationCreateRequest): Promise<Order> {
    const headers: Record<string, string> = {};
    if (req.idempotencyKey) {
      headers['Idempotency-Key'] = req.idempotencyKey;
    }

    const body: Record<string, unknown> = {
      mode: req.mode ?? 'activation',
      country: req.country,
      service: req.service,
    };
    if (req.durationMinutes !== undefined) body.duration_minutes = req.durationMinutes;
    if (req.idempotencyKey !== undefined) body.idempotency_key = req.idempotencyKey;
    if (req.maxPriceCents !== undefined) body.max_price_cents = req.maxPriceCents;

    const res = await this.client.request<{ data: Record<string, unknown> }>({
      method: 'POST',
      path: '/api/account/orders',
      body,
      headers,
    });
    return mapOrder(res.data);
  }

  /** Get a single order. */
  async get(orderId: string): Promise<Order> {
    const res = await this.client.request<{ data: Record<string, unknown> }>({
      method: 'GET',
      path: `/api/account/orders/${encodeURIComponent(orderId)}`,
    });
    return mapOrder(res.data);
  }

  /** Cancel an order (releases number, refunds where the upstream supports it). */
  async cancel(orderId: string): Promise<Order> {
    const res = await this.client.request<{ data: Record<string, unknown> }>({
      method: 'POST',
      path: `/api/account/orders/${encodeURIComponent(orderId)}/cancel`,
    });
    return mapOrder(res.data);
  }

  /** Mark order as finished (after consuming the SMS). */
  async finish(orderId: string): Promise<Order> {
    const res = await this.client.request<{ data: Record<string, unknown> }>({
      method: 'POST',
      path: `/api/account/orders/${encodeURIComponent(orderId)}/finish`,
    });
    return mapOrder(res.data);
  }

  /**
   * Fetch SMS for an order — combines stored (delivered via webhook) with
   * fresh (pulled from the upstream provider on demand).
   */
  async sms(orderId: string): Promise<OrderSmsBundle> {
    const res = await this.client.request<{ data: Record<string, unknown> }>({
      method: 'GET',
      path: `/api/account/orders/${encodeURIComponent(orderId)}/sms`,
    });
    const data = (res.data ?? {}) as Record<string, unknown>;
    return {
      orderId: String(data.order_id ?? orderId),
      stored: mapSmsList(data.stored),
      fresh: mapSmsList(data.fresh),
    };
  }
}

function mapOrder(data: Record<string, unknown> | undefined): Order {
  const d = data ?? {};
  return {
    orderId: String(d.order_id ?? ''),
    status: (d.status as Order['status']) ?? 'pending',
    phone: typeof d.phone === 'string' ? d.phone : undefined,
    country: typeof d.country === 'string' ? d.country : undefined,
    service: typeof d.service === 'string' ? d.service : undefined,
    mode: (d.mode as Order['mode']) ?? undefined,
    priceCents: typeof d.price_cents === 'number' ? d.price_cents : undefined,
    expiresAt: typeof d.expires_at === 'string' ? d.expires_at : undefined,
    createdAt: typeof d.created_at === 'string' ? d.created_at : undefined,
    raw: d,
  };
}

function mapSmsList(value: unknown): OrderSms[] {
  if (!Array.isArray(value)) return [];
  return value.map((m) => {
    const r = (m ?? {}) as Record<string, unknown>;
    return {
      id: typeof r.id === 'number' ? r.id : 0,
      text: typeof r.text === 'string' ? r.text : '',
      sender: typeof r.sender === 'string' ? r.sender : undefined,
      receivedAt: typeof r.received_at === 'string' ? r.received_at : undefined,
    };
  });
}
