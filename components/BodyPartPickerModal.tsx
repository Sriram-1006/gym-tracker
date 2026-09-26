import { useState, useEffect } from 'react';
import { Modal, Pressable, StyleSheet, Text, TextInput, View, Platform, BackHandler } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useTheme } from '../theme/ThemeContext';
import { EXERCISE_LIBRARY } from '../data/exerciseLibrary';
import { Button } from '../components/ui';

interface BodyPartPickerModalProps {
  visible: boolean;
  onClose: () => void;
  onConfirm: (bodyPart: string) => void;
  alreadyInDraft: Set<string>;
  currentBodyPart: string | null;
}

export function BodyPartPickerModal({
  visible,
  onClose,
  onConfirm,
  alreadyInDraft,
  currentBodyPart,
}: BodyPartPickerModalProps) {
  const theme = useTheme();
  const { colors, spacing, fontSize, radius, touchTarget } = theme;

  const [selectedBodyPart, setSelectedBodyPart] = useState<string | null>(null);
  const [customBodyPart, setCustomBodyPart] = useState('');

  // Reset selection when modal opens/closes
  useEffect(() => {
    if (visible) {
      setSelectedBodyPart(currentBodyPart);
      setCustomBodyPart('');
    } else {
      setSelectedBodyPart(null);
      setCustomBodyPart('');
    }
  }, [visible, currentBodyPart]);

  // Handle hardware back button on Android (BackHandler is a no-op on web).
  useEffect(() => {
    if (!visible || Platform.OS === 'web') return;
    const backHandler = BackHandler.addEventListener('hardwareBackPress', () => {
      onClose();
      return true;
    });
    return () => backHandler.remove();
  }, [visible, onClose]);

  const handleChipPress = (bodyPart: string) => {
    setSelectedBodyPart((prev) => (prev === bodyPart ? null : bodyPart));
    // Clear custom text when a chip is selected (mutual exclusion)
    setCustomBodyPart('');
  };

  const handleCustomTextChange = (text: string) => {
    setCustomBodyPart(text);
    // Clear chip selection when typing custom text (mutual exclusion)
    if (text.trim()) {
      setSelectedBodyPart(null);
    }
  };

  const handleAddPress = () => {
    const customTrimmed = customBodyPart.trim();
    if (customTrimmed) {
      onConfirm(customTrimmed);
    } else if (selectedBodyPart) {
      onConfirm(selectedBodyPart);
    }
  };

  const handleExitPress = () => {
    onClose();
  };

  const handleBackdropPress = () => {
    onClose();
  };

  const bodyParts = Object.keys(EXERCISE_LIBRARY);

  const hasValidSelection = customBodyPart.trim() !== '' || selectedBodyPart !== null;

  if (!visible) return null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={handleBackdropPress} accessibilityLabel="Close picker">
        <Pressable style={[styles.pickerSheet, { backgroundColor: colors.surface, borderColor: colors.border }]} onPress={(e) => e.stopPropagation()}>
          <Text style={{ color: colors.text, fontWeight: '700', fontSize: fontSize.title, marginBottom: spacing.m }}>
            Select body part
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.s, marginBottom: spacing.l }}>
            {bodyParts.map((p) => {
              const isAlreadyInDraft = alreadyInDraft.has(p);
              const isSelected = selectedBodyPart === p;
              return (
                <Pressable
                  key={p}
                  accessibilityRole="button"
                  accessibilityState={{ selected: isSelected }}
                  onPress={() => handleChipPress(p)}
                  style={{
                    minHeight: touchTarget,
                    justifyContent: 'center',
                    paddingHorizontal: spacing.m,
                    borderRadius: radius,
                    backgroundColor: isSelected ? colors.accent : isAlreadyInDraft ? colors.accentMuted : colors.surfaceAlt,
                    borderWidth: isAlreadyInDraft ? 2 : StyleSheet.hairlineWidth,
                    borderColor: isAlreadyInDraft ? colors.accent : colors.border,
                    opacity: isAlreadyInDraft && !isSelected ? 0.7 : 1,
                  }}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
                    <Text style={{ color: isSelected ? colors.accentText : isAlreadyInDraft ? colors.accent : colors.text }}>
                      {p}
                    </Text>
                    {isAlreadyInDraft && !isSelected && (
                      <Ionicons name="checkmark-circle" size={18} color={colors.accent} />
                    )}
                  </View>
                </Pressable>
              );
            })}
          </View>
          <TextInput
            value={customBodyPart}
            onChangeText={handleCustomTextChange}
            placeholder="…or type a custom body part"
            placeholderTextColor={colors.textMuted}
            style={{
              marginBottom: spacing.m,
              minHeight: touchTarget,
              borderRadius: radius,
              backgroundColor: colors.surfaceAlt,
              color: colors.text,
              paddingHorizontal: spacing.m,
              fontSize: fontSize.body,
              borderWidth: StyleSheet.hairlineWidth,
              borderColor: colors.border,
            }}
            autoCapitalize="words"
          />
          <View style={{ flexDirection: 'row', gap: spacing.s, marginTop: spacing.m }}>
            <Button
              label="Exit"
              variant="ghost"
              onPress={handleExitPress}
              style={{ flex: 1 }}
            />
            <Button
              label="Add"
              variant="primary"
              onPress={handleAddPress}
              disabled={!hasValidSelection}
              style={{ flex: 1 }}
            />
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  pickerSheet: {
    width: '100%',
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 20,
  },
});