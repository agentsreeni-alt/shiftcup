import { useRouter } from 'expo-router';
import {
  AlertTriangle,
  ArrowRight,
  Bell,
  CalendarCheck,
  Check,
  CheckCircle2,
  ChevronRight,
  Send,
  Sparkles,
  Users,
  Wallet,
} from 'lucide-react-native';
import { useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';

import { ChangeRequests } from '@/components/ChangeRequests';
import {
  AppBar,
  Appear,
  AvatarStack,
  Btn,
  Notice,
  PressScale,
  Screen,
  SectionTitle,
  toast,
} from '@/components/kit';
import { planningWeekStart, publishWeek, saveAssignments, sendWeeklyRequest } from '@/lib/api';
import { useApp } from '@/lib/app-context';
import { isReachable } from '@/lib/invite';
import { C } from '@/lib/colors';
import { cardShadow } from '@/lib/motion';
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
            note: c.note?.trim() || null,
          },
        ]),
    ).values(),
  ];
  // Before a draft exists every slot is open; that is the next step, not a problem.
  const openSlots = data.assignments.some((a) => a.employee_id) ? data.gaps.length : 0;
  const attentionCount = coverDays.length + waiting.length + openSlots + data.clashes.length;
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

  const now = new Date();
  const hour = now.getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const dateLine = now.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
  const readyCount = activeEmployees.length - waiting.length;
  const headline =
    step === 0
      ? 'Set up how your week runs'
      : step === 1
        ? 'Ready to draft'
        : step === 2
          ? `${issueCount} ${issueCount === 1 ? 'decision' : 'decisions'} left`
          : step === 3
            ? changedSincePublish
              ? 'Changes to send'
              : 'Ready to publish'
            : 'Week published';

  return (
    <Screen onRefresh={data.reload}>
      <AppBar
        eyebrow={`${greeting} · ${dateLine}`}
        title={cafeName || 'Your café'}
        right={
          cafe && !isSample && cafe.subscription_status === 'trial' && hasAccess ? (
            <PressScale
              onPress={() => router.push('/(app)/billing')}
              accessibilityLabel={`Free trial, ${trialDaysLeft} days left. View plans`}
              className="mt-1 flex-row items-center gap-1.5 rounded-full bg-card px-3 py-1.5"
              style={cardShadow}
            >
              <Sparkles size={13} color={C.pine} />
              <Text className="text-xs font-semibold text-foreground">
                Trial · {trialDaysLeft} {trialDaysLeft === 1 ? 'day' : 'days'}
              </Text>
            </PressScale>
          ) : undefined
        }
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

      {/* Hero: where next week stands and the one thing to do next. */}
      <Appear index={0}>
        <View
          className="overflow-hidden rounded-[24px] p-5"
          style={[
            { backgroundColor: C.pine, borderCurve: 'continuous' },
            { boxShadow: '0 18px 40px -18px rgba(20, 56, 44, 0.55)' },
          ]}
        >
          {/* Soft glow in the corner gives the card depth without an image. */}
          <View
            pointerEvents="none"
            style={{
              position: 'absolute',
              right: -60,
              top: -80,
              width: 220,
              height: 220,
              borderRadius: 110,
              backgroundColor: C.pistachio,
              opacity: 0.12,
            }}
          />
          <View className="flex-row items-center justify-between">
            <Text
              className="text-[11px] font-semibold uppercase"
              style={{ color: C.pistachio, letterSpacing: 0.8 }}
            >
              Next week · {fmtWeekLabel(weekStart)}
            </Text>
            <Text className="text-xs font-semibold" style={{ color: 'rgba(242,245,236,0.6)' }}>
              {step >= 4 ? 'Done' : `Step ${Math.min(step + 1, 4)} of 4`}
            </Text>
          </View>
          <Text
            className="mt-2 text-[26px] font-bold leading-[31px]"
            style={{ color: C.cream, letterSpacing: -0.6 }}
          >
            {headline}
          </Text>

          <StepTrack step={step} />

          <Text className="mb-4 text-sm leading-5" style={{ color: 'rgba(242,245,236,0.78)' }}>
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
                    ? 'Open slots or clashes need a decision before you publish.'
                    : step === 3
                      ? changedSincePublish
                        ? 'You changed the week after publishing. Publish again so your team sees it.'
                        : 'No gaps and no clashes. Publish when you are ready.'
                      : data.gaps.length > 0
                        ? `Your team has their shifts. ${data.gaps.length} ${
                            data.gaps.length === 1 ? 'slot is' : 'slots are'
                          } still open.`
                        : 'Your team has their shifts by email and in the app.'}
          </Text>
          <Btn
            label={nextLabel}
            variant="accent"
            size="lg"
            loading={busy}
            onPress={nextAction}
            icon={busy ? undefined : <ArrowRight size={18} color={C.pine} />}
          />
          {hasAccess && !hasRequest && step <= 1 ? (
            <PressScale
              onPress={runSendRequest}
              disabled={busy}
              className="mt-2 flex-row items-center justify-center gap-2 rounded-xl py-3"
            >
              <Send size={15} color={C.cream} />
              <Text className="text-sm font-semibold" style={{ color: C.cream }}>
                Ask my team for next week
              </Text>
            </PressScale>
          ) : null}
          {message ? (
            <Text className="mt-2 text-xs" style={{ color: 'rgba(242,245,236,0.8)' }}>
              {message}
            </Text>
          ) : null}
        </View>
      </Appear>

      {data.changeRequests.length > 0 ? (
        <Appear index={1}>
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
              toast(text);
            }}
          />
        </Appear>
      ) : null}

      <Appear index={2}>
        <SectionTitle>Needs attention</SectionTitle>
        <View className="gap-2">
          {attentionCount === 0 ? (
            <View
              className="flex-row items-center gap-3 rounded-2xl border border-border/60 bg-card px-4 py-3.5"
              style={cardShadow}
            >
              <View
                className="h-10 w-10 items-center justify-center rounded-full"
                style={{ backgroundColor: C.solo }}
              >
                <CheckCircle2 size={18} color={C.soloInk} />
              </View>
              <View className="flex-1">
                <Text className="text-sm font-semibold text-foreground">All clear</Text>
                <Text className="text-xs text-muted-foreground">
                  Nothing is waiting on you for next week.
                </Text>
              </View>
            </View>
          ) : null}
          {coverDays.length > 0 ? (
            <AttentionRow
              icon={<Bell size={17} color={C.red} />}
              title={
                coverDays.length === 1 ? 'Someone can’t make a shift' : 'People can’t make shifts'
              }
              value={coverDays.length}
              detail={coverDays
                .map((c) => `${c.name} (${DAY_SHORT[c.weekday]})${c.note ? `: “${c.note}”` : ''}`)
                .join(', ')}
              people={coverDays.map((c) => c.name)}
              onPress={() => router.push('/(app)/(manager)/schedule')}
            />
          ) : null}
          {waiting.length > 0 ? (
            <AttentionRow
              icon={<Users size={17} color={C.red} />}
              title={hasRequest ? 'Have not answered yet' : 'No usual week yet'}
              value={waiting.length}
              detail={
                hasRequest
                  ? `${readyCount} of ${activeEmployees.length} ready · ${waiting
                      .map((e) => e.name)
                      .join(', ')}`
                  : `Set one for ${waiting.map((e) => e.name).join(', ')} in Team.`
              }
              people={waiting.map((e) => e.name)}
              progress={
                activeEmployees.length > 0 ? readyCount / activeEmployees.length : undefined
              }
              onPress={() => router.push('/(app)/(manager)/team')}
            />
          ) : null}
          {openSlots > 0 ? (
            <AttentionRow
              icon={<AlertTriangle size={17} color={C.red} />}
              title="Open slots"
              value={openSlots}
              detail={data.gaps
                .slice(0, 3)
                .map((g) => g.label)
                .join(', ')}
              onPress={() => router.push('/(app)/(manager)/schedule')}
            />
          ) : null}
          {data.clashes.length > 0 ? (
            <AttentionRow
              icon={<AlertTriangle size={17} color={C.red} />}
              title="No longer fit their shift"
              value={data.clashes.length}
              detail={data.clashes
                .slice(0, 3)
                .map((c) => `${c.employeeName}: ${c.reason}`)
                .join(', ')}
              people={data.clashes.map((c) => c.employeeName)}
              onPress={() => router.push('/(app)/(manager)/schedule')}
            />
          ) : null}
        </View>
      </Appear>

      <Appear index={3}>
        <SectionTitle>Next week at a glance</SectionTitle>
        <View className="flex-row gap-2">
          <StatTile
            icon={<Users size={16} color={C.baristaInk} />}
            tint={C.barista}
            value={String(activeEmployees.length)}
            label={activeEmployees.length === 1 ? 'Person on the team' : 'People on the team'}
            onPress={() => router.push('/(app)/(manager)/team')}
          />
          <StatTile
            icon={<CalendarCheck size={16} color={C.soloInk} />}
            tint={C.solo}
            value={hasDraft ? fmtHours(data.totalMinutes) : '—'}
            label={hasDraft ? 'Scheduled hours' : 'Hours after the draft'}
            onPress={() => router.push('/(app)/(manager)/schedule')}
          />
          <StatTile
            icon={<Wallet size={16} color={C.scooperInk} />}
            tint={C.scooper}
            value={hasDraft ? fmtMoney(Math.round(data.totalWages)).replace(/\.00$/, '') : '—'}
            label={hasDraft ? 'Wages for the week' : 'Wages after the draft'}
            onPress={() => router.push('/(app)/(manager)/schedule')}
          />
        </View>
      </Appear>

      {data.error ? <Text className="mt-4 text-sm text-destructive">{data.error}</Text> : null}
    </Screen>
  );
}

