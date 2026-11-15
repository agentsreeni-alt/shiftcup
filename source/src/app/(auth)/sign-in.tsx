import { useRouter } from 'expo-router';
import { Coffee, Eye, EyeOff, Lock, Mail } from 'lucide-react-native';
import { type ElementRef, useRef, useState } from 'react';
import { KeyboardAvoidingView, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { supabase } from '@/client/supabase';
import { Appear, BackButton, Btn } from '@/components/kit';
import { friendlyAuthError, looksLikeEmail } from '@/lib/auth-messages';
import { C } from '@/lib/colors';
import { useKeyboardSubmit } from '@/lib/useKeyboardSubmit';

// Reset links always open the live website, which can set the new password on any device.
const RESET_BASE = 'https://shiftcup-1dd3b.web.app';

export default function SignInScreen() {
  const emailRef = useRef<ElementRef<typeof TextInput>>(null);
  const passwordRef = useRef<ElementRef<typeof TextInput>>(null);
  const onKeyboardSubmit = useKeyboardSubmit(() => submit());
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [info, setInfo] = useState('');
  const [focus, setFocus] = useState<'email' | 'password' | null>(null);
  // Fixed classes and a style-only border colour: changing classes while typing can rebuild
  // the native input on iOS and send keystrokes to the wrong field.
  const BOX = 'flex-row items-center gap-2 rounded-2xl border-[1.5px] bg-card pl-4 pr-2';
  const boxStyle = (f: 'email' | 'password') => ({
    borderCurve: 'continuous' as const,
    borderColor: focus === f ? C.pine : error ? C.red : C.border,
  });

  const forgot = async () => {
    setError('');
    setInfo('');
    const address = email.trim().toLowerCase();
    if (!looksLikeEmail(address)) {
      setError('Enter your email above first, then tap “Forgot password?”.');
      return;
    }
    setBusy(true);
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(address, {
      redirectTo: `${RESET_BASE}/reset-password`,
    });
    setBusy(false);
    if (resetError) {
      setError(friendlyAuthError(resetError.message));
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
      setError(friendlyAuthError(authError.message));
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
              <Appear index={0}>
                <View className="gap-4">
                  <View
                    className="h-14 w-14 items-center justify-center rounded-[18px]"
                    style={{
                      backgroundColor: C.pine,
                      borderCurve: 'continuous',
                      boxShadow: '0 12px 28px -12px rgba(20, 56, 44, 0.6)',
                    }}
                  >
                    <Coffee size={26} color={C.pistachio} strokeWidth={2.2} />
                  </View>
                  <View className="gap-1.5">
                    <Text
                      className="text-[32px] font-bold leading-[38px] text-foreground"
                      style={{ letterSpacing: -0.8 }}
                    >
                      Welcome back
                    </Text>
                    <Text className="text-base text-muted-foreground">
                      Sign in to see your café and your week.
                    </Text>
                  </View>
                </View>
              </Appear>

              <View className="gap-4">
                <View className="gap-1.5">
                  <Text className="text-sm font-medium text-foreground">Email</Text>
                  <View className={BOX} style={boxStyle('email')}>
                    <Mail size={18} color={focus === 'email' ? C.pine : C.muted} />
                    <TextInput
                      ref={emailRef}
                      onFocus={() => setFocus('email')}
                      onBlur={() => setFocus(null)}
                      value={email}
                      returnKeyType="next"
                      blurOnSubmit={false}
                      onSubmitEditing={() => passwordRef.current?.focus()}
                      textContentType="emailAddress"
                      autoCorrect={false}
                      spellCheck={false}
                      onChangeText={(t) => {
                        setEmail(t);
                        if (error) setError('');
                      }}
                      autoCapitalize="none"
                      autoComplete="email"
                      keyboardType="email-address"
                      placeholder="you@cafe.com"
                      placeholderTextColor={C.muted}
                      className="flex-1 py-3.5 pr-2 text-base text-foreground"
                      style={{ outlineStyle: 'none' } as object}
                    />
                  </View>
                </View>
                <View className="gap-1.5">
                  <Text className="text-sm font-medium text-foreground">Password</Text>
                  <View className={BOX} style={boxStyle('password')}>
                    <Lock size={18} color={focus === 'password' ? C.pine : C.muted} />
                    <TextInput
                      ref={passwordRef}
                      onFocus={() => setFocus('password')}
                      onBlur={() => setFocus(null)}
                      style={{ outlineStyle: 'none' } as object}
                      value={password}
                      textContentType="password"
                      onChangeText={(t) => {
                        setPassword(t);
                        if (error) setError('');
                      }}
                      secureTextEntry={!show}
                      placeholder="Your password"
                      placeholderTextColor={C.muted}
                      returnKeyType="go"
                      onSubmitEditing={onKeyboardSubmit}
                      className="flex-1 py-3.5 pr-2 text-base text-foreground"
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
      </View>
    </SafeAreaView>
  );
}
