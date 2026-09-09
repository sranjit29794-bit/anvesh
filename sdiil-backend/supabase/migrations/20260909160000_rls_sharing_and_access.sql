-- Migration 12 — RLS policies for document sharing, approvals, and shared access
-- Allows sharing workflows with dual-authorization for Sensitivity-A documents,
-- and grants recipient access upon approved, unexpired sharing grants.

-- 1. Schema additions for sharing_events & approvals
alter table sharing_events add column if not exists share_reason text;
alter table approvals add column if not exists reason text;

-- 2. Enable RLS on sharing_events
alter table sharing_events enable row level security;

drop policy if exists "sharing_events_select" on sharing_events;
create policy "sharing_events_select"
on sharing_events for select
to authenticated
using (
  shared_by = auth.uid()
  or shared_with = auth.uid()
  or exists (
    select 1 from profiles p
    where p.id = auth.uid()
    and p.role in ('supervisor', 'admin')
  )
);

drop policy if exists "sharing_events_insert" on sharing_events;
create policy "sharing_events_insert"
on sharing_events for insert
to authenticated
with check (
  shared_by = auth.uid()
);

drop policy if exists "sharing_events_update" on sharing_events;
create policy "sharing_events_update"
on sharing_events for update
to authenticated
using (
  exists (
    select 1 from profiles p
    where p.id = auth.uid()
    and p.role in ('supervisor', 'admin')
  )
)
with check (
  exists (
    select 1 from profiles p
    where p.id = auth.uid()
    and p.role in ('supervisor', 'admin')
  )
);

-- 3. Enable RLS on approvals
alter table approvals enable row level security;

drop policy if exists "approvals_select" on approvals;
create policy "approvals_select"
on approvals for select
to authenticated
using (true);

drop policy if exists "approvals_insert" on approvals;
create policy "approvals_insert"
on approvals for insert
to authenticated
with check (
  approver_id = auth.uid()
  and exists (
    select 1 from profiles p
    where p.id = auth.uid()
    and p.role in ('supervisor', 'admin')
  )
);

-- 4. Update documents SELECT policy to include approved shared recipients
drop policy if exists "assigned_case_access" on documents;
drop policy if exists "documents_select_assigned_or_shared" on documents;
create policy "documents_select_assigned_or_shared"
on documents for select
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
    and p.role in ('admin', 'supervisor')
  )
  or exists (
    select 1 from sharing_events se
    where se.document_id = documents.id
    and se.shared_with = auth.uid()
    and se.approval_status = 'approved'
    and (se.access_expires_at is null or se.access_expires_at > now())
  )
);

-- 5. Update document_versions SELECT policy to include approved shared recipients
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
    and p.role in ('admin', 'supervisor')
  )
  or exists (
    select 1 from sharing_events se
    where se.document_id = document_versions.document_id
    and se.shared_with = auth.uid()
    and se.approval_status = 'approved'
    and (se.access_expires_at is null or se.access_expires_at > now())
  )
);

-- 6. Update storage.objects SELECT policy for case-documents bucket
drop policy if exists "case_assigned_read" on storage.objects;
drop policy if exists "storage_case_assigned_or_shared_read" on storage.objects;
create policy "storage_case_assigned_or_shared_read"
on storage.objects for select
to authenticated
using (
  bucket_id = 'case-documents'
  and (
    exists (
      select 1 from case_assignments ca
      join documents d on d.case_id = ca.case_id
      where ca.user_id = auth.uid()
      and storage.objects.name like ('case_docs/' || d.case_id::text || '/%')
    )
    or exists (
      select 1 from profiles p
      where p.id = auth.uid()
      and p.role in ('admin', 'supervisor')
    )
    or exists (
      select 1 from sharing_events se
      join document_versions dv on dv.document_id = se.document_id
      where se.shared_with = auth.uid()
      and se.approval_status = 'approved'
      and (se.access_expires_at is null or se.access_expires_at > now())
      and storage.objects.name = dv.storage_path
    )
  )
);
