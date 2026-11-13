import { useRouter } from 'expo-router';
import { ChevronRight } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { supabase } from '@/client/supabase';
import { AppBar, Btn, Card, Screen, SectionTitle, Sheet } from '@/components/kit';
import { useApp } from '@/lib/app-context';
import { C } from '@/lib/colors';

const ROLE_LABEL: Record<string, string> = {
  barista: 'Barista',
  scooper: 'Scooper',
  back_of_house: 'Back of house',
};

export default function EmployeeProfileScreen() {
  const router = useRouter();
  const { employee, cafeName, profile, signOut } = useApp();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  const removeAccount = async () => {
    setBusy(true);
    try {
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
      <AppBar title="Me" subtitle={cafeName ?? ''} />

      <Card>
        <Text className="text-xl font-bold text-foreground">{employee?.name ?? 'Your profile'}</Text>
        <Text className="mt-0.5 text-sm text-muted-foreground">{profile?.email}</Text>
        <View className="mt-3 flex-row flex-wrap gap-1.5">
          {(employee?.roles ?? []).map((r) => (
            <View key={r} className="rounded-full bg-secondary px-3 py-1">
              <Text className="text-[11px] font-semibold text-secondary-foreground">
                {ROLE_LABEL[r] ?? r}
              </Text>
            </View>
          ))}
          {employee?.can_work_alone ? (
            <View className="rounded-full bg-accent px-3 py-1">
              <Text className="text-[11px] font-semibold text-accent-foreground">
                Can work alone
              </Text>
            </View>
          ) : null}
        </View>
        <Text className="mt-3 text-xs text-muted-foreground">
          Up to {employee?.max_hours ?? 20} hours a week.
        </Text>
      </Card>

      <SectionTitle>About</SectionTitle>
      <View className="gap-2">
        {[
          { label: 'Privacy Policy', page: 'privacy' },
          { label: 'Terms of Service', page: 'terms' },
          { label: 'Support', page: 'support' },
        ].map((item) => (
          <Pressable
            key={item.page}
            onPress={() => router.push(`/legal?page=${item.page}`)}
            className="flex-row items-center justify-between rounded-xl border border-border bg-card px-4 py-3.5 active:opacity-70"
          >
            <Text className="text-sm text-foreground">{item.label}</Text>
            <ChevronRight size={16} color={C.muted} />
          </Pressable>
        ))}
      </View>

      <SectionTitle>Account</SectionTitle>
      <View className="gap-2">
        <Btn label="Sign out" variant="ghost" onPress={() => signOut()} />
        <Btn label="Delete my account" variant="ghost" onPress={() => setDeleteOpen(true)} />
      </View>

      {message ? <Text className="mt-3 text-xs text-muted-foreground">{message}</Text> : null}

      <Sheet visible={deleteOpen} onClose={() => setDeleteOpen(false)} title="Delete your account?">
        <View className="gap-3 pb-4">
          <Text className="text-sm text-muted-foreground">
            This removes your sign-in and your availability. Your manager will need to add you
            again. This cannot be undone.
          </Text>
          <Btn label="Yes, delete my account" variant="danger" loading={busy} onPress={removeAccount} />
          <Btn label="Keep my account" variant="ghost" onPress={() => setDeleteOpen(false)} />
        </View>
      </Sheet>
    </Screen>
  );
}
