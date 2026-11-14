import { supabase } from '@/client/supabase';
import { addDays, startOfWeek, toISODate } from '@/lib/dates';
import {
  buildPublishedReminders,
  buildRequestReminders,
  buildShiftReminders,
  type ReminderDraft,
} from '@/lib/reminders';
import {
  SAMPLE_CAFE_NAME,
  SAMPLE_CLOSE_MIN,
  SAMPLE_EMPLOYEES,
  SAMPLE_OPEN_MIN,
} from '@/lib/sample';
import type {
  Assignment,
  Availability,
  Cafe,
  CafeSettings,
  Channel,
  CoverRequest,
  CoverageBlock,
  Employee,
  EmployeeSelf,
  Profile,
  PublishedSchedule,
  Reminder,
  RequestStatus,
  StoreHour,
  WeeklyRequest,
} from '@/lib/types';

export function currentWeekStart(): string {
  return toISODate(startOfWeek(new Date()));
}

export function nextWeekStart(): string {
  return toISODate(addDays(startOfWeek(new Date()), 7));
}

/**
 * The week the team is planning: always next week. Availability is due during
 * the current week and the schedule is published before next week starts.
 */
export function planningWeekStart(): string {
  return nextWeekStart();
}

export async function loadProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, email, role, cafe_id, employee_id')
    .eq('id', userId)
    .maybeSingle();
  if (error) throw error;
  return (data as Profile) ?? null;
}

export async function loadCafeForManager(userId: string): Promise<Cafe | null> {
  const { data, error } = await supabase
    .from('cafes')
    .select(
      'id, name, owner_id, is_sample, subscription_status, trial_ends_at, paid_until, stripe_customer_id, stripe_subscription_id, timezone, created_at',
    )
    .eq('owner_id', userId)
    .order('created_at', { ascending: true })
    .limit(1);
  if (error) throw error;
  const rows = Array.isArray(data) ? data : [];
  return (rows[0] as Cafe) ?? null;
}

export async function loadEmployeeSelf(): Promise<EmployeeSelf | null> {
  const { data, error } = await supabase
    .from('my_employee_profile')
    .select('id, cafe_id, name, roles, can_work_alone, max_hours, active, user_id')
    .maybeSingle();
  if (error) throw error;
  return (data as EmployeeSelf) ?? null;
}

export async function loadEmployeeCafe(): Promise<{
  id: string;
  name: string;
  is_sample: boolean;
} | null> {
  const { data, error } = await supabase
    .from('my_cafe_info')
    .select('id, name, is_sample')
    .maybeSingle();
  if (error) throw error;
  return (data as { id: string; name: string; is_sample: boolean }) ?? null;
}

export async function loadEmployees(cafeId: string): Promise<Employee[]> {
  const { data, error } = await supabase
    .from('employees')
    .select(
      'id, cafe_id, name, email, phone, roles, can_work_alone, rating, max_hours, hourly_wage, active, user_id, invite_code, usual_week',
    )
    .eq('cafe_id', cafeId)
    .order('name', { ascending: true });
  if (error) throw error;
  return Array.isArray(data) ? (data as Employee[]) : [];
}

export async function loadBlocks(cafeId: string): Promise<CoverageBlock[]> {
  const { data, error } = await supabase
    .from('coverage_blocks')
    .select('id, cafe_id, weekday, start_min, end_min, rule')
    .eq('cafe_id', cafeId)
    .order('weekday', { ascending: true })
    .order('start_min', { ascending: true });
  if (error) throw error;
  return Array.isArray(data) ? (data as CoverageBlock[]) : [];
}

export async function loadStoreHours(cafeId: string): Promise<StoreHour[]> {
  const { data, error } = await supabase
    .from('store_hours')
    .select('cafe_id, weekday, open_min, close_min')
    .eq('cafe_id', cafeId)
    .order('weekday', { ascending: true });
  if (error) throw error;
  return Array.isArray(data) ? (data as StoreHour[]) : [];
}

export async function loadSettings(cafeId: string): Promise<CafeSettings | null> {
  const { data, error } = await supabase
    .from('cafe_settings')
    .select(
      'cafe_id, due_weekday, due_min, publish_weekday, evening_reminder_min, second_reminder_min, max_shift_hours, channel',
    )
    .eq('cafe_id', cafeId)
    .maybeSingle();
  if (error) throw error;
  return (data as CafeSettings) ?? null;
}

