import { Redirect, Tabs } from 'expo-router';
import { CalendarDays, Clock, User } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Loading, TabIcon } from '@/components/kit';
import { useApp } from '@/lib/app-context';
import { C } from '@/lib/colors';
import { tickSelection } from '@/lib/haptics';

export const unstable_settings = { anchor: 'shifts' };

export default function EmployeeLayout() {
  const { profile, loading } = useApp();
  const insets = useSafeAreaInsets();

  if (loading) return <Loading />;
  if (profile?.role !== 'employee') return <Redirect href="/(app)/home" />;

  return (
    <Tabs
      backBehavior="initialRoute"
      // A light tick on every tab switch, like native apps.
      screenListeners={{ tabPress: () => tickSelection() }}
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: C.pine,
        tabBarInactiveTintColor: '#8A968D',
        // Tabs are peers: switching never animates (used dozens of times a session).
        animation: 'none',
        tabBarStyle: {
          backgroundColor: C.white,
          borderTopWidth: 0,
          boxShadow: '0 -1px 0 rgba(20, 56, 44, 0.06), 0 -8px 24px -12px rgba(20, 56, 44, 0.14)',
          height: 64 + insets.bottom,
          paddingBottom: insets.bottom + 6,
          paddingTop: 6,
        },
        // Icon above label at every width (tablets and browsers otherwise put them side by side).
        tabBarLabelPosition: 'below-icon',
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600', letterSpacing: 0.1 },
      }}
    >
      <Tabs.Screen
        name="shifts"
        options={{
          title: 'My shifts',
          tabBarIcon: ({ color, focused }) => (
            <TabIcon icon={CalendarDays} color={color} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="availability"
        options={{
          title: 'Availability',
          tabBarIcon: ({ color, focused }) => (
            <TabIcon icon={Clock} color={color} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Me',
          tabBarIcon: ({ color, focused }) => (
            <TabIcon icon={User} color={color} focused={focused} />
          ),
        }}
      />
    </Tabs>
  );
}
