import { DAY_LONG, fmtTime } from '@/lib/dates';
import type { Availability, UsualDay } from '@/lib/types';

export const ANY_DAY: UsualDay = { kind: 'any', start_min: null, end_min: null };

/** Seven days, Monday first, or null when the value is missing or malformed. */
export function asWeek(value: unknown): UsualDay[] | null {
  if (!Array.isArray(value) || value.length !== 7) return null;
  return value.map((d) => normalizeDay(d as UsualDay | null));
}

export function normalizeDay(d: UsualDay | null | undefined): UsualDay {
  if (!d) return ANY_DAY;
  if (d.kind === 'window' && d.start_min != null && d.end_min != null) {
    return { kind: 'window', start_min: d.start_min, end_min: d.end_min };
  }
  return { kind: d.kind === 'none' ? 'none' : 'any', start_min: null, end_min: null };
}

/** "Any time", "Not available" or "2 PM – 10 PM". */
export function dayText(d: UsualDay | null | undefined): string {
  const day = normalizeDay(d);
  if (day.kind === 'none') return 'Not available';
  if (day.kind === 'window') return `${fmtTime(day.start_min ?? 0)} – ${fmtTime(day.end_min ?? 0)}`;
  return 'Any time';
}

export function sameDay(a: UsualDay | null | undefined, b: UsualDay | null | undefined): boolean {
  const x = normalizeDay(a);
  const y = normalizeDay(b);
  return x.kind === y.kind && x.start_min === y.start_min && x.end_min === y.end_min;
}

export type DayChange = { weekday: number; day: string; from: string | null; to: string };

/** The days a request would change, compared with what is in force now. */
export function changedDays(before: UsualDay[] | null, after: UsualDay[]): DayChange[] {
  const out: DayChange[] = [];
  after.forEach((d, weekday) => {
    const prev = before ? before[weekday] : null;
    if (before && sameDay(prev, d)) return;
    out.push({
      weekday,
      day: DAY_LONG[weekday],
      from: before ? dayText(prev) : null,
      to: dayText(d),
    });
  });
  return out;
}

/** One week as it stands: that week's own answers laid over the usual week. */
export function effectiveWeek(usual: UsualDay[] | null, rows: Availability[]): UsualDay[] {
  const week = (usual ?? Array.from({ length: 7 }, () => ANY_DAY)).map(normalizeDay);
  for (const r of rows) {
    if (r.weekday < 0 || r.weekday > 6) continue;
    week[r.weekday] = normalizeDay({ kind: r.kind, start_min: r.start_min, end_min: r.end_min });
  }
  return week;
}
