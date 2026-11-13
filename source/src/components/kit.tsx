import { X } from 'lucide-react-native';
import { useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
  type PressableProps,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';
import Animated, {
  FadeIn,
  SlideInDown,
  useAnimatedStyle,
  useReducedMotion,
  withTiming,
} from 'react-native-reanimated';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { C } from '@/lib/colors';
import { fmtTime } from '@/lib/dates';
import { tickSelection } from '@/lib/haptics';
import {
  EASE_OUT,
  EASE_SHEET,
  PRESS_SCALE,
  cardShadow,
  pressTransition,
  raisedShadow,
} from '@/lib/motion';

/**
 * Pressable with physical press feedback: scales to 0.97 on press-in (feedback on press,
 * commit on release). Use for any tappable surface instead of an opacity flash.
 */
export function PressScale({
  style,
  scale = PRESS_SCALE,
  disabled,
  ...props
}: PressableProps & { scale?: number; className?: string; style?: StyleProp<ViewStyle> }) {
  const reduced = useReducedMotion();
  // Pressed state is tracked here (NativeWind drops function-form styles on Pressable).
  const [pressed, setPressed] = useState(false);
  const down = pressed && !disabled;
  return (
    <Pressable
      disabled={disabled}
      pressRetentionOffset={{ top: 12, bottom: 12, left: 12, right: 12 }}
      {...props}
      onPressIn={(e) => {
        setPressed(true);
        props.onPressIn?.(e);
      }}
      onPressOut={(e) => {
        setPressed(false);
        props.onPressOut?.(e);
      }}
      style={[
        pressTransition,
        { transform: [{ scale: down && !reduced ? scale : 1 }] },
        down && reduced ? { opacity: 0.85 } : null,
        style,
      ]}
    />
  );
}

export function Screen({
  children,
  scroll = true,
  padded = true,
  edges = ['top'],
}: {
  children: React.ReactNode;
  scroll?: boolean;
  padded?: boolean;
  edges?: ('top' | 'bottom' | 'left' | 'right')[];
}) {
  return (
    <SafeAreaView edges={edges} className="flex-1 bg-background">
      {scroll ? (
        <ScrollView
          contentContainerClassName={padded ? 'px-5 pb-28 pt-2' : undefined}
          contentInsetAdjustmentBehavior="automatic"
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {children}
        </ScrollView>
      ) : (
        <View className={padded ? 'flex-1 px-5 pt-2' : 'flex-1'}>{children}</View>
      )}
    </SafeAreaView>
  );
}

export function AppBar({
  title,
  subtitle,
  right,
}: {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
}) {
  return (
    <View className="mb-4 flex-row items-start justify-between gap-3">
      <View className="flex-1">
        <Text
          className="text-[28px] font-bold leading-[34px] text-foreground"
          style={{ letterSpacing: -0.6 }}
        >
          {title}
        </Text>
        {subtitle ? (
          <Text className="mt-0.5 text-sm font-medium text-muted-foreground">{subtitle}</Text>
        ) : null}
      </View>
      {right}
    </View>
  );
}

export function Card({
  children,
  className = '',
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <View
      className={`rounded-2xl border border-border/60 bg-card p-4 ${className}`}
      style={[{ borderCurve: 'continuous' }, cardShadow]}
    >
      {children}
    </View>
  );
}

export function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <Text
      className="mb-2.5 mt-7 px-1 text-[11px] font-semibold uppercase text-muted-foreground"
      style={{ letterSpacing: 0.8 }}
    >
      {children}
    </Text>
  );
}

export function Stars({ value, size = 12 }: { value: number; size?: number }) {
  return (
    <Text style={{ fontSize: size, color: C.pine, letterSpacing: 1 }}>
      {'★'.repeat(Math.max(0, Math.min(5, value)))}
      <Text style={{ color: C.border }}>{'★'.repeat(Math.max(0, 5 - value))}</Text>
    </Text>
  );
}

export function Pill({
  label,
  tone = 'neutral',
  onPress,
}: {
  label: string;
  tone?: 'neutral' | 'pine' | 'pistachio' | 'red' | 'outline';
  onPress?: () => void;
}) {
  const tones: Record<string, string> = {
    neutral: 'bg-muted text-foreground',
    pine: 'bg-primary text-primary-foreground',
    pistachio: 'bg-accent text-accent-foreground',
    red: 'bg-destructive text-destructive-foreground',
    outline: 'border border-border bg-card text-foreground',
  };
  const content = (
    <View className={`rounded-full px-3 py-1 ${tones[tone]}`}>
      <Text className={`text-xs font-semibold ${tones[tone].includes('text-') ? '' : ''}`}>
        {label}
      </Text>
    </View>
  );
  if (!onPress) return content;
  return (
    <PressScale onPress={onPress} scale={0.95} hitSlop={8}>
      {content}
    </PressScale>
  );
}

