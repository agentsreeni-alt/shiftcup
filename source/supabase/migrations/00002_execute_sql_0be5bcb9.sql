CREATE OR REPLACE FUNCTION public.prevent_role_change() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO public AS $$
begin
  if new.role <> old.role and auth.uid() is not null and public.current_role() <> 'owner' then
    raise exception 'Role cannot be changed';
  end if;
  return new;
end;
$$;