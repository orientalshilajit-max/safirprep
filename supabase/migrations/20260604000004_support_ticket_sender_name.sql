-- Add sender_name to support_ticket_messages so the display name is stored
-- at write time and never requires a runtime join to resolve.

alter table support_ticket_messages
  add column if not exists sender_name text not null default '';
