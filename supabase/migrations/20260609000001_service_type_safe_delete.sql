-- Allow service types to be hard deleted while preserving historical request
-- and invoice snapshots.

-- service_request_services may already exist in production with a restrictive
-- FK. Backfill snapshots first, then make the relationship nullable and
-- recreate the FK as ON DELETE SET NULL.
ALTER TABLE public.service_request_services
  ADD COLUMN IF NOT EXISTS service_name text,
  ADD COLUMN IF NOT EXISTS service_description text,
  ADD COLUMN IF NOT EXISTS service_unit text,
  ADD COLUMN IF NOT EXISTS total numeric(12,2);

UPDATE public.service_request_services srs
SET
  service_name          = COALESCE(srs.service_name, srs.service_name_snapshot, st.name),
  service_description   = COALESCE(srs.service_description, NULL),
  service_unit          = COALESCE(srs.service_unit, 'unit'),
  unit_price            = COALESCE(srs.unit_price, st.price, 0),
  total_price           = COALESCE(srs.total_price, srs.quantity * COALESCE(srs.unit_price, st.price, 0)),
  total                 = COALESCE(srs.total, srs.total_price, srs.quantity * COALESCE(srs.unit_price, st.price, 0)),
  service_name_snapshot = COALESCE(srs.service_name_snapshot, srs.service_name, st.name, 'Deleted service')
FROM public.service_types st
WHERE srs.service_type_id = st.id;

UPDATE public.service_request_services
SET
  service_name          = COALESCE(service_name, service_name_snapshot, 'Deleted service'),
  service_unit          = COALESCE(service_unit, 'unit'),
  unit_price            = COALESCE(unit_price, 0),
  total_price           = COALESCE(total_price, quantity * COALESCE(unit_price, 0)),
  total                 = COALESCE(total, total_price, quantity * COALESCE(unit_price, 0)),
  service_name_snapshot = COALESCE(service_name_snapshot, service_name, 'Deleted service');

ALTER TABLE public.service_request_services
  ALTER COLUMN service_type_id DROP NOT NULL;

ALTER TABLE public.service_request_services
  DROP CONSTRAINT IF EXISTS service_request_services_service_type_id_fkey;

ALTER TABLE public.service_request_services
  ADD CONSTRAINT service_request_services_service_type_id_fkey
  FOREIGN KEY (service_type_id) REFERENCES public.service_types(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS service_request_services_service_type_id_idx
  ON public.service_request_services (service_type_id);

-- invoice_items already stores description, service_name, quantity,
-- unit_price, and generated total in current migrations. Add the nullable
-- service type reference and optional service snapshot fields, then recreate
-- the FK as ON DELETE SET NULL for databases where it already exists.
ALTER TABLE public.invoice_items
  ADD COLUMN IF NOT EXISTS product_name text,
  ADD COLUMN IF NOT EXISTS service_name text,
  ADD COLUMN IF NOT EXISTS service_type_id uuid,
  ADD COLUMN IF NOT EXISTS service_description text,
  ADD COLUMN IF NOT EXISTS service_unit text;

UPDATE public.invoice_items ii
SET
  service_name = COALESCE(ii.service_name, st.name, ii.description),
  service_unit = COALESCE(ii.service_unit, 'unit')
FROM public.service_types st
WHERE ii.service_type_id = st.id;

UPDATE public.invoice_items
SET
  service_name = COALESCE(service_name, description),
  service_unit = COALESCE(service_unit, 'unit');

ALTER TABLE public.invoice_items
  ALTER COLUMN service_type_id DROP NOT NULL;

ALTER TABLE public.invoice_items
  DROP CONSTRAINT IF EXISTS invoice_items_service_type_id_fkey;

ALTER TABLE public.invoice_items
  ADD CONSTRAINT invoice_items_service_type_id_fkey
  FOREIGN KEY (service_type_id) REFERENCES public.service_types(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS invoice_items_service_type_id_idx
  ON public.invoice_items (service_type_id);
