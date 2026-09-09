-- Migration 9 — Storage RLS policy for case-documents bucket
-- Allows authenticated users with matching case_assignments to read documents under their case's path.

create policy "case_assigned_read"
on storage.objects for select
using (
  bucket_id = 'case-documents'
  and exists (
    select 1 from case_assignments ca
    join documents d on d.case_id = ca.case_id
    where ca.user_id = auth.uid()
    and storage.objects.name like ('case_docs/' || d.case_id::text || '/%')
  )
);
