import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Minus,
  Plus,
  Send,
  Share2,
  Sparkles,
  UserPlus,
} from 'lucide-react-native';
import { type ElementRef, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, Text, TextInput, View } from 'react-native';

import { supabase } from '@/client/supabase';
import {
  AppBar,
  Appear,
  Avatar,
  Btn,
  Card,
  Pill,
  PressScale,
  Screen,
  SectionTitle,
  Segmented,
  Sheet,
  Skeleton,
  Stars,
  TimeField,
  toast,
} from '@/components/kit';
import {
  addEmployee,
  resendInvite,
  clearAvailabilityDay,
  planningWeekStart,
  weekStartFromOffset,
  deactivateEmployee,
  markAnswered,
  nudgeEmployee,
  saveAvailabilityRows,
  sendWeeklyRequest,
  updateEmployee,
} from '@/lib/api';
import { useApp } from '@/lib/app-context';
import { inviteMessage, isReachable, shareInvite } from '@/lib/invite';
import { C } from '@/lib/colors';
import { cardShadow } from '@/lib/motion';
import { DAY_LONG, DAY_SHORT, fmtRange, fmtTime, fmtWeekLabel } from '@/lib/dates';
import type { Availability, CafeSettings, Employee, UsualDay } from '@/lib/types';
import { useWeekData } from '@/lib/useWeek';

const ROLES: { key: string; label: string }[] = [
  { key: 'barista', label: 'Barista' },
  { key: 'scooper', label: 'Scooper' },
  { key: 'back_of_house', label: 'Back of house' },
];

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

type ParsedDay = {
  weekday: number;
  kind: 'any' | 'none' | 'window';
  start_min: number;
  end_min: number;
};
type Parsed = {
  employee_id: string | null;
  employee_name: string;
  days: ParsedDay[];
  unclear?: string;
};

