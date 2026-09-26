import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '../theme/ThemeContext';

type ToastState = { key: number; message: string } | null;

/**
 * Module-level toast emitter. Any code (screens, dialogs) can call
 * `showToast('...')` without threading callbacks through the tree; the single
 * <ToastHost /> mounted at the app root renders the current message.
 * Implemented in-app rather than via Alert so it behaves identically on
 * iOS, Android and web — react-native-web's Alert is a no-op.
 */
let emitToast: ((t: ToastState) => void) | null = null;
let nextKey = 0;

export function showToast(message: string) {
  emitToast?.({ key: ++nextKey, message });
}

const TOAST_DURATION_MS = 2200;

export function ToastHost() {
  const { colors, spacing, fontSize, radius } = useTheme();
  const insets = useSafeAreaInsets();
  const [toast, setToast] = useState<ToastState>(null);

  useEffect(() => {
    emitToast = setToast;
    return () => {
      emitToast = null;
    };
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), TOAST_DURATION_MS);
    return () => clearTimeout(timer);
  }, [toast]);

  if (!toast) return null;

  return (
    <View pointerEvents="none" style={styles.host}>
      <View
        style={[
          styles.toast,
          {
            // Sits above the bottom tab bar (tab bar height + its safe inset).
            bottom: insets.bottom + 88,
            backgroundColor: colors.text,
            borderRadius: radius + 8,
            paddingHorizontal: spacing.l,
            paddingVertical: spacing.s + 4,
          },
        ]}
      >
        <Text
          style={{
            color: colors.background,
            fontSize: fontSize.body,
            fontWeight: '600',
            textAlign: 'center',
          }}
        >
          {toast.message}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  host: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    zIndex: 1000,
    elevation: 1000,
  },
  toast: {
    position: 'absolute',
    maxWidth: '86%',
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 6,
  },
});
