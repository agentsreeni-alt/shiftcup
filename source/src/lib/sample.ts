import type { AvailKind, ReqStatus } from '@/lib/types';

export type SampleEmployee = {
  name: string;
  roles: string[];
  canWorkAlone: boolean;
  rating: number;
  maxHours: number;
  hourlyWage: number;
  status: ReqStatus;
  /** weekday 0=Mon … 6=Sun */
  availability: Record<number, { kind: AvailKind; startMin?: number; endMin?: number }>;
};

const any = { kind: 'any' as AvailKind };
const none = { kind: 'none' as AvailKind };
const window = (startMin: number, endMin: number) => ({
  kind: 'window' as AvailKind,
  startMin,
  endMin,
});

export const SAMPLE_EMPLOYEES: SampleEmployee[] = [
  {
    name: 'Maya',
    roles: ['barista', 'scooper', 'back_of_house'],
    canWorkAlone: true,
    rating: 5,
    maxHours: 32,
    hourlyWage: 18,
    status: 'answered',
    availability: { 0: any, 1: any, 2: any, 3: any, 4: any, 5: any, 6: none },
  },
  {
    name: 'Leo',
    roles: ['barista', 'back_of_house'],
    canWorkAlone: false,
    rating: 4,
    maxHours: 24,
    hourlyWage: 16,
    status: 'answered',
    availability: { 0: none, 1: none, 2: none, 3: none, 4: any, 5: any, 6: any },
  },
  {
    name: 'Priya',
    roles: ['barista', 'scooper', 'back_of_house'],
    canWorkAlone: true,
    rating: 4,
    maxHours: 32,
    hourlyWage: 17,
    status: 'answered',
    availability: {
      0: none,
      1: none,
      2: any,
      3: any,
      4: window(660, 1020),
      5: any,
      6: any,
    },
  },
  {
    name: 'Sam',
    roles: ['scooper'],
    canWorkAlone: false,
    rating: 3,
    maxHours: 16,
    hourlyWage: 15,
    status: 'answered',
    availability: { 0: none, 1: none, 2: none, 3: none, 4: none, 5: any, 6: any },
  },
  {
    name: 'Nora',
    roles: ['barista'],
    canWorkAlone: false,
    rating: 3,
    maxHours: 20,
    hourlyWage: 15,
    status: 'unavailable',
    availability: { 0: none, 1: none, 2: none, 3: none, 4: none, 5: none, 6: none },
  },
  {
    name: 'Jay',
    roles: ['scooper', 'barista'],
    canWorkAlone: false,
    rating: 4,
    maxHours: 20,
    hourlyWage: 16,
    status: 'waiting',
    availability: { 0: none, 1: none, 2: none, 3: none, 4: none, 5: none, 6: none },
  },
  {
    name: 'Tara',
    roles: ['barista', 'scooper', 'back_of_house'],
    canWorkAlone: true,
    rating: 3,
    maxHours: 30,
    hourlyWage: 15,
    status: 'answered',
    availability: {
      0: any,
      1: any,
      2: none,
      3: none,
      4: window(1200, 1380),
      5: any,
      6: any,
    },
  },
];

export const SAMPLE_CAFE_NAME = 'Dumont Creamery & Cafe';
export const SAMPLE_OPEN_MIN = 660; // 11 AM
export const SAMPLE_CLOSE_MIN = 1320; // 10 PM
