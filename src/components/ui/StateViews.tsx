import { type ReactNode } from 'react';
import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { cn } from '@/lib/cn';
import { colors } from '@/lib/theme';
import { Button } from './Button';
import { Skeleton } from './Skeleton';
import { Text } from './Text';

/*
 * The three designed list states required by the quality bar.
 * A bare <ActivityIndicator/> is never an acceptable empty state, so these are
 * the only sanctioned way to render "nothing here yet".
 */

interface EmptyStateProps {
  icon?: keyof typeof Ionicons.glyphMap;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
  className?: string;
}

export function EmptyState({
  icon = 'file-tray-outline',
  title,
  description,
  actionLabel,
  onAction,
  className,
}: EmptyStateProps) {
  return (
    <View className={cn('flex-1 items-center justify-center gap-4 px-8 py-12', className)}>
      <View className="h-20 w-20 items-center justify-center rounded-2xl bg-accent-wash">
        <Ionicons name={icon} size={32} color={colors.accent} />
      </View>
      <Text variant="title-lg" className="text-center">
        {title}
      </Text>
      <Text variant="body" tone="muted" className="text-center">
        {description}
      </Text>
      {actionLabel && onAction ? (
        <Button label={actionLabel} onPress={onAction} className="mt-2" />
      ) : null}
    </View>
  );
}

interface ErrorStateProps {
  title: string;
  /** What actually went wrong, in plain language. Never a stack trace. */
  description: string;
  retryLabel: string;
  onRetry: () => void;
  className?: string;
}

export function ErrorState({
  title,
  description,
  retryLabel,
  onRetry,
  className,
}: ErrorStateProps) {
  return (
    <View className={cn('flex-1 items-center justify-center gap-4 px-8 py-12', className)}>
      <View className="h-20 w-20 items-center justify-center rounded-2xl bg-danger-wash">
        <Ionicons name="alert-circle-outline" size={32} color={colors.danger} />
      </View>
      <Text variant="title-lg" className="text-center">
        {title}
      </Text>
      <Text variant="body" tone="muted" className="text-center">
        {description}
      </Text>
      <Button label={retryLabel} variant="glass" onPress={onRetry} className="mt-2" />
    </View>
  );
}

interface SkeletonListProps {
  count?: number;
  /** Render one placeholder row; defaults to a generic card shape. */
  renderItem?: (index: number) => ReactNode;
  className?: string;
}

export function SkeletonList({ count = 6, renderItem, className }: SkeletonListProps) {
  return (
    <View className={cn('gap-3 px-4 py-4', className)} accessibilityLabel="Loading">
      {Array.from({ length: count }, (_, i) =>
        renderItem ? (
          <View key={i}>{renderItem(i)}</View>
        ) : (
          <View key={i} className="flex-row gap-3">
            <Skeleton className="h-16 w-16 rounded-sm" />
            <View className="flex-1 gap-2 py-1">
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-3 w-1/3" />
            </View>
          </View>
        ),
      )}
    </View>
  );
}
