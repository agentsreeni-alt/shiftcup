import { Redirect, useRouter } from 'expo-router';
import { Coffee, Sparkles } from 'lucide-react-native';
import { Pressable, Text, View } from 'react-native';
import Animated, { FadeIn, FadeInDown, useReducedMotion } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Btn } from '@/components/kit';
import { useSession } from '@/ctx';
import { C } from '@/lib/colors';
import { EASE_OUT, raisedShadow } from '@/lib/motion';

export default function WelcomeScreen() {
  const router = useRouter();
  const { session } = useSession();
  const reduced = useReducedMotion();
  // First-visit only, so it can afford a short stagger. Never blocks taps.
  const enter = (i: number) =>
    reduced
      ? FadeIn.duration(200)
      : FadeInDown.duration(420).delay(i * 70).easing(EASE_OUT);

  if (session) return <Redirect href="/(app)/home" />;

  return (
    <SafeAreaView className="flex-1 bg-background">
      <View className="flex-1 justify-between px-6 pb-6 pt-10">
        <View className="items-center gap-6 pt-10">
          <Animated.View entering={enter(0)}>
            <View
              className="h-24 w-24 items-center justify-center rounded-[28px]"
              style={[{ backgroundColor: C.pine, borderCurve: 'continuous' }, raisedShadow]}
            >
              <Coffee size={44} color={C.pistachio} strokeWidth={1.8} />
            </View>
          </Animated.View>
          <Animated.View entering={enter(1)} style={{ alignItems: 'center', gap: 10 }}>
            <Text
              className="text-[40px] font-bold leading-[44px] text-foreground"
              style={{ letterSpacing: -1.2 }}
            >
              ShiftCup
            </Text>
            <Text className="max-w-[290px] text-center text-base leading-6 text-muted-foreground">
              Weekly schedules for one café. Your team says when they can work, ShiftCup drafts
              the week, you approve it.
            </Text>
          </Animated.View>
        </View>

        <Animated.View entering={enter(2)} style={{ gap: 12 }}>
          <Btn
            label="Set up my café"
            size="lg"
            onPress={() => router.push('/(auth)/sign-up?mode=setup')}
          />
          <Btn
            label="Explore a sample café"
            variant="secondary"
            size="lg"
            icon={<Sparkles size={18} color={C.pine} />}
            onPress={() => router.push('/(auth)/sign-up?mode=sample')}
          />
          <Pressable
            onPress={() => router.push('/(auth)/sign-in')}
            className="items-center py-3 active:opacity-60"
          >
            <Text className="text-sm font-semibold text-foreground">
              I already have an account
            </Text>
          </Pressable>
          <Pressable
            onPress={() => router.push('/(auth)/join')}
            accessibilityRole="button"
            className="mx-auto mb-2 flex-row items-center rounded-full border border-border px-4 py-2 active:opacity-60"
          >
            <Text className="text-sm font-semibold text-primary">
              Work here? Join with your invite code
            </Text>
          </Pressable>
        </Animated.View>

        <View className="flex-row items-center justify-center gap-3 pt-4">
          {[
            { label: 'Privacy', page: 'privacy' },
            { label: 'Terms', page: 'terms' },
            { label: 'Support', page: 'support' },
          ].map((item, i) => (
            <View key={item.page} className="flex-row items-center gap-3">
              {i > 0 ? <Text className="text-xs text-muted-foreground">·</Text> : null}
              <Pressable
                onPress={() => router.push(`/legal?page=${item.page}`)}
                className="active:opacity-60"
              >
                <Text className="text-xs text-muted-foreground">{item.label}</Text>
              </Pressable>
            </View>
          ))}
        </View>
      </View>
    </SafeAreaView>
  );
}
