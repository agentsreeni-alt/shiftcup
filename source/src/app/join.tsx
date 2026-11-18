import { useLocalSearchParams, useRouter } from 'expo-router';
import { Eye, EyeOff } from 'lucide-react-native';
import { type ElementRef, useRef, useState } from 'react';
import { KeyboardAvoidingView, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { supabase } from '@/client/supabase';
import { useSession } from '@/ctx';
import { useApp } from '@/lib/app-context';
import { BackButton, Btn } from '@/components/kit';
import { looksLikeEmail } from '@/lib/auth-messages';
import { C } from '@/lib/colors';
import { useKeyboardSubmit } from '@/lib/useKeyboardSubmit';

export default function JoinScreen() {
  const codeRef = useRef<ElementRef<typeof TextInput>>(null);
  const nameRef = useRef<ElementRef<typeof TextInput>>(null);
  const emailRef = useRef<ElementRef<typeof TextInput>>(null);
  const passwordRef = useRef<ElementRef<typeof TextInput>>(null);
  const onKeyboardSubmit = useKeyboardSubmit(() => submit());
  const router = useRouter();
  const { session } = useSession();
  const { refresh } = useApp();
  const [signingOut, setSigningOut] = useState(false);
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
    const cleanEmail = email.trim().toLowerCase();
    const body = {
      invite_code: code.trim().toUpperCase(),
      name: name.trim(),
      email: cleanEmail,
      password,
    };

    const readError = async (fnError: unknown): Promise<{ message: string; status: number }> => {
      let message = 'Could not join. Check the invite code and try again.';
      let status = 0;
      try {
        const ctx = (fnError as { context?: Response }).context;
        status = ctx?.status ?? 0;
        const text = await ctx?.text();
        if (text) {
          const parsed = JSON.parse(text) as { message?: string };
          if (parsed.message) message = parsed.message;
        }
      } catch {
        // keep the friendly default
      }
      return { message, status };
    };

    const { data, error: fnError } = await supabase.functions.invoke('join-cafe', { body });
    if (fnError) {
      const { message, status } = await readError(fnError);
      // They already have a ShiftCup account with this email: sign in with it and join.
      if (status === 409 && message.toLowerCase().includes('already has an account')) {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email: cleanEmail,
          password,
        });
        if (signInError) {
          setBusy(false);
          setError(
            'That email already has a ShiftCup account. Enter its password to join with it, or use “Forgot password” on the sign-in page.',
          );
          return;
        }
        const linked = await supabase.functions.invoke('join-cafe', {
          body: { invite_code: body.invite_code, link_existing: true },
        });
        if (linked.error) {
          const again = await readError(linked.error);
          await supabase.auth.signOut();
          setBusy(false);
          setError(again.message);
          return;
        }
        await refresh();
        setBusy(false);
        router.replace('/(app)/home');
        return;
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
      email: cleanEmail,
      password,
    });
    setBusy(false);
    if (authError) {
      setError('Account created. Sign in with your email and password.');
      return;
    }
    router.replace('/(app)/home');
  };

  // Someone is signed in on this phone (often the manager testing the link). Joining
  // makes a separate account, so sign out first; the code stays filled in.
  if (session) {
    return (
      <SafeAreaView className="flex-1 bg-background">
        <View style={{ flex: 1, width: '100%', maxWidth: 480, alignSelf: 'center' }}>
          <View className="flex-1 justify-center gap-5 px-6">
            <Text className="text-3xl font-bold text-foreground">Join your café</Text>
            <Text className="text-base leading-6 text-muted-foreground">
              This device is signed in as {session.user.email}. To join with invite code{' '}
              <Text className="font-bold text-foreground">{code || 'from your manager'}</Text>, sign
              out first. You can sign back in any time.
            </Text>
            <Btn
              label="Sign out and join"
              size="lg"
              loading={signingOut}
              onPress={async () => {
                setSigningOut(true);
                await supabase.auth.signOut();
                setSigningOut(false);
              }}
            />
            <Btn
              label="Stay signed in"
              variant="ghost"
              onPress={() => router.replace('/(app)/home')}
            />
          </View>
        </View>
      </SafeAreaView>
    );
  }

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
                    ref={codeRef}
                    value={code}
                    returnKeyType="next"
                    blurOnSubmit={false}
                    onSubmitEditing={() => nameRef.current?.focus()}
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
                    ref={nameRef}
                    value={name}
                    returnKeyType="next"
                    blurOnSubmit={false}
                    onSubmitEditing={() => emailRef.current?.focus()}
                    onChangeText={setName}
                    placeholder="Maya"
                    placeholderTextColor={C.muted}
                    className="rounded-xl border border-input bg-card px-4 py-3.5 text-base text-foreground"
                  />
                </View>
                <View className="gap-1.5">
                  <Text className="text-sm font-medium text-foreground">Email</Text>
                  <TextInput
                    ref={emailRef}
                    value={email}
                    returnKeyType="next"
                    blurOnSubmit={false}
                    onSubmitEditing={() => passwordRef.current?.focus()}
                    textContentType="emailAddress"
                    autoCorrect={false}
                    spellCheck={false}
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
                      ref={passwordRef}
                      value={password}
                      textContentType="newPassword"
                      onChangeText={setPassword}
                      secureTextEntry={!show}
                      autoComplete="new-password"
                      placeholder="At least 6 characters"
                      placeholderTextColor={C.muted}
                      returnKeyType="go"
                      onSubmitEditing={onKeyboardSubmit}
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
