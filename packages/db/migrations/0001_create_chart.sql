-- The Charts this deployment consumes.
--
-- Waveger never compiles a Chart, so a row here registers someone else's
-- Chart: who publishes it, and what we call it. ADR 0002 fixes the first one.

create table chart (
  id         uuid primary key default gen_random_uuid(),
  slug       text not null unique,
  name       text not null,
  compiler   text not null,
  created_at timestamptz not null default now()
);

insert into chart (slug, name, compiler) values
  (
    'uk-official-singles',
    'Official Singles Chart Top 100',
    'Official Charts Company'
  );
