-- Migration 13 — Audit log case association, performance indexing, and scoped RLS
-- Enforces rule-immutable-audit-log and role-based case-scoped visibility

-- 1. Add case_id column to audit_log if it does not already exist
alter table audit_log add column if not exists case_id uuid references cases(id);

-- 2. Backfill case_id from metadata if present
update audit_log
set case_id = (metadata->>'case_id')::uuid
where case_id is null 
  and metadata->>'case_id' is not null 
  and metadata->>'case_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';

-- 3. Backfill case_id from documents for document actions
update audit_log
set case_id = d.case_id
from documents d
where audit_log.case_id is null 
  and audit_log.resource_type = 'document' 
  and audit_log.resource_id = d.id;

-- 4. Backfill case_id from sharing_events for sharing actions
update audit_log
set case_id = d.case_id
from sharing_events se
join documents d on d.id = se.document_id
where audit_log.case_id is null 
  and audit_log.resource_type = 'sharing_event' 
  and audit_log.resource_id = se.id;

-- 5. Create performance indexes for high-throughput audit querying and filtering
create index if not exists idx_audit_log_case_id on audit_log(case_id);
create index if not exists idx_audit_log_created_at on audit_log(created_at desc);
create index if not exists idx_audit_log_action on audit_log(action);
create index if not exists idx_audit_log_user_id on audit_log(user_id);

-- 6. Ensure UPDATE and DELETE remain permanently revoked from authenticated and anon
revoke update, delete on audit_log from authenticated, anon;

-- 7. Update RLS policies on audit_log
alter table audit_log enable row level security;

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
  -- Users can always see audit records of actions they performed
  or user_id = auth.uid()
  -- Officers/assigned users can see audit records for cases they are assigned to
  or (
    case_id is not null and exists (
      select 1 from case_assignments ca
      where ca.case_id = audit_log.case_id
      and ca.user_id = auth.uid()
    )
  )
);

drop policy if exists "audit_log_insert" on audit_log;
create policy "audit_log_insert"
on audit_log for insert
to authenticated
with check (user_id = auth.uid());
