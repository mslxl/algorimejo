-- Your SQL goes here
alter table problems add column time_limit integer not null default 3000; -- default 3000ms, unit is ms
alter table problems add column memory_limit integer not null default 5120; -- default 5MiB, unit is kilobyte