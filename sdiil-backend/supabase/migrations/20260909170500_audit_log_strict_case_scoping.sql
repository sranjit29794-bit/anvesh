-- Migration 14 — Strict Case Scoping on Audit Log
-- Users only see audit events for cases they are assigned to in case_assignments.

drop policy if exists "audit_log_select" on audit_log;
create policy "audit_log_select"
on audit_log for select
to authenticated
using (
  -- Supervisors and Admins have full cross-case audit visibility
  exists (
    select 1 from profiles p
    where p.id = auth.uid()
    and p.role in ('admin', 'supervisor')
  )
  -- Case-scoped: Only users assigned to this case can see its audit records
  or (
    case_id is not null and exists (
      select 1 from case_assignments ca
      where ca.case_id = audit_log.case_id
      and ca.user_id = auth.uid()
    )
  )
  -- Non-case events (e.g. login, system events): user can see their own
  or (
    case_id is null and user_id = auth.uid()
  )
);
