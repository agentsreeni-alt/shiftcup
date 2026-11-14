-- Employees ask to change when they can work; the manager approves or declines.
--
-- scope 'usual': a new standing week. On approval the manager's app copies `days` into
--                employees.usual_week, which every future draft is built from.
-- scope 'week':  a one-off change for the week starting `week_start`. On approval the
--                manager's app writes `days` into availability for that week.
--
-- `days` has the same shape as employees.usual_week: 7 entries, Monday first:
--   [{"kind":"any"|"window"|"none","start_min":int|null,"end_min":int|null}, ...]

create table if not exists public.availability_requests (
  id uuid primary key default gen_random_uuid(),
  cafe_id uuid not null references public.cafes(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  scope text not null check (scope in ('usual', 'week')),
  week_start date,
  days jsonb not null,
  note text,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'declined', 'cancelled')),
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  constraint availability_requests_week_needed check (scope = 'usual' or week_start is not null),
  constraint availability_requests_days_shape check (
    jsonb_typeof(days) = 'array' and jsonb_array_length(days) = 7
  )
);

create index if not exists availability_requests_cafe_idx
  on public.availability_requests (cafe_id, status, created_at desc);
create index if not exists availability_requests_employee_idx
  on public.availability_requests (employee_id, created_at desc);

alter table public.availability_requests enable row level security;

drop policy if exists availability_requests_manager_all on public.availability_requests;
create policy availability_requests_manager_all on public.availability_requests
  for all to authenticated
  using (public.is_manager_of(cafe_id))
  with check (public.is_manager_of(cafe_id));

drop policy if exists availability_requests_self_select on public.availability_requests;
create policy availability_requests_self_select on public.availability_requests
  for select to authenticated
  using (employee_id = public.current_employee_id());

-- An employee can only file a request for themselves, and only as 'pending'.
drop policy if exists availability_requests_self_insert on public.availability_requests;
create policy availability_requests_self_insert on public.availability_requests
  for insert to authenticated
  with check (
    employee_id = public.current_employee_id()
    and cafe_id = public.current_cafe_id()
    and status = 'pending'
    and decided_at is null
  );

-- An employee can withdraw their own pending request, and nothing else: they cannot
-- approve it, and they cannot touch a request the manager has already decided.
drop policy if exists availability_requests_self_cancel on public.availability_requests;
create policy availability_requests_self_cancel on public.availability_requests
  for update to authenticated
  using (employee_id = public.current_employee_id() and status = 'pending')
  with check (
    employee_id = public.current_employee_id()
    and cafe_id = public.current_cafe_id()
    and status = 'cancelled'
  );

-- Employees can now see their own usual week (read-only; changes go through a request).
-- The column is appended so the existing view definition stays compatible.
create or replace view public.my_employee_profile with (security_invoker = false) as
  select id, cafe_id, name, roles, can_work_alone, max_hours, active, user_id, usual_week
  from public.employees
  where user_id = auth.uid();

grant select on public.my_employee_profile to authenticated;

-- A plain "something changed" message, used to tell an employee their request was decided.
alter type public.reminder_kind add value if not exists 'notice';
