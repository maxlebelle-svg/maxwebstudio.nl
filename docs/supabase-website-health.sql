-- Supabase schema extension for Website Health Monitoring.
-- Run this after /docs/supabase-client-portal.sql.
-- Safe migration only: no data is removed and no tables are dropped.

alter table public.customer_websites
  add column if not exists uptime_status text default 'unknown',
  add column if not exists ssl_expires_at timestamptz,
  add column if not exists performance_score integer,
  add column if not exists seo_score integer,
  add column if not exists mobile_score integer,
  add column if not exists desktop_score integer,
  add column if not exists last_uptime_check timestamptz,
  add column if not exists dns_status text default 'unknown',
  add column if not exists monitor_enabled boolean default true;

create index if not exists customer_websites_uptime_status_idx
  on public.customer_websites (uptime_status);

create index if not exists customer_websites_dns_status_idx
  on public.customer_websites (dns_status);

create index if not exists customer_websites_monitor_enabled_idx
  on public.customer_websites (monitor_enabled);

create index if not exists customer_websites_last_uptime_check_idx
  on public.customer_websites (last_uptime_check);
