import type { Eveses } from '../client';

/**
 * Billing namespace. Hits `/api/v1/billing`.
 *
 * Two documents share the word "invoice" and read in opposite directions, so
 * they are two methods rather than one with a flag:
 *
 * - {@link Billing.issueInvoice} asks the customer to pay. It carries a payment
 *   reference and a due date.
 * - {@link Billing.invoiceForDeposit} records a top-up that already settled. It
 *   comes back marked paid, with no due date and nothing to act on.
 *
 * Handing somebody the first when they wanted the second reads as an attempt to
 * charge them twice.
 *
 * Nothing can be issued until {@link Billing.saveProfile} has run. The details
 * are frozen onto each document at issue time, so editing the profile later
 * never rewrites a document already in somebody's books.
 */
export interface BillingProfile {
  kind: string;
  legalName: string;
  country: string;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  postalCode?: string;
  taxId?: string;
  vatNumber?: string;
  emailForInvoices?: string;
}

export interface InvoiceLine {
  description: string;
  quantity: number;
  unitPriceCents: number;
  amountCents: number;
}

export interface Invoice {
  uuid: string;
  number: string;
  status: string;
  amountCents: number;
  totalCents: number;
  currency: string;
  issuedAt?: string;
  /** Absent on a receipt: nothing is due on money already received. */
  dueAt?: string;
  paidAt?: string;
  paymentReference?: string;
  billTo: Record<string, unknown>;
  seller: Record<string, unknown>;
  lines: InvoiceLine[];
}

export class Billing {
  constructor(private readonly client: Eveses) {}

  /** Who we bill. `null` when nothing has been set yet. */
  async profile(): Promise<BillingProfile | null> {
    const d = unwrap(await this.client.request<unknown>({ method: 'GET', path: '/api/v1/billing/profile' }));
    return d.legal_name ? toProfile(d) : null;
  }

  /**
   * Set or update the invoicing details. Do it once.
   *
   * Only the fields you pass are changed, so correcting a postcode does not
   * blank a tax number you did not mention.
   */
  async saveProfile(fields: Partial<BillingProfile>): Promise<BillingProfile> {
    const body: Record<string, unknown> = {};
    const map: Record<keyof BillingProfile, string> = {
      kind: 'kind',
      legalName: 'legal_name',
      country: 'country',
      addressLine1: 'address_line1',
      addressLine2: 'address_line2',
      city: 'city',
      postalCode: 'postal_code',
      taxId: 'tax_id',
      vatNumber: 'vat_number',
      emailForInvoices: 'email_for_invoices',
    };
    for (const [key, wire] of Object.entries(map) as [keyof BillingProfile, string][]) {
      const value = fields[key];
      if (value !== undefined && value !== null && value !== '') body[wire] = value;
    }

    return toProfile(unwrap(await this.client.request<unknown>({
      method: 'PUT', path: '/api/v1/billing/profile', body,
    })));
  }

  /** Invoices issued to this account, newest first. */
  async invoices(): Promise<Invoice[]> {
    const d = unwrap(await this.client.request<unknown>({ method: 'GET', path: '/api/v1/billing/invoices' }));
    const rows = Array.isArray(d.invoices) ? d.invoices : [];
    return rows.map((r) => toInvoice(r as Record<string, unknown>));
  }

  /** One invoice in full, including the frozen seller and bill-to. */
  async invoice(uuid: string): Promise<Invoice> {
    return toInvoice(unwrap(await this.client.request<unknown>({
      method: 'GET', path: `/api/v1/billing/invoices/${encodeURIComponent(uuid)}`,
    })));
  }

  /**
   * An invoice to PAY, for money you are about to send. $10 to $10,000.
   *
   * You get a payment reference; quote it when paying and the amount lands on
   * your balance.
   */
  async issueInvoice(amountCents: number, opts: { currency?: string; note?: string } = {}): Promise<Invoice> {
    return toInvoice(unwrap(await this.client.request<unknown>({
      method: 'POST',
      path: '/api/v1/billing/invoices',
      body: {
        amount_cents: amountCents,
        currency: opts.currency ?? 'USD',
        purpose: 'wallet_topup',
        ...(opts.note ? { note: opts.note } : {}),
      },
    })));
  }

