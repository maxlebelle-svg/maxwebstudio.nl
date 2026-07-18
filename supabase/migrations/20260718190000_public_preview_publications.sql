-- Canonical, revocable public preview pointers for leads and customers.
-- Existing customer preview columns remain available as a legacy compatibility layer.

do $migration$
begin
  if to_regclass('public.leads') is null
     or to_regclass('public.customers') is null
     or to_regclass('public.website_preview_versions') is null
     or to_regclass('public.profiles') is null then
    raise exception 'Preflight failed: required public preview relationship tables do not exist';
  end if;

  create table if not exists public.public_preview_publications (
    id uuid primary key default gen_random_uuid(),
    relationship_type text not null,
    relationship_id uuid not null,
    public_slug text not null,
    preview_version_id uuid not null references public.website_preview_versions(id) on delete restrict,
    enabled boolean not null default true,
    published_at timestamptz not null default now(),
    revoked_at timestamptz null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    created_by uuid null references public.profiles(id) on delete set null,
    constraint public_preview_publications_relationship_type_check
      check (relationship_type in ('lead', 'customer')),
    constraint public_preview_publications_slug_format_check
      check (
        char_length(public_slug) between 3 and 64
        and public_slug = lower(public_slug)
        and public_slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
        and public_slug not in (
          'admin','api','assets','auth','account','billing','blog','contact','dashboard','demo','docs',
          'favicon','functions','help','home','images','index','klant','klanten','login','logout','mail',
          'manifest','max','preview','privacy','public','robots','sales','settings','sitemap','static',
          'status','support','terms','uploads','www'
        )
      ),
    constraint public_preview_publications_revocation_check
      check (enabled = false or revoked_at is null)
  );

  create unique index if not exists public_preview_publications_slug_unique_idx
    on public.public_preview_publications (lower(public_slug));

  create unique index if not exists public_preview_publications_active_relationship_unique_idx
    on public.public_preview_publications (relationship_type, relationship_id)
    where enabled = true;

  create index if not exists public_preview_publications_relationship_idx
    on public.public_preview_publications (relationship_type, relationship_id, updated_at desc);

  create index if not exists public_preview_publications_preview_version_idx
    on public.public_preview_publications (preview_version_id);

  alter table public.public_preview_publications enable row level security;
  alter table public.public_preview_publications force row level security;

  revoke all on table public.public_preview_publications from anon, authenticated;
  grant select, insert, update, delete on table public.public_preview_publications to service_role;
end
$migration$;

comment on table public.public_preview_publications is 'Canonical server-only public preview pointer for a lead or customer.';
comment on column public.public_preview_publications.relationship_id is 'Validated server-side against leads or customers according to relationship_type.';
comment on column public.public_preview_publications.public_slug is 'Stable public URL slug; case-insensitively unique across all public previews.';
comment on column public.public_preview_publications.preview_version_id is 'Explicit preview target; only an authenticated server action may change it.';
