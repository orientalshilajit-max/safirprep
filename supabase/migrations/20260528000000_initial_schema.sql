-- ============================================================
-- Safir WMS – Initial Schema
-- Migration: 20260528000000_initial_schema
-- ============================================================
-- Run order: enums → functions → tables → indexes → RLS
-- ============================================================


-- ============================================================
-- 0. EXTENSIONS
-- ============================================================
create extension if not exists "uuid-ossp";


-- ============================================================
-- 1. ENUM TYPES
-- ============================================================

create type client_status   as enum ('pending', 'active', 'inactive');
create type login_status    as enum ('no_login', 'invited', 'active');
create type product_status  as enum ('active', 'archived');
create type shipment_status as enum (
  'in_transit', 'arrived', 'received', 'partially_received', 'need_attention'
);
create type service_status  as enum (
  'new', 'in_progress', 'completed', 'need_attention', 'invoiced', 'cancelled'
);
create type invoice_status  as enum ('unpaid', 'paid', 'overdue', 'void');
create type file_category   as enum (
  'agreements', 'labels', 'shipment_docs', 'product_docs', 'invoices', 'other'
);
create type entity_type     as enum (
  'client', 'product', 'shipment', 'service_request', 'invoice', 'file'
);


-- ============================================================
-- 2. RLS HELPER FUNCTIONS
-- ============================================================

-- Returns true when the calling user is an admin.
-- Admins are identified by app_metadata.role = 'admin' in the JWT.
create or replace function auth.is_admin()
returns boolean
language sql
stable
as $$
  select coalesce(
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin',
    false
  );
$$;

-- Returns the client_id claim from the JWT for client users.
-- Returns NULL for admins or unauthenticated callers.
create or replace function auth.client_id()
returns uuid
language sql
stable
as $$
  select nullif(
    (auth.jwt() -> 'app_metadata' ->> 'client_id'),
    ''
  )::uuid;
$$;


-- ============================================================
-- 3. UPDATED_AT TRIGGER FUNCTION
-- ============================================================

create or replace function trigger_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;


-- ============================================================
-- 4. TABLES
-- ============================================================

-- ── 4.1 clients ────────────────────────────────────────────
create table clients (
  id              uuid        default gen_random_uuid() primary key,
  auth_user_id    uuid        references auth.users(id) on delete set null,
  company_name    text        not null,
  contact_name    text        not null,
  email           text        not null unique,
  phone           text,
  status          client_status not null default 'pending',
  login_status    login_status  not null default 'no_login',
  notes           text,
  invited_at      timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz
);

create trigger set_clients_updated_at
  before update on clients
  for each row execute function trigger_set_updated_at();

comment on table clients is
  'Prep-center client accounts. One row = one company.';
comment on column clients.auth_user_id is
  'Links to auth.users when the client has portal login. Set on invite acceptance.';


-- ── 4.2 products ───────────────────────────────────────────
create table products (
  id          uuid           default gen_random_uuid() primary key,
  client_id   uuid           not null references clients(id) on delete cascade,
  name        text           not null,
  sku         text           not null,
  asin_upc    text,
  fnsku       text,
  image_url   text,
  notes       text,
  status      product_status not null default 'active',
  sort_order  integer        not null default 0,
  created_at  timestamptz    not null default now(),
  updated_at  timestamptz    not null default now(),
  deleted_at  timestamptz,
  unique (client_id, sku)
);

create trigger set_products_updated_at
  before update on products
  for each row execute function trigger_set_updated_at();

comment on table products is
  'Client products tracked in the WMS.';
comment on column products.sort_order is
  'Admin-controlled display order within a client''s product list.';


