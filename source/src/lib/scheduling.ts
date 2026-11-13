import { DAY_SHORT, fmtTime } from '@/lib/dates';
import { JOB_LABEL, JOB_ROLES, type BlockRule, type ReqStatus, type SlotKind } from '@/lib/types';

export type EngineEmployee = {
  id: string;
  name: string;
  roles: string[];
  canWorkAlone: boolean;
  rating: number;
  maxHours: number;
  active: boolean;
  hourlyWage: number;
};

export type EngineBlock = {
  id: string;
  weekday: number;
  startMin: number;
  endMin: number;
  rule: BlockRule;
};

export type EngineAvail = {
  employeeId: string;
  weekday: number;
  kind: 'any' | 'none' | 'window';
  startMin: number | null;
  endMin: number | null;
};

export type EngineAssignment = {
  id?: string;
  blockId: string;
  weekday: number;
  slot: SlotKind;
  employeeId: string | null;
  startMin: number;
  endMin: number;
  manual?: boolean;
  overLimit?: boolean;
};

export type EngineContext = {
  employees: EngineEmployee[];
  availability: EngineAvail[];
  assignments: EngineAssignment[];
  statuses: Record<string, ReqStatus>;
  requestSent: boolean;
  coverDays: Set<string>;
  maxShiftHours: number;
};

export type Eligibility = { ok: boolean; reason?: string; overLimit?: boolean };

export function slotsForBlock(block: EngineBlock): SlotKind[] {
  return block.rule === 'two' ? ['barista', 'scooper'] : ['solo'];
}

export function weekMinutes(assignments: EngineAssignment[], employeeId: string): number {
  return assignments
    .filter((a) => a.employeeId === employeeId)
    .reduce((sum, a) => sum + (a.endMin - a.startMin), 0);
}

export function weekWages(assignments: EngineAssignment[], employees: EngineEmployee[]): number {
  return assignments.reduce((sum, a) => {
    const emp = employees.find((e) => e.id === a.employeeId);
    if (!emp) return sum;
    return sum + ((a.endMin - a.startMin) / 60) * emp.hourlyWage;
  }, 0);
}

function checkContinuous(
  intervals: [number, number][],
  start: number,
  end: number,
  maxShiftMin: number,
): Eligibility {
  if (intervals.length === 0) {
    if (end - start > maxShiftMin) {
      return { ok: false, reason: `Cannot: shift would be longer than ${maxShiftMin / 60} hours` };
    }
    return { ok: true };
  }
  const all: [number, number][] = [...intervals, [start, end] as [number, number]].sort((a, b) => a[0] - b[0]);
  for (let i = 1; i < all.length; i += 1) {
    if (all[i][0] > all[i - 1][1]) {
      return { ok: false, reason: 'Cannot: would split the day into two shifts' };
    }
  }
  const runStart = all[0][0];
  const runEnd = all[all.length - 1][1];
  if (runEnd - runStart > maxShiftMin) {
    return { ok: false, reason: `Cannot: shift would be longer than ${maxShiftMin / 60} hours` };
  }
  return { ok: true };
}

