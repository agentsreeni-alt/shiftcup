import { Redirect } from 'expo-router';

import { Loading } from '@/components/kit';
import { useApp } from '@/lib/app-context';

export default function HomeRouter() {
  const { profile, cafe, loading } = useApp();

  if (loading) return <Loading />;
  if (!profile) return <Loading />;
  if (profile.role === 'owner') return <Redirect href="/(app)/admin" />;
  if (profile.role === 'employee') return <Redirect href="/(app)/(employee)/shifts" />;
  if (!cafe) return <Redirect href="/(app)/setup" />;
  return <Redirect href="/(app)/(manager)/today" />;
}