-- ── 4.3 inventory ──────────────────────────────────────────
create table inventory (
  id              uuid        default gen_random_uuid() primary key,
  client_id       uuid        not null references clients(id)  on delete cascade,
  product_id      uuid        not null references products(id) on delete cascade,
  available_units integer     not null default 0 check (available_units >= 0),
  incoming_units  integer     not null default 0 check (incoming_units  >= 0),
  damaged_units   integer     not null default 0 check (damaged_units   >= 0),
  received_units  integer     not null default 0 check (received_units  >= 0),
  shipped_units   integer     not null default 0 check (shipped_units   >= 0),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (client_id, product_id)
);

create trigger set_inventory_updated_at
  before update on inventory
  for each row execute function trigger_set_updated_at();

comment on table inventory is
  'One row per client × product combination. Counts are mutated by triggers from shipments/requests.';


-- ── 4.4 incoming_shipments ─────────────────────────────────
create table incoming_shipments (
  id               uuid             default gen_random_uuid() primary key,
  client_id        uuid             not null references clients(id) on delete cascade,
  shipment_number  text             not null unique,
  status           shipment_status  not null default 'in_transit',
  notes            text,
  inventory_synced boolean          not null default false,
  archived_at      timestamptz,
  created_at       timestamptz      not null default now(),
  updated_at       timestamptz      not null default now(),
  deleted_at       timestamptz
);

create trigger set_incoming_shipments_updated_at
  before update on incoming_shipments
  for each row execute function trigger_set_updated_at();

comment on column incoming_shipments.inventory_synced is
  'Set to true once received units have been applied to inventory. Prevents double-counting.';


-- ── 4.5 incoming_shipment_items ────────────────────────────
create table incoming_shipment_items (
  id              uuid        default gen_random_uuid() primary key,
  shipment_id     uuid        not null references incoming_shipments(id) on delete cascade,
  product_id      uuid        not null references products(id) on delete restrict,
  expected_units  integer     not null default 0 check (expected_units  >= 0),
  received_units  integer     not null default 0 check (received_units  >= 0),
  damaged_units   integer     not null default 0 check (damaged_units   >= 0),
  notes           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (shipment_id, product_id)
);

create trigger set_incoming_shipment_items_updated_at
  before update on incoming_shipment_items
  for each row execute function trigger_set_updated_at();


