alter table completed_sessions
  add column if not exists status        text not null default 'done',
  add column if not exists missed_reason text;

-- Back-fill existing rows
update completed_sessions set status = 'done' where status is null or status = '';
