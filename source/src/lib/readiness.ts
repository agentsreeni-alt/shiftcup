import type { AvailabilityRequest, Employee } from '@/lib/types';

/**
 * Where one person is on the way to being schedulable. A week is drafted from each
 * person's usual week, so "ready" means they have one.
 */
export type SetupStage =
  'not_invited' | 'invited' | 'needs_usual' | 'review' | 'ready_offline' | 'ready';

export const STAGE_ORDER: SetupStage[] = [
  'not_invited',
  'invited',
  'needs_usual',
  'review',
  'ready_offline',
  'ready',
];

export const STAGE_LABEL: Record<SetupStage, string> = {
  not_invited: 'Not invited yet',
  invited: 'Invited, not joined',
  needs_usual: 'Joined, no usual week',
  review: 'Waiting for your approval',
  ready_offline: 'Can be scheduled, not in the app',
  ready: 'Ready to schedule',
};

export const STAGE_HINT: Record<SetupStage, string> = {
  not_invited: 'Send their invite so they can join.',
  invited: 'They have the invite but have not joined.',
  needs_usual: 'Ask them when they can usually work.',
  review: 'They sent a usual week. Approve it on Today.',
  ready_offline: 'You set their usual week. Invite them so they see their shifts.',
  ready: 'Their usual week is used for every draft.',
};

export function stageOf(
  emp: Employee,
  pendingUsual: Set<string>,
  invited: Set<string>,
): SetupStage {
  if (Array.isArray(emp.usual_week)) return emp.user_id ? 'ready' : 'ready_offline';
  if (pendingUsual.has(emp.id)) return 'review';
  if (emp.user_id) return 'needs_usual';
  return invited.has(emp.id) ? 'invited' : 'not_invited';
}

export type SetupPerson = { emp: Employee; stage: SetupStage };

export function teamSetup(
  employees: Employee[],
  requests: AvailabilityRequest[],
  invited: Set<string>,
): {
  people: SetupPerson[];
  /** How many can be put on a draft (they have a usual week). */
  ready: number;
  total: number;
  /** Cannot be scheduled yet. */
  notReady: SetupPerson[];
  /** Everyone with something left to do, including people not in the app yet. */
  todo: SetupPerson[];
} {
  const pendingUsual = new Set(
    requests.filter((r) => r.scope === 'usual' && r.status === 'pending').map((r) => r.employee_id),
  );
  const people = employees
    .filter((e) => e.active)
    .map((emp) => ({ emp, stage: stageOf(emp, pendingUsual, invited) }))
    .sort(
      (a, b) =>
        STAGE_ORDER.indexOf(a.stage) - STAGE_ORDER.indexOf(b.stage) ||
        a.emp.name.localeCompare(b.emp.name),
    );
  const notReady = people.filter((p) => p.stage !== 'ready' && p.stage !== 'ready_offline');
  const todo = people.filter((p) => p.stage !== 'ready');
  return { people, ready: people.length - notReady.length, total: people.length, notReady, todo };
}

/** Chip colours per stage: red needs the manager, amber waits on the person, green is fine. */
export const STAGE_TONE_OF: Record<SetupStage, { bg: string; ink: string }> = {
  not_invited: { bg: '#FBEAEE', ink: '#B3264A' },
  invited: { bg: '#FBF3E2', ink: '#8A5A12' },
  needs_usual: { bg: '#FBF3E2', ink: '#8A5A12' },
  review: { bg: '#E3EDF7', ink: '#2C5C86' },
  ready_offline: { bg: '#E8F1DC', ink: '#3F6B2A' },
  ready: { bg: '#E8F1DC', ink: '#3F6B2A' },
};
