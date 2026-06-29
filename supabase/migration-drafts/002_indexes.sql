-- Max Webstudio - Supabase Indexes Draft
-- DRAFT ONLY
-- DO NOT RUN WITHOUT EXPLICIT APPROVAL
-- REVIEW RLS BEFORE PRODUCTION

create index if not exists profiles_auth_user_id_idx on public.profiles(auth_user_id);
create index if not exists profiles_role_status_idx on public.profiles(role, status);
create index if not exists profiles_email_idx on public.profiles(lower(email));

create index if not exists customers_profile_id_idx on public.customers(profile_id);
create index if not exists customers_auth_user_id_idx on public.customers(auth_user_id);
create index if not exists customers_email_idx on public.customers(lower(email));
create index if not exists customers_status_idx on public.customers(status);
create index if not exists customers_environment_idx on public.customers(environment, is_demo);

create index if not exists leads_status_idx on public.leads(status);
create index if not exists leads_score_idx on public.leads(lead_score);
create index if not exists leads_follow_up_idx on public.leads(follow_up_date);
create index if not exists leads_converted_customer_idx on public.leads(converted_customer_id);

create index if not exists websites_customer_id_idx on public.websites(customer_id);
create index if not exists websites_domain_idx on public.websites(lower(domain));
create index if not exists websites_status_idx on public.websites(status);

create index if not exists projects_customer_id_idx on public.projects(customer_id);
create index if not exists projects_website_id_idx on public.projects(website_id);
create index if not exists projects_status_deadline_idx on public.projects(status, deadline);

create index if not exists quotes_customer_id_idx on public.quotes(customer_id);
create index if not exists quotes_project_id_idx on public.quotes(project_id);
create index if not exists quotes_status_idx on public.quotes(status);
create index if not exists quotes_number_idx on public.quotes(quote_number);
create index if not exists quote_lines_quote_id_idx on public.quote_lines(quote_id);

create index if not exists invoices_customer_id_idx on public.invoices(customer_id);
create index if not exists invoices_project_id_idx on public.invoices(project_id);
create index if not exists invoices_subscription_id_idx on public.invoices(subscription_id);
create index if not exists invoices_status_due_idx on public.invoices(status, due_date);
create index if not exists invoices_number_idx on public.invoices(invoice_number);
create index if not exists invoices_mollie_payment_idx on public.invoices(mollie_payment_id);
create index if not exists invoice_lines_invoice_id_idx on public.invoice_lines(invoice_id);

create index if not exists subscriptions_customer_id_idx on public.subscriptions(customer_id);
create index if not exists subscriptions_website_id_idx on public.subscriptions(website_id);
create index if not exists subscriptions_status_idx on public.subscriptions(status);
create index if not exists subscriptions_next_invoice_idx on public.subscriptions(next_invoice_date);
create index if not exists subscriptions_risk_idx on public.subscriptions(subscription_risk_level);

create index if not exists files_customer_id_idx on public.files(customer_id);
create index if not exists files_project_id_idx on public.files(project_id);
create index if not exists files_status_category_idx on public.files(status, category);
create index if not exists files_storage_path_idx on public.files(storage_path);

create index if not exists change_requests_customer_id_idx on public.change_requests(customer_id);
create index if not exists change_requests_auth_user_id_idx on public.change_requests(auth_user_id);
create index if not exists change_requests_status_idx on public.change_requests(status);
create index if not exists change_requests_created_at_idx on public.change_requests(created_at desc);

create index if not exists crm_tasks_customer_id_idx on public.crm_tasks(customer_id);
create index if not exists crm_tasks_lead_id_idx on public.crm_tasks(lead_id);
create index if not exists crm_tasks_assigned_profile_idx on public.crm_tasks(assigned_profile_id);
create index if not exists crm_tasks_status_due_idx on public.crm_tasks(status, due_date);

create index if not exists client_portal_messages_customer_id_idx on public.client_portal_messages(customer_id);
create index if not exists client_portal_messages_status_idx on public.client_portal_messages(status);
create index if not exists client_portal_notifications_customer_id_idx on public.client_portal_notifications(customer_id);
create index if not exists client_portal_notifications_status_idx on public.client_portal_notifications(status);

create index if not exists ai_drafts_customer_id_idx on public.ai_drafts(customer_id);
create index if not exists ai_drafts_status_idx on public.ai_drafts(status);
create index if not exists ai_assistant_drafts_customer_id_idx on public.ai_assistant_drafts(customer_id);
create index if not exists ai_assistant_drafts_entity_idx on public.ai_assistant_drafts(entity_type, entity_id);

create index if not exists activity_logs_customer_id_idx on public.activity_logs(customer_id);
create index if not exists activity_logs_entity_idx on public.activity_logs(entity_type, entity_id);
create index if not exists activity_logs_created_at_idx on public.activity_logs(created_at desc);
create index if not exists audit_logs_actor_profile_idx on public.audit_logs(actor_profile_id);
create index if not exists audit_logs_entity_idx on public.audit_logs(entity_type, entity_id);
create index if not exists audit_logs_created_at_idx on public.audit_logs(created_at desc);

