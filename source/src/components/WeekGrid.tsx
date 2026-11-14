import { Pressable, Text, View } from 'react-native';

import { SLOT_COLORS } from '@/lib/colors';
import { DAY_LONG, DAY_SHORT, dateForWeekday, fmtHours } from '@/lib/dates';
import { allShiftRuns, shiftRunsForDay, type EngineAssignment } from '@/lib/scheduling';
import { SLOT_LABEL, type SlotKind } from '@/lib/types';

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

  const slotsUsed = (['solo', 'barista', 'scooper'] as SlotKind[]).filter((k) =>
    assignments.some((a) => a.employeeId && a.slot === k),
  );

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
            // A tint lighter than any shift tile, so your own tiles still stand out on your row.
            style={mine ? { backgroundColor: '#F5F9EE' } : undefined}
          >
            <View style={{ width: 76 }} className="justify-center px-2 py-2">
              <Text
                numberOfLines={1}
                className={`text-xs ${mine ? 'font-bold' : 'font-semibold'} text-foreground`}
              >
                {p.name}
              </Text>
              {mine ? (
                <Text className="text-[10px] font-semibold text-muted-foreground">You</Text>
              ) : null}
              {showHours ? (
                <Text className="text-[10px] text-muted-foreground">{fmtHours(p.minutes)}</Text>
              ) : null}
            </View>
            {DAY_SHORT.map((d, weekday) => {
              const runs = shiftRunsForDay(assignments, p.id, weekday);
              const label = runs.map((r) => `${shortTime(r.startMin)}–${shortTime(r.endMin)}`);
              // Each shift is a small tile in its role's colour: start over end, so both
              // times stay readable in a column only a few characters wide.
              const cell = (
                <View className="flex-1 justify-center gap-0.5 px-[2px] py-1.5">
                  {runs.length === 0 ? (
                    <Text className="text-center text-[11px] text-border">·</Text>
                  ) : (
                    runs.map((r) => {
                      const tone = SLOT_COLORS[r.slot];
                      return (
                        <View
                          key={`${r.startMin}-${r.slot}`}
                          className="items-center rounded-md py-1"
                          style={{
                            backgroundColor: tone.bg,
                            borderColor: tone.line,
                            borderWidth: 1,
                            borderCurve: 'continuous',
                          }}
                        >
                          <Text
                            numberOfLines={1}
                            className="text-[10px] font-bold leading-[12px]"
                            style={{ color: tone.ink, fontVariant: ['tabular-nums'] }}
                          >
                            {shortTime(r.startMin)}
                          </Text>
                          <Text
                            numberOfLines={1}
                            className="text-[10px] leading-[12px]"
                            style={{ color: tone.ink, fontVariant: ['tabular-nums'] }}
                          >
                            {shortTime(r.endMin)}
                          </Text>
                        </View>
                      );
                    })
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
      {slotsUsed.length > 1 ? (
        <View className="flex-row items-center gap-3 border-t border-border px-3 py-2">
          {slotsUsed.map((k) => (
            <View key={k} className="flex-row items-center gap-1.5">
              <View
                className="h-2.5 w-2.5 rounded-[3px]"
                style={{ backgroundColor: SLOT_COLORS[k].bg, borderWidth: 1, borderColor: SLOT_COLORS[k].line }}
              />
              <Text className="text-[10px] font-medium text-muted-foreground">{SLOT_LABEL[k]}</Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}
