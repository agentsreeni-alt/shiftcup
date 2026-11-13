import { useRouter } from 'expo-router';
import { ChevronRight, CreditCard, Plus, Trash2 } from 'lucide-react-native';
import { useCallback, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';

import { AppBar, Btn, Card, PressScale, Screen, SectionTitle, Sheet, TimeField } from '@/components/kit';
import {
  addBlock,
  deleteBlock,
  loadBlocks,
  loadStoreHours,
  updateBlock,
  updateCafe,
  updateSettings,
  updateStoreHour,
} from '@/lib/api';
import { useApp } from '@/lib/app-context';
import { C } from '@/lib/colors';
import { DAY_SHORT, fmtRange, } from '@/lib/dates';
import type { CafeSettings, CoverageBlock, StoreHour } from '@/lib/types';
import { useWeekData } from '@/lib/useWeek';
import { currentWeekStart } from '@/lib/api';
import { useFocusEffect } from 'expo-router';

export default function SettingsScreen() {
  const router = useRouter();
  const { cafe, profile, signOut, refresh, isSample } = useApp();
  const weekStart = currentWeekStart();
  const data = useWeekData(weekStart);

  const [name, setName] = useState(cafe?.name ?? '');
  const [hours, setHours] = useState<StoreHour[]>([]);
  const [blocks, setBlocks] = useState<CoverageBlock[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [blockSheet, setBlockSheet] = useState<{
    open: boolean;
    weekday: number;
    editing: CoverageBlock | null;
  }>({ open: false, weekday: 0, editing: null });
  const [deleteOpen, setDeleteOpen] = useState(false);

  const loadLocal = useCallback(async () => {
    if (!cafe) return;
    const [h, b] = await Promise.all([loadStoreHours(cafe.id), loadBlocks(cafe.id)]);
    setHours(h);
    setBlocks(b);
    setName(cafe.name);
  }, [cafe]);

  useFocusEffect(
    useCallback(() => {
      void loadLocal();
    }, [loadLocal]),
  );

  const settings: CafeSettings | null = data.settings;

  const patchSettings = async (patch: Partial<Omit<CafeSettings, 'cafe_id'>>) => {
    if (!cafe) return;
    setBusy(true);
    try {
      await updateSettings(cafe.id, patch);
      await data.reload();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Could not save.');
    } finally {
      setBusy(false);
    }
  };

  const saveName = async () => {
    if (!cafe || !name.trim()) return;
    setBusy(true);
    try {
      await updateCafe(cafe.id, { name: name.trim() });
      await refresh();
      setMessage('Café name saved.');
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Could not save the name.');
    } finally {
      setBusy(false);
    }
  };

  const saveHour = async (weekday: number, openMin: number, closeMin: number) => {
    if (!cafe) return;
    await updateStoreHour(cafe.id, weekday, openMin, closeMin);
    await loadLocal();
  };

  const removeAccount = async () => {
    setBusy(true);
    try {
      const { supabase } = await import('@/client/supabase');
      const { error } = await supabase.functions.invoke('delete-account', { body: {} });
      if (error) throw new Error('Could not delete the account. Contact support.');
      await signOut();
      router.replace('/');
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Could not delete the account.');
      setBusy(false);
    }
  };

  return (
    <Screen>
      <AppBar title="Settings" subtitle={cafe?.name ?? ''} />

      {isSample ? (
        <View className="mb-3 rounded-xl bg-accent px-4 py-2.5">
          <Text className="text-xs font-semibold text-accent-foreground">
            You are exploring a sample café
          </Text>
        </View>
      ) : null}

      <SectionTitle>Café</SectionTitle>
      <Card>
        <Text className="mb-1.5 text-sm font-medium text-foreground">Café name</Text>
        <TextInput
          value={name}
          onChangeText={setName}
          className="rounded-xl border border-input bg-card px-3 py-3 text-base text-foreground"
        />
        <View className="mt-2">
          <Btn label="Save name" size="sm" variant="secondary" loading={busy} onPress={saveName} />
        </View>
      </Card>

      <SectionTitle>Weekly routine</SectionTitle>
      <Card>
        <Text className="mb-2 text-xs text-muted-foreground">Availability due</Text>
        <View className="mb-3 flex-row gap-1">
          {DAY_SHORT.map((d, i) => (
            <PressScale
              key={d}
              onPress={() => patchSettings({ due_weekday: i })}
              className={`flex-1 items-center rounded-lg py-2 ${
                settings?.due_weekday === i ? 'bg-primary' : 'border border-border bg-card'
              }`}
            >
              <Text
                className={`text-[10px] font-semibold ${
                  settings?.due_weekday === i ? 'text-primary-foreground' : 'text-foreground'
                }`}
              >
                {d}
              </Text>
            </PressScale>
          ))}
        </View>
        <View className="mb-4">
          <TimeField
            label="Due time"
            value={settings?.due_min ?? 1200}
            onChange={(v) => patchSettings({ due_min: v })}
          />
        </View>

        <Text className="mb-2 text-xs text-muted-foreground">Publish the schedule on</Text>
        <View className="mb-4 flex-row gap-1">
          {DAY_SHORT.map((d, i) => (
            <PressScale
              key={d}
              onPress={() => patchSettings({ publish_weekday: i })}
              className={`flex-1 items-center rounded-lg py-2 ${
                settings?.publish_weekday === i ? 'bg-primary' : 'border border-border bg-card'
              }`}
            >
              <Text
                className={`text-[10px] font-semibold ${
                  settings?.publish_weekday === i ? 'text-primary-foreground' : 'text-foreground'
                }`}
              >
                {d}
              </Text>
            </PressScale>
          ))}
        </View>

        <View className="flex-row gap-2">
          <View className="flex-1">
            <TimeField
              label="Evening reminder"
              value={settings?.evening_reminder_min ?? 1080}
              onChange={(v) => patchSettings({ evening_reminder_min: v })}
            />
          </View>
          <View className="flex-1">
            <TimeField
              label="Before shift"
              value={settings?.second_reminder_min ?? 60}
              onChange={(v) => patchSettings({ second_reminder_min: v })}
            />
          </View>
        </View>

        <View className="mt-4 flex-row items-center justify-between rounded-xl border border-border px-3 py-2.5">
          <Text className="text-sm text-foreground">Longest shift per day</Text>
          <View className="flex-row items-center gap-2">
            <PressScale
              onPress={() =>
                patchSettings({ max_shift_hours: Math.max(2, (settings?.max_shift_hours ?? 8) - 1) })
              }
              className="h-7 w-7 items-center justify-center rounded-full border border-border"
            >
              <Text className="text-sm font-bold text-foreground">−</Text>
            </PressScale>
            <Text className="w-10 text-center text-sm font-semibold text-foreground">
              {settings?.max_shift_hours ?? 8}h
            </Text>
            <PressScale
              onPress={() =>
                patchSettings({ max_shift_hours: Math.min(14, (settings?.max_shift_hours ?? 8) + 1) })
              }
              className="h-7 w-7 items-center justify-center rounded-full border border-border"
            >
              <Text className="text-sm font-bold text-foreground">+</Text>
            </PressScale>
          </View>
        </View>

        <Text className="mb-2 mt-4 text-xs text-muted-foreground">Send messages by</Text>
        <View className="flex-row gap-2">
          {(['email', 'text'] as const).map((ch) => (
            <PressScale
              key={ch}
              onPress={() => patchSettings({ channel: ch })}
              className={`flex-1 items-center rounded-xl py-2.5 ${
                settings?.channel === ch ? 'bg-primary' : 'border border-border bg-card'
              }`}
            >
              <Text
                className={`text-xs font-semibold ${
                  settings?.channel === ch ? 'text-primary-foreground' : 'text-foreground'
                }`}
              >
                {ch === 'email' ? 'Email' : 'Text message'}
              </Text>
            </PressScale>
          ))}
        </View>
      </Card>

      <SectionTitle>Opening hours</SectionTitle>
      <Card>
        <View className="gap-2">
          {DAY_SHORT.map((d, i) => {
            const row = hours.find((h) => h.weekday === i);
            return (
              <View key={d} className="flex-row items-center gap-2">
                <Text className="w-9 text-xs font-semibold text-foreground">{d}</Text>
                <View className="flex-1">
                  <TimeField
                    compact
                    value={row?.open_min ?? 660}
                    onChange={(v) => saveHour(i, v, row?.close_min ?? 1320)}
                  />
                </View>
                <Text className="text-xs text-muted-foreground">to</Text>
                <View className="flex-1">
                  <TimeField
                    compact
                    value={row?.close_min ?? 1320}
                    onChange={(v) => saveHour(i, row?.open_min ?? 660, v)}
                  />
                </View>
              </View>
            );
          })}
        </View>
      </Card>

      <SectionTitle>Coverage blocks</SectionTitle>
      <View className="gap-2">
        {DAY_SHORT.map((d, i) => {
          const dayBlocks = blocks
            .filter((b) => b.weekday === i)
            .sort((a, b) => a.start_min - b.start_min);
          return (
            <Card key={d}>
              <View className="mb-2 flex-row items-center justify-between">
                <Text className="text-sm font-bold text-foreground">{d}</Text>
                <Pressable
                  onPress={() => setBlockSheet({ open: true, weekday: i, editing: null })}
                  className="flex-row items-center gap-1 px-2 py-1 active:opacity-60"
                >
                  <Plus size={12} color={C.pine} />
                  <Text className="text-xs font-semibold text-primary">Add</Text>
                </Pressable>
              </View>
              {dayBlocks.length === 0 ? (
                <Text className="text-xs text-muted-foreground">No blocks. Add one to cover this day.</Text>
              ) : (
                <View className="gap-1.5">
                  {dayBlocks.map((b) => (
                    <PressScale
                      key={b.id}
                      onPress={() => setBlockSheet({ open: true, weekday: i, editing: b })}
                      className="flex-row items-center justify-between rounded-lg border border-border px-3 py-2"
                    >
                      <Text className="text-sm text-foreground">
                        {fmtRange(b.start_min, b.end_min)}
                      </Text>
                      <Text className="text-[11px] font-semibold uppercase text-muted-foreground">
                        {b.rule === 'two' ? 'Two people' : 'Solo allowed'}
                      </Text>
                    </PressScale>
                  ))}
                </View>
              )}
            </Card>
          );
        })}
      </View>

      <SectionTitle>Plan</SectionTitle>
      <PressScale
        onPress={() => router.push('/(app)/billing')}
        className="flex-row items-center gap-3 rounded-2xl border border-border/60 bg-card shadow-card px-4 py-4"
      >
        <CreditCard size={18} color={C.pine} />
        <View className="flex-1">
          <Text className="text-sm font-semibold text-foreground">Plan and billing</Text>
          <Text className="text-xs text-muted-foreground">
            {isSample
              ? 'Sample café — never billed'
              : cafe?.subscription_status === 'active'
                ? 'Active · $29 per month'
                : cafe?.subscription_status === 'trial'
                  ? 'Free trial'
                  : 'Needs attention'}
          </Text>
        </View>
        <ChevronRight size={16} color={C.muted} />
      </PressScale>

      <SectionTitle>About</SectionTitle>
      <View className="gap-2">
        {[
          { label: 'Privacy Policy', page: 'privacy' },
          { label: 'Terms of Service', page: 'terms' },
          { label: 'Support', page: 'support' },
        ].map((item) => (
          <PressScale
            key={item.page}
            onPress={() => router.push(`/legal?page=${item.page}`)}
            className="flex-row items-center justify-between rounded-xl border border-border bg-card px-4 py-3.5"
          >
            <Text className="text-sm text-foreground">{item.label}</Text>
            <ChevronRight size={16} color={C.muted} />
          </PressScale>
        ))}
      </View>

      <SectionTitle>Account</SectionTitle>
      <View className="gap-2">
        <Text className="text-xs text-muted-foreground">Signed in as {profile?.email}</Text>
        <Btn label="Sign out" variant="ghost" onPress={() => signOut()} />
        <Btn label="Delete my account" variant="ghost" onPress={() => setDeleteOpen(true)} />
      </View>

      {message ? <Text className="mt-3 text-xs text-muted-foreground">{message}</Text> : null}

      <BlockSheet
        state={blockSheet}
        onClose={() => setBlockSheet({ open: false, weekday: 0, editing: null })}
        onSaved={async () => {
          setBlockSheet({ open: false, weekday: 0, editing: null });
          await loadLocal();
          await data.reload();
        }}
      />

      <Sheet visible={deleteOpen} onClose={() => setDeleteOpen(false)} title="Delete your account?">
        <View className="gap-3 pb-4">
          <Text className="text-sm text-muted-foreground">
            This removes your sign-in and your café data. Your team will lose access. This cannot be
            undone.
          </Text>
          <Btn label="Yes, delete my account" variant="danger" loading={busy} onPress={removeAccount} />
          <Btn label="Keep my account" variant="ghost" onPress={() => setDeleteOpen(false)} />
        </View>
      </Sheet>
    </Screen>
  );
}

function BlockSheet({
  state,
  onClose,
  onSaved,
}: {
  state: { open: boolean; weekday: number; editing: CoverageBlock | null };
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const { cafe } = useApp();
  const [start, setStart] = useState(660);
  const [end, setEnd] = useState(900);
  const [rule, setRule] = useState<'solo' | 'two'>('solo');
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const key = state.open ? `${state.weekday}:${state.editing?.id ?? 'new'}` : null;
  if (key && loadedFor !== key) {
    setLoadedFor(key);
    setStart(state.editing?.start_min ?? 660);
    setEnd(state.editing?.end_min ?? 900);
    setRule(state.editing?.rule ?? 'solo');
  }
  if (!key && loadedFor !== null) setLoadedFor(null);

  const save = async () => {
    if (!cafe) return;
    setBusy(true);
    try {
      if (state.editing) {
        await updateBlock(state.editing.id, { start_min: start, end_min: end, rule });
      } else {
        await addBlock({ cafeId: cafe.id, weekday: state.weekday, startMin: start, endMin: end, rule });
      }
      await onSaved();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet
      visible={state.open}
      onClose={onClose}
      title={`${DAY_SHORT[state.weekday]} block`}
    >
      <View className="gap-3 pb-4">
        <View className="flex-row gap-2">
          <View className="flex-1">
            <TimeField label="From" value={start} onChange={setStart} />
          </View>
          <View className="flex-1">
            <TimeField label="To" value={end} onChange={setEnd} />
          </View>
        </View>
        <View className="flex-row gap-2">
          {(['solo', 'two'] as const).map((r) => (
            <PressScale
              key={r}
              onPress={() => setRule(r)}
              className={`flex-1 items-center rounded-xl py-3 ${
                rule === r ? 'bg-primary' : 'border border-border bg-card'
              }`}
            >
              <Text
                className={`text-xs font-semibold ${
                  rule === r ? 'text-primary-foreground' : 'text-foreground'
                }`}
              >
                {r === 'solo' ? 'Solo allowed' : 'Two people'}
              </Text>
            </PressScale>
          ))}
        </View>
        <Text className="text-xs text-muted-foreground">
          {rule === 'solo'
            ? 'One person who can work alone and knows all three jobs.'
            : 'A barista and a scooper, two different people.'}
        </Text>
        <Btn label="Save block" loading={busy} onPress={save} />
        {state.editing ? (
          <Pressable
            onPress={async () => {
              const id = state.editing?.id;
              if (!id) return;
              await deleteBlock(id);
              await onSaved();
            }}
            className="flex-row items-center justify-center gap-1.5 py-2 active:opacity-60"
          >
            <Trash2 size={14} color={C.red} />
            <Text className="text-sm font-semibold text-destructive">Remove this block</Text>
          </Pressable>
        ) : null}
      </View>
    </Sheet>
  );
}
