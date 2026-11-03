-- Track which inbound messages the salesperson has seen so the funnel can
-- highlight cards with new replies.
ALTER TABLE sms_messages ADD COLUMN IF NOT EXISTS read_at timestamptz;

-- Index for fast "unread per lead" look-ups.
CREATE INDEX IF NOT EXISTS idx_sms_messages_unread
  ON sms_messages (lead_id)
  WHERE read_at IS NULL AND direction = 'inbound';
