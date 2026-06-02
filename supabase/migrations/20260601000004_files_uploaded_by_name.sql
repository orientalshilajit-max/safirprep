-- Add text display-name column alongside the existing UUID uploaded_by reference.
-- uploaded_by (uuid) = auth.users.id of the uploader
-- uploaded_by_name (text) = human-readable name for display in the UI
alter table public.files
  add column if not exists uploaded_by_name text;
