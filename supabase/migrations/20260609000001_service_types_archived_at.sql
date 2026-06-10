-- Allow service types to be archived (soft-deleted) instead of hard-deleted
-- when they have existing usage in service requests or related tables.
alter table service_types
  add column if not exists archived_at timestamptz;
