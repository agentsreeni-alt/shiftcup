import { useRouter } from 'expo-router';
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Copy,
  Eraser,
  Share2,
  Sparkles,
  Wand2,
} from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';

import {
  AppBar,
  Btn,
  Card,
  Notice,
  PressScale,
  Screen,
  SectionTitle,
  Sheet,
  Stars,
} from '@/components/kit';
import {
  loadAssignments,
  publishWeek,
  resolveCoverRequest,
  saveAssignments,
  updateEmployee,
  weekStartFromOffset,
} from '@/lib/api';
import { useApp } from '@/lib/app-context';
import { C, SLOT_COLORS } from '@/lib/colors';
import { DAY_LONG, DAY_SHORT, fmtHours, fmtRange, fmtWeekLabel, weekdayOf } from '@/lib/dates';
import { checkEligibility, fillOpenSlots, weekMinutes } from '@/lib/scheduling';
import {
  JOB_ROLES,
  type Assignment,
  type CafeSettings,
  type Employee,
  type SlotKind,
} from '@/lib/types';
import { useWeekData } from '@/lib/useWeek';
import { changedSincePublish } from '@/lib/utils';

const FALLBACK_SETTINGS: CafeSettings = {
  cafe_id: '',
  due_weekday: 2,
  due_min: 1200,
  publish_weekday: 4,
  evening_reminder_min: 1080,
  second_reminder_min: 60,
  max_shift_hours: 8,
  channel: 'email',
};

