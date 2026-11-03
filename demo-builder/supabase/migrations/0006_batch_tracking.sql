-- Batch tracking: every CSV import is named so its conversion can be tracked
-- separately in the Analytics comparison table. Legacy leads have a null batch
-- and are grouped under "Unbatched" in the UI.
ALTER TABLE leads ADD COLUMN IF NOT EXISTS batch_name text;

-- Index for grouping leads by batch in the analytics table.
CREATE INDEX IF NOT EXISTS idx_leads_batch_name ON leads (batch_name);
