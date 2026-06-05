-- Add file_path to reliably identify the storage object path for deletion.
-- file_url is a public URL (hard to reverse); file_path is the bucket-relative path.
alter table files
  add column if not exists file_path text;
