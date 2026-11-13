import { useRouter } from 'expo-router';
import { Coffee, Sparkles } from 'lucide-react-native';
import { Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Btn } from '@/components/kit';
import { C } from '@/lib/colors';

export default function WelcomeScreen() {
  const router = useRouter();

  return (
    <SafeAreaView className="flex-1 bg-background">
      <View className="flex-1 justify-between px-6 pb-6 pt-10">
        <View className="items-center gap-5 pt-8">
          <View
            className="h-24 w-24 items-center justify-center rounded-3xl"
            style={{ backgroundColor: C.pine, borderCurve: 'continuous' }}
          >
            <Coffee size={44} color={C.pistachio} strokeWidth={1.8} />
          </View>
          <View className="items-center gap-2">
            <Text className="text-4xl font-bold tracking-tight text-foreground">ShiftCup</Text>
            <Text className="max-w-[280px] text-center text-base leading-6 text-muted-foreground">
              Weekly schedules for one café. Your team says when they can work, ShiftCup drafts
              the week, you approve it.
            </Text>
          </View>
        </View>

        <View className="gap-3">
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
            className="items-center pb-2 active:opacity-60"
          >
            <Text className="text-sm text-muted-foreground">
              I have an invite code from my manager
            </Text>
          </Pressable>
        </View>

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