export function Btn({
  label,
  onPress,
  variant = 'primary',
  disabled,
  loading,
  icon,
  full = true,
  size = 'md',
}: {
  label: string;
  onPress?: () => void;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'accent';
  disabled?: boolean;
  loading?: boolean;
  icon?: React.ReactNode;
  full?: boolean;
  size?: 'sm' | 'md' | 'lg';
}) {
  const variants: Record<string, string> = {
    primary: 'bg-primary',
    secondary: 'bg-secondary',
    ghost: 'bg-transparent border border-border',
    danger: 'bg-destructive',
    accent: 'bg-accent',
  };
  const textVariants: Record<string, string> = {
    primary: 'text-primary-foreground',
    secondary: 'text-secondary-foreground',
    ghost: 'text-foreground',
    danger: 'text-destructive-foreground',
    accent: 'text-accent-foreground',
  };
  const sizes: Record<string, string> = {
    sm: 'px-3 py-2',
    md: 'px-4 py-3.5',
    lg: 'px-5 py-4',
  };
  return (
    <PressScale
      onPress={onPress}
      disabled={disabled || loading}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!(disabled || loading), busy: !!loading }}
      className={`flex-row items-center justify-center gap-2 rounded-xl ${sizes[size]} ${
        variants[variant]
      } ${full ? 'w-full' : ''} ${disabled ? 'opacity-40' : ''}`}
      style={[
        { borderCurve: 'continuous' },
        (variant === 'primary' || variant === 'danger') && !disabled ? raisedShadow : null,
      ]}
    >
      {loading ? (
        <ActivityIndicator
          size="small"
          color={variant === 'primary' || variant === 'danger' ? C.cream : C.pine}
        />
      ) : (
        icon
      )}
      <Text
        className={`text-base font-semibold ${textVariants[variant]}`}
        style={{ letterSpacing: -0.2 }}
      >
        {label}
      </Text>
    </PressScale>
  );
}

export function Field({
  label,
  hint,
  error,
  ...props
}: TextInputProps & { label: string; hint?: string; error?: string }) {
  const [focused, setFocused] = useState(false);
  return (
    <View className="gap-1.5">
      <Text className="text-sm font-medium text-foreground">{label}</Text>
      <TextInput
        placeholderTextColor="#8A968D"
        className={`rounded-xl border bg-card px-4 py-3.5 text-base text-foreground ${
          error ? 'border-destructive' : focused ? 'border-primary/50' : 'border-input'
        }`}
        style={{ borderCurve: 'continuous' }}
        {...props}
        onFocus={(e) => {
          setFocused(true);
          props.onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          props.onBlur?.(e);
        }}
      />
      {hint ? <Text className="text-xs text-muted-foreground">{hint}</Text> : null}
      {error ? <Text className="text-xs text-destructive">{error}</Text> : null}
    </View>
  );
}

export function Notice({
  tone = 'info',
  title,
  body,
  action,
}: {
  tone?: 'info' | 'warn' | 'danger' | 'success';
  title: string;
  body?: string;
  action?: React.ReactNode;
}) {
  const tones: Record<string, { bg: string; ink: string }> = {
    info: { bg: C.solo, ink: C.soloInk },
    warn: { bg: '#FBF3E2', ink: '#8A5A12' },
    danger: { bg: C.redSoft, ink: C.red },
    success: { bg: C.solo, ink: C.soloInk },
  };
  const t = tones[tone];
  return (
    <View
      style={{ backgroundColor: t.bg, borderRadius: 14, padding: 14, borderCurve: 'continuous' }}
      className="gap-1"
    >
      <Text style={{ color: t.ink }} className="text-sm font-semibold">
        {title}
      </Text>
      {body ? (
        <Text style={{ color: t.ink }} className="text-sm opacity-90">
          {body}
        </Text>
      ) : null}
      {action}
    </View>
  );
}

export function EmptyState({
  icon,
  title,
  body,
  action,
}: {
  icon?: React.ReactNode;
  title: string;
  body: string;
  action?: React.ReactNode;
}) {
  return (
    <View
      className="items-center gap-2 rounded-2xl border border-border/60 bg-card px-6 py-10"
      style={[{ borderCurve: 'continuous' }, cardShadow]}
    >
      {icon ? (
        <View className="mb-1 h-12 w-12 items-center justify-center rounded-full bg-muted">
          {icon}
        </View>
      ) : null}
      <Text className="text-center text-base font-semibold text-foreground">{title}</Text>
      <Text className="text-center text-sm text-muted-foreground">{body}</Text>
      {action ? <View className="mt-2 w-full">{action}</View> : null}
    </View>
  );
}

