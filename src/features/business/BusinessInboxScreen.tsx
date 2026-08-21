import { useCallback, useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TAB_SCROLL_CLEARANCE } from '@/components/RoleTabBar';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Badge, Button, Chip, EmptyState, Glass, Pressable, Sheet, Text } from '@/components/ui';
import { BUSINESSES } from '@/api/dawuroData';
import { SAMPLE_INCIDENTS } from '@/api/fixtures';
import { autoRoute } from '@/features/platform/autoRoute';
import { estimateCommission } from '@/features/earnings/commission';
import { categoryColor, colors } from '@/lib/theme';
import { formatDistance, formatExactCapture, formatRelativeTime } from '@/lib/format';
import { SUBSCRIPTION_PLANS, formatCedis } from '@/types/dawuro';
import { useAuthStore } from '@/stores/authStore';
import { useBusinessStore } from '@/stores/businessStore';
import { toast } from '@/stores/toastStore';
import type { Incident } from '@/types/api';

type InboxFilter = 'offered' | 'licensed' | 'all';

/**
 * A business's report inbox.
 *
 * Shows what auto-routing delivered, and lets the organisation license what it
 * wants. Licensing is the moment money moves: the business is billed and the
 * reporter is credited, so the cost is shown on the button rather than
 * discovered on an invoice.
 *
 * Reports arrive here without a human deciding — the platform operator's desk
 * can add or remove recipients afterwards, but nothing waits on them.
 */
