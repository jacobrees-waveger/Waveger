-- A failed run says which way it failed, not only why.
--
-- `status` was 'succeeded' or 'failed', and the difference between the two ways
-- a run fails lived in the prose of `failure`. WAV-17 gives the operator the run
-- history, and the two send you to different places: a source that answered with
-- something that is not a Chart Week is a parsing or a Compiler problem, and a
-- source that never answered is Apify or the token. Reading that distinction out
-- of a sentence works for a person and not for anything else, so it becomes the
-- status itself — the same three outcomes `IngestionOutcome` already names.
--
-- Existing rows are mapped by whether their payload survived, which is exactly
-- what told the two apart before: `recordFailedRun` stores what the source
-- returned when it returned something, and stores nothing when the fetch itself
-- never got that far.

alter table ingestion_run drop constraint ingestion_run_status_check;
alter table ingestion_run drop constraint ingestion_run_check;

update ingestion_run
set status = case when payload is null then 'unavailable' else 'rejected' end
where status = 'failed';

alter table ingestion_run
  add constraint ingestion_run_status_check
  check (status in ('succeeded', 'rejected', 'unavailable'));

-- A run that held nothing explains itself; one that succeeded has nothing to
-- explain. Unchanged in substance — 'failed' has become two names for it.
alter table ingestion_run
  add constraint ingestion_run_failure_check
  check ((status <> 'succeeded') = (failure is not null));

-- The archive health report asks which Chart Weeks a Chart has ever been
-- reached for, and the run history asks for a Chart's runs newest first. Both
-- lead on `chart_slug` alone, which the existing index does not serve.
create index ingestion_run_chart on ingestion_run (chart_slug, ran_at desc);
