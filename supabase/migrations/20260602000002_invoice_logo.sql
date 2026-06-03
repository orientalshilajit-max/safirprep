-- Separate logo for invoice previews/PDFs (dark-on-white branding)
alter table public.company_settings
  add column if not exists invoice_logo_url text;