export async function loadAvailability(cafeId: string, weekStart: string): Promise<Availability[]> {
  const { data, error } = await supabase
    .from('availability')
    .select('id, cafe_id, employee_id, week_start, weekday, kind, start_min, end_min')
    .eq('cafe_id', cafeId)
    .eq('week_start', weekStart);
  if (error) throw error;
  return Array.isArray(data) ? (data as Availability[]) : [];
}

export async function loadRequest(
  cafeId: string,
  weekStart: string,
): Promise<{ request: WeeklyRequest | null; statuses: RequestStatus[] }> {
  const { data, error } = await supabase
    .from('weekly_requests')
    .select('id, cafe_id, week_start, sent_at')
    .eq('cafe_id', cafeId)
    .eq('week_start', weekStart)
    .maybeSingle();
  if (error) throw error;
  const request = (data as WeeklyRequest) ?? null;
  if (!request) return { request: null, statuses: [] };
  const { data: rows, error: statusError } = await supabase
    .from('request_status')
    .select('id, request_id, cafe_id, employee_id, status')
    .eq('request_id', request.id);
  if (statusError) throw statusError;
  return { request, statuses: Array.isArray(rows) ? (rows as RequestStatus[]) : [] };
}

export async function loadAssignments(cafeId: string, weekStart: string): Promise<Assignment[]> {
  const { data, error } = await supabase
    .from('assignments')
    .select(
      'id, cafe_id, week_start, weekday, block_id, slot, employee_id, start_min, end_min, manual, over_limit',
    )
    .eq('cafe_id', cafeId)
    .eq('week_start', weekStart)
    .order('weekday', { ascending: true })
    .order('start_min', { ascending: true });
  if (error) throw error;
  return Array.isArray(data) ? (data as Assignment[]) : [];
}

export async function loadPublished(
  cafeId: string,
  weekStart: string,
): Promise<PublishedSchedule | null> {
  const { data, error } = await supabase
    .from('published_schedules')
    .select('id, cafe_id, week_start, published_at, snapshot')
    .eq('cafe_id', cafeId)
    .eq('week_start', weekStart)
    .maybeSingle();
  if (error) throw error;
  return (data as PublishedSchedule) ?? null;
}

export async function loadCoverRequests(cafeId: string): Promise<CoverRequest[]> {
  const { data, error } = await supabase
    .from('cover_requests')
    .select(
      'id, cafe_id, assignment_id, employee_id, week_start, weekday, note, resolved, created_at',
    )
    .eq('cafe_id', cafeId)
    .eq('resolved', false)
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) throw error;
  return Array.isArray(data) ? (data as CoverRequest[]) : [];
}

export async function loadReminders(cafeId: string, weekStart: string): Promise<Reminder[]> {
  const { data, error } = await supabase
    .from('reminders')
    .select(
      'id, cafe_id, employee_id, week_start, weekday, kind, send_at, body, channel, state, sent_at',
    )
    .eq('cafe_id', cafeId)
    .eq('week_start', weekStart)
    .order('send_at', { ascending: true })
    .limit(200);
  if (error) throw error;
  return Array.isArray(data) ? (data as Reminder[]) : [];
}

export async function saveAssignments(
  cafeId: string,
  weekStart: string,
  list: Assignment[],
): Promise<void> {
  const { data: existing, error: readError } = await supabase
    .from('assignments')
    .select('id, block_id, slot, employee_id')
    .eq('cafe_id', cafeId)
    .eq('week_start', weekStart);
  if (readError) throw readError;

  const previous = new Map(
    (existing ?? []).map((row) => [`${row.block_id}:${row.slot}`, row] as const),
  );
  const keep = new Set(list.map((a) => `${a.block_id}:${a.slot}`));
  const toDelete = (existing ?? [])
    .filter((row) => !keep.has(`${row.block_id}:${row.slot}`))
    .map((row) => row.id);

  if (toDelete.length > 0) {
    const { error } = await supabase.from('assignments').delete().in('id', toDelete);
    if (error) throw error;
  }

  if (list.length > 0) {
    const rows = list.map((a) => ({
      cafe_id: cafeId,
      week_start: weekStart,
      weekday: a.weekday,
      block_id: a.block_id,
      slot: a.slot,
      employee_id: a.employee_id,
      start_min: a.start_min,
      end_min: a.end_min,
      manual: a.manual,
      over_limit: a.over_limit,
    }));
    const { error } = await supabase
      .from('assignments')
      .upsert(rows, { onConflict: 'week_start,block_id,slot' });
    if (error) throw error;
  }

  const changedIds = list
    .map((a) => {
      const before = previous.get(`${a.block_id}:${a.slot}`);
      if (before && before.employee_id !== a.employee_id) return before.id;
      return null;
    })
    .filter((id): id is string => Boolean(id));

  if (changedIds.length > 0) {
    const { error } = await supabase
      .from('cover_requests')
      .update({ resolved: true })
      .in('assignment_id', changedIds);
    if (error) throw error;
  }
}

