import { useCallback, useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { Badge, Button, EmptyState, Glass, Pressable, ProgressBar, Text } from '@/components/ui';
import { OUTBOX_ITEMS, type OutboxItem, type OutboxState } from '@/api/mockData';
import { categoryColor, useColors } from '@/lib/theme';
import { formatRelativeTime } from '@/lib/format';
import { toast } from '@/stores/toastStore';

const STATE_TONE: Record<OutboxState, 'neutral' | 'accent' | 'success' | 'danger'> = {
  queued: 'neutral',
  uploading: 'accent',
  uploaded: 'success',
  failed: 'danger',
};

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function OutboxRow({
  item,
  onRetry,
  onCancel,
}: {
  item: OutboxItem;
  onRetry: (id: string) => void;
  onCancel: (id: string) => void;
}) {
  const c = useColors();
  const { t } = useTranslation();
  const hue = categoryColor[item.category];

  return (
    <Glass elevation="low" className="rounded-lg p-3">
      <View className="flex-row gap-3">
        <View className="overflow-hidden rounded-sm">
          <Image
            source={{ uri: item.thumbnailUrl }}
            style={{ width: 60, height: 60 }}
            contentFit="cover"
            transition={160}
          />
        </View>

        <View className="flex-1 gap-1.5">
          <View className="flex-row items-center gap-2">
            <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: hue }} />
            <Text variant="caption" tone="muted" className="uppercase">
              {t(`category.${item.category}`)}
            </Text>
            <Text variant="caption" tone="faint">
              · {formatRelativeTime(item.capturedAtIso)} · {formatBytes(item.byteSize)}
            </Text>
          </View>

          <Text variant="body-sm" numberOfLines={2}>
            {item.description}
          </Text>

          <View className="flex-row items-center gap-2">
            <Badge label={t(`outbox.state.${item.state}`)} tone={STATE_TONE[item.state]} />
            {item.waitingForWifi ? (
              <Badge label={t('outbox.waitingForWifi')} tone="warning" />
            ) : null}
            {item.attemptCount > 0 && item.state === 'failed' ? (
              <Text variant="caption" tone="faint">
                {t('outbox.attempt', { count: item.attemptCount })}
              </Text>
            ) : null}
          </View>

          {item.state === 'uploading' ? (
            <View className="gap-1">
              <ProgressBar
                progress={item.progress}
                accessibilityLabel={t('outbox.progressLabel', {
                  percent: Math.round(item.progress * 100),
                })}
              />
              <Text variant="caption" tone="muted">
                {Math.round(item.progress * 100)}%
              </Text>
            </View>
          ) : null}

          {item.lastError ? (
            <Text variant="caption" tone="danger">
              {item.lastError}
            </Text>
          ) : null}
        </View>

        <View className="gap-2">
          {item.state === 'failed' ? (
            <Pressable
              onPress={() => onRetry(item.id)}
              accessibilityLabel={t('common.retry')}
              className="h-9 w-9 items-center justify-center rounded-pill bg-glass/[0.14]"
            >
              <Ionicons name="refresh" size={17} color={c.textPrimary} />
            </Pressable>
          ) : null}
          <Pressable
            onPress={() => onCancel(item.id)}
            accessibilityLabel={t('common.cancel')}
            className="h-9 w-9 items-center justify-center rounded-pill bg-glass/[0.14]"
          >
            <Ionicons name="close" size={17} color={c.textMuted} />
          </Pressable>
        </View>
      </View>
    </Glass>
  );
}

/**
 * The offline upload queue.
 *
 * PHASE 3/4 PREVIEW — reads static demo rows. The real screen binds to the
 * SQLite outbox table and the sync engine's live progress, but the row shape
 * and every state it renders are already the ones the engine produces.
 */
export function OutboxScreen() {
  const c = useColors();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [items, setItems] = useState(OUTBOX_ITEMS);

  const pending = useMemo(() => items.filter((i) => i.state !== 'uploaded'), [items]);
  const failedCount = useMemo(() => items.filter((i) => i.state === 'failed').length, [items]);

  const handleRetry = useCallback(
    (id: string) => {
      setItems((prev) =>
        prev.map((i) =>
          i.id === id ? { ...i, state: 'uploading', progress: 0.05, lastError: null } : i,
        ),
      );
      toast.info(t('outbox.retrying'));
    },
    [t],
  );

  const handleCancel = useCallback(
    (id: string) => {
      setItems((prev) => prev.filter((i) => i.id !== id));
      toast.info(t('outbox.cancelled'));
    },
    [t],
  );

  const handleRetryAll = useCallback(() => {
    setItems((prev) =>
      prev.map((i) =>
        i.state === 'failed' ? { ...i, state: 'queued', lastError: null, progress: 0 } : i,
      ),
    );
    toast.success(t('outbox.retryingAll'));
  }, [t]);

  return (
    <View className="flex-1 bg-canvas" style={{ paddingTop: insets.top }}>
      <View className="flex-row items-end justify-between px-5 pb-4 pt-2">
        <View className="gap-1">
          <Text variant="display-md">{t('outbox.title')}</Text>
          <Text variant="body-sm" tone="muted">
            {pending.length > 0
              ? t('outbox.pendingCount', { count: pending.length })
              : t('outbox.allSent')}
          </Text>
        </View>
        {failedCount > 0 ? (
          <Button label={t('outbox.retryAll')} variant="glass" size="sm" onPress={handleRetryAll} />
        ) : null}
      </View>

      {pending.length === 0 ? (
        <EmptyState
          icon="cloud-done-outline"
          title={t('outbox.emptyTitle')}
          description={t('outbox.emptyBody')}
        />
      ) : (
        <ScrollView
          contentContainerClassName="gap-3 px-4"
          contentContainerStyle={{ paddingBottom: insets.bottom + 96 }}
          showsVerticalScrollIndicator={false}
        >
          {/* The sync engine drains oldest-first, one at a time — this note is
              why a user watching the queue sees only one bar moving. */}
          <Glass elevation="low" className="flex-row items-center gap-2.5 rounded-md px-3.5 py-3">
            <Ionicons name="information-circle-outline" size={17} color={c.info} />
            <Text variant="caption" tone="muted" className="flex-1">
              {t('outbox.explainer')}
            </Text>
          </Glass>

          {pending.map((item) => (
            <OutboxRow key={item.id} item={item} onRetry={handleRetry} onCancel={handleCancel} />
          ))}
        </ScrollView>
      )}
    </View>
  );
}
