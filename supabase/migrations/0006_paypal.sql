-- 0006_paypal.sql
-- Additive PayPal/USD adapter migration (#21).
--
-- Contract: docs/payments/decision-record.md (§21 PayPal adapter, §9.3 provider
-- widening); shared TS contract: src/lib/payments/contract.ts.
--
-- The only schema change the second provider requires is widening the
-- `payments.provider` CHECK from the single approved adapter (`ecpay`) to also
-- accept `paypal`. `book_entitlement.provider` was already widened to a
-- provider-neutral set in 0003. No column adds, no drops, no data changes —
-- purely additive.

alter table public.payments
  drop constraint if exists payments_provider_check;

alter table public.payments
  add constraint payments_provider_check
  check (provider in ('ecpay', 'paypal'));

comment on table public.payments is
  'Payment attempts. provider is one of the approved adapters (ecpay, paypal); provider_merchant_ref is unique per provider; provider_payment_ref is unique per provider once known (partial unique index).';