async function replaceReminders(
  cafeId: string,
  weekStart: string,
  drafts: ReminderDraft[],
): Promise<void> {
  const { error: deleteError } = await supabase
    .from('reminders')
    .delete()
    .eq('cafe_id', cafeId)
    .eq('week_start', weekStart)
    .eq('state', 'queued');
  if (deleteError) throw deleteError;

  if (drafts.length === 0) return;
  const rows = drafts.map((d) => ({
    cafe_id: cafeId,
    employee_id: d.employee_id,
    week_start: d.week_start,
    weekday: d.weekday,
    kind: d.kind,
    send_at: d.send_at,
    body: d.body,
    channel: d.channel,
    state: 'queued' as const,
  }));
  const { error } = await supabase.from('reminders').insert(rows);
  if (error) throw error;
}

export async function publishWeek(params: {
  cafeId: string;
  weekStart: string;
  assignments: Assignment[];
  employeeIds: string[];
  settings: CafeSettings;
}): Promise<void> {
  const snapshot = params.assignments.map((a) => ({
    weekday: a.weekday,
    block_id: a.block_id,
    slot: a.slot,
    employee_id: a.employee_id,
    start_min: a.start_min,
    end_min: a.end_min,
  }));

  const { error } = await supabase.from('published_schedules').upsert(
    {
      cafe_id: params.cafeId,
      week_start: params.weekStart,
      published_at: new Date().toISOString(),
      snapshot,
    },
    { onConflict: 'cafe_id,week_start' },
  );
  if (error) throw error;

  const engineAssignments = params.assignments.map((a) => ({
    blockId: a.block_id,
    weekday: a.weekday,
    slot: a.slot,
    employeeId: a.employee_id,
    startMin: a.start_min,
    endMin: a.end_min,
  }));

  const drafts = [
    ...buildPublishedReminders({
      weekStart: params.weekStart,
      assignments: engineAssignments,
      employeeIds: params.employeeIds,
      channel: params.settings.channel,
    }),
    ...buildShiftReminders({
      weekStart: params.weekStart,
      assignments: engineAssignments,
      employeeIds: params.employeeIds,
      eveningMin: params.settings.evening_reminder_min,
      secondMin: params.settings.second_reminder_min,
      channel: params.settings.channel,
    }),
  ];

  await replaceReminders(params.cafeId, params.weekStart, drafts);
}

