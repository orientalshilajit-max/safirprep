-- service_pricing_rules
-- Tiered pricing per service type.  Cascade-delete when service type is removed.
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

drop trigger if exists trg_service_pricing_rules_updated_at on public.service_pricing_rules;
create trigger trg_service_pricing_rules_updated_at
  before update on public.service_pricing_rules
  for each row execute function public.set_updated_at();

alter table public.service_pricing_rules enable row level security;

create policy "admin full access on service_pricing_rules"
  on public.service_pricing_rules
  for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Authenticated users (clients) can read to display pricing
create policy "authenticated read service_pricing_rules"
  on public.service_pricing_rules
  for select
  to authenticated
  using (true);
