-- Storage RLS policies for the product-images bucket.
-- Bucket itself was created in 20260530000001_product_images_bucket.sql.
--
-- Path convention: {client_id}/{product_id}/{filename}
-- Admins may upload to any path.
-- Clients may only upload under their own client_id folder.

-- ── READ ──────────────────────────────────────────────────────
-- Any authenticated user can view product images.
-- (The bucket is already public=true, so unauthenticated reads via URL
--  also work; this policy covers authenticated API reads.)
create policy "product_images_authenticated_read"
  on storage.objects for select
  using (
    bucket_id = 'product-images'
    and auth.role() = 'authenticated'
  );

-- ── INSERT (admin) ────────────────────────────────────────────
create policy "product_images_admin_insert"
  on storage.objects for insert
  with check (
    bucket_id = 'product-images'
    and (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
  );

-- ── INSERT (client) ───────────────────────────────────────────
-- First path segment must match the caller's client_id.
create policy "product_images_client_insert"
  on storage.objects for insert
  with check (
    bucket_id = 'product-images'
    and (auth.jwt() -> 'app_metadata' ->> 'role') = 'client'
    and (auth.jwt() -> 'app_metadata' ->> 'client_id') is not null
    and (storage.foldername(name))[1] = (auth.jwt() -> 'app_metadata' ->> 'client_id')
  );

-- ── UPDATE (admin) ────────────────────────────────────────────
create policy "product_images_admin_update"
  on storage.objects for update
  using (
    bucket_id = 'product-images'
    and (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
  );

-- ── UPDATE (client) ───────────────────────────────────────────
create policy "product_images_client_update"
  on storage.objects for update
  using (
    bucket_id = 'product-images'
    and (auth.jwt() -> 'app_metadata' ->> 'role') = 'client'
    and (storage.foldername(name))[1] = (auth.jwt() -> 'app_metadata' ->> 'client_id')
  );

-- ── DELETE (admin only) ───────────────────────────────────────
create policy "product_images_admin_delete"
  on storage.objects for delete
  using (
    bucket_id = 'product-images'
    and (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
  );
