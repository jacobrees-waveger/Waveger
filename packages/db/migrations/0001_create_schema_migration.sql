-- The ledger the runner records itself in.
--
-- It is a migration rather than something the runner creates behind your back,
-- so that every table in this database — including this one — was put there by
-- a file in this directory that you can read.
--
-- The runner bootstraps by treating "no such table" as "nothing applied yet".
-- It cannot tell that apart from someone having dropped this table under a
-- populated database, so `if not exists` below keeps that case from erroring
-- here — it will surface at the next migration instead. Do not drop it.

create table if not exists schema_migration (
  name       text primary key,
  applied_at timestamptz not null default now()
);
