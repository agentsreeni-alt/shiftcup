import { useLocalSearchParams, useRouter } from 'expo-router';
import { ArrowLeft, Check } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Btn, TimeField } from '@/components/kit';
import { createCafe, createSampleCafe } from '@/lib/api';
import { useApp } from '@/lib/app-context';
import { C } from '@/lib/colors';
import { fmtTime } from '@/lib/dates';
import { useKeyboardSubmit } from '@/lib/useKeyboardSubmit';

const STEPS = ['Café name', 'Opening hours', 'Your team'];

// First names typed at setup, trimmed and without repeats ("Ana, ana" is one person).
function parseNames(text: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of text.split(/[,\n]/)) {
    const name = raw.trim().replace(/\s+/g, ' ');
    if (!name || seen.has(name.toLowerCase())) continue;
    seen.add(name.toLowerCase());
    out.push(name);
  }
  return out;
}

// Same 3-hour split the database uses when it creates the blocks.
function blockPreview(open: number, close: number): string {
  const parts: string[] = [];
  for (let s = open; s < close; s = Math.min(s + 180, close)) {
    parts.push(`${fmtTime(s)} to ${fmtTime(Math.min(s + 180, close))}`);
  }
  return parts.join(', ');
}

export default function SetupScreen() {
  const onKeyboardSubmit = useKeyboardSubmit(() => next());
  const router = useRouter();
  const params = useLocalSearchParams<{ mode?: string }>();
  const isSample = params.mode === 'sample';
  const { profile, refresh } = useApp();

  const [step, setStep] = useState(0);
  const [name, setName] = useState('');
  const [openMin, setOpenMin] = useState(660);
  const [closeMin, setCloseMin] = useState(1320);
  const [teamText, setTeamText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const started = useRef(false);

  useEffect(() => {
    if (!isSample || started.current || !profile) return;
    started.current = true;
    setBusy(true);
    (async () => {
      try {
        await createSampleCafe(profile.id);
        await refresh();
        router.replace('/(app)/(manager)/today');
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not load the sample café.');
        setBusy(false);
      }
    })();
  }, [isSample, profile, refresh, router]);

  const finish = async () => {
    if (!profile) return;
    setError('');
    if (!name.trim()) {
      setError('Give your café a name.');
      setStep(0);
      return;
    }
    if (closeMin <= openMin) {
      setError('Closing time must be after opening time.');
      setStep(1);
      return;
    }
    setBusy(true);
    try {
      const firstNames = parseNames(teamText);
      await createCafe({
        userId: profile.id,
        name,
        openMin,
        closeMin,
        firstNames,
      });
      await refresh();
      router.replace('/(app)/(manager)/today');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create the café.');
      setBusy(false);
    }
  };

  if (isSample) {
    return (
      <SafeAreaView className="flex-1 bg-background">
        <View className="flex-1 items-center justify-center gap-4 px-8">
          <ActivityIndicator size="large" color={C.pine} />
          <Text className="text-center text-base font-semibold text-foreground">
            Setting up the sample café
          </Text>
          <Text className="text-center text-sm text-muted-foreground">
            Seven people, a week of availability, and one gap to fix.
          </Text>
          {error ? <Text className="text-center text-sm text-destructive">{error}</Text> : null}
        </View>
      </SafeAreaView>
    );
  }

  const names = parseNames(teamText);

  const next = () => {
    if (step === 0 && !name.trim()) {
      setError('Give your café a name.');
      return;
    }
    if (step === 1 && closeMin <= openMin) {
      setError('Closing time must be after opening time.');
      return;
    }
    setError('');
    setStep((s) => s + 1);
  };

  return (
    <SafeAreaView className="flex-1 bg-background">
      <View style={{ flex: 1, width: '100%', maxWidth: 480, alignSelf: 'center' }}>
        <KeyboardAvoidingView behavior="padding" className="flex-1">
          <ScrollView
            contentContainerClassName="flex-grow px-6 pb-10 pt-4"
            keyboardShouldPersistTaps="handled"
          >
            <View className="mb-6 flex-row items-center gap-3">
              {step > 0 ? (
                <Pressable
                  onPress={() => {
                    setError('');
                    setStep((s) => s - 1);
                  }}
                  accessibilityRole="button"
                  accessibilityLabel="Previous step"
                  className="p-2 active:opacity-60"
                >
                  <ArrowLeft size={20} color={C.pine} />
                </Pressable>
              ) : (
                <View className="w-9" />
              )}
              <View className="flex-1 flex-row gap-1.5">
                {STEPS.map((s, i) => (
                  <View
                    key={s}
                    className={`h-1.5 flex-1 rounded-full ${
                      i <= step ? 'bg-primary' : 'bg-border'
                    }`}
                  />
                ))}
              </View>
            </View>

            <Text className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Step {step + 1} of 3
            </Text>

            {step === 0 ? (
              <View className="mt-2 gap-5">
                <Text className="text-3xl font-bold text-foreground">
                  What is your café called?
                </Text>
                <Text className="text-base text-muted-foreground">
                  This is the name your team sees when they open ShiftCup.
                </Text>
                <TextInput
                  value={name}
                  onChangeText={(v) => {
                    setName(v);
                    if (error) setError('');
                  }}
                  autoFocus
                  returnKeyType="next"
                  onSubmitEditing={onKeyboardSubmit}
                  maxLength={60}
                  placeholder="Dumont Creamery & Cafe"
                  placeholderTextColor={C.muted}
                  className="rounded-xl border border-input bg-card px-4 py-4 text-lg text-foreground"
                />
              </View>
            ) : null}

            {step === 1 ? (
              <View className="mt-2 gap-5">
                <Text className="text-3xl font-bold text-foreground">When are you open?</Text>
                <Text className="text-base text-muted-foreground">
                  We use these hours to build your coverage blocks. You can change them later.
                </Text>
                <View className="flex-row gap-3">
                  <View className="flex-1">
                    <TimeField
                      label="Opens"
                      value={openMin}
                      onChange={(v) => {
                        setOpenMin(v);
                        setError('');
                      }}
                    />
                  </View>
                  <View className="flex-1">
                    <TimeField
                      label="Closes"
                      value={closeMin}
                      onChange={(v) => {
                        setCloseMin(v);
                        setError('');
                      }}
                    />
                  </View>
                </View>
                {closeMin > openMin ? (
                  <View className="rounded-xl bg-muted p-4">
                    <Text className="text-sm text-muted-foreground">
                      Each day is split into shifts: {blockPreview(openMin, closeMin)}.
                    </Text>
                  </View>
                ) : null}
              </View>
            ) : null}

            {step === 2 ? (
              <View className="mt-2 gap-5">
                <Text className="text-3xl font-bold text-foreground">Who is on your team?</Text>
                <Text className="text-base text-muted-foreground">
                  Type first names, separated by commas. You can add roles, ratings and pay later.
                </Text>
                <TextInput
                  value={teamText}
                  onChangeText={setTeamText}
                  multiline
                  placeholder="Maya, Leo, Priya, Sam"
                  placeholderTextColor={C.muted}
                  className="min-h-[110px] rounded-xl border border-input bg-card px-4 py-3.5 text-base text-foreground"
                />
                {names.length > 0 ? (
                  <View className="flex-row flex-wrap gap-2">
                    {names.map((n) => (
                      <View key={n} className="rounded-full bg-accent px-3 py-1">
                        <Text className="text-xs font-semibold text-accent-foreground">{n}</Text>
                      </View>
                    ))}
                  </View>
                ) : null}
              </View>
            ) : null}

            {error ? <Text className="mt-4 text-sm text-destructive">{error}</Text> : null}

            <View className="mt-auto gap-3 pt-8">
              {step < 2 ? (
                <Btn label="Continue" size="lg" onPress={next} />
              ) : (
                <Btn
                  label="Create my café"
                  size="lg"
                  loading={busy}
                  icon={<Check size={18} color={C.cream} />}
                  onPress={finish}
                />
              )}
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </View>
    </SafeAreaView>
  );
}
