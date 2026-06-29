-- Max Webstudio - Supabase RLS Enablement Draft
-- DRAFT ONLY
-- DO NOT RUN WITHOUT EXPLICIT APPROVAL
-- REVIEW RLS BEFORE PRODUCTION

alter table public.profiles enable row level security;
alter table public.customers enable row level security;
alter table public.leads enable row level security;
alter table public.websites enable row level security;
alter table public.projects enable row level security;
alter table public.quotes enable row level security;
alter table public.quote_lines enable row level security;
alter table public.invoices enable row level security;
alter table public.invoice_lines enable row level security;
alter table public.subscriptions enable row level security;
alter table public.files enable row level security;
alter table public.change_requests enable row level security;
alter table public.crm_tasks enable row level security;
alter table public.client_portal_messages enable row level security;
alter table public.client_portal_notifications enable row level security;
alter table public.ai_drafts enable row level security;
alter table public.ai_assistant_drafts enable row level security;
alter table public.settings enable row level security;
alter table public.demo_emails enable row level security;
alter table public.activity_logs enable row level security;
alter table public.import_logs enable row level security;
alter table public.audit_logs enable row level security;

