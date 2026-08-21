import { useCallback, useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TAB_SCROLL_CLEARANCE } from '@/components/RoleTabBar';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Badge, Button, Chip, EmptyState, Glass, Pressable, Sheet, Text } from '@/components/ui';
import { BUSINESSES, ROUTING_QUEUE } from '@/api/dawuroData';
import { categoryColor, colors } from '@/lib/theme';
import { formatRelativeTime } from '@/lib/format';
import { estimateCommission } from '@/features/earnings/commission';
import { formatCedis, type RoutingItem } from '@/types/dawuro';
import { toast } from '@/stores/toastStore';

/**
 * The routing desk — oversight, not a gate.
 *
 * Submissions reach businesses automatically, matched on the reporter's chosen
 * category, any organisations they named, and the watch areas businesses have
 * drawn. Nothing waits on a person: requiring a human to touch every report
 * does not survive a few hundred a day.
 *
 * What this desk provides is override. An operator can see every submission,
 * including what auto-routing already delivered, and add or remove recipients —
 * so a report nobody declared an interest in still reaches someone who needs
 * it, and a badly-matched one can be pulled back.
 *
 * The reporter's payout is shown because it is a consequence of the routing
 * decision, and hiding it would make the desk feel consequence-free.
 */
export function RoutingDeskScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [items, setItems] = useState(ROUTING_QUEUE);
  const [filter, setFilter] = useState<'awaiting_routing' | 'routed' | null>('awaiting_routing');
  const [active, setActive] = useState<RoutingItem | null>(null);
  const [chosen, setChosen] = useState<string[]>([]);

  const visible = useMemo(
    () => (filter ? items.filter((i) => i.status === filter) : items),
    [items, filter],
  );
  const awaiting = items.filter((i) => i.status === 'awaiting_routing').length;

  const openItem = useCallback((item: RoutingItem) => {
    setActive(item);
    // Pre-select what the reporter asked for, plus the platform's suggestions —
    // an operator should be correcting a proposal, not building one from blank.
    setChosen([...new Set([...item.requestedBusinessIds, ...item.suggestedBusinessIds])]);
  }, []);

  const confirmRouting = useCallback(() => {
    if (!active) return;
    setItems((prev) =>
      prev.map((i) => (i.id === active.id ? { ...i, status: 'routed' as const } : i)),
    );
    toast.success(t('platform.routedTitle', { count: chosen.length }), t('platform.routedBody'));
    setActive(null);
  }, [active, chosen.length, t]);

  const rejectItem = useCallback(() => {
    if (!active) return;
    setItems((prev) =>
      prev.map((i) => (i.id === active.id ? { ...i, status: 'rejected' as const } : i)),
    );
    toast.info(t('platform.rejectedTitle'), t('platform.rejectedBody'));
    setActive(null);
  }, [active, t]);

  const activeEarning = active
    ? estimateCommission({
        category: active.category,
        destination: active.destination,
        mediaKind: 'video',
        locationConfidence: 'high',
        licensedBy: Math.max(1, chosen.length),
      })
    : null;

  return (
    <View className="flex-1 bg-canvas">
      <View className="gap-3 px-4 pb-3" style={{ paddingTop: insets.top + 12 }}>
        <View className="flex-row items-center gap-3">
          <Pressable
            onPress={() => router.back()}
            accessibilityLabel={t('common.back')}
            className="h-10 w-10 items-center justify-center rounded-pill bg-canvas-raise"
          >
            <Ionicons name="chevron-back" size={20} color={colors.textPrimary} />
          </Pressable>
          <View className="flex-1">
            <Text variant="title-lg">{t('platform.routingDesk')}</Text>
            <Text variant="caption" tone="muted">
              {t('platform.awaitingCount', { count: awaiting })}
            </Text>
          </View>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerClassName="gap-2"
        >
          <Chip
            label={t('platform.awaiting')}
            selected={filter === 'awaiting_routing'}
            onPress={() => setFilter('awaiting_routing')}
          />
          <Chip
            label={t('platform.routed')}
            selected={filter === 'routed'}
            onPress={() => setFilter('routed')}
          />
          <Chip
            label={t('common.all')}
            selected={filter === null}
            onPress={() => setFilter(null)}
          />
        </ScrollView>
      </View>

      {visible.length === 0 ? (
        <EmptyState
          icon="checkmark-done-outline"
          title={t('platform.queueClearTitle')}
          description={t('platform.queueClearBody')}
        />
      ) : (
        <ScrollView
          contentContainerClassName="gap-2 px-4"
          contentContainerStyle={{ paddingBottom: insets.bottom + TAB_SCROLL_CLEARANCE }}
          showsVerticalScrollIndicator={false}
        >
          {visible.map((item) => (
            <Pressable
              key={item.id}
              onPress={() => openItem(item)}
              accessibilityLabel={item.summary}
            >
              <Glass elevation="low" className="flex-row gap-3 rounded-lg p-3">
                <View className="overflow-hidden rounded-sm">
                  <Image
                    source={{ uri: item.thumbnailUrl }}
                    style={{ width: 56, height: 66 }}
                    contentFit="cover"
                    transition={140}
                  />
                </View>
                <View className="flex-1 gap-1.5">
                  <View className="flex-row items-center gap-2">
                    <View
                      style={{
                        width: 6,
                        height: 6,
                        borderRadius: 3,
                        backgroundColor: categoryColor[item.category],
                      }}
                    />
                    <Text variant="caption" tone="muted" className="uppercase">
                      {t(`category.${item.category}`)}
                    </Text>
                    <Text variant="caption" tone="faint">
                      · {formatRelativeTime(item.submittedAtIso)} · {item.reporterHandle}
                    </Text>
                  </View>
                  <Text variant="body-sm" numberOfLines={2}>
                    {item.summary}
                  </Text>
                  <View className="flex-row flex-wrap items-center gap-1.5">
                    <Badge
                      label={t(`destination.${item.destination}.title`)}
                      tone={item.destination === 'directed' ? 'accent' : 'neutral'}
                    />
                    {item.status === 'routed' ? (
                      <Badge label={t('platform.routed')} tone="success" />
                    ) : null}
                    {/* A suppressed location is worth flagging: it narrows which
                        businesses can act on the report at all. */}
                    {!item.locationLabel ? (
                      <Badge label={t('platform.noLocation')} tone="warning" />
                    ) : null}
                  </View>
                </View>
              </Glass>
            </Pressable>
          ))}
        </ScrollView>
      )}

      {/* Routing sheet */}
      <Sheet
        visible={active !== null}
        onClose={() => setActive(null)}
        title={t('platform.routeTo')}
        subtitle={active?.summary}
      >
        <ScrollView className="max-h-80" showsVerticalScrollIndicator={false}>
          <View className="gap-2">
            {BUSINESSES.filter((b) => b.subscriptionStatus !== 'cancelled').map((business) => {
              const isChosen = chosen.includes(business.id);
              const requested = active?.requestedBusinessIds.includes(business.id) ?? false;
              const matches = active ? business.interests.includes(active.category) : false;
              return (
                <Pressable
                  key={business.id}
                  onPress={() =>
                    setChosen((prev) =>
                      prev.includes(business.id)
                        ? prev.filter((id) => id !== business.id)
                        : [...prev, business.id],
                    )
                  }
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: isChosen }}
                  accessibilityLabel={business.name}
                  className={
                    isChosen
                      ? 'flex-row items-center gap-3 rounded-lg border border-accent bg-accent-wash p-3'
                      : 'flex-row items-center gap-3 rounded-lg border border-hairline/[0.10] p-3'
                  }
                >
                  <View className="flex-1 gap-0.5">
                    <View className="flex-row items-center gap-1.5">
                      <Text variant="body-sm" className="font-sans-semibold">
                        {business.name}
                      </Text>
                      {business.verified ? (
                        <Ionicons name="checkmark-circle" size={13} color={colors.info} />
                      ) : null}
                    </View>
                    <View className="flex-row items-center gap-1.5">
                      {requested ? (
                        <Text variant="caption" tone="accent" className="font-sans-semibold">
                          {t('platform.reporterAsked')}
                        </Text>
                      ) : matches ? (
                        <Text variant="caption" tone="success">
                          {t('platform.interestMatch')}
                        </Text>
                      ) : (
                        <Text variant="caption" tone="muted">
                          {t(`sector.${business.sector}`)}
                        </Text>
                      )}
                    </View>
                  </View>
                  <View
                    className={
                      isChosen
                        ? 'h-5 w-5 items-center justify-center rounded-pill bg-accent'
                        : 'h-5 w-5 rounded-pill border border-hairline/25'
                    }
                  >
                    {isChosen ? (
                      <Ionicons name="checkmark" size={12} color={colors.textOnDark} />
                    ) : null}
                  </View>
                </Pressable>
              );
            })}
          </View>
        </ScrollView>

        {/* The payout is a consequence of this decision, so it is shown here
            rather than hidden behind a later screen. */}
        {activeEarning ? (
          <Glass elevation="low" className="mt-3 flex-row items-center gap-3 rounded-lg p-3.5">
            <Ionicons name="cash-outline" size={17} color={colors.success} />
            <Text variant="body-sm" className="flex-1">
              {t('platform.reporterEarns', {
                amount: formatCedis(activeEarning.reporterPesewas),
              })}
            </Text>
          </Glass>
        ) : null}

        <View className="mt-4 flex-row gap-2">
          <Button
            label={t('platform.reject')}
            variant="glass"
            className="flex-1"
            onPress={rejectItem}
          />
          <Button
            label={t('platform.confirmRouting', { count: chosen.length })}
            className="flex-[2]"
            disabled={chosen.length === 0}
            onPress={confirmRouting}
          />
        </View>
      </Sheet>
    </View>
  );
}
