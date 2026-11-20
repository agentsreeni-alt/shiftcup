import { Copy, Mail, MessageCircle, MessageSquareText, Send, Share2 } from 'lucide-react-native';
import { useState } from 'react';
import { Platform, Text, View } from 'react-native';

import { Btn, PressScale, Sheet, toast } from '@/components/kit';
import { resendInvite } from '@/lib/api';
import { C } from '@/lib/colors';
import {
  canSystemShare,
  inviteLink,
  inviteMessage,
  type InviteWay,
  recordInviteShared,
  type ShareResult,
  sendInviteVia,
  shareTextVia,
  webLinkFor,
} from '@/lib/invite';
import type { Employee } from '@/lib/types';

type Person = Pick<Employee, 'id' | 'name' | 'invite_code' | 'email' | 'phone'>;

const APP_NAME: Record<InviteWay, string> = {
  text: 'Messages',
  whatsapp: 'WhatsApp',
  email: 'Your email app',
  copy: 'Copy',
  more: 'Share',
};

/** Computers without Messages (Windows, Linux) cannot open text-message links. */
function textWorksHere(): boolean {
  if (Platform.OS !== 'web' || typeof navigator === 'undefined') return true;
  return /iPhone|iPad|iPod|Android|Mac/i.test(navigator.userAgent) || navigator.maxTouchPoints > 1;
}

const WAYS: { way: InviteWay; label: string; icon: (c: string) => React.ReactNode }[] = [
  { way: 'text', label: 'Text', icon: (c) => <MessageSquareText size={18} color={c} /> },
  { way: 'whatsapp', label: 'WhatsApp', icon: (c) => <MessageCircle size={18} color={c} /> },
  { way: 'email', label: 'Email', icon: (c) => <Mail size={18} color={c} /> },
  { way: 'copy', label: 'Copy', icon: (c) => <Copy size={18} color={c} /> },
];

/**
 * One way to send. On the website Text, WhatsApp and Email are real links: the browser
 * opens the app itself, which phones allow when a script asking them to would be ignored.
 */
function WayButton({
  way,
  label,
  icon,
  href,
  newTab,
  onPress,
  dim,
  a11y,
}: {
  way: InviteWay;
  label: string;
  icon: React.ReactNode;
  href?: string;
  newTab?: boolean;
  onPress: () => void;
  dim?: boolean;
  a11y: string;
}) {
  const link = href
    ? ({
        href,
        hrefAttrs: newTab ? { target: '_blank', rel: 'noopener' } : undefined,
      } as object)
    : {};
  return (
    <PressScale
      {...link}
      onPress={onPress}
      accessibilityRole={href ? 'link' : 'button'}
      accessibilityLabel={a11y}
      className="flex-1 items-center gap-1 rounded-xl border border-border bg-card py-2.5"
      style={{ opacity: dim ? 0.5 : 1 }}
    >
      {icon}
      <Text className="text-[11px] font-semibold text-foreground">{label}</Text>
    </PressScale>
  );
}

/** Shown when nothing else worked: the message itself, to select and copy by hand. */
function MessageToCopy({ message }: { message: string }) {
  return (
    <View className="rounded-xl border border-border bg-muted/50 p-3">
      <Text className="mb-1 text-[11px] font-semibold uppercase text-muted-foreground">
        Press and hold to copy
      </Text>
      <Text selectable className="text-sm leading-5 text-foreground">
        {message}
      </Text>
    </View>
  );
}

/** What to tell the manager after a tap. Never says "sent": the app cannot know that. */
function describe(
  way: InviteWay,
  result: ShareResult,
  name: string,
): { text: string; ok: boolean } {
  switch (result) {
    case 'handed_off':
      return {
        text: `${APP_NAME[way]} should open with ${name}'s invite. Send it from there. Nothing opened? Use Copy.`,
        ok: true,
      };
    case 'shared':
      return { text: `${name}'s invite was shared.`, ok: true };
    case 'copied':
      return { text: `Copied. Paste it into a message to ${name}.`, ok: true };
    case 'cancelled':
      return { text: '', ok: false };
    default:
      return {
        text:
          way === 'more'
            ? 'This browser cannot share. Use Copy, then paste the invite into a message.'
            : `${APP_NAME[way]} could not open on this device. Use Copy, then paste the invite into a message.`,
        ok: false,
      };
  }
}

/**
 * Every way to get an invite to someone. Each button does its work straight from the tap,
 * which browsers require, and the line underneath says what really happened.
 */
