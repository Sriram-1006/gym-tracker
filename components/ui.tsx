import React from 'react';
import {
  Modal as RNModal,
  Pressable,
  PressableProps,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  View,
  ViewProps,
} from 'react-native';

import { Ionicons } from '@expo/vector-icons';

import { useTheme } from '../theme/ThemeContext';

/* -------------------------------- Button -------------------------------- */

interface ButtonProps extends PressableProps {
  label: string;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'md' | 'sm';
}

export function Button({ label, variant = 'primary', size = 'md', style, ...rest }: ButtonProps) {
  const theme = useTheme();
  const { colors, touchTarget } = theme;
  const minH = size === 'md' ? touchTarget : Math.max(36, touchTarget - 8);
  const minW = size === 'md' ? undefined : 64;

  const bg =
    variant === 'primary'
      ? colors.accent
      : variant === 'danger'
        ? colors.destructive
        : variant === 'ghost'
          ? 'transparent'
          : colors.surfaceAlt;
  const fg =
    variant === 'primary'
      ? colors.accentText
      : variant === 'danger'
        ? colors.accentText
        : variant === 'ghost'
          ? colors.accent
          : colors.text;
  const border = variant === 'ghost' ? 'transparent' : colors.border;

  return (
    <Pressable
      accessibilityRole="button"
      style={[
        styles.button,
        { backgroundColor: bg, minHeight: minH, minWidth: minW, borderColor: border, paddingHorizontal: size === 'md' ? theme.spacing.l : theme.spacing.m },
        style as any,
      ]}
      {...rest}
    >
      <Text style={[styles.buttonLabel, { color: fg, fontSize: size === 'md' ? theme.fontSize.body : theme.fontSize.caption }]}>{label}</Text>
    </Pressable>
  );
}

/* -------------------------------- Card ---------------------------------- */

export function Card({ style, children, ...rest }: ViewProps & { children?: React.ReactNode }) {
  const { colors, spacing, radius } = useTheme();
  return (
    <View
      style={[
        {
          backgroundColor: colors.surface,
          borderRadius: radius,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: colors.border,
          padding: spacing.m,
        },
        style as any,
      ]}
      {...rest}
    >
      {children}
    </View>
  );
}

/* ------------------------------ SectionTitle ---------------------------- */

export function SectionTitle({ children }: { children: React.ReactNode }) {
  const { colors, fontSize, spacing } = useTheme();
  return (
    <Text
      style={{
        color: colors.textMuted,
        fontSize: fontSize.caption,
        fontWeight: '700',
        textTransform: 'uppercase',
        letterSpacing: 0.6,
        marginTop: spacing.l,
        marginBottom: spacing.s,
      }}
    >
      {children}
    </Text>
  );
}

/* ------------------------------ ProgressBar ----------------------------- */

export function ProgressBar({
  ratio,
  color,
  height = 10,
}: {
  ratio: number; // 0..1 (values > 1 clamp visually)
  color?: string;
  height?: number;
}) {
  const { colors } = useTheme();
  const clamped = Math.max(0, Math.min(1, ratio));
  return (
    <View style={{ height, borderRadius: height / 2, backgroundColor: colors.progressTrack, overflow: 'hidden' }}>
      <View
        style={{
          width: `${clamped * 100}%`,
          height: '100%',
          backgroundColor: color ?? colors.accent,
          borderRadius: height / 2,
        }}
      />
    </View>
  );
}

/* -------------------------------- Field --------------------------------- */

export function Field({ label, error, ...inputProps }: TextInputProps & { label: string; error?: string }) {
  const { colors, spacing, radius, fontSize, touchTarget } = useTheme();
  return (
    <View>
      <Text style={{ color: colors.textMuted, fontSize: fontSize.caption, marginBottom: spacing.xs }}>{label}</Text>
      <TextInput
        placeholderTextColor={colors.textMuted}
        style={{
          backgroundColor: colors.surfaceAlt,
          color: colors.text,
          borderRadius: radius,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: colors.border,
          paddingHorizontal: spacing.m,
          minHeight: touchTarget,
          fontSize: fontSize.body,
        }}
        {...inputProps}
      />
      {error ? (
        <Text style={{ color: colors.destructive, fontSize: fontSize.caption, marginTop: spacing.xs }}>{error}</Text>
      ) : null}
    </View>
  );
}

/* -------------------------------- Modal --------------------------------- */

export function ModalSheet({
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
  const { colors, spacing, fontSize } = useTheme();
  return (
    <RNModal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.modalBackdrop} onPress={onClose}>
        <Pressable style={[styles.modalSheet, { backgroundColor: colors.surface, padding: spacing.l }]}>
          <Text style={{ color: colors.text, fontSize: fontSize.title, fontWeight: '700', marginBottom: spacing.m }}>{title}</Text>
          {children}
        </Pressable>
      </Pressable>
    </RNModal>
  );
}

/* ----------------------------- ConfirmDialog ---------------------------- */

/**
 * Themed, in-app replacement for Alert.alert with button callbacks.
 * react-native-web implements Alert as a no-op, so any flow that depends on
 * Alert button presses (delete confirmation, rest-day confirmation) silently
 * does nothing on web. This dialog renders a real Modal everywhere and keeps
 * the native-style contract: cancel / destructive confirm + onConfirm.
 */
