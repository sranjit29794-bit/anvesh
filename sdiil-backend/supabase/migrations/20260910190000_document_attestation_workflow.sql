-- Migration 21: Document Attestation Workflow
-- Adds document status (PENDING_REVIEW, ACTIVE, REJECTED), review metadata,
-- and updates RLS and RPC retrieval to respect document attestation states.

-- 1. Alter documents table schema
ALTER TABLE documents 
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'PENDING_REVIEW',
  ADD COLUMN IF NOT EXISTS reviewed_by uuid REFERENCES profiles(id),
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS review_note text;

-- 2. Enforce CHECK constraint on status
ALTER TABLE documents DROP CONSTRAINT IF EXISTS documents_status_check;
ALTER TABLE documents ADD CONSTRAINT documents_status_check 
  CHECK (status IN ('PENDING_REVIEW', 'ACTIVE', 'REJECTED'));

-- 3. Backfill all existing documents to ACTIVE
UPDATE documents SET status = 'ACTIVE' WHERE status IS NULL OR status = 'PENDING_REVIEW';

-- 4. Set default value for future inserts to PENDING_REVIEW
ALTER TABLE documents ALTER COLUMN status SET DEFAULT 'PENDING_REVIEW';

-- 5. Update match_document_chunks RPC to filter by document status
DROP FUNCTION IF EXISTS match_document_chunks(vector, int, uuid);

CREATE OR REPLACE FUNCTION match_document_chunks (
  query_embedding vector(1536),
  match_count int DEFAULT 5,
  filter_case_id uuid DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  document_id uuid,
  document_title text,
  doc_type text,
  case_id uuid,
  case_number text,
  chunk_index int,
  chunk_text text,
  sensitivity_level text,
  similarity float
)
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_user_role text;
  v_allowed_sensitivities text[];
BEGIN
  -- Resolve caller role
  SELECT role INTO v_user_role FROM profiles WHERE profiles.id = v_user_id;

  -- Normalize role comparison
  v_user_role := lower(coalesce(v_user_role, ''));

  -- Derive allowed sensitivity levels strictly from validated user role clearance
  IF v_user_role IN ('admin', 'supervisor', 'officer', 'investigator', 'forensic_officer') THEN
    v_allowed_sensitivities := ARRAY['A', 'B', 'C'];
  ELSIF v_user_role IN ('judge', 'prosecutor', 'reviewer') THEN
    v_allowed_sensitivities := ARRAY['A', 'B', 'C'];
  ELSIF v_user_role IN ('court_registrar', 'clerk') THEN
    v_allowed_sensitivities := ARRAY['C'];
  ELSE
    v_allowed_sensitivities := ARRAY['C'];
  END IF;

  RETURN QUERY
  SELECT
    de.id,
    de.document_id,
    d.title AS document_title,
    d.doc_type,
    de.case_id,
    c.case_number,
    de.chunk_index,
    de.chunk_text,
    de.sensitivity_level::text,
    (1 - (de.embedding <=> query_embedding))::float AS similarity
  FROM document_embeddings de
  JOIN documents d ON d.id = de.document_id
  JOIN cases c ON c.id = de.case_id
  WHERE
    -- Case filter (if specified)
    (filter_case_id IS NULL OR de.case_id = filter_case_id)
    -- ABAC clearance filter
    AND de.sensitivity_level::text = ANY(v_allowed_sensitivities)
    -- Document Attestation Filter:
    -- SUPERVISOR / ADMIN sees all documents
    -- OFFICER / INVESTIGATOR sees ACTIVE + own PENDING_REVIEW / REJECTED
    -- Others see only ACTIVE
    AND (
      v_user_role IN ('admin', 'supervisor')
      OR (v_user_role IN ('officer', 'investigator') AND (d.status = 'ACTIVE' OR (d.status IN ('PENDING_REVIEW', 'REJECTED') AND d.uploaded_by = v_user_id)))
      OR (v_user_role NOT IN ('admin', 'supervisor', 'officer', 'investigator') AND d.status = 'ACTIVE')
    )
    -- ABAC access filter: user must be assigned to case, or have an active approved share, or be admin/supervisor
    AND (
      v_user_role IN ('admin', 'supervisor')
      OR EXISTS (
        SELECT 1 FROM case_assignments ca
        WHERE ca.case_id = de.case_id
        AND ca.user_id = v_user_id
      )
      OR EXISTS (
        SELECT 1 FROM sharing_events se
        WHERE se.document_id = de.document_id
        AND se.shared_with = v_user_id
        AND se.approval_status = 'approved'
        AND se.access_expires_at > now()
      )
    )
  ORDER BY de.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;
