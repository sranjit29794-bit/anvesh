-- Migration 7 — blockchain_events
create table blockchain_events (
  id uuid primary key default gen_random_uuid(),
  document_version_id uuid not null references document_versions(id),
  event_type text not null,
  tx_hash text,
  registered_hash text not null,
  created_at timestamptz not null default now()
);
