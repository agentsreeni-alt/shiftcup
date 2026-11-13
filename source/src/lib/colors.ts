export const C = {
  pine: '#14382C',
  pineSoft: '#1E4A3A',
  pistachio: '#BFE08E',
  cream: '#F2F5EC',
  red: '#B3264A',
  redSoft: '#FBEAEE',
  barista: '#E3EDF7',
  baristaInk: '#2C5C86',
  baristaLine: '#B9D2E8',
  scooper: '#F9E7EF',
  scooperInk: '#9C4A6E',
  scooperLine: '#EFC6D8',
  solo: '#E8F1DC',
  soloInk: '#3F6B2A',
  soloLine: '#C6DCA8',
  muted: '#5C6B60',
  border: '#DDE4D3',
  white: '#FFFFFF',
} as const;

export const SLOT_COLORS = {
  barista: { bg: C.barista, ink: C.baristaInk, line: C.baristaLine },
  scooper: { bg: C.scooper, ink: C.scooperInk, line: C.scooperLine },
  solo: { bg: C.solo, ink: C.soloInk, line: C.soloLine },
} as const;
