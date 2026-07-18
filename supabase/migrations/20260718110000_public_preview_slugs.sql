-- Stable, revocable public preview URLs. The slug belongs to the customer-level
-- publication pointer so publishing a new version keeps the same public URL.

do $migration$
begin
  if to_regclass('public.customers') is null then
    raise exception 'Preflight failed: public.customers does not exist';
  end if;

  alter table public.customers
    add column if not exists public_preview_slug text null,
    add column if not exists public_preview_enabled boolean not null default false,
    add column if not exists public_preview_created_at timestamptz null,
    add column if not exists public_preview_updated_at timestamptz null,
    add column if not exists public_preview_revoked_at timestamptz null;

  if not exists (
    select 1 from pg_constraint
    where conname = 'customers_public_preview_slug_format_check'
      and conrelid = 'public.customers'::regclass
  ) then
    alter table public.customers
      add constraint customers_public_preview_slug_format_check
      check (
        public_preview_slug is null
        or (
          char_length(public_preview_slug) between 3 and 64
          and public_preview_slug = lower(public_preview_slug)
          and public_preview_slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
          and public_preview_slug not in (
            'admin','api','assets','auth','account','billing','blog','contact','dashboard','demo','docs',
            'favicon','functions','help','home','images','index','klant','klanten','login','logout','mail',
            'manifest','max','preview','privacy','public','robots','sales','settings','sitemap','static',
            'status','support','terms','uploads','www'
          )
        )
      );
  end if;

  create unique index if not exists customers_public_preview_slug_unique_idx
    on public.customers (lower(public_preview_slug))
    where public_preview_slug is not null;

  create index if not exists customers_public_preview_enabled_idx
    on public.customers (public_preview_enabled)
    where public_preview_enabled = true;
end
$migration$;

comment on column public.customers.public_preview_slug is 'Stable public preview slug; resolves through metadata.publishedPreviewVersionId.';
comment on column public.customers.public_preview_enabled is 'Explicit public share switch; false makes the resolver return gone.';
