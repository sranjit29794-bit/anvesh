-- Migration 20260909190000 - Anomaly Flags Table, RLS & Realtime Configuration
-- Phase 10: Rule-based security anomaly detection

-- 1. Create anomaly_flags table
create table if not exists anomaly_flags (
  id uuid primary key default gen_random_uuid(),
  case_id text,
  user_id uuid references profiles(id) on delete set null,
  rule_triggered text not null,
  severity text not null check (severity in ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
  description text not null,
  metadata jsonb default '{}'::jsonb,
  triggered_at timestamptz default now(),
  acknowledged boolean default false,
  acknowledged_by uuid references profiles(id) on delete set null,
  acknowledged_at timestamptz
);

-- Indexes for performance
create index if not exists idx_anomaly_flags_triggered_at on anomaly_flags(triggered_at desc);
create index if not exists idx_anomaly_flags_user_id on anomaly_flags(user_id);
create index if not exists idx_anomaly_flags_case_id on anomaly_flags(case_id);
create index if not exists idx_anomaly_flags_acknowledged on anomaly_flags(acknowledged);

-- 2. Enable RLS
alter table anomaly_flags enable row level security;

-- Drop existing policies if any
drop policy if exists "anomaly_flags_select" on anomaly_flags;

-- 3. SELECT Policy:
-- ADMIN and SUPERVISOR roles can SELECT all rows.
-- Officers and judges can SELECT only rows where case_id matches an assigned case.
create policy "anomaly_flags_select"
on anomaly_flags for select
using (
  exists (
    select 1 from profiles p
    where p.id = auth.uid()
    and p.role in ('admin', 'supervisor')
  )
  or exists (
    select 1 from case_assignments ca
    join cases c on c.id = ca.case_id
    where ca.user_id = auth.uid()
    and (c.id::text = anomaly_flags.case_id or c.case_number = anomaly_flags.case_id)
  )
);

-- No INSERT, UPDATE, or DELETE policies for client roles.
-- Writes are performed strictly by backend service role or mediated through authenticated endpoints.

-- 4. Enable Supabase Realtime on anomaly_flags table
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and tablename = 'anomaly_flags'
    ) then
      alter publication supabase_realtime add table anomaly_flags;
    end if;
  end if;
end $$;
