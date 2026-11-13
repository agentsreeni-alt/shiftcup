-- Employees could never see their published shifts.
-- assignments_self_published checks EXISTS (published_schedules ...), but that
-- subquery runs under the employee's own row-level security, and employees had
-- no read policy on published_schedules, so the check was always false.
-- Let employees read the published weeks of their own café.
create policy published_self_select on public.published_schedules
  for select to authenticated
  using (cafe_id = public.current_cafe_id());
