-- ============ enums ============
create type public.user_role as enum ('manager','employee','owner');
create type public.sub_status as enum ('trial','active','past_due','ended');
create type public.avail_kind as enum ('any','none','window');
create type public.block_rule as enum ('solo','two');
create type public.slot_kind as enum ('solo','barista','scooper');
create type public.req_status as enum ('waiting','answered','unavailable');
create type public.reminder_kind as enum ('request','published','evening','soon','renewal');
create type public.reminder_state as enum ('queued','sent','cancelled');
create type public.msg_channel as enum ('email','text');

-- ============ tables ============
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  role public.user_role not null default 'manager',
  cafe_id uuid,
  employee_id uuid,
  created_at timestamptz not null default now()
);

create table public.cafes (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  is_sample boolean not null default false,
  subscription_status public.sub_status not null default 'trial',
  trial_ends_at timestamptz not null default (now() + interval '14 days'),
  paid_until timestamptz,
  stripe_customer_id text,
  stripe_subscription_id text,
  timezone text not null default 'America/Chicago',
  created_at timestamptz not null default now()
);
create index cafes_owner_idx on public.cafes(owner_id);

create table public.employees (
  id uuid primary key default gen_random_uuid(),
  cafe_id uuid not null references public.cafes(id) on delete cascade,
  name text not null,
  email text,
  phone text,
  roles text[] not null default '{}',
  can_work_alone boolean not null default false,
  rating int not null default 3 check (rating between 1 and 5),
  max_hours int not null default 20,
  hourly_wage numeric(6,2) not null default 15.00,
  active boolean not null default true,
  user_id uuid references auth.users(id) on delete set null,
  invite_code text not null unique default upper(substr(md5(random()::text || clock_timestamp()::text), 1, 8)),
  created_at timestamptz not null default now()
);
create index employees_cafe_idx on public.employees(cafe_id, active);

alter table public.profiles add constraint profiles_cafe_fk foreign key (cafe_id) references public.cafes(id) on delete set null;
alter table public.profiles add constraint profiles_employee_fk foreign key (employee_id) references public.employees(id) on delete set null;

create table public.store_hours (
  cafe_id uuid not null references public.cafes(id) on delete cascade,
  weekday int not null check (weekday between 0 and 6),
  open_min int not null,
  close_min int not null,
  primary key (cafe_id, weekday)
);

create table public.coverage_blocks (
  id uuid primary key default gen_random_uuid(),
  cafe_id uuid not null references public.cafes(id) on delete cascade,
  weekday int not null check (weekday between 0 and 6),
  start_min int not null,
  end_min int not null,
  rule public.block_rule not null default 'solo',
  created_at timestamptz not null default now()
);
create index coverage_blocks_cafe_idx on public.coverage_blocks(cafe_id, weekday, start_min);

create table public.cafe_settings (
  cafe_id uuid primary key references public.cafes(id) on delete cascade,
  due_weekday int not null default 2,
  due_min int not null default 1200,
  publish_weekday int not null default 4,
  evening_reminder_min int not null default 1080,
  second_reminder_min int not null default 60,
  max_shift_hours int not null default 8,
  channel public.msg_channel not null default 'email'
);

