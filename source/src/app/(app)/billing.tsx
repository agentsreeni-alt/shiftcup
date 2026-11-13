import { useRouter } from 'expo-router';
import * as Linking from 'expo-linking';
import { ArrowLeft, Check } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { supabase } from '@/client/supabase';
import { Btn, Card, Notice, Screen, SectionTitle } from '@/components/kit';
import { useApp } from '@/lib/app-context';
import { C } from '@/lib/colors';
import { fmtDateShort } from '@/lib/dates';

const PRICE = '$29';

export default function BillingScreen() {
  const router = useRouter();
  const { cafe, isSample, trialDaysLeft, refresh } = useApp();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  const status = cafe?.subscription_status ?? 'trial';
  const active = status === 'active';

  const startCheckout = async () => {
    if (!cafe) return;
    setBusy(true);
    setMessage('');
    try {
      const { data, error } = await supabase.functions.invoke('stripe-checkout', {
        body: { cafe_id: cafe.id, mode: active ? 'renew' : 'subscribe' },
      });
      if (error) throw new Error('Billing is not connected yet. Add the Stripe key first.');
      if (data?.error) throw new Error(String(data.error));
      if (data?.url) {
        await Linking.openURL(String(data.url));
        setMessage('Finish in the browser, then come back and pull to refresh.');
      } else {
        setMessage('No checkout link came back. Try again.');
      }
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Could not start checkout.');
    } finally {
      setBusy(false);
    }
  };

  const openPortal = async () => {
    if (!cafe) return;
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke('stripe-portal', {
        body: { cafe_id: cafe.id },
      });
      if (error) throw new Error('Billing is not connected yet.');
      if (data?.url) await Linking.openURL(String(data.url));
      else setMessage('No billing portal link came back.');
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Could not open billing.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <View className="mb-4 flex-row items-center gap-2">
        <Pressable onPress={() => router.back()} className="p-2 active:opacity-60">
          <ArrowLeft size={20} color={C.pine} />
        </Pressable>
        <Text className="text-2xl font-bold text-foreground">Plan and billing</Text>
      </View>

      {isSample ? (
        <Notice
          tone="info"
          title="This is a sample café"
          body="Sample cafés are never billed. Set up your own café to start a trial."
        />
      ) : null}

      <Card>
        <View className="flex-row items-center justify-between">
          <View>
            <Text className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              ShiftCup
            </Text>
            <Text className="mt-1 text-3xl font-bold text-foreground">
              {PRICE}
              <Text className="text-base font-medium text-muted-foreground"> / month</Text>
            </Text>
          </View>
          <View
            className="rounded-full px-3 py-1"
            style={{ backgroundColor: active ? C.solo : status === 'trial' ? C.pistachio : C.redSoft }}
          >
            <Text
              className="text-[11px] font-bold uppercase"
              style={{ color: active ? C.soloInk : status === 'trial' ? C.pine : C.red }}
            >
              {status === 'trial'
                ? 'Trial'
                : status === 'active'
                  ? 'Active'
                  : status === 'past_due'
                    ? 'Past due'
                    : 'Ended'}
            </Text>
          </View>
        </View>

        <Text className="mt-3 text-sm text-muted-foreground">
          {status === 'trial'
            ? `Free trial: ${trialDaysLeft} ${trialDaysLeft === 1 ? 'day' : 'days'} left. No card needed yet.`
            : status === 'active'
              ? cafe?.paid_until
                ? `Paid until ${fmtDateShort(cafe.paid_until)}.`
                : 'Your plan is active.'
              : 'Your plan has ended. Subscribe to build and publish again.'}
        </Text>

        <View className="mt-4 gap-2">
          {[
            'Unlimited team members',
            'Automatic drafts and gap checks',
            'Text reminders for every shift',
            'Employees always free',
          ].map((line) => (
            <View key={line} className="flex-row items-center gap-2">
              <Check size={14} color={C.pine} />
              <Text className="text-sm text-foreground">{line}</Text>
            </View>
          ))}
        </View>

        <View className="mt-5 gap-2">
          <Btn
            label={active ? 'Renew for 30 days' : 'Start subscription'}
            loading={busy}
            onPress={startCheckout}
          />
          {active ? (
            <Btn label="Manage billing" variant="ghost" onPress={openPortal} />
          ) : null}
          <Btn label="Refresh status" variant="ghost" size="sm" onPress={() => refresh()} />
        </View>

        {message ? <Text className="mt-3 text-xs text-muted-foreground">{message}</Text> : null}
      </Card>

      <SectionTitle>What happens when it ends</SectionTitle>
      <Text className="text-sm leading-6 text-muted-foreground">
        You can still sign in and see the schedule. Building drafts, publishing, sending requests,
        reading messages and reminders pause until you subscribe. Your team keeps seeing the last
        published week.
      </Text>
    </Screen>
  );
}
