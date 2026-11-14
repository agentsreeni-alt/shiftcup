import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

type SlotLike = { block_id: string; slot: unknown; employee_id: string | null };

function slotsKey(list: SlotLike[]): string {
  return list
    .filter((a) => a.employee_id)
    .map((a) => `${a.block_id}:${String(a.slot)}:${a.employee_id}`)
    .sort()
    .join('|');
}

/** True when who-works-what differs from what the team was last sent. */
export function changedSincePublish(snapshot: unknown, current: SlotLike[]): boolean {
  const published = Array.isArray(snapshot) ? (snapshot as SlotLike[]) : [];
  return slotsKey(published) !== slotsKey(current);
}
