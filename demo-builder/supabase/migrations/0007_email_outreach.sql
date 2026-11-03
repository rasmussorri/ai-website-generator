-- Email outreach columns on leads
ALTER TABLE leads ADD COLUMN IF NOT EXISTS email_status text;   -- null / sent / skipped / failed
ALTER TABLE leads ADD COLUMN IF NOT EXISTS email_sent_at timestamptz;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS gif_url text;        -- cached Vercel Blob URL

-- Immutable compliance log for email sends
CREATE TABLE IF NOT EXISTS email_compliance_log (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id            uuid NOT NULL REFERENCES leads(id),
  contact_email      text NOT NULL,
  company_name       text,
  title              text,
  employee_count     integer,
  data_source_url    text,
  reviewer_id        text,
  sent_at            timestamptz NOT NULL DEFAULT now(),
  resend_message_id  text,
  legal_basis        text,
  created_at         timestamptz NOT NULL DEFAULT now()
);

-- Email opt-out suppression (keyed by email address)
CREATE TABLE IF NOT EXISTS email_suppression (
  email       text PRIMARY KEY,
  created_at  timestamptz NOT NULL DEFAULT now()
);
