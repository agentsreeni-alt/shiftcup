import { useFocusEffect } from 'expo-router';
import { ArrowLeft, CalendarClock, Check, Clock, Hourglass } from 'lucide-react-native';
import { useCallback, useMemo, useState } from 'react';
import { Text, View } from 'react-native';

import {
  AppBar,
  Btn,
  Card,
  Field,
  Notice,
  PressScale,
  Screen,
  SectionTitle,
  TimeField,
} from '@/components/kit';
import {
  cancelAvailabilityRequest,
  confirmUsualWeek,
  createAvailabilityRequest,
  loadMyAvailability,
  loadMyAvailabilityRequests,
  loadMyRequestStatus,
  loadMySettings,
  markAnswered,
  planningWeekStart,
  saveAvailabilityRows,
  weekStartFromOffset,
} from '@/lib/api';
import { useApp } from '@/lib/app-context';
import { asWeek, changedDays, dayText, effectiveWeek, sameDay } from '@/lib/availability';
import { C } from '@/lib/colors';
import {
  availabilityDueDate,
  DAY_LONG,
  fmtDateShort,
  fmtDayDate,
  fmtDue,
  fmtWeekLabel,
} from '@/lib/dates';
import type {
  Availability,
  AvailabilityRequest,
  CafeSettings,
  ChangeScope,
  UsualDay,
} from '@/lib/types';

type Draft = { kind: 'any' | 'none' | 'window'; start: number; end: number };

const toDraft = (d: UsualDay): Draft => ({
  kind: d.kind,
  start: d.start_min ?? 660,
  end: d.end_min ?? 1320,
});

const fromDraft = (d: Draft): UsualDay => ({
  kind: d.kind,
  start_min: d.kind === 'window' ? d.start : null,
  end_min: d.kind === 'window' ? d.end : null,
});

const OPTIONS: { key: Draft['kind']; label: string }[] = [
  { key: 'any', label: 'Any time' },
  { key: 'window', label: 'Certain hours' },
  { key: 'none', label: 'Not available' },
];

