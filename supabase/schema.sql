-- ============================================================
-- Safir WMS – Database Schema
-- Source: extracted from app/*/actions.ts .from() calls
--
-- Run in Supabase SQL Editor (paste entire file, click Run).
-- Safe to re-run: IF NOT EXISTS / CREATE OR REPLACE throughout.
--
-- Rules applied:
--   • NO objects created in auth schema
--   • Policies use only auth.uid() and auth.jwt() (Supabase built-ins)
--   • Helper functions live in public schema only
-- ============================================================


-- ============================================================
-- EXTENSIONS
-- ============================================================

create extension if not exists "uuid-ossp";


-- ============================================================
-- ENUM TYPES
-- Each wrapped in a DO block so re-running is safe.
-- ============================================================

do $$ begin
  create type public.client_status as enum ('pending', 'active', 'inactive');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.login_status as enum ('no_login', 'invited', 'active');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.product_status as enum ('active', 'archived');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.shipment_status as enum (
    'in_transit', 'arrived', 'received', 'partially_received', 'need_attention'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.service_status as enum (
    'new', 'in_progress', 'completed', 'need_attention', 'invoiced', 'cancelled'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.invoice_status as enum ('unpaid', 'paid', 'overdue', 'void');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.file_category as enum (
    'agreements', 'labels', 'shipment_docs', 'product_docs', 'invoices', 'other'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.entity_type as enum (
    'client', 'product', 'shipment', 'service_request', 'invoice', 'file'
  );
exception when duplicate_object then null; end $$;


-- ============================================================
-- HELPER FUNCTIONS  (public schema only)
--
-- auth.jwt() and auth.uid() are Supabase built-ins — always
-- callable but not re-creatable.  We wrap them here so RLS
-- policies stay readable without touching the auth schema.
-- ============================================================

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin',
    false
  );
$$;

create or replace function public.current_client_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select nullif(
    (auth.jwt() -> 'app_metadata' ->> 'client_id'),
    ''
  )::uuid;
$$;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Atomic shipment-number counter.  Using a sequence avoids the
-- racy max+1 pattern that caused duplicate-key errors under
-- concurrent inserts.
create sequence if not exists public.shipment_number_seq
  start with 1009
  increment by 1
  no maxvalue
  cache 1;

create or replace function public.next_shipment_number()
returns text
language plpgsql
security definer
set search_path = public
as $$
begin
  return 'IN-' || nextval('public.shipment_number_seq')::text;
end;
$$;

grant execute on function public.next_shipment_number() to authenticated;


-- ============================================================
-- TABLES  (parent tables first)
-- Columns sourced from actual .insert() / .select() calls in
-- app/*/actions.ts — no speculative columns added.
-- ============================================================

-- ─────────────────────────────────────────────────────────────
-- clients
--   Used by: clients/actions.ts, products/actions.ts,
--            shipments, service-requests, invoices, files
-- ─────────────────────────────────────────────────────────────
create table if not exists public.clients (
  id            uuid         default gen_random_uuid() primary key,
  auth_user_id  uuid         references auth.users (id) on delete set null,
  company_name  text         not null,
  contact_name  text         not null,
  email         text         not null unique,
  phone         text,
  status        public.client_status  not null default 'pending',
  login_status  public.login_status   not null default 'no_login',
  notes         text,
  invited_at    timestamptz,
  created_at    timestamptz  not null default now(),
  updated_at    timestamptz  not null default now(),
  deleted_at    timestamptz
);

drop trigger if exists trg_clients_updated_at on public.clients;
create trigger trg_clients_updated_at
  before update on public.clients
  for each row execute function public.set_updated_at();


