-- service_request_services
-- One row per service per request.  Stores a price snapshot so later
-- pricing-rule edits don't retroactively change old request costs.
create table if not exists public.service_request_services (
  id                    uuid          default gen_random_uuid() primary key,
  request_id            uuid          not null references public.service_requests(id) on delete cascade,
  service_type_id       uuid          references public.service_types(id) on delete set null,
  service_name_snapshot text          not null,
  quantity              integer       not null default 1 check (quantity > 0),
  unit_price            numeric(10,2) not null default 0,
  total_price           numeric(10,2) not null default 0,
  notes                 text,
  created_at            timestamptz   not null default now()
);

create index if not exists service_request_services_request_id_idx
  on public.service_request_services (request_id);

create index if not exists service_request_services_service_type_id_idx
  on public.service_request_services (service_type_id);

alter table public.service_request_services enable row level security;

-- Admin: full access to all rows
create policy "service_request_services: admin all"
  on public.service_request_services
  for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Client: read rows belonging to their own requests
create policy "service_request_services: client read own"
  on public.service_request_services
  for select
  to authenticated
  using (
    exists (
      select 1 from public.service_requests sr
      where sr.id = service_request_services.request_id
        and sr.client_id = public.current_client_id()
        and sr.deleted_at is null
    )
  );

-- Client: insert rows only on their own requests that are still editable (status = 'new')
create policy "service_request_services: client insert own"
  on public.service_request_services
  for insert
  to authenticated
  with check (
    exists (
      select 1 from public.service_requests sr
      where sr.id = service_request_services.request_id
        and sr.client_id = public.current_client_id()
        and sr.status = 'new'
    )
  );

-- Client: update rows on their own requests that are still editable
create policy "service_request_services: client update own"
  on public.service_request_services
  for update
  to authenticated
  using (
    exists (
      select 1 from public.service_requests sr
      where sr.id = service_request_services.request_id
        and sr.client_id = public.current_client_id()
        and sr.status = 'new'
        and sr.deleted_at is null
    )
  )
  with check (
    exists (
      select 1 from public.service_requests sr
      where sr.id = service_request_services.request_id
        and sr.client_id = public.current_client_id()
    )
  );

-- Client: delete rows on their own requests that are still editable
create policy "service_request_services: client delete own"
  on public.service_request_services
  for delete
  to authenticated
  using (
    exists (
      select 1 from public.service_requests sr
      where sr.id = service_request_services.request_id
        and sr.client_id = public.current_client_id()
        and sr.status = 'new'
        and sr.deleted_at is null
    )
  );
