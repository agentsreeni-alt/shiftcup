-- Each person's standard weekly availability, set by the manager. The draft builder
-- uses it for any day the person has not given availability for that specific week,
-- so a manager can schedule without asking the team every week.
--
-- Shape: a JSON array of 7 entries, Monday first:
--   [{"kind":"any"|"window"|"none","start_min":int|null,"end_min":int|null}, ...]
-- Null means "not set".

alter table public.employees add column if not exists usual_week jsonb;

alter table public.employees drop constraint if exists employees_usual_week_shape;
alter table public.employees add constraint employees_usual_week_shape check (
  usual_week is null
  or (jsonb_typeof(usual_week) = 'array' and jsonb_array_length(usual_week) = 7)
);
