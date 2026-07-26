# Partner finance canonical model

Status: B5 implementation decision. This document does not migrate or remove legacy data.

## Canonical truth

- `public.invoices` is the canonical invoice header.
- `public.invoice_lines` is the canonical invoice-line source.
- A payment is commissionable only when the canonical invoice is `paid`, has `paid_at`, has a matching provider payment ID and originates from an accepted canonical quote.
- Commission basis V1 is the actually received canonical invoice subtotal (excluding VAT), represented as integer euro cents.
- `public.partner_payment_events` records the trusted payment fact once.
- `public.partner_commission_ledger_entries` is the immutable commission ledger.

## Explicitly legacy

`public.customer_invoices` and code paths that use it are legacy. B5 adds no foreign key, read, write, trigger, webhook dependency or commission calculation against that table. Existing legacy data and behavior are preserved pending a separately approved finance cutover.

## Commission behavior

The default plan is progressive: the first €2,000 at 20%, the next €3,000 at 25%, the next €5,000 at 30%, and the remainder at 35%. Each paid sale receives only the incremental commission caused by that sale within its Europe/Amsterdam calendar month. Refunds and chargebacks create a separate negative ledger entry; original entries are never edited.

The recording operation is idempotent on provider + provider payment ID. Test/demo invoices, unpaid invoices, mismatched payments, unaccepted quotes and invalid lead attributions fail closed.

## Integration boundary

The trusted server reconciliation endpoint is ready for a canonical payment producer. The current production Mollie flow still writes legacy `customer_invoices`; B5 intentionally does not make legacy payments commissionable or silently migrate that flow. Connecting the canonical producer requires the separately controlled finance cutover and webhook validation.
