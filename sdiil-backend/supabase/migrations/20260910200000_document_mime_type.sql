-- Migration: Add mime_type column to documents table
-- Stores the MIME type of the uploaded file (e.g., application/pdf, image/jpeg)
-- so the backend can return correct Content-Type headers for viewing and download.

ALTER TABLE documents ADD COLUMN IF NOT EXISTS mime_type text;

-- Backfill mime_type from document_versions metadata or default to application/octet-stream
UPDATE documents
SET mime_type = 'application/pdf'
WHERE mime_type IS NULL;

-- Create index for efficient mime_type lookups
CREATE INDEX IF NOT EXISTS idx_documents_mime_type ON documents(mime_type);