export default function ScheduleScreen() {
  const router = useRouter();
  const { cafe, hasAccess, isSample } = useApp();
  // Opens on the week being planned (next week). Arrows reach this week and beyond.
  const [offset, setOffset] = useState(1);
  const weekStart = weekStartFromOffset(offset);
  const data = useWeekData(weekStart);
  const settings = data.settings ?? FALLBACK_SETTINGS;

  const todayWeekday = weekdayOf(new Date());
  const [day, setDay] = useState(offset === 0 ? todayWeekday : 0);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [slotSheet, setSlotSheet] = useState<{ blockId: string; slot: SlotKind } | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [clearOpen, setClearOpen] = useState(false);
  const [publishWarnOpen, setPublishWarnOpen] = useState(false);
  const [copyOpen, setCopyOpen] = useState(false);
  const [showAllGaps, setShowAllGaps] = useState(false);

  const status = useMemo(() => {
    if (!data.published) return 'Draft';
    return changedSincePublish(data.published.snapshot, data.assignments)
      ? 'Changed since published'
      : 'Published';
  }, [data.published, data.assignments]);

  const dayBlocks = data.blocks.filter((b) => b.weekday === day);

  const toRows = (list: ReturnType<typeof fillOpenSlots>): Assignment[] =>
    list.map((a) => ({
      cafe_id: cafe?.id ?? '',
      week_start: weekStart,
      weekday: a.weekday,
      block_id: a.blockId,
      slot: a.slot,
      employee_id: a.employeeId,
      start_min: a.startMin,
      end_min: a.endMin,
      manual: a.manual ?? false,
      over_limit: a.overLimit ?? false,
    }));

  const persist = async (list: Assignment[]) => {
    if (!cafe) return;
    await saveAssignments(cafe.id, weekStart, list);
    await data.reload();
  };

  const runFill = async () => {
    if (!hasAccess) {
      router.push('/(app)/billing');
      return;
    }
    setBusy(true);
    setMessage('');
    try {
      const blocks = data.blocks.map((b) => ({
        id: b.id,
        weekday: b.weekday,
        startMin: b.start_min,
        endMin: b.end_min,
        rule: b.rule,
      }));
      const filled = fillOpenSlots(blocks, data.engine.assignments, data.engine);
      await persist(toRows(filled));
      setMessage('Filled every open slot it could. Nothing you set by hand was changed.');
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Could not fill the slots.');
    } finally {
      setBusy(false);
    }
  };

  const runCopyLastWeek = async (force = false) => {
    if (!cafe) return;
    if (!hasAccess) {
      router.push('/(app)/billing');
      return;
    }
    if (!force && data.assignments.some((a) => a.employee_id)) {
      setCopyOpen(true);
      return;
    }
    setCopyOpen(false);
    setBusy(true);
    setMessage('');
    try {
      const prev = await loadAssignments(cafe.id, weekStartFromOffset(offset - 1));
      if (prev.length === 0) {
        setMessage('Last week has no assignments to copy.');
        return;
      }
      const rows: Assignment[] = prev.map((a) => ({
        ...a,
        id: undefined,
        week_start: weekStart,
        manual: true,
      }));
      await persist(rows);
      setMessage('Copied last week. Check the gaps before publishing.');
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Could not copy last week.');
    } finally {
      setBusy(false);
    }
  };

  const runClear = async () => {
    if (!cafe) return;
    setBusy(true);
    try {
      await persist([]);
      setClearOpen(false);
      setMessage('Cleared this week.');
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Could not clear the week.');
    } finally {
      setBusy(false);
    }
  };

  const issueCount = data.gaps.length + data.clashes.length;

  const runPublish = async (force = false) => {
    if (!cafe) return;
    if (!hasAccess) {
      router.push('/(app)/billing');
      return;
    }
    if (issueCount > 0 && !force) {
      setPublishWarnOpen(true);
      return;
    }
    setPublishWarnOpen(false);
    setBusy(true);
    setMessage('');
    try {
      await publishWeek({
        cafeId: cafe.id,
        weekStart,
        assignments: data.assignments,
        employeeIds: data.employees.filter((e) => e.active).map((e) => e.id),
        settings,
      });
      await data.reload();
      setMessage('Published. Reminders are queued.');
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Could not publish.');
    } finally {
      setBusy(false);
    }
  };

  const assign = async (employeeId: string | null, overLimit = false) => {
    if (!slotSheet) return;
    const block = data.blocks.find((b) => b.id === slotSheet.blockId);
    if (!block) return;
    const existing = data.assignments.find(
      (a) => a.block_id === block.id && a.slot === slotSheet.slot,
    );
    const next: Assignment[] = data.assignments.filter(
      (a) => !(a.block_id === block.id && a.slot === slotSheet.slot),
    );
    if (employeeId) {
      next.push({
        id: existing?.id,
        cafe_id: cafe?.id ?? '',
        week_start: weekStart,
        weekday: block.weekday,
        block_id: block.id,
        slot: slotSheet.slot,
        employee_id: employeeId,
        start_min: block.start_min,
        end_min: block.end_min,
        manual: true,
        over_limit: overLimit,
      });
    }
    setSlotSheet(null);
    setBusy(true);
    try {
      await persist(next);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Could not save that change.');
    } finally {
      setBusy(false);
    }
  };

  const shareText = useMemo(() => {
    const lines: string[] = [`${cafe?.name ?? 'ShiftCup'} — week of ${fmtWeekLabel(weekStart)}`];
    for (let d = 0; d < 7; d += 1) {
      const rows = data.assignments
        .filter((a) => a.weekday === d && a.employee_id)
        .sort((a, b) => a.start_min - b.start_min);
      if (rows.length === 0) continue;
      lines.push('');
      lines.push(DAY_LONG[d]);
      for (const r of rows) {
        const emp = data.employees.find((e) => e.id === r.employee_id);
        lines.push(`  ${fmtRange(r.start_min, r.end_min)} — ${emp?.name ?? 'Open'} (${r.slot})`);
      }
    }
    return lines.join('\n');
  }, [data.assignments, data.employees, cafe?.name, weekStart]);

  const sheetBlock = slotSheet ? data.blocks.find((b) => b.id === slotSheet.blockId) : null;
  const sheetAssignment = slotSheet
    ? data.assignments.find((a) => a.block_id === slotSheet.blockId && a.slot === slotSheet.slot)
    : undefined;
  // Open cover requests from the person on this slot, for the whole day.
  const sheetCovers = sheetAssignment?.employee_id
    ? data.coverRequests.filter(
        (c) =>
          c.employee_id === sheetAssignment.employee_id &&
          c.weekday === sheetAssignment.weekday &&
          c.week_start === weekStart,
      )
    : [];
  const sheetCoverName = data.employees.find((e) => e.id === sheetAssignment?.employee_id)?.name;

  const keepOnShift = async () => {
    setBusy(true);
    try {
      for (const c of sheetCovers) await resolveCoverRequest(c.id);
      setSlotSheet(null);
      await data.reload();
      setMessage(`${sheetCoverName ?? 'They'} stays on the shift. The cover request is closed.`);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Could not close the cover request.');
    } finally {
      setBusy(false);
    }
  };
  // One tap from the slot sheet: let someone cover solo shifts, then refresh the sheet.
  const allowSolo = async (emp: Employee) => {
    setBusy(true);
    try {
      await updateEmployee(emp.id, { can_work_alone: true, roles: [...JOB_ROLES] });
      await data.reload();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : `Could not update ${emp.name}.`);
    } finally {
      setBusy(false);
    }
  };

  const sheetRows = useMemo(() => {
    if (!sheetBlock || !slotSheet) return [];
    const block = {
      id: sheetBlock.id,
      weekday: sheetBlock.weekday,
      startMin: sheetBlock.start_min,
      endMin: sheetBlock.end_min,
      rule: sheetBlock.rule,
    };
    return data.employees
      .map((emp) => {
        const result = checkEligibility(emp.id, block, slotSheet.slot, data.engine);
        // Would they qualify if they could work alone (and were trained for every role)?
        let soloFix = false;
        if (!result.ok && slotSheet.slot === 'solo') {
          const asSolo = {
            ...data.engine,
            employees: data.engine.employees.map((e) =>
              e.id === emp.id ? { ...e, canWorkAlone: true, roles: [...JOB_ROLES] } : e,
            ),
          };
          const retry = checkEligibility(emp.id, block, slotSheet.slot, asSolo);
          soloFix = retry.ok || Boolean(retry.overLimit);
        }
        return {
          emp,
          ok: result.ok,
          soloFix,
          reason: result.reason,
          overLimit: Boolean(result.overLimit),
          hours: weekMinutes(data.engine.assignments, emp.id),
        };
      })
      .sort((a, b) => {
        if (a.ok !== b.ok) return a.ok ? -1 : 1;
        if (b.emp.rating !== a.emp.rating) return b.emp.rating - a.emp.rating;
        return a.hours - b.hours;
      });
  }, [sheetBlock, slotSheet, data.employees, data.engine]);

  // First load: show a spinner, not an empty 'all clear' week.

  if (data.loading && !data.settings && !data.error) {
    return (
      <Screen>
        <View className="items-center py-32">
          <ActivityIndicator color={C.pine} />
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <AppBar title="Schedule" subtitle={cafe?.name ?? ''} />

      <View className="mb-3 flex-row items-center justify-between rounded-2xl border border-border/60 bg-card shadow-card px-2 py-2">
        <Pressable
          onPress={() => setOffset((o) => o - 1)}
          accessibilityRole="button"
          accessibilityLabel="Previous week"
          hitSlop={8}
          className="p-2 active:opacity-60"
        >
          <ChevronLeft size={20} color={C.pine} />
        </Pressable>
        <View className="items-center">
          <Text className="text-sm font-semibold text-foreground">
            {offset === 0 ? 'This week' : offset === 1 ? 'Next week' : fmtWeekLabel(weekStart)}
            {offset === 0 || offset === 1 ? ` · ${fmtWeekLabel(weekStart)}` : ''}
          </Text>
          <Text
            className={`text-[11px] font-semibold ${
              status === 'Published' ? 'text-solo-ink' : 'text-muted-foreground'
            }`}
          >
            {status}
          </Text>
        </View>
        <Pressable
          onPress={() => setOffset((o) => o + 1)}
          accessibilityRole="button"
          accessibilityLabel="Next week"
          hitSlop={8}
          className="p-2 active:opacity-60"
        >
          <ChevronRight size={20} color={C.pine} />
        </Pressable>
      </View>

      {isSample ? (
        <View className="mb-3 rounded-xl bg-accent px-4 py-2.5">
          <Text className="text-xs font-semibold text-accent-foreground">
            You are exploring a sample café
          </Text>
        </View>
      ) : null}

      <Btn
        label={
          status === 'Published'
            ? 'Published, nothing new to send'
            : status === 'Changed since published'
              ? 'Publish changes'
              : 'Approve and publish'
        }
        loading={busy}
        onPress={() => runPublish()}
        disabled={data.assignments.length === 0 || status === 'Published'}
      />

      {message ? <Text className="mt-2 text-xs text-muted-foreground">{message}</Text> : null}

      {data.gaps.length > 0 ? (
        <View className="mt-4 gap-2">
          <SectionTitle>Gaps</SectionTitle>
          {(showAllGaps ? data.gaps : data.gaps.slice(0, 3)).map((g) => (
            <View key={g.key} className="rounded-2xl border border-destructive/30 bg-card p-3">
              <View className="flex-row items-start gap-2">
                <AlertTriangle size={15} color={C.red} />
                <View className="flex-1">
                  <Text className="text-sm font-semibold text-foreground">{g.label}</Text>
                  {g.note ? (
                    <Text className="mt-0.5 text-xs text-muted-foreground">{g.note}</Text>
                  ) : null}
                  {g.reason === 'cover' ? (
                    <Text className="mt-0.5 text-xs text-destructive">
                      {g.employeeName} asked for cover.
                    </Text>
                  ) : null}
                  {g.reason === 'deactivated' ? (
                    <Text className="mt-0.5 text-xs text-destructive">
                      {g.employeeName} is deactivated.
                    </Text>
                  ) : null}
                </View>
                <PressScale
                  onPress={() => {
                    setDay(g.weekday);
                    setSlotSheet({ blockId: g.blockId, slot: g.slot });
                  }}
                  accessibilityLabel={`Fix ${g.label}`}
                  className="rounded-lg bg-primary px-3 py-1.5"
                >
                  <Text className="text-xs font-semibold text-primary-foreground">Fix</Text>
                </PressScale>
              </View>
            </View>
          ))}
          {data.gaps.length > 3 ? (
            <Btn
              label={showAllGaps ? 'Show fewer' : `Show all ${data.gaps.length} gaps`}
              variant="ghost"
              size="sm"
              onPress={() => setShowAllGaps((v) => !v)}
            />
          ) : null}
        </View>
      ) : null}

      {data.clashes.length > 0 ? (
        <View className="mt-4 gap-2">
          <SectionTitle>Clashes</SectionTitle>
          {data.clashes.map((c) => (
            <View key={c.key} className="rounded-2xl border border-destructive/30 bg-card p-3">
              <View className="flex-row items-start gap-2">
                <AlertTriangle size={15} color={C.red} />
                <View className="flex-1">
                  <Text className="text-sm font-semibold text-foreground">
                    {c.employeeName} · {DAY_SHORT[c.weekday]} {fmtRange(c.startMin, c.endMin)} ·{' '}
                    {c.slot}
                  </Text>
                  <Text className="mt-0.5 text-xs text-destructive">{c.reason}</Text>
                </View>
                <PressScale
                  onPress={() => {
                    setDay(c.weekday);
                    setSlotSheet({ blockId: c.blockId, slot: c.slot });
                  }}
                  className="rounded-lg bg-primary px-3 py-1.5 active:opacity-70"
                >
                  <Text className="text-xs font-semibold text-primary-foreground">Fix</Text>
                </PressScale>
              </View>
            </View>
          ))}
        </View>
      ) : null}

      <SectionTitle>Pick a day</SectionTitle>
      <View className="flex-row gap-1.5">
        {DAY_SHORT.map((d, i) => (
          <PressScale
            key={d}
            onPress={() => setDay(i)}
            className={`flex-1 items-center rounded-xl py-2.5 ${
              day === i ? 'border border-primary bg-primary' : 'border border-border bg-card'
            }`}
          >
            <Text
              className={`text-xs font-semibold ${
                day === i ? 'text-primary-foreground' : 'text-foreground'
              }`}
            >
              {d}
            </Text>
          </PressScale>
        ))}
      </View>

      <View className="mt-4 gap-3">
        {dayBlocks.length === 0 ? (
          <Notice
            tone="info"
            title="No coverage blocks for this day"
            body="Add blocks in Settings so ShiftCup knows when you need people."
          />
        ) : null}
        {dayBlocks.map((block) => {
          const slots: SlotKind[] = block.rule === 'two' ? ['barista', 'scooper'] : ['solo'];
          return (
            <Card key={block.id}>
              <View className="mb-2 flex-row items-center justify-between">
                <Text className="text-sm font-bold text-foreground">
                  {fmtRange(block.start_min, block.end_min)}
                </Text>
                <Text className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {block.rule === 'two' ? 'Two people' : 'Solo allowed'}
                </Text>
              </View>
              <View className="gap-2">
                {slots.map((slot) => {
                  const assignment = data.assignments.find(
                    (a) => a.block_id === block.id && a.slot === slot,
                  );
                  const emp = assignment?.employee_id
                    ? data.employees.find((e) => e.id === assignment.employee_id)
                    : null;
                  const colors = SLOT_COLORS[slot];
                  const isOpen = !emp?.active;
                  const hasCover = data.coverRequests.some(
                    (c) => c.assignment_id === assignment?.id,
                  );
                  const gap = isOpen || hasCover;
                  return (
                    <Pressable
                      key={slot}
                      onPress={() => setSlotSheet({ blockId: block.id, slot })}
                      className="active:opacity-80"
                    >
                      {gap ? (
                        <View
                          style={{
                            borderStyle: 'dashed',
                            borderWidth: 1.5,
                            borderColor: C.red,
                            borderRadius: 14,
                            padding: 12,
                            backgroundColor: C.white,
                          }}
                        >
                          <SlotBody
                            slot={slot}
                            name={emp?.name}
                            rating={emp?.rating}
                            hours={emp ? weekMinutes(data.engine.assignments, emp.id) : undefined}
                            note={
                              hasCover
                                ? 'Asked for cover'
                                : emp && !emp.active
                                  ? 'Deactivated'
                                  : 'Open'
                            }
                            ink={C.red}
                          />
                        </View>
                      ) : (
                        <View
                          style={{
                            backgroundColor: colors.bg,
                            borderColor: colors.line,
                            borderWidth: 1,
                            borderRadius: 14,
                            padding: 12,
                          }}
                        >
                          <SlotBody
                            slot={slot}
                            name={emp?.name}
                            rating={emp?.rating}
                            hours={weekMinutes(data.engine.assignments, emp.id)}
                            ink={colors.ink}
                          />
                        </View>
                      )}
                    </Pressable>
                  );
                })}
              </View>
            </Card>
          );
        })}
      </View>

      <SectionTitle>Week tools</SectionTitle>
      <View className="gap-2">
        <Btn
          label="Fill open slots"
          variant="secondary"
          icon={<Wand2 size={16} color={C.pine} />}
          onPress={runFill}
          loading={busy}
        />
        <View className="flex-row gap-2">
          <View className="flex-1">
            <Btn
              label="Copy last week"
              variant="ghost"
              size="sm"
              icon={<Copy size={14} color={C.pine} />}
              onPress={() => runCopyLastWeek()}
            />
          </View>
          <View className="flex-1">
            <Btn
              label="Share as text"
              variant="ghost"
              size="sm"
              icon={<Share2 size={14} color={C.pine} />}
              onPress={() => setShareOpen(true)}
            />
          </View>
        </View>
        <Btn
          label="Clear this week"
          variant="ghost"
          size="sm"
          icon={<Eraser size={14} color={C.red} />}
          onPress={() => setClearOpen(true)}
        />
      </View>

      <SectionTitle>Reminders queued</SectionTitle>
      {data.reminders.filter((r) => r.state === 'queued').length === 0 ? (
        <Text className="text-sm text-muted-foreground">
          Nothing queued yet. Publish the week and ShiftCup queues the reminders.
        </Text>
      ) : (
        <View className="gap-2">
          {data.reminders
            .filter((r) => r.state === 'queued')
            .slice(0, 12)
            .map((r) => {
              const emp = data.employees.find((e) => e.id === r.employee_id);
              return (
                <View key={r.id} className="rounded-xl border border-border bg-card px-3 py-2.5">
                  <Text className="text-xs font-semibold text-foreground">
                    {emp?.name ?? 'Team'}
                    {r.kind === 'published' ? '' : ` · ${DAY_SHORT[r.weekday]}`} ·{' '}
                    {r.kind === 'evening'
                      ? 'evening before'
                      : r.kind === 'soon'
                        ? 'before shift'
                        : r.kind === 'published'
                          ? 'week summary'
                          : r.kind === 'request'
                            ? 'availability request'
                            : r.kind}
                  </Text>
                  <Text className="mt-0.5 text-xs text-muted-foreground">{r.body}</Text>
                </View>
              );
            })}
        </View>
      )}

      <Sheet
        visible={Boolean(slotSheet)}
        onClose={() => setSlotSheet(null)}
        title={
          sheetBlock
            ? `${DAY_SHORT[sheetBlock.weekday]} ${fmtRange(sheetBlock.start_min, sheetBlock.end_min)} · ${slotSheet?.slot ?? ''}`
            : 'Slot'
        }
      >
        <View className="gap-2 pb-4">
          {sheetCovers.length > 0 ? (
            <Notice
              tone="danger"
              title={`${sheetCoverName ?? 'They'} asked for cover`}
              body="Pick someone below to take over, or keep them on if they can make it after all."
              action={
                <View className="mt-2">
                  <Btn
                    label={`Keep ${sheetCoverName ?? 'them'} on this shift`}
                    size="sm"
                    variant="ghost"
                    full={false}
                    loading={busy}
                    onPress={keepOnShift}
                  />
                </View>
              }
            />
          ) : null}
          {sheetRows.length > 0 && !sheetRows.some((r) => r.ok || r.overLimit) ? (
            <Notice
              tone="warn"
              title="Nobody can take this slot yet"
              body={(() => {
                // Explain the real reason, not a generic one.
                if (sheetRows.some((r) => r.soloFix)) {
                  return 'Only people marked “Can work alone” can cover a solo block. Tap “Let them work alone” below, or change this block to two people in Settings.';
                }
                const notReplied = sheetRows.filter(
                  (r) => r.reason === 'Cannot: has not replied',
                ).length;
                if (notReplied > 0) {
                  return `${notReplied} ${
                    notReplied === 1 ? 'person has' : 'people have'
                  } not sent availability yet. Nudge them from Team, then check back.`;
                }
                return slotSheet?.slot === 'solo'
                  ? 'Nobody said they are free for this block. Ask your team if anyone can come in, or change the block in Settings.'
                  : 'Ask your team for more availability, or change their roles in Team.';
              })()}
            />
          ) : null}
          {sheetRows.map((row) => (
            <View key={row.emp.id} className="rounded-xl border border-border bg-card px-3 py-3">
              <View className="flex-row items-center justify-between gap-2">
                <View className="flex-1">
                  <Text className="text-sm font-semibold text-foreground">
                    {row.emp.name}
                    {row.emp.active ? '' : ' (deactivated)'}
                  </Text>
                  <View className="mt-0.5 flex-row items-center gap-2">
                    <Stars value={row.emp.rating} />
                    <Text className="text-xs text-muted-foreground">
                      {fmtHours(row.hours)} this week
                    </Text>
                  </View>
                  {!row.ok && row.reason ? (
                    <Text className="mt-1 text-xs text-destructive">{reasonText(row.reason)}</Text>
                  ) : null}
                  {row.soloFix ? (
                    <Text className="mt-0.5 text-[11px] text-muted-foreground">
                      Available. Allowing solo also marks them trained for every role.
                    </Text>
                  ) : null}
                </View>
                {row.ok ? (
                  <PressScale
                    onPress={() => assign(row.emp.id)}
                    className="rounded-lg bg-primary px-3 py-2"
                  >
                    <Text className="text-xs font-semibold text-primary-foreground">Assign</Text>
                  </PressScale>
                ) : row.soloFix ? (
                  <PressScale
                    onPress={() => allowSolo(row.emp)}
                    accessibilityLabel={`Let ${row.emp.name} work alone`}
                    className="rounded-lg border border-primary px-3 py-2"
                  >
                    <Text className="text-xs font-semibold text-primary">Let them work alone</Text>
                  </PressScale>
                ) : row.overLimit ? (
                  <PressScale
                    onPress={() => assign(row.emp.id, true)}
                    className="rounded-lg border border-destructive px-3 py-2"
                  >
                    <Text className="text-xs font-semibold text-destructive">Assign anyway</Text>
                  </PressScale>
                ) : null}
              </View>
            </View>
          ))}
          <Btn label="Leave open" variant="ghost" onPress={() => assign(null)} />
        </View>
      </Sheet>

      <Sheet visible={shareOpen} onClose={() => setShareOpen(false)} title="Share as text">
        <Text selectable className="pb-6 text-sm leading-6 text-foreground">
          {shareText}
        </Text>
      </Sheet>

      <Sheet
        visible={publishWarnOpen}
        onClose={() => setPublishWarnOpen(false)}
        title="Publish with open slots?"
      >
        <View className="gap-3 pb-4">
          <Text className="text-sm text-muted-foreground">
            {data.gaps.length} {data.gaps.length === 1 ? 'slot is' : 'slots are'} still open
            {data.clashes.length > 0
              ? ` and ${data.clashes.length} ${data.clashes.length === 1 ? 'person no longer fits their shift' : 'people no longer fit their shifts'}`
              : ''}
            . Your team will see the week as it is now.
          </Text>
          <Btn label="Publish anyway" loading={busy} onPress={() => runPublish(true)} />
          <Btn label="Fix them first" variant="ghost" onPress={() => setPublishWarnOpen(false)} />
        </View>
      </Sheet>

      <Sheet visible={copyOpen} onClose={() => setCopyOpen(false)} title="Replace this week?">
        <View className="gap-3 pb-4">
          <Text className="text-sm text-muted-foreground">
            {fmtWeekLabel(weekStart)} already has shifts. Copying last week replaces all of them.
          </Text>
          <Btn label="Yes, copy last week" loading={busy} onPress={() => runCopyLastWeek(true)} />
          <Btn label="Keep this week" variant="ghost" onPress={() => setCopyOpen(false)} />
        </View>
      </Sheet>

      <Sheet visible={clearOpen} onClose={() => setClearOpen(false)} title="Clear this week?">
        <View className="gap-3 pb-4">
          <Text className="text-sm text-muted-foreground">
            This removes every assignment for {fmtWeekLabel(weekStart)}. The published copy stays
            until you publish again.
          </Text>
          <Btn label="Yes, clear this week" variant="danger" loading={busy} onPress={runClear} />
          <Btn label="Keep it" variant="ghost" onPress={() => setClearOpen(false)} />
        </View>
      </Sheet>

      <View className="mt-6 flex-row items-center gap-2">
        <Sparkles size={14} color={C.muted} />
        <Text className="flex-1 text-xs text-muted-foreground">
          ShiftCup fills by rating first, then by who has fewer hours. It never overwrites a slot
          you set by hand.
        </Text>
      </View>
    </Screen>
  );
}

function SlotBody({
  slot,
  name,
  rating,
  hours,
  note,
  ink,
}: {
  slot: SlotKind;
  name?: string;
  rating?: number;
  hours?: number;
  note?: string;
  ink: string;
}) {
  return (
    <View className="flex-row items-center justify-between">
      <View className="flex-1">
        <Text style={{ color: ink }} className="text-[11px] font-bold uppercase tracking-wide">
          {slot}
        </Text>
        <Text className="mt-0.5 text-base font-semibold text-foreground">
          {name ?? 'Open slot'}
        </Text>
        {note ? (
          <Text style={{ color: ink }} className="text-xs">
            {note}
          </Text>
        ) : null}
      </View>
      {rating ? (
        <View className="items-end gap-0.5">
          <Stars value={rating} />
          {hours !== undefined ? (
            <Text className="text-[11px] text-muted-foreground">{fmtHours(hours)}</Text>
          ) : null}
        </View>
      ) : (
        <Text style={{ color: ink }} className="text-xs font-semibold">
          Tap to fill
        </Text>
      )}
    </View>
  );
}

function reasonText(reason: string): string {
  const text = reason.replace(/^Cannot: /, '');
  return text.charAt(0).toUpperCase() + text.slice(1);
}
