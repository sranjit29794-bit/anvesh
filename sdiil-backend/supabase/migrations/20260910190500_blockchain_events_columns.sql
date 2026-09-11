-- Migration 22: Add doc_id, case_id, actor_id to blockchain_events
ALTER TABLE blockchain_events 
  ADD COLUMN IF NOT EXISTS doc_id uuid,
  ADD COLUMN IF NOT EXISTS case_id uuid,
  ADD COLUMN IF NOT EXISTS actor_id uuid;
