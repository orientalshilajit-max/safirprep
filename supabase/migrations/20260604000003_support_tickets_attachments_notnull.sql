-- Fix: ensure attachments column is NOT NULL with empty-array default.
-- Run this if the table was already created before the migration was corrected.

alter table support_ticket_messages
  alter column attachments set default '[]'::jsonb;

update support_ticket_messages
  set attachments = '[]'::jsonb
  where attachments is null;

alter table support_ticket_messages
  alter column attachments set not null;
