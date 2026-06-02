-- Create the "files" storage bucket (public read, service-role write).
-- All file records are protected by DB RLS (files table), so public bucket
-- is safe: URLs contain UUIDs and are not guessable.
insert into storage.buckets (id, name, public)
values ('files', 'files', true)
on conflict (id) do nothing;