export function ConfirmDialog({
  visible,
  title,
  message,
  children,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  destructive = false,
  onConfirm,
  onCancel,
}: {
  visible: boolean;
  title: string;
  message?: string;
  /** Optional block rendered under the message (e.g. an import summary). */
  children?: React.ReactNode;
  confirmLabel?: string;
  /** Empty string hides the cancel button (OK-only dialogs). */
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const { colors, spacing, fontSize, radius, touchTarget } = useTheme();
  return (
    <RNModal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={[styles.centerBackdrop, { padding: spacing.l }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onCancel} accessibilityLabel={cancelLabel} />
        <View
          style={{
            backgroundColor: colors.surface,
            borderRadius: radius + 4,
            borderWidth: StyleSheet.hairlineWidth,
            borderColor: colors.border,
            padding: spacing.l,
            width: '100%',
            maxWidth: 340,
          }}
        >
          <Text style={{ color: colors.text, fontSize: fontSize.title, fontWeight: '700', marginBottom: spacing.s }}>
            {title}
          </Text>
          {message ? (
            <Text
              style={{
                color: colors.textMuted,
                fontSize: fontSize.body,
                lineHeight: 21,
                marginBottom: children ? spacing.s : spacing.m,
              }}
            >
              {message}
            </Text>
          ) : null}
          {children ? <View style={{ marginBottom: spacing.m }}>{children}</View> : null}
          <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: spacing.s }}>
            {cancelLabel ? <Button label={cancelLabel} variant="ghost" size="sm" onPress={onCancel} /> : null}
            <Button
              label={confirmLabel}
              size="sm"
              variant={destructive ? 'danger' : 'primary'}
              onPress={onConfirm}
              style={{ minHeight: touchTarget - 8 }}
            />
          </View>
        </View>
      </View>
    </RNModal>
  );
}

/* ------------------------------- EmptyState ------------------------------ */

export function EmptyState({ message }: { message: string }) {
  const { colors, fontSize, spacing } = useTheme();
  return (
    <View style={{ padding: spacing.xl, alignItems: 'center' }}>
      <Text style={{ color: colors.textMuted, fontSize: fontSize.body, textAlign: 'center' }}>{message}</Text>
    </View>
  );
}

/* ------------------------------- Stepper -------------------------------- */

export function Stepper({
  value,
  onChange,
  step = 2.5,
  suffix,
}: {
  value: number;
  onChange: (v: number) => void;
  step?: number;
  suffix?: string;
}) {
  const { colors, touchTarget, spacing, fontSize, radius } = useTheme();
  const round = (v: number) => Math.round(v * 100) / 100;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
      <Pressable
        accessibilityRole="button"
        onPress={() => onChange(round(Math.max(0, value - step)))}
        style={[styles.stepperBtn, { backgroundColor: colors.surfaceAlt, minHeight: touchTarget, minWidth: touchTarget, borderRadius: radius, borderColor: colors.border }]}
      >
        <Ionicons name="remove" size={20} color={colors.text} />
      </Pressable>
      <TextInput
        value={String(value)}
        keyboardType="decimal-pad"
        onChangeText={(t) => {
          const n = Number(t.replace(',', '.'));
          onChange(Number.isFinite(n) ? Math.max(0, n) : 0);
        }}
        style={{
          flex: 1,
          textAlign: 'center',
          color: colors.text,
          fontSize: fontSize.body,
          minHeight: touchTarget,
          marginHorizontal: spacing.xs,
          backgroundColor: colors.surfaceAlt,
          borderRadius: radius,
        }}
      />
      <Pressable
        accessibilityRole="button"
        onPress={() => onChange(round(value + step))}
        style={[styles.stepperBtn, { backgroundColor: colors.surfaceAlt, minHeight: touchTarget, minWidth: touchTarget, borderRadius: radius, borderColor: colors.border }]}
      >
        <Ionicons name="add" size={20} color={colors.text} />
      </Pressable>
      {suffix ? (
        <Text style={{ color: colors.textMuted, marginLeft: spacing.s, fontSize: fontSize.body }}>{suffix}</Text>
      ) : null}
    </View>
  );
}

/* ------------------------------- Segmented ------------------------------ */

export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { label: string; value: T }[];
  value: T;
  onChange: (v: T) => void;
}) {
  const { colors, spacing, radius, touchTarget } = useTheme();
  return (
    <View style={{ flexDirection: 'row', backgroundColor: colors.surfaceAlt, borderRadius: radius, padding: spacing.xs }}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="button"
            onPress={() => onChange(o.value)}
            style={{
              flex: 1,
              minHeight: touchTarget - 8,
              borderRadius: radius - 4,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: active ? colors.accent : 'transparent',
              paddingHorizontal: spacing.s,
            }}
          >
            <Text style={{ color: active ? colors.accentText : colors.text, fontSize: 13, fontWeight: '600' }}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  button: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
  },
  buttonLabel: {
    fontWeight: '700',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  centerBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalSheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
  stepperBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
  },
});
