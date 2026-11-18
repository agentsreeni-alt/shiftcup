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

/** True when the system share sheet is available (all phones; some computer browsers). */
export function canSystemShare(): boolean {
  if (Platform.OS !== 'web') return true;
  return typeof navigator !== 'undefined' && typeof navigator.share === 'function';
}

/** Phones and tablets in a browser: they have Messages and WhatsApp to hand off to. */
function isMobileWeb(): boolean {
  if (Platform.OS !== 'web' || typeof navigator === 'undefined') return false;
  return /iPhone|iPad|iPod|Android/i.test(navigator.userAgent) || navigator.maxTouchPoints > 1;
}

export type ShareResult =
  /** Another app was asked to open with the message (we cannot see if they sent it). */
  | 'handed_off'
  /** The system share sheet finished: the person picked an app. */
  | 'shared'
  /** The share sheet was closed without picking anything. */
  | 'cancelled'
  | 'copied'
  | 'failed';

function urlFor(
  way: 'text' | 'whatsapp' | 'email',
  message: string,
  opts: { subject?: string; email?: string | null; phone?: string | null },
): string {
  if (way === 'text') return smsUrl(opts.phone, message);
  if (way === 'whatsapp') {
    // The app on phones, WhatsApp Web on computers.
    return Platform.OS === 'web' && !isMobileWeb()
      ? `https://web.whatsapp.com/send?text=${encodeURIComponent(message)}`
      : `whatsapp://send?text=${encodeURIComponent(message)}`;
  }
  return `mailto:${encodeURIComponent(opts.email?.trim() ?? '')}?subject=${encodeURIComponent(
    opts.subject ?? 'ShiftCup',
  )}&body=${encodeURIComponent(message)}`;
}

/**
 * Sends a message one way. Must be called straight from the tap (no waiting first): browsers
 * only let a tap open another app or the share sheet.
 *
 * - text / email / whatsapp: hands the written message to that app.
 * - more: the system share sheet (phones), so any app can be picked.
 * - copy: the clipboard.
 */
export async function shareTextVia(
  way: InviteWay,
  message: string,
  opts: { subject?: string; email?: string | null; phone?: string | null } = {},
): Promise<ShareResult> {
  if (way === 'copy') {
    try {
      await Clipboard.setStringAsync(message);
      return 'copied';
    } catch {
      return 'failed';
    }
  }

  if (way === 'more') {
    if (Platform.OS === 'web') {
      if (!canSystemShare()) return 'failed';
      try {
        await navigator.share({ text: message });
        return 'shared';
      } catch (e) {
        return e instanceof Error && e.name === 'AbortError' ? 'cancelled' : 'failed';
      }
    }
    try {
      const r = await Share.share({ message });
      return r.action === Share.dismissedAction ? 'cancelled' : 'shared';
    } catch {
      return 'failed';
    }
  }

  const url = urlFor(way, message, opts);
  if (Platform.OS === 'web') {
    // A link to Messages or Mail must replace the page's address, not open a new tab:
    // browsers silently drop app links opened in new tabs, which is why nothing happened.
    if (way === 'whatsapp' && !isMobileWeb()) {
      const w = window.open(url, '_blank');
      return w ? 'handed_off' : 'failed';
    }
    window.location.href = url;
    return 'handed_off';
  }
  try {
    if (way === 'whatsapp' && !(await Linking.canOpenURL(url))) {
      // No WhatsApp on this phone: the web link opens it, or offers to install it.
      await Linking.openURL(`https://wa.me/?text=${encodeURIComponent(message)}`);
      return 'handed_off';
    }
    await Linking.openURL(url);
    return 'handed_off';
  } catch {
    return 'failed';
  }
}

/** Sends one person's invite one way. */
export function sendInviteVia(
  way: InviteWay,
  emp: Pick<Employee, 'name' | 'invite_code' | 'email' | 'phone'>,
  cafeName: string,
): Promise<ShareResult> {
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
