alter table profiles add column if not exists races jsonb default '[]'::jsonb;
