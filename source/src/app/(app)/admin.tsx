import { useRouter } from 'expo-router';
import { ArrowLeft } from 'lucide-react-native';
import { useCallback, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { AppBar, Btn, Card, Screen, SectionTitle } from '@/components/kit';
import { loadAllCafes } from '@/lib/api';
import { useApp } from '@/lib/app-context';
import { C } from '@/lib/colors';
import { fmtDateShort } from '@/lib/dates';
import type { Cafe } from '@/lib/types';
import { useFocusEffect } from 'expo-router';

export default function AdminScreen() {
  const router = useRouter();
  const { signOut } = useApp();
  const [cafes, setCafes] = useState<Cafe[]>([]);
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      (async () => {
        try {
          setCafes(await loadAllCafes());
        } finally {
          setLoading(false);
        }
      })();
    }, []),
  );

  const paying = cafes.filter((c) => c.subscription_status === 'active' && !c.is_sample);
  const mrr = paying.length * 29;

  return (
    <Screen>
      <View className="mb-2 flex-row items-center gap-2">
        <Pressable onPress={() => router.replace('/(app)/home')} className="p-2 active:opacity-60">
          <ArrowLeft size={20} color={C.pine} />
        </Pressable>
        <Text className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Owner only
        </Text>
      </View>
      <AppBar title="All cafés" subtitle={`${cafes.length} accounts`} />

      <View className="mb-4 flex-row gap-2">
        <View className="flex-1 rounded-2xl border border-border/60 bg-card shadow-card p-4">
          <Text className="text-2xl font-bold text-foreground">${mrr}</Text>
          <Text className="text-xs text-muted-foreground">Monthly revenue</Text>
        </View>
        <View className="flex-1 rounded-2xl border border-border/60 bg-card shadow-card p-4">
          <Text className="text-2xl font-bold text-foreground">{paying.length}</Text>
          <Text className="text-xs text-muted-foreground">Paying cafés</Text>
        </View>
      </View>

      <SectionTitle>Cafés</SectionTitle>
      {loading ? (
        <Text className="text-sm text-muted-foreground">Loading…</Text>
      ) : cafes.length === 0 ? (
        <Text className="text-sm text-muted-foreground">No cafés yet.</Text>
      ) : (
        <View className="gap-2">
          {cafes.map((c) => (
            <Card key={c.id}>
              <View className="flex-row items-center justify-between">
                <View className="flex-1">
                  <Text className="text-sm font-semibold text-foreground">{c.name}</Text>
                  <Text className="mt-0.5 text-xs text-muted-foreground">
                    {c.is_sample ? 'Sample' : 'Live'} · trial ends {fmtDateShort(c.trial_ends_at)}
                    {c.paid_until ? ` · paid to ${fmtDateShort(c.paid_until)}` : ''}
                  </Text>
                </View>
                <Text
                  className="text-[11px] font-bold uppercase"
                  style={{
                    color:
                      c.subscription_status === 'active'
                        ? C.soloInk
                        : c.subscription_status === 'trial'
                          ? C.pine
                          : C.red,
                  }}
                >
                  {c.subscription_status}
                </Text>
              </View>
            </Card>
          ))}
        </View>
      )}

      <View className="mt-6">
        <Btn label="Sign out" variant="ghost" onPress={() => signOut()} />
      </View>
    </Screen>
  );
}