export function BusinessInboxScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const profile = useAuthStore((s) => s.profile);

  // Falls back to the first seeded business so the screen is demonstrable
  // without a full business sign-in.
  const business = BUSINESSES.find((b) => b.id === profile?.orgId) ?? BUSINESSES[1]!;
  const plan = SUBSCRIPTION_PLANS[business.tier];

  /*
   * Routing runs against the organisation's *current* interests, not the
   * seeded ones, so editing them on the account screen visibly changes what
   * arrives here. Without this the setting would be decorative.
   */
  const overrides = useBusinessStore((s) => s.interestOverrides);
  const routable = useMemo(
    () => BUSINESSES.map((b) => (overrides[b.id] ? { ...b, interests: overrides[b.id]! } : b)),
    [overrides],
  );

  const [filter, setFilter] = useState<InboxFilter>('offered');
  const [licensed, setLicensed] = useState<Set<string>>(new Set());
  const [preview, setPreview] = useState<Incident | null>(null);

  /*
   * What this business receives, computed through the same routing function the
   * platform uses. Running the real matcher here rather than a hand-picked list
   * means the inbox cannot show something routing would never have delivered.
   */
  const offered = useMemo(
    () =>
      SAMPLE_INCIDENTS.filter((incident) => {
        const matches = autoRoute(
          {
            category: incident.category,
            destination: 'marketplace',
            requestedBusinessIds: [],
            location:
              incident.location.latitude !== null && incident.location.longitude !== null
                ? {
                    latitude: incident.location.latitude,
                    longitude: incident.location.longitude,
                  }
                : null,
          },
          routable,
        );
        return matches.some((m) => m.businessId === business.id);
      }),
    [business.id, routable],
  );

  const visible = useMemo(() => {
    if (filter === 'licensed') return offered.filter((i) => licensed.has(i.id));
    if (filter === 'offered') return offered.filter((i) => !licensed.has(i.id));
    return offered;
  }, [filter, offered, licensed]);

  const remaining = Math.max(0, plan.includedReports - business.reportsUsedThisPeriod);
  const overIncluded = remaining === 0;

  const licenseCost = useCallback(
    (incident: Incident) =>
      estimateCommission({
        category: incident.category,
        destination: 'marketplace',
        mediaKind: incident.media.kind,
        locationConfidence: incident.location.confidence,
      }).grossPesewas,
    [],
  );

  const handleLicense = useCallback(
    (incident: Incident) => {
      setLicensed((prev) => new Set(prev).add(incident.id));
      setPreview(null);
      toast.success(
        t('business.licensedTitle'),
        overIncluded
          ? t('business.licensedOverage', { amount: formatCedis(plan.overagePesewas) })
          : t('business.licensedIncluded', { count: remaining - 1 }),
      );
    },
    [overIncluded, plan.overagePesewas, remaining, t],
  );

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
            <Text variant="caption" tone="accent" className="font-sans-semibold uppercase">
              {t('business.brand')}
            </Text>
            <Text variant="title-lg" numberOfLines={1}>
              {business.name}
            </Text>
          </View>
        </View>

        {/* Allowance. Shown constantly because it changes what the next tap
            costs, and nobody should learn that from an invoice. */}
        <Glass elevation="low" className="flex-row items-center gap-3 rounded-lg p-3.5">
          <View
            className={
              overIncluded
                ? 'h-9 w-9 items-center justify-center rounded-pill bg-warning-wash'
                : 'h-9 w-9 items-center justify-center rounded-pill bg-success-wash'
            }
          >
            <Ionicons
              name="documents-outline"
              size={16}
              color={overIncluded ? colors.warning : colors.success}
            />
          </View>
          <View className="flex-1">
            <Text variant="body-sm" className="font-sans-semibold">
              {overIncluded
                ? t('business.allowanceUsed')
                : t('business.allowanceRemaining', { count: remaining })}
            </Text>
            <Text variant="caption" tone="muted">
              {overIncluded
                ? t('business.overageRate', { amount: formatCedis(plan.overagePesewas) })
                : t('business.ofIncluded', { count: plan.includedReports })}
            </Text>
          </View>
          <Badge label={t(`business.tier.${business.tier}`)} tone="accent" />
        </Glass>

        <Pressable
          onPress={() => router.push('/surveys/new')}
          accessibilityLabel={t('surveys.newSurvey')}
        >
          <Glass elevation="low" className="flex-row items-center gap-3 rounded-lg p-3.5">
            <View className="h-9 w-9 items-center justify-center rounded-pill bg-accent-wash">
              <Ionicons name="clipboard-outline" size={16} color={colors.accent} />
            </View>
            <View className="flex-1">
              <Text variant="body-sm" className="font-sans-semibold">
                {t('surveys.newSurvey')}
              </Text>
              <Text variant="caption" tone="muted">
                {t('surveys.builderTeaser')}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={15} color={colors.textFaint} />
          </Glass>
        </Pressable>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerClassName="gap-2"
        >
          <Chip
            label={t('business.filterOffered')}
            selected={filter === 'offered'}
            onPress={() => setFilter('offered')}
          />
          <Chip
            label={t('business.filterLicensed')}
            selected={filter === 'licensed'}
            onPress={() => setFilter('licensed')}
          />
          <Chip
            label={t('common.all')}
            selected={filter === 'all'}
            onPress={() => setFilter('all')}
          />
        </ScrollView>
      </View>

      {visible.length === 0 ? (
        <EmptyState
          icon="file-tray-outline"
          title={t('business.emptyTitle')}
          description={t('business.emptyBody')}
        />
      ) : (
        <ScrollView
          contentContainerClassName="gap-2 px-4"
          contentContainerStyle={{ paddingBottom: insets.bottom + TAB_SCROLL_CLEARANCE }}
          showsVerticalScrollIndicator={false}
        >
          {visible.map((incident) => {
            const isLicensed = licensed.has(incident.id);
            return (
              <Pressable
                key={incident.id}
                onPress={() => setPreview(incident)}
                accessibilityLabel={incident.description}
              >
                <Glass elevation="low" className="flex-row gap-3 rounded-lg p-3">
                  <View className="overflow-hidden rounded-sm">
                    <Image
                      source={{ uri: incident.media.posterUrl }}
                      style={{ width: 56, height: 68 }}
                      contentFit="cover"
                      transition={140}
                    />
                    {/* Licensed reports are watermark-free; unlicensed ones are
                        previews, and the padlock says so without a legend. */}
                    {!isLicensed ? (
                      <View className="absolute inset-0 items-center justify-center bg-black/35">
                        <Ionicons name="lock-closed" size={15} color="#FFFFFF" />
                      </View>
                    ) : null}
                  </View>

                  <View className="flex-1 gap-1.5">
                    <View className="flex-row items-center gap-2">
                      <View
                        style={{
                          width: 6,
                          height: 6,
                          borderRadius: 3,
                          backgroundColor: categoryColor[incident.category],
                        }}
                      />
                      <Text variant="caption" tone="muted" className="uppercase">
                        {t(`category.${incident.category}`)}
                      </Text>
                      <Text variant="caption" tone="faint">
                        · {formatRelativeTime(incident.capturedAtIso)}
                      </Text>
                    </View>
                    <Text variant="body-sm" numberOfLines={2}>
                      {incident.description}
                    </Text>
                    <View className="flex-row items-center gap-2">
                      {isLicensed ? (
                        <Badge label={t('business.licensed')} tone="success" />
                      ) : (
                        <Text variant="caption" tone="accent" className="font-sans-semibold">
                          {formatCedis(licenseCost(incident))}
                        </Text>
                      )}
                      {incident.location.label ? (
                        <Text variant="caption" tone="muted" numberOfLines={1}>
                          {incident.location.label}
                        </Text>
                      ) : (
                        <Text variant="caption" tone="faint">
                          {t('business.locationHidden')}
                        </Text>
                      )}
                    </View>
                  </View>
                </Glass>
              </Pressable>
            );
          })}
        </ScrollView>
      )}

      {/* Licence preview */}
      <Sheet
        visible={preview !== null}
        onClose={() => setPreview(null)}
        title={preview ? t(`category.${preview.category}`) : ''}
        subtitle={preview?.description}
      >
        {preview ? (
          <View className="gap-4">
            <View className="h-44 overflow-hidden rounded-lg">
              <Image
                source={{ uri: preview.media.posterUrl }}
                style={{ position: 'absolute', inset: 0 }}
                contentFit="cover"
                transition={160}
              />
              {!licensed.has(preview.id) ? (
                <View className="absolute inset-0 items-center justify-center bg-black/40">
                  <Ionicons name="lock-closed" size={26} color="#FFFFFF" />
                  <Text variant="caption" onMedia className="mt-1.5 font-sans-semibold">
                    {t('business.previewOnly')}
                  </Text>
                </View>
              ) : null}
            </View>

            <Glass elevation="low" className="gap-0 rounded-lg" raised={false}>
              <MetaRow
                label={t('detail.captured')}
                value={
                  formatExactCapture(preview.capturedAtIso, preview.capturedAtPrecision) ??
                  t('business.hidden')
                }
              />
              <MetaRow
                label={t('detail.place')}
                value={preview.location.label ?? t('business.hidden')}
              />
              {preview.distanceM !== undefined ? (
                <MetaRow label={t('detail.distance')} value={formatDistance(preview.distanceM)} />
              ) : null}
              <MetaRow
                label={t('business.gpsConfidence')}
                value={t(`business.confidence.${preview.location.confidence}`)}
                last
              />
            </Glass>

            {licensed.has(preview.id) ? (
              <Button
                label={t('business.download')}
                fullWidth
                size="lg"
                leading={<Ionicons name="download-outline" size={16} color={colors.textOnDark} />}
                onPress={() => {
                  // Simulated until the media service issues signed URLs.
                  toast.success(t('business.downloadStarted'), t('business.downloadBody'));
                }}
              />
            ) : (
              <View className="gap-2">
                <Button
                  label={t('business.licenseFor', {
                    amount: formatCedis(licenseCost(preview)),
                  })}
                  fullWidth
                  size="lg"
                  onPress={() => handleLicense(preview)}
                />
                <Text variant="caption" tone="muted" className="text-center">
                  {overIncluded
                    ? t('business.willBeCharged', { amount: formatCedis(plan.overagePesewas) })
                    : t('business.countsToward')}
                </Text>
              </View>
            )}
          </View>
        ) : null}
      </Sheet>
    </View>
  );
}

function MetaRow({ label, value, last }: { label: string; value: string; last?: boolean }) {
  return (
    <View
      className={
        last
          ? 'flex-row items-center justify-between px-4 py-3'
          : 'flex-row items-center justify-between border-b border-hairline/[0.07] px-4 py-3'
      }
    >
      <Text variant="body-sm" tone="muted">
        {label}
      </Text>
      <Text variant="body-sm" className="font-sans-medium">
        {value}
      </Text>
    </View>
  );
}
