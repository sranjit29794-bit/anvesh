-- Migration 20 — Admin profiles and cases schema additions (Phase 11)
-- Adds department, account_status to profiles and description, department to cases.

alter table profiles add column if not exists department text default 'Investigation';
alter table profiles add column if not exists account_status text default 'ACTIVE';

alter table cases add column if not exists description text default '';
alter table cases add column if not exists department text default 'Crime Branch';

-- Ensure existing rows have defaults populated
update profiles set department = 'Investigation' where department is null;
update profiles set account_status = 'ACTIVE' where account_status is null;
update cases set description = '' where description is null;
update cases set department = 'Crime Branch' where department is null;