export function checkEligibility(
  employeeId: string,
  block: EngineBlock,
  slot: SlotKind,
  ctx: EngineContext,
): Eligibility {
  const emp = ctx.employees.find((e) => e.id === employeeId);
  if (!emp) return { ok: false, reason: 'Cannot: not on the team' };
  if (!emp.active) return { ok: false, reason: 'Cannot: deactivated' };

  if (slot === 'solo') {
    if (!emp.canWorkAlone) return { ok: false, reason: 'Cannot: cannot work alone' };
    const missing = JOB_ROLES.filter((r) => !emp.roles.includes(r));
    if (missing.length > 0) {
      return { ok: false, reason: `Cannot: not trained as ${JOB_LABEL[missing[0]].toLowerCase()}` };
    }
  } else if (!emp.roles.includes(slot)) {
    return { ok: false, reason: `Cannot: not trained as ${slot}` };
  }

  if (ctx.requestSent) {
    const status = ctx.statuses[employeeId] ?? 'waiting';
    if (status === 'waiting') return { ok: false, reason: 'Cannot: has not replied' };
    if (status === 'unavailable') return { ok: false, reason: 'Cannot: marked unavailable' };
  }

  const avail = ctx.availability.find(
    (a) => a.employeeId === employeeId && a.weekday === block.weekday,
  );
  if (!avail || avail.kind === 'none') return { ok: false, reason: 'Cannot: not available' };
  if (avail.kind === 'window') {
    if (avail.startMin == null || avail.endMin == null) {
      return { ok: false, reason: 'Cannot: not available' };
    }
    if (avail.startMin > block.startMin || avail.endMin < block.endMin) {
      return { ok: false, reason: 'Cannot: not available for the whole block' };
    }
  }

  if (ctx.assignments.some((a) => a.blockId === block.id && a.employeeId === employeeId)) {
    return { ok: false, reason: 'Cannot: already on this block' };
  }

  if (ctx.coverDays.has(`${employeeId}:${block.weekday}`)) {
    return { ok: false, reason: 'Cannot: asked for cover that day' };
  }

  const intervals = ctx.assignments
    .filter((a) => a.employeeId === employeeId && a.weekday === block.weekday)
    .map((a) => [a.startMin, a.endMin] as [number, number]);
  const continuous = checkContinuous(
    intervals,
    block.startMin,
    block.endMin,
    ctx.maxShiftHours * 60,
  );
  if (!continuous.ok) return continuous;

  const used = weekMinutes(ctx.assignments, employeeId);
  if (used + (block.endMin - block.startMin) > emp.maxHours * 60) {
    return { ok: false, reason: 'Cannot: over weekly hour limit', overLimit: true };
  }

  return { ok: true };
}

function rankCandidates(
  candidates: EngineEmployee[],
  assignments: EngineAssignment[],
): EngineEmployee[] {
  return [...candidates].sort((a, b) => {
    if (b.rating !== a.rating) return b.rating - a.rating;
    return weekMinutes(assignments, a.id) - weekMinutes(assignments, b.id);
  });
}

/** Fills only empty slots. Existing assignments are never overwritten. */
export function fillOpenSlots(
  blocks: EngineBlock[],
  assignments: EngineAssignment[],
  ctx: EngineContext,
): EngineAssignment[] {
  const result: EngineAssignment[] = assignments.map((a) => ({ ...a }));
  const ordered = [...blocks].sort((a, b) => a.weekday - b.weekday || a.startMin - b.startMin);

  for (const block of ordered) {
    for (const slot of slotsForBlock(block)) {
      const existing = result.find((a) => a.blockId === block.id && a.slot === slot);
      if (existing?.employeeId) continue;

      const localCtx: EngineContext = { ...ctx, assignments: result };
      const eligible = ctx.employees.filter(
        (emp) => checkEligibility(emp.id, block, slot, localCtx).ok,
      );
      if (eligible.length === 0) continue;

      const pick = rankCandidates(eligible, result)[0];
      if (existing) {
        existing.employeeId = pick.id;
        existing.manual = false;
        existing.overLimit = false;
      } else {
        result.push({
          blockId: block.id,
          weekday: block.weekday,
          slot,
          employeeId: pick.id,
          startMin: block.startMin,
          endMin: block.endMin,
          manual: false,
          overLimit: false,
        });
      }
    }
  }
  return result;
}

export type Gap = {
  key: string;
  blockId: string;
  weekday: number;
  slot: SlotKind;
  startMin: number;
  endMin: number;
  label: string;
  note?: string;
  reason: 'empty' | 'deactivated' | 'cover';
  employeeId?: string;
  employeeName?: string;
};