export function InviteOptions({
  person,
  cafeId,
  cafeName,
  onSent,
  showShareSheet,
}: {
  person: Person;
  cafeId: string;
  cafeName: string;
  /** Called after the invite went somewhere, so the screen can show them as invited. */
  onSent?: (status: string) => void;
  /** Offer the system share sheet (not over another sheet on phones). */
  showShareSheet?: boolean;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [status, setStatus] = useState<{ text: string; ok: boolean } | null>(null);
  const hasEmail = Boolean(person.email?.trim());
  const ways = WAYS.filter((w) => w.way !== 'text' || textWorksHere());
  const share = showShareSheet && canSystemShare();

  // Not async up front: the browser only allows opening apps during the tap itself.
  const message = inviteMessage(person, cafeName);
  const linkOpts = {
    subject: `Join ${cafeName} on ShiftCup`,
    email: person.email,
    phone: person.phone,
  };
  const [failed, setFailed] = useState(false);

  const after = async (way: InviteWay, result: ShareResult) => {
    setBusy(null);
    const said = describe(way, result, person.name);
    setStatus(said.text ? said : null);
    setFailed(result === 'failed');
    if (result === 'handed_off' || result === 'shared' || result === 'copied') {
      await recordInviteShared(cafeId, person.id, way).catch(() => {});
      onSent?.(
        result === 'copied'
          ? 'Invite copied'
          : result === 'shared'
            ? 'Invite shared'
            : `Opened in ${APP_NAME[way]}`,
      );
    }
  };

  const send = (way: InviteWay) => {
    // A web link opens the app by itself; this only notes it.
    if (webLinkFor(way, message, linkOpts)) {
      void after(way, 'handed_off');
      return;
    }
    setBusy(way);
    void sendInviteVia(way, person, cafeName).then(async (result) => {
      await after(way, result);
    });
  };

  const emailForMe = async () => {
    setBusy('auto');
    try {
      const ok = await resendInvite(person.id);
      setStatus(
        ok
          ? { text: `Emailed to ${person.email}. It arrives in a minute or two.`, ok: true }
          : { text: 'Add their email in Edit first.', ok: false },
      );
      if (ok) onSent?.('Invite emailed');
    } catch (e) {
      setStatus({ text: e instanceof Error ? e.message : 'Could not send the invite.', ok: false });
    } finally {
      setBusy(null);
    }
  };

  return (
    <View className="gap-2">
      {hasEmail ? (
        <Btn
          label={`Email it for me to ${person.email}`}
          loading={busy === 'auto'}
          disabled={busy !== null && busy !== 'auto'}
          onPress={emailForMe}
          icon={<Send size={15} color={C.cream} />}
        />
      ) : null}
      {share ? (
        <Btn
          label="Share invite…"
          variant={hasEmail ? 'secondary' : 'primary'}
          loading={busy === 'more'}
          disabled={busy !== null && busy !== 'more'}
          onPress={() => send('more')}
          icon={<Share2 size={15} color={hasEmail ? C.pine : C.cream} />}
        />
      ) : null}
      <View className="flex-row gap-1.5">
        {ways.map((w) => {
          const link = webLinkFor(w.way, message, linkOpts);
          return (
            <WayButton
              key={w.way}
              way={w.way}
              label={w.label}
              icon={w.icon(C.pine)}
              href={link?.href}
              newTab={link?.newTab}
              onPress={() => send(w.way)}
              dim={Boolean(busy && busy !== w.way)}
              a11y={`${w.label}: send ${person.name}'s invite`}
            />
          );
        })}
      </View>
      {status ? (
        <Text
          className="px-1 text-xs leading-4"
          style={{ color: status.ok ? C.soloInk : C.red }}
          accessibilityLiveRegion="polite"
        >
          {status.text}
        </Text>
      ) : null}
      {failed ? <MessageToCopy message={message} /> : null}
    </View>
  );
}

/** One person's invite: the code, the link, the message, and every way to send it. */
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
          <InviteOptions
            person={person}
            cafeId={cafeId}
            cafeName={cafeName}
            // On the web the share sheet works over this one. Phones get it from the
            // buttons' apps instead, since iOS will not stack sheets reliably.
            showShareSheet={Platform.OS === 'web'}
            onSent={() => onSent?.()}
          />
          <View className="rounded-xl border border-border p-3">
            <Text className="mb-1 text-[11px] font-semibold uppercase text-muted-foreground">
              The message
            </Text>
            <Text selectable className="text-sm leading-5 text-foreground">
              {inviteMessage(person, cafeName)}
            </Text>
          </View>
        </View>
      ) : null}
    </Sheet>
  );
}

/** Text, WhatsApp, email or copy for any message, such as the week's schedule. */
export function ShareTextButtons({ message, subject }: { message: string; subject: string }) {
  const [status, setStatus] = useState<{ text: string; ok: boolean } | null>(null);
  const ways = WAYS.filter((w) => w.way !== 'text' || textWorksHere());
  const [failed, setFailed] = useState(false);
  const show = (way: InviteWay, r: ShareResult) => {
    setFailed(r === 'failed');
    const said = describe(way, r, 'your team');
    setStatus(
      said.text ? { ...said, text: said.text.replace("your team's invite", 'the schedule') } : null,
    );
  };
  const send = (way: InviteWay) => {
    if (webLinkFor(way, message, { subject })) return show(way, 'handed_off');
    void shareTextVia(way, message, { subject }).then((r) => show(way, r));
  };
  return (
    <View className="gap-2">
      <View className="flex-row gap-1.5">
        {ways.map((w) => {
          const link = webLinkFor(w.way, message, { subject });
          return (
            <WayButton
              key={w.way}
              way={w.way}
              label={w.label}
              icon={w.icon(C.pine)}
              href={link?.href}
              newTab={link?.newTab}
              onPress={() => send(w.way)}
              a11y={`${w.label}: share the schedule`}
            />
          );
        })}
      </View>
      {status ? (
        <Text className="px-1 text-xs leading-4" style={{ color: status.ok ? C.soloInk : C.red }}>
          {status.text}
        </Text>
      ) : null}
      {failed ? <MessageToCopy message={message} /> : null}
    </View>
  );
}
