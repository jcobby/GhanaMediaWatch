import { type ReactNode } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable as RNPressable,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { cn } from '@/lib/cn';
import { useColors } from '@/lib/theme';
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
 *
 * **The keyboard is handled here, once.** A sheet sits at the bottom of the
 * screen, which is exactly where the keyboard appears — so any sheet containing
 * a field had its field and its send button covered the moment somebody tapped
 * to type. Writing a comment meant typing blind into a box you could not see,
 * with no way to reach the control that would post it.
 *
 * Fixed on the component rather than on the comment composer, because every
 * sheet has the same shape and the next one with a field in it would have the
 * same bug.
 *
 * **And it can never grow past the top of the screen.** The panel had no height
 * limit, so tall content simply pushed it upwards: the grab handle, the title
 * and the close button slid off above the status bar, and the backdrop — the
 * other way out — was squeezed to nothing at the same time. On iOS, which has
 * no hardware back button, that is a screen with no exit at all. It took a
 * report with a video in it to reach that size, which is exactly the sheet a
 * reporter opens to check on their own footage.
 */
export function Sheet({ visible, onClose, title, subtitle, children, className }: SheetProps) {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const { height: screenH } = useWindowDimensions();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      {/*
        The two platforms need different behaviours, and neither default works.

        iOS gets `padding`: the sheet is pushed up by exactly the keyboard's
        height, which is what the rest of this app already does on its sign-in
        screens.

        Android gets `height`. Its usual mechanism is the window resizing under
        `adjustResize`, and that does not reach a `Modal` rendered with
        `statusBarTranslucent` — so leaving the behaviour unset, which is the
        normal Android advice, leaves the sheet exactly where the keyboard
        covers it.
      */}
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        className="flex-1 justify-end"
      >
        {/* Backdrop: tapping outside dismisses. Not a design-system Pressable —
            it must not fire a haptic or expose a button role to screen readers. */}
        <RNPressable
          accessibilityRole="button"
          accessibilityLabel="Close"
          onPress={onClose}
          className="flex-1 bg-black/60"
        />
        {/*
          `maxHeight` bites only when the content is taller than the screen, so
          every short sheet is untouched. The status-bar inset is left clear so
          the handle and the title are never underneath the clock.
        */}
        <View
          className={cn(
            'overflow-hidden rounded-t-xl border-t border-hairline/[0.14] bg-canvas-raise px-5 pt-3',
            className,
          )}
          style={{
            paddingBottom: insets.bottom + 20,
            maxHeight: screenH - insets.top - 12,
          }}
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
                <Ionicons name="close" size={18} color={c.textSecondary} />
              </Pressable>
            </View>
          ) : null}
          {/*
            The header keeps its height and the body gives way.
            Without `shrink` the two are laid out as equals against the cap and
            the title is the half that loses — which is the close button gone
            again, by a smaller margin.
          */}
          <View className="shrink">{children}</View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
