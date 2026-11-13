import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

// One haptic per user action, always paired with a visual change. No-ops on web.
export function tickSelection() {
  if (Platform.OS === 'web') return;
  Haptics.selectionAsync().catch(() => {});
}

export function tapLight() {
  if (Platform.OS === 'web') return;
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
}
