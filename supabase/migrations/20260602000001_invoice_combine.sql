-- ── Invoice improvements ──────────────────────────────────────
-- Adds: combined status, combine tracking, product/service columns on line items

-- 1. New invoice status: 'combined'
alter type invoice_status add value if not exists 'combined';

-- 2. Track which combined invoice this invoice was merged into
alter table invoices
  add column if not exists combined_into_invoice_id uuid
    references invoices(id) on delete set null;

create index if not exists idx_invoices_combined
  on invoices(combined_into_invoice_id)
  where combined_into_invoice_id is not null;

-- 3. Structured line-item columns for product and service
alter table invoice_items
  add column if not exists product_name text,
  add column if not exists service_name text;