create table public.availability (
  id uuid primary key default gen_random_uuid(),
  cafe_id uuid not null references public.cafes(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  week_start date not null,
  weekday int not null check (weekday between 0 and 6),
  kind public.avail_kind not null default 'none',
  start_min int,
  end_min int,
  updated_at timestamptz not null default now(),
  unique (employee_id, week_start, weekday)
);
create index availability_week_idx on public.availability(cafe_id, week_start);

create table public.weekly_requests (
  id uuid primary key default gen_random_uuid(),
  cafe_id uuid not null references public.cafes(id) on delete cascade,
  week_start date not null,
  sent_at timestamptz not null default now(),
  unique (cafe_id, week_start)
);

create table public.request_status (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.weekly_requests(id) on delete cascade,
  cafe_id uuid not null references public.cafes(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  status public.req_status not null default 'waiting',
  updated_at timestamptz not null default now(),
  unique (request_id, employee_id)
);
create index request_status_cafe_idx on public.request_status(cafe_id, employee_id);

create table public.assignments (
  id uuid primary key default gen_random_uuid(),
  cafe_id uuid not null references public.cafes(id) on delete cascade,
  week_start date not null,
  weekday int not null check (weekday between 0 and 6),
  block_id uuid not null references public.coverage_blocks(id) on delete cascade,
  slot public.slot_kind not null,
  employee_id uuid references public.employees(id) on delete set null,
  start_min int not null,
  end_min int not null,
  manual boolean not null default false,
  over_limit boolean not null default false,
  updated_at timestamptz not null default now(),
  unique (week_start, block_id, slot)
);
create index assignments_week_idx on public.assignments(cafe_id, week_start);

create table public.published_schedules (
  id uuid primary key default gen_random_uuid(),
  cafe_id uuid not null references public.cafes(id) on delete cascade,
  week_start date not null,
  published_at timestamptz not null default now(),
  snapshot jsonb not null default '[]'::jsonb,
  unique (cafe_id, week_start)
);

create table public.cover_requests (
  id uuid primary key default gen_random_uuid(),
  cafe_id uuid not null references public.cafes(id) on delete cascade,
  assignment_id uuid not null references public.assignments(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  week_start date not null,
  weekday int not null,
  note text,
  resolved boolean not null default false,
  created_at timestamptz not null default now()
);
create index cover_requests_cafe_idx on public.cover_requests(cafe_id, resolved);

create table public.reminders (
  id uuid primary key default gen_random_uuid(),
  cafe_id uuid not null references public.cafes(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  week_start date not null,
  weekday int not null,
  kind public.reminder_kind not null,
  send_at timestamptz not null,
  body text not null,
  channel public.msg_channel not null default 'email',
  state public.reminder_state not null default 'queued',
  sent_at timestamptz,
  created_at timestamptz not null default now()
);
create index reminders_due_idx on public.reminders(state, send_at);
create index reminders_cafe_idx on public.reminders(cafe_id, week_start);

create table public.billing_events (
  id uuid primary key default gen_random_uuid(),
  cafe_id uuid references public.cafes(id) on delete cascade,
  kind text not null,
  amount_cents int not null default 0,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- ============ helper functions ============
create or replace function public.current_role() returns text
language sql stable security definer set search_path = public as $$
  select coalesce((select role::text from public.profiles where id = auth.uid()), '');
$$;

create or replace function public.current_cafe_id() returns uuid
language sql stable security definer set search_path = public as $$
  select cafe_id from public.profiles where id = auth.uid();
$$;

create or replace function public.current_employee_id() returns uuid
language sql stable security definer set search_path = public as $$
  select employee_id from public.profiles where id = auth.uid();
$$;

create or replace function public.is_manager_of(c uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.cafes where id = c and owner_id = auth.uid());
$$;

create or replace function public.is_member_of(c uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and cafe_id = c);
$$;

create or replace function public.cafe_has_access(c uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.cafes
    where id = c and (
      is_sample = true
      or (subscription_status = 'trial' and trial_ends_at > now())
      or (subscription_status in ('active','past_due') and paid_until is not null and paid_until > now())
    )
  );
$$;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare r public.user_role;
begin
  r := case when new.raw_user_meta_data->>'role' = 'employee'
            then 'employee'::public.user_role
            else 'manager'::public.user_role end;
  insert into public.profiles (id, email, role) values (new.id, new.email, r);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.prevent_role_change()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.role <> old.role and public.current_role() <> 'owner' then
    raise exception 'Role cannot be changed';
  end if;
  return new;
end;
$$;

create trigger profiles_role_guard
  before update on public.profiles
  for each row execute function public.prevent_role_change();

create or replace function public.seed_cafe_defaults(p_cafe uuid, p_open int, p_close int)
returns void language plpgsql security definer set search_path = public as $$
declare d int; s int; e int; r public.block_rule;
begin
  for d in 0..6 loop
    insert into public.store_hours (cafe_id, weekday, open_min, close_min)
    values (p_cafe, d, p_open, p_close);
  end loop;
  for d in 0..6 loop
    s := p_open;
    while s < p_close loop
      e := least(s + 180, p_close);
      r := 'solo';
      if d = 4 and s >= 1020 and s < 1200 then r := 'two'; end if;
      if d in (5,6) and s < 1200 then r := 'two'; end if;
      insert into public.coverage_blocks (cafe_id, weekday, start_min, end_min, rule)
      values (p_cafe, d, s, e, r);
      s := e;
    end loop;
  end loop;
  insert into public.cafe_settings (cafe_id) values (p_cafe);
end;
$$;

-- ============ RLS ============
alter table public.profiles enable row level security;
alter table public.cafes enable row level security;
alter table public.employees enable row level security;
alter table public.store_hours enable row level security;
alter table public.coverage_blocks enable row level security;
alter table public.cafe_settings enable row level security;
alter table public.availability enable row level security;
alter table public.weekly_requests enable row level security;
alter table public.request_status enable row level security;
alter table public.assignments enable row level security;
alter table public.published_schedules enable row level security;
alter table public.cover_requests enable row level security;
alter table public.reminders enable row level security;
alter table public.billing_events enable row level security;

-- profiles
create policy profiles_select_own on public.profiles for select to authenticated using (auth.uid() = id);
create policy profiles_select_owner on public.profiles for select to authenticated using (public.current_role() = 'owner');
create policy profiles_insert_own on public.profiles for insert to authenticated with check (auth.uid() = id);
create policy profiles_update_own on public.profiles for update to authenticated using (auth.uid() = id) with check (auth.uid() = id);
create policy profiles_owner_all on public.profiles for all to authenticated using (public.current_role() = 'owner') with check (public.current_role() = 'owner');

-- cafes
create policy cafes_select_manager on public.cafes for select to authenticated using (owner_id = auth.uid());
create policy cafes_select_owner on public.cafes for select to authenticated using (public.current_role() = 'owner');
create policy cafes_insert_manager on public.cafes for insert to authenticated with check (owner_id = auth.uid());
create policy cafes_update_manager on public.cafes for update to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy cafes_delete_manager on public.cafes for delete to authenticated using (owner_id = auth.uid());

-- employees (manager only; employees read the safe view)
create policy employees_manager_all on public.employees for all to authenticated
  using (public.is_manager_of(cafe_id)) with check (public.is_manager_of(cafe_id));
create policy employees_owner_select on public.employees for select to authenticated using (public.current_role() = 'owner');

-- store_hours
create policy store_hours_manager_all on public.store_hours for all to authenticated
  using (public.is_manager_of(cafe_id)) with check (public.is_manager_of(cafe_id));
create policy store_hours_member_select on public.store_hours for select to authenticated using (public.is_member_of(cafe_id));

-- coverage_blocks
create policy blocks_manager_all on public.coverage_blocks for all to authenticated
  using (public.is_manager_of(cafe_id)) with check (public.is_manager_of(cafe_id));
create policy blocks_member_select on public.coverage_blocks for select to authenticated using (public.is_member_of(cafe_id));

-- cafe_settings
create policy settings_manager_all on public.cafe_settings for all to authenticated
  using (public.is_manager_of(cafe_id)) with check (public.is_manager_of(cafe_id));
create policy settings_member_select on public.cafe_settings for select to authenticated using (public.is_member_of(cafe_id));

-- availability
create policy availability_manager_all on public.availability for all to authenticated
  using (public.is_manager_of(cafe_id)) with check (public.is_manager_of(cafe_id));
create policy availability_self_select on public.availability for select to authenticated
  using (employee_id = public.current_employee_id());
create policy availability_self_insert on public.availability for insert to authenticated
  with check (employee_id = public.current_employee_id() and cafe_id = public.current_cafe_id());
create policy availability_self_update on public.availability for update to authenticated
  using (employee_id = public.current_employee_id())
  with check (employee_id = public.current_employee_id() and cafe_id = public.current_cafe_id());

-- weekly_requests
create policy requests_manager_all on public.weekly_requests for all to authenticated
  using (public.is_manager_of(cafe_id)) with check (public.is_manager_of(cafe_id));
create policy requests_member_select on public.weekly_requests for select to authenticated using (public.is_member_of(cafe_id));

-- request_status
create policy req_status_manager_all on public.request_status for all to authenticated
  using (public.is_manager_of(cafe_id)) with check (public.is_manager_of(cafe_id));
create policy req_status_self_select on public.request_status for select to authenticated
  using (employee_id = public.current_employee_id());
create policy req_status_self_update on public.request_status for update to authenticated
  using (employee_id = public.current_employee_id())
  with check (employee_id = public.current_employee_id());

-- assignments
create policy assignments_manager_all on public.assignments for all to authenticated
  using (public.is_manager_of(cafe_id)) with check (public.is_manager_of(cafe_id));
create policy assignments_self_published on public.assignments for select to authenticated
  using (
    employee_id = public.current_employee_id()
    and exists (
      select 1 from public.published_schedules ps
      where ps.cafe_id = assignments.cafe_id and ps.week_start = assignments.week_start
    )
  );

-- published_schedules (manager only — employees read assignments)
create policy published_manager_all on public.published_schedules for all to authenticated
  using (public.is_manager_of(cafe_id)) with check (public.is_manager_of(cafe_id));

-- cover_requests
create policy cover_manager_all on public.cover_requests for all to authenticated
  using (public.is_manager_of(cafe_id)) with check (public.is_manager_of(cafe_id));
create policy cover_self_select on public.cover_requests for select to authenticated
  using (employee_id = public.current_employee_id());
create policy cover_self_insert on public.cover_requests for insert to authenticated
  with check (
    employee_id = public.current_employee_id()
    and cafe_id = public.current_cafe_id()
    and exists (
      select 1 from public.assignments a
      where a.id = cover_requests.assignment_id and a.employee_id = public.current_employee_id()
    )
  );

-- reminders
create policy reminders_manager_all on public.reminders for all to authenticated
  using (public.is_manager_of(cafe_id)) with check (public.is_manager_of(cafe_id));
create policy reminders_self_select on public.reminders for select to authenticated
  using (employee_id = public.current_employee_id());

-- billing_events
create policy billing_manager_select on public.billing_events for select to authenticated
  using (public.is_manager_of(cafe_id));
create policy billing_owner_select on public.billing_events for select to authenticated
  using (public.current_role() = 'owner');

-- ============ employee-safe views ============
create view public.my_employee_profile with (security_invoker = false) as
  select id, cafe_id, name, roles, can_work_alone, max_hours, active, user_id
  from public.employees
  where user_id = auth.uid();

create view public.my_cafe_info with (security_invoker = false) as
  select c.id, c.name, c.is_sample
  from public.cafes c
  where c.id = (select cafe_id from public.profiles where id = auth.uid());

grant select on public.my_employee_profile to authenticated;
grant select on public.my_cafe_info to authenticated;

grant execute on function public.current_role() to authenticated;
grant execute on function public.current_cafe_id() to authenticated;
grant execute on function public.current_employee_id() to authenticated;
grant execute on function public.is_manager_of(uuid) to authenticated;
grant execute on function public.is_member_of(uuid) to authenticated;
grant execute on function public.cafe_has_access(uuid) to authenticated;
grant execute on function public.seed_cafe_defaults(uuid, int, int) to authenticated;