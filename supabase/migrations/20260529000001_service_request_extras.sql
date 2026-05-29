-- ============================================================
-- Safir WMS – Service Request Extras
-- Migration: 20260529000001_service_request_extras
--
-- Adds two columns that the initial schema omitted:
--   inventory_deducted – one-way guard preventing double
--                        adjustments to available_units
--   service_details    – service-specific form fields stored
--                        as JSON (prep notes, order notes, etc.)
-- ============================================================

alter table service_requests
  add column if not exists inventory_deducted boolean not null default false,
  add column if not exists service_details     jsonb;
