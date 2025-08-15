-- This file should undo anything in `up.sql`

alter table problems drop column time_limit;
alter table problems drop column memory_limit;