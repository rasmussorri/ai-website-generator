-- Refine open-tracking so a demo only counts as "opened" when the open happens
-- AFTER the lead was contacted. This stops the salesperson's own pre-send QA
-- opens from marking a demo opened (and from blocking auto-cleanup).
-- Staff opens after sending are excluded separately via the #smview link hash.
-- Run once in the Supabase SQL editor. Safe to re-run (create or replace).

create or replace function record_demo_open(p_slug text) returns void as $$
  update leads set
    demo_opened_at  = coalesce(demo_opened_at, now()),
    demo_open_count = coalesce(demo_open_count, 0) + 1
  where demo_slug = p_slug
    and content is not null
    and sms_sent_at is not null      -- only after the lead has been contacted
    and now() >= sms_sent_at;
$$ language sql;
