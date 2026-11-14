export type UserRole = 'manager' | 'employee' | 'owner';
export type SlotKind = 'solo' | 'barista' | 'scooper';
export type BlockRule = 'solo' | 'two';
export type AvailKind = 'any' | 'none' | 'window';
export type ReqStatus = 'waiting' | 'answered' | 'unavailable';
export type SubStatus = 'trial' | 'active' | 'past_due' | 'ended';
export type Channel = 'email' | 'text';
export type ReminderKind = 'request' | 'published' | 'evening' | 'soon' | 'renewal';
export type ReminderState = 'queued' | 'sent' | 'cancelled';

export const JOB_ROLES = ['barista', 'scooper', 'back_of_house'] as const;
export type JobRole = (typeof JOB_ROLES)[number];

export const JOB_LABEL: Record<JobRole, string> = {
  barista: 'Barista',
  scooper: 'Scooper',
  back_of_house: 'Back of house',
};

export const SLOT_LABEL: Record<SlotKind, string> = {
  solo: 'Solo',
  barista: 'Barista',
  scooper: 'Scooper',
};

export type Profile = {
  id: string;
  email: string | null;
  role: UserRole;
  cafe_id: string | null;
  employee_id: string | null;
};

export type Cafe = {
  id: string;
  name: string;
  owner_id: string;
  is_sample: boolean;
  subscription_status: SubStatus;
  trial_ends_at: string;
  paid_until: string | null;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  timezone: string;
  created_at: string;
};

export type Employee = {
  id: string;
  cafe_id: string;
  name: string;
  email: string | null;
  phone: string | null;
  roles: string[];
  can_work_alone: boolean;
  rating: number;
  max_hours: number;
  hourly_wage: number;
  active: boolean;
  user_id: string | null;
  invite_code: string;
  /** Standard availability, Monday first (7 entries). Null until the manager sets it. */
  usual_week: UsualDay[] | null;
};

export type UsualDay = { kind: AvailKind; start_min: number | null; end_min: number | null };

/** Employee-safe projection (no wage, no rating, no contact details). */
export type EmployeeSelf = {
  id: string;
  cafe_id: string;
  name: string;
  roles: string[];
  can_work_alone: boolean;
  max_hours: number;
  active: boolean;
  user_id: string | null;
};

export type StoreHour = {
  cafe_id: string;
  weekday: number;
  open_min: number;
  close_min: number;
};

export type CoverageBlock = {
  id: string;
  cafe_id: string;
  weekday: number;
  start_min: number;
  end_min: number;
  rule: BlockRule;
};

export type CafeSettings = {
  cafe_id: string;
  due_weekday: number;
  due_min: number;
  publish_weekday: number;
  evening_reminder_min: number;
  second_reminder_min: number;
  max_shift_hours: number;
  channel: Channel;
};

export type Availability = {
  id?: string;
  cafe_id: string;
  employee_id: string;
  week_start: string;
  weekday: number;
  kind: AvailKind;
  start_min: number | null;
  end_min: number | null;
  /** True when this day comes from the person's usual week, not this week's answer. */
  from_usual?: boolean;
};

export type WeeklyRequest = {
  id: string;
  cafe_id: string;
  week_start: string;
  sent_at: string;
};

export type RequestStatus = {
  id?: string;
  request_id: string;
  cafe_id: string;
  employee_id: string;
  status: ReqStatus;
};

export type Assignment = {
  id?: string;
  cafe_id: string;
  week_start: string;
  weekday: number;
  block_id: string;
  slot: SlotKind;
  employee_id: string | null;
  start_min: number;
  end_min: number;
  manual: boolean;
  over_limit: boolean;
};

export type PublishedSchedule = {
  id: string;
  cafe_id: string;
  week_start: string;
  published_at: string;
  snapshot: unknown;
};

export type CoverRequest = {
  id: string;
  cafe_id: string;
  assignment_id: string;
  employee_id: string;
  week_start: string;
  weekday: number;
  note: string | null;
  resolved: boolean;
  created_at: string;
};

export type Reminder = {
  id: string;
  cafe_id: string;
  employee_id: string;
  week_start: string;
  weekday: number;
  kind: ReminderKind;
  send_at: string;
  body: string;
  channel: Channel;
  state: ReminderState;
  sent_at: string | null;
};

export type BillingEvent = {
  id: string;
  cafe_id: string | null;
  kind: string;
  amount_cents: number;
  detail: Record<string, unknown>;
  created_at: string;
};
