-- ============================================================
-- Safir WMS – In-App Notification System
-- Migration: 20260604000006_notifications
-- ============================================================

create table notifications (
  id                   uuid        primary key default gen_random_uuid(),

  -- Who should receive it (at least one must be set)
  recipient_user_id    uuid        references auth.users(id)  on delete cascade,
  recipient_role       text        check (recipient_role  in ('admin', 'client')),
  recipient_client_id  uuid        references clients(id) on delete cascade,

  -- Who triggered it
  actor_user_id        uuid        references auth.users(id),
  actor_role           text        check (actor_role in ('admin', 'client')),

  -- Payload
  type                 text        not null,
  title                text        not null,
  message              text        not null,
  entity_type          text,
  entity_id            uuid,
  link_url             text,

  -- State
  read_at              timestamptz,
  created_at           timestamptz not null default now()
);

-- Fast lookup indexes
create index notifications_recipient_user_idx   on notifications(recipient_user_id,   created_at desc);
create index notifications_recipient_role_idx   on notifications(recipient_role,       created_at desc);
create index notifications_recipient_client_idx on notifications(recipient_client_id,  created_at desc);

-- ── Row Level Security ────────────────────────────────────────
alter table notifications enable row level security;

-- Admin: see notifications addressed to any admin OR directly to them
create policy "notifications_admin_select" on notifications
  for select using (
    auth.is_admin() and (
      recipient_role = 'admin'
      or recipient_user_id = auth.uid()
    )
  );

-- Client: see notifications addressed to their client_id OR directly to them
create policy "notifications_client_select" on notifications
  for select using (
    not auth.is_admin() and (
      recipient_client_id = auth.client_id()
      or recipient_user_id = auth.uid()
    )
  );

-- Users can mark their own notifications read (update read_at only)
create policy "notifications_mark_read" on notifications
  for update using (
    auth.is_admin() and (
      recipient_role = 'admin' or recipient_user_id = auth.uid()
    )
    or (
      not auth.is_admin() and (
        recipient_client_id = auth.client_id() or recipient_user_id = auth.uid()
      )
    )
  )
  with check (true);
