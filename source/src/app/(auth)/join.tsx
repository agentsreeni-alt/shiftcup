import { useRouter } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { supabase } from '@/client/supabase';
import { Btn } from '@/components/kit';
import { C } from '@/lib/colors';

export default function JoinScreen() {
  const router = useRouter();
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setError('');
    if (!code.trim() || !name.trim() || !email.trim() || !password) {
      setError('Fill in the invite code, your name, email and password.');
      return;
    }
    if (password.length < 6) {
      setError('Use at least 6 characters for your password.');
      return;
    }
    setBusy(true);
    const { data, error: fnError } = await supabase.functions.invoke('join-cafe', {
      body: {
        invite_code: code.trim().toUpperCase(),
        name: name.trim(),
        email: email.trim().toLowerCase(),
        password,
      },
    });
    if (fnError) {
      let message = 'Could not join. Check the invite code and try again.';
      try {
        const text = await fnError.context?.text();
        if (text) {
          const parsed = JSON.parse(text) as { message?: string };
          if (parsed.message) message = parsed.message;
        }
      } catch {
        // keep the friendly default
      }
      setBusy(false);
      setError(message);
      return;
    }
    if (data?.message) {
      setBusy(false);
      setError(String(data.message));
      return;
    }
    const { error: authError } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });
    setBusy(false);
    if (authError) {
      setError('Account created. Sign in with your email and password.');
      return;
    }
    router.replace('/(app)/home');
  };

  return (
    <SafeAreaView className="flex-1 bg-background">
      <KeyboardAvoidingView behavior="padding" className="flex-1">
        <ScrollView
          contentContainerClassName="flex-grow justify-center px-6 py-10"
          keyboardShouldPersistTaps="handled"
        >
          <View className="gap-6">
            <View className="gap-2">
              <Text className="text-3xl font-bold text-foreground">Join your café</Text>
              <Text className="text-base text-muted-foreground">
                Your manager gives you a short invite code. ShiftCup is free for you.
              </Text>
            </View>

            <View className="gap-4">
              <View className="gap-1.5">
                <Text className="text-sm font-medium text-foreground">Invite code</Text>
                <TextInput
                  value={code}
                  onChangeText={(v) => setCode(v.toUpperCase())}
                  autoCapitalize="characters"
                  placeholder="e.g. 4F2A9C1B"
                  placeholderTextColor={C.muted}
                  className="rounded-xl border border-input bg-card px-4 py-3.5 text-base tracking-widest text-foreground"
                />
              </View>
              <View className="gap-1.5">
                <Text className="text-sm font-medium text-foreground">Your first name</Text>
                <TextInput
                  value={name}
                  onChangeText={setName}
                  placeholder="Maya"
                  placeholderTextColor={C.muted}
                  className="rounded-xl border border-input bg-card px-4 py-3.5 text-base text-foreground"
                />
              </View>
              <View className="gap-1.5">
                <Text className="text-sm font-medium text-foreground">Email</Text>
                <TextInput
                  value={email}
                  onChangeText={setEmail}
                  autoCapitalize="none"
                  keyboardType="email-address"
                  placeholder="you@email.com"
                  placeholderTextColor={C.muted}
                  className="rounded-xl border border-input bg-card px-4 py-3.5 text-base text-foreground"
                />
              </View>
              <View className="gap-1.5">
                <Text className="text-sm font-medium text-foreground">Password</Text>
                <TextInput
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry
                  placeholder="At least 6 characters"
                  placeholderTextColor={C.muted}
                  className="rounded-xl border border-input bg-card px-4 py-3.5 text-base text-foreground"
                />
              </View>
              {error ? <Text className="text-sm text-destructive">{error}</Text> : null}
            </View>

            <Btn label="Join my café" size="lg" loading={busy} onPress={submit} />

            <Pressable
              onPress={() => router.replace('/')}
              className="items-center py-2 active:opacity-60"
            >
              <Text className="text-sm text-muted-foreground">Back</Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
