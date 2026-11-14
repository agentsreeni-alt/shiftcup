-- Employees can see who they work with: first names of the active people in their own
-- café, nothing else (no wages, ratings, email or phone). Used by the "Whole team" view,
-- which reads the published week (never drafts).

create or replace view public.my_team with (security_invoker = false) as
  select e.id, e.name
  from public.employees e
  where e.cafe_id = public.current_cafe_id()
    and e.active;

revoke all on public.my_team from public, anon;
grant select on public.my_team to authenticated;
