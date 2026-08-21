import { type ReactNode } from 'react';
import { Modal, Pressable as RNPressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { cn } from '@/lib/cn';
import { colors } from '@/lib/theme';
import { Pressable } from './Pressable';
import { Text } from './Text';

export interface SheetProps {
  visible: boolean;
  onClose: () => void;
  title?: string;
  /** Optional one-line subtitle under the title. */
  subtitle?: string;
  children: ReactNode;
  className?: string;
}

/**
 * Bottom sheet built on RN's Modal.
 *
 * A dedicated sheet library (@gorhom/bottom-sheet) was rejected: every sheet in
 * this app is a fixed-height explainer or action list with no snap points, drag
 * gestures, or scroll-linked behaviour, so the library's ~40KB and its
 * reanimated/gesture-handler coupling buy nothing here.
 */
export function Sheet({ visible, onClose, title, subtitle, children, className }: SheetProps) {
  const insets = useSafeAreaInsets();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      {/* Backdrop: tapping outside dismisses. Not a design-system Pressable —
          it must not fire a haptic or expose a button role to screen readers. */}
      <RNPressable
        accessibilityRole="button"
        accessibilityLabel="Close"
        onPress={onClose}
        className="flex-1 bg-black/60"
      />
      <View
        className={cn(
          'rounded-t-xl border-t border-hairline/[0.14] bg-canvas-raise px-5 pt-3',
          className,
        )}
        style={{ paddingBottom: insets.bottom + 20 }}
      >
        <View className="mb-3 h-1 w-10 self-center rounded-pill bg-hairline/30" />
        {title ? (
          <View className="mb-4 flex-row items-start gap-3">
            <View className="flex-1 gap-1">
              <Text variant="title-md">{title}</Text>
              {subtitle ? (
                <Text variant="body-sm" tone="muted">
                  {subtitle}
                </Text>
              ) : null}
            </View>
            <Pressable
              onPress={onClose}
              accessibilityLabel="Close"
              className="h-8 w-8 items-center justify-center rounded-pill bg-canvas-raise"
            >
              <Ionicons name="close" size={18} color={colors.textSecondary} />
            </Pressable>
          </View>
        ) : null}
        {children}
      </View>
    </Modal>
  );
}
