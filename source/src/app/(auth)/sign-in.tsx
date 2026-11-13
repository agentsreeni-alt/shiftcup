import { useRouter } from 'expo-router';
import { Eye, EyeOff } from 'lucide-react-native';
import { useState } from 'react';
import { KeyboardAvoidingView, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { supabase } from '@/client/supabase';
import { Btn } from '@/components/kit';
import { C } from '@/lib/colors';

// Reset links always open the live website, which can set the new password on any device.
const RESET_BASE = 'https://shiftcup-1dd3b.web.app';

export default function SignInScreen() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [info, setInfo] = useState('');

  const forgot = async () => {
    setError('');
    setInfo('');
    const address = email.trim().toLowerCase();
    if (!address.includes('@')) {
      setError('Enter your email above first, then tap “Forgot password?”.');
      return;
    }
    setBusy(true);
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(address, {
      redirectTo: `${RESET_BASE}/reset-password`,
    });
    setBusy(false);
    if (resetError) {
      setError(
        resetError.message.toLowerCase().includes('rate')
          ? 'Too many reset emails. Wait a few minutes and try again.'
          : resetError.message,
      );
      return;
    }
    setInfo(`If ${address} has an account, a reset link is on its way. Check your inbox.`);
  };

  const submit = async () => {
    setError('');
    setInfo('');
    if (!email.trim() || !password) {
      setError('Enter your email and password.');
      return;
    }
    setBusy(true);
    const { error: authError } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });
    setBusy(false);
    if (authError) {
      setError(
        authError.message.toLowerCase().includes('invalid')
          ? 'That email and password do not match. Try again.'
          : authError.message,
      );
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
              <Text className="text-3xl font-bold text-foreground">Welcome back</Text>
              <Text className="text-base text-muted-foreground">
                Sign in to see your café and your week.
              </Text>
            </View>

            <View className="gap-4">
              <View className="gap-1.5">
                <Text className="text-sm font-medium text-foreground">Email</Text>
                <TextInput
                  value={email}
                  onChangeText={setEmail}
                  autoCapitalize="none"
                  keyboardType="email-address"
                  placeholder="you@cafe.com"
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
                    placeholder="Your password"
                    placeholderTextColor={C.muted}
                    returnKeyType="go"
                    onSubmitEditing={submit}
                    className="flex-1 px-4 py-3.5 text-base text-foreground"
                  />
                  <Pressable
                    onPress={() => setShow((s) => !s)}
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
              <Pressable
                onPress={forgot}
                accessibilityRole="button"
                className="self-end py-1 active:opacity-60"
              >
                <Text className="text-sm font-semibold text-primary">Forgot password?</Text>
              </Pressable>
              {error ? <Text className="text-sm text-destructive">{error}</Text> : null}
              {info ? <Text className="text-sm text-foreground">{info}</Text> : null}
            </View>

            <Btn label="Sign in" size="lg" loading={busy} onPress={submit} />

            <Pressable
              onPress={() => router.replace('/')}
              className="items-center py-2 active:opacity-60"
            >
              <Text className="text-sm text-muted-foreground">Back to the welcome screen</Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
