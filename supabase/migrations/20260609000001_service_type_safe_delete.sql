-- Add service_type_id to invoice_items so the FK is nulled on service type deletion,
-- keeping the service_name snapshot intact for historical display.
ALTER TABLE invoice_items
  ADD COLUMN IF NOT EXISTS service_type_id uuid REFERENCES service_types(id) ON DELETE SET NULL;
