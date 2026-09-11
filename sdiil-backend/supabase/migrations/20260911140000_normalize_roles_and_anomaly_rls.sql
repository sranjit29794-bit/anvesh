-- Migration 20260911140000 - Normalize roles to uppercase and make anomaly_flags RLS case-insensitive
-- Ensures ADMIN and SUPERVISOR accounts reliably access all system-wide and jurisdictional anomalies,
-- while case-assigned officers and judges see their case-scoped anomalies.

-- 1. Normalize existing profile roles to uppercase
update profiles set role = upper(role);

-- 2. Drop existing anomaly_flags_select policy
drop policy if exists "anomaly_flags_select" on anomaly_flags;

-- 3. Recreate policy with case-insensitive check on profiles.role
create policy "anomaly_flags_select"
on anomaly_flags for select
using (
  exists (
    select 1 from profiles p
    where p.id = auth.uid()
    and lower(p.role) in ('admin', 'supervisor')
  )
  or exists (
    select 1 from case_assignments ca
    join cases c on c.id = ca.case_id
    where ca.user_id = auth.uid()
    and (c.id::text = anomaly_flags.case_id or c.case_number = anomaly_flags.case_id)
  )
);
