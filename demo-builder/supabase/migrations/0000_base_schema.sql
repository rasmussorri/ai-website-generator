-- Base schema: the leads table and the lead-images storage bucket.
-- Every later migration assumes these exist. Written idempotently so it is a
-- no-op on databases that were created by hand before this file existed —
-- only a fresh Supabase project actually gets anything from it.

create table if not exists leads (
  id                  uuid primary key default gen_random_uuid(),
  created_at          timestamptz not null default now(),
  company_name        text,
  ceo_name            text,
  url                 text,
  phone               text,
  email               text,
  city                text,
  industry            text,
  site_quality        text,
  site_quality_reason text,
  site_quality_flags  text[],
  funnel_stage        text,
  has_demo_built      boolean default false,
  demo_slug           text,
  demo_url            text,
  content             jsonb
);

-- Written by the generation pipeline; was never part of the hand-run schema.
alter table leads add column if not exists demo_built_at timestamptz;

-- Public bucket for scraped logos/hero images used by the demo pages.
insert into storage.buckets (id, name, public)
values ('lead-images', 'lead-images', true)
on conflict (id) do nothing;
