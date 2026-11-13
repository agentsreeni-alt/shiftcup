import { useFocusEffect, useRouter } from 'expo-router';
import { Bell, CalendarX, Clock } from 'lucide-react-native';
import { useCallback, useState } from 'react';
import { Text, View } from 'react-native';

import { AppBar, Btn, Card, EmptyState, Notice, PressScale, Screen, SectionTitle, Sheet } from '@/components/kit';
import {
  loadMyRequestStatus,
  planningWeekStart,
  createCoverRequest,
  currentWeekStart,
  loadMyAssignments,
  loadMyCoverRequests,
  loadMyReminders,
  loadMySettings,
  weekStartFromOffset,
} from '@/lib/api';
import { useApp } from '@/lib/app-context';
import { C, SLOT_COLORS } from '@/lib/colors';
import {
  DAY_LONG,
  dateAtMinutes,
  dateForWeekday,
  fmtDayDate,
  fmtRange,
  fmtTime,
  fmtWeekLabel,
} from '@/lib/dates';
import { leadLabel } from '@/lib/reminders';
import type { Assignment, CafeSettings, CoverRequest, Reminder } from '@/lib/types';

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
    if (last && last.weekday === r.weekday && last.slot === r.slot && last.end_min === r.start_min) {
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

export default function MyShiftsScreen() {
  const { cafeName, employee } = useApp();
  const [thisWeek, setThisWeek] = useState<Assignment[]>([]);
  const [nextWeek, setNextWeek] = useState<Assignment[]>([]);
  const [covers, setCovers] = useState<CoverRequest[]>([]);
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [settings, setSettings] = useState<CafeSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [confirm, setConfirm] = useState<Shift | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [needsAvailability, setNeedsAvailability] = useState(false);
  const router = useRouter();

  const load = useCallback(async () => {
    try {
      const [a, b, c, r, s, req] = await Promise.all([
        loadMyAssignments(currentWeekStart()),
        loadMyAssignments(weekStartFromOffset(1)),
        loadMyCoverRequests(),
        loadMyReminders(),
        loadMySettings(),
        loadMyRequestStatus(planningWeekStart()),
      ]);
      setNeedsAvailability(Boolean(req.request) && req.status?.status === 'waiting');
      setThisWeek(a);
      setNextWeek(b);
      setCovers(c);
      setReminders(r);
      setSettings(s);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Could not load your shifts. Check your connection.');
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const askCover = async () => {
    if (!confirm || !employee) return;
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
        });
      }
      await load();
      setConfirm(null);
      setMessage('Your manager has been told. Keep an eye on your shifts.');
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Could not send that request.');
    } finally {
      setBusy(false);
    }
  };

  const renderWeek = (label: string, weekStart: string, rows: Assignment[], isCurrent: boolean) => (
    <View className="gap-2">
      <SectionTitle>{label}</SectionTitle>
      {rows.length === 0 ? (
        <Text className="text-sm text-muted-foreground">
          {isCurrent
            ? 'No shifts for you this week.'
            : `Nothing scheduled yet. Your manager publishes on ${DAY_LONG[settings?.publish_weekday ?? 4]}.`}
        </Text>
      ) : (
        toShifts(rows).map((a) => {
          const colors = SLOT_COLORS[a.slot];
          const covered = covers.some((c) => a.ids.includes(c.assignment_id));
          const past = dateAtMinutes(dateForWeekday(weekStart, a.weekday), a.end_min) < new Date();
          return (
            <View
              key={a.key}
              style={{ backgroundColor: colors.bg, borderColor: colors.line, borderWidth: 1 }}
              className="rounded-2xl p-4"
            >
              <View className="flex-row items-start justify-between">
                <View className="flex-1">
                  <Text className="text-xs font-semibold uppercase tracking-wide" style={{ color: colors.ink }}>
                    {a.slot}
                  </Text>
                  <Text className="mt-0.5 text-base font-bold text-foreground">
                    {DAY_LONG[a.weekday]} · {fmtDayDate(weekStart, a.weekday).replace(/^\w{3} /, '')}
                  </Text>
                  <Text className="text-sm text-foreground">{fmtRange(a.start_min, a.end_min)}</Text>
                </View>
                {past ? (
                  <Text className="text-[11px] font-semibold uppercase text-muted-foreground">
                    Done
                  </Text>
                ) : covered ? (
                  <Text className="text-[11px] font-bold uppercase text-destructive">
                    Cover asked
                  </Text>
                ) : (
                  <PressScale
                    onPress={() => setConfirm(a)}
                    className="rounded-lg bg-card px-3 py-1.5"
                  >
                    <Text className="text-[11px] font-semibold text-destructive">
                      I can&apos;t make it
                    </Text>
                  </PressScale>
                )}
              </View>
            </View>
          );
        })
      )}
    </View>
  );

  const nextReminder = reminders[0];

  return (
    <Screen>
      <AppBar title="My shifts" subtitle={cafeName ?? ''} />

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
              For next week · due {DAY_LONG[settings?.due_weekday ?? 2]} at{' '}
              {fmtTime(settings?.due_min ?? 1200)}
            </Text>
          </View>
          <Text className="text-xs font-semibold text-primary-foreground">Send →</Text>
        </PressScale>
      ) : null}

      {nextReminder ? (
        <View className="mb-3 flex-row items-center gap-2 rounded-xl bg-card px-4 py-2.5">
          <Bell size={14} color={C.pine} />
          <Text className="flex-1 text-xs text-muted-foreground">
            Next reminder: {nextReminder.body}
          </Text>
        </View>
      ) : null}

      {message ? <Text className="mb-3 text-xs text-muted-foreground">{message}</Text> : null}

      {loading ? (
        <Text className="text-sm text-muted-foreground">Loading your week…</Text>
      ) : thisWeek.length === 0 && nextWeek.length === 0 ? (
        <EmptyState
          icon={<CalendarX size={28} color={C.pine} />}
          title="No shifts yet"
          body="When your manager publishes the week, your shifts show up here."
        />
      ) : (
        <View className="gap-5">
          {renderWeek(`This week · ${fmtWeekLabel(currentWeekStart())}`, currentWeekStart(), thisWeek, true)}
          {renderWeek(`Next week · ${fmtWeekLabel(weekStartFromOffset(1))}`, weekStartFromOffset(1), nextWeek, false)}
        </View>
      )}

      <Sheet visible={Boolean(confirm)} onClose={() => setConfirm(null)} title="Can't make this shift?">
        <View className="gap-3 pb-4">
          {confirm ? (
            <Card>
              <Text className="text-sm font-semibold text-foreground">
                {DAY_LONG[confirm.weekday]} · {fmtRange(confirm.start_min, confirm.end_min)}
              </Text>
              <Text className="text-xs text-muted-foreground">{confirm.slot}</Text>
            </Card>
          ) : null}
          <Text className="text-sm text-muted-foreground">
            Your manager will see this shift as a gap and find someone else. You stay on it until
            they change it.
          </Text>
          <Btn label="Tell my manager" variant="danger" loading={busy} onPress={askCover} />
          <Btn label="Never mind" variant="ghost" onPress={() => setConfirm(null)} />
        </View>
      </Sheet>

      <Notice
        tone="info"
        title="Reminders"
        body={`Evening before at ${fmtTime(settings?.evening_reminder_min ?? 1080)}, and ${leadLabel(settings?.second_reminder_min ?? 60)} before your shift.`}
      />
    </Screen>
  );
}