export function findGaps(
  blocks: EngineBlock[],
  assignments: EngineAssignment[],
  employees: EngineEmployee[],
  coverDays: Set<string>,
): Gap[] {
  const gaps: Gap[] = [];
  for (const block of blocks) {
    for (const slot of slotsForBlock(block)) {
      const assignment = assignments.find((a) => a.blockId === block.id && a.slot === slot);
      const emp = assignment?.employeeId
        ? employees.find((e) => e.id === assignment.employeeId)
        : null;

      let reason: Gap['reason'] | null = null;
      if (!assignment?.employeeId) reason = 'empty';
      else if (!emp?.active) reason = 'deactivated';
      else if (coverDays.has(`${assignment.employeeId}:${block.weekday}`)) reason = 'cover';
      if (!reason) continue;

      const gap: Gap = {
        key: `${block.id}:${slot}`,
        blockId: block.id,
        weekday: block.weekday,
        slot,
        startMin: block.startMin,
        endMin: block.endMin,
        label: `${DAY_SHORT[block.weekday]} ${fmtTime(block.startMin)} to ${fmtTime(
          block.endMin,
        )}: ${slot} needed`,
        reason,
        employeeId: assignment?.employeeId ?? undefined,
        employeeName: emp?.name,
      };

      if (block.rule === 'two' && slot === 'scooper') {
        const barista = assignments.find((a) => a.blockId === block.id && a.slot === 'barista');
        if (barista?.employeeId) {
          gap.note = 'A barista is on, but the scooper must be a second person.';
        }
      }
      gaps.push(gap);
    }
  }
  return gaps.sort((a, b) => a.weekday - b.weekday || a.startMin - b.startMin);
}

export type Clash = {
  key: string;
  blockId: string;
  weekday: number;
  slot: SlotKind;
  employeeId: string;
  employeeName: string;
  reason: string;
  startMin: number;
  endMin: number;
};

export function findClashes(
  blocks: EngineBlock[],
  assignments: EngineAssignment[],
  ctx: EngineContext,
): Clash[] {
  const clashes: Clash[] = [];
  for (const assignment of assignments) {
    if (!assignment.employeeId) continue;
    const block = blocks.find((b) => b.id === assignment.blockId);
    if (!block) continue;
    const emp = ctx.employees.find((e) => e.id === assignment.employeeId);
    if (!emp?.active) continue;
    // A cover request already shows this slot as a gap; don't count it twice.
    if (ctx.coverDays.has(`${assignment.employeeId}:${assignment.weekday}`)) continue;

    const scoped: EngineContext = {
      ...ctx,
      assignments: ctx.assignments.filter((a) => a !== assignment),
    };
    const result = checkEligibility(assignment.employeeId, block, assignment.slot, scoped);
    if (result.ok || result.overLimit) continue;
    if (result.reason === 'Cannot: already on this block') continue;

    clashes.push({
      key: `${assignment.blockId}:${assignment.slot}`,
      blockId: assignment.blockId,
      weekday: assignment.weekday,
      slot: assignment.slot,
      employeeId: assignment.employeeId,
      employeeName: emp.name,
      reason: (result.reason ?? 'Cannot: no longer qualifies').replace('Cannot: ', ''),
      startMin: assignment.startMin,
      endMin: assignment.endMin,
    });
  }
  return clashes.sort((a, b) => a.weekday - b.weekday || a.startMin - b.startMin);
}

/** Merges a person's assignments on one day into continuous runs. */
export type ShiftRun = {
  weekday: number;
  startMin: number;
  endMin: number;
  slot: SlotKind;
  blockIds: string[];
};

export function shiftRunsForDay(
  assignments: EngineAssignment[],
  employeeId: string,
  weekday: number,
): ShiftRun[] {
  const mine = assignments
    .filter((a) => a.employeeId === employeeId && a.weekday === weekday)
    .sort((a, b) => a.startMin - b.startMin);
  const runs: ShiftRun[] = [];
  for (const a of mine) {
    const last = runs[runs.length - 1];
    if (last && a.startMin <= last.endMin) {
      last.endMin = Math.max(last.endMin, a.endMin);
      last.blockIds.push(a.blockId);
    } else {
      runs.push({
        weekday,
        startMin: a.startMin,
        endMin: a.endMin,
        slot: a.slot,
        blockIds: [a.blockId],
      });
    }
  }
  return runs;
}

export function allShiftRuns(
  assignments: EngineAssignment[],
  employeeId: string,
): ShiftRun[] {
  const out: ShiftRun[] = [];
  for (let d = 0; d < 7; d += 1) out.push(...shiftRunsForDay(assignments, employeeId, d));
  return out;
}
