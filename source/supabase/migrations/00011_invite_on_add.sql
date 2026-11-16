-- Adding a team member with an email now sends them their invite automatically.
--
-- Before this, the invite only went out if the manager remembered to tap "Share invite".
-- New people were added, never heard anything, and never joined, so they could not send
-- availability or see their shifts.
--
-- The invite is queued as a reminder (kind 'invite') and delivered by send-reminders,
-- which runs every minute. It is queued when someone is added with an email, or when an
-- email is added or changed for someone who has not joined yet. Joining cancels any
-- invite still waiting.

alter type public.reminder_kind add value if not exists 'invite';

create or replace function public.invite_body(p_employee uuid)
returns text language sql stable security definer set search_path = public as $$
  select format(
    'Hi %s! %s uses ShiftCup for the schedule. Join to send your availability and see your shifts. '
    || 'It is free. Open https://shiftcup-1dd3b.web.app/join?code=%s or open the ShiftCup app, '
    || 'tap "Join with your invite code" and enter %s.',
    e.name, c.name, e.invite_code, e.invite_code)
  from public.employees e join public.cafes c on c.id = e.cafe_id
  where e.id = p_employee;
$$;

create or replace function public.queue_invite(p_employee uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  e record;
  monday date := (current_date - ((extract(isodow from current_date)::int) - 1));
begin
  select id, cafe_id, email, user_id, active into e from public.employees where id = p_employee;
  if e.id is null or e.user_id is not null or not e.active
     or coalesce(trim(e.email), '') = '' then
    return;
  end if;
  update public.reminders set state = 'cancelled'
    where employee_id = e.id and kind = 'invite' and state = 'queued';
  insert into public.reminders (cafe_id, employee_id, week_start, weekday, kind, send_at, body, channel)
  values (e.cafe_id, e.id, monday, 0, 'invite', now(), public.invite_body(e.id), 'email');
end;
$$;

create or replace function public.employees_invite_trigger()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    perform public.queue_invite(new.id);
  elsif new.user_id is not null and old.user_id is null then
    -- They joined: nothing left to invite them to.
    update public.reminders set state = 'cancelled'
      where employee_id = new.id and kind = 'invite' and state = 'queued';
  elsif new.user_id is null
        and coalesce(lower(trim(new.email)), '') <> coalesce(lower(trim(old.email)), '') then
    perform public.queue_invite(new.id);
  end if;
  return new;
end;
$$;

drop trigger if exists employees_invite on public.employees;
create trigger employees_invite
  after insert or update of email, user_id on public.employees
  for each row execute function public.employees_invite_trigger();

-- "Email the invite again" in Team. Only the café's manager may send it.
create or replace function public.resend_invite(p_employee uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare c uuid;
begin
  select cafe_id into c from public.employees where id = p_employee;
  if c is null or not public.is_manager_of(c) then
    raise exception 'Not allowed';
  end if;
  perform public.queue_invite(p_employee);
  return exists (
    select 1 from public.reminders
    where employee_id = p_employee and kind = 'invite' and state = 'queued'
  );
end;
$$;

revoke execute on function public.invite_body(uuid) from public, anon, authenticated;
revoke execute on function public.queue_invite(uuid) from public, anon, authenticated;
revoke execute on function public.employees_invite_trigger() from public, anon, authenticated;
revoke execute on function public.resend_invite(uuid) from public, anon;
grant execute on function public.resend_invite(uuid) to authenticated;
