import { Redirect, Tabs } from 'expo-router';
import { CalendarDays, Settings, Sun, Users } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Loading } from '@/components/kit';
import { useApp } from '@/lib/app-context';
import { C } from '@/lib/colors';

export const unstable_settings = { initialRouteName: 'today' };

export default function ManagerLayout() {
  const { profile, cafe, loading } = useApp();
  const insets = useSafeAreaInsets();

  if (loading) return <Loading />;
  if (profile?.role !== 'manager') return <Redirect href="/(app)/home" />;
  if (!cafe) return <Redirect href="/(app)/setup" />;

  return (
    <Tabs
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
          paddingTop: 8,
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600', letterSpacing: 0.1 },
      }}
    >
      <Tabs.Screen
        name="today"
        options={{
          title: 'Today',
          tabBarIcon: ({ color, size }) => <Sun size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="schedule"
        options={{
          title: 'Schedule',
          tabBarIcon: ({ color, size }) => <CalendarDays size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="team"
        options={{
          title: 'Team',
          tabBarIcon: ({ color, size }) => <Users size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          tabBarIcon: ({ color, size }) => <Settings size={size} color={color} />,
        }}
      />
    </Tabs>
  );
}