-- ─────────────────────────────────────────────────────────────
-- products
--   SELECT: id, client_id, name, sku, asin_upc, fnsku,
--           image_url, notes, status,
--           inventory(...), clients(company_name)
-- ─────────────────────────────────────────────────────────────
create table if not exists public.products (
  id          uuid                 default gen_random_uuid() primary key,
  client_id   uuid                 not null references public.clients (id) on delete cascade,
  name        text                 not null,
  sku         text                 not null,
  asin_upc    text,
  fnsku       text,
  image_url   text,
  notes       text,
  status      public.product_status not null default 'active',
  sort_order  integer              not null default 0,
  created_at  timestamptz          not null default now(),
  updated_at  timestamptz          not null default now(),
  deleted_at  timestamptz,
  unique (client_id, sku)
);

drop trigger if exists trg_products_updated_at on public.products;
create trigger trg_products_updated_at
  before update on public.products
  for each row execute function public.set_updated_at();


-- ─────────────────────────────────────────────────────────────
-- inventory
--   INSERT: client_id, product_id, available_units,
--           incoming_units, damaged_units
--   UPDATE: incoming_units | available_units | damaged_units
--   (one row per client × product)
-- ─────────────────────────────────────────────────────────────
create table if not exists public.inventory (
  id              uuid        default gen_random_uuid() primary key,
  client_id       uuid        not null references public.clients  (id) on delete cascade,
  product_id      uuid        not null references public.products (id) on delete cascade,
  available_units integer     not null default 0 check (available_units >= 0),
  incoming_units  integer     not null default 0 check (incoming_units  >= 0),
  damaged_units   integer     not null default 0 check (damaged_units   >= 0),
  received_units  integer     not null default 0 check (received_units  >= 0),
  shipped_units   integer     not null default 0 check (shipped_units   >= 0),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (client_id, product_id)
);

drop trigger if exists trg_inventory_updated_at on public.inventory;
create trigger trg_inventory_updated_at
  before update on public.inventory
  for each row execute function public.set_updated_at();


-- ─────────────────────────────────────────────────────────────
-- incoming_shipments
--   SELECT: id, client_id, shipment_number, status, notes,
--           inventory_synced, archived_at, created_at,
--           clients(company_name),
--           incoming_shipment_items(...), shipment_trackings(...)
-- ─────────────────────────────────────────────────────────────
create table if not exists public.incoming_shipments (
  id               uuid                    default gen_random_uuid() primary key,
  client_id        uuid                    not null references public.clients (id) on delete cascade,
  shipment_number  text                    not null unique,
  status           public.shipment_status  not null default 'in_transit',
  notes            text,
  inventory_synced boolean                 not null default false,
  archived_at      timestamptz,
  created_at       timestamptz             not null default now(),
  updated_at       timestamptz             not null default now(),
  deleted_at       timestamptz
);

drop trigger if exists trg_incoming_shipments_updated_at on public.incoming_shipments;
create trigger trg_incoming_shipments_updated_at
  before update on public.incoming_shipments
  for each row execute function public.set_updated_at();


-- ─────────────────────────────────────────────────────────────
-- incoming_shipment_items
--   INSERT: shipment_id, product_id, expected_units,
--           received_units, damaged_units, notes
-- ─────────────────────────────────────────────────────────────
create table if not exists public.incoming_shipment_items (
  id              uuid        default gen_random_uuid() primary key,
  shipment_id     uuid        not null references public.incoming_shipments (id) on delete cascade,
  product_id      uuid        not null references public.products           (id) on delete restrict,
  expected_units  integer     not null default 0 check (expected_units >= 0),
  received_units  integer     not null default 0 check (received_units >= 0),
  damaged_units   integer     not null default 0 check (damaged_units  >= 0),
  notes           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (shipment_id, product_id)
);

drop trigger if exists trg_shipment_items_updated_at on public.incoming_shipment_items;
create trigger trg_shipment_items_updated_at
  before update on public.incoming_shipment_items
  for each row execute function public.set_updated_at();


