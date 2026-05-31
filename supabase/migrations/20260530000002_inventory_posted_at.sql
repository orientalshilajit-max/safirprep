-- Track when inventory was posted for a received shipment (replaces boolean inventory_synced)
alter table incoming_shipments
  add column if not exists inventory_posted_at timestamptz;

-- Backfill: rows already marked synced get a posted_at timestamp
update incoming_shipments
set inventory_posted_at = updated_at
where inventory_synced = true
  and inventory_posted_at is null;
