import { Pressable, Text, View } from 'react-native';

import { C } from '@/lib/colors';
import { DAY_LONG, DAY_SHORT, dateForWeekday, fmtHours } from '@/lib/dates';
import { allShiftRuns, shiftRunsForDay, type EngineAssignment } from '@/lib/scheduling';

/** "11a", "5:30p": short enough for seven columns on a phone. */
function shortTime(min: number): string {
  const m = ((min % 1440) + 1440) % 1440;
  const h24 = Math.floor(m / 60);
  const mm = m % 60;
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  const suffix = h24 < 12 ? 'a' : 'p';
  return mm === 0 ? `${h12}${suffix}` : `${h12}:${String(mm).padStart(2, '0')}${suffix}`;
}

/**
 * Everyone × Monday–Sunday. Each cell shows that person's shift(s) for the day, with
 * back-to-back blocks merged into one shift.
 */
export function WeekGrid({
  weekStart,
  people,
  assignments,
  highlightId,
  openPerDay,
  showHours = false,
  hideEmpty = false,
  onCellPress,
}: {
  weekStart: string;
  people: { id: string; name: string }[];
  assignments: EngineAssignment[];
  highlightId?: string | null;
  openPerDay?: number[];
  showHours?: boolean;
  hideEmpty?: boolean;
  onCellPress?: (employeeId: string, weekday: number) => void;
}) {
  const rows = people
    .map((p) => {
      const runs = allShiftRuns(assignments, p.id);
      const minutes = runs.reduce((sum, r) => sum + (r.endMin - r.startMin), 0);
      return { ...p, minutes, working: runs.length > 0 };
    })
    .filter((p) => !hideEmpty || p.working);

  return (
    <View
      className="overflow-hidden rounded-2xl border border-border bg-card"
      style={{ borderCurve: 'continuous' }}
    >
      {/* Day header */}
      <View className="flex-row border-b border-border bg-muted">
        <View style={{ width: 76 }} className="justify-center px-2 py-2">
          <Text className="text-[10px] font-bold uppercase text-muted-foreground">Team</Text>
        </View>
        {DAY_SHORT.map((d, i) => (
          <View key={d} className="flex-1 items-center py-2">
            <Text className="text-[10px] font-bold uppercase text-muted-foreground">{d}</Text>
            <Text className="text-[10px] text-muted-foreground">
              {dateForWeekday(weekStart, i).getDate()}
            </Text>
          </View>
        ))}
      </View>

      {rows.length === 0 ? (
        <View className="px-3 py-4">
          <Text className="text-sm text-muted-foreground">Nobody is scheduled this week.</Text>
        </View>
      ) : null}

      {rows.map((p, rowIndex) => {
        const mine = p.id === highlightId;
        return (
          <View
            key={p.id}
            className={`flex-row ${rowIndex > 0 ? 'border-t border-border' : ''}`}
            style={mine ? { backgroundColor: C.solo } : undefined}
          >
            <View style={{ width: 76 }} className="justify-center px-2 py-2">
              <Text
                numberOfLines={1}
                className={`text-xs ${mine ? 'font-bold' : 'font-semibold'} text-foreground`}
              >
                {mine ? `${p.name} (you)` : p.name}
              </Text>
              {showHours ? (
                <Text className="text-[10px] text-muted-foreground">{fmtHours(p.minutes)}</Text>
              ) : null}
            </View>
            {DAY_SHORT.map((d, weekday) => {
              const runs = shiftRunsForDay(assignments, p.id, weekday);
              const label = runs.map((r) => `${shortTime(r.startMin)}–${shortTime(r.endMin)}`);
              const cell = (
                <View className="flex-1 items-center justify-center px-0.5 py-2">
                  {label.length === 0 ? (
                    <Text className="text-[11px] text-muted-foreground">·</Text>
                  ) : (
                    label.map((l) => (
                      <Text
                        key={l}
                        numberOfLines={1}
                        adjustsFontSizeToFit
                        className="text-[10px] font-semibold text-foreground"
                      >
                        {l}
                      </Text>
                    ))
                  )}
                </View>
              );
              const a11y = `${p.name}, ${DAY_LONG[weekday]}: ${
                label.length === 0 ? 'off' : label.join(' and ')
              }`;
              return onCellPress ? (
                <Pressable
                  key={d}
                  onPress={() => onCellPress(p.id, weekday)}
                  accessibilityRole="button"
                  accessibilityLabel={`${a11y}. Open this day`}
                  className="flex-1"
                >
                  {cell}
                </Pressable>
              ) : (
                <View key={d} className="flex-1" accessibilityLabel={a11y}>
                  {cell}
                </View>
              );
            })}
          </View>
        );
      })}

      {openPerDay ? (
        <View className="flex-row border-t border-border bg-muted">
          <View style={{ width: 76 }} className="justify-center px-2 py-2">
            <Text className="text-xs font-semibold text-destructive">Open</Text>
          </View>
          {openPerDay.map((n, weekday) => (
            <View key={DAY_SHORT[weekday]} className="flex-1 items-center py-2">
              <Text
                className={`text-[11px] font-bold ${n > 0 ? 'text-destructive' : 'text-muted-foreground'}`}
              >
                {n > 0 ? n : '·'}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}
