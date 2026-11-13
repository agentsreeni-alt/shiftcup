import { useLocalSearchParams, useRouter } from 'expo-router';
import { Check } from 'lucide-react-native';
import { useState } from 'react';
import { KeyboardAvoidingView, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { supabase } from '@/client/supabase';
import { Btn } from '@/components/kit';
import { C } from '@/lib/colors';

export default function SignUpScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ mode?: string }>();
  const mode = params.mode === 'sample' ? 'sample' : 'setup';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [agreed, setAgreed] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setError('');
    if (!email.trim() || !password) {
      setError('Enter an email and a password.');
      return;
    }
    if (password.length < 6) {
      setError('Use at least 6 characters for your password.');
      return;
    }
    if (!agreed) {
      setError('Please accept the Terms of Service and Privacy Policy.');
      return;
    }
    setBusy(true);
    const { data, error: authError } = await supabase.auth.signUp({
      email: email.trim().toLowerCase(),
      password,
      options: { data: { role: 'manager' } },
    });
    setBusy(false);
    if (authError) {
      setError(
        authError.message.toLowerCase().includes('already')
          ? 'That email already has an account. Sign in instead.'
          : authError.message,
      );
      return;
    }
    if (!data.session) {
      setError('Check your email to confirm the account, then sign in.');
      return;
    }
    router.replace(mode === 'sample' ? '/(app)/setup?mode=sample' : '/(app)/setup');
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
              <Text className="text-3xl font-bold text-foreground">
                {mode === 'sample' ? 'Explore a sample café' : 'Create your manager account'}
              </Text>
              <Text className="text-base text-muted-foreground">
                {mode === 'sample'
                  ? 'You will get a full café with seven people and a week of availability to try.'
                  : 'One account runs your café. Your team joins free with an invite code.'}
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
                <TextInput
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry
                  placeholder="At least 6 characters"
                  placeholderTextColor={C.muted}
                  className="rounded-xl border border-input bg-card px-4 py-3.5 text-base text-foreground"
                />
              </View>

              <Pressable
                onPress={() => setAgreed((a) => !a)}
                className="flex-row items-start gap-3 py-1 active:opacity-70"
              >
                <View
                  className={`mt-0.5 h-5 w-5 items-center justify-center rounded-md border ${
                    agreed ? 'border-primary bg-primary' : 'border-border bg-card'
                  }`}
                >
                  {agreed ? <Check size={13} color={C.cream} strokeWidth={3} /> : null}
                </View>
                <Text className="flex-1 text-sm leading-5 text-muted-foreground">
                  I agree to the Terms of Service and Privacy Policy.
                </Text>
              </Pressable>

              {error ? <Text className="text-sm text-destructive">{error}</Text> : null}
            </View>

            <Btn label="Create account" size="lg" loading={busy} onPress={submit} />

            <Pressable
              onPress={() => router.replace('/(auth)/sign-in')}
              className="items-center py-2 active:opacity-60"
            >
              <Text className="text-sm text-muted-foreground">
                I already have an account — sign in
              </Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
