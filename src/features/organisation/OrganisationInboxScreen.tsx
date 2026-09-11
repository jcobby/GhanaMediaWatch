import { useCallback, useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TAB_SCROLL_CLEARANCE } from '@/components/RoleTabBar';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Badge, Button, Chip, EmptyState, Glass, Pressable, Sheet, Text } from '@/components/ui';
import { ORGANISATIONS } from '@/api/dawuroData';
import { SAMPLE_INCIDENTS } from '@/api/fixtures';
import { autoRoute } from '@/features/platform/autoRoute';
import { estimateCommission } from '@/features/earnings/commission';
import { categoryHue, useColors } from '@/lib/theme';
import { formatDistance, formatExactCapture, formatRelativeTime } from '@/lib/format';
import { SUBSCRIPTION_PLANS, downloadCharge, formatCedis, isUnlimited } from '@/types/dawuro';
import { useAuthStore } from '@/stores/authStore';
import { useBusinessStore } from '@/stores/organisationStore';
import { toast } from '@/stores/toastStore';
import type { Incident } from '@/types/api';

type InboxFilter = 'offered' | 'licensed' | 'all';

/**
 * An organisation's report inbox.
 *
 * Shows what auto-routing delivered, and lets the organisation license what it
 * wants. Licensing is the moment money moves: the organisation is billed and the
 * reporter is credited, so the cost is shown on the button rather than
 * discovered on an invoice.
 *
 * Reports arrive here without a human deciding — the platform operator's desk
 * can add or remove recipients afterwards, but nothing waits on them.
 */
export function OrganisationInboxScreen() {
  const c = useColors();
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const profile = useAuthStore((s) => s.profile);

  // Falls back to the first seeded organisation so the screen is demonstrable
  // without a full organisation sign-in.
  const organisation = ORGANISATIONS.find((b) => b.id === profile?.orgId) ?? ORGANISATIONS[1]!;
  const plan = SUBSCRIPTION_PLANS[organisation.tier];

  /*
   * Routing runs against the organisation's *current* interests, not the
   * seeded ones, so editing them on the account screen visibly changes what
   * arrives here. Without this the setting would be decorative.
   */
  const overrides = useBusinessStore((s) => s.interestOverrides);
  const routable = useMemo(
    () => ORGANISATIONS.map((b) => (overrides[b.id] ? { ...b, interests: overrides[b.id]! } : b)),
    [overrides],
  );

  const [filter, setFilter] = useState<InboxFilter>('offered');
  const [licensed, setLicensed] = useState<Set<string>>(new Set());
  const [preview, setPreview] = useState<Incident | null>(null);

  /*
   * What this organisation receives, computed through the same routing function the
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
        return matches.some((m) => m.businessId === organisation.id);
      }),
    [organisation.id, routable],
  );

  const visible = useMemo(() => {
    if (filter === 'licensed') return offered.filter((i) => licensed.has(i.id));
    if (filter === 'offered') return offered.filter((i) => !licensed.has(i.id));
    return offered;
  }, [filter, offered, licensed]);

  const perDownload = downloadCharge(plan);
  const uncapped = isUnlimited(plan);
  // Every download is billable on a metered plan; only the annual tier
  // absorbs them, so that is the only distinction left to make.
  const overIncluded = !uncapped;

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
        t('organisation.licensedTitle'),
        overIncluded
          ? t('organisation.licensedUnlimited')
          : t('organisation.licensedCharged', { amount: formatCedis(perDownload) }),
      );
    },
    [overIncluded, perDownload, t],
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
            <Ionicons name="chevron-back" size={20} color={c.textPrimary} />
          </Pressable>
          <View className="flex-1">
            <Text variant="caption" tone="accent" className="font-sans-semibold uppercase">
              {t('organisation.brand')}
            </Text>
            <Text variant="title-lg" numberOfLines={1}>
              {organisation.name}
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
              color={overIncluded ? c.warning : c.success}
            />
          </View>
          <View className="flex-1">
            <Text variant="body-sm" className="font-sans-semibold">
              {overIncluded
                ? t('organisation.allowanceUsed')
                : t('organisation.perDownload', { amount: formatCedis(perDownload) })}
            </Text>
            <Text variant="caption" tone="muted">
              {overIncluded
                ? t('organisation.unlimitedDownloads')
                : t('organisation.perDownload', { amount: formatCedis(perDownload) })}
            </Text>
          </View>
          <Badge label={t(`organisation.tier.${organisation.tier}`)} tone="accent" />
        </Glass>

        <Pressable
          onPress={() => router.push('/surveys/new')}
          accessibilityLabel={t('surveys.newSurvey')}
        >
          <Glass elevation="low" className="flex-row items-center gap-3 rounded-lg p-3.5">
            <View className="h-9 w-9 items-center justify-center rounded-pill bg-accent-wash">
              <Ionicons name="clipboard-outline" size={16} color={c.accent} />
            </View>
            <View className="flex-1">
              <Text variant="body-sm" className="font-sans-semibold">
                {t('surveys.newSurvey')}
              </Text>
              <Text variant="caption" tone="muted">
                {t('surveys.builderTeaser')}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={15} color={c.textFaint} />
          </Glass>
        </Pressable>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerClassName="gap-2"
        >
          <Chip
            label={t('organisation.filterOffered')}
            selected={filter === 'offered'}
            onPress={() => setFilter('offered')}
          />
          <Chip
            label={t('organisation.filterLicensed')}
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
          title={t('organisation.emptyTitle')}
          description={t('organisation.emptyBody')}
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
                          backgroundColor: categoryHue(incident.category),
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
                        <Badge label={t('organisation.licensed')} tone="success" />
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
                          {t('organisation.locationHidden')}
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
                    {t('organisation.previewOnly')}
                  </Text>
                </View>
              ) : null}
            </View>

            <Glass elevation="low" className="gap-0 rounded-lg" raised={false}>
              <MetaRow
                label={t('detail.captured')}
                value={
                  formatExactCapture(preview.capturedAtIso, preview.capturedAtPrecision) ??
                  t('organisation.hidden')
                }
              />
              <MetaRow
                label={t('detail.place')}
                value={preview.location.label ?? t('organisation.hidden')}
              />
              {preview.distanceM !== undefined ? (
                <MetaRow label={t('detail.distance')} value={formatDistance(preview.distanceM)} />
              ) : null}
              <MetaRow
                label={t('organisation.gpsConfidence')}
                value={t(`organisation.confidence.${preview.location.confidence}`)}
                last
              />
            </Glass>

            {licensed.has(preview.id) ? (
              <Button
                label={t('organisation.download')}
                fullWidth
                size="lg"
                leading={<Ionicons name="download-outline" size={16} color={c.textOnDark} />}
                onPress={() => {
                  // Simulated until the media service issues signed URLs.
                  toast.success(t('organisation.downloadStarted'), t('organisation.downloadBody'));
                }}
              />
            ) : (
              <View className="gap-2">
                <Button
                  label={t('organisation.licenseFor', {
                    amount: formatCedis(licenseCost(preview)),
                  })}
                  fullWidth
                  size="lg"
                  onPress={() => handleLicense(preview)}
                />
                <Text variant="caption" tone="muted" className="text-center">
                  {overIncluded
                    ? t('organisation.perDownload', { amount: formatCedis(perDownload) })
                    : t('organisation.countsToward')}
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
