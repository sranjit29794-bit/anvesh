-- Migration: Add demo_tampered column to documents table
-- Used by court demonstration tamper/restore workflow (Part 3)
ALTER TABLE documents ADD COLUMN IF NOT EXISTS demo_tampered BOOLEAN DEFAULT false;
