import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import { supabase } from '@/client/supabase';
import { useSession } from '@/ctx';
import {
  loadCafeForManager,
  loadEmployeeCafe,
  loadEmployeeSelf,
  loadProfile,
} from '@/lib/api';
import type { Cafe, EmployeeSelf, Profile } from '@/lib/types';

type AppContextValue = {
  profile: Profile | null;
  cafe: Cafe | null;
  employee: EmployeeSelf | null;
  cafeName: string;
  isSample: boolean;
  loading: boolean;
  hasAccess: boolean;
  trialDaysLeft: number;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
};

const AppContext = createContext<AppContextValue>({
  profile: null,
  cafe: null,
  employee: null,
  cafeName: '',
  isSample: false,
  loading: true,
  hasAccess: false,
  trialDaysLeft: 0,
  refresh: async () => {},
  signOut: async () => {},
});

export function AppProvider({ children }: { children: React.ReactNode }) {
  const { session } = useSession();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [cafe, setCafe] = useState<Cafe | null>(null);
  const [employee, setEmployee] = useState<EmployeeSelf | null>(null);
  const [cafeName, setCafeName] = useState('');
  const [isSample, setIsSample] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const userId = session?.user?.id;
    if (!userId) {
      setProfile(null);
      setCafe(null);
      setEmployee(null);
      setCafeName('');
      setIsSample(false);
      setLoading(false);
      return;
    }
    try {
      const p = await loadProfile(userId);
      setProfile(p);
      if (!p) {
        setCafe(null);
        setEmployee(null);
        setCafeName('');
        setIsSample(false);
        return;
      }
      if (p.role === 'employee') {
        const [self, info] = await Promise.all([loadEmployeeSelf(), loadEmployeeCafe()]);
        setEmployee(self);
        setCafe(null);
        setCafeName(info?.name ?? '');
        setIsSample(info?.is_sample ?? false);
      } else if (p.role === 'owner') {
        setEmployee(null);
        setCafe(null);
        setCafeName('');
        setIsSample(false);
      } else {
        const row = await loadCafeForManager(userId);
        setCafe(row);
        setEmployee(null);
        setCafeName(row?.name ?? '');
        setIsSample(row?.is_sample ?? false);
      }
    } catch {
      setProfile(null);
    } finally {
      setLoading(false);
    }
  }, [session?.user?.id]);

  useEffect(() => {
    setLoading(true);
    void load();
  }, [load]);

  const hasAccess = useMemo(() => {
    if (!cafe) return false;
    if (cafe.is_sample) return true;
    const now = Date.now();
    if (cafe.subscription_status === 'trial') {
      return new Date(cafe.trial_ends_at).getTime() > now;
    }
    if (cafe.subscription_status === 'active' || cafe.subscription_status === 'past_due') {
      return Boolean(cafe.paid_until && new Date(cafe.paid_until).getTime() > now);
    }
    return false;
  }, [cafe]);

  const trialDaysLeft = useMemo(() => {
    if (!cafe) return 0;
    const ms = new Date(cafe.trial_ends_at).getTime() - Date.now();
    return Math.max(0, Math.ceil(ms / 86400000));
  }, [cafe]);

  const value = useMemo(
    () => ({
      profile,
      cafe,
      employee,
      cafeName,
      isSample,
      loading,
      hasAccess,
      trialDaysLeft,
      refresh: load,
      signOut: async () => {
        await supabase.auth.signOut();
      },
    }),
    [profile, cafe, employee, cafeName, isSample, loading, hasAccess, trialDaysLeft, load],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  return useContext(AppContext);
}

export async function signOut() {
  await supabase.auth.signOut();
}
