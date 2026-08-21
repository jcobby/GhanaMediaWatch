import { useEffect } from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeInUp, FadeOutUp } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { useToastStore, type Toast as ToastModel, type ToastTone } from '@/stores/toastStore';
import { colors } from '@/lib/theme';
import { Pressable } from './Pressable';
import { Text } from './Text';

const ICON: Record<ToastTone, keyof typeof Ionicons.glyphMap> = {
  success: 'checkmark-circle',
  warning: 'warning',
  danger: 'alert-circle',
  info: 'information-circle',
};

function ToastCard({ toast }: { toast: ToastModel }) {
  const dismiss = useToastStore((s) => s.dismiss);
  const iconColor: Record<ToastTone, string> = {
    success: colors.success,
    warning: colors.warning,
    danger: colors.danger,
    info: colors.info,
  };

  useEffect(() => {
    const timer = setTimeout(() => dismiss(toast.id), toast.durationMs);
    return () => clearTimeout(timer);
  }, [toast.id, toast.durationMs, dismiss]);

  return (
    <Animated.View entering={FadeInUp.duration(180)} exiting={FadeOutUp.duration(140)}>
      <View
        accessibilityRole="alert"
        accessibilityLiveRegion={toast.tone === 'danger' ? 'assertive' : 'polite'}
        className="mx-4 mb-2 flex-row items-start gap-3 rounded-md border border-hairline/[0.14] bg-canvas-raise px-4 py-3"
      >
        <Ionicons name={ICON[toast.tone]} size={20} color={iconColor[toast.tone]} />
        <View className="flex-1 gap-0.5">
          <Text variant="body" className="font-sans-semibold">
            {toast.title}
          </Text>
          {toast.description ? (
            <Text variant="body-sm" tone="secondary">
              {toast.description}
            </Text>
          ) : null}
        </View>
        {toast.actionLabel && toast.onAction ? (
          <Pressable
            onPress={() => {
              toast.onAction?.();
              dismiss(toast.id);
            }}
            accessibilityLabel={toast.actionLabel}
            className="pt-0.5"
          >
            <Text variant="body-sm" tone="accent" className="font-sans-semibold">
              {toast.actionLabel}
            </Text>
          </Pressable>
        ) : (
          <Pressable
            onPress={() => dismiss(toast.id)}
            haptic={false}
            accessibilityLabel="Dismiss"
            className="pt-0.5"
          >
            <Ionicons name="close" size={16} color={colors.textMuted} />
          </Pressable>
        )}
      </View>
    </Animated.View>
  );
}

/** Mounted once at the root, above the navigator. */
export function ToastHost() {
  const toasts = useToastStore((s) => s.toasts);
  const insets = useSafeAreaInsets();

  if (toasts.length === 0) return null;

  return (
    <View
      pointerEvents="box-none"
      className="absolute left-0 right-0 top-0 z-50"
      style={{ paddingTop: insets.top + 8 }}
    >
      {toasts.map((t) => (
        <ToastCard key={t.id} toast={t} />
      ))}
    </View>
  );
}
