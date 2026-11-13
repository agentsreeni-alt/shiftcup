import { Platform } from 'react-native';
import { Easing } from 'react-native-reanimated';

// Curves from Emil Kowalski's animation guidance. Built-in easings are too weak.
export const EASE_OUT = Easing.bezier(0.23, 1, 0.32, 1); // UI enter/exit, press
export const EASE_IN_OUT = Easing.bezier(0.77, 0, 0.175, 1); // on-screen movement
export const EASE_SHEET = Easing.bezier(0.32, 0.72, 0, 1); // iOS sheet curve

export const PRESS_SCALE = 0.97;

/** Web-only transition so press feedback eases instead of snapping. Native ignores it. */
export const pressTransition =
  Platform.OS === 'web'
    ? ({
        transitionProperty: 'transform, opacity, background-color',
        transitionDuration: '140ms',
        transitionTimingFunction: 'cubic-bezier(0.23, 1, 0.32, 1)',
      } as object)
    : {};

/** Soft, low-contrast elevation used instead of hard borders. */
export const cardShadow = {
  boxShadow: '0 1px 2px rgba(20, 56, 44, 0.05), 0 4px 14px -6px rgba(20, 56, 44, 0.10)',
} as const;

export const raisedShadow = {
  boxShadow: '0 1px 2px rgba(20, 56, 44, 0.10), 0 10px 24px -10px rgba(20, 56, 44, 0.35)',
} as const;