-- ─────────────────────────────────────────────────────────────
-- shipment_trackings
--   INSERT: shipment_id, carrier, tracking_number,
--           box_count, notes
-- ─────────────────────────────────────────────────────────────
create table if not exists public.shipment_trackings (
  id              uuid        default gen_random_uuid() primary key,
  shipment_id     uuid        not null references public.incoming_shipments (id) on delete cascade,
  carrier         text        not null,
  tracking_number text,
  box_count       integer     not null default 1 check (box_count >= 1),
  notes           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

drop trigger if exists trg_shipment_trackings_updated_at on public.shipment_trackings;
create trigger trg_shipment_trackings_updated_at
  before update on public.shipment_trackings
  for each row execute function public.set_updated_at();


-- ─────────────────────────────────────────────────────────────
-- service_requests
--   SELECT: id, client_id, request_number, service_type,
--           status, notes, inventory_deducted, service_details,
--           created_at, deleted_at,
--           clients(company_name), service_request_items(...)
-- ─────────────────────────────────────────────────────────────
create table if not exists public.service_requests (
  id                 uuid                   default gen_random_uuid() primary key,
  client_id          uuid                   not null references public.clients (id) on delete cascade,
  request_number     text                   not null unique,
  service_type       text                   not null,
  status             public.service_status  not null default 'new',
  notes              text,
  inventory_deducted boolean                not null default false,
  service_details    jsonb,
  created_at         timestamptz            not null default now(),
  updated_at         timestamptz            not null default now(),
  deleted_at         timestamptz
);

drop trigger if exists trg_service_requests_updated_at on public.service_requests;
create trigger trg_service_requests_updated_at
  before update on public.service_requests
  for each row execute function public.set_updated_at();


-- ─────────────────────────────────────────────────────────────
-- service_request_items
--   INSERT: request_id, product_id, quantity
-- ─────────────────────────────────────────────────────────────
create table if not exists public.service_request_items (
  id          uuid        default gen_random_uuid() primary key,
  request_id  uuid        not null references public.service_requests (id) on delete cascade,
  product_id  uuid        not null references public.products          (id) on delete restrict,
  quantity    integer     not null default 1 check (quantity > 0),
  notes       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

drop trigger if exists trg_service_request_items_updated_at on public.service_request_items;
create trigger trg_service_request_items_updated_at
  before update on public.service_request_items
  for each row execute function public.set_updated_at();


-- ─────────────────────────────────────────────────────────────
-- invoices
--   SELECT: id, client_id, request_id, invoice_number, status,
--           amount, due_date, notes, created_at,
--           clients(company_name, email),
--           invoice_items(id, description, quantity, unit_price),
--           service_requests(request_number)
-- ─────────────────────────────────────────────────────────────
create table if not exists public.invoices (
  id              uuid                   default gen_random_uuid() primary key,
  client_id       uuid                   not null references public.clients          (id) on delete cascade,
  request_id      uuid                   references public.service_requests (id) on delete set null,
  invoice_number  text                   not null unique,
  status          public.invoice_status  not null default 'unpaid',
  amount          numeric(12, 2)         not null default 0 check (amount >= 0),
  due_date        date,
  pdf_url         text,
  notes           text,
  created_at      timestamptz            not null default now(),
  updated_at      timestamptz            not null default now()
);

drop trigger if exists trg_invoices_updated_at on public.invoices;
create trigger trg_invoices_updated_at
  before update on public.invoices
  for each row execute function public.set_updated_at();


-- ─────────────────────────────────────────────────────────────
-- invoice_items
--   INSERT: invoice_id, description, quantity, unit_price
--   total is a generated column (read-only)
-- ─────────────────────────────────────────────────────────────
create table if not exists public.invoice_items (
  id          uuid           default gen_random_uuid() primary key,
  invoice_id  uuid           not null references public.invoices (id) on delete cascade,
  description text           not null,
  quantity    integer        not null default 1 check (quantity > 0),
  unit_price  numeric(12, 2) not null default 0 check (unit_price >= 0),
  total       numeric(12, 2) generated always as (quantity * unit_price) stored,
  created_at  timestamptz    not null default now()
);


-- ─────────────────────────────────────────────────────────────
-- files
--   SELECT: id, client_id, product_id, shipment_id,
--           request_id, invoice_id, category, file_name,
--           file_url, thumbnail_url, file_type,
--           file_size_bytes, uploaded_by, created_at
--   INSERT: same (minus thumbnail_url which is optional)
-- ─────────────────────────────────────────────────────────────
create table if not exists public.files (
  id              uuid                  default gen_random_uuid() primary key,
  client_id       uuid                  not null references public.clients           (id) on delete cascade,
  product_id      uuid                  references public.products                   (id) on delete set null,
  shipment_id     uuid                  references public.incoming_shipments         (id) on delete set null,
  request_id      uuid                  references public.service_requests           (id) on delete set null,
  invoice_id      uuid                  references public.invoices                   (id) on delete set null,
  category        public.file_category  not null default 'other',
  file_name       text                  not null,
  file_url        text                  not null,
  thumbnail_url   text,
  file_type       text,
  file_size_bytes bigint,
  uploaded_by     uuid                  references auth.users (id) on delete set null,
  created_at      timestamptz           not null default now(),
  deleted_at      timestamptz
);


-- ─────────────────────────────────────────────────────────────
-- activity_log
--   SELECT: id, message, action, entity_type, created_at
--   (append-only — no UPDATE or DELETE)
-- ─────────────────────────────────────────────────────────────
create table if not exists public.activity_log (
  id          uuid                default gen_random_uuid() primary key,
  client_id   uuid                references public.clients  (id) on delete set null,
  entity_type public.entity_type  not null,
  entity_id   uuid,
  action      text                not null,
  message     text                not null,
  created_by  uuid                references auth.users (id) on delete set null,
  created_at  timestamptz         not null default now()
);


-- ─────────────────────────────────────────────────────────────
-- carriers  (referenced in database.types.ts; settings page)
-- ─────────────────────────────────────────────────────────────
create table if not exists public.carriers (
  id         uuid        default gen_random_uuid() primary key,
  name       text        not null unique,
  is_active  boolean     not null default true,
  sort_order integer     not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_carriers_updated_at on public.carriers;
create trigger trg_carriers_updated_at
  before update on public.carriers
  for each row execute function public.set_updated_at();


-- ─────────────────────────────────────────────────────────────
-- service_types  (referenced in database.types.ts; settings page)
-- ─────────────────────────────────────────────────────────────
create table if not exists public.service_types (
  id         uuid        default gen_random_uuid() primary key,
  name       text        not null unique,
  is_active  boolean     not null default true,
  sort_order integer     not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_service_types_updated_at on public.service_types;
create trigger trg_service_types_updated_at
  before update on public.service_types
  for each row execute function public.set_updated_at();


-- ─────────────────────────────────────────────────────────────
-- company_settings  (singleton — referenced in database.types.ts)
-- ─────────────────────────────────────────────────────────────
create table if not exists public.company_settings (
  id                    uuid        default gen_random_uuid() primary key,
  company_name          text        not null default 'Safir Logistics',
  email                 text,
  phone                 text,
  address               text,
  website               text,
  logo_url              text,
  invoice_due_days      integer     not null default 14 check (invoice_due_days > 0),
  invoice_payment_notes text,
  invoice_default_notes text,
  invite_email_subject  text        not null default 'You''re invited to the Safir client portal',
  invite_email_body     text,
  updated_at            timestamptz not null default now()
);

drop trigger if exists trg_company_settings_updated_at on public.company_settings;
create trigger trg_company_settings_updated_at
  before update on public.company_settings
  for each row execute function public.set_updated_at();

-- Ensure exactly one row exists
insert into public.company_settings default values
  on conflict do nothing;


-- ============================================================
-- INDEXES
-- ============================================================

create index if not exists idx_clients_auth_user  on public.clients (auth_user_id);
create index if not exists idx_clients_email       on public.clients (email) where deleted_at is null;
create index if not exists idx_clients_status      on public.clients (status) where deleted_at is null;

create index if not exists idx_products_client     on public.products (client_id) where deleted_at is null;
create index if not exists idx_products_sku        on public.products (sku);

create index if not exists idx_inventory_product   on public.inventory (product_id);
create index if not exists idx_inventory_client    on public.inventory (client_id);

create index if not exists idx_shipments_client    on public.incoming_shipments (client_id) where deleted_at is null;
create index if not exists idx_shipments_status    on public.incoming_shipments (status) where deleted_at is null;

create index if not exists idx_ship_items_shipment on public.incoming_shipment_items (shipment_id);
create index if not exists idx_ship_items_product  on public.incoming_shipment_items (product_id);

create index if not exists idx_trackings_shipment  on public.shipment_trackings (shipment_id);

create index if not exists idx_requests_client     on public.service_requests (client_id) where deleted_at is null;
create index if not exists idx_requests_status     on public.service_requests (status) where deleted_at is null;

create index if not exists idx_req_items_request   on public.service_request_items (request_id);
create index if not exists idx_req_items_product   on public.service_request_items (product_id);

create index if not exists idx_invoices_client     on public.invoices (client_id);
create index if not exists idx_invoices_status     on public.invoices (status);

create index if not exists idx_inv_items_invoice   on public.invoice_items (invoice_id);

create index if not exists idx_files_client        on public.files (client_id) where deleted_at is null;
create index if not exists idx_files_shipment      on public.files (shipment_id) where deleted_at is null;
create index if not exists idx_files_request       on public.files (request_id) where deleted_at is null;

create index if not exists idx_activity_client     on public.activity_log (client_id, created_at desc);
create index if not exists idx_activity_entity     on public.activity_log (entity_type, entity_id);


-- ============================================================
-- ROW LEVEL SECURITY — ENABLE ON ALL TABLES
-- ============================================================

alter table public.clients               enable row level security;
alter table public.products              enable row level security;
alter table public.inventory             enable row level security;
alter table public.incoming_shipments    enable row level security;
alter table public.incoming_shipment_items enable row level security;
alter table public.shipment_trackings    enable row level security;
alter table public.service_requests      enable row level security;
alter table public.service_request_items enable row level security;
alter table public.invoices              enable row level security;
alter table public.invoice_items         enable row level security;
alter table public.files                 enable row level security;
alter table public.activity_log          enable row level security;
alter table public.carriers              enable row level security;
alter table public.service_types         enable row level security;
alter table public.company_settings      enable row level security;


-- ============================================================
-- RLS POLICIES
-- All policies use:
--   public.is_admin()          → reads auth.jwt() app_metadata.role
--   public.current_client_id() → reads auth.jwt() app_metadata.client_id
--   auth.uid()                 → Supabase built-in, always available
--   auth.role()                → Supabase built-in, always available
--
-- Each policy is dropped before creation so this block is
-- safe to re-run.
-- ============================================================

-- ── clients ──────────────────────────────────────────────────

drop policy if exists "clients: admin all"       on public.clients;
drop policy if exists "clients: client read own" on public.clients;

create policy "clients: admin all"
  on public.clients for all
  using (public.is_admin())
  with check (public.is_admin());

create policy "clients: client read own"
  on public.clients for select
  using (
    not public.is_admin()
    and auth_user_id = auth.uid()
  );


-- ── products ─────────────────────────────────────────────────

drop policy if exists "products: admin all"         on public.products;
drop policy if exists "products: client read own"   on public.products;
drop policy if exists "products: client insert own" on public.products;
drop policy if exists "products: client update own" on public.products;

create policy "products: admin all"
  on public.products for all
  using (public.is_admin())
  with check (public.is_admin());

create policy "products: client read own"
  on public.products for select
  using (
    not public.is_admin()
    and client_id = public.current_client_id()
    and deleted_at is null
  );

create policy "products: client insert own"
  on public.products for insert
  with check (
    not public.is_admin()
    and client_id = public.current_client_id()
  );

create policy "products: client update own"
  on public.products for update
  using (
    not public.is_admin()
    and client_id = public.current_client_id()
    and deleted_at is null
  )
  with check (client_id = public.current_client_id());


-- ── inventory ────────────────────────────────────────────────

drop policy if exists "inventory: admin all"         on public.inventory;
drop policy if exists "inventory: client read own"   on public.inventory;
drop policy if exists "inventory: client insert own" on public.inventory;

create policy "inventory: admin all"
  on public.inventory for all
  using (public.is_admin())
  with check (public.is_admin());

create policy "inventory: client read own"
  on public.inventory for select
  using (
    not public.is_admin()
    and client_id = public.current_client_id()
  );

-- Needed so createProduct() can insert the inventory row without
-- requiring the service-role key on the client code path.
create policy "inventory: client insert own"
  on public.inventory for insert
  with check (
    not public.is_admin()
    and client_id = public.current_client_id()
  );


-- ── incoming_shipments ───────────────────────────────────────

drop policy if exists "incoming_shipments: admin all"                  on public.incoming_shipments;
drop policy if exists "incoming_shipments: client read own"            on public.incoming_shipments;
drop policy if exists "incoming_shipments: client insert own"          on public.incoming_shipments;
drop policy if exists "incoming_shipments: client update non-received" on public.incoming_shipments;

create policy "incoming_shipments: admin all"
  on public.incoming_shipments for all
  using (public.is_admin())
  with check (public.is_admin());

create policy "incoming_shipments: client read own"
  on public.incoming_shipments for select
  using (
    not public.is_admin()
    and client_id = public.current_client_id()
    and deleted_at is null
  );

create policy "incoming_shipments: client insert own"
  on public.incoming_shipments for insert
  with check (
    not public.is_admin()
    and client_id = public.current_client_id()
  );

create policy "incoming_shipments: client update non-received"
  on public.incoming_shipments for update
  using (
    not public.is_admin()
    and client_id = public.current_client_id()
    and status not in ('received', 'partially_received')
    and deleted_at is null
  )
  with check (
    client_id = public.current_client_id()
    and status not in ('received', 'partially_received')
  );


-- ── incoming_shipment_items ──────────────────────────────────

drop policy if exists "shipment_items: admin all"         on public.incoming_shipment_items;
drop policy if exists "shipment_items: client read own"   on public.incoming_shipment_items;
drop policy if exists "shipment_items: client insert own" on public.incoming_shipment_items;
drop policy if exists "shipment_items: client update own" on public.incoming_shipment_items;

create policy "shipment_items: admin all"
  on public.incoming_shipment_items for all
  using (public.is_admin())
  with check (public.is_admin());

create policy "shipment_items: client read own"
  on public.incoming_shipment_items for select
  using (
    not public.is_admin()
    and exists (
      select 1 from public.incoming_shipments s
      where s.id = shipment_id
        and s.client_id = public.current_client_id()
        and s.deleted_at is null
    )
  );

create policy "shipment_items: client insert own"
  on public.incoming_shipment_items for insert
  with check (
    not public.is_admin()
    and exists (
      select 1 from public.incoming_shipments s
      where s.id = shipment_id
        and s.client_id = public.current_client_id()
    )
  );

create policy "shipment_items: client update own"
  on public.incoming_shipment_items for update
  using (
    not public.is_admin()
    and exists (
      select 1 from public.incoming_shipments s
      where s.id = shipment_id
        and s.client_id = public.current_client_id()
    )
  )
  with check (
    exists (
      select 1 from public.incoming_shipments s
      where s.id = shipment_id
        and s.client_id = public.current_client_id()
    )
  );


-- ── shipment_trackings ───────────────────────────────────────

drop policy if exists "shipment_trackings: admin all"         on public.shipment_trackings;
drop policy if exists "shipment_trackings: client read own"   on public.shipment_trackings;
drop policy if exists "shipment_trackings: client insert own" on public.shipment_trackings;

create policy "shipment_trackings: admin all"
  on public.shipment_trackings for all
  using (public.is_admin())
  with check (public.is_admin());

create policy "shipment_trackings: client read own"
  on public.shipment_trackings for select
  using (
    not public.is_admin()
    and exists (
      select 1 from public.incoming_shipments s
      where s.id = shipment_id
        and s.client_id = public.current_client_id()
        and s.deleted_at is null
    )
  );

create policy "shipment_trackings: client insert own"
  on public.shipment_trackings for insert
  with check (
    not public.is_admin()
    and exists (
      select 1 from public.incoming_shipments s
      where s.id = shipment_id
        and s.client_id = public.current_client_id()
    )
  );


-- ── service_requests ─────────────────────────────────────────

drop policy if exists "service_requests: admin all"         on public.service_requests;
drop policy if exists "service_requests: client read own"   on public.service_requests;
drop policy if exists "service_requests: client insert own" on public.service_requests;
drop policy if exists "service_requests: client update new" on public.service_requests;

create policy "service_requests: admin all"
  on public.service_requests for all
  using (public.is_admin())
  with check (public.is_admin());

create policy "service_requests: client read own"
  on public.service_requests for select
  using (
    not public.is_admin()
    and client_id = public.current_client_id()
    and deleted_at is null
  );

create policy "service_requests: client insert own"
  on public.service_requests for insert
  with check (
    not public.is_admin()
    and client_id = public.current_client_id()
  );

-- Clients may only edit or soft-delete their own 'new' requests.
create policy "service_requests: client update new"
  on public.service_requests for update
  using (
    not public.is_admin()
    and client_id = public.current_client_id()
    and status = 'new'
    and deleted_at is null
  )
  with check (
    client_id = public.current_client_id()
    and status in ('new', 'cancelled')
  );


-- ── service_request_items ────────────────────────────────────

drop policy if exists "service_request_items: admin all"         on public.service_request_items;
drop policy if exists "service_request_items: client read own"   on public.service_request_items;
drop policy if exists "service_request_items: client insert own" on public.service_request_items;

create policy "service_request_items: admin all"
  on public.service_request_items for all
  using (public.is_admin())
  with check (public.is_admin());

create policy "service_request_items: client read own"
  on public.service_request_items for select
  using (
    not public.is_admin()
    and exists (
      select 1 from public.service_requests r
      where r.id = request_id
        and r.client_id = public.current_client_id()
        and r.deleted_at is null
    )
  );

create policy "service_request_items: client insert own"
  on public.service_request_items for insert
  with check (
    not public.is_admin()
    and exists (
      select 1 from public.service_requests r
      where r.id = request_id
        and r.client_id = public.current_client_id()
        and r.status = 'new'
    )
  );


-- ── invoices ─────────────────────────────────────────────────

drop policy if exists "invoices: admin all"       on public.invoices;
drop policy if exists "invoices: client read own" on public.invoices;

create policy "invoices: admin all"
  on public.invoices for all
  using (public.is_admin())
  with check (public.is_admin());

-- Clients view their own invoices only — no insert or update.
create policy "invoices: client read own"
  on public.invoices for select
  using (
    not public.is_admin()
    and client_id = public.current_client_id()
  );


-- ── invoice_items ────────────────────────────────────────────

drop policy if exists "invoice_items: admin all"       on public.invoice_items;
drop policy if exists "invoice_items: client read own" on public.invoice_items;

create policy "invoice_items: admin all"
  on public.invoice_items for all
  using (public.is_admin())
  with check (public.is_admin());

create policy "invoice_items: client read own"
  on public.invoice_items for select
  using (
    not public.is_admin()
    and exists (
      select 1 from public.invoices i
      where i.id = invoice_id
        and i.client_id = public.current_client_id()
    )
  );


-- ── files ────────────────────────────────────────────────────

drop policy if exists "files: admin all"         on public.files;
drop policy if exists "files: client read own"   on public.files;
drop policy if exists "files: client insert own" on public.files;

create policy "files: admin all"
  on public.files for all
  using (public.is_admin())
  with check (public.is_admin());

create policy "files: client read own"
  on public.files for select
  using (
    not public.is_admin()
    and client_id = public.current_client_id()
    and deleted_at is null
  );

-- Binary upload goes to Storage via service-role key; this policy
-- only guards the metadata row in the files table.
create policy "files: client insert own"
  on public.files for insert
  with check (
    not public.is_admin()
    and client_id = public.current_client_id()
  );


-- ── activity_log ─────────────────────────────────────────────

drop policy if exists "activity_log: admin all"       on public.activity_log;
drop policy if exists "activity_log: client read own" on public.activity_log;

create policy "activity_log: admin all"
  on public.activity_log for all
  using (public.is_admin())
  with check (public.is_admin());

create policy "activity_log: client read own"
  on public.activity_log for select
  using (
    not public.is_admin()
    and client_id = public.current_client_id()
  );


-- ── carriers ─────────────────────────────────────────────────

drop policy if exists "carriers: admin all"          on public.carriers;
drop policy if exists "carriers: authenticated read" on public.carriers;

create policy "carriers: admin all"
  on public.carriers for all
  using (public.is_admin())
  with check (public.is_admin());

create policy "carriers: authenticated read"
  on public.carriers for select
  using (auth.role() = 'authenticated');


-- ── service_types ────────────────────────────────────────────

drop policy if exists "service_types: admin all"          on public.service_types;
drop policy if exists "service_types: authenticated read" on public.service_types;

create policy "service_types: admin all"
  on public.service_types for all
  using (public.is_admin())
  with check (public.is_admin());

create policy "service_types: authenticated read"
  on public.service_types for select
  using (auth.role() = 'authenticated');


-- ── company_settings ─────────────────────────────────────────

drop policy if exists "company_settings: admin all" on public.company_settings;

create policy "company_settings: admin all"
  on public.company_settings for all
  using (public.is_admin())
  with check (public.is_admin());


-- ============================================================
-- SEED DATA
-- ON CONFLICT DO NOTHING keeps this safe to re-run.
-- ============================================================

insert into public.carriers (name, sort_order) values
  ('UPS',             1), ('FedEx',           2), ('DHL',            3),
  ('USPS',            4), ('OnTrac',           5), ('Amazon Freight', 6),
  ('Amazon Delivery', 7), ('LTL Freight',      8), ('Local Delivery', 9),
  ('Other',          10)
on conflict (name) do nothing;

insert into public.service_types (name, sort_order) values
  ('FBA Prep', 1), ('FBM Fulfillment', 2), ('Labeling',   3),
  ('Bundling',  4), ('Inspection',      5), ('Forwarding', 6),
  ('Storage',   7), ('Returns',         8), ('Other',      9)
on conflict (name) do nothing;


-- ============================================================
-- AFTER RUNNING THIS FILE
--
-- 1. Go to Storage → New bucket → name it "files" → Public
-- 2. Go to Authentication → URL Configuration:
--      Site URL:            https://your-domain.com
--      Additional redirect: https://your-domain.com/**
-- 3. Set app_metadata on your admin user:
--      Update via Supabase dashboard → Auth → Users → Edit
--      raw_app_meta_data: { "role": "admin" }
-- ============================================================