export default function AvailabilityScreen() {
  const { employee, cafeName, refresh } = useApp();
  const nextWeek = planningWeekStart();
  // One-week changes can be asked for up to three weeks ahead.
  const weekChoices = useMemo(() => [1, 2, 3].map((o) => weekStartFromOffset(o)), []);

  const [weekRows, setWeekRows] = useState<Record<string, Availability[]>>({});
  const [settings, setSettings] = useState<CafeSettings | null>(null);
  const [askId, setAskId] = useState<string | null>(null);
  const [askAnswered, setAskAnswered] = useState(false);
  const [requests, setRequests] = useState<AvailabilityRequest[]>([]);
  const [requestsReady, setRequestsReady] = useState(true);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const [editing, setEditing] = useState<{ scope: ChangeScope; weekStart: string } | null>(null);
  const [draft, setDraft] = useState<Draft[]>([]);
  const [note, setNote] = useState('');

  const usual = useMemo(() => asWeek(employee?.usual_week), [employee?.usual_week]);

  const load = useCallback(async () => {
    try {
      const [rowsByWeek, ask, cfg] = await Promise.all([
        Promise.all(weekChoices.map((w) => loadMyAvailability(w))),
        loadMyRequestStatus(nextWeek),
        loadMySettings(),
      ]);
      setWeekRows(Object.fromEntries(weekChoices.map((w, i) => [w, rowsByWeek[i]])));
      setSettings(cfg);
      setAskId(ask.request?.id ?? null);
      setAskAnswered(ask.status?.status === 'answered');
      setError('');
      try {
        setRequests(await loadMyAvailabilityRequests());
        setRequestsReady(true);
      } catch {
        // The café's database has not been updated for change requests yet.
        setRequests([]);
        setRequestsReady(false);
      }
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : 'Could not load your availability. Check your connection and try again.',
      );
    } finally {
      setLoading(false);
    }
  }, [nextWeek, weekChoices]);

  useFocusEffect(
    useCallback(() => {
      void load();
      // An approved request changes the usual week on the profile.
      void refresh();
    }, [load, refresh]),
  );

  const pending = requests.filter((r) => r.status === 'pending');
  const lastDecided = requests.find((r) => r.status === 'approved' || r.status === 'declined');
  const nextWeekRows = weekRows[nextWeek] ?? [];
  const nextWeekDiffers =
    nextWeekRows.length > 0 &&
    effectiveWeek(usual, nextWeekRows).some((d, i) => !usual || !sameDay(d, usual[i]));

  const startEdit = (scope: ChangeScope, weekStart = nextWeek) => {
    const base = scope === 'usual' ? effectiveWeek(usual, []) : effectiveWeek(usual, weekRows[weekStart] ?? []);
    setDraft(base.map(toDraft));
    setNote('');
    setMessage('');
    setError('');
    setEditing({ scope, weekStart });
  };

  const pickWeek = (weekStart: string) => {
    setDraft(effectiveWeek(usual, weekRows[weekStart] ?? []).map(toDraft));
    setEditing({ scope: 'week', weekStart });
  };

  const setDay = (weekday: number, patch: Partial<Draft>) => {
    setDraft((prev) => prev.map((d, i) => (i === weekday ? { ...d, ...patch } : d)));
  };

  const badDays = draft
    .map((d, i) => (d.kind === 'window' && d.end <= d.start ? i : -1))
    .filter((i) => i >= 0);

  // Answering the manager's own question goes straight in. Anything the employee starts
  // themselves waits for the manager to approve it.
  const direct = Boolean(
    editing && editing.scope === 'week' && editing.weekStart === nextWeek && askId,
  );

  const submit = async () => {
    if (!employee || !editing) return;
    if (badDays.length > 0) {
      setError(
        `Check ${badDays.map((i) => DAY_LONG[i]).join(', ')}: the end time must be after the start time.`,
      );
      return;
    }
    const days = draft.map(fromDraft);
    setBusy(true);
    setError('');
    try {
      if (direct && askId) {
        await saveAvailabilityRows(
          days.map((d, weekday) => ({
            cafe_id: employee.cafe_id,
            employee_id: employee.id,
            week_start: editing.weekStart,
            weekday,
            kind: d.kind,
            start_min: d.start_min,
            end_min: d.end_min,
          })),
        );
        await markAnswered(askId, employee.id);
        setMessage('Sent. Your manager can see next week now.');
      } else {
        await createAvailabilityRequest({
          cafeId: employee.cafe_id,
          employeeId: employee.id,
          scope: editing.scope,
          weekStart: editing.scope === 'week' ? editing.weekStart : null,
          days,
          note,
        });
        setMessage('Sent to your manager. Nothing changes until they approve it.');
      }
      setEditing(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not send that. Try again.');
    } finally {
      setBusy(false);
    }
  };

  const usualWorks = async () => {
    if (!employee || !askId) return;
    setBusy(true);
    setError('');
    try {
      await confirmUsualWeek(askId, employee.id);
      setAskAnswered(true);
      setMessage('Thanks. Your manager knows your usual week works.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not send that. Try again.');
    } finally {
      setBusy(false);
    }
  };

  const withdraw = async (id: string) => {
    setBusy(true);
    setError('');
    try {
      await cancelAvailabilityRequest(id);
      await load();
      setMessage('Request withdrawn.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not withdraw that request.');
    } finally {
      setBusy(false);
    }
  };

  // ---------- editing ----------
  if (editing) {
    const isUsual = editing.scope === 'usual';
    return (
      <Screen>
        <PressScale
          onPress={() => setEditing(null)}
          accessibilityLabel="Back without sending"
          hitSlop={8}
          className="-ml-1 mb-1 flex-row items-center gap-1.5 self-start rounded-full py-2 pr-3"
        >
          <ArrowLeft size={18} color={C.pine} />
          <Text className="text-sm font-semibold text-foreground">Back</Text>
        </PressScale>
        <AppBar
          title={isUsual ? 'Your usual week' : 'One week only'}
          subtitle={
            isUsual
              ? 'When you can normally work, every week.'
              : `Just ${fmtWeekLabel(editing.weekStart)}. Your usual week stays the same.`
          }
        />

        {!isUsual ? (
          <View className="mb-3 flex-row gap-1.5">
            {weekChoices.map((w, i) => {
              const active = w === editing.weekStart;
              return (
                <PressScale
                  key={w}
                  onPress={() => pickWeek(w)}
                  aria-selected={active}
                  className={`flex-1 items-center rounded-xl border py-2.5 ${
                    active ? 'border-primary bg-primary' : 'border-border bg-card'
                  }`}
                >
                  <Text
                    className={`text-[11px] font-semibold ${
                      active ? 'text-primary-foreground/80' : 'text-muted-foreground'
                    }`}
                  >
                    {i === 0 ? 'Next week' : `In ${i + 1} weeks`}
                  </Text>
                  <Text
                    className={`text-xs font-bold ${
                      active ? 'text-primary-foreground' : 'text-foreground'
                    }`}
                  >
                    {fmtWeekLabel(w)}
                  </Text>
                </PressScale>
              );
            })}
          </View>
        ) : null}

        <View className="gap-2">
          {DAY_LONG.map((day, i) => {
            const d = draft[i];
            if (!d) return null;
            return (
              <Card key={day}>
                <View className="mb-2.5 flex-row items-baseline justify-between">
                  <Text className="text-[15px] font-bold text-foreground">{day}</Text>
                  {!isUsual ? (
                    <Text className="text-xs text-muted-foreground">
                      {fmtDayDate(editing.weekStart, i).replace(/^\w{3} /, '')}
                    </Text>
                  ) : null}
                </View>
                <View className="flex-row gap-1.5">
                  {OPTIONS.map((o) => (
                    <PressScale
                      key={o.key}
                      onPress={() => setDay(i, { kind: o.key })}
                      aria-selected={d.kind === o.key}
                      className={`flex-1 items-center rounded-lg py-2.5 ${
                        d.kind === o.key
                          ? 'border border-primary bg-primary'
                          : 'border border-border bg-card'
                      }`}
                    >
                      <Text
                        className={`text-xs font-semibold ${
                          d.kind === o.key ? 'text-primary-foreground' : 'text-foreground'
                        }`}
                      >
                        {o.label}
                      </Text>
                    </PressScale>
                  ))}
                </View>
                {d.kind === 'window' ? (
                  <View className="mt-2 flex-row items-center gap-2">
                    <View className="flex-1">
                      <TimeField
                        compact
                        value={d.start}
                        onChange={(v) => setDay(i, { start: v })}
                      />
                    </View>
                    <Text className="text-xs text-muted-foreground">to</Text>
                    <View className="flex-1">
                      <TimeField compact value={d.end} onChange={(v) => setDay(i, { end: v })} />
                    </View>
                  </View>
                ) : null}
                {badDays.includes(i) ? (
                  <Text className="mt-1.5 text-xs text-destructive">
                    The end time must be after the start time.
                  </Text>
                ) : null}
              </Card>
            );
          })}
        </View>

        {!direct ? (
          <View className="mt-4">
            <Field
              label="Note for your manager (optional)"
              placeholder="Why it is changing, or until when"
              value={note}
              onChangeText={setNote}
              maxLength={240}
            />
          </View>
        ) : null}

        <View className="mt-4 gap-2">
          <Btn
            label={direct ? 'Send next week to my manager' : 'Ask my manager to approve'}
            size="lg"
            loading={busy}
            onPress={submit}
          />
          <Text className="px-1 text-xs text-muted-foreground">
            {direct
              ? 'Your manager asked for next week, so this goes straight to them.'
              : isUsual
                ? 'Your current usual week stays in place until your manager approves the new one.'
                : 'Your manager decides. Until then, your usual week applies.'}
          </Text>
          {error ? <Text className="px-1 text-xs text-destructive">{error}</Text> : null}
        </View>
      </Screen>
    );
  }

  // ---------- overview ----------
  const due = fmtDue(
    availabilityDueDate(nextWeek, settings?.due_weekday ?? 2, settings?.due_min ?? 1200),
  );

  return (
    <Screen>
      <AppBar title="Availability" subtitle={cafeName ?? ''} />

      {askId && !askAnswered ? (
        <View
          className="mb-4 rounded-2xl bg-primary p-4"
          style={{ borderCurve: 'continuous' }}
        >
          <View className="flex-row items-center gap-2">
            <Clock size={16} color={C.pistachio} />
            <Text className="flex-1 text-[15px] font-semibold text-primary-foreground">
              Your manager is asking about next week
            </Text>
          </View>
          <Text className="mt-1 text-sm text-primary-foreground/80">
            {fmtWeekLabel(nextWeek)}. Answer by {due}.
          </Text>
          <View className="mt-3 gap-2">
            {usual ? (
              <Btn label="My usual week works" variant="accent" loading={busy} onPress={usualWorks} />
            ) : null}
            <PressScale
              onPress={() => startEdit('week', nextWeek)}
              className="items-center rounded-xl border border-primary-foreground/30 py-3"
            >
              <Text className="text-[15px] font-semibold text-primary-foreground">
                {usual ? 'Next week is different' : 'Tell them when I can work'}
              </Text>
            </PressScale>
          </View>
        </View>
      ) : null}

      {message ? (
        <View className="mb-3 flex-row items-center gap-2 rounded-xl bg-accent px-4 py-2.5">
          <Check size={14} color={C.pine} />
          <Text className="flex-1 text-xs font-semibold text-accent-foreground">{message}</Text>
        </View>
      ) : null}
      {error ? <Text className="mb-3 text-xs text-destructive">{error}</Text> : null}

      {pending.map((r) => {
        const before = r.scope === 'usual' ? usual : effectiveWeek(usual, weekRows[r.week_start ?? ''] ?? []);
        const changes = changedDays(before, asWeek(r.days) ?? []);
        return (
          <View
            key={r.id}
            className="mb-3 rounded-2xl border p-4"
            style={{ borderColor: '#EBD9B0', backgroundColor: '#FBF6E9', borderCurve: 'continuous' }}
          >
            <View className="flex-row items-center gap-2">
              <Hourglass size={15} color="#8A5A12" />
              <Text className="flex-1 text-sm font-semibold" style={{ color: '#6E470C' }}>
                Waiting for your manager
              </Text>
              <Text className="text-[11px]" style={{ color: '#8A5A12' }}>
                Sent {fmtDateShort(r.created_at.slice(0, 10))}
              </Text>
            </View>
            <Text className="mt-1 text-xs" style={{ color: '#8A5A12' }}>
              {r.scope === 'usual'
                ? 'A new usual week.'
                : `A change for ${fmtWeekLabel(r.week_start ?? nextWeek)} only.`}
            </Text>
            <View className="mt-2.5 gap-1">
              {changes.length === 0 ? (
                <Text className="text-sm text-foreground">Same days and times as now.</Text>
              ) : (
                changes.map((c) => (
                  <View key={c.weekday} className="flex-row justify-between gap-3">
                    <Text className="text-sm font-semibold text-foreground">{c.day}</Text>
                    <Text
                      className="flex-1 text-right text-sm text-foreground"
                      style={{ fontVariant: ['tabular-nums'] }}
                    >
                      {c.to}
                    </Text>
                  </View>
                ))
              )}
            </View>
            {r.note ? (
              <Text className="mt-2 text-xs italic text-muted-foreground">“{r.note}”</Text>
            ) : null}
            <PressScale
              onPress={() => withdraw(r.id)}
              disabled={busy}
              hitSlop={8}
              className="mt-3 self-start"
            >
              <Text className="text-xs font-semibold text-destructive">Withdraw this request</Text>
            </PressScale>
          </View>
        );
      })}

      <Card>
        <View className="mb-1 flex-row items-center justify-between">
          <Text className="text-base font-semibold text-foreground">Your usual week</Text>
          {usual ? (
            <Text className="text-[11px] font-semibold" style={{ color: C.soloInk }}>
              In use every week
            </Text>
          ) : null}
        </View>
        {loading && !employee ? (
          <Text className="mt-2 text-sm text-muted-foreground">Loading…</Text>
        ) : usual ? (
          <View className="mt-1">
            {usual.map((d, i) => (
              <View
                key={DAY_LONG[i]}
                className={`flex-row items-center justify-between py-2.5 ${
                  i > 0 ? 'border-t border-border/70' : ''
                }`}
              >
                <Text className="text-sm font-medium text-foreground">{DAY_LONG[i]}</Text>
                <Text
                  className={`text-sm ${
                    d.kind === 'none' ? 'text-muted-foreground' : 'font-semibold text-foreground'
                  }`}
                  style={{ fontVariant: ['tabular-nums'] }}
                >
                  {dayText(d)}
                </Text>
              </View>
            ))}
          </View>
        ) : (
          <Text className="mt-1 text-sm text-muted-foreground">
            Not set yet. Tell your manager when you can normally work, and you will not be asked
            again every week.
          </Text>
        )}
        {requestsReady ? (
          <View className="mt-3">
            <Btn
              label={usual ? 'Ask to change my usual week' : 'Set my usual week'}
              variant={usual ? 'secondary' : 'primary'}
              onPress={() => startEdit('usual')}
            />
          </View>
        ) : null}
      </Card>

      <SectionTitle>One week different?</SectionTitle>
      <Card>
        <View className="flex-row items-start gap-3">
          <View className="h-9 w-9 items-center justify-center rounded-full bg-muted">
            <CalendarClock size={17} color={C.pine} />
          </View>
          <View className="flex-1">
            <Text className="text-sm font-semibold text-foreground">
              Next week, {fmtWeekLabel(nextWeek)}
            </Text>
            <Text className="mt-0.5 text-sm text-muted-foreground">
              {nextWeekDiffers
                ? effectiveWeek(usual, nextWeekRows)
                    .map((d, i) => (usual && sameDay(d, usual[i]) ? null : `${DAY_LONG[i]}: ${dayText(d)}`))
                    .filter(Boolean)
                    .join('. ')
                : usual
                  ? 'Same as your usual week.'
                  : 'Nothing sent yet.'}
            </Text>
          </View>
        </View>
        {requestsReady || askId ? (
          <View className="mt-3">
            <Btn
              label="Change one week only"
              variant="ghost"
              onPress={() => startEdit('week', nextWeek)}
            />
          </View>
        ) : null}
        <Text className="mt-2 text-xs text-muted-foreground">
          For a holiday, an exam or an appointment. Already on the schedule and cannot make a
          shift? Use “I can’t make it” in My shifts.
        </Text>
      </Card>

      {lastDecided && pending.length === 0 ? (
        <View className="mt-4">
          <Notice
            tone={lastDecided.status === 'approved' ? 'success' : 'warn'}
            title={
              lastDecided.status === 'approved'
                ? `Approved${lastDecided.decided_at ? ` ${fmtDateShort(lastDecided.decided_at.slice(0, 10))}` : ''}`
                : 'Not approved'
            }
            body={
              lastDecided.status === 'approved'
                ? lastDecided.scope === 'usual'
                  ? 'Your manager approved your new usual week.'
                  : `Your manager approved your change for ${fmtWeekLabel(lastDecided.week_start ?? nextWeek)}.`
                : lastDecided.scope === 'usual'
                  ? 'Your manager kept your usual week as it was. Talk to them if you need to.'
                  : `Your manager did not approve the change for ${fmtWeekLabel(lastDecided.week_start ?? nextWeek)}. Talk to them if you need to.`
            }
          />
        </View>
      ) : null}
    </Screen>
  );
}
