import { addDays, dateAtMinutes, dateForWeekday, fmtTime, fromISODate } from '@/lib/dates';
import { allShiftRuns, type EngineAssignment } from '@/lib/scheduling';
import type { Channel, ReminderKind } from '@/lib/types';

const ROLE_VERB: Record<string, string> = {
  scooper: 'work as scooper',
  barista: 'work as barista',
  solo: 'work solo',
};
const ROLE_NOUN: Record<string, string> = {
  scooper: 'scooper',
  barista: 'barista',
  solo: 'solo',
};

export type ReminderDraft = {
  employee_id: string;
  week_start: string;
  weekday: number;
  kind: ReminderKind;
  send_at: string;
  body: string;
  channel: Channel;
};

export function leadLabel(minutes: number): string {
  if (minutes === 60) return 'one hour';
  if (minutes === 30) return '30 minutes';
  if (minutes === 120) return 'two hours';
  if (minutes === 180) return 'three hours';
  return `${minutes} minutes`;
}

export function buildShiftReminders(params: {
  weekStart: string;
  assignments: EngineAssignment[];
  employeeIds: string[];
  eveningMin: number;
  secondMin: number;
  channel: Channel;
}): ReminderDraft[] {
  const out: ReminderDraft[] = [];
  for (const employeeId of params.employeeIds) {
    const runs = allShiftRuns(params.assignments, employeeId);
    for (const run of runs) {
      const day = dateForWeekday(params.weekStart, run.weekday);
      const eveningAt = dateAtMinutes(addDays(day, -1), params.eveningMin);
      const soonAt = new Date(
        dateAtMinutes(day, run.startMin).getTime() - params.secondMin * 60000,
      );
      const verb = ROLE_VERB[run.slot] ?? 'work';
      const noun = ROLE_NOUN[run.slot] ?? 'shift';
      out.push({
        employee_id: employeeId,
        week_start: params.weekStart,
        weekday: run.weekday,
        kind: 'evening',
        send_at: eveningAt.toISOString(),
        body: `You're scheduled to ${verb} tomorrow, ${fmtTime(run.startMin)} to ${fmtTime(
          run.endMin,
        )}`,
        channel: params.channel,
      });
      out.push({
        employee_id: employeeId,
        week_start: params.weekStart,
        weekday: run.weekday,
        kind: 'soon',
        send_at: soonAt.toISOString(),
        body: `Your ${noun} shift starts in ${leadLabel(params.secondMin)}, at ${fmtTime(
          run.startMin,
        )}`,
        channel: params.channel,
      });
    }
  }
  return out;
}

export function buildRequestReminders(params: {
  weekStart: string;
  employeeIds: string[];
  dueWeekday: number;
  dueMin: number;
  channel: Channel;
}): ReminderDraft[] {
  const sendAt = new Date();
  return params.employeeIds.map((employeeId) => ({
    employee_id: employeeId,
    week_start: params.weekStart,
    weekday: params.dueWeekday,
    kind: 'request' as ReminderKind,
    send_at: sendAt.toISOString(),
    body: `Availability for the week of ${fromISODate(params.weekStart).getMonth() + 1}/${fromISODate(
      params.weekStart,
    ).getDate()} is due ${['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'][params.dueWeekday]} at ${fmtTime(
      params.dueMin,
    )}. Open ShiftCup to send the days and times you can work.`,
    channel: params.channel,
  }));
}

export function buildPublishedReminders(params: {
  weekStart: string;
  assignments: EngineAssignment[];
  employeeIds: string[];
  channel: Channel;
}): ReminderDraft[] {
  const sendAt = new Date().toISOString();
  const out: ReminderDraft[] = [];
  for (const employeeId of params.employeeIds) {
    const runs = allShiftRuns(params.assignments, employeeId);
    if (runs.length === 0) continue;
    const lines = runs.map(
      (r) =>
        `${['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][r.weekday]} ${fmtTime(
          r.startMin,
        )} to ${fmtTime(r.endMin)} (${ROLE_NOUN[r.slot] ?? 'shift'})`,
    );
    out.push({
      employee_id: employeeId,
      week_start: params.weekStart,
      weekday: runs[0].weekday,
      kind: 'published',
      send_at: sendAt,
      body: `Your schedule is ready. ${lines.join('; ')}.`,
      channel: params.channel,
    });
  }
  return out;
}
