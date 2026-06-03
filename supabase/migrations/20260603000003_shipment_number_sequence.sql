-- ============================================================
-- Shipment number sequence
-- Replaces the racy max+1 approach with an atomic PostgreSQL
-- sequence so concurrent inserts never collide.
-- ============================================================

-- 1. Create the sequence.  The START value is a safe floor;
--    step 2 advances it past any numbers already in the table.
create sequence if not exists public.shipment_number_seq
  start with 1009
  increment by 1
  no maxvalue
  cache 1;

-- 2. Advance past the current maximum so existing rows are
--    untouched and the next generated value is always higher.
select setval(
  'public.shipment_number_seq',
  greatest(
    1009,
    coalesce(
      (
        select max(
          regexp_replace(shipment_number, '[^0-9]', '', 'g')::bigint
        )
        from public.incoming_shipments
        where shipment_number ~ '^IN-[0-9]+$'
      ),
      1008
    )
  ),
  true   -- is_called=true: next nextval() returns this value + 1
);

-- 3. Function called from the server action via supabase.rpc().
--    SECURITY DEFINER so it can access the sequence regardless
--    of the caller's role.
create or replace function public.next_shipment_number()
returns text
language plpgsql
security definer
set search_path = public
as $$
begin
  return 'IN-' || nextval('public.shipment_number_seq')::text;
end;
$$;

-- 4. Allow authenticated users (both admin and client) to call it.
grant execute on function public.next_shipment_number() to authenticated;