-- ── 4.6 shipment_trackings ─────────────────────────────────
create table shipment_trackings (
  id              uuid        default gen_random_uuid() primary key,
  shipment_id     uuid        not null references incoming_shipments(id) on delete cascade,
  carrier         text        not null,
  tracking_number text,
  box_count       integer     not null default 1 check (box_count >= 1),
  notes           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create trigger set_shipment_trackings_updated_at
  before update on shipment_trackings
  for each row execute function trigger_set_updated_at();


-- ── 4.7 service_requests ───────────────────────────────────
create table service_requests (
  id              uuid           default gen_random_uuid() primary key,
  client_id       uuid           not null references clients(id) on delete cascade,
  request_number  text           not null unique,
  service_type    text           not null,
  status          service_status not null default 'new',
  notes           text,
  created_at      timestamptz    not null default now(),
  updated_at      timestamptz    not null default now(),
  deleted_at      timestamptz
);

create trigger set_service_requests_updated_at
  before update on service_requests
  for each row execute function trigger_set_updated_at();


-- ── 4.8 service_request_items ──────────────────────────────
create table service_request_items (
  id          uuid        default gen_random_uuid() primary key,
  request_id  uuid        not null references service_requests(id) on delete cascade,
  product_id  uuid        not null references products(id) on delete restrict,
  quantity    integer     not null default 1 check (quantity > 0),
  notes       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create trigger set_service_request_items_updated_at
  before update on service_request_items
  for each row execute function trigger_set_updated_at();


-- ── 4.9 invoices ───────────────────────────────────────────
create table invoices (
  id              uuid            default gen_random_uuid() primary key,
  client_id       uuid            not null references clients(id) on delete cascade,
  request_id      uuid            references service_requests(id) on delete set null,
  invoice_number  text            not null unique,
  status          invoice_status  not null default 'unpaid',
  amount          numeric(12, 2)  not null default 0 check (amount >= 0),
  due_date        date,
  pdf_url         text,
  notes           text,
  created_at      timestamptz     not null default now(),
  updated_at      timestamptz     not null default now()
);

create trigger set_invoices_updated_at
  before update on invoices
  for each row execute function trigger_set_updated_at();


-- ── 4.10 invoice_items ─────────────────────────────────────
create table invoice_items (
  id          uuid           default gen_random_uuid() primary key,
  invoice_id  uuid           not null references invoices(id) on delete cascade,
  description text           not null,
  quantity    integer        not null default 1 check (quantity > 0),
  unit_price  numeric(12, 2) not null default 0 check (unit_price >= 0),
  total       numeric(12, 2) generated always as (quantity * unit_price) stored,
  created_at  timestamptz    not null default now()
);

comment on column invoice_items.total is
  'Computed column: quantity × unit_price. Read-only.';


-- ── 4.11 files ─────────────────────────────────────────────
create table files (
  id              uuid          default gen_random_uuid() primary key,
  client_id       uuid          not null references clients(id)  on delete cascade,
  product_id      uuid          references products(id)          on delete set null,
  shipment_id     uuid          references incoming_shipments(id) on delete set null,
  request_id      uuid          references service_requests(id)  on delete set null,
  invoice_id      uuid          references invoices(id)          on delete set null,
  category        file_category not null default 'other',
  file_name       text          not null,
  file_url        text          not null,
  thumbnail_url   text,
  file_type       text,
  file_size_bytes bigint,
  uploaded_by     uuid          references auth.users(id) on delete set null,
  created_at      timestamptz   not null default now(),
  deleted_at      timestamptz
);

comment on table files is
  'Stores metadata for all uploaded files. Actual files live in Supabase Storage.';
comment on column files.file_url is
  'Full signed URL or Storage path for the file.';


-- ── 4.12 activity_log ──────────────────────────────────────
create table activity_log (
  id           uuid        default gen_random_uuid() primary key,
  client_id    uuid        references clients(id) on delete set null,
  entity_type  entity_type not null,
  entity_id    uuid,
  action       text        not null,
  message      text        not null,
  created_by   uuid        references auth.users(id) on delete set null,
  created_at   timestamptz not null default now()
);

comment on table activity_log is
  'Append-only audit trail. Never update or delete rows here.';


-- ── 4.13 carriers ──────────────────────────────────────────
create table carriers (
  id          uuid        default gen_random_uuid() primary key,
  name        text        not null unique,
  is_active   boolean     not null default true,
  sort_order  integer     not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create trigger set_carriers_updated_at
  before update on carriers
  for each row execute function trigger_set_updated_at();


-- ── 4.14 service_types ─────────────────────────────────────
create table service_types (
  id          uuid        default gen_random_uuid() primary key,
  name        text        not null unique,
  is_active   boolean     not null default true,
  sort_order  integer     not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create trigger set_service_types_updated_at
  before update on service_types
  for each row execute function trigger_set_updated_at();


-- ── 4.15 company_settings ──────────────────────────────────
create table company_settings (
  id                      uuid    default gen_random_uuid() primary key,
  company_name            text    not null default 'Safir Logistics',
  email                   text,
  phone                   text,
  address                 text,
  website                 text,
  logo_url                text,
  invoice_due_days        integer not null default 14 check (invoice_due_days > 0),
  invoice_payment_notes   text,
  invoice_default_notes   text,
  invite_email_subject    text    not null default 'You''re invited to the Safir client portal',
  invite_email_body       text,
  updated_at              timestamptz not null default now()
);

create trigger set_company_settings_updated_at
  before update on company_settings
  for each row execute function trigger_set_updated_at();

-- Only one row ever exists (singleton pattern)
insert into company_settings default values;


-- ============================================================
-- 5. INDEXES
-- ============================================================

-- clients
create index idx_clients_status      on clients(status)      where deleted_at is null;
create index idx_clients_email       on clients(email)       where deleted_at is null;
create index idx_clients_auth_user   on clients(auth_user_id);

-- products
create index idx_products_client     on products(client_id)  where deleted_at is null;
create index idx_products_status     on products(status, client_id);
create index idx_products_sku        on products(sku);

-- inventory
create index idx_inventory_client    on inventory(client_id);
create index idx_inventory_product   on inventory(product_id);

-- incoming_shipments
create index idx_shipments_client    on incoming_shipments(client_id) where deleted_at is null;
create index idx_shipments_status    on incoming_shipments(status)    where deleted_at is null;
create index idx_shipments_number    on incoming_shipments(shipment_number);

-- incoming_shipment_items
create index idx_ship_items_shipment on incoming_shipment_items(shipment_id);
create index idx_ship_items_product  on incoming_shipment_items(product_id);

-- shipment_trackings
create index idx_trackings_shipment  on shipment_trackings(shipment_id);

-- service_requests
create index idx_requests_client     on service_requests(client_id)  where deleted_at is null;
create index idx_requests_status     on service_requests(status)     where deleted_at is null;
create index idx_requests_number     on service_requests(request_number);

-- service_request_items
create index idx_req_items_request   on service_request_items(request_id);
create index idx_req_items_product   on service_request_items(product_id);

-- invoices
create index idx_invoices_client     on invoices(client_id);
create index idx_invoices_status     on invoices(status);
create index idx_invoices_request    on invoices(request_id);

-- invoice_items
create index idx_inv_items_invoice   on invoice_items(invoice_id);

-- files
create index idx_files_client        on files(client_id)    where deleted_at is null;
create index idx_files_shipment      on files(shipment_id)  where deleted_at is null;
create index idx_files_request       on files(request_id)   where deleted_at is null;
create index idx_files_product       on files(product_id)   where deleted_at is null;
create index idx_files_invoice       on files(invoice_id)   where deleted_at is null;

-- activity_log
create index idx_activity_client     on activity_log(client_id, created_at desc);
create index idx_activity_entity     on activity_log(entity_type, entity_id);


-- ============================================================
-- 6. ROW LEVEL SECURITY
-- ============================================================

alter table clients             enable row level security;
alter table products            enable row level security;
alter table inventory           enable row level security;
alter table incoming_shipments  enable row level security;
alter table incoming_shipment_items enable row level security;
alter table shipment_trackings  enable row level security;
alter table service_requests    enable row level security;
alter table service_request_items   enable row level security;
alter table invoices            enable row level security;
alter table invoice_items       enable row level security;
alter table files               enable row level security;
alter table activity_log        enable row level security;
alter table carriers            enable row level security;
alter table service_types       enable row level security;
alter table company_settings    enable row level security;


-- ── 6.1 clients ────────────────────────────────────────────
-- Admin: full access to all rows
create policy "clients: admin all"
  on clients for all
  using (auth.is_admin())
  with check (auth.is_admin());

-- Client: read only their own record (matched by auth_user_id)
create policy "clients: client read own"
  on clients for select
  using (
    not auth.is_admin()
    and auth_user_id = auth.uid()
  );


-- ── 6.2 products ───────────────────────────────────────────
create policy "products: admin all"
  on products for all
  using (auth.is_admin())
  with check (auth.is_admin());

create policy "products: client read own"
  on products for select
  using (
    not auth.is_admin()
    and client_id = auth.client_id()
    and deleted_at is null
  );

create policy "products: client insert own"
  on products for insert
  with check (
    not auth.is_admin()
    and client_id = auth.client_id()
  );

create policy "products: client update own"
  on products for update
  using (
    not auth.is_admin()
    and client_id = auth.client_id()
    and deleted_at is null
  )
  with check (
    client_id = auth.client_id()
  );


-- ── 6.3 inventory ──────────────────────────────────────────
create policy "inventory: admin all"
  on inventory for all
  using (auth.is_admin())
  with check (auth.is_admin());

create policy "inventory: client read own"
  on inventory for select
  using (
    not auth.is_admin()
    and client_id = auth.client_id()
  );


-- ── 6.4 incoming_shipments ─────────────────────────────────
create policy "incoming_shipments: admin all"
  on incoming_shipments for all
  using (auth.is_admin())
  with check (auth.is_admin());

create policy "incoming_shipments: client read own"
  on incoming_shipments for select
  using (
    not auth.is_admin()
    and client_id = auth.client_id()
    and deleted_at is null
  );

create policy "incoming_shipments: client insert own"
  on incoming_shipments for insert
  with check (
    not auth.is_admin()
    and client_id = auth.client_id()
  );

create policy "incoming_shipments: client update own non-received"
  on incoming_shipments for update
  using (
    not auth.is_admin()
    and client_id = auth.client_id()
    -- Clients cannot modify shipments that are already received
    and status not in ('received', 'partially_received')
    and deleted_at is null
  )
  with check (
    client_id = auth.client_id()
    -- Clients cannot directly set received statuses
    and status not in ('received', 'partially_received')
  );


-- ── 6.5 incoming_shipment_items ────────────────────────────
-- Access through parent shipment's client_id
create policy "shipment_items: admin all"
  on incoming_shipment_items for all
  using (auth.is_admin())
  with check (auth.is_admin());

create policy "shipment_items: client read own"
  on incoming_shipment_items for select
  using (
    not auth.is_admin()
    and exists (
      select 1 from incoming_shipments s
      where s.id = shipment_id
        and s.client_id = auth.client_id()
        and s.deleted_at is null
    )
  );

create policy "shipment_items: client insert own"
  on incoming_shipment_items for insert
  with check (
    not auth.is_admin()
    and exists (
      select 1 from incoming_shipments s
      where s.id = shipment_id
        and s.client_id = auth.client_id()
    )
  );

create policy "shipment_items: client update own"
  on incoming_shipment_items for update
  using (
    not auth.is_admin()
    and exists (
      select 1 from incoming_shipments s
      where s.id = shipment_id
        and s.client_id = auth.client_id()
    )
  )
  with check (
    exists (
      select 1 from incoming_shipments s
      where s.id = shipment_id
        and s.client_id = auth.client_id()
    )
  );


-- ── 6.6 shipment_trackings ─────────────────────────────────
create policy "shipment_trackings: admin all"
  on shipment_trackings for all
  using (auth.is_admin())
  with check (auth.is_admin());

create policy "shipment_trackings: client read own"
  on shipment_trackings for select
  using (
    not auth.is_admin()
    and exists (
      select 1 from incoming_shipments s
      where s.id = shipment_id
        and s.client_id = auth.client_id()
        and s.deleted_at is null
    )
  );

create policy "shipment_trackings: client insert own"
  on shipment_trackings for insert
  with check (
    not auth.is_admin()
    and exists (
      select 1 from incoming_shipments s
      where s.id = shipment_id
        and s.client_id = auth.client_id()
    )
  );


-- ── 6.7 service_requests ───────────────────────────────────
create policy "service_requests: admin all"
  on service_requests for all
  using (auth.is_admin())
  with check (auth.is_admin());

create policy "service_requests: client read own"
  on service_requests for select
  using (
    not auth.is_admin()
    and client_id = auth.client_id()
    and deleted_at is null
  );

create policy "service_requests: client insert own"
  on service_requests for insert
  with check (
    not auth.is_admin()
    and client_id = auth.client_id()
  );

-- Clients can only edit their own New requests
create policy "service_requests: client update new"
  on service_requests for update
  using (
    not auth.is_admin()
    and client_id = auth.client_id()
    and status = 'new'
    and deleted_at is null
  )
  with check (
    client_id = auth.client_id()
    -- Status can only stay 'new' or move to 'cancelled' by client
    and status in ('new', 'cancelled')
  );


-- ── 6.8 service_request_items ──────────────────────────────
create policy "service_request_items: admin all"
  on service_request_items for all
  using (auth.is_admin())
  with check (auth.is_admin());

create policy "service_request_items: client read own"
  on service_request_items for select
  using (
    not auth.is_admin()
    and exists (
      select 1 from service_requests r
      where r.id = request_id
        and r.client_id = auth.client_id()
        and r.deleted_at is null
    )
  );

create policy "service_request_items: client insert own"
  on service_request_items for insert
  with check (
    not auth.is_admin()
    and exists (
      select 1 from service_requests r
      where r.id = request_id
        and r.client_id = auth.client_id()
        and r.status = 'new'
    )
  );


-- ── 6.9 invoices ───────────────────────────────────────────
create policy "invoices: admin all"
  on invoices for all
  using (auth.is_admin())
  with check (auth.is_admin());

-- Clients can only read their own invoices (no create/edit)
create policy "invoices: client read own"
  on invoices for select
  using (
    not auth.is_admin()
    and client_id = auth.client_id()
  );


-- ── 6.10 invoice_items ─────────────────────────────────────
create policy "invoice_items: admin all"
  on invoice_items for all
  using (auth.is_admin())
  with check (auth.is_admin());

create policy "invoice_items: client read own"
  on invoice_items for select
  using (
    not auth.is_admin()
    and exists (
      select 1 from invoices i
      where i.id = invoice_id
        and i.client_id = auth.client_id()
    )
  );


-- ── 6.11 files ─────────────────────────────────────────────
create policy "files: admin all"
  on files for all
  using (auth.is_admin())
  with check (auth.is_admin());

create policy "files: client read own"
  on files for select
  using (
    not auth.is_admin()
    and client_id = auth.client_id()
    and deleted_at is null
  );

create policy "files: client upload own"
  on files for insert
  with check (
    not auth.is_admin()
    and client_id = auth.client_id()
  );


-- ── 6.12 activity_log ──────────────────────────────────────
create policy "activity_log: admin all"
  on activity_log for all
  using (auth.is_admin())
  with check (auth.is_admin());

create policy "activity_log: client read own"
  on activity_log for select
  using (
    not auth.is_admin()
    and client_id = auth.client_id()
  );


-- ── 6.13 carriers ──────────────────────────────────────────
create policy "carriers: admin all"
  on carriers for all
  using (auth.is_admin())
  with check (auth.is_admin());

-- Any authenticated user can read carriers (needed for shipment forms)
create policy "carriers: authenticated read"
  on carriers for select
  using (auth.role() = 'authenticated');


-- ── 6.14 service_types ─────────────────────────────────────
create policy "service_types: admin all"
  on service_types for all
  using (auth.is_admin())
  with check (auth.is_admin());

create policy "service_types: authenticated read"
  on service_types for select
  using (auth.role() = 'authenticated');


-- ── 6.15 company_settings ──────────────────────────────────
create policy "company_settings: admin all"
  on company_settings for all
  using (auth.is_admin())
  with check (auth.is_admin());


-- ============================================================
-- 7. SEED: DEFAULT CARRIERS AND SERVICE TYPES
-- ============================================================

insert into carriers (name, sort_order) values
  ('UPS',              1),
  ('FedEx',            2),
  ('DHL',              3),
  ('USPS',             4),
  ('OnTrac',           5),
  ('Amazon Freight',   6),
  ('Amazon Delivery',  7),
  ('LTL Freight',      8),
  ('Local Delivery',   9),
  ('Other',           10);

insert into service_types (name, sort_order) values
  ('FBA Prep',         1),
  ('FBM Fulfillment',  2),
  ('Labeling',         3),
  ('Bundling',         4),
  ('Inspection',       5),
  ('Forwarding',       6),
  ('Storage',          7),
  ('Returns',          8),
  ('Other',            9);
