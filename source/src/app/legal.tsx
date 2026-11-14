import { useLocalSearchParams } from 'expo-router';
import { Text, View } from 'react-native';

import { BackButton, Screen } from '@/components/kit';

const SUPPORT_EMAIL = 'info@gotradeexim.com';

const CONTENT: Record<string, { title: string; body: string[] }> = {
  privacy: {
    title: 'Privacy Policy',
    body: [
      'ShiftCup stores the information a café needs to build a schedule: names, contact details, roles, ratings, weekly availability, assigned shifts and hourly wages.',
      'Wages, ratings, other people\'s contact details and unpublished drafts are visible only to the café manager. Employees see their own shifts and their own availability.',
      'We use your email to send availability requests, published shifts and shift reminders. We do not sell your data and we do not use it for advertising.',
      'Messages you paste into the availability reader are sent to our AI provider only to turn them into days and times. They are not used to train models.',
      'Payments are handled by Stripe. ShiftCup never stores card numbers.',
      'You can delete your account in the app, under Settings (managers) or Me (employees). Deleting removes your sign-in and your café data.',
      `Questions? Email ${SUPPORT_EMAIL}.`,
    ],
  },
  terms: {
    title: 'Terms of Service',
    body: [
      'ShiftCup is a scheduling tool for single-location cafés and small restaurants. It helps you collect availability, draft a schedule, fix gaps and publish shifts.',
      'Managers pay $29 per month per café after a 14-day free trial. Employees use ShiftCup free of charge.',
      'You are responsible for the accuracy of the information you enter, including hours, roles and pay rates, and for following the employment rules that apply where you operate.',
      'ShiftCup drafts schedules using the rules you set. You review and approve every schedule before it is published.',
      'If a subscription ends, manager write access pauses. Employees keep read-only access to the last published schedule.',
      'Do not use ShiftCup to store unlawful content or to send messages that are not related to scheduling.',
      `Questions? Email ${SUPPORT_EMAIL}.`,
    ],
  },
  support: {
    title: 'Support',
    body: [
      'Need a hand? We answer email on weekdays.',
      `Email ${SUPPORT_EMAIL} and tell us your café name and what you were trying to do.`,
      'Common fixes: if a slot will not fill, check that the person has the role, can work alone for solo blocks, has answered this week, and is under their weekly hour limit.',
      'If reminders are not arriving, check the message channel in Settings and make sure the person has an email or phone number saved.',
    ],
  },
};

export default function LegalScreen() {
  const params = useLocalSearchParams<{ page?: string }>();
  const page = CONTENT[params.page ?? 'privacy'] ?? CONTENT.privacy;

  return (
    <Screen>
      <View className="mb-4 flex-row items-center gap-2">
        <BackButton />
        <Text className="flex-1 text-2xl font-bold text-foreground">{page.title}</Text>
      </View>
      <View className="gap-3">
        {page.body.map((p) => (
          <Text key={p.slice(0, 24)} className="text-sm leading-6 text-muted-foreground">
            {p}
          </Text>
        ))}
      </View>
      <Text className="mt-6 text-xs text-muted-foreground">
        Last updated 12 November 2026
      </Text>
    </Screen>
  );
}
