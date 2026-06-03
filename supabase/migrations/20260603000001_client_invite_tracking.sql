-- Add 'disabled' login status so admins can block portal access
alter type public.login_status add value if not exists 'disabled';

-- Invite tracking: separate "first invite" timestamp from "last sent" timestamp,
-- plus a counter so admins can see how many times an invite was resent.
alter table public.clients
  add column if not exists last_invite_sent_at timestamptz,
  add column if not exists invite_count        integer not null default 0;
