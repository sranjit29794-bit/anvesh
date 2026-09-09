-- Migration 6 — audit_log + sharing_events + approvals
create table audit_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id),
  action text not null,
  resource_type text not null,
  resource_id uuid,
  ip_address inet,
  metadata jsonb,
  created_at timestamptz not null default now()
);

revoke update, delete on audit_log from authenticated, anon;

create table sharing_events (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references documents(id),
  shared_by uuid not null references profiles(id),
  shared_with uuid not null references profiles(id),
  requires_dual_auth boolean not null,
  approval_status text not null default 'pending',
  access_expires_at timestamptz,
  created_at timestamptz not null default now()
);

create table approvals (
  id uuid primary key default gen_random_uuid(),
  sharing_event_id uuid not null references sharing_events(id) on delete cascade,
  approver_id uuid not null references profiles(id),
  decision text not null,
  decided_at timestamptz not null default now()
);
