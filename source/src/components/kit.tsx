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
  type TextInputProps,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { C } from '@/lib/colors';
import { fmtTime } from '@/lib/dates';

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
        <Text className="text-2xl font-bold text-foreground">{title}</Text>
        {subtitle ? (
          <Text className="mt-1 text-sm text-muted-foreground">{subtitle}</Text>
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
      className={`rounded-2xl border border-border bg-card p-4 ${className}`}
      style={{ borderCurve: 'continuous' }}
    >
      {children}
    </View>
  );
}

export function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <Text className="mb-2 mt-5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
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
    <Pressable onPress={onPress} className="active:opacity-70">
      {content}
    </Pressable>
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
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      className={`flex-row items-center justify-center gap-2 rounded-xl ${sizes[size]} ${
        variants[variant]
      } ${full ? 'w-full' : ''} ${disabled ? 'opacity-40' : 'active:opacity-80'}`}
      style={{ borderCurve: 'continuous' }}
    >
      {loading ? <ActivityIndicator size="small" color={C.cream} /> : icon}
      <Text className={`text-base font-semibold ${textVariants[variant]}`}>{label}</Text>
    </Pressable>
  );
}

export function Field({
  label,
  hint,
  error,
  ...props
}: TextInputProps & { label: string; hint?: string; error?: string }) {
  return (
    <View className="gap-1.5">
      <Text className="text-sm font-medium text-foreground">{label}</Text>
      <TextInput
        placeholderTextColor={C.muted}
        className="rounded-xl border border-input bg-card px-4 py-3.5 text-base text-foreground"
        {...props}
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
      style={{ backgroundColor: t.bg, borderRadius: 14, padding: 14 }}
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
    <View className="items-center gap-2 rounded-2xl border border-dashed border-border bg-card px-6 py-10">
      {icon}
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
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View className="flex-1 justify-end bg-black/40">
        <Pressable className="flex-1" onPress={onClose} />
        <View
          className="max-h-[85%] rounded-t-3xl bg-card px-5 pt-4"
          style={{ paddingBottom: insets.bottom + 20 }}
        >
          <View className="mb-3 flex-row items-center justify-between">
            <Text className="flex-1 text-lg font-bold text-foreground">{title}</Text>
            <Pressable onPress={onClose} className="p-2 active:opacity-60">
              <X size={20} color={C.pine} />
            </Pressable>
          </View>
          <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            {children}
          </ScrollView>
        </View>
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
      <Pressable
        onPress={() => setOpen(true)}
        className="rounded-xl border border-input bg-card px-3 py-2.5 active:opacity-70"
      >
        <Text className="text-base font-medium text-foreground">{fmtTime(value)}</Text>
      </Pressable>
      <Sheet visible={open} onClose={() => setOpen(false)} title={label ?? 'Pick a time'}>
        <View className="flex-row flex-wrap gap-2 pb-4">
          {TIME_OPTIONS.map((m) => (
            <Pressable
              key={m}
              onPress={() => {
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
            </Pressable>
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
  return (
    <View className="flex-row gap-1 rounded-xl bg-muted p-1">
      {options.map((o) => (
        <Pressable
          key={o.value}
          onPress={() => onChange(o.value)}
          className={`flex-1 items-center rounded-lg px-2 py-2 ${
            value === o.value ? 'bg-card' : ''
          }`}
        >
          <Text
            className={`text-xs font-semibold ${
              value === o.value ? 'text-foreground' : 'text-muted-foreground'
            }`}
          >
            {o.label}
          </Text>
        </Pressable>
      ))}
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
