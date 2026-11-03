-- Demo open-tracking + auto-cleanup of unopened demos.
-- Run once in the Supabase SQL editor. Safe to re-run.

-- 1) Open-tracking + expiry columns on leads.
alter table leads add column if not exists demo_opened_at  timestamptz;
alter table leads add column if not exists demo_open_count int default 0;
alter table leads add column if not exists demo_deleted_at timestamptz;

-- 2) Atomic recorder called by the public /api/track-open beacon.
--    Sets the first-open timestamp once and bumps the counter on every real load.
--    Only matches live demos (content not null) so expired pages never re-arm.
create or replace function record_demo_open(p_slug text) returns void as $$
  update leads set
    demo_opened_at  = coalesce(demo_opened_at, now()),
    demo_open_count = coalesce(demo_open_count, 0) + 1
  where demo_slug = p_slug and content is not null;
$$ language sql;
