import { useFocusEffect, useRouter } from 'expo-router';
import { CalendarX, ChevronRight, Clock } from 'lucide-react-native';
import { useCallback, useState } from 'react';
import { Text, View } from 'react-native';

import {
  AppBar,
  Appear,
  AvatarStack,
  Btn,
  EmptyState,
  Field,
  Notice,
  PressScale,
  Screen,
  SectionTitle,
  Segmented,
  Sheet,
  Skeleton,
  toast,
} from '@/components/kit';
import { WeekGrid } from '@/components/WeekGrid';
import {
  loadMyRequestStatus,
  planningWeekStart,
  createCoverRequest,
  currentWeekStart,
  loadMyAssignments,
  loadMyAvailabilityRequests,
  loadMyCoverRequests,
  loadMyPublishedWeek,
  loadMyTeam,
  loadMySettings,
  weekStartFromOffset,
} from '@/lib/api';
import { useApp } from '@/lib/app-context';
import { C, SLOT_COLORS } from '@/lib/colors';
import {
  availabilityDueDate,
  fmtDue,
  DAY_LONG,
  DAY_SHORT,
  dateAtMinutes,
  dateForWeekday,
  fmtDayDate,
  fmtHours,
  fmtRange,
  fmtTime,
  fmtWeekLabel,
} from '@/lib/dates';
import { leadLabel } from '@/lib/reminders';
import { cardShadow } from '@/lib/motion';
import { SLOT_LABEL } from '@/lib/types';
import type { EngineAssignment } from '@/lib/scheduling';
import type { Assignment, CafeSettings, CoverRequest, PublishedSchedule } from '@/lib/types';

/** The published week as the grid needs it. Drafts are never shown to employees. */
function fromSnapshot(pub: PublishedSchedule | null): EngineAssignment[] | null {
  if (!pub || !Array.isArray(pub.snapshot)) return null;
  return (
    pub.snapshot as {
      weekday: number;
      block_id: string;
      slot: Assignment['slot'];
      employee_id: string | null;
      start_min: number;
      end_min: number;
    }[]
  ).map((a) => ({
    blockId: a.block_id,
    weekday: a.weekday,
    slot: a.slot,
    employeeId: a.employee_id,
    startMin: a.start_min,
    endMin: a.end_min,
  }));
}

/**
 * My shifts as published. The live assignments are the manager's working draft, which can
 * change after publishing; until the manager publishes again, I see what was published.
 * A live row is matched only to get its id, so I can still ask for cover.
 */
function myPublished(
  pub: PublishedSchedule | null,
  live: Assignment[],
  me: string,
  weekStart: string,
): Assignment[] {
  if (!pub || !Array.isArray(pub.snapshot)) return [];
  const liveIds = new Map(
    live
      .filter((a) => a.employee_id === me && a.id)
      .map((a) => [`${a.block_id}:${a.slot}:${a.start_min}-${a.end_min}`, a.id as string]),
  );
  return (
    pub.snapshot as {
      weekday: number;
      block_id: string;
      slot: Assignment['slot'];
      employee_id: string | null;
      start_min: number;
      end_min: number;
    }[]
  )
    .filter((r) => r.employee_id === me)
    .map((r) => ({
      id: liveIds.get(`${r.block_id}:${r.slot}:${r.start_min}-${r.end_min}`),
      cafe_id: pub.cafe_id,
      week_start: weekStart,
      weekday: r.weekday,
      block_id: r.block_id,
      slot: r.slot,
      employee_id: me,
      start_min: r.start_min,
      end_min: r.end_min,
      manual: false,
      over_limit: false,
    }));
}

/** Back-to-back blocks on the same day and role, shown as one shift. */
type Shift = {
  key: string;
  ids: string[];
  cafe_id: string;
  week_start: string;
  weekday: number;
  slot: Assignment['slot'];
  start_min: number;
  end_min: number;
};

function toShifts(rows: Assignment[]): Shift[] {
  const sorted = [...rows].sort((a, b) => a.weekday - b.weekday || a.start_min - b.start_min);
  const out: Shift[] = [];
  for (const r of sorted) {
    const last = out[out.length - 1];
    if (
      last &&
      last.weekday === r.weekday &&
      last.slot === r.slot &&
      last.end_min === r.start_min
    ) {
      last.end_min = r.end_min;
      if (r.id) last.ids.push(r.id);
      continue;
    }
    out.push({
      key: r.id ?? `${r.weekday}-${r.start_min}`,
      ids: r.id ? [r.id] : [],
      cafe_id: r.cafe_id,
      week_start: r.week_start,
      weekday: r.weekday,
      slot: r.slot,
      start_min: r.start_min,
      end_min: r.end_min,
    });
  }
  return out;
}

