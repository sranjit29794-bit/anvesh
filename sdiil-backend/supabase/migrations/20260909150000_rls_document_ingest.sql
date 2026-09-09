-- Migration 11 — RLS policies for document ingest
-- Allows authenticated users to upload documents to cases they are assigned to,
-- and records document versions, blockchain integrity events, and audit logs.

-- 1. Storage bucket INSERT policy
drop policy if exists "case_assigned_upload" on storage.objects;
create policy "case_assigned_upload"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'case-documents'
  and exists (
    select 1 from case_assignments ca
    where ca.user_id = auth.uid()
    and storage.objects.name like ('case_docs/' || ca.case_id::text || '/%')
  )
);

-- 2. Documents table INSERT & UPDATE policies
drop policy if exists "case_assigned_insert_documents" on documents;
create policy "case_assigned_insert_documents"
on documents for insert
to authenticated
with check (
  uploaded_by = auth.uid()
  and (
    exists (
      select 1 from case_assignments ca
      where ca.case_id = documents.case_id
      and ca.user_id = auth.uid()
    )
    or exists (
      select 1 from profiles p
      where p.id = auth.uid()
      and p.role = 'admin'
    )
  )
);

drop policy if exists "case_assigned_update_documents" on documents;
create policy "case_assigned_update_documents"
on documents for update
to authenticated
using (
  exists (
    select 1 from case_assignments ca
    where ca.case_id = documents.case_id
    and ca.user_id = auth.uid()
  )
  or exists (
    select 1 from profiles p
    where p.id = auth.uid()
    and p.role = 'admin'
  )
)
with check (
  exists (
    select 1 from case_assignments ca
    where ca.case_id = documents.case_id
    and ca.user_id = auth.uid()
  )
  or exists (
    select 1 from profiles p
    where p.id = auth.uid()
    and p.role = 'admin'
  )
);

-- 3. Document versions policies
alter table document_versions enable row level security;

drop policy if exists "document_versions_select" on document_versions;
create policy "document_versions_select"
on document_versions for select
to authenticated
using (
  exists (
    select 1 from documents d
    join case_assignments ca on ca.case_id = d.case_id
    where d.id = document_versions.document_id
    and ca.user_id = auth.uid()
  )
  or exists (
    select 1 from profiles p
    where p.id = auth.uid()
    and p.role = 'admin'
  )
);

drop policy if exists "document_versions_insert" on document_versions;
create policy "document_versions_insert"
on document_versions for insert
to authenticated
with check (
  uploaded_by = auth.uid()
  and (
    exists (
      select 1 from documents d
      join case_assignments ca on ca.case_id = d.case_id
      where d.id = document_versions.document_id
      and ca.user_id = auth.uid()
    )
    or exists (
      select 1 from profiles p
      where p.id = auth.uid()
      and p.role = 'admin'
    )
  )
);

-- 4. Blockchain events policies
alter table blockchain_events enable row level security;

drop policy if exists "blockchain_events_select" on blockchain_events;
create policy "blockchain_events_select"
on blockchain_events for select
to authenticated
using (true);

drop policy if exists "blockchain_events_insert" on blockchain_events;
create policy "blockchain_events_insert"
on blockchain_events for insert
to authenticated
with check (true);

-- 5. Audit log policies
alter table audit_log enable row level security;

drop policy if exists "audit_log_insert" on audit_log;
create policy "audit_log_insert"
on audit_log for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists "audit_log_select" on audit_log;
create policy "audit_log_select"
on audit_log for select
to authenticated
using (
  user_id = auth.uid()
  or exists (
    select 1 from profiles p
    where p.id = auth.uid()
    and p.role in ('admin', 'supervisor')
  )
);
