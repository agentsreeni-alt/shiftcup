import { Platform, Share } from 'react-native';

import type { Employee } from '@/lib/types';

// Invite links always open the live website; it works on any phone without installing.
export const APP_URL = 'https://shiftcup-1dd3b.web.app';

export function inviteLink(code: string): string {
  return `${APP_URL}/join?code=${encodeURIComponent(code)}`;
}

export function inviteMessage(emp: Pick<Employee, 'name' | 'invite_code'>, cafeName: string): string {
  return (
    `Hi ${emp.name}! Join ${cafeName} on ShiftCup to send your availability and see your shifts. ` +
    `Open ${inviteLink(emp.invite_code)} (invite code ${emp.invite_code}).`
  );
}

/** Someone the app can actually reach: they joined (in-app) or have an email on file. */
export function isReachable(emp: Pick<Employee, 'user_id' | 'email'>): boolean {
  return Boolean(emp.user_id || emp.email?.trim());
}

/**
 * Opens the share sheet on phones. On desktop browsers without one, copies the message.
 * Returns 'shared', 'copied', or 'failed' so the screen can say what happened.
 */
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
      // The person closed the share sheet: not an error worth showing.
      if (e instanceof Error && e.name === 'AbortError') return 'shared';
    }
  }
  try {
    await nav?.clipboard?.writeText(message);
    return 'copied';
  } catch {
    return 'failed';
  }
}
