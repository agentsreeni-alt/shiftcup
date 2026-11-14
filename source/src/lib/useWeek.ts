import { useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';

import {
  loadAssignments,
  loadAvailability,
  loadBlocks,
  loadCoverRequests,
  loadEmployees,
  loadPendingAvailabilityRequests,
  loadPublished,
  loadReminders,
  loadRequest,
  loadSettings,
} from '@/lib/api';
import { useApp } from '@/lib/app-context';
import {
  findClashes,
  findGaps,
  weekMinutes,
  weekWages,
  type EngineAssignment,
  type EngineContext,
} from '@/lib/scheduling';
import type {
  Assignment,
  Availability,
  AvailabilityRequest,
  CafeSettings,
  CoverRequest,
  CoverageBlock,
  Employee,
  PublishedSchedule,
  Reminder,
  RequestStatus,
  WeeklyRequest,
} from '@/lib/types';

export type WeekData = {
  loading: boolean;
  error: string;
  employees: Employee[];
  blocks: CoverageBlock[];
  availability: Availability[];
  request: WeeklyRequest | null;
  statuses: RequestStatus[];
  assignments: Assignment[];
  published: PublishedSchedule | null;
  coverRequests: CoverRequest[];
  /** Availability changes the team has asked for and the manager has not decided yet. */
  changeRequests: AvailabilityRequest[];
  settings: CafeSettings | null;
  reminders: Reminder[];
  engine: EngineContext;
  gaps: ReturnType<typeof findGaps>;
  clashes: ReturnType<typeof findClashes>;
  totalMinutes: number;
  totalWages: number;
  reload: () => Promise<void>;
};

export function useWeekData(weekStart: string): WeekData {
  const { cafe } = useApp();
  const cafeId = cafe?.id ?? '';
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [blocks, setBlocks] = useState<CoverageBlock[]>([]);
  const [availability, setAvailability] = useState<Availability[]>([]);
  const [request, setRequest] = useState<WeeklyRequest | null>(null);
  const [statuses, setStatuses] = useState<RequestStatus[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [published, setPublished] = useState<PublishedSchedule | null>(null);
  const [coverRequests, setCoverRequests] = useState<CoverRequest[]>([]);
  const [settings, setSettings] = useState<CafeSettings | null>(null);
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [changeRequests, setChangeRequests] = useState<AvailabilityRequest[]>([]);

  const load = useCallback(async () => {
    if (!cafeId) {
      setLoading(false);
      return;
    }
    try {
      setError('');
      const [emps, blks, avail, req, asg, pub, covers, cfg, rem, changes] = await Promise.all([
        loadEmployees(cafeId),
        loadBlocks(cafeId),
        loadAvailability(cafeId, weekStart),
        loadRequest(cafeId, weekStart),
        loadAssignments(cafeId, weekStart),
        loadPublished(cafeId, weekStart),
        loadCoverRequests(cafeId),
        loadSettings(cafeId),
        loadReminders(cafeId, weekStart),
        loadPendingAvailabilityRequests(cafeId),
      ]);
      setEmployees(emps);
      setBlocks(blks);
      setAvailability(avail);
      setRequest(req.request);
      setStatuses(req.statuses);
      setAssignments(asg);
      setPublished(pub);
      setCoverRequests(covers);
      setSettings(cfg);
      setReminders(rem);
      setChangeRequests(changes);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load this week.');
    } finally {
      setLoading(false);
    }
  }, [cafeId, weekStart]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  // This week's answers win; any day without one falls back to the person's usual week.
  const effectiveAvailability = useMemo<Availability[]>(() => {
    const out: Availability[] = [...availability];
    const have = new Set(availability.map((a) => `${a.employee_id}:${a.weekday}`));
    for (const e of employees) {
      if (!Array.isArray(e.usual_week) || e.usual_week.length !== 7) continue;
      e.usual_week.forEach((d, weekday) => {
        if (!d || have.has(`${e.id}:${weekday}`)) return;
        out.push({
          cafe_id: e.cafe_id,
          employee_id: e.id,
          week_start: weekStart,
          weekday,
          kind: d.kind,
          start_min: d.kind === 'window' ? d.start_min : null,
          end_min: d.kind === 'window' ? d.end_min : null,
          from_usual: true,
        });
      });
    }
    return out;
  }, [availability, employees, weekStart]);

  const engine = useMemo<EngineContext>(
    () => ({
      employees: employees.map((e) => ({
        id: e.id,
        name: e.name,
        roles: e.roles ?? [],
        canWorkAlone: e.can_work_alone,
        rating: e.rating,
        maxHours: e.max_hours,
        active: e.active,
        hourlyWage: Number(e.hourly_wage),
      })),
      availability: effectiveAvailability.map((a) => ({
        employeeId: a.employee_id,
        weekday: a.weekday,
        kind: a.kind,
        startMin: a.start_min,
        endMin: a.end_min,
      })),
      assignments: assignments.map((a) => ({
        id: a.id,
        blockId: a.block_id,
        weekday: a.weekday,
        slot: a.slot,
        employeeId: a.employee_id,
        startMin: a.start_min,
        endMin: a.end_min,
        manual: a.manual,
        overLimit: a.over_limit,
      })),
      // Anyone who has sent availability counts as answered, even if they sent it
      // before the request went out or their status row was never updated.
      statuses: {
        ...Object.fromEntries(statuses.map((s) => [s.employee_id, s.status])),
        ...Object.fromEntries(
          effectiveAvailability
            .filter((a) => {
              const st = statuses.find((s) => s.employee_id === a.employee_id)?.status;
              return !st || st === 'waiting';
            })
            .map((a) => [a.employee_id, 'answered' as const]),
        ),
      },
      requestSent: Boolean(request),
      coverDays: new Set(coverRequests.map((c) => `${c.employee_id}:${c.weekday}`)),
      maxShiftHours: settings?.max_shift_hours ?? 8,
    }),
    [employees, effectiveAvailability, assignments, statuses, request, coverRequests, settings],
  );

  const engineBlocks = useMemo(
    () =>
      blocks.map((b) => ({
        id: b.id,
        weekday: b.weekday,
        startMin: b.start_min,
        endMin: b.end_min,
        rule: b.rule,
      })),
    [blocks],
  );

  const gaps = useMemo(
    () => findGaps(engineBlocks, engine.assignments, engine.employees, engine.coverDays),
    [engineBlocks, engine],
  );

  const clashes = useMemo(
    () => findClashes(engineBlocks, engine.assignments, engine),
    [engineBlocks, engine],
  );

  const totalMinutes = useMemo(
    () =>
      engine.assignments.reduce((sum, a) => sum + (a.employeeId ? a.endMin - a.startMin : 0), 0),
    [engine.assignments],
  );

  const totalWages = useMemo(
    () => weekWages(engine.assignments, engine.employees),
    [engine.assignments, engine.employees],
  );

  return {
    loading,
    error,
    employees,
    blocks,
    availability: effectiveAvailability,
    request,
    statuses,
    assignments,
    published,
    coverRequests,
    changeRequests,
    settings,
    reminders,
    engine,
    gaps,
    clashes,
    totalMinutes,
    totalWages,
    reload: load,
  };
}

export function employeeWeekMinutes(assignments: EngineAssignment[], id: string): number {
  return weekMinutes(assignments, id);
}
