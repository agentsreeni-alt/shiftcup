-- The manager is now emailed when someone on the team asks for something.
--
-- Before this, "I can't make it" and availability change requests only raised a small
-- count on the Today tab. A manager who did not open the app never knew, so a shift
-- could go uncovered.
--
-- A reminder with to_manager = true is delivered to the café owner's email instead of
-- the employee's. employee_id still says who the message is about.

alter table public.reminders add column if not exists to_manager boolean not null default false;

create or replace function public.notify_manager(
  p_cafe uuid, p_employee uuid, p_week date, p_weekday int, p_body text
) returns void language plpgsql security definer set search_path = public as $$
begin
  -- "I can't make it" on a long shift files one row per block: one email is enough.
  if exists (
    select 1 from public.reminders
    where cafe_id = p_cafe and employee_id = p_employee and to_manager
      and week_start = p_week and weekday = p_weekday
      and created_at > now() - interval '10 minutes' and body = p_body
  ) then
    return;
  end if;
  insert into public.reminders
    (cafe_id, employee_id, week_start, weekday, kind, send_at, body, channel, to_manager)
  values (p_cafe, p_employee, p_week, p_weekday, 'notice', now(), p_body, 'email', true);
end;
$$;

create or replace function public.cover_request_notify()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  who text;
  day date := new.week_start + new.weekday;
begin
  select name into who from public.employees where id = new.employee_id;
  perform public.notify_manager(
    new.cafe_id, new.employee_id, new.week_start, new.weekday,
    format('%s cannot make their shift on %s and asked for cover.%s Open ShiftCup, then Schedule, to find someone or keep them on.',
      coalesce(who, 'Someone'),
      to_char(day, 'FMDay, Mon FMDD'),
      case when coalesce(trim(new.note), '') = '' then '' else format(' Their note: "%s".', trim(new.note)) end)
  );
  return new;
end;
$$;

drop trigger if exists cover_requests_notify on public.cover_requests;
create trigger cover_requests_notify
  after insert on public.cover_requests
  for each row execute function public.cover_request_notify();

create or replace function public.availability_request_notify()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  who text;
  monday date := (current_date - ((extract(isodow from current_date)::int) - 1));
begin
  if new.status <> 'pending' then
    return new;
  end if;
  select name into who from public.employees where id = new.employee_id;
  perform public.notify_manager(
    new.cafe_id, new.employee_id, coalesce(new.week_start, monday), 0,
    format('%s %s.%s Open ShiftCup, then Today, to approve or decline.',
      coalesce(who, 'Someone'),
      case when new.scope = 'usual'
        then 'sent the days and times they can usually work'
        else format('asked for a change the week of %s', to_char(new.week_start, 'Mon FMDD')) end,
      case when coalesce(trim(new.note), '') = '' then '' else format(' Their note: "%s".', trim(new.note)) end)
  );
  return new;
end;
$$;

drop trigger if exists availability_requests_notify on public.availability_requests;
create trigger availability_requests_notify
  after insert on public.availability_requests
  for each row execute function public.availability_request_notify();

revoke execute on function public.notify_manager(uuid, uuid, date, int, text) from public, anon, authenticated;
revoke execute on function public.cover_request_notify() from public, anon, authenticated;
revoke execute on function public.availability_request_notify() from public, anon, authenticated;