/** Four steps as dots joined by a line: done ones get a tick, the current one a ring. */
function StepTrack({ step }: { step: number }) {
  return (
    <View className="my-5">
      <View className="flex-row items-center">
        {STEPS.map((s, i) => {
          const done = i < step || step >= 4;
          const current = i === step && step < 4;
          return (
            <View key={s} className="flex-1 flex-row items-center">
              {i > 0 ? (
                <View
                  className="h-[2px] flex-1"
                  style={{
                    backgroundColor: done || current ? C.pistachio : 'rgba(242,245,236,0.18)',
                  }}
                />
              ) : (
                <View className="flex-1" />
              )}
              <View
                style={{
                  width: 26,
                  height: 26,
                  borderRadius: 13,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: done ? C.pistachio : current ? C.pine : 'rgba(242,245,236,0.10)',
                  borderWidth: current ? 2 : 0,
                  borderColor: C.pistachio,
                }}
              >
                {done ? (
                  <Check size={14} color={C.pine} strokeWidth={3} />
                ) : (
                  <Text
                    className="text-[11px] font-bold"
                    style={{ color: current ? C.pistachio : 'rgba(242,245,236,0.5)' }}
                  >
                    {i + 1}
                  </Text>
                )}
              </View>
              {i < STEPS.length - 1 ? (
                <View
                  className="h-[2px] flex-1"
                  style={{ backgroundColor: done ? C.pistachio : 'rgba(242,245,236,0.18)' }}
                />
              ) : (
                <View className="flex-1" />
              )}
            </View>
          );
        })}
      </View>
      <View className="mt-2 flex-row">
        {STEPS.map((s, i) => (
          <Text
            key={s}
            className="flex-1 text-center text-[11px] font-semibold"
            style={{
              color: i <= step || step >= 4 ? C.cream : 'rgba(242,245,236,0.45)',
            }}
          >
            {s}
          </Text>
        ))}
      </View>
    </View>
  );
}

