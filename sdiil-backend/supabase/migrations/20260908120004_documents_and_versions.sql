-- Migration 4 — documents + document_versions
create table documents (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references cases(id) on delete cascade,
  title text not null,
  doc_type text not null,
  sensitivity_level char(1) not null check (sensitivity_level in ('A','B','C')),
  current_version_id uuid,
  uploaded_by uuid not null references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table document_versions (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references documents(id) on delete cascade,
  version_number int not null,
  storage_path text not null,
  file_hash text not null,
  file_size_bytes bigint,
  uploaded_by uuid not null references profiles(id),
  created_at timestamptz not null default now(),
  unique(document_id, version_number)
);

alter table documents add constraint fk_current_version
  foreign key (current_version_id) references document_versions(id);
