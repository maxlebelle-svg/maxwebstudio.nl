-- Max Webstudio - Minimal Client Portal Indexes Draft
-- DRAFT ONLY
-- DO NOT RUN WITHOUT EXPLICIT APPROVAL
-- REVIEW RLS BEFORE PRODUCTION
--
-- Purpose:
-- Add only the indexes needed for the first production client portal baseline.
--
-- Run after:
-- - 000_production_existing_tables_alignment.sql
-- - 001_client_portal_baseline.sql
--
-- Explicitly excluded:
-- - finance, CRM, AI, files, logs, demo seed and broad platform tables.

begin;

create index if not exists profiles_auth_user_id_idx on public.profiles(auth_user_id);
create index if not exists profiles_role_status_idx on public.profiles(role, status);
create index if not exists profiles_email_idx on public.profiles(lower(email));
create index if not exists profiles_environment_idx on public.profiles(environment, is_demo);

create index if not exists customers_profile_id_idx on public.customers(profile_id);
create index if not exists customers_auth_user_id_idx on public.customers(auth_user_id);
create index if not exists customers_email_idx on public.customers(lower(email));
create index if not exists customers_status_idx on public.customers(status);
create index if not exists customers_portal_status_idx on public.customers(portal_status);
create index if not exists customers_environment_idx on public.customers(environment, is_demo);

create index if not exists websites_customer_id_idx on public.websites(customer_id);
create index if not exists websites_profile_id_idx on public.websites(profile_id);
create index if not exists websites_domain_idx on public.websites(lower(domain));
create index if not exists websites_status_idx on public.websites(status);
create index if not exists websites_environment_idx on public.websites(environment, is_demo);

create index if not exists projects_customer_id_idx on public.projects(customer_id);
create index if not exists projects_website_id_idx on public.projects(website_id);
create index if not exists projects_status_deadline_idx on public.projects(status, deadline);
create index if not exists projects_environment_idx on public.projects(environment, is_demo);

create index if not exists change_requests_customer_id_idx on public.change_requests(customer_id);
create index if not exists change_requests_auth_user_id_idx on public.change_requests(auth_user_id);
create index if not exists change_requests_website_id_idx on public.change_requests(website_id);
create index if not exists change_requests_project_id_idx on public.change_requests(project_id);
create index if not exists change_requests_status_idx on public.change_requests(status);
create index if not exists change_requests_created_at_idx on public.change_requests(created_at desc);
create index if not exists change_requests_environment_idx on public.change_requests(environment, is_demo);

create index if not exists client_portal_messages_customer_id_idx on public.client_portal_messages(customer_id);
create index if not exists client_portal_messages_profile_id_idx on public.client_portal_messages(profile_id);
create index if not exists client_portal_messages_status_idx on public.client_portal_messages(status);
create index if not exists client_portal_messages_created_at_idx on public.client_portal_messages(created_at desc);
create index if not exists client_portal_messages_environment_idx on public.client_portal_messages(environment, is_demo);

create index if not exists client_portal_notifications_customer_id_idx on public.client_portal_notifications(customer_id);
create index if not exists client_portal_notifications_profile_id_idx on public.client_portal_notifications(profile_id);
create index if not exists client_portal_notifications_status_idx on public.client_portal_notifications(status);
create index if not exists client_portal_notifications_created_at_idx on public.client_portal_notifications(created_at desc);
create index if not exists client_portal_notifications_environment_idx on public.client_portal_notifications(environment, is_demo);

commit;
