-- Seed Safir Logistics service types and pricing rules.
-- Idempotent and non-destructive for clients, products, invoices, and requests.

alter table public.service_types
  add column if not exists description text,
  add column if not exists unit text;

create table if not exists public.service_pricing_rules (
  id              uuid          default gen_random_uuid() primary key,
  service_type_id uuid          not null references public.service_types(id) on delete cascade,
  min_qty         integer       not null check (min_qty >= 0),
  max_qty         integer       check (max_qty is null or max_qty >= min_qty),
  price_per_unit  numeric(10,2) not null check (price_per_unit >= 0),
  label           text,
  sort_order      integer       not null default 0,
  created_at      timestamptz   not null default now(),
  updated_at      timestamptz   not null default now()
);

create index if not exists service_pricing_rules_service_type_id_idx
  on public.service_pricing_rules (service_type_id);

alter table public.service_pricing_rules enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'service_pricing_rules'
      and policyname = 'admin full access on service_pricing_rules'
  ) then
    create policy "admin full access on service_pricing_rules"
      on public.service_pricing_rules
      for all
      to authenticated
      using (public.is_admin())
      with check (public.is_admin());
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'service_pricing_rules'
      and policyname = 'authenticated read service_pricing_rules'
  ) then
    create policy "authenticated read service_pricing_rules"
      on public.service_pricing_rules
      for select
      to authenticated
      using (true);
  end if;
end $$;

do $$
declare
  fba_ready_id uuid;
  fba_fnsku_id uuid;
  bundle_id uuid;
  bundle_additional_id uuid;
  bubble_wrap_id uuid;
  fbm_id uuid;
  ltl_id uuid;
  forwarding_box_id uuid;
  forwarding_pallet_id uuid;
  storage_pallet_id uuid;
  storage_shelf_id uuid;
  additional_id uuid;
  container_id uuid;
  oversize_id uuid;
  overweight_id uuid;
