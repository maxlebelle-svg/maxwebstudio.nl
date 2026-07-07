-- 022_delivery_payment_lock_workflow.sql
-- Proposal draft for day-3 preview deposit, day-5 final payment and delivery document lock.
-- Do not run without explicit GO. Designed for canonical public.projects, public.invoices and public.files.

alter table if exists public.projects
  add column if not exists payment_flow_type text not null default 'deposit_then_remaining'
    check (payment_flow_type in ('deposit_then_remaining', 'no_cure_no_pay_full_on_delivery')),
  add column if not exists preview_approval_status text not null default 'pending'
    check (preview_approval_status in ('pending', 'approved', 'feedback_requested', 'rejected')),
  add column if not exists preview_approved_at timestamptz,
  add column if not exists preview_approved_by uuid,
  add column if not exists delivery_approval_status text not null default 'pending'
    check (delivery_approval_status in ('pending', 'approved', 'blocked_until_paid')),
  add column if not exists delivery_approved_at timestamptz,
  add column if not exists delivery_approved_by uuid,
  add column if not exists deposit_invoice_id uuid references public.invoices(id) on delete set null,
  add column if not exists final_invoice_id uuid references public.invoices(id) on delete set null,
  add column if not exists delivery_lock_status text not null default 'locked'
    check (delivery_lock_status in ('locked', 'preview_only', 'unlocked')),
  add column if not exists delivery_unlocked_at timestamptz,
  add column if not exists delivery_unlocked_by text;

alter table if exists public.files
  add column if not exists delivery_visibility text not null default 'internal'
    check (delivery_visibility in ('internal', 'preview', 'delivery')),
  add column if not exists requires_paid_delivery boolean not null default true,
  add column if not exists unlocked_at timestamptz;

alter table if exists public.client_email_events
  drop constraint if exists client_email_events_email_type_check;

alter table if exists public.client_email_events
  add constraint client_email_events_email_type_check check (email_type in (
    'day1_received',
    'portal_activated',
    'day2_concept',
    'day3_preview_ready',
    'deposit_paid_confirmation',
    'day4_feedback_refinement',
    'day5_delivery_ready',
    'delivery_unlocked'
  ));

create index if not exists projects_deposit_invoice_id_idx
  on public.projects(deposit_invoice_id)
  where deposit_invoice_id is not null;

create index if not exists projects_final_invoice_id_idx
  on public.projects(final_invoice_id)
  where final_invoice_id is not null;

create index if not exists projects_delivery_lock_status_idx
  on public.projects(delivery_lock_status);

create index if not exists files_delivery_visibility_idx
  on public.files(project_id, delivery_visibility, requires_paid_delivery);

comment on column public.projects.payment_flow_type is
  'Delivery payment policy: deposit after day-3 preview or full payment on day-5 delivery.';

comment on column public.projects.delivery_lock_status is
  'Controls whether client can access final delivery files. Only webhook/admin unlock should set unlocked.';

comment on column public.files.requires_paid_delivery is
  'If true, customer download requires project.delivery_lock_status = unlocked.';
