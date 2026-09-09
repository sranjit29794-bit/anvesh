-- Migration 3 — cases + case_assignments
create table cases (
  id uuid primary key default gen_random_uuid(),
  case_number text unique not null,
  title text not null,
  status text not null default 'open',
  created_by uuid not null references profiles(id),
  created_at timestamptz not null default now()
);

create table case_assignments (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references cases(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  role_in_case text not null,
  assigned_at timestamptz not null default now(),
  unique(case_id, user_id)
);
