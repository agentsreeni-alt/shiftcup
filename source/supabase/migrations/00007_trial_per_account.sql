-- The free trial belongs to the account, not the café. Before this, deleting a café
-- and creating a new one started a fresh 14-day trial every time.

alter table public.profiles add column if not exists trial_ends_at timestamptz;

-- Accounts that already set up a real café keep the trial they have.
update public.profiles p
set trial_ends_at = c.trial_ends_at
from (
  select owner_id, min(trial_ends_at) as trial_ends_at
  from public.cafes
  where not is_sample
  group by owner_id
) c
where c.owner_id = p.id and p.trial_ends_at is null;

create or replace function public.guard_cafe_billing()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_trial timestamptz;
begin
  if auth.uid() is null or public.current_role() = 'owner' then
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.owner_id := auth.uid();
    new.subscription_status := 'trial';
    new.paid_until := null;
    new.stripe_customer_id := null;
    new.stripe_subscription_id := null;
    if new.is_sample then
      new.trial_ends_at := now() + interval '14 days';
    else
      -- First real café starts the account's trial; later ones reuse its end date.
      select trial_ends_at into v_trial from public.profiles where id = auth.uid();
      if v_trial is null then
        v_trial := now() + interval '14 days';
        update public.profiles set trial_ends_at = v_trial where id = auth.uid();
      end if;
      new.trial_ends_at := v_trial;
    end if;
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

create or replace function public.prevent_role_change()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or public.current_role() = 'owner' then
    return new;
  end if;
  -- The billing guard above runs as the definer and may set the trial date.
  if pg_trigger_depth() > 1 then
    return new;
  end if;
  if new.role <> old.role then
    raise exception 'Role cannot be changed';
  end if;
  if new.employee_id is distinct from old.employee_id then
    raise exception 'Employee link cannot be changed';
  end if;
  if new.trial_ends_at is distinct from old.trial_ends_at then
    raise exception 'Trial cannot be changed';
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
