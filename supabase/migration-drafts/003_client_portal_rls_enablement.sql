-- Max Webstudio - Minimal Client Portal RLS Enablement Draft
-- DRAFT ONLY
-- DO NOT RUN WITHOUT EXPLICIT APPROVAL
-- REVIEW RLS BEFORE PRODUCTION
--
-- Purpose:
-- Enable RLS only for the first production client portal baseline tables.
--
-- Run after:
-- - 002_client_portal_indexes.sql
--
-- Explicitly excluded:
-- - finance, CRM, AI, files, logs, demo seed and broad platform tables.

begin;

alter table public.profiles enable row level security;
alter table public.customers enable row level security;
alter table public.websites enable row level security;
alter table public.projects enable row level security;
alter table public.change_requests enable row level security;
alter table public.client_portal_messages enable row level security;
alter table public.client_portal_notifications enable row level security;

commit;
