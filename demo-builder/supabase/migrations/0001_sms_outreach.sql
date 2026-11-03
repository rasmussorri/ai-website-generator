-- SMS outreach state, suppression, and audit records.
-- Applied by npm run migrate.
-- Safe to re-run: every statement is guarded with IF NOT EXISTS.

-- gen_random_uuid() lives in pgcrypto; enabled by default on Supabase, but be explicit.
create extension if not exists pgcrypto;

-- 1) Outreach state + compliance fields on the existing leads table.
alter table leads add column if not exists title         text default 'Toimitusjohtaja';
alter table leads add column if not exists company_size  int;
alter table leads add column if not exists sms_status     text;          -- null | 'sent' | 'skipped' | 'failed'
alter table leads add column if not exists sms_sent_at    timestamptz;

-- 2) Opt-out / suppression list. One row per phone number that must never be contacted.
create table if not exists sms_suppression (
  phone      text primary key,            -- E.164, e.g. +358401234567
  reason     text not null default 'stop',-- 'stop' (inbound) | 'manual'
  keyword    text,                        -- the raw inbound word that triggered it
  lead_id    uuid,
  created_at timestamptz not null default now()
);

-- 3) Immutable compliance log. Insert-only paper trail for every send.
create table if not exists sms_compliance_log (
  id              uuid primary key default gen_random_uuid(),
  lead_id         uuid,
  company_name    text,
  ceo_name        text,
  title           text,
  company_size    int,
  data_source_url text,                   -- the lead's own URL = where the contact data came from
  phone           text,
  message_body    text,
  demo_url        text,
  reviewer_id     text,
  legal_basis     text,
  twilio_sid      text,
  send_mode       text,                   -- 'live' | 'dry-run'
  created_at      timestamptz not null default now()
);

-- Helpful indexes for the review queue and audits.
create index if not exists idx_leads_sms_status on leads (sms_status);
create index if not exists idx_compliance_lead   on sms_compliance_log (lead_id);