  /**
   * A receipt for a top-up that already settled.
   *
   * Comes back marked paid, with no due date. Shows what actually left your
   * account — a $10.00 top-up charged at $10.20 is invoiced as $10.20 with the
   * card fee itemised, so it reconciles against a card statement rather than
   * against your balance.
   *
   * Idempotent: asking twice returns the same document, not a second invoice
   * number for one payment.
   */
  async invoiceForDeposit(depositUuid: string): Promise<Invoice> {
    return toInvoice(unwrap(await this.client.request<unknown>({
      method: 'POST', path: `/api/v1/billing/deposits/${encodeURIComponent(depositUuid)}/invoice`,
    })));
  }

  /**
   * Cancel an unpaid invoice.
   *
   * The number stays with it — freeing one for reuse is the gap an audit asks
   * about.
   */
  async cancelInvoice(uuid: string): Promise<Invoice> {
    return toInvoice(unwrap(await this.client.request<unknown>({
      method: 'POST', path: `/api/v1/billing/invoices/${encodeURIComponent(uuid)}/cancel`,
    })));
  }

  /** The invoice as a PDF, ready to file. */
  async invoicePdf(uuid: string): Promise<Uint8Array> {
    return this.client.request<Uint8Array>({
      method: 'GET',
      path: `/api/v1/billing/invoices/${encodeURIComponent(uuid)}/pdf`,
      headers: { Accept: 'application/pdf' },
      raw: true,
    });
  }
}

function unwrap(payload: unknown): Record<string, unknown> {
  if (payload && typeof payload === 'object') {
    const p = payload as Record<string, unknown>;
    if (p.data && typeof p.data === 'object') return p.data as Record<string, unknown>;
    return p;
  }
  return {};
}

function str(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function int(value: unknown, fallback = 0): number {
  return typeof value === 'number' ? value : fallback;
}

function toProfile(d: Record<string, unknown>): BillingProfile {
  return {
    kind: str(d.kind, 'business'),
    legalName: str(d.legal_name),
    country: str(d.country),
    addressLine1: d.address_line1 as string | undefined,
    addressLine2: d.address_line2 as string | undefined,
    city: d.city as string | undefined,
    postalCode: d.postal_code as string | undefined,
    taxId: d.tax_id as string | undefined,
    vatNumber: d.vat_number as string | undefined,
    emailForInvoices: d.email_for_invoices as string | undefined,
  };
}

function toInvoice(d: Record<string, unknown>): Invoice {
  const lines: InvoiceLine[] = Array.isArray(d.lines)
    ? (d.lines as Record<string, unknown>[]).map((l) => ({
        description: str(l.description),
        quantity: int(l.quantity, 1),
        unitPriceCents: int(l.unit_price_cents, int(l.amount_cents)),
        amountCents: int(l.amount_cents),
      }))
    : [];

  const tax = (d.tax && typeof d.tax === 'object' ? d.tax : {}) as Record<string, unknown>;
  const payment = (d.payment && typeof d.payment === 'object' ? d.payment : {}) as Record<string, unknown>;

  return {
    uuid: str(d.uuid),
    number: str(d.number),
    status: str(d.status),
    amountCents: int(d.amount_cents),
    totalCents: int(d.total_cents, int(d.amount_cents) + int(tax.amount_cents)),
    currency: str(d.currency, 'USD'),
    issuedAt: d.issued_at as string | undefined,
    dueAt: (d.due_at ?? undefined) as string | undefined,
    paidAt: d.paid_at as string | undefined,
    paymentReference: (payment.reference ?? d.payment_reference) as string | undefined,
    billTo: (d.bill_to && typeof d.bill_to === 'object' ? d.bill_to : {}) as Record<string, unknown>,
    seller: (d.seller && typeof d.seller === 'object' ? d.seller : {}) as Record<string, unknown>,
    lines,
  };
}
