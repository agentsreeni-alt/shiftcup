import { useLocalSearchParams, useRouter } from 'expo-router';
import { Eye, EyeOff } from 'lucide-react-native';
import { useState } from 'react';
import { KeyboardAvoidingView, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { supabase } from '@/client/supabase';
import { BackButton, Btn } from '@/components/kit';
import { looksLikeEmail } from '@/lib/auth-messages';
import { C } from '@/lib/colors';

export default function JoinScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ code?: string }>();
  const [code, setCode] = useState(
    typeof params.code === 'string' ? params.code.trim().toUpperCase().slice(0, 16) : '',
  );
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [show, setShow] = useState(false);

  const submit = async () => {
    setError('');
    if (!code.trim() || !name.trim() || !email.trim() || !password) {
      setError('Fill in the invite code, your name, email and password.');
      return;
    }
    if (!looksLikeEmail(email)) {
      setError('That email address does not look right. Check it and try again.');
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
      <View style={{ flex: 1, width: '100%', maxWidth: 480, alignSelf: 'center' }}>
        <KeyboardAvoidingView behavior="padding" className="flex-1">
          <View className="px-6 pt-2">
            <BackButton />
          </View>
          <ScrollView
            contentContainerClassName="flex-grow justify-center px-6 pb-10"
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
                    autoComplete="email"
                    keyboardType="email-address"
                    placeholder="you@email.com"
                    placeholderTextColor={C.muted}
                    className="rounded-xl border border-input bg-card px-4 py-3.5 text-base text-foreground"
                  />
                </View>
                <View className="gap-1.5">
                  <Text className="text-sm font-medium text-foreground">Password</Text>
                  <View className="flex-row items-center rounded-xl border border-input bg-card pr-2">
                    <TextInput
                      value={password}
                      onChangeText={setPassword}
                      secureTextEntry={!show}
                      autoComplete="new-password"
                      placeholder="At least 6 characters"
                      placeholderTextColor={C.muted}
                      returnKeyType="go"
                      onSubmitEditing={submit}
                      className="flex-1 px-4 py-3.5 text-base text-foreground"
                    />
                    <Pressable
                      onPress={() => setShow((v) => !v)}
                      accessibilityRole="button"
                      accessibilityLabel={show ? 'Hide password' : 'Show password'}
                      className="p-2"
                    >
                      {show ? (
                        <EyeOff size={18} color={C.muted} />
                      ) : (
                        <Eye size={18} color={C.muted} />
                      )}
                    </Pressable>
                  </View>
                </View>
                {error ? <Text className="text-sm text-destructive">{error}</Text> : null}
              </View>

              <Btn label="Join my café" size="lg" loading={busy} onPress={submit} />

              <Text className="-mt-2 text-center text-xs leading-5 text-muted-foreground">
                By joining you agree to the{' '}
                <Text
                  className="font-semibold text-primary underline"
                  onPress={() => router.push('/legal?page=terms')}
                >
                  Terms
                </Text>{' '}
                and{' '}
                <Text
                  className="font-semibold text-primary underline"
                  onPress={() => router.push('/legal?page=privacy')}
                >
                  Privacy Policy
                </Text>
                .
              </Text>

              <Pressable
                onPress={() => router.replace('/')}
                className="items-center py-2 active:opacity-60"
              >
                <Text className="text-sm text-muted-foreground">Back</Text>
              </Pressable>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </View>
    </SafeAreaView>
  );
}
