-- Conversation inbox: mirrors every sent/received SMS so the dashboard can
-- show a full two-way thread per lead.
-- The initial outreach message is mirrored here (from the approve route) in
-- addition to being stored in sms_compliance_log (the legal paper trail).

create table if not exists sms_messages (
  id          uuid primary key default gen_random_uuid(),
  lead_id     uuid not null,
  direction   text not null check (direction in ('inbound', 'outbound')),
  body        text not null,
  twilio_sid  text,
  created_at  timestamptz not null default now()
);

create index if not exists idx_sms_messages_lead on sms_messages (lead_id, created_at);

-- 'answered' funnel stage: set automatically when a customer replies to an SMS.
-- Already in the TypeScript FunnelStage union; no schema change needed since
-- funnel_stage is a free-text column.
