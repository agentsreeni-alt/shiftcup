import { ArrowRight } from 'lucide-react-native';
import { useState } from 'react';
import { Text, View } from 'react-native';

import { Btn } from '@/components/kit';
import { decideAvailabilityRequest } from '@/lib/api';
import { asWeek, changedDays } from '@/lib/availability';
import { C } from '@/lib/colors';
import { fmtDateShort, fmtWeekLabel } from '@/lib/dates';
import { cardShadow } from '@/lib/motion';
import type { AvailabilityRequest, Channel, Employee } from '@/lib/types';

/**
 * Availability changes the team has asked for. Each one shows only the days that would
 * change, next to what is in force now, with a decision right on the card.
 */
export function ChangeRequests({
  requests,
  employees,
  channel,
  onDecided,
}: {
  requests: AvailabilityRequest[];
  employees: Employee[];
  channel: Channel;
  onDecided: (message: string) => Promise<void> | void;
}) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState('');

  const decide = async (request: AvailabilityRequest, approve: boolean, name: string) => {
    setBusyId(`${request.id}:${approve ? 'yes' : 'no'}`);
    setError('');
    try {
      await decideAvailabilityRequest(request, approve, channel);
      await onDecided(
        approve
          ? request.scope === 'usual'
            ? `Approved. ${name}'s new usual week is used for every draft from now on.`
            : `Approved. ${name}'s change applies to ${fmtWeekLabel(request.week_start ?? '')} only.`
          : `Declined. Nothing changed for ${name}, and they have been told.`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save that decision. Try again.');
    } finally {
      setBusyId(null);
    }
  };

  if (requests.length === 0) return null;

  return (
    <View className="gap-2.5">
      {requests.map((r) => {
        const emp = employees.find((e) => e.id === r.employee_id);
        const name = emp?.name ?? 'Someone';
        const usual = asWeek(emp?.usual_week);
        const changes = changedDays(usual, asWeek(r.days) ?? []);
        return (
          <View
            key={r.id}
            className="rounded-2xl border border-border/60 bg-card p-4"
            style={[{ borderCurve: 'continuous' }, cardShadow]}
          >
            <View className="flex-row items-start justify-between gap-3">
              <View className="flex-1">
                <Text className="text-[15px] font-semibold text-foreground">
                  {r.scope === 'usual'
                    ? `${name} wants a new usual week`
                    : `${name} needs a change for one week`}
                </Text>
                <Text className="mt-0.5 text-xs text-muted-foreground">
                  {r.scope === 'usual'
                    ? 'Every week from now on'
                    : `${fmtWeekLabel(r.week_start ?? '')} only`}
                  {`, asked ${fmtDateShort(r.created_at.slice(0, 10))}`}
                </Text>
              </View>
            </View>

            <View className="mt-3 rounded-xl bg-muted/60 px-3 py-1">
              {changes.length === 0 ? (
                <Text className="py-2 text-sm text-muted-foreground">
                  Same days and times as their usual week.
                </Text>
              ) : (
                changes.map((c, i) => (
                  <View
                    key={c.weekday}
                    className={`flex-row items-center gap-2 py-2 ${
                      i > 0 ? 'border-t border-border/70' : ''
                    }`}
                  >
                    <Text className="w-[84px] text-sm font-semibold text-foreground">{c.day}</Text>
                    {c.from ? (
                      <>
                        <Text
                          className="text-xs text-muted-foreground line-through"
                          style={{ fontVariant: ['tabular-nums'] }}
                        >
                          {c.from}
                        </Text>
                        <ArrowRight size={12} color={C.muted} />
                      </>
                    ) : null}
                    <Text
                      className="flex-1 text-right text-sm font-semibold text-foreground"
                      style={{ fontVariant: ['tabular-nums'] }}
                    >
                      {c.to}
                    </Text>
                  </View>
                ))
              )}
            </View>

            {r.note ? (
              <Text className="mt-2.5 text-sm italic text-muted-foreground">“{r.note}”</Text>
            ) : null}

            <View className="mt-3 flex-row gap-2">
              <View className="flex-1">
                <Btn
                  label="Decline"
                  variant="ghost"
                  size="sm"
                  loading={busyId === `${r.id}:no`}
                  disabled={busyId !== null && busyId !== `${r.id}:no`}
                  onPress={() => decide(r, false, name)}
                />
              </View>
              <View className="flex-[1.4]">
                <Btn
                  label="Approve"
                  size="sm"
                  loading={busyId === `${r.id}:yes`}
                  disabled={busyId !== null && busyId !== `${r.id}:yes`}
                  onPress={() => decide(r, true, name)}
                />
              </View>
            </View>
          </View>
        );
      })}
      {error ? <Text className="px-1 text-xs text-destructive">{error}</Text> : null}
    </View>
  );
}
