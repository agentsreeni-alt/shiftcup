import { Copy, Mail, MessageCircle, MessageSquareText, Send, Share2 } from 'lucide-react-native';
import { useState } from 'react';
import { Platform, Text, View } from 'react-native';

import { Btn, PressScale, Sheet, toast } from '@/components/kit';
import { resendInvite } from '@/lib/api';
import { C } from '@/lib/colors';
import {
  inviteLink,
  type InviteWay,
  recordInviteShared,
  sendInviteVia,
  shareTextVia,
} from '@/lib/invite';
import type { Employee } from '@/lib/types';

type Person = Pick<Employee, 'id' | 'name' | 'invite_code' | 'email' | 'phone'>;

const WAYS: { way: InviteWay; label: string; icon: (c: string) => React.ReactNode }[] = [
  { way: 'text', label: 'Text', icon: (c) => <MessageSquareText size={18} color={c} /> },
  { way: 'whatsapp', label: 'WhatsApp', icon: (c) => <MessageCircle size={18} color={c} /> },
  { way: 'email', label: 'Email app', icon: (c) => <Mail size={18} color={c} /> },
  { way: 'copy', label: 'Copy', icon: (c) => <Copy size={18} color={c} /> },
];

/**
 * Every way to get an invite to someone, as plain buttons. Text, WhatsApp and email open
 * that app with the message already written; Copy puts it on the clipboard. These work on
 * phones and computers, and over an open sheet, unlike the system share sheet.
 */
export function InviteOptions({
  person,
  cafeId,
  cafeName,
  onSent,
  onMore,
  compact,
}: {
  person: Person;
  cafeId: string;
  cafeName: string;
  /** Called after any way is used, so the screen can refresh who is invited. */
  onSent?: (how: string) => void;
  /** Shows "More…" (the system share sheet). The caller closes its sheet first. */
  onMore?: () => void;
  compact?: boolean;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const hasEmail = Boolean(person.email?.trim());

  const send = async (way: InviteWay) => {
    setBusy(way);
    const result = await sendInviteVia(way, person, cafeName);
    setBusy(null);
    if (result === 'failed') {
      toast(`Could not open that. ${person.name}'s invite code is ${person.invite_code}.`, 'error');
      return;
    }
    if (result === 'copied') {
      toast(
        way === 'copy'
          ? `Invite for ${person.name} copied. Paste it into any message.`
          : `Could not open that app, so the invite was copied. Paste it into a message.`,
      );
    }
    await recordInviteShared(cafeId, person.id, way).catch(() => {});
    onSent?.(way === 'copy' ? 'Copied' : 'Shared');
  };

  const emailForMe = async () => {
    setBusy('auto');
    try {
      const ok = await resendInvite(person.id);
      if (ok) {
        toast(`Invite emailed to ${person.email}.`);
        onSent?.('Emailed');
      } else {
        toast('Add their email in Edit first.', 'error');
      }
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not send the invite.', 'error');
    } finally {
      setBusy(null);
    }
  };

  return (
    <View className="gap-2">
      {hasEmail ? (
        <Btn
          label={`Email it for me to ${person.email}`}
          size={compact ? 'sm' : 'md'}
          loading={busy === 'auto'}
          disabled={busy !== null && busy !== 'auto'}
          onPress={emailForMe}
          icon={<Send size={15} color={C.cream} />}
        />
      ) : null}
      <View className="flex-row gap-1.5">
        {WAYS.map((w) => (
          <PressScale
            key={w.way}
            onPress={() => send(w.way)}
            disabled={busy !== null}
            accessibilityRole="button"
            accessibilityLabel={`${w.label}: send ${person.name}'s invite`}
            className="flex-1 items-center gap-1 rounded-xl border border-border bg-card py-2.5"
            style={{ opacity: busy && busy !== w.way ? 0.5 : 1 }}
          >
            {w.icon(C.pine)}
            <Text className="text-[11px] font-semibold text-foreground">{w.label}</Text>
          </PressScale>
        ))}
        {onMore ? (
          <PressScale
            onPress={onMore}
            disabled={busy !== null}
            accessibilityRole="button"
            accessibilityLabel={`More ways to send ${person.name}'s invite`}
            className="flex-1 items-center gap-1 rounded-xl border border-border bg-card py-2.5"
          >
            <Share2 size={18} color={C.pine} />
            <Text className="text-[11px] font-semibold text-foreground">More</Text>
          </PressScale>
        ) : null}
      </View>
    </View>
  );
}

/** One person's invite: the code, the link, and every way to send it. */
export function InviteSheet({
  person,
  cafeId,
  cafeName,
  onClose,
  onSent,
}: {
  person: Person | null;
  cafeId: string;
  cafeName: string;
  onClose: () => void;
  onSent?: () => void;
}) {
  const more = () => {
    if (!person) return;
    const p = person;
    // Phones cannot show the system share sheet over this one: close, then open it.
    onClose();
    setTimeout(
      () => {
        void sendInviteVia('more', p, cafeName).then(async (r) => {
          if (r === 'copied') toast(`Invite for ${p.name} copied. Paste it into any message.`);
          if (r !== 'failed') {
            await recordInviteShared(cafeId, p.id, 'more').catch(() => {});
            onSent?.();
          }
        });
      },
      Platform.OS === 'web' ? 0 : 550,
    );
  };

  return (
    <Sheet visible={Boolean(person)} onClose={onClose} title={`Invite ${person?.name ?? ''}`}>
      {person ? (
        <View className="gap-4 pb-4">
          <View className="items-center rounded-2xl bg-muted px-4 py-4">
            <Text className="text-xs font-semibold uppercase text-muted-foreground">
              Invite code
            </Text>
            <Text
              selectable
              className="mt-1 text-3xl font-bold text-foreground"
              style={{ letterSpacing: 4 }}
            >
              {person.invite_code}
            </Text>
            <Text selectable className="mt-2 text-center text-xs text-muted-foreground">
              {inviteLink(person.invite_code)}
            </Text>
          </View>
          <Text className="text-sm leading-5 text-muted-foreground">
            {person.name} opens the link (or the ShiftCup app, then “Join with your invite code”),
            makes a password, and is on your team. Then they send when they can usually work.
          </Text>
          <InviteOptions
            person={person}
            cafeId={cafeId}
            cafeName={cafeName}
            onMore={more}
            onSent={() => onSent?.()}
          />
        </View>
      ) : null}
    </Sheet>
  );
}

/** Text, WhatsApp, email or copy for any message, such as the week's schedule. */
export function ShareTextButtons({ message, subject }: { message: string; subject: string }) {
  const [busy, setBusy] = useState<string | null>(null);
  const send = async (way: InviteWay) => {
    setBusy(way);
    const r = await shareTextVia(way, message, { subject });
    setBusy(null);
    if (r === 'copied') {
      toast(
        way === 'copy'
          ? 'Copied. Paste it into any message.'
          : 'Could not open that app, so it was copied.',
      );
    } else if (r === 'failed') {
      toast('Could not share that. Select the text and copy it.', 'error');
    }
  };
  return (
    <View className="flex-row gap-1.5">
      {WAYS.map((w) => (
        <PressScale
          key={w.way}
          onPress={() => send(w.way)}
          disabled={busy !== null}
          accessibilityRole="button"
          accessibilityLabel={`${w.label}: share the schedule`}
          className="flex-1 items-center gap-1 rounded-xl border border-border bg-card py-2.5"
        >
          {w.icon(C.pine)}
          <Text className="text-[11px] font-semibold text-foreground">{w.label}</Text>
        </PressScale>
      ))}
    </View>
  );
}