begin
  insert into public.service_types (name, description, unit, price, visible_to_customers, is_active, sort_order)
  values
    ('FBA Ready', 'Receiving, Visual Inspection, Carton Labeling, Shipping Preparation', 'unit', 0.60, true, true, 10),
    ('FBA + FNSKU Labeling', 'All FBA Ready Services + FNSKU Label Printing & Application', 'unit', 0.70, true, true, 20),
    ('Bundle / Set up to 4 units', null, 'set', 1.50, true, true, 30),
    ('Additional item in bundle/set', null, 'additional unit', 0.50, true, true, 40),
    ('Bubble Wrapping', 'Starting at $0.50 per unit / bundle / set; manual/add-on service', 'unit / bundle / set', 0.50, true, true, 50),
    ('FBM Fulfillment', 'Receiving, Pick & Pack, Shipping Label Application, Order Processing, Carrier Handoff. Orders received before 1:00 PM PST may qualify for same-day processing.', 'order', 1.75, true, true, 60),
    ('LTL Pallet Preparation', null, 'pallet', 40.00, true, true, 70),
    ('Forwarding & Removal Orders - Box', null, 'box', 7.00, true, true, 80),
    ('Forwarding & Removal Orders - Pallet', null, 'pallet', 35.00, true, true, 90),
    ('Monthly Storage - Pallet 48"x40"x72"', 'Charged for inventory stored longer than 14 days', 'month', 30.00, true, true, 100),
    ('Monthly Storage - Shelf 48"x24"x16"', 'Charged for inventory stored longer than 14 days', 'month', 13.00, true, true, 110),
    ('Additional Services', 'One-hour minimum', 'hour', 50.00, true, true, 120),
    ('Container Unloading Palletized', 'Manual quote service with typical starting prices', 'container / trailer', 0.00, true, true, 130),
    ('Oversize / Overweight Fees - Oversize', 'Oversize item over 20 inches on any side: service fees x2', 'item', 0.00, true, true, 140),
    ('Oversize / Overweight Fees - Overweight', 'Overweight item over 15 lbs: service fees x2', 'item', 0.00, true, true, 150)
  on conflict (name) do update
  set
    description = excluded.description,
    unit = excluded.unit,
    price = excluded.price,
    visible_to_customers = excluded.visible_to_customers,
    is_active = excluded.is_active,
    sort_order = excluded.sort_order;

  select id into fba_ready_id from public.service_types where name = 'FBA Ready';
  select id into fba_fnsku_id from public.service_types where name = 'FBA + FNSKU Labeling';
  select id into bundle_id from public.service_types where name = 'Bundle / Set up to 4 units';
  select id into bundle_additional_id from public.service_types where name = 'Additional item in bundle/set';
  select id into bubble_wrap_id from public.service_types where name = 'Bubble Wrapping';
  select id into fbm_id from public.service_types where name = 'FBM Fulfillment';
  select id into ltl_id from public.service_types where name = 'LTL Pallet Preparation';
  select id into forwarding_box_id from public.service_types where name = 'Forwarding & Removal Orders - Box';
  select id into forwarding_pallet_id from public.service_types where name = 'Forwarding & Removal Orders - Pallet';
  select id into storage_pallet_id from public.service_types where name = 'Monthly Storage - Pallet 48"x40"x72"';
  select id into storage_shelf_id from public.service_types where name = 'Monthly Storage - Shelf 48"x24"x16"';
  select id into additional_id from public.service_types where name = 'Additional Services';
  select id into container_id from public.service_types where name = 'Container Unloading Palletized';
  select id into oversize_id from public.service_types where name = 'Oversize / Overweight Fees - Oversize';
  select id into overweight_id from public.service_types where name = 'Oversize / Overweight Fees - Overweight';

  drop table if exists pg_temp.safir_seed_pricing_rules;

  create temporary table safir_seed_pricing_rules (
    service_type_id uuid not null,
    min_qty integer not null,
    max_qty integer,
    price_per_unit numeric(10,2) not null,
    label text,
    sort_order integer not null
  ) on commit drop;

  insert into safir_seed_pricing_rules (service_type_id, min_qty, max_qty, price_per_unit, label, sort_order)
  values
    (fba_ready_id, 1, 20, 1.80, '1-20 units', 10),
    (fba_ready_id, 21, 50, 1.10, '21-50 units', 20),
    (fba_ready_id, 51, 100, 0.95, '51-100 units', 30),
    (fba_ready_id, 101, 500, 0.80, '101-500 units', 40),
    (fba_ready_id, 501, 1000, 0.70, '501-1000 units', 50),
    (fba_ready_id, 1001, null, 0.60, '1001+ units', 60),

    (fba_fnsku_id, 1, 20, 2.10, '1-20 units', 10),
    (fba_fnsku_id, 21, 50, 1.35, '21-50 units', 20),
    (fba_fnsku_id, 51, 100, 1.20, '51-100 units', 30),
    (fba_fnsku_id, 101, 500, 1.00, '101-500 units', 40),
    (fba_fnsku_id, 501, 1000, 0.85, '501-1000 units', 50),
    (fba_fnsku_id, 1001, null, 0.70, '1001+ units', 60),

    (bundle_id, 1, 20, 3.00, '1-20 sets', 10),
    (bundle_id, 21, 100, 2.00, '21-100 sets', 20),
    (bundle_id, 101, 500, 1.50, '101-500 sets', 30),
    (bundle_id, 501, null, 0.00, '501+ sets - Manual quote / Contact Us', 40),

    (bundle_additional_id, 1, null, 0.50, '$0.50 per additional unit', 10),
    (bubble_wrap_id, 1, null, 0.50, 'Starting at $0.50 per unit / bundle / set; manual add-on', 10),

    (fbm_id, 1, 50, 2.50, '1-50 monthly orders', 10),
    (fbm_id, 51, 200, 2.25, '51-200 monthly orders', 20),
    (fbm_id, 201, 500, 2.00, '201-500 monthly orders', 30),
    (fbm_id, 501, null, 1.75, '501+ monthly orders', 40),

    (ltl_id, 1, null, 40.00, '$40.00 per pallet', 10),
    (forwarding_box_id, 1, null, 7.00, '$7.00 per box', 10),
    (forwarding_pallet_id, 1, null, 35.00, '$35.00 per pallet', 10),
    (storage_pallet_id, 1, null, 30.00, 'Pallet 48"x40"x72" - monthly storage after 14 days', 10),
    (storage_shelf_id, 1, null, 13.00, 'Shelf 48"x24"x16" - monthly storage after 14 days', 10),
    (additional_id, 1, null, 50.00, '$50.00/hour - one-hour minimum', 10),

    (container_id, 1, 1, 600.00, '20 ft container - starting price / manual quote', 10),
    (container_id, 2, 2, 900.00, '40 ft container - starting price / manual quote', 20),
    (container_id, 3, 3, 1100.00, '53 ft trailer - starting price / manual quote', 30),

    (oversize_id, 1, null, 0.00, 'Over 20 inches on any side - service fees x2', 10),
    (overweight_id, 1, null, 0.00, 'Over 15 lbs - service fees x2', 10);

  update public.service_pricing_rules existing
  set
    price_per_unit = seed.price_per_unit,
    sort_order = seed.sort_order
  from safir_seed_pricing_rules seed
  where existing.service_type_id = seed.service_type_id
    and existing.min_qty = seed.min_qty
    and existing.max_qty is not distinct from seed.max_qty
    and existing.label is not distinct from seed.label;

  insert into public.service_pricing_rules (
    service_type_id, min_qty, max_qty, price_per_unit, label, sort_order
  )
  select
    seed.service_type_id,
    seed.min_qty,
    seed.max_qty,
    seed.price_per_unit,
    seed.label,
    seed.sort_order
  from safir_seed_pricing_rules seed
  where not exists (
    select 1
    from public.service_pricing_rules existing
    where existing.service_type_id = seed.service_type_id
      and existing.min_qty = seed.min_qty
      and existing.max_qty is not distinct from seed.max_qty
      and existing.label is not distinct from seed.label
  );
end $$;