export async function sendWeeklyRequest(params: {
  cafeId: string;
  weekStart: string;
  employeeIds: string[];
  settings: CafeSettings;
}): Promise<void> {
  const { data, error } = await supabase
    .from('weekly_requests')
    .upsert(
      { cafe_id: params.cafeId, week_start: params.weekStart, sent_at: new Date().toISOString() },
      { onConflict: 'cafe_id,week_start' },
    )
    .select('id')
    .maybeSingle();
  if (error) throw error;
  const requestId = data?.id as string | undefined;
  if (!requestId) throw new Error('Could not create the weekly request');

  // Keep anyone who already answered (or sent availability before the request)
  // as answered. Only people still waiting get a status reset and a reminder.
  const [{ data: existing, error: existingError }, { data: availRows, error: availError }] =
    await Promise.all([
      supabase.from('request_status').select('employee_id, status').eq('request_id', requestId),
      supabase
        .from('availability')
        .select('employee_id')
        .eq('cafe_id', params.cafeId)
        .eq('week_start', params.weekStart),
    ]);
  if (existingError) throw existingError;
  if (availError) throw availError;
  const prior = new Map((existing ?? []).map((r) => [r.employee_id as string, r.status as string]));
  const sentAvailability = new Set((availRows ?? []).map((r) => r.employee_id as string));

  const rows = params.employeeIds.map((employeeId) => {
    const before = prior.get(employeeId);
    const status =
      before && before !== 'waiting'
        ? before
        : sentAvailability.has(employeeId)
          ? 'answered'
          : 'waiting';
    return { request_id: requestId, cafe_id: params.cafeId, employee_id: employeeId, status };
  });
  if (rows.length > 0) {
    const { error: statusError } = await supabase
      .from('request_status')
      .upsert(rows, { onConflict: 'request_id,employee_id' });
    if (statusError) throw statusError;
  }
  const stillWaiting = rows.filter((r) => r.status === 'waiting').map((r) => r.employee_id);

  const drafts = buildRequestReminders({
    weekStart: params.weekStart,
    employeeIds: stillWaiting,
    dueWeekday: params.settings.due_weekday,
    dueMin: params.settings.due_min,
    channel: params.settings.channel,
  });
  if (drafts.length > 0) {
    const { error: reminderError } = await supabase.from('reminders').insert(
      drafts.map((d) => ({
        cafe_id: params.cafeId,
        employee_id: d.employee_id,
        week_start: d.week_start,
        weekday: d.weekday,
        kind: d.kind,
        send_at: d.send_at,
        body: d.body,
        channel: d.channel,
        state: 'queued' as const,
      })),
    );
    if (reminderError) throw reminderError;
  }
}

export async function nudgeEmployee(params: {
  cafeId: string;
  weekStart: string;
  employeeId: string;
  body: string;
  channel: Channel;
}): Promise<void> {
  const { error } = await supabase.from('reminders').insert({
    cafe_id: params.cafeId,
    employee_id: params.employeeId,
    week_start: params.weekStart,
    weekday: 0,
    kind: 'request',
    send_at: new Date().toISOString(),
    body: params.body,
    channel: params.channel,
    state: 'queued',
  });
  if (error) throw error;
}

export async function createCafe(params: {
  userId: string;
  name: string;
  openMin: number;
  closeMin: number;
  firstNames: string[];
}): Promise<Cafe> {
  const { data, error } = await supabase
    .from('cafes')
    .insert({ name: params.name.trim(), owner_id: params.userId })
    .select(
      'id, name, owner_id, is_sample, subscription_status, trial_ends_at, paid_until, stripe_customer_id, stripe_subscription_id, timezone, created_at',
    )
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('Could not create the café');
  const cafe = data as Cafe;

  const { error: seedError } = await supabase.rpc('seed_cafe_defaults', {
    p_cafe: cafe.id,
    p_open: params.openMin,
    p_close: params.closeMin,
  });
  if (seedError) throw seedError;

  const names = params.firstNames.map((n) => n.trim()).filter(Boolean);
  if (names.length > 0) {
    const { error: empError } = await supabase.from('employees').insert(
      names.map((name) => ({
        cafe_id: cafe.id,
        name,
        roles: ['barista'],
        rating: 3,
        max_hours: 20,
        hourly_wage: 15,
      })),
    );
    if (empError) throw empError;
  }

  const { error: profileError } = await supabase
    .from('profiles')
    .update({ cafe_id: cafe.id })
    .eq('id', params.userId);
  if (profileError) throw profileError;

  return cafe;
}

