-- Migration: Add doc_id column to audit_log for direct doc referencing
ALTER TABLE audit_log
ADD COLUMN IF NOT EXISTS doc_id UUID REFERENCES documents(id) ON DELETE SET NULL;

-- Backfill doc_id from resource_id where resource_type = 'document'
UPDATE audit_log
SET doc_id = resource_id
WHERE doc_id IS NULL AND resource_type = 'document';
