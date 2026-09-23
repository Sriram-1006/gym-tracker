import React, { useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';

import { useTheme } from '../theme/ThemeContext';
import { formatDisplayDate, parseISODateLocal, todayISO } from '../data/dateUtils';

/**
 * Shared date input used by Add Workout and Edit Workout.
 *
 * The *date semantics* are identical on every platform: the value is always a
 * local `YYYY-MM-DD` string, future dates are blocked, and the native picker
 * result is converted with `todayISO(selected)` (never `toISOString`, which
 * would shift the day across timezones).
 *
 * Only the input mechanism differs: a native DateTimePicker on iOS/Android and
 * a real `<input type="date">` on web, where
 * `@react-native-community/datetimepicker` has no complete implementation.
 */
export function DatePickerField({
  value,
  onChange,
  maximumDate,
  minimumDate = new Date(2020, 0, 1),
}: {
  value: string;
  onChange: (iso: string) => void;
  maximumDate?: Date;
  minimumDate?: Date;
}) {
  const theme = useTheme();
  const { colors, spacing, fontSize, radius, touchTarget } = theme;
  const [visible, setVisible] = useState(false);
  const max = maximumDate ?? new Date();
  const minISO = todayISO(minimumDate);
  const maxISO = todayISO(max);

  if (Platform.OS === 'web') {
    // Web: render a browser-native date input. Created via `createElement` so we
    // never import a DOM component into the native bundle's JSX.
    const input = React.createElement(
      'input',
      {
        type: 'date',
        value,
        min: minISO,
        max: maxISO,
        'aria-label': 'Workout date',
        onChange: (event: { target?: { value?: unknown } }) => {
          const next = event?.target?.value;
          if (typeof next === 'string' && next) onChange(next);
        },
        style: {
          minHeight: `${touchTarget}px`,
          width: '100%',
          boxSizing: 'border-box',
          borderRadius: `${radius}px`,
          border: `1px solid ${colors.border}`,
          backgroundColor: colors.surfaceAlt,
          color: colors.text,
          paddingLeft: `${spacing.m}px`,
          paddingRight: `${spacing.m}px`,
          fontSize: `${fontSize.body}px`,
          fontFamily: 'inherit',
        },
      } as Record<string, unknown>,
    );
    return <View>{input}</View>;
  }

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Workout date, ${formatDisplayDate(value)}`}
        onPress={() => setVisible(true)}
        style={[
          styles.pressable,
          {
            minHeight: touchTarget,
            borderRadius: radius,
            backgroundColor: colors.surfaceAlt,
            borderColor: colors.border,
          },
        ]}
      >
        <Text style={{ color: colors.text, fontSize: fontSize.body }}>
          {formatDisplayDate(value)}
        </Text>
        <Ionicons name="chevron-down" size={18} color={colors.textMuted} />
      </Pressable>

      {visible && (
        <DateTimePicker
          value={parseISODateLocal(value)}
          mode="date"
          display="default"
          is24Hour
          minimumDate={minimumDate}
          maximumDate={max}
          onChange={(_event, selected) => {
            setVisible(false);
            if (selected) onChange(todayISO(selected));
          }}
        />
      )}
    </>
  );
}

const styles = StyleSheet.create({
  pressable: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    borderWidth: StyleSheet.hairlineWidth,
  },
});