export async function createSampleCafe(userId: string): Promise<Cafe> {
  const { data, error } = await supabase
    .from('cafes')
    .insert({ name: SAMPLE_CAFE_NAME, owner_id: userId, is_sample: true })
    .select(
      'id, name, owner_id, is_sample, subscription_status, trial_ends_at, paid_until, stripe_customer_id, stripe_subscription_id, timezone, created_at',
    )
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('Could not create the sample café');
  const cafe = data as Cafe;

  const { error: seedError } = await supabase.rpc('seed_cafe_defaults', {
    p_cafe: cafe.id,
    p_open: SAMPLE_OPEN_MIN,
    p_close: SAMPLE_CLOSE_MIN,
  });
  if (seedError) throw seedError;

  const { data: inserted, error: empError } = await supabase
    .from('employees')
    .insert(
      SAMPLE_EMPLOYEES.map((e) => ({
        cafe_id: cafe.id,
        name: e.name,
        roles: e.roles,
        can_work_alone: e.canWorkAlone,
        rating: e.rating,
        max_hours: e.maxHours,
        hourly_wage: e.hourlyWage,
      })),
    )
    .select('id, name');
  if (empError) throw empError;

  const byName = new Map((inserted ?? []).map((row) => [row.name as string, row.id as string]));
  const weekStart = planningWeekStart();

  const availRows = SAMPLE_EMPLOYEES.flatMap((e) => {
    const employeeId = byName.get(e.name);
    if (!employeeId) return [];
    return [0, 1, 2, 3, 4, 5, 6].map((weekday) => {
      const slot = e.availability[weekday] ?? { kind: 'none' as const };
      return {
        cafe_id: cafe.id,
        employee_id: employeeId,
        week_start: weekStart,
        weekday,
        kind: slot.kind,
        start_min: slot.startMin ?? null,
        end_min: slot.endMin ?? null,
      };
    });
  });
  if (availRows.length > 0) {
    const { error } = await supabase.from('availability').insert(availRows);
    if (error) throw error;
  }

  const { data: request, error: reqError } = await supabase
    .from('weekly_requests')
    .insert({ cafe_id: cafe.id, week_start: weekStart })
    .select('id')
    .maybeSingle();
  if (reqError) throw reqError;

  if (request?.id) {
    const statusRows = SAMPLE_EMPLOYEES.flatMap((e) => {
      const employeeId = byName.get(e.name);
      if (!employeeId) return [];
      return [
        {
          request_id: request.id as string,
          cafe_id: cafe.id,
          employee_id: employeeId,
          status: e.status,
        },
      ];
    });
    if (statusRows.length > 0) {
      const { error } = await supabase.from('request_status').insert(statusRows);
      if (error) throw error;
    }
  }

  const { error: profileError } = await supabase
    .from('profiles')
    .update({ cafe_id: cafe.id })
    .eq('id', userId);
  if (profileError) throw profileError;

  return cafe;
}

export async function updateCafe(
  cafeId: string,
  patch: Partial<Pick<Cafe, 'name'>>,
): Promise<void> {
  const { error } = await supabase.from('cafes').update(patch).eq('id', cafeId);
  if (error) throw error;
}

export async function updateSettings(
  cafeId: string,
  patch: Partial<Omit<CafeSettings, 'cafe_id'>>,
): Promise<void> {
  const { error } = await supabase.from('cafe_settings').update(patch).eq('cafe_id', cafeId);
  if (error) throw error;
}

export async function updateStoreHour(
  cafeId: string,
  weekday: number,
  openMin: number,
  closeMin: number,
): Promise<void> {
  const { error } = await supabase
    .from('store_hours')
    .upsert(
      { cafe_id: cafeId, weekday, open_min: openMin, close_min: closeMin },
      { onConflict: 'cafe_id,weekday' },
    );
  if (error) throw error;
}

export async function addBlock(params: {
  cafeId: string;
  weekday: number;
  startMin: number;
  endMin: number;
  rule: 'solo' | 'two';
}): Promise<void> {
  const { error } = await supabase.from('coverage_blocks').insert({
    cafe_id: params.cafeId,
    weekday: params.weekday,
    start_min: params.startMin,
    end_min: params.endMin,
    rule: params.rule,
  });
  if (error) throw error;
}

export async function updateBlock(
  blockId: string,
  patch: { start_min?: number; end_min?: number; rule?: 'solo' | 'two' },
): Promise<void> {
  const { error } = await supabase.from('coverage_blocks').update(patch).eq('id', blockId);
  if (error) throw error;
}

export async function deleteBlock(blockId: string): Promise<void> {
  const { error } = await supabase.from('coverage_blocks').delete().eq('id', blockId);
  if (error) throw error;
}

export async function addEmployee(params: {
  cafeId: string;
  name: string;
  email?: string;
  phone?: string;
  roles: string[];
  canWorkAlone: boolean;
  rating: number;
  maxHours: number;
  hourlyWage: number;
}): Promise<Employee> {
  const { data, error } = await supabase
    .from('employees')
    .insert({
      cafe_id: params.cafeId,
      name: params.name.trim(),
      email: params.email?.trim() || null,
      phone: params.phone?.trim() || null,
      roles: params.roles,
      can_work_alone: params.canWorkAlone,
      rating: params.rating,
      max_hours: params.maxHours,
      hourly_wage: params.hourlyWage,
    })
    .select(
      'id, cafe_id, name, email, phone, roles, can_work_alone, rating, max_hours, hourly_wage, active, user_id, invite_code, usual_week',
    )
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('Could not add the team member');
  return data as Employee;
}