export function Sheet({
  visible,
  onClose,
  title,
  children,
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}) {
  const insets = useSafeAreaInsets();
  const reduced = useReducedMotion();
  // Backdrop fades while the panel rises on the iOS sheet curve. The Modal itself only
  // fades, so the dim layer never slides up with the sheet.
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View className="flex-1 justify-end" style={{ backgroundColor: 'rgba(12, 28, 22, 0.42)' }}>
        <Pressable className="flex-1" onPress={onClose} accessibilityLabel="Close" />
        <Animated.View
          entering={
            reduced
              ? FadeIn.duration(180)
              : SlideInDown.duration(340).easing(EASE_SHEET)
          }
          style={{ maxHeight: '85%' }}
        >
          <View
            className="rounded-t-[28px] bg-card px-5 pt-2.5"
            style={[
              { paddingBottom: insets.bottom + 20, borderCurve: 'continuous', maxHeight: '100%' },
              { boxShadow: '0 -12px 40px -16px rgba(12, 28, 22, 0.35)' },
            ]}
          >
          <View className="mb-2 items-center">
            <View className="h-1.5 w-10 rounded-full bg-border" />
          </View>
          <View className="mb-3 flex-row items-center justify-between">
            <Text
              className="flex-1 text-lg font-bold text-foreground"
              style={{ letterSpacing: -0.3 }}
            >
              {title}
            </Text>
            <PressScale
              onPress={onClose}
              hitSlop={10}
              accessibilityLabel="Close"
              className="h-8 w-8 items-center justify-center rounded-full bg-muted"
            >
              <X size={16} color={C.pine} strokeWidth={2.4} />
            </PressScale>
          </View>
          <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            {children}
          </ScrollView>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const TIME_OPTIONS = Array.from({ length: 48 }, (_, i) => i * 30);

export function TimeField({
  label,
  value,
  onChange,
  compact = false,
}: {
  label?: string;
  value: number;
  onChange: (minutes: number) => void;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <View className={compact ? '' : 'gap-1.5'}>
      {label ? <Text className="text-sm font-medium text-foreground">{label}</Text> : null}
      <PressScale
        onPress={() => setOpen(true)}
        className="rounded-xl border border-input bg-card px-3 py-2.5"
        style={{ borderCurve: 'continuous' }}
      >
        <Text
          className="text-base font-medium text-foreground"
          style={{ fontVariant: ['tabular-nums'] }}
        >
          {fmtTime(value)}
        </Text>
      </PressScale>
      <Sheet visible={open} onClose={() => setOpen(false)} title={label ?? 'Pick a time'}>
        <View className="flex-row flex-wrap gap-2 pb-4">
          {TIME_OPTIONS.map((m) => (
            <PressScale
              key={m}
              onPress={() => {
                tickSelection();
                onChange(m);
                setOpen(false);
              }}
              className={`rounded-lg border px-3 py-2 ${
                m === value ? 'border-primary bg-primary' : 'border-border bg-card'
              }`}
            >
              <Text
                className={`text-sm font-medium ${
                  m === value ? 'text-primary-foreground' : 'text-foreground'
                }`}
              >
                {fmtTime(m)}
              </Text>
            </PressScale>
          ))}
        </View>
      </Sheet>
    </View>
  );
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  const [width, setWidth] = useState(0);
  const reduced = useReducedMotion();
  const index = Math.max(
    0,
    options.findIndex((o) => o.value === value),
  );
  const segW = width > 0 ? (width - 8) / options.length : 0;

  // The pill is absolutely positioned and childless, so moving it never re-lays-out the
  // labels. Changed tens of times a day, so it stays short: 200ms strong ease-out.
  const pillStyle = useAnimatedStyle(() => ({
    transform: [
      {
        translateX: reduced
          ? index * segW
          : withTiming(index * segW, { duration: 200, easing: EASE_OUT }),
      },
    ],
    width: segW,
  }));

  return (
    <View
      className="flex-row rounded-xl bg-muted p-1"
      style={{ borderCurve: 'continuous' }}
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      accessibilityRole="tablist"
    >
      {segW > 0 ? (
        <Animated.View
          pointerEvents="none"
          style={[
            {
              position: 'absolute',
              top: 4,
              bottom: 4,
              left: 4,
              borderRadius: 8,
              backgroundColor: C.white,
              borderCurve: 'continuous',
            },
            cardShadow,
            pillStyle,
          ]}
        />
      ) : null}
      {options.map((o) => {
        const active = value === o.value;
        return (
          <Pressable
            key={o.value}
            onPress={() => {
              if (active) return;
              tickSelection();
              onChange(o.value);
            }}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            className={`flex-1 items-center rounded-lg px-2 py-2 ${
              segW > 0 ? '' : active ? 'bg-card' : ''
            }`}
          >
            <Text
              className={`text-xs font-semibold ${
                active ? 'text-foreground' : 'text-muted-foreground'
              }`}
            >
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function Loading() {
  return (
    <View className="flex-1 items-center justify-center bg-background">
      <ActivityIndicator size="large" color={C.pine} />
    </View>
  );
}

export function Row({
  children,
  className = '',
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <View className={`flex-row items-center gap-2 ${className}`}>{children}</View>;
}
