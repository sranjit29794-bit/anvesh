-- Migration 10 — RLS policies for profiles, cases, and case_assignments
-- Allows authenticated users to query profiles and access cases/assignments they are associated with.

-- 1. Profiles table: Authenticated users can view profile names and roles
alter table profiles enable row level security;

drop policy if exists "authenticated_read_profiles" on profiles;
create policy "authenticated_read_profiles"
on profiles for select
to authenticated
using (true);

-- 2. Cases table: Users can view cases they are assigned to, or all cases if admin
alter table cases enable row level security;

drop policy if exists "cases_assigned_or_admin" on cases;
create policy "cases_assigned_or_admin"
on cases for select
to authenticated
using (
  exists (
    select 1 from case_assignments ca
    where ca.case_id = cases.id
    and ca.user_id = auth.uid()
  )
  or exists (
    select 1 from profiles p
    where p.id = auth.uid()
    and p.role = 'admin'
  )
);

-- 3. Case assignments table: Users can view their own assignments or all if admin
alter table case_assignments enable row level security;

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