export async function updateEmployee(
  employeeId: string,
  patch: Partial<
    Pick<
      Employee,
      | 'name'
      | 'email'
      | 'phone'
      | 'roles'
      | 'can_work_alone'
      | 'rating'
      | 'max_hours'
      | 'hourly_wage'
      | 'active'
      | 'usual_week'
    >
  >,
): Promise<void> {
  const { error } = await supabase.from('employees').update(patch).eq('id', employeeId);
  if (error) throw error;
}

export async function deactivateEmployee(cafeId: string, employeeId: string): Promise<void> {
  const { error } = await supabase.from('employees').update({ active: false }).eq('id', employeeId);
  if (error) throw error;
  const { error: reminderError } = await supabase
    .from('reminders')
    .update({ state: 'cancelled' })
    .eq('cafe_id', cafeId)
    .eq('employee_id', employeeId)
    .eq('state', 'queued');
  if (reminderError) throw reminderError;
}

/** Removes one day of a person's availability for one week, so their usual week applies. */
export async function clearAvailabilityDay(
  employeeId: string,
  weekStart: string,
  weekday: number,
): Promise<void> {
  const { error } = await supabase
    .from('availability')
    .delete()
    .eq('employee_id', employeeId)
    .eq('week_start', weekStart)
    .eq('weekday', weekday);
  if (error) throw error;
}

export async function saveAvailabilityRows(rows: Availability[]): Promise<void> {
  if (rows.length === 0) return;
  const { error } = await supabase.from('availability').upsert(
    rows.map((r) => ({
      cafe_id: r.cafe_id,
      employee_id: r.employee_id,
      week_start: r.week_start,
      weekday: r.weekday,
      kind: r.kind,
      start_min: r.start_min,
      end_min: r.end_min,
      updated_at: new Date().toISOString(),
    })),
    { onConflict: 'employee_id,week_start,weekday' },
  );
  if (error) throw error;
}

export async function markAnswered(requestId: string, employeeId: string): Promise<void> {
  const { error } = await supabase
    .from('request_status')
    .update({ status: 'answered', updated_at: new Date().toISOString() })
    .eq('request_id', requestId)
    .eq('employee_id', employeeId);
  if (error) throw error;
}

export async function createCoverRequest(params: {
  cafeId: string;
  assignmentId: string;
  employeeId: string;
  weekStart: string;
  weekday: number;
  note?: string;
}): Promise<void> {
  const { error } = await supabase.from('cover_requests').insert({
    cafe_id: params.cafeId,
    assignment_id: params.assignmentId,
    employee_id: params.employeeId,
    week_start: params.weekStart,
    weekday: params.weekday,
    note: params.note?.trim() || null,
  });
  if (error) throw error;
}

export async function resolveCoverRequest(id: string): Promise<void> {
  const { error } = await supabase.from('cover_requests').update({ resolved: true }).eq('id', id);
  if (error) throw error;
}

export async function loadMyAssignments(weekStart: string): Promise<Assignment[]> {
  const { data, error } = await supabase
    .from('assignments')
    .select(
      'id, cafe_id, week_start, weekday, block_id, slot, employee_id, start_min, end_min, manual, over_limit',
    )
    .eq('week_start', weekStart)
    .order('weekday', { ascending: true })
    .order('start_min', { ascending: true });
  if (error) throw error;
  return Array.isArray(data) ? (data as Assignment[]) : [];
}

export async function loadMyCoverRequests(): Promise<CoverRequest[]> {
  const { data, error } = await supabase
    .from('cover_requests')
    .select(
      'id, cafe_id, assignment_id, employee_id, week_start, weekday, note, resolved, created_at',
    )
    .eq('resolved', false)
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) throw error;
  return Array.isArray(data) ? (data as CoverRequest[]) : [];
}

export async function loadMyReminders(): Promise<Reminder[]> {
  const { data, error } = await supabase
    .from('reminders')
    .select(
      'id, cafe_id, employee_id, week_start, weekday, kind, send_at, body, channel, state, sent_at',
    )
    .eq('state', 'queued')
    .order('send_at', { ascending: true })
    .limit(20);
  if (error) throw error;
  return Array.isArray(data) ? (data as Reminder[]) : [];
}

