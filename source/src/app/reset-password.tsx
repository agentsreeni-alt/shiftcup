import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { supabase } from '@/client/supabase';
import { Btn } from '@/components/kit';
import { C } from '@/lib/colors';

/**
 * Opened from the password reset email. Supabase appends the recovery tokens to the
 * URL hash (#access_token=…&refresh_token=…&type=recovery); we turn them into a
 * session, then let the person choose a new password.
 */
export default function ResetPasswordScreen() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [linkError, setLinkError] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    const start = async () => {
      if (Platform.OS !== 'web' || typeof window === 'undefined') {
        setLinkError('Open the reset link from your email in a web browser.');
        return;
      }
      const params = new URLSearchParams(window.location.hash.replace(/^#/, ''));
      const hashError = params.get('error_description');
      if (hashError) {
        setLinkError('This reset link has expired or was already used. Ask for a new one.');
        return;
      }
      const access = params.get('access_token');
      const refresh = params.get('refresh_token');
      if (access && refresh) {
        const { error: sessionError } = await supabase.auth.setSession({
          access_token: access,
          refresh_token: refresh,
        });
        // Keep the tokens out of the address bar and browser history.
        window.history.replaceState(null, '', window.location.pathname);
        if (sessionError) {
          setLinkError('This reset link has expired or was already used. Ask for a new one.');
          return;
        }
        setReady(true);
        return;
      }
      const { data } = await supabase.auth.getSession();
      if (data.session) setReady(true);
      else setLinkError('Open this page from the reset link in your email.');
    };
    void start();
  }, []);

  const save = async () => {
    setError('');
    if (password.length < 6) {
      setError('Use at least 6 characters.');
      return;
    }
    if (password !== confirm) {
      setError('The two passwords do not match.');
      return;
    }
    setBusy(true);
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    setDone(true);
  };

  return (
    <SafeAreaView className="flex-1 bg-background">
      <View style={{ flex: 1, width: '100%', maxWidth: 480, alignSelf: 'center' }}>
        <KeyboardAvoidingView behavior="padding" className="flex-1">
          <ScrollView
            contentContainerClassName="flex-grow justify-center px-6 py-10"
            keyboardShouldPersistTaps="handled"
          >
            <View className="gap-6">
              <View className="gap-2">
                <Text className="text-3xl font-bold text-foreground">
                  {done ? 'Password changed' : 'Choose a new password'}
                </Text>
                <Text className="text-base text-muted-foreground">
                  {done
                    ? 'You are signed in. Use the new password next time.'
                    : 'Pick something you have not used here before.'}
                </Text>
              </View>

              {done ? (
                <Btn
                  label="Open ShiftCup"
                  size="lg"
                  onPress={() => router.replace('/(app)/home')}
                />
              ) : linkError ? (
                <View className="gap-4">
                  <Text className="text-sm text-destructive">{linkError}</Text>
                  <Btn
                    label="Back to sign in"
                    variant="ghost"
                    onPress={() => router.replace('/(auth)/sign-in')}
                  />
                </View>
              ) : !ready ? (
                <Text className="text-sm text-muted-foreground">Checking your link…</Text>
              ) : (
                <View className="gap-4">
                  <View className="gap-1.5">
                    <Text className="text-sm font-medium text-foreground">New password</Text>
                    <TextInput
                      value={password}
                      onChangeText={setPassword}
                      secureTextEntry
                      autoComplete="new-password"
                      placeholder="At least 6 characters"
                      placeholderTextColor={C.muted}
                      className="rounded-xl border border-input bg-card px-4 py-3.5 text-base text-foreground"
                    />
                  </View>
                  <View className="gap-1.5">
                    <Text className="text-sm font-medium text-foreground">Type it again</Text>
                    <TextInput
                      value={confirm}
                      onChangeText={setConfirm}
                      secureTextEntry
                      autoComplete="new-password"
                      returnKeyType="go"
                      onSubmitEditing={save}
                      placeholderTextColor={C.muted}
                      className="rounded-xl border border-input bg-card px-4 py-3.5 text-base text-foreground"
                    />
                  </View>
                  {error ? <Text className="text-sm text-destructive">{error}</Text> : null}
                  <Btn label="Save new password" size="lg" loading={busy} onPress={save} />
                </View>
              )}
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </View>
    </SafeAreaView>
  );
}
