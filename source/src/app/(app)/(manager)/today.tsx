import { useRouter } from 'expo-router';
import { AlertTriangle, ArrowRight, Bell, CalendarCheck, Clock, Users } from 'lucide-react-native';
import { useState } from 'react';
import { Text, View } from 'react-native';

import { AppBar, Btn, Card, Notice, PressScale, Screen, SectionTitle } from '@/components/kit';
import {
  planningWeekStart,
  publishWeek,
  saveAssignments,
  sendWeeklyRequest,
} from '@/lib/api';
import { useApp } from '@/lib/app-context';
import { C } from '@/lib/colors';
import { DAY_SHORT, fmtHours, fmtMoney, fmtWeekLabel } from '@/lib/dates';
import { fillOpenSlots } from '@/lib/scheduling';
import type { Assignment, CafeSettings } from '@/lib/types';
import { useWeekData } from '@/lib/useWeek';

const STEPS = ['Ask', 'Draft', 'Fix gaps', 'Publish'];

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

export default function TodayScreen() {
  const router = useRouter();
  const { cafe, cafeName, isSample, hasAccess, trialDaysLeft } = useApp();
  const weekStart = planningWeekStart();
  const data = useWeekData(weekStart);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  const settings = data.settings ?? FALLBACK_SETTINGS;
  const activeEmployees = data.employees.filter((e) => e.active);
  const waiting = data.employees.filter(
    (e) => e.active && (data.engine.statuses[e.id] ?? 'waiting') === 'waiting',
  );
  // One entry per person per day: a long shift can span several blocks.
  const coverDays = [
    ...new Map(
      data.coverRequests
        .filter((c) => c.week_start === weekStart)
        .map((c) => [
          `${c.employee_id}:${c.weekday}`,
          {
            name: data.employees.find((e) => e.id === c.employee_id)?.name ?? 'Someone',
            weekday: c.weekday,
          },
        ]),
    ).values(),
  ];
  const filledCount = data.assignments.filter((a) => a.employee_id).length;
  const hasRequest = Boolean(data.request);
  const hasDraft = filledCount > 0;
  const issueCount = data.gaps.length + data.clashes.length;

  let step = 0;
  if (hasRequest) step = 1;
  if (hasDraft) step = 2;
  if (hasDraft && issueCount === 0) step = 3;
  if (data.published && issueCount === 0) step = 4;

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

  const runSendRequest = async () => {
    if (!cafe) return;
    setBusy(true);
    setMessage('');
    try {
      await sendWeeklyRequest({
        cafeId: cafe.id,
        weekStart,
        employeeIds: activeEmployees.map((e) => e.id),
        settings,
      });
      await data.reload();
      setMessage('Request sent. Your team can answer now.');
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Could not send the request.');
    } finally {
      setBusy(false);
    }
  };

  const runDraft = async () => {
    if (!cafe) return;
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
      await saveAssignments(cafe.id, weekStart, toRows(filled));
      await data.reload();
      setMessage('Draft built. Check the gaps below.');
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Could not build the draft.');
    } finally {
      setBusy(false);
    }
  };

  const runPublish = async () => {
    if (!cafe) return;
    setBusy(true);
    setMessage('');
    try {
      await publishWeek({
        cafeId: cafe.id,
        weekStart,
        assignments: data.assignments,
        employeeIds: activeEmployees.map((e) => e.id),
        settings,
      });
      await data.reload();
      setMessage('Published. Your team has their shifts and reminders.');
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Could not publish.');
    } finally {
      setBusy(false);
    }
  };

  const nextAction = () => {
    if (!hasAccess) {
      router.push('/(app)/billing');
      return;
    }
    if (step === 0) return runSendRequest();
    if (step === 1) return runDraft();
    if (step === 2) return router.push('/(app)/(manager)/schedule');
    if (step === 3) return runPublish();
    return router.push('/(app)/(manager)/schedule');
  };

  const nextLabel = !hasAccess
    ? 'Subscribe to keep scheduling'
    : step === 0
      ? 'Send the availability request'
      : step === 1
        ? 'Build the draft'
        : step === 2
          ? 'Fix the gaps'
          : step === 3
            ? 'Approve and publish'
            : 'View the published week';

  return (
    <Screen>
      <AppBar
        title={cafeName || 'Your café'}
        subtitle={`Planning next week · ${fmtWeekLabel(weekStart)}`}
      />

      {isSample ? (
        <View className="mb-3 rounded-xl bg-accent px-4 py-2.5">
          <Text className="text-xs font-semibold text-accent-foreground">
            You are exploring a sample café
          </Text>
        </View>
      ) : null}

      {!hasAccess ? (
        <View className="mb-3">
          <Notice
            tone="danger"
            title="Your plan has ended"
            body="You can still see the schedule and pay. Building, publishing and reminders are paused."
            action={
              <View className="mt-2">
                <Btn label="Subscribe" size="sm" full={false} onPress={() => router.push('/(app)/billing')} />
              </View>
            }
          />
        </View>
      ) : null}

      {cafe && !isSample && cafe.subscription_status === 'trial' && hasAccess ? (
        <View className="mb-3 flex-row items-center gap-2 rounded-xl bg-card px-4 py-2.5">
          <Clock size={14} color={C.pine} />
          <Text className="text-xs font-semibold text-foreground">
            Free trial: {trialDaysLeft} {trialDaysLeft === 1 ? 'day' : 'days'} left
          </Text>
        </View>
      ) : null}

      <Card>
        <View className="mb-3 flex-row items-center justify-between">
          <Text className="text-base font-semibold text-foreground">Next week</Text>
          <Text className="text-xs font-semibold text-muted-foreground">
            {step >= 4 ? 'Published' : `Step ${Math.min(step + 1, 4)} of 4`}
          </Text>
        </View>
        <View className="mb-3 flex-row gap-1.5">
          {STEPS.map((s, i) => (
            <View key={s} className="flex-1 gap-1">
              <View
                className={`h-1.5 rounded-full ${
                  i < step || step >= 4 ? 'bg-primary' : i === step ? 'bg-accent' : 'bg-border'
                }`}
              />
              <Text
                className={`text-[10px] font-semibold ${
                  i <= step ? 'text-foreground' : 'text-muted-foreground'
                }`}
              >
                {s}
              </Text>
            </View>
          ))}
        </View>
        <Text className="mb-3 text-sm text-muted-foreground">
          {step === 0
            ? 'Ask your team when they can work next week.'
            : step === 1
              ? waiting.length === 0
                ? 'Everyone answered. Build the draft and ShiftCup fills what it can.'
                : `${waiting.length} still ${waiting.length === 1 ? 'has' : 'have'} not answered. You can build the draft now and fill them in later.`
              : step === 2
                ? `${issueCount} ${issueCount === 1 ? 'thing needs' : 'things need'} a decision before you publish.`
                : step === 3
                  ? 'No gaps and no clashes. Publish when you are ready.'
                  : 'Published. Your team has their shifts.'}
        </Text>
        <Btn label={nextLabel} loading={busy} onPress={nextAction} />
        {message ? (
          <Text className="mt-2 text-xs text-muted-foreground">{message}</Text>
        ) : null}
      </Card>

      <SectionTitle>Needs attention</SectionTitle>
      <View className="gap-2">
        <AttentionRow
          icon={<Bell size={16} color={C.red} />}
          title="Cover requests"
          value={coverDays.length}
          detail={
            coverDays.length === 0
              ? 'Nobody has asked for cover.'
              : coverDays.map((c) => `${c.name} (${DAY_SHORT[c.weekday]})`).join(', ')
          }
          onPress={() => router.push('/(app)/(manager)/schedule')}
        />
        <AttentionRow
          icon={<Users size={16} color={C.pine} />}
          title={hasRequest ? 'Have not answered' : 'Not asked yet'}
          value={waiting.length}
          detail={
            waiting.length === 0
              ? 'Everyone has replied.'
              : hasRequest
                ? waiting.map((e) => e.name).join(', ')
                : `Send the request to ask ${waiting.map((e) => e.name).join(', ')}.`
          }
          onPress={() => router.push('/(app)/(manager)/team')}
        />
        <AttentionRow
          icon={<AlertTriangle size={16} color={C.red} />}
          title="Gaps"
          value={data.gaps.length}
          detail={
            data.gaps.length === 0
              ? 'Every slot is covered.'
              : data.gaps
                  .slice(0, 3)
                  .map((g) => g.label)
                  .join(' · ')
          }
          onPress={() => router.push('/(app)/(manager)/schedule')}
        />
        <AttentionRow
          icon={<AlertTriangle size={16} color={C.red} />}
          title="Clashes"
          value={data.clashes.length}
          detail={
            data.clashes.length === 0
              ? 'Nobody lost their eligibility.'
              : data.clashes
                  .slice(0, 3)
                  .map((c) => `${c.employeeName}: ${c.reason}`)
                  .join(' · ')
          }
          onPress={() => router.push('/(app)/(manager)/schedule')}
        />
      </View>

      <SectionTitle>Next week at a glance</SectionTitle>
      <View className="flex-row gap-2">
        <View className="flex-1 rounded-2xl border border-border/60 bg-card shadow-card p-4">
          <CalendarCheck size={16} color={C.pine} />
          <Text className="mt-2 text-2xl font-bold text-foreground">
            {fmtHours(data.totalMinutes)}
          </Text>
          <Text className="text-xs text-muted-foreground">Scheduled hours</Text>
        </View>
        <View className="flex-1 rounded-2xl border border-border/60 bg-card shadow-card p-4">
          <Clock size={16} color={C.pine} />
          <Text className="mt-2 text-2xl font-bold text-foreground">
            {fmtMoney(data.totalWages)}
          </Text>
          <Text className="text-xs text-muted-foreground">Wages for the week</Text>
        </View>
      </View>

      {data.error ? (
        <Text className="mt-4 text-sm text-destructive">{data.error}</Text>
      ) : null}
    </Screen>
  );
}

function AttentionRow({
  icon,
  title,
  value,
  detail,
  onPress,
}: {
  icon: React.ReactNode;
  title: string;
  value: number;
  detail: string;
  onPress: () => void;
}) {
  const clear = value === 0;
  return (
    <PressScale
      onPress={onPress}
      className="flex-row items-center gap-3 rounded-2xl border border-border/60 bg-card shadow-card px-4 py-3"
    >
      <View
        className="h-9 w-9 items-center justify-center rounded-full"
        style={{ backgroundColor: clear ? C.solo : C.redSoft }}
      >
        {icon}
      </View>
      <View className="flex-1">
        <Text className="text-sm font-semibold text-foreground">{title}</Text>
        <Text className="text-xs text-muted-foreground" numberOfLines={2}>
          {detail}
        </Text>
      </View>
      <View className="flex-row items-center gap-1">
        <Text
          className={`text-base font-bold ${clear ? 'text-muted-foreground' : 'text-destructive'}`}
        >
          {value}
        </Text>
        <ArrowRight size={14} color={C.muted} />
      </View>
    </PressScale>
  );
}
