-- Fix case_assignments policy to avoid recursion
drop policy if exists "case_assignments_read" on case_assignments;

create policy "case_assignments_read"
on case_assignments for select
to authenticated
using (
  user_id = auth.uid()
  or exists (
    select 1 from profiles p
    where p.id = auth.uid()
    and p.role = 'admin'
  )
);
