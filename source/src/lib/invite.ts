import * as Clipboard from 'expo-clipboard';
import { Linking, Platform, Share } from 'react-native';

import { supabase } from '@/client/supabase';
import type { Employee } from '@/lib/types';

// Invite links always open the live website; it works on any phone without installing.
export const APP_URL = 'https://shiftcup-1dd3b.web.app';

export function inviteLink(code: string): string {
  return `${APP_URL}/join?code=${encodeURIComponent(code)}`;
}

export function inviteMessage(
  emp: Pick<Employee, 'name' | 'invite_code'>,
  cafeName: string,
): string {
  return (
    `Hi ${emp.name}! Join ${cafeName} on ShiftCup to send when you can work and see your shifts. ` +
    `Open ${inviteLink(emp.invite_code)} (invite code ${emp.invite_code}).`
  );
}

/** Someone the app can actually reach: they joined (in-app) or have an email on file. */
export function isReachable(emp: Pick<Employee, 'user_id' | 'email'>): boolean {
  return Boolean(emp.user_id || emp.email?.trim());
}

export type InviteWay = 'text' | 'whatsapp' | 'email' | 'copy' | 'more';

function smsUrl(phone: string | null | undefined, body: string): string {
  const to = (phone ?? '').replace(/[^\d+]/g, '');
  // iOS reads the body after "&", Android after "?".
  const sep = Platform.OS === 'ios' ? '&' : '?';
  return `sms:${to}${sep}body=${encodeURIComponent(body)}`;
}

/**
 * Sends a message one way. Text, WhatsApp and email open that app with the message
 * written, which works everywhere, including over an open sheet. "more" is the system
 * share sheet, which phones cannot show on top of another sheet, so callers close their
 * sheet first. If nothing can open, the message is copied instead.
 */
export async function shareTextVia(
  way: InviteWay,
  message: string,
  opts: { subject?: string; email?: string | null; phone?: string | null } = {},
): Promise<'opened' | 'copied' | 'failed'> {
  try {
    if (way === 'copy') {
      await Clipboard.setStringAsync(message);
      return 'copied';
    }
    if (way === 'more') {
      const nav = typeof navigator !== 'undefined' ? navigator : undefined;
      if (Platform.OS === 'web') {
        if (!nav?.share) {
          await Clipboard.setStringAsync(message);
          return 'copied';
        }
        try {
          await nav.share({ text: message });
        } catch (e) {
          if (!(e instanceof Error && e.name === 'AbortError')) throw e;
        }
        return 'opened';
      }
      await Share.share({ message });
      return 'opened';
    }
    const url =
      way === 'text'
        ? smsUrl(opts.phone, message)
        : way === 'whatsapp'
          ? `https://wa.me/?text=${encodeURIComponent(message)}`
          : `mailto:${encodeURIComponent(opts.email?.trim() ?? '')}?subject=${encodeURIComponent(
              opts.subject ?? 'ShiftCup',
            )}&body=${encodeURIComponent(message)}`;
    if (Platform.OS === 'web' && way === 'whatsapp') {
      window.open(url, '_blank', 'noopener');
      return 'opened';
    }
    await Linking.openURL(url);
    return 'opened';
  } catch {
    try {
      await Clipboard.setStringAsync(message);
      return 'copied';
    } catch {
      return 'failed';
    }
  }
}

/** Sends one person's invite one way. */
export function sendInviteVia(
  way: InviteWay,
  emp: Pick<Employee, 'name' | 'invite_code' | 'email' | 'phone'>,
  cafeName: string,
): Promise<'opened' | 'copied' | 'failed'> {
  return shareTextVia(way, inviteMessage(emp, cafeName), {
    subject: `Join ${cafeName} on ShiftCup`,
    email: emp.email,
    phone: emp.phone,
  });
}

/**
 * Notes that the manager sent the invite themselves (by text, WhatsApp...), so the team
 * list shows them as invited. Stored with the café's other messages, already marked sent,
 * so nothing is emailed.
 */
export async function recordInviteShared(cafeId: string, employeeId: string, way: InviteWay) {
  const now = new Date();
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  const iso = `${monday.getFullYear()}-${String(monday.getMonth() + 1).padStart(2, '0')}-${String(
    monday.getDate(),
  ).padStart(2, '0')}`;
  await supabase.from('reminders').insert({
    cafe_id: cafeId,
    employee_id: employeeId,
    week_start: iso,
    weekday: 0,
    kind: 'invite',
    send_at: now.toISOString(),
    sent_at: now.toISOString(),
    body: `Invite shared by the manager (${way}).`,
    channel: 'text',
    state: 'sent',
  });
}

/** Older call sites: the system share sheet, falling back to copying. */
export async function shareInvite(message: string): Promise<'shared' | 'copied' | 'failed'> {
  if (Platform.OS !== 'web') {
    try {
      await Share.share({ message });
      return 'shared';
    } catch {
      return 'failed';
    }
  }
  const nav = typeof navigator !== 'undefined' ? navigator : undefined;
  if (nav?.share) {
    try {
      await nav.share({ text: message });
      return 'shared';
    } catch (e) {
      if (e instanceof Error && e.name === 'AbortError') return 'shared';
    }
  }
  try {
    await Clipboard.setStringAsync(message);
    return 'copied';
  } catch {
    return 'failed';
  }
}
