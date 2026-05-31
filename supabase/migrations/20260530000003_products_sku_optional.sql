-- SKU is optional — allow null so products can be created without a SKU.
-- The unique constraint (client_id, sku) still applies to non-null values;
-- PostgreSQL treats NULL as distinct, so multiple null-SKU products per client are fine.
alter table public.products
  alter column sku drop not null;
