-- Migration: Add timestamp column to audit_log for compatibility
ALTER TABLE audit_log
ADD COLUMN IF NOT EXISTS timestamp TIMESTAMPTZ DEFAULT now();

UPDATE audit_log
SET timestamp = created_at
WHERE timestamp IS NULL;
