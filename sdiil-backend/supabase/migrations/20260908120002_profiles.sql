-- Migration 2 — profiles (extends Supabase's built-in auth.users)
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null,
  role text not null,
  is_locked boolean not null default false,
  created_at timestamptz not null default now()
);
