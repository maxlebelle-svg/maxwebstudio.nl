-- Keep the production build-job status constraint aligned with the retry flow.

begin;

alter table public.website_build_jobs
  drop constraint if exists website_build_jobs_status_check;

alter table public.website_build_jobs
  add constraint website_build_jobs_status_check check (
    status in (
      'queued',
      'briefing',
      'building',
      'quality_check',
      'deploying',
      'completed',
      'quality_failed',
      'retryable',
      'failed'
    )
  );

commit;
