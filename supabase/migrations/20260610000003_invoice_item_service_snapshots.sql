-- Ensure invoice line items can keep service snapshots independently of service_types.
-- Non-destructive: existing invoice rows and totals are preserved.

alter table public.invoice_items
  add column if not exists service_type_id uuid,
  add column if not exists service_name text,
  add column if not exists service_unit text;

update public.invoice_items ii
set service_type_id = null
where service_type_id is not null
  and not exists (
    select 1
    from public.service_types st
    where st.id = ii.service_type_id
  );

alter table public.invoice_items
  drop constraint if exists invoice_items_service_type_id_fkey;

alter table public.invoice_items
  add constraint invoice_items_service_type_id_fkey
  foreign key (service_type_id) references public.service_types(id) on delete set null;
