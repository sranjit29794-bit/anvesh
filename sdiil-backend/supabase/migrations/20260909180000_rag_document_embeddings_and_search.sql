-- Migration 20260909180000 — RAG Document Embeddings RLS & Stored Procedure
-- Enforces rule-abac-filter-at-retrieval-layer strictly at the database level

-- 1. Enable RLS on document_embeddings
alter table document_embeddings enable row level security;

-- Drop existing policies if any
drop policy if exists "document_embeddings_select" on document_embeddings;
drop policy if exists "document_embeddings_insert" on document_embeddings;
drop policy if exists "document_embeddings_delete" on document_embeddings;

-- 2. RLS SELECT Policy on document_embeddings
-- Users can only select chunks belonging to cases they are assigned to,
-- or documents actively shared with them, or if they are admin/supervisor.
create policy "document_embeddings_select"
on document_embeddings for select
using (
  -- Admin / Supervisor full access
  exists (
    select 1 from profiles p
    where p.id = auth.uid()
    and p.role in ('admin', 'supervisor')
  )
  -- Or user is directly assigned to the case
  or exists (
    select 1 from case_assignments ca
    where ca.case_id = document_embeddings.case_id
    and ca.user_id = auth.uid()
  )
  -- Or user has an active, approved, unexpired share grant
  or exists (
    select 1 from sharing_events se
    where se.document_id = document_embeddings.document_id
    and se.shared_with = auth.uid()
    and se.approval_status = 'approved'
    and se.access_expires_at > now()
  )
);

-- 3. RLS INSERT Policy on document_embeddings
-- Allows authenticated users assigned to the case (or admin/supervisor) to insert chunks during ingest
create policy "document_embeddings_insert"
on document_embeddings for insert
with check (
  auth.role() = 'authenticated'
  and (
    exists (
      select 1 from profiles p
      where p.id = auth.uid()
      and p.role in ('admin', 'supervisor')
    )
    or exists (
      select 1 from case_assignments ca
      where ca.case_id = document_embeddings.case_id
      and ca.user_id = auth.uid()
    )
  )
);

-- 4. RLS DELETE Policy on document_embeddings (for version replacement)
create policy "document_embeddings_delete"
on document_embeddings for delete
using (
  auth.role() = 'authenticated'
  and (
    exists (
      select 1 from profiles p
      where p.id = auth.uid()
      and p.role in ('admin', 'supervisor')
    )
    or exists (
      select 1 from case_assignments ca
      where ca.case_id = document_embeddings.case_id
      and ca.user_id = auth.uid()
    )
  )
);

-- 5. Stored Procedure: match_document_chunks
-- Executes pgvector cosine similarity search with mandatory SQL-level ABAC filters
-- rule-abac-filter-at-retrieval-layer: Filters for case_id, role_access, and sensitivity_level
-- must execute in the SQL query itself before any chunk is returned to the application layer.
create or replace function match_document_chunks (
  query_embedding vector(1536),
  match_count int default 5,
  filter_case_id uuid default null
)
returns table (
  id uuid,
  document_id uuid,
  document_title text,
  doc_type text,
  case_id uuid,
  case_number text,
  chunk_index int,
  chunk_text text,
  sensitivity_level char(1),
  similarity float
)
language plpgsql
security invoker
as $$
declare
  v_user_id uuid := auth.uid();
  v_user_role text;
  v_allowed_sensitivities char(1)[];
begin
  -- Resolve caller role
  select role into v_user_role from profiles where profiles.id = v_user_id;

  -- Derive allowed sensitivity levels strictly from validated user role clearance
  if v_user_role in ('admin', 'supervisor', 'officer', 'investigator', 'forensic_officer') then
    v_allowed_sensitivities := array['A', 'B', 'C']::char(1)[];
  elsif v_user_role in ('judge', 'prosecutor', 'reviewer') then
    v_allowed_sensitivities := array['A', 'B', 'C']::char(1)[];
  elsif v_user_role in ('court_registrar', 'clerk') then
    v_allowed_sensitivities := array['C']::char(1)[];
  else
    v_allowed_sensitivities := array['C']::char(1)[];
  end if;

  return query
  select
    de.id,
    de.document_id,
    d.title as document_title,
    d.doc_type,
    de.case_id,
    c.case_number,
    de.chunk_index,
    de.chunk_text,
    de.sensitivity_level,
    (1 - (de.embedding <=> query_embedding))::float as similarity
  from document_embeddings de
  join documents d on d.id = de.document_id
  join cases c on c.id = de.case_id
  where
    -- Case filter (if specified)
    (filter_case_id is null or de.case_id = filter_case_id)
    -- ABAC clearance filter
    and de.sensitivity_level = any(v_allowed_sensitivities)
    -- ABAC access filter: user must be assigned to case, or have an active approved share, or be admin/supervisor
    and (
      v_user_role in ('admin', 'supervisor')
      or exists (
        select 1 from case_assignments ca
        where ca.case_id = de.case_id
        and ca.user_id = v_user_id
      )
      or exists (
        select 1 from sharing_events se
        where se.document_id = de.document_id
        and se.shared_with = v_user_id
        and se.approval_status = 'approved'
        and se.access_expires_at > now()
      )
    )
  order by de.embedding <=> query_embedding
  limit match_count;
end;
$$;
