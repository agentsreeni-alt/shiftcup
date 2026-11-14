-- Security hardening found in QA.
--
-- 1. Managers could edit their own café's billing fields straight through the API
--    (subscription_status, paid_until, trial_ends_at...) and get free service.
-- 2. Any signed-in user could point their own profile at another café or employee,
--    then read that café's published schedule.
-- 3. seed_cafe_defaults could be called on any café id, even without signing in.
--
-- Trusted server code (edge functions with the service role, Stripe webhook) has no
-- auth.uid(), so it is unaffected. The platform owner role is also allowed through.

-- ---------- cafés: billing fields are server-only ----------
create or replace function public.guard_cafe_billing()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or public.current_role() = 'owner' then
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.subscription_status := 'trial';
    new.trial_ends_at := now() + interval '14 days';
    new.paid_until := null;
    new.stripe_customer_id := null;
    new.stripe_subscription_id := null;
    return new;
  end if;

  -- UPDATE: everything except the café's name and timezone stays as it was.
  new.owner_id := old.owner_id;
  new.is_sample := old.is_sample;
  new.subscription_status := old.subscription_status;
  new.trial_ends_at := old.trial_ends_at;
  new.paid_until := old.paid_until;
  new.stripe_customer_id := old.stripe_customer_id;
  new.stripe_subscription_id := old.stripe_subscription_id;
  return new;
end;
$$;

drop trigger if exists cafes_billing_guard on public.cafes;
create trigger cafes_billing_guard
  before insert or update on public.cafes
  for each row execute function public.guard_cafe_billing();

-- ---------- profiles: membership is set by the server, not the user ----------
create or replace function public.prevent_role_change()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or public.current_role() = 'owner' then
    return new;
  end if;
  if new.role <> old.role then
    raise exception 'Role cannot be changed';
  end if;
  if new.employee_id is distinct from old.employee_id then
    raise exception 'Employee link cannot be changed';
  end if;
  -- A manager may link the café they own (setup), or unlink. Nothing else.
  if new.cafe_id is distinct from old.cafe_id
     and new.cafe_id is not null
     and not exists (select 1 from public.cafes where id = new.cafe_id and owner_id = auth.uid()) then
    raise exception 'Café cannot be changed';
  end if;
  return new;
end;
$$;

-- ---------- seed_cafe_defaults: only for a café you own ----------
create or replace function public.seed_cafe_defaults(p_cafe uuid, p_open int, p_close int)
returns void language plpgsql security definer set search_path = public as $$
declare d int; s int; e int; r public.block_rule;
begin
  if not exists (select 1 from public.cafes where id = p_cafe and owner_id = auth.uid()) then
    raise exception 'Not allowed';
  end if;
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

revoke execute on function public.seed_cafe_defaults(uuid, int, int) from public, anon;
grant execute on function public.seed_cafe_defaults(uuid, int, int) to authenticated;
revoke execute on function public.guard_cafe_billing() from public, anon, authenticated;
