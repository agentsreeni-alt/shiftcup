import { Redirect, Tabs } from 'expo-router';
import { useEffect, useState } from 'react';
import { CalendarDays, Settings, Sun, Users } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Loading, TabIcon } from '@/components/kit';
import { loadCoverRequests, loadPendingAvailabilityRequests, onInboxChanged } from '@/lib/api';
import { useApp } from '@/lib/app-context';
import { C } from '@/lib/colors';
import { tickSelection } from '@/lib/haptics';

export const unstable_settings = { anchor: 'today' };

export default function ManagerLayout() {
  const { profile, cafe, loading } = useApp();
  const insets = useSafeAreaInsets();
  const [waiting, setWaiting] = useState(0);
  const cafeId = cafe?.id;

  // A count on the Today tab for things the team is waiting on: availability requests and
  // people who can't make a shift. Refreshed every minute while the app is open.
  useEffect(() => {
    if (!cafeId) return;
    let alive = true;
    const check = async () => {
      try {
        const [asks, covers] = await Promise.all([
          loadPendingAvailabilityRequests(cafeId),
          loadCoverRequests(cafeId),
        ]);
        const coverDays = new Set(
          covers.map((c) => `${c.employee_id}:${c.week_start}:${c.weekday}`),
        );
        if (alive) setWaiting(asks.length + coverDays.size);
      } catch {
        // The badge is a hint only; the Today screen shows the real state.
      }
    };
    void check();
    const timer = setInterval(check, 60_000);
    const off = onInboxChanged(check);
    return () => {
      alive = false;
      off();
      clearInterval(timer);
    };
  }, [cafeId]);

  if (loading) return <Loading />;
  if (profile?.role !== 'manager') return <Redirect href="/(app)/home" />;
  if (!cafe) return <Redirect href="/(app)/setup" />;

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
        name="today"
        options={{
          title: 'Today',
          tabBarBadge: waiting > 0 ? waiting : undefined,
          tabBarBadgeStyle: { backgroundColor: C.red, color: C.white, fontSize: 11 },
          tabBarIcon: ({ color, focused }) => (
            <TabIcon icon={Sun} color={color} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="schedule"
        options={{
          title: 'Schedule',
          tabBarIcon: ({ color, focused }) => (
            <TabIcon icon={CalendarDays} color={color} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="team"
        options={{
          title: 'Team',
          tabBarIcon: ({ color, focused }) => (
            <TabIcon icon={Users} color={color} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          tabBarIcon: ({ color, focused }) => (
            <TabIcon icon={Settings} color={color} focused={focused} />
          ),
        }}
      />
    </Tabs>
  );
}