function StatTile({
  icon,
  tint,
  value,
  label,
  onPress,
}: {
  icon: React.ReactNode;
  tint: string;
  value: string;
  label: string;
  onPress: () => void;
}) {
  return (
    <PressScale
      onPress={onPress}
      accessibilityLabel={`${label}: ${value === '—' ? 'not yet' : value}`}
      className="flex-1 rounded-2xl border border-border/60 bg-card p-3.5"
      style={[{ borderCurve: 'continuous' }, cardShadow]}
    >
      <View
        className="h-8 w-8 items-center justify-center rounded-full"
        style={{ backgroundColor: tint }}
      >
        {icon}
      </View>
      <Text
        className="mt-3 text-[21px] font-bold text-foreground"
        style={{ letterSpacing: -0.5, fontVariant: ['tabular-nums'] }}
        numberOfLines={1}
        adjustsFontSizeToFit
      >
        {value}
      </Text>
      <Text className="text-[11px] leading-[14px] text-muted-foreground" numberOfLines={2}>
        {label}
      </Text>
    </PressScale>
  );
}

function AttentionRow({
  icon,
  title,
  value,
  detail,
  people,
  progress,
  onPress,
}: {
  icon: React.ReactNode;
  title: string;
  value: number;
  detail: string;
  people?: string[];
  progress?: number;
  onPress: () => void;
}) {
  return (
    <PressScale
      onPress={onPress}
      className="rounded-2xl border border-border/60 bg-card px-4 py-3.5"
      style={[{ borderCurve: 'continuous' }, cardShadow]}
    >
      <View className="flex-row items-center gap-3">
        <View
          className="h-10 w-10 items-center justify-center rounded-full"
          style={{ backgroundColor: C.redSoft }}
        >
          {icon}
        </View>
        <View className="flex-1">
          <Text className="text-sm font-semibold text-foreground">{title}</Text>
          <Text className="text-xs text-muted-foreground" numberOfLines={2}>
            {detail}
          </Text>
        </View>
        <View
          className="min-w-[28px] items-center rounded-full px-2 py-0.5"
          style={{ backgroundColor: C.redSoft }}
        >
          <Text className="text-sm font-bold text-destructive">{value}</Text>
        </View>
        <ChevronRight size={16} color={C.muted} />
      </View>
      {people && people.length > 0 ? (
        <View className="mt-3 flex-row items-center gap-3 pl-[52px]">
          <AvatarStack names={people} max={6} size={28} />
          {progress !== undefined ? (
            <View className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
              <View
                className="h-full rounded-full"
                style={{ width: `${Math.round(progress * 100)}%`, backgroundColor: C.soloInk }}
              />
            </View>
          ) : null}
        </View>
      ) : null}
    </PressScale>
  );
}
