-- Migration 5 — abac_policies + RLS on documents
create table abac_policies (
  id uuid primary key default gen_random_uuid(),
  role text not null,
  sensitivity_level char(1) not null check (sensitivity_level in ('A','B','C')),
  permission text not null,
  requires_dual_auth boolean not null default false,
  case_scope text not null default 'assigned_only',
  created_at timestamptz not null default now()
);

alter table documents enable row level security;

create policy "assigned_case_access" on documents for select
  using (
    exists (
      select 1 from case_assignments ca
      where ca.case_id = documents.case_id
      and ca.user_id = auth.uid()
    )
  );
