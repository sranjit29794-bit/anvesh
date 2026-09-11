-- Migration: Fix sensitivity_level::text cast in match_document_chunks
CREATE OR REPLACE FUNCTION match_document_chunks(
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
  caller_id uuid;
  caller_role text;
  allowed_sensitivities text[];
BEGIN
  -- Extract calling user ID from active JWT session
  caller_id := auth.uid();
  IF caller_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required for semantic retrieval';
  END IF;

  -- Derive clearance from profiles table
  SELECT role INTO caller_role FROM profiles WHERE profiles.id = caller_id;
  IF caller_role IS NULL THEN
    caller_role := 'OFFICER';
  END IF;

  -- Map clearance to permitted sensitivity levels (case-insensitive)
  IF UPPER(caller_role) IN ('ADMIN', 'SUPERVISOR', 'OFFICER', 'INVESTIGATOR', 'FORENSIC_OFFICER') THEN
    allowed_sensitivities := ARRAY['A', 'B', 'C'];
  ELSIF UPPER(caller_role) IN ('JUDGE', 'PROSECUTOR', 'REVIEWER') THEN
    allowed_sensitivities := ARRAY['A', 'B', 'C'];
  ELSE
    allowed_sensitivities := ARRAY['C'];
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
    -- Case filtering
    (filter_case_id IS NULL OR de.case_id = filter_case_id)
    -- Sensitivity filtering
    AND de.sensitivity_level::text = ANY(allowed_sensitivities)
    -- ABAC Case-access & Sharing Grant Check
    AND (
      UPPER(caller_role) IN ('ADMIN', 'SUPERVISOR')
      OR EXISTS (
        SELECT 1 FROM case_assignments ca
        WHERE ca.case_id = de.case_id
          AND ca.user_id = caller_id
      )
      OR EXISTS (
        SELECT 1 FROM sharing_events se
        WHERE se.document_id = de.document_id
          AND se.shared_with = caller_id
          AND se.approval_status = 'approved'
          AND (se.access_expires_at IS NULL OR se.access_expires_at > now())
      )
    )
    -- Attestation Workflow Check:
    -- Never return REJECTED documents to ANY user in search
    AND d.status != 'REJECTED'
    -- Return ACTIVE documents or PENDING_REVIEW if caller is supervisor/admin or uploader
    AND (
      d.status = 'ACTIVE'
      OR (
        d.status = 'PENDING_REVIEW' AND (
          UPPER(caller_role) IN ('SUPERVISOR', 'ADMIN')
          OR d.uploaded_by = caller_id
        )
      )
    )
  ORDER BY de.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;