export async function loadAllCafes(): Promise<Cafe[]> {
  const { data, error } = await supabase
    .from('cafes')
    .select(
      'id, name, owner_id, is_sample, subscription_status, trial_ends_at, paid_until, stripe_customer_id, stripe_subscription_id, timezone, created_at',
    )
    .order('created_at', { ascending: false })
    .limit(200);
  if (error) throw error;
  return Array.isArray(data) ? (data as Cafe[]) : [];
}

export async function loadMyAvailability(weekStart: string): Promise<Availability[]> {
  const { data, error } = await supabase
    .from('availability')
    .select('id, cafe_id, employee_id, week_start, weekday, kind, start_min, end_min')
    .eq('week_start', weekStart);
  if (error) throw error;
  return Array.isArray(data) ? (data as Availability[]) : [];
}

export async function loadMyRequestStatus(
  weekStart: string,
): Promise<{ request: WeeklyRequest | null; status: RequestStatus | null }> {
  const { data, error } = await supabase
    .from('weekly_requests')
    .select('id, cafe_id, week_start, sent_at')
    .eq('week_start', weekStart)
    .maybeSingle();
  if (error) throw error;
  const request = (data as WeeklyRequest) ?? null;
  if (!request) return { request: null, status: null };
  const { data: rows, error: statusError } = await supabase
    .from('request_status')
    .select('id, request_id, cafe_id, employee_id, status')
    .eq('request_id', request.id)
    .limit(1);
  if (statusError) throw statusError;
  const list = Array.isArray(rows) ? (rows as RequestStatus[]) : [];
  return { request, status: list[0] ?? null };
}

export async function loadMySettings(): Promise<CafeSettings | null> {
  const { data, error } = await supabase
    .from('cafe_settings')
    .select(
      'cafe_id, due_weekday, due_min, publish_weekday, evening_reminder_min, second_reminder_min, max_shift_hours, channel',
    )
    .maybeSingle();
  if (error) throw error;
  return (data as CafeSettings) ?? null;
}

export async function loadMyBlocks(): Promise<CoverageBlock[]> {
  const { data, error } = await supabase
    .from('coverage_blocks')
    .select('id, cafe_id, weekday, start_min, end_min, rule')
    .order('weekday', { ascending: true })
    .order('start_min', { ascending: true });
  if (error) throw error;
  return Array.isArray(data) ? (data as CoverageBlock[]) : [];
}

export async function loadMyEmployees(): Promise<Employee[]> {
  const { data, error } = await supabase
    .from('employees')
    .select(
      'id, cafe_id, name, email, phone, roles, can_work_alone, rating, max_hours, hourly_wage, active, user_id, invite_code, usual_week',
    )
    .order('name', { ascending: true });
  if (error) throw error;
  return Array.isArray(data) ? (data as Employee[]) : [];
}

export async function loadMyPublished(weekStart: string): Promise<PublishedSchedule | null> {
  const { data, error } = await supabase
    .from('published_schedules')
    .select('id, cafe_id, week_start, published_at, snapshot')
    .eq('week_start', weekStart)
    .maybeSingle();
  if (error) throw error;
  return (data as PublishedSchedule) ?? null;
}

export async function loadMyCafeSettings(): Promise<CafeSettings | null> {
  return loadMySettings();
}

export function weekStartFromOffset(offset: number): string {
  const base = startOfWeek(new Date());
  return toISODate(addDays(base, offset * 7));
}

/** Employee side: first names of the active people in my café. */
export async function loadMyTeam(): Promise<{ id: string; name: string }[]> {
  const { data, error } = await supabase
    .from('my_team')
    .select('id, name')
    .order('name', { ascending: true });
  if (error) throw error;
  return Array.isArray(data) ? (data as { id: string; name: string }[]) : [];
}

/** Employee side: the published week for my café (never the draft). */
export async function loadMyPublishedWeek(weekStart: string): Promise<PublishedSchedule | null> {
  const { data, error } = await supabase
    .from('published_schedules')
    .select('id, cafe_id, week_start, published_at, snapshot')
    .eq('week_start', weekStart)
    .maybeSingle();
  if (error) throw error;
  return (data as PublishedSchedule) ?? null;
}