export default function TeamScreen() {
  const router = useRouter();
  const { cafe, cafeName, hasAccess } = useApp();
  // Which week the availability below is for: next week by default. A one-week change
  // (holiday, appointment) can be made for any week ahead without touching the usual week.
  const params = useLocalSearchParams<{ week?: string }>();
  const [weekOffset, setWeekOffset] = useState(1);
  // Opened from Schedule with a week: show that week's availability.
  useEffect(() => {
    const w = Number(params.week);
    if (Number.isInteger(w) && w >= 0 && w <= 12) setWeekOffset(w);
  }, [params.week]);
  const weekStart = weekOffset === 1 ? planningWeekStart() : weekStartFromOffset(weekOffset);
  const data = useWeekData(weekStart);
  const settings = data.settings ?? FALLBACK_SETTINGS;

  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  // Confirmations float above the tab bar, so they are seen wherever the page is scrolled.
  useEffect(() => {
    if (message) toast(message);
  }, [message]);
  const [paste, setPaste] = useState('');
  const [parsed, setParsed] = useState<Parsed | null>(null);
  // Who the pasted message belongs to. Pre-filled only when the reader found a name in it.
  const [parsedFor, setParsedFor] = useState<string | null>(null);
  const [parsing, setParsing] = useState(false);

  const [memberSheet, setMemberSheet] = useState<{
    open: boolean;
    editing: Employee | null;
  }>({
    open: false,
    editing: null,
  });
  const [daySheet, setDaySheet] = useState<{
    employee: Employee;
    weekday: number;
  } | null>(null);
  const [deactivateTarget, setDeactivateTarget] = useState<Employee | null>(null);
  const [nudged, setNudged] = useState<Set<string>>(new Set());

  const availabilityByEmployee = useMemo(() => {
    const map = new Map<string, Availability[]>();
    for (const a of data.availability) {
      const list = map.get(a.employee_id) ?? [];
      list.push(a);
      map.set(a.employee_id, list);
    }
    return map;
  }, [data.availability]);

  const sendRequest = async () => {
    if (!cafe) return;
    if (!hasAccess) {
      router.push('/(app)/billing');
      return;
    }
    setBusy(true);
    setMessage('');
    try {
      await sendWeeklyRequest({
        cafeId: cafe.id,
        weekStart,
        employeeIds: data.employees.filter((e) => e.active).map((e) => e.id),
        settings,
      });
      await data.reload();
      const notJoined = data.employees.filter((e) => e.active && !isReachable(e));
      setMessage(
        notJoined.length === 0
          ? 'Request sent to your team.'
          : `Request saved. ${notJoined.map((e) => e.name).join(', ')} ${
              notJoined.length === 1 ? 'has' : 'have'
            } not joined yet, so share ${notJoined.length === 1 ? 'their invite' : 'their invites'} below.`,
      );
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Could not send the request.');
    } finally {
      setBusy(false);
    }
  };

  const nudge = async (emp: Employee) => {
    if (!cafe || nudged.has(emp.id)) return;
    setBusy(true);
    try {
      await nudgeEmployee({
        cafeId: cafe.id,
        weekStart,
        employeeId: emp.id,
        body: `Reminder: please send your availability for the week of ${fmtWeekLabel(weekStart)}.`,
        channel: settings.channel,
      });
      setNudged((prev) => new Set(prev).add(emp.id));
      setMessage(`Nudged ${emp.name}.`);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Could not send the nudge.');
    } finally {
      setBusy(false);
    }
  };

  const invite = async (emp: Employee) => {
    const result = await shareInvite(inviteMessage(emp, cafeName || cafe?.name || 'our café'));
    setMessage(
      result === 'copied'
        ? `Invite for ${emp.name} copied. Paste it into a text or email.`
        : result === 'failed'
          ? `Could not share. ${emp.name}'s invite code is ${emp.invite_code}.`
          : '',
    );
  };

  const runParse = async () => {
    if (!cafe || !paste.trim()) return;
    if (!hasAccess) {
      router.push('/(app)/billing');
      return;
    }
    setParsing(true);
    setMessage('');
    setParsed(null);
    try {
      const { data: result, error } = await supabase.functions.invoke('parse-availability', {
        body: { cafe_id: cafe.id, text: paste.trim() },
      });
      if (error)
        throw new Error(
          'Reading messages is not available right now. Tap the days on a team card to enter them instead.',
        );
      if (result?.error) throw new Error(String(result.error));
      setParsed(result as Parsed);
      setParsedFor((result as Parsed).employee_id ?? null);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Could not read that message.');
    } finally {
      setParsing(false);
    }
  };

  const saveParsed = async () => {
    if (!cafe || !parsed || !parsedFor) return;
    const person = data.employees.find((e) => e.id === parsedFor);
    setBusy(true);
    try {
      const rows: Availability[] = parsed.days.map((d) => ({
        cafe_id: cafe.id,
        employee_id: parsedFor,
        week_start: weekStart,
        weekday: d.weekday,
        kind: d.kind,
        start_min: d.kind === 'window' ? d.start_min : null,
        end_min: d.kind === 'window' ? d.end_min : null,
      }));
      await saveAvailabilityRows(rows);
      if (data.request) await markAnswered(data.request.id, parsedFor);
      await data.reload();
      setParsed(null);
      setParsedFor(null);
      setPaste('');
      setMessage(`Saved ${person?.name ?? 'their'}'s availability.`);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Could not save that availability.');
    } finally {
      setBusy(false);
    }
  };

  const saveDay = async (
    kind: 'any' | 'none' | 'window',
    startMin: number,
    endMin: number,
    scope: 'every' | 'week',
    allDays = false,
  ) => {
    if (!cafe || !daySheet) return;
    const weekdays = allDays ? [0, 1, 2, 3, 4, 5, 6] : [daySheet.weekday];
    const emp = daySheet.employee;
    const day: UsualDay = {
      kind,
      start_min: kind === 'window' ? startMin : null,
      end_min: kind === 'window' ? endMin : null,
    };
    setBusy(true);
    try {
      if (scope === 'every') {
        // Days not set yet start as "not available" until the manager fills them in.
        const usual: UsualDay[] =
          Array.isArray(emp.usual_week) && emp.usual_week.length === 7
            ? [...emp.usual_week]
            : Array.from({ length: 7 }, () => ({
                kind: 'none',
                start_min: null,
                end_min: null,
              }));
        for (const w of weekdays) usual[w] = day;
        await updateEmployee(emp.id, { usual_week: usual });
        // Apply it to the week being planned too.
        for (const w of weekdays) await clearAvailabilityDay(emp.id, weekStart, w);
      } else {
        await saveAvailabilityRows(
          weekdays.map((w) => ({
            cafe_id: cafe.id,
            employee_id: emp.id,
            week_start: weekStart,
            weekday: w,
            ...day,
          })),
        );
        if (data.request) await markAnswered(data.request.id, emp.id);
      }
      await data.reload();
      setDaySheet(null);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Could not save that day.');
    } finally {
      setBusy(false);
    }
  };

  // Quick edits on a team card. Errors are shown instead of failing silently.
  const quickUpdate = async (emp: Employee, patch: Parameters<typeof updateEmployee>[1]) => {
    try {
      await updateEmployee(emp.id, patch);
      await data.reload();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : `Could not update ${emp.name}.`);
    }
  };

  const bumpRating = (emp: Employee, delta: number) => {
    const next = Math.max(1, Math.min(5, emp.rating + delta));
    if (next === emp.rating) return;
    return quickUpdate(emp, { rating: next });
  };

  const toggleRole = (emp: Employee, role: string) => {
    const has = emp.roles.includes(role);
    const roles = has ? emp.roles.filter((r) => r !== role) : [...emp.roles, role];
    if (roles.length === 0) {
      setMessage(`${emp.name} needs at least one role.`);
      return;
    }
    return quickUpdate(emp, { roles });
  };

  const toggleSolo = (emp: Employee) => quickUpdate(emp, { can_work_alone: !emp.can_work_alone });

  const confirmDeactivate = async () => {
    if (!cafe || !deactivateTarget) return;
    setBusy(true);
    try {
      await deactivateEmployee(cafe.id, deactivateTarget.id);
      await data.reload();
      setMessage(`${deactivateTarget.name} is deactivated. Their open shifts show as gaps.`);
      setDeactivateTarget(null);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Could not deactivate.');
    } finally {
      setBusy(false);
    }
  };

  const waiting = data.employees.filter(
    (e) => e.active && (data.engine.statuses[e.id] ?? 'waiting') === 'waiting',
  );

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
    <Screen onRefresh={data.reload}>
      <AppBar
        title="Team"
        subtitle={(() => {
          const active = data.employees.filter((e) => e.active);
          const joined = active.filter((e) => e.user_id).length;
          return `${active.length} active · ${joined} joined the app`;
        })()}
        right={
          <PressScale
            onPress={() => setMemberSheet({ open: true, editing: null })}
            accessibilityLabel="Add a team member"
            className="mt-1 flex-row items-center gap-1.5 rounded-full bg-primary px-3.5 py-2"
            style={{ boxShadow: '0 8px 20px -10px rgba(20, 56, 44, 0.6)' }}
          >
            <UserPlus size={15} color={C.cream} />
            <Text className="text-sm font-semibold text-primary-foreground">Add</Text>
          </PressScale>
        }
      />

      <View
        className="mb-3 flex-row items-center justify-between rounded-2xl border border-border/60 bg-card px-2 py-2"
        style={[{ borderCurve: 'continuous' }, cardShadow]}
      >
        <PressScale
          onPress={() => setWeekOffset((o) => Math.max(0, o - 1))}
          disabled={weekOffset === 0}
          accessibilityLabel="Previous week"
          className={`h-10 w-10 items-center justify-center rounded-full bg-muted ${
            weekOffset === 0 ? 'opacity-30' : ''
          }`}
        >
          <ChevronLeft size={20} color={C.pine} />
        </PressScale>
        <View className="flex-1 items-center px-2">
          <Text
            className="text-[11px] font-semibold uppercase text-muted-foreground"
            style={{ letterSpacing: 0.6 }}
          >
            Availability for
          </Text>
          <Text className="text-sm font-semibold text-foreground">
            {weekOffset === 0 ? 'This week · ' : weekOffset === 1 ? 'Next week · ' : ''}
            {fmtWeekLabel(weekStart)}
          </Text>
        </View>
        <PressScale
          onPress={() => setWeekOffset((o) => Math.min(12, o + 1))}
          accessibilityLabel="Next week"
          className="h-10 w-10 items-center justify-center rounded-full bg-muted"
        >
          <ChevronRight size={20} color={C.pine} />
        </PressScale>
      </View>
      <Text className="mb-3 px-1 text-xs text-muted-foreground">
        Each person’s usual week repeats every week. Tap a day to change it for every week, or only
        for {fmtWeekLabel(weekStart)}.
      </Text>

      <View className="gap-3">
        {data.loading && data.employees.length === 0 ? (
          <>
            <Skeleton height={190} />
            <Skeleton height={190} />
          </>
        ) : null}
        {data.employees.map((emp, index) => {
          const days = availabilityByEmployee.get(emp.id) ?? [];
          const status = data.engine.statuses[emp.id] ?? 'waiting';
          const hasUsual = Array.isArray(emp.usual_week);
          const replied = days.some((d) => !d.from_usual);
          const chip: { label: string; bg: string; ink: string } = !emp.active
            ? { label: 'Inactive', bg: C.redSoft, ink: C.red }
            : data.request && status === 'unavailable'
              ? { label: 'Not available', bg: '#FBF3E2', ink: '#8A5A12' }
              : data.request && replied
                ? { label: 'Answered', bg: C.solo, ink: C.soloInk }
                : hasUsual
                  ? { label: 'Usual week', bg: C.solo, ink: C.soloInk }
                  : data.request
                    ? { label: 'Waiting', bg: '#FBF3E2', ink: '#8A5A12' }
                    : { label: 'No usual week', bg: C.redSoft, ink: C.red };
          return (
            <Appear key={emp.id} index={index}>
              <Card>
                <View className="flex-row items-center justify-between gap-3">
                  <Avatar name={emp.name} size={44} />
                  <View className="flex-1">
                    <Text
                      className="text-base font-semibold text-foreground"
                      style={{ letterSpacing: -0.2 }}
                      numberOfLines={1}
                    >
                      {emp.name}
                    </Text>
                    <View className="mt-1 flex-row flex-wrap items-center gap-1.5">
                      <View
                        className="rounded-full px-2 py-0.5"
                        style={{ backgroundColor: chip.bg }}
                      >
                        <Text className="text-[11px] font-semibold" style={{ color: chip.ink }}>
                          {chip.label}
                        </Text>
                      </View>
                    </View>
                    <Text className="mt-1 text-xs text-muted-foreground">
                      {emp.max_hours}h max · ${Number(emp.hourly_wage).toFixed(2)}/h
                    </Text>
                  </View>
                  <View className="flex-row items-center gap-1">
                    <PressScale
                      accessibilityLabel={`Lower ${emp.name}'s rating`}
                      onPress={() => bumpRating(emp, -1)}
                      className="h-7 w-7 items-center justify-center rounded-full border border-border"
                    >
                      <Minus size={12} color={C.pine} />
                    </PressScale>
                    <Stars value={emp.rating} />
                    <PressScale
                      accessibilityLabel={`Raise ${emp.name}'s rating`}
                      onPress={() => bumpRating(emp, 1)}
                      className="h-7 w-7 items-center justify-center rounded-full border border-border"
                    >
                      <Plus size={12} color={C.pine} />
                    </PressScale>
                  </View>
                </View>

                <View className="mt-2 flex-row flex-wrap gap-1.5">
                  {ROLES.map((r) => {
                    const on = emp.roles.includes(r.key);
                    return (
                      <PressScale
                        key={r.key}
                        onPress={() => toggleRole(emp, r.key)}
                        className={`rounded-full px-2.5 py-1 ${
                          on ? 'border border-primary bg-primary' : 'border border-border bg-card'
                        }`}
                      >
                        <Text
                          className={`text-[11px] font-semibold ${
                            on ? 'text-primary-foreground' : 'text-muted-foreground'
                          }`}
                        >
                          {r.label}
                        </Text>
                      </PressScale>
                    );
                  })}
                  <PressScale
                    onPress={() => toggleSolo(emp)}
                    className={`rounded-full px-2.5 py-1 ${
                      emp.can_work_alone ? 'bg-accent' : 'border border-border bg-card'
                    }`}
                  >
                    <Text
                      className={`text-[11px] font-semibold ${
                        emp.can_work_alone ? 'text-accent-foreground' : 'text-muted-foreground'
                      }`}
                    >
                      Can work alone
                    </Text>
                  </PressScale>
                </View>

                {emp.active && !emp.user_id ? (
                  <View className="mt-3 flex-row items-center gap-3 rounded-xl bg-muted px-3 py-2.5">
                    <View className="flex-1">
                      <Text className="text-xs font-semibold text-foreground">Not joined yet</Text>
                      <Text selectable className="text-[11px] text-muted-foreground">
                        Invite code{' '}
                        <Text className="font-bold tracking-widest text-foreground">
                          {emp.invite_code}
                        </Text>
                      </Text>
                    </View>
                    <PressScale
                      onPress={() => invite(emp)}
                      accessibilityLabel={`Share ${emp.name}'s invite`}
                      className="flex-row items-center gap-1.5 rounded-lg bg-primary px-3 py-2"
                    >
                      <Share2 size={13} color={C.cream} />
                      <Text className="text-xs font-semibold text-primary-foreground">
                        Share invite
                      </Text>
                    </PressScale>
                  </View>
                ) : null}

                <View className="mt-3 flex-row gap-1">
                  {DAY_SHORT.map((d, i) => {
                    const row = days.find((x) => x.weekday === i);
                    // Different from the usual week for this week only (not just re-confirmed).
                    const usualDay = Array.isArray(emp.usual_week) ? emp.usual_week[i] : null;
                    const oneOff = Boolean(
                      row &&
                      !row.from_usual &&
                      usualDay &&
                      (row.kind !== usualDay.kind ||
                        (row.kind === 'window' &&
                          (row.start_min !== usualDay.start_min ||
                            row.end_min !== usualDay.end_min))),
                    );
                    const label =
                      !row || row.kind === 'none'
                        ? '—'
                        : row.kind === 'any'
                          ? 'Any'
                          : `${fmtTime(row.start_min ?? 0)
                              .replace(':00', '')
                              .replace(' ', '')}`;
                    const tone =
                      !row || row.kind === 'none'
                        ? 'bg-muted'
                        : row.kind === 'any'
                          ? 'bg-accent'
                          : 'bg-secondary';
                    return (
                      <PressScale
                        key={d}
                        onPress={() => setDaySheet({ employee: emp, weekday: i })}
                        accessibilityLabel={`${emp.name}, ${DAY_LONG[i]}: ${
                          !row || row.kind === 'none'
                            ? 'not available'
                            : row.kind === 'any'
                              ? 'any time'
                              : fmtRange(row.start_min ?? 0, row.end_min ?? 0)
                        }. Change`}
                        className={`flex-1 items-center rounded-lg py-1.5 ${tone}`}
                      >
                        <Text className="text-[9px] font-bold uppercase text-muted-foreground">
                          {d}
                        </Text>
                        <Text className="text-[10px] font-semibold text-foreground">{label}</Text>
                        {oneOff ? (
                          // Changed for this week only: a small dot, so one-offs stand out.
                          <View
                            className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full"
                            style={{ backgroundColor: '#B7791F' }}
                          />
                        ) : null}
                      </PressScale>
                    );
                  })}
                </View>
                <Text className="mt-1.5 text-[11px] text-muted-foreground">
                  {Array.isArray(emp.usual_week)
                    ? days.some((d) => {
                        const u = emp.usual_week?.[d.weekday];
                        return (
                          !d.from_usual &&
                          u &&
                          (d.kind !== u.kind ||
                            (d.kind === 'window' &&
                              (d.start_min !== u.start_min || d.end_min !== u.end_min)))
                        );
                      })
                      ? `Usual week. Days with a dot are changed for ${fmtWeekLabel(weekStart)} only.`
                      : 'Usual week. Tap a day to edit.'
                    : 'Tap a day to set when they can usually work.'}
                </Text>

                <View className="mt-3 flex-row gap-2">
                  <PressScale
                    onPress={() => setMemberSheet({ open: true, editing: emp })}
                    className="flex-1 items-center rounded-lg border border-border py-2"
                  >
                    <Text className="text-xs font-semibold text-foreground">Edit</Text>
                  </PressScale>
                  {emp.active ? (
                    <PressScale
                      onPress={() => setDeactivateTarget(emp)}
                      hitSlop={8}
                      className="items-center justify-center px-3 py-2"
                    >
                      <Text className="text-xs font-medium text-muted-foreground">Deactivate</Text>
                    </PressScale>
                  ) : (
                    <PressScale
                      onPress={async () => {
                        await quickUpdate(emp, { active: true });
                        setMessage(`${emp.name} is back on the team.`);
                      }}
                      className="flex-1 items-center rounded-lg bg-primary py-2"
                    >
                      <Text className="text-xs font-semibold text-primary-foreground">
                        Reactivate
                      </Text>
                    </PressScale>
                  )}
                </View>
              </Card>
            </Appear>
          );
        })}
      </View>

      <SectionTitle>Tools</SectionTitle>
      <Card>
        <View className="flex-row items-center justify-between gap-3">
          <View className="flex-1">
            <Text className="text-base font-semibold text-foreground">Ask about next week</Text>
            <Text className="mt-0.5 text-xs text-muted-foreground">
              {data.request
                ? `Sent for ${fmtWeekLabel(weekStart)} · ${waiting.length} still waiting`
                : 'Optional. Drafts use everyone’s usual week; ask only when a week is unusual, like a holiday.'}
            </Text>
          </View>
          <PressScale
            onPress={sendRequest}
            className="flex-row items-center gap-1.5 rounded-lg bg-primary px-3 py-2"
          >
            <Send size={13} color={C.cream} />
            <Text className="text-xs font-semibold text-primary-foreground">
              {data.request ? 'Resend' : 'Ask everyone'}
            </Text>
          </PressScale>
        </View>
        {waiting.length > 0 ? (
          <View className="mt-3 gap-1.5">
            {waiting.map((emp) => (
              <View key={emp.id} className="flex-row items-center justify-between">
                <Text className="text-sm text-foreground">{emp.name}</Text>
                {!isReachable(emp) ? (
                  <Pressable
                    onPress={() => invite(emp)}
                    accessibilityRole="button"
                    accessibilityLabel={`Share ${emp.name}'s invite`}
                    hitSlop={8}
                    className="px-2 py-1 active:opacity-60"
                  >
                    <Text className="text-xs font-semibold text-primary">
                      Not joined · Share invite
                    </Text>
                  </Pressable>
                ) : (
                  <Pressable
                    onPress={() => nudge(emp)}
                    disabled={nudged.has(emp.id)}
                    accessibilityRole="button"
                    accessibilityLabel={`Nudge ${emp.name}`}
                    hitSlop={8}
                    className="px-2 py-1 active:opacity-60"
                  >
                    <Text
                      className={`text-xs font-semibold ${
                        nudged.has(emp.id) ? 'text-muted-foreground' : 'text-primary'
                      }`}
                    >
                      {nudged.has(emp.id) ? 'Nudged' : 'Nudge'}
                    </Text>
                  </Pressable>
                )}
              </View>
            ))}
          </View>
        ) : null}
        {message && !parsed ? (
          <Text className="mt-3 text-xs text-muted-foreground">{message}</Text>
        ) : null}
      </Card>

      <SectionTitle>Read a text message</SectionTitle>
      <Card>
        <Text className="mb-2 text-xs text-muted-foreground">
          Paste what someone sent you. ShiftCup reads it and shows you the days before saving.
        </Text>
        <TextInput
          value={paste}
          onChangeText={setPaste}
          multiline
          placeholder="Friday after 5, until 8. Saturday anytime."
          placeholderTextColor={C.muted}
          className="min-h-[80px] rounded-xl border border-input bg-card px-3 py-2.5 text-sm text-foreground"
        />
        <View className="mt-2">
          <Btn
            label="Read this message"
            size="sm"
            variant="secondary"
            loading={parsing}
            icon={<Sparkles size={14} color={C.pine} />}
            onPress={runParse}
          />
        </View>

        {parsed ? (
          <View className="mt-3 rounded-xl border border-border bg-muted p-3">
            <Text
              className="text-xs font-semibold uppercase text-muted-foreground"
              style={{ letterSpacing: 0.6 }}
            >
              {parsedFor ? 'From' : 'Who sent this?'}
            </Text>
            <View className="mt-1.5 flex-row flex-wrap gap-1.5">
              {data.employees
                .filter((e) => e.active)
                .map((e) => (
                  <Pill
                    key={e.id}
                    label={e.name}
                    tone={parsedFor === e.id ? 'pine' : 'outline'}
                    onPress={() => setParsedFor(e.id)}
                  />
                ))}
            </View>
            <View className="mt-3 flex-row flex-wrap gap-1.5">
              {parsed.days.map((d) => (
                <View key={d.weekday} className="rounded-full bg-card px-2.5 py-1">
                  <Text className="text-[11px] font-semibold text-foreground">
                    {DAY_SHORT[d.weekday]}{' '}
                    {d.kind === 'any'
                      ? 'any time'
                      : d.kind === 'none'
                        ? 'not available'
                        : fmtRange(d.start_min, d.end_min)}
                  </Text>
                </View>
              ))}
            </View>
            {parsed.unclear ? (
              <Text className="mt-2 text-xs text-destructive">{parsed.unclear}</Text>
            ) : null}
            <View className="mt-3">
              <Btn
                label={parsedFor ? 'Looks right, save it' : 'Pick who sent this first'}
                size="sm"
                loading={busy}
                disabled={!parsedFor}
                icon={<Check size={14} color={C.cream} />}
                onPress={saveParsed}
              />
            </View>
          </View>
        ) : null}
      </Card>

      {message && parsed ? (
        <Text className="mt-2 text-xs text-muted-foreground">{message}</Text>
      ) : null}

      <Sheet
        visible={Boolean(deactivateTarget)}
        onClose={() => setDeactivateTarget(null)}
        title={`Deactivate ${deactivateTarget?.name ?? ''}?`}
      >
        <View className="gap-3 pb-4">
          <Text className="text-sm text-muted-foreground">
            They stop getting requests and reminders, and any shifts they have become gaps. You can
            reactivate them later.
          </Text>
          <Btn label="Deactivate" variant="danger" loading={busy} onPress={confirmDeactivate} />
          <Btn label="Cancel" variant="ghost" onPress={() => setDeactivateTarget(null)} />
        </View>
      </Sheet>

      <MemberSheet
        open={memberSheet.open}
        editing={memberSheet.editing}
        onClose={() => setMemberSheet({ open: false, editing: null })}
        onSaved={async (result) => {
          setMemberSheet({ open: false, editing: null });
          await data.reload();
          const emp = result?.invited;
          if (!emp) return;
          if (emp.email?.trim()) {
            toast(`Invite emailed to ${emp.name}. They join with code ${emp.invite_code}.`);
          } else {
            // No email to send it to: open the share sheet so it can go by text instead.
            // Waits for the sheet to finish closing, or iOS will not show the share sheet.
            setTimeout(() => void invite(emp), 450);
          }
        }}
      />

      <DaySheet
        target={daySheet}
        existing={
          daySheet
            ? ((availabilityByEmployee.get(daySheet.employee.id) ?? []).find(
                (a) => a.weekday === daySheet.weekday,
              ) ?? null)
            : null
        }
        weekLabel={fmtWeekLabel(weekStart)}
        onClose={() => setDaySheet(null)}
        onSave={saveDay}
      />
    </Screen>
  );
}

