-- Store FBM additional-item pricing snapshots on service request service rows.
-- Non-destructive: existing rows are kept and backfilled with safe defaults.

alter table public.service_request_services
  add column if not exists total_units integer not null default 1 check (total_units >= 0),
  add column if not exists base_order_fee numeric(10,2) not null default 0 check (base_order_fee >= 0),
  add column if not exists additional_item_quantity integer not null default 0 check (additional_item_quantity >= 0),
  add column if not exists additional_item_fee numeric(10,2) not null default 0.50 check (additional_item_fee >= 0),
  add column if not exists additional_item_total numeric(10,2) not null default 0 check (additional_item_total >= 0),
  add column if not exists service_total numeric(10,2) not null default 0 check (service_total >= 0);

update public.service_request_services
set
  total_units = greatest(coalesce(quantity, 1), 1),
  base_order_fee = coalesce(unit_price, 0),
  additional_item_quantity = case
    when coalesce(service_name_snapshot, '') = 'FBM Fulfillment'
      then greatest(coalesce(quantity, 1) - 1, 0)
    else 0
  end,
  additional_item_fee = coalesce(additional_item_fee, 0.50),
  additional_item_total = case
    when coalesce(service_name_snapshot, '') = 'FBM Fulfillment'
      then greatest(coalesce(quantity, 1) - 1, 0) * coalesce(additional_item_fee, 0.50)
    else 0
  end,
  service_total = case
    when coalesce(service_name_snapshot, '') = 'FBM Fulfillment'
      then coalesce(unit_price, 0) + (greatest(coalesce(quantity, 1) - 1, 0) * coalesce(additional_item_fee, 0.50))
    else coalesce(total_price, coalesce(quantity, 1) * coalesce(unit_price, 0))
  end
where service_total = 0;
