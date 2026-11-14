import { useRouter } from 'expo-router';
import { AlertTriangle, ArrowRight, Bell, CalendarCheck, Clock, Users } from 'lucide-react-native';
import { useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';

import { ChangeRequests } from '@/components/ChangeRequests';
import { AppBar, Btn, Card, Notice, PressScale, Screen, SectionTitle } from '@/components/kit';
import { planningWeekStart, publishWeek, saveAssignments, sendWeeklyRequest } from '@/lib/api';
import { useApp } from '@/lib/app-context';
import { isReachable } from '@/lib/invite';
import { C } from '@/lib/colors';
import { DAY_SHORT, fmtHours, fmtMoney, fmtWeekLabel } from '@/lib/dates';
import { fillOpenSlots } from '@/lib/scheduling';
import type { Assignment, CafeSettings } from '@/lib/types';
import { useWeekData } from '@/lib/useWeek';
import { changedSincePublish as changedSincePublish_ } from '@/lib/utils';

const STEPS = ['Availability', 'Draft', 'Fix gaps', 'Publish'];

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
  // People with a usual week can be scheduled without asking them first.
  const noUsual = activeEmployees.filter((e) => !Array.isArray(e.usual_week));
  const anyUsual = noUsual.length < activeEmployees.length;
  const hasDraft = filledCount > 0;
  const issueCount = data.gaps.length + data.clashes.length;

  const changedSincePublish =
    Boolean(data.published) && changedSincePublish_(data.published?.snapshot, data.assignments);

  let step = 0;
  if (hasRequest || anyUsual) step = 1;
  if (hasDraft) step = 2;
  if (hasDraft && issueCount === 0) step = 3;
  // A published week stays published, even if the manager accepted some gaps.
  if (data.published) step = changedSincePublish ? 3 : 4;

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
      const notJoined = activeEmployees.filter((e) => !isReachable(e));
      setMessage(
        notJoined.length === 0
          ? 'Request sent. Your team can answer now.'
          : `Request saved. ${notJoined.map((e) => e.name).join(', ')} ${
              notJoined.length === 1 ? 'has' : 'have'
            } not joined yet. Share their invites from the Team tab.`,
      );
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
      const working = activeEmployees.filter((e) =>
        data.assignments.some((a) => a.employee_id === e.id),
      );
      const unreachable = working.filter((e) => !isReachable(e));
      setMessage(
        unreachable.length === 0
          ? 'Published. Everyone working got their schedule by email and can see it in the app.'
          : `Published. ${unreachable.map((e) => e.name).join(', ')} ${
              unreachable.length === 1 ? 'has' : 'have'
            } not joined, so share the schedule with them from the Schedule tab.`,
      );
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
    if (step === 0) return router.push('/(app)/(manager)/team');
    if (step === 1) return runDraft();
    if (step === 2) return router.push('/(app)/(manager)/schedule');
    if (step === 3) return runPublish();
    return router.push('/(app)/(manager)/schedule');
  };

  const nextLabel = !hasAccess
    ? 'Subscribe to keep scheduling'
    : step === 0
      ? 'Set usual weeks in Team'
      : step === 1
        ? 'Build the draft'
        : step === 2
          ? 'Fix the gaps'
          : step === 3
            ? changedSincePublish
              ? 'Publish changes'
              : 'Approve and publish'
            : 'View the published week';

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
                <Btn
                  label="Subscribe"
                  size="sm"
                  full={false}
                  onPress={() => router.push('/(app)/billing')}
                />
              </View>
            }
          />
        </View>
      ) : null}

      {cafe && !isSample && cafe.subscription_status === 'trial' && hasAccess ? (
        <View className="mb-3 flex-row items-center gap-2 rounded-xl bg-card px-4 py-2.5">
          <Clock size={14} color={C.pine} />
          <Text className="flex-1 text-xs font-semibold text-foreground">
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
            ? 'Set when each person can usually work, and ShiftCup drafts every week from that. Or ask your team for next week.'
            : step === 1 && !hasRequest
              ? noUsual.length === 0
                ? 'Drafts use everyone’s usual week. Build it, adjust, then publish to send everyone their shifts.'
                : `Drafts use each person’s usual week. ${noUsual.map((e) => e.name).join(', ')} ${
                    noUsual.length === 1 ? 'has' : 'have'
                  } none yet, so they will not be scheduled.`
              : step === 1
                ? waiting.length === 0
                  ? 'Everyone answered. Build the draft and ShiftCup fills what it can.'
                  : `${waiting.length} still ${waiting.length === 1 ? 'has' : 'have'} not answered. You can build the draft now and fill them in later.`
                : step === 2
                  ? `${issueCount} ${issueCount === 1 ? 'thing needs' : 'things need'} a decision before you publish.`
                  : step === 3
                    ? changedSincePublish
                      ? 'You changed the week after publishing. Publish again so your team sees it.'
                      : 'No gaps and no clashes. Publish when you are ready.'
                    : data.gaps.length > 0
                      ? `Published. Your team has their shifts. ${data.gaps.length} ${
                          data.gaps.length === 1 ? 'slot is' : 'slots are'
                        } still open.`
                      : 'Published. Your team has their shifts.'}
        </Text>
        <Btn label={nextLabel} loading={busy} onPress={nextAction} />
        {hasAccess && !hasRequest && step <= 1 ? (
          <View className="mt-2">
            <Btn
              label="Ask my team for next week"
              variant="ghost"
              loading={busy}
              onPress={runSendRequest}
            />
          </View>
        ) : null}
        {message ? <Text className="mt-2 text-xs text-muted-foreground">{message}</Text> : null}
      </Card>

      {data.changeRequests.length > 0 ? (
        <>
          <SectionTitle>
            {data.changeRequests.length === 1
              ? '1 request from your team'
              : `${data.changeRequests.length} requests from your team`}
          </SectionTitle>
          <ChangeRequests
            requests={data.changeRequests}
            employees={data.employees}
            channel={settings.channel}
            onDecided={async (text) => {
              await data.reload();
              setMessage(text);
            }}
          />
        </>
      ) : null}

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
          title={hasRequest ? 'Have not answered' : 'No availability yet'}
          value={waiting.length}
          detail={
            waiting.length === 0
              ? hasRequest
                ? 'Everyone has replied.'
                : 'Everyone has a usual week.'
              : hasRequest
                ? waiting.map((e) => e.name).join(', ')
                : `Set a usual week for ${waiting.map((e) => e.name).join(', ')} in Team.`
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

      {data.error ? <Text className="mt-4 text-sm text-destructive">{data.error}</Text> : null}
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
