-- Migration to cast sensitivity_level to text in match_document_chunks

drop function if exists match_document_chunks(vector, int, uuid);

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
  sensitivity_level text,
  similarity float
)
language plpgsql
security invoker
as $$
declare
  v_user_id uuid := auth.uid();
  v_user_role text;
  v_allowed_sensitivities text[];
begin
  -- Resolve caller role
  select role into v_user_role from profiles where profiles.id = v_user_id;

  -- Derive allowed sensitivity levels strictly from validated user role clearance
  if v_user_role in ('admin', 'supervisor', 'officer', 'investigator', 'forensic_officer') then
    v_allowed_sensitivities := array['A', 'B', 'C'];
  elsif v_user_role in ('judge', 'prosecutor', 'reviewer') then
    v_allowed_sensitivities := array['A', 'B', 'C'];
  elsif v_user_role in ('court_registrar', 'clerk') then
    v_allowed_sensitivities := array['C'];
  else
    v_allowed_sensitivities := array['C'];
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
    de.sensitivity_level::text,
    (1 - (de.embedding <=> query_embedding))::float as similarity
  from document_embeddings de
  join documents d on d.id = de.document_id
  join cases c on c.id = de.case_id
  where
    -- Case filter (if specified)
    (filter_case_id is null or de.case_id = filter_case_id)
    -- ABAC clearance filter
    and de.sensitivity_level::text = any(v_allowed_sensitivities)
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