const DAY_MS = 86_400_000;

function shiftStart(s: Shift): Date {
  return dateAtMinutes(dateForWeekday(s.week_start, s.weekday), s.start_min);
}
function shiftEnd(s: Shift): Date {
  return dateAtMinutes(dateForWeekday(s.week_start, s.weekday), s.end_min);
}

/** "On now", "Today", "Tomorrow" or "In 3 days". */
function whenLabel(s: Shift, now: Date): string {
  if (shiftStart(s) <= now) return 'On now';
  const midnight = new Date(now);
  midnight.setHours(0, 0, 0, 0);
  const days = Math.floor(
    (dateForWeekday(s.week_start, s.weekday).getTime() - midnight.getTime()) / DAY_MS,
  );
  if (days <= 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  return `In ${days} days`;
}

export default function MyShiftsScreen() {
  const { cafeName, employee } = useApp();
  const [thisWeek, setThisWeek] = useState<Assignment[]>([]);
  const [nextWeek, setNextWeek] = useState<Assignment[]>([]);
  const [covers, setCovers] = useState<CoverRequest[]>([]);
  const [settings, setSettings] = useState<CafeSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [confirm, setConfirm] = useState<Shift | null>(null);
  const [busy, setBusy] = useState(false);
  const [coverNote, setCoverNote] = useState('');
  const [message, setMessage] = useState('');
  const [needsAvailability, setNeedsAvailability] = useState(false);
  const [usualSent, setUsualSent] = useState(false);
  const [tab, setTab] = useState<'mine' | 'team'>('mine');
  const [team, setTeam] = useState<{ id: string; name: string }[]>([]);
  const [teamThis, setTeamThis] = useState<EngineAssignment[] | null>(null);
  const [teamNext, setTeamNext] = useState<EngineAssignment[] | null>(null);
  const router = useRouter();

  const load = useCallback(async () => {
    try {
      const thisStart = currentWeekStart();
      const nextStart = weekStartFromOffset(1);
      const [a, b, pubThis, pubNext, c, s, req] = await Promise.all([
        loadMyAssignments(thisStart),
        loadMyAssignments(nextStart),
        loadMyPublishedWeek(thisStart),
        loadMyPublishedWeek(nextStart),
        loadMyCoverRequests(),
        loadMySettings(),
        loadMyRequestStatus(planningWeekStart()),
      ]);
      setNeedsAvailability(Boolean(req.request) && req.status?.status === 'waiting');
      const me = employee?.id ?? '';
      setThisWeek(myPublished(pubThis, a, me, thisStart));
      setNextWeek(myPublished(pubNext, b, me, nextStart));
      setCovers(c);
      setSettings(s);
      setTeamThis(fromSnapshot(pubThis));
      setTeamNext(fromSnapshot(pubNext));
      // Has a first usual week already gone to the manager? Then there is nothing to ask for.
      try {
        const asks = await loadMyAvailabilityRequests();
        setUsualSent(asks.some((r) => r.scope === 'usual' && r.status === 'pending'));
      } catch {
        setUsualSent(false);
      }
      // The team names are a bonus: if they fail, My shifts still works.
      try {
        setTeam(await loadMyTeam());
      } catch {
        setTeam([]);
      }
      setMessage('');
    } catch (e) {
      setMessage(
        e instanceof Error ? e.message : 'Could not load your shifts. Check your connection.',
      );
    } finally {
      setLoading(false);
    }
  }, [employee?.id]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const askCover = async () => {
    if (!confirm || !employee) return;
    if (confirm.ids.length === 0) {
      // The manager has moved this shift in their draft since publishing.
      setMessage('Your manager is changing this shift. Check again after they publish.');
      setConfirm(null);
      return;
    }
    setBusy(true);
    try {
      const already = new Set(covers.map((c) => c.assignment_id));
      for (const id of confirm.ids.filter((x) => !already.has(x))) {
        await createCoverRequest({
          cafeId: confirm.cafe_id,
          assignmentId: id,
          employeeId: employee.id,
          weekStart: confirm.week_start,
          weekday: confirm.weekday,
          note: coverNote,
        });
      }
      await load();
      setConfirm(null);
      setCoverNote('');
      toast('Your manager has been told. You stay on the shift until they change it.');
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Could not send that request.');
    } finally {
      setBusy(false);
    }
  };

  const now = new Date();
  const allShifts = [...toShifts(thisWeek), ...toShifts(nextWeek)];
  const upNext = allShifts.find((s) => shiftEnd(s) > now) ?? null;

  /** First names of everyone else on the schedule during this shift. */
  const workingWith = (s: Shift): string[] => {
    const rows = s.week_start === currentWeekStart() ? teamThis : teamNext;
    if (!rows || !employee) return [];
    const ids = new Set(
      rows
        .filter(
          (r) =>
            r.weekday === s.weekday &&
            r.employeeId &&
            r.employeeId !== employee.id &&
            r.startMin < s.end_min &&
            r.endMin > s.start_min,
        )
        .map((r) => r.employeeId as string),
    );
    return team.filter((p) => ids.has(p.id)).map((p) => p.name);
  };

  const renderWeek = (label: string, weekStart: string, rows: Assignment[], isCurrent: boolean) => {
    const shifts = toShifts(rows);
    const minutes = shifts.reduce((sum, a) => sum + (a.end_min - a.start_min), 0);
    return (
      <View>
        <View className="flex-row items-end justify-between">
          <SectionTitle>{label}</SectionTitle>
          {minutes > 0 ? (
            <Text
              className="mb-2.5 px-1 text-xs font-semibold text-muted-foreground"
              style={{ fontVariant: ['tabular-nums'] }}
            >
              {fmtHours(minutes)}
            </Text>
          ) : null}
        </View>
        {shifts.length === 0 ? (
          <Text className="px-1 text-sm text-muted-foreground">
            {isCurrent
              ? 'You have no shifts this week.'
              : `Nothing scheduled yet. Your manager publishes on ${DAY_LONG[settings?.publish_weekday ?? 4]}.`}
          </Text>
        ) : (
          <View
            className="overflow-hidden rounded-2xl border border-border/60 bg-card"
            style={[{ borderCurve: 'continuous' }, cardShadow]}
          >
            {shifts.map((a, i) => {
              const colors = SLOT_COLORS[a.slot];
              const covered = covers.some((c) => a.ids.includes(c.assignment_id));
              const past = shiftEnd(a) < now;
              return (
                <PressScale
                  key={a.key}
                  scale={0.99}
                  disabled={past}
                  onPress={() => setConfirm(a)}
                  accessibilityLabel={`${DAY_LONG[a.weekday]}, ${fmtRange(a.start_min, a.end_min)}, ${SLOT_LABEL[a.slot]}`}
                  className={`flex-row items-center gap-3 px-4 py-3.5 ${
                    i > 0 ? 'border-t border-border/70' : ''
                  }`}
                  style={past ? { opacity: 0.5 } : undefined}
                >
                  <View
                    className="h-12 w-12 items-center justify-center rounded-xl"
                    style={{
                      backgroundColor: colors.bg,
                      borderWidth: 1,
                      borderColor: colors.line,
                      borderCurve: 'continuous',
                    }}
                  >
                    <Text
                      className="text-[10px] font-bold uppercase"
                      style={{ color: colors.ink, letterSpacing: 0.4 }}
                    >
                      {DAY_SHORT[a.weekday]}
                    </Text>
                    <Text
                      className="text-lg font-bold leading-[20px]"
                      style={{
                        color: colors.ink,
                        fontVariant: ['tabular-nums'],
                      }}
                    >
                      {dateForWeekday(weekStart, a.weekday).getDate()}
                    </Text>
                  </View>
                  <View className="flex-1">
                    <Text className="text-[15px] font-semibold text-foreground">
                      {DAY_LONG[a.weekday]}
                      <Text className="font-normal text-muted-foreground">
                        {`  ${fmtDayDate(weekStart, a.weekday).replace(/^\w{3} /, '')}`}
                      </Text>
                    </Text>
                    <Text
                      className="mt-0.5 text-sm text-muted-foreground"
                      style={{ fontVariant: ['tabular-nums'] }}
                    >
                      {fmtRange(a.start_min, a.end_min)}, {SLOT_LABEL[a.slot].toLowerCase()}
                    </Text>
                  </View>
                  {past ? (
                    <Text className="text-xs font-medium text-muted-foreground">Done</Text>
                  ) : covered ? (
                    <View
                      className="rounded-full px-2.5 py-1"
                      style={{ backgroundColor: C.redSoft }}
                    >
                      <Text className="text-[11px] font-semibold text-destructive">
                        Cover asked
                      </Text>
                    </View>
                  ) : (
                    <ChevronRight size={16} color={C.muted} />
                  )}
                </PressScale>
              );
            })}
          </View>
        )}
      </View>
    );
  };

  const confirmCovered = confirm
    ? covers.some((c) => confirm.ids.includes(c.assignment_id))
    : false;
  const confirmWith = confirm ? workingWith(confirm) : [];

  return (
    <Screen onRefresh={load}>
      <AppBar
        eyebrow={(() => {
          const h = new Date().getHours();
          const hi = h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
          const first = employee?.name?.split(' ')[0];
          return first ? `${hi}, ${first}` : hi;
        })()}
        title="My shifts"
        subtitle={cafeName ?? ''}
      />

      {needsAvailability ? (
        <PressScale
          onPress={() => router.push('/(app)/(employee)/availability')}
          className="mb-3 flex-row items-center gap-3 rounded-2xl bg-primary px-4 py-3.5"
        >
          <Clock size={18} color={C.cream} />
          <View className="flex-1">
            <Text className="text-sm font-semibold text-primary-foreground">
              Your manager needs your availability
            </Text>
            <Text className="text-xs text-primary-foreground/80">
              For next week · due{' '}
              {fmtDue(
                availabilityDueDate(
                  planningWeekStart(),
                  settings?.due_weekday ?? 2,
                  settings?.due_min ?? 1200,
                ),
              )}
            </Text>
          </View>
          <ChevronRight size={16} color={C.cream} />
        </PressScale>
      ) : null}

      {/* New on the team: the manager cannot schedule them until they say when they can work. */}
      {!loading && employee && !Array.isArray(employee.usual_week) && !needsAvailability ? (
        <PressScale
          onPress={() => router.push('/(app)/(employee)/availability')}
          className="mb-3 flex-row items-center gap-3 rounded-2xl bg-primary px-4 py-3.5"
        >
          <Clock size={18} color={C.cream} />
          <View className="flex-1">
            <Text className="text-sm font-semibold text-primary-foreground">
              {usualSent
                ? 'Your usual week is with your manager'
                : 'Tell your manager when you can work'}
            </Text>
            <Text className="text-xs text-primary-foreground/80">
              {usualSent
                ? 'You will get shifts once they approve it.'
                : 'Set your usual week once. Your shifts are planned from it every week.'}
            </Text>
          </View>
          <ChevronRight size={16} color={C.cream} />
        </PressScale>
      ) : null}

      {message ? <Text className="mb-3 text-xs text-destructive">{message}</Text> : null}

      {upNext ? (
        <PressScale
          scale={0.99}
          onPress={() => setConfirm(upNext)}
          className="mb-4 overflow-hidden rounded-3xl bg-primary p-5"
          style={[
            { borderCurve: 'continuous' },
            { boxShadow: '0 14px 30px -16px rgba(20, 56, 44, 0.55)' },
          ]}
        >
          <View
            pointerEvents="none"
            style={{
              position: 'absolute',
              right: -50,
              top: -70,
              width: 200,
              height: 200,
              borderRadius: 100,
              backgroundColor: C.pistachio,
              opacity: 0.12,
            }}
          />
          <View className="flex-row items-center justify-between">
            <Text
              className="text-[11px] font-semibold uppercase"
              style={{ color: C.pistachio, letterSpacing: 0.8 }}
            >
              Your next shift
            </Text>
            <View className="rounded-full px-2.5 py-1" style={{ backgroundColor: C.pistachio }}>
              <Text className="text-[11px] font-bold" style={{ color: C.pine }}>
                {whenLabel(upNext, now)}
              </Text>
            </View>
          </View>
          <Text
            className="mt-2 text-[26px] font-bold leading-[30px] text-primary-foreground"
            style={{ letterSpacing: -0.5 }}
          >
            {DAY_LONG[upNext.weekday]},{' '}
            {fmtDayDate(upNext.week_start, upNext.weekday).replace(/^\w{3} /, '')}
          </Text>
          <Text
            className="mt-1 text-lg font-semibold text-primary-foreground"
            style={{ fontVariant: ['tabular-nums'] }}
          >
            {fmtRange(upNext.start_min, upNext.end_min)}
          </Text>
          <View className="mt-3 flex-row items-center gap-2.5">
            {workingWith(upNext).length > 0 ? (
              <AvatarStack names={workingWith(upNext)} size={26} ring={C.pine} max={4} />
            ) : null}
            <Text className="flex-1 text-sm text-primary-foreground/80">
              {SLOT_LABEL[upNext.slot]}
              {workingWith(upNext).length > 0
                ? `, with ${workingWith(upNext).join(' and ')}`
                : upNext.slot === 'solo'
                  ? ', on your own'
                  : ''}
            </Text>
          </View>
          {covers.some((c) => upNext.ids.includes(c.assignment_id)) ? (
            <View
              className="mt-3 self-start rounded-full px-2.5 py-1"
              style={{ backgroundColor: C.redSoft }}
            >
              <Text className="text-[11px] font-bold" style={{ color: C.red }}>
                You asked for cover. You stay on it until your manager changes it.
              </Text>
            </View>
          ) : null}
        </PressScale>
      ) : null}

      <View className="mb-4">
        <Segmented
          options={[
            { value: 'mine', label: 'My shifts' },
            { value: 'team', label: 'Whole team' },
          ]}
          value={tab}
          onChange={setTab}
        />
      </View>

      {tab === 'team' ? (
        <View className="gap-5">
          {[
            {
              label: `This week · ${fmtWeekLabel(currentWeekStart())}`,
              week: currentWeekStart(),
              rows: teamThis,
            },
            {
              label: `Next week · ${fmtWeekLabel(weekStartFromOffset(1))}`,
              week: weekStartFromOffset(1),
              rows: teamNext,
            },
          ].map((w) => (
            <View key={w.week} className="gap-2">
              <SectionTitle>{w.label}</SectionTitle>
              {w.rows ? (
                <WeekGrid
                  weekStart={w.week}
                  people={team}
                  assignments={w.rows}
                  highlightId={employee?.id}
                  hideEmpty
                />
              ) : (
                <Text className="text-sm text-muted-foreground">
                  {w.week === currentWeekStart()
                    ? 'No schedule was published for this week.'
                    : `Not published yet. Your manager publishes on ${
                        DAY_LONG[settings?.publish_weekday ?? 4]
                      }.`}
                </Text>
              )}
            </View>
          ))}
        </View>
      ) : loading ? (
        <View className="gap-3">
          <Skeleton height={150} />
          <Skeleton height={64} />
          <Skeleton height={64} />
        </View>
      ) : thisWeek.length === 0 && nextWeek.length === 0 ? (
        <EmptyState
          icon={<CalendarX size={28} color={C.pine} />}
          title="No shifts yet"
          body="When your manager publishes the week, your shifts show up here."
        />
      ) : (
        <View className="gap-1">
          {renderWeek(
            `This week · ${fmtWeekLabel(currentWeekStart())}`,
            currentWeekStart(),
            thisWeek,
            true,
          )}
          {renderWeek(
            `Next week · ${fmtWeekLabel(weekStartFromOffset(1))}`,
            weekStartFromOffset(1),
            nextWeek,
            false,
          )}
        </View>
      )}

      <Sheet
        visible={Boolean(confirm)}
        onClose={() => setConfirm(null)}
        title={
          confirm
            ? `${DAY_LONG[confirm.weekday]}, ${fmtDayDate(confirm.week_start, confirm.weekday).replace(/^\w{3} /, '')}`
            : ''
        }
      >
        <View className="gap-3 pb-4">
          {confirm ? (
            <View className="rounded-xl bg-muted/60 px-3.5 py-3">
              <Text
                className="text-base font-semibold text-foreground"
                style={{ fontVariant: ['tabular-nums'] }}
              >
                {fmtRange(confirm.start_min, confirm.end_min)}
              </Text>
              <Text className="mt-0.5 text-sm text-muted-foreground">
                {SLOT_LABEL[confirm.slot]}
                {confirmWith.length > 0 ? `, with ${confirmWith.join(' and ')}` : ''}
              </Text>
            </View>
          ) : null}
          {confirmCovered ? (
            <Notice
              tone="warn"
              title="You asked for cover"
              body="Your manager has been told. You stay on this shift until they change it."
            />
          ) : (
            <>
              <Text className="text-sm text-muted-foreground">
                Can’t make it? Tell your manager and they will find someone else. You stay on the
                shift until they change it.
              </Text>
              <Field
                label="Reason (optional)"
                placeholder="Anything your manager should know"
                value={coverNote}
                onChangeText={setCoverNote}
                maxLength={200}
              />
              <Btn label="I can’t make it" variant="danger" loading={busy} onPress={askCover} />
            </>
          )}
          <Btn label="Close" variant="ghost" onPress={() => setConfirm(null)} />
        </View>
      </Sheet>

      <View className="mt-4">
        <Notice
          tone="info"
          title="Reminders"
          body={`Evening before at ${fmtTime(settings?.evening_reminder_min ?? 1080)}, and ${leadLabel(settings?.second_reminder_min ?? 60)} before your shift.`}
        />
      </View>
    </Screen>
  );
}
