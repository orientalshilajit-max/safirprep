-- ============================================================
-- Safir WMS – Support Ticket System
-- Migration: 20260604000002_support_tickets
-- ============================================================

-- Sequence for readable ticket numbers (TCK-1001, TCK-1002, …)
create sequence if not exists support_ticket_seq start 1001;

-- ── Support tickets ───────────────────────────────────────────
create table support_tickets (
  id            uuid        primary key default gen_random_uuid(),
  ticket_number text        not null unique
                              default ('TCK-' || lpad(nextval('support_ticket_seq')::text, 4, '0')),
  client_id     uuid        not null references clients(id),
  subject       text        not null,
  category      text        not null,
  status        text        not null default 'Open'
                              check (status in ('Open','Waiting for Client','Waiting for Admin','Resolved','Archived')),
  assigned_to   uuid        references auth.users(id),
  created_by    uuid        not null references auth.users(id),
  archived_at   timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create trigger set_support_tickets_updated_at
  before update on support_tickets
  for each row execute function trigger_set_updated_at();

create index support_tickets_client_idx  on support_tickets(client_id);
create index support_tickets_status_idx  on support_tickets(status);
create index support_tickets_updated_idx on support_tickets(updated_at desc);

-- ── Ticket messages ───────────────────────────────────────────
create table support_ticket_messages (
  id             uuid        primary key default gen_random_uuid(),
  ticket_id      uuid        not null references support_tickets(id) on delete cascade,
  sender_user_id uuid        not null references auth.users(id),
  sender_role    text        not null check (sender_role in ('admin', 'client')),
  message        text        not null,
  attachments    jsonb,
  created_at     timestamptz not null default now()
);

create index support_ticket_messages_ticket_idx on support_ticket_messages(ticket_id, created_at asc);

-- ── Row Level Security ────────────────────────────────────────
alter table support_tickets         enable row level security;
alter table support_ticket_messages enable row level security;

-- Admins see all; clients see only their own
create policy "tickets_select" on support_tickets
  for select using ( auth.is_admin() or client_id = auth.client_id() );

create policy "tickets_insert" on support_tickets
  for insert with check (
    auth.uid() is not null
    and (auth.is_admin() or client_id = auth.client_id())
  );

create policy "tickets_update" on support_tickets
  for update using ( auth.is_admin() or client_id = auth.client_id() );

-- Messages inherit ticket access
create policy "ticket_messages_select" on support_ticket_messages
  for select using (
    ticket_id in (
      select id from support_tickets
      where auth.is_admin() or client_id = auth.client_id()
    )
  );

create policy "ticket_messages_insert" on support_ticket_messages
  for insert with check (
    sender_user_id = auth.uid()
    and ticket_id in (
      select id from support_tickets
      where auth.is_admin() or client_id = auth.client_id()
    )
  );

-- ── Storage bucket ────────────────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'support-attachments',
  'support-attachments',
  false,
  10485760,  -- 10 MB
  array[
    'image/jpeg','image/jpg','image/png','image/webp',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ]
)
on conflict (id) do nothing;

-- Authenticated users can upload
create policy "support_attach_insert" on storage.objects
  for insert with check (
    bucket_id = 'support-attachments' and auth.uid() is not null
  );

-- Authenticated users can read (URLs are UUID-obscured)
create policy "support_attach_select" on storage.objects
  for select using (
    bucket_id = 'support-attachments' and auth.uid() is not null
  );
