import { useFocusEffect } from 'expo-router';
import { Bell, CalendarX } from 'lucide-react-native';
import { useCallback, useState } from 'react';
import { Text, View } from 'react-native';

import { AppBar, Btn, Card, EmptyState, Notice, PressScale, Screen, SectionTitle, Sheet } from '@/components/kit';
import {
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
import { DAY_LONG, fmtDayDate, fmtRange, fmtTime, fmtWeekLabel } from '@/lib/dates';
import type { Assignment, CafeSettings, CoverRequest, Reminder } from '@/lib/types';

export default function MyShiftsScreen() {
  const { cafeName, employee } = useApp();
  const [thisWeek, setThisWeek] = useState<Assignment[]>([]);
  const [nextWeek, setNextWeek] = useState<Assignment[]>([]);
  const [covers, setCovers] = useState<CoverRequest[]>([]);
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [settings, setSettings] = useState<CafeSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [confirm, setConfirm] = useState<Assignment | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  const load = useCallback(async () => {
    try {
      const [a, b, c, r, s] = await Promise.all([
        loadMyAssignments(currentWeekStart()),
        loadMyAssignments(weekStartFromOffset(1)),
        loadMyCoverRequests(),
        loadMyReminders(),
        loadMySettings(),
      ]);
      setThisWeek(a);
      setNextWeek(b);
      setCovers(c);
      setReminders(r);
      setSettings(s);
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
      await createCoverRequest({
        cafeId: confirm.cafe_id,
        assignmentId: confirm.id ?? '',
        employeeId: employee.id,
        weekStart: confirm.week_start,
        weekday: confirm.weekday,
      });
      await load();
      setConfirm(null);
      setMessage('Your manager has been told. Keep an eye on your shifts.');
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Could not send that request.');
    } finally {
      setBusy(false);
    }
  };

  const renderWeek = (label: string, weekStart: string, rows: Assignment[]) => (
    <View className="gap-2">
      <SectionTitle>{label}</SectionTitle>
      {rows.length === 0 ? (
        <Text className="text-sm text-muted-foreground">
          Nothing scheduled yet. Your manager publishes on{' '}
          {DAY_LONG[settings?.publish_weekday ?? 4]}.
        </Text>
      ) : (
        rows.map((a) => {
          const colors = SLOT_COLORS[a.slot];
          const covered = covers.some((c) => c.assignment_id === a.id);
          return (
            <View
              key={a.id ?? `${a.weekday}-${a.start_min}`}
              style={{ backgroundColor: colors.bg, borderColor: colors.line, borderWidth: 1 }}
              className="rounded-2xl p-4"
            >
              <View className="flex-row items-start justify-between">
                <View className="flex-1">
                  <Text className="text-xs font-semibold uppercase tracking-wide" style={{ color: colors.ink }}>
                    {a.slot}
                  </Text>
                  <Text className="mt-0.5 text-base font-bold text-foreground">
                    {DAY_LONG[a.weekday]} · {fmtDayDate(weekStart, a.weekday)}
                  </Text>
                  <Text className="text-sm text-foreground">{fmtRange(a.start_min, a.end_min)}</Text>
                </View>
                {covered ? (
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

      {nextReminder ? (
        <View className="mb-3 flex-row items-center gap-2 rounded-xl bg-card px-4 py-2.5">
          <Bell size={14} color={C.pine} />
          <Text className="flex-1 text-xs text-muted-foreground">
            Next reminder: {nextReminder.body}
          </Text>
        </View>
      ) : (
        <View className="mb-3 flex-row items-center gap-2 rounded-xl bg-card px-4 py-2.5">
          <Bell size={14} color={C.pine} />
          <Text className="flex-1 text-xs text-muted-foreground">
            We remind you the evening before and one hour before each shift.
          </Text>
        </View>
      )}

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
          {renderWeek(`This week · ${fmtWeekLabel(currentWeekStart())}`, currentWeekStart(), thisWeek)}
          {renderWeek(`Next week · ${fmtWeekLabel(weekStartFromOffset(1))}`, weekStartFromOffset(1), nextWeek)}
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
        body={`Evening before at ${fmtTime(settings?.evening_reminder_min ?? 1080)}, and ${
          (settings?.second_reminder_min ?? 60) >= 60
            ? `${Math.round((settings?.second_reminder_min ?? 60) / 60)} hour before`
            : `${settings?.second_reminder_min ?? 60} minutes before`
        } your shift.`}
      />
    </Screen>
  );
}
