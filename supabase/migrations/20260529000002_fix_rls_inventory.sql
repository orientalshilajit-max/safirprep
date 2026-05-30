-- ============================================================
-- Safir WMS – Fix inventory RLS: allow clients to insert their own rows
-- Migration: 20260529000002_fix_rls_inventory
--
-- Context: createProduct() creates an inventory row atomically
-- with the product. Without this policy, client users could insert
-- products (products policy exists) but the inventory insert would
-- be rejected, leaving orphaned product rows.
-- ============================================================

create policy "inventory: client insert own"
  on inventory for insert
  with check (
    not auth.is_admin()
    and client_id = auth.client_id()
  );
