-- Add price and visibility columns to service_types
alter table public.service_types
  add column if not exists price               numeric(10,2) not null default 0,
  add column if not exists visible_to_customers boolean      not null default true;

-- Create company-assets storage bucket (public read, service-role write)
insert into storage.buckets (id, name, public)
values ('company-assets', 'company-assets', true)
on conflict (id) do nothing;