function MemberSheet({
  open,
  editing,
  onClose,
  onSaved,
}: {
  open: boolean;
  editing: Employee | null;
  onClose: () => void;
  onSaved: (result?: { invited?: Employee }) => Promise<void>;
}) {
  const { cafe } = useApp();
  const [resending, setResending] = useState(false);
  const [resent, setResent] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const emailRef = useRef<ElementRef<typeof TextInput>>(null);
  const phoneRef = useRef<ElementRef<typeof TextInput>>(null);
  const [roles, setRoles] = useState<string[]>(['barista']);
  const [solo, setSolo] = useState(false);
  const [rating, setRating] = useState(3);
  const [maxHours, setMaxHours] = useState('20');
  const [wage, setWage] = useState('15');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [loadedFor, setLoadedFor] = useState<string | null>(null);

  const key = editing?.id ?? 'new';
  if (open && loadedFor !== key) {
    setLoadedFor(key);
    setName(editing?.name ?? '');
    setEmail(editing?.email ?? '');
    setPhone(editing?.phone ?? '');
    setRoles(editing?.roles ?? ['barista']);
    setSolo(editing?.can_work_alone ?? false);
    setRating(editing?.rating ?? 3);
    setMaxHours(String(editing?.max_hours ?? 20));
    setWage(String(editing?.hourly_wage ?? 15));
    setError('');
    setResent('');
  }
  if (!open && loadedFor !== null) setLoadedFor(null);

  const emailAgain = async () => {
    if (!editing) return;
    setResending(true);
    try {
      const ok = await resendInvite(editing.id);
      setResent(ok ? `Invite emailed to ${editing.email}.` : 'Add an email address first.');
    } catch (e) {
      setResent(e instanceof Error ? e.message : 'Could not send the invite.');
    } finally {
      setResending(false);
    }
  };

  const save = async () => {
    if (!cafe) return;
    if (!name.trim()) {
      setError('Add a name.');
      return;
    }
    if (roles.length === 0) {
      setError('Pick at least one role.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const payload = {
        name: name.trim(),
        email: email.trim() || undefined,
        phone: phone.trim() || undefined,
        roles,
        canWorkAlone: solo,
        rating,
        // Whole hours between 1 and 80; wages accept "15,50" as well as "15.50".
        maxHours: Math.min(80, Math.max(1, Math.round(Number(maxHours)) || 20)),
        hourlyWage: Math.max(0, Number(wage.replace(',', '.').replace(/[^0-9.]/g, '')) || 0),
      };
      let invited: Employee | undefined;
      if (editing) {
        await updateEmployee(editing.id, {
          name: payload.name,
          email: payload.email ?? null,
          phone: payload.phone ?? null,
          roles: payload.roles,
          can_work_alone: payload.canWorkAlone,
          rating: payload.rating,
          max_hours: payload.maxHours,
          hourly_wage: payload.hourlyWage,
        });
        // A new email for someone who has not joined yet sends them the invite.
        const newEmail = (payload.email ?? '').toLowerCase();
        if (
          !editing.user_id &&
          newEmail &&
          newEmail !== (editing.email ?? '').trim().toLowerCase()
        ) {
          invited = {
            ...editing,
            name: payload.name,
            email: payload.email ?? null,
          };
        }
      } else {
        invited = await addEmployee({ cafeId: cafe.id, ...payload });
      }
      await onSaved({ invited });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet
      visible={open}
      onClose={onClose}
      title={editing ? `Edit ${editing.name}` : 'Add a team member'}
    >
      <View className="gap-3 pb-4">
        <TextInput
          value={name}
          onChangeText={setName}
          autoCapitalize="words"
          autoCorrect={false}
          textContentType="none"
          returnKeyType="next"
          blurOnSubmit={false}
          onSubmitEditing={() => emailRef.current?.focus()}
          placeholder="First name"
          placeholderTextColor={C.muted}
          className="rounded-xl border border-input bg-card px-3 py-3 text-base text-foreground"
        />
        <TextInput
          ref={emailRef}
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          autoCorrect={false}
          textContentType="none"
          returnKeyType="next"
          blurOnSubmit={false}
          onSubmitEditing={() => phoneRef.current?.focus()}
          keyboardType="email-address"
          placeholder="Email (their invite to join goes here)"
          placeholderTextColor={C.muted}
          className="rounded-xl border border-input bg-card px-3 py-3 text-base text-foreground"
        />
        <TextInput
          ref={phoneRef}
          value={phone}
          onChangeText={setPhone}
          textContentType="none"
          keyboardType="phone-pad"
          placeholder="Phone (optional)"
          placeholderTextColor={C.muted}
          className="rounded-xl border border-input bg-card px-3 py-3 text-base text-foreground"
        />

        <View className="flex-row flex-wrap gap-1.5">
          {ROLES.map((r) => {
            const on = roles.includes(r.key);
            return (
              <PressScale
                key={r.key}
                onPress={() =>
                  setRoles((prev) =>
                    prev.includes(r.key) ? prev.filter((x) => x !== r.key) : [...prev, r.key],
                  )
                }
                className={`rounded-full px-3 py-1.5 ${
                  on ? 'border border-primary bg-primary' : 'border border-border bg-card'
                }`}
              >
                <Text
                  className={`text-xs font-semibold ${
                    on ? 'text-primary-foreground' : 'text-muted-foreground'
                  }`}
                >
                  {r.label}
                </Text>
              </PressScale>
            );
          })}
          <PressScale
            onPress={() => setSolo((s) => !s)}
            className={`rounded-full px-3 py-1.5 ${
              solo ? 'bg-accent' : 'border border-border bg-card'
            }`}
          >
            <Text
              className={`text-xs font-semibold ${
                solo ? 'text-accent-foreground' : 'text-muted-foreground'
              }`}
            >
              Can work alone
            </Text>
          </PressScale>
        </View>

        <View className="flex-row items-center justify-between rounded-xl border border-border px-3 py-2.5">
          <Text className="text-sm text-foreground">Rating</Text>
          <View className="flex-row items-center gap-2">
            <PressScale
              onPress={() => setRating((r) => Math.max(1, r - 1))}
              className="h-7 w-7 items-center justify-center rounded-full border border-border"
            >
              <Minus size={12} color={C.pine} />
            </PressScale>
            <Stars value={rating} />
            <PressScale
              onPress={() => setRating((r) => Math.min(5, r + 1))}
              className="h-7 w-7 items-center justify-center rounded-full border border-border"
            >
              <Plus size={12} color={C.pine} />
            </PressScale>
          </View>
        </View>

        <View className="flex-row gap-2">
          <View className="flex-1 gap-1">
            <Text className="text-xs text-muted-foreground">Max hours / week</Text>
            <TextInput
              value={maxHours}
              onChangeText={setMaxHours}
              // iOS number pads have no Return key; this layout does, so the keyboard can close.
              keyboardType={Platform.OS === 'ios' ? 'numbers-and-punctuation' : 'number-pad'}
              returnKeyType="done"
              className="rounded-xl border border-input bg-card px-3 py-2.5 text-base text-foreground"
            />
          </View>
          <View className="flex-1 gap-1">
            <Text className="text-xs text-muted-foreground">Hourly wage</Text>
            <TextInput
              value={wage}
              onChangeText={setWage}
              keyboardType={Platform.OS === 'ios' ? 'numbers-and-punctuation' : 'decimal-pad'}
              returnKeyType="done"
              className="rounded-xl border border-input bg-card px-3 py-2.5 text-base text-foreground"
            />
          </View>
        </View>

        {editing?.invite_code ? (
          <View className="rounded-xl bg-muted p-3">
            <Text className="text-xs text-muted-foreground">Invite code</Text>
            <Text selectable className="text-lg font-bold tracking-widest text-foreground">
              {editing.invite_code}
            </Text>
            <Text className="mt-1 text-[11px] text-muted-foreground">
              {editing.user_id
                ? `${editing.name} has joined.`
                : `${editing.name} has not joined yet. They tap "Join with your invite code" in ShiftCup and enter this code.`}
            </Text>
            {!editing.user_id && editing.email ? (
              <View className="mt-2 gap-1">
                <Btn
                  label="Email the invite again"
                  variant="secondary"
                  size="sm"
                  loading={resending}
                  onPress={emailAgain}
                />
                {resent ? (
                  <Text className="text-[11px] text-muted-foreground">{resent}</Text>
                ) : null}
              </View>
            ) : null}
          </View>
        ) : null}

        {error ? <Text className="text-sm text-destructive">{error}</Text> : null}
        <Btn label={editing ? 'Save changes' : 'Add member'} loading={busy} onPress={save} />
      </View>
    </Sheet>
  );
}

function DaySheet({
  target,
  existing,
  weekLabel,
  onClose,
  onSave,
}: {
  target: { employee: Employee; weekday: number } | null;
  existing: Availability | null;
  weekLabel: string;
  onClose: () => void;
  onSave: (
    kind: 'any' | 'none' | 'window',
    startMin: number,
    endMin: number,
    scope: 'every' | 'week',
    allDays?: boolean,
  ) => Promise<void>;
}) {
  const [kind, setKind] = useState<'any' | 'none' | 'window'>('any');
  const [scope, setScope] = useState<'every' | 'week'>('every');
  const [start, setStart] = useState(660);
  const [end, setEnd] = useState(1320);
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const key = target ? `${target.employee.id}:${target.weekday}` : null;
  if (key && loadedFor !== key) {
    setLoadedFor(key);
    setKind(existing?.kind ?? 'any');
    setStart(existing?.start_min ?? 660);
    setEnd(existing?.end_min ?? 1320);
    // A day already changed for this week opens on "Only this week".
    setScope(existing && !existing.from_usual ? 'week' : 'every');
  }
  if (!key && loadedFor !== null) setLoadedFor(null);

  const options: { key: 'any' | 'window' | 'none'; label: string }[] = [
    { key: 'any', label: 'Any time' },
    { key: 'window', label: 'Certain hours' },
    { key: 'none', label: 'Not available' },
  ];

  return (
    <Sheet
      visible={Boolean(target)}
      onClose={onClose}
      title={target ? `${target.employee.name} · ${DAY_SHORT[target.weekday]}` : 'Availability'}
    >
      <View className="gap-3 pb-4">
        <Segmented
          options={[
            { value: 'every', label: 'Every week' },
            { value: 'week', label: `Only ${weekLabel}` },
          ]}
          value={scope}
          onChange={setScope}
        />
        <Text className="text-xs text-muted-foreground">
          {scope === 'every'
            ? `Their usual ${target ? DAY_LONG[target.weekday] : 'day'}. Drafts use it every week unless you change a single week.`
            : `Just for ${weekLabel}. Their usual week stays the same.`}
        </Text>
        <View className="flex-row gap-1.5">
          {options.map((o) => (
            <PressScale
              key={o.key}
              onPress={() => setKind(o.key)}
              className={`flex-1 items-center rounded-xl py-2.5 ${
                kind === o.key ? 'border border-primary bg-primary' : 'border border-border bg-card'
              }`}
            >
              <Text
                className={`text-xs font-semibold ${
                  kind === o.key ? 'text-primary-foreground' : 'text-foreground'
                }`}
              >
                {o.label}
              </Text>
            </PressScale>
          ))}
        </View>
        {kind === 'window' ? (
          <View className="flex-row gap-2">
            <View className="flex-1">
              <TimeField label="From" value={start} onChange={setStart} />
            </View>
            <View className="flex-1">
              <TimeField label="To" value={end} onChange={setEnd} />
            </View>
          </View>
        ) : null}
        <Btn
          label="Save this day"
          loading={busy}
          onPress={async () => {
            setBusy(true);
            await onSave(kind, start, end, scope);
            setBusy(false);
          }}
        />
        <Btn
          label="Save for all 7 days"
          variant="ghost"
          loading={busy}
          onPress={async () => {
            setBusy(true);
            await onSave(kind, start, end, scope, true);
            setBusy(false);
          }}
        />
      </View>
    </Sheet>
  );
}
