-- Migration: Add hash and timestamp columns to blockchain_events for compatibility
ALTER TABLE blockchain_events
ADD COLUMN IF NOT EXISTS hash TEXT,
ADD COLUMN IF NOT EXISTS timestamp TIMESTAMPTZ DEFAULT now();

UPDATE blockchain_events
SET hash = registered_hash
WHERE hash IS NULL;

UPDATE blockchain_events
SET timestamp = created_at
WHERE timestamp IS NULL;
