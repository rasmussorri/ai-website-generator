-- Count demo opens after ANY first contact, not only SMS. Email-only leads
-- (email_sent_at set, sms_sent_at null) previously never registered an open,
-- which also left their demos out of the unopened-demo cleanup.

create or replace function record_demo_open(p_slug text) returns void as $$
  update leads set
    demo_opened_at  = coalesce(demo_opened_at, now()),
    demo_open_count = coalesce(demo_open_count, 0) + 1
  where demo_slug = p_slug
    and content is not null
    and coalesce(sms_sent_at, email_sent_at) is not null  -- only after the lead has been contacted
    and now() >= least(sms_sent_at, email_sent_at);       -- least() ignores nulls
$$ language sql;
