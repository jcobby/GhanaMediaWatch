import { useCallback, useEffect, useMemo } from 'react';
import { ScrollView, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { GnaMark } from '@/components/Brand';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { Badge, Button, EmptyState, Glass, Pressable, ProgressBar, Text } from '@/components/ui';
import type { OutboxItem, OutboxState } from '@/api/mockData';
import { useOutboxStore } from '@/stores/outboxStore';
import { applyEvent, drain } from '@/services/sync';
import { progressRatio, type OutboxRecord } from './outboxMachine';
import { categoryHue, useColors } from '@/lib/theme';
import { formatRelativeTime } from '@/lib/format';
import { toast } from '@/stores/toastStore';

const STATE_TONE: Record<OutboxState, 'neutral' | 'accent' | 'success' | 'danger'> = {
  queued: 'neutral',
  uploading: 'accent',
  uploaded: 'success',
  failed: 'danger',
};

/**
 * A database row as the list renders it.
 *
 * The stored record has no capture timestamp or thumbnail — the row is written
 * before the media is even hashed — so the queue time stands in for "when",
 * which is what the reporter is actually asking.
 */
function toRow(record: OutboxRecord): OutboxItem {
  return {
    id: record.id,
    category: record.category,
    description: record.description,
    thumbnailUrl: '',
    kind: 'video',
    byteSize: record.byteSize,
    capturedAtIso: new Date(record.createdAt).toISOString(),
    state: record.state as OutboxState,
    progress: progressRatio(record),
    attemptCount: record.attemptCount,
    lastError: record.lastError,
    waitingForWifi: record.waitingForWifi,
  };
}

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
  const hue = categoryHue(item.category);

  return (
    <Glass elevation="low" className="rounded-lg p-3">
      <View className="flex-row gap-3">
        {/*
          The mark, not the footage.

          A report in the outbox has not been seen by anyone yet — it is not
          news, it is a file on its way out. Showing the frame here makes the
          queue look like a gallery of published work, and on a failed row it
          makes a report that never left the phone look like one that ran.

          The GNA mark on a plain ground says what it actually is: something
          this app is carrying on the reporter's behalf.
        */}
        {/* Explicit size: the tile used to be sized by the image inside it, and
            NativeWind will not compile an arbitrary `w-[60px]`. */}
        <View
          className="items-center justify-center overflow-hidden rounded-sm bg-canvas-raise"
          style={{ width: 60, height: 60 }}
        >
          <GnaMark size={34} />
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
 * Bound to the SQLite outbox table and the sync engine's live progress, so what
 * a reporter sees here is their own work: the report they just filmed, its real
 * size, its real attempt count, and the actual error if it failed.
 *
 * It previously rendered four invented rows. That is a worse failure than an
 * empty screen — somebody who had just filmed something saw four uploads that
 * were not theirs, and pressing retry advanced a fixture through a fake state
 * machine while their own report sat untouched.
 */
export function OutboxScreen() {
  const c = useColors();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  /*
   * The reporter's own queue, read from the device database.
   *
   * This screen used to render a fixed list of four invented reports — so
   * somebody who had just filmed something saw four strangers' uploads and
   * none of their own, and the retry button moved a fixture through a fake
   * state machine while their real report sat untouched.
   */
  const records = useOutboxStore((s) => s.records);
  const refresh = useOutboxStore((s) => s.refresh);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const items = useMemo(() => records.map(toRow), [records]);
  const pending = useMemo(() => items.filter((i) => i.state !== 'uploaded'), [items]);
  const failedCount = useMemo(() => items.filter((i) => i.state === 'failed').length, [items]);
  /*
   * Whether this phone has ever completed one.
   *
   * It changes what an empty queue means. For somebody who has never filed,
   * "nothing waiting" is the ordinary starting state. For somebody who watched
   * a report send thirty seconds ago it is the answer to "where did it go?" —
   * and only the second person should be pointed at their reports.
   */
  const sentSomething = useMemo(() => items.some((i) => i.state === 'uploaded'), [items]);

  const handleRetry = useCallback(
    (id: string) => {
      const record = records.find((r) => r.id === id);
      if (!record) return;
      applyEvent(record, { type: 'RETRY' });
      refresh();
      // Nudge the engine rather than waiting for its next tick: the reporter
      // pressed a button and expects something to start now.
      void drain();
      toast.info(t('outbox.retrying'));
    },
    [records, refresh, t],
  );

  const handleCancel = useCallback(
    (id: string) => {
      const record = records.find((r) => r.id === id);
      if (!record) return;
      applyEvent(record, { type: 'CANCEL' });
      refresh();
      toast.info(t('outbox.cancelled'));
    },
    [records, refresh, t],
  );

  const handleRetryAll = useCallback(() => {
    for (const record of records) {
      if (record.state === 'failed') applyEvent(record, { type: 'RETRY' });
    }
    refresh();
    void drain();
    toast.success(t('outbox.retryingAll'));
  }, [records, refresh, t]);

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
        /*
         * The handover.
         *
         * A row leaves this screen the moment it uploads — the queue is for
         * what is still going — so the report a reporter just watched send is
         * suddenly nowhere, and this screen was the last place they saw it.
         * Nothing pointed at where it went, which is the whole reason "where do
         * I see reports I have sent?" had no answer in the app.
         */
        <EmptyState
          icon="cloud-done-outline"
          title={t('outbox.emptyTitle')}
          description={sentSomething ? t('outbox.allSentBody') : t('outbox.emptyBody')}
          actionLabel={sentSomething ? t('outbox.viewSent') : undefined}
          onAction={sentSomething ? () => router.push('/(tabs)/profile') : undefined}
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
