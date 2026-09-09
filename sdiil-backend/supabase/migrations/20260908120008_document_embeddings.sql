-- Migration 8 — document_embeddings (pgvector)
create table document_embeddings (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references documents(id) on delete cascade,
  chunk_index int not null,
  chunk_text text not null,
  embedding vector(1536),
  sensitivity_level char(1) not null,
  case_id uuid not null,
  created_at timestamptz not null default now()
);

create index on document_embeddings using ivfflat (embedding vector_cosine_ops) with (lists = 100);
