import { useFocusEffect } from 'expo-router';
import { Check } from 'lucide-react-native';
import { useCallback, useState } from 'react';
import { Text, View } from 'react-native';

import { AppBar, Btn, Card, PressScale, Screen, TimeField } from '@/components/kit';
import {
  currentWeekStart,
  loadMyAvailability,
  loadMyRequestStatus,
  loadMySettings,
  markAnswered,
  saveAvailabilityRows,
} from '@/lib/api';
import { useApp } from '@/lib/app-context';
import { C } from '@/lib/colors';
import { DAY_LONG, fmtDayDate, fmtTime, fmtWeekLabel } from '@/lib/dates';
import type { Availability, CafeSettings } from '@/lib/types';

type Draft = { kind: 'any' | 'none' | 'window'; start: number; end: number };

const DEFAULT_DRAFT: Draft = { kind: 'any', start: 660, end: 1320 };

export default function AvailabilityScreen() {
  const { employee, cafeName } = useApp();
  const weekStart = currentWeekStart();
  const [draft, setDraft] = useState<Draft[]>(Array.from({ length: 7 }, () => DEFAULT_DRAFT));
  const [settings, setSettings] = useState<CafeSettings | null>(null);
  const [requestId, setRequestId] = useState<string | null>(null);
  const [answered, setAnswered] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  const load = useCallback(async () => {
    try {
      const [rows, req, cfg] = await Promise.all([
        loadMyAvailability(weekStart),
        loadMyRequestStatus(weekStart),
        loadMySettings(),
      ]);
      setSettings(cfg);
      setRequestId(req.request?.id ?? null);
      setAnswered(req.status?.status === 'answered');
      const next: Draft[] = Array.from({ length: 7 }, () => DEFAULT_DRAFT);
      for (const row of rows as Availability[]) {
        next[row.weekday] = {
          kind: row.kind,
          start: row.start_min ?? 660,
          end: row.end_min ?? 1320,
        };
      }
      setDraft(next);
    } finally {
      setLoading(false);
    }
  }, [weekStart]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const setDay = (weekday: number, patch: Partial<Draft>) => {
    setDraft((prev) => prev.map((d, i) => (i === weekday ? { ...d, ...patch } : d)));
  };

  const submit = async () => {
    if (!employee) return;
    setBusy(true);
    setMessage('');
    try {
      await saveAvailabilityRows(
        draft.map((d, i) => ({
          cafe_id: employee.cafe_id,
          employee_id: employee.id,
          week_start: weekStart,
          weekday: i,
          kind: d.kind,
          start_min: d.kind === 'window' ? d.start : null,
          end_min: d.kind === 'window' ? d.end : null,
        })),
      );
      if (requestId) await markAnswered(requestId, employee.id);
      setAnswered(true);
      setMessage('Sent. Your manager can see this now.');
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Could not send your availability.');
    } finally {
      setBusy(false);
    }
  };

  const options: { key: 'any' | 'window' | 'none'; label: string }[] = [
    { key: 'any', label: 'Any time' },
    { key: 'window', label: 'Certain hours' },
    { key: 'none', label: 'Not available' },
  ];

  return (
    <Screen>
      <AppBar title="When can you work?" subtitle={cafeName ?? ''} />

      <View className="mb-3 rounded-xl bg-card px-4 py-3">
        <Text className="text-sm font-semibold text-foreground">
          Week of {fmtWeekLabel(weekStart)}
        </Text>
        <Text className="mt-0.5 text-xs text-muted-foreground">
          {requestId
            ? `Due ${DAY_LONG[settings?.due_weekday ?? 2]} at ${fmtTime(settings?.due_min ?? 1200)}.`
            : 'Your manager has not sent a request yet. You can still send this.'}
        </Text>
      </View>

      {answered ? (
        <View className="mb-3 flex-row items-center gap-2 rounded-xl bg-accent px-4 py-2.5">
          <Check size={14} color={C.pine} />
          <Text className="text-xs font-semibold text-accent-foreground">
            You already sent this week. Send again if something changed.
          </Text>
        </View>
      ) : null}

      {loading ? (
        <Text className="text-sm text-muted-foreground">Loading…</Text>
      ) : (
        <View className="gap-2">
          {DAY_LONG.map((day, i) => {
            const d = draft[i];
            return (
              <Card key={day}>
                <View className="mb-2 flex-row items-center justify-between">
                  <Text className="text-sm font-bold text-foreground">
                    {day} · {fmtDayDate(weekStart, i)}
                  </Text>
                  <Text className="text-[11px] font-semibold text-muted-foreground">
                    {d.kind === 'any'
                      ? 'Any time'
                      : d.kind === 'none'
                        ? 'Not available'
                        : `${fmtTime(d.start)} – ${fmtTime(d.end)}`}
                  </Text>
                </View>
                <View className="flex-row gap-1.5">
                  {options.map((o) => (
                    <PressScale
                      key={o.key}
                      onPress={() => setDay(i, { kind: o.key })}
                      className={`flex-1 items-center rounded-lg py-2 ${
                        d.kind === o.key ? 'bg-primary' : 'border border-border bg-card'
                      }`}
                    >
                      <Text
                        className={`text-[11px] font-semibold ${
                          d.kind === o.key ? 'text-primary-foreground' : 'text-foreground'
                        }`}
                      >
                        {o.label}
                      </Text>
                    </PressScale>
                  ))}
                </View>
                {d.kind === 'window' ? (
                  <View className="mt-2 flex-row gap-2">
                    <View className="flex-1">
                      <TimeField compact value={d.start} onChange={(v) => setDay(i, { start: v })} />
                    </View>
                    <Text className="self-center text-xs text-muted-foreground">to</Text>
                    <View className="flex-1">
                      <TimeField compact value={d.end} onChange={(v) => setDay(i, { end: v })} />
                    </View>
                  </View>
                ) : null}
              </Card>
            );
          })}
        </View>
      )}

      <View className="mt-4">
        <Btn label="Send my availability" size="lg" loading={busy} onPress={submit} />
      </View>
      {message ? <Text className="mt-2 text-xs text-muted-foreground">{message}</Text> : null}
    </Screen>
  );
}
