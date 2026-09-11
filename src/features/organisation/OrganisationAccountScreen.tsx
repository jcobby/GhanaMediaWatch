import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Button, Chip, Glass, Pressable, Sheet, Text } from '@/components/ui';
import { ORGANISATIONS } from '@/api/dawuroData';
import { accentGradient, categoryColor, useColors } from '@/lib/theme';
import { SUBSCRIPTION_PLANS, downloadCharge, formatCedis, isUnlimited } from '@/types/dawuro';
import { useAuthStore } from '@/stores/authStore';
import { useBusinessStore, useEffectiveInterests } from '@/stores/organisationStore';
import { toast } from '@/stores/toastStore';
import { INCIDENT_CATEGORIES, type IncidentCategory } from '@/types/api';

/**
 * Subscription, usage and interests.
 *
 * Usage leads because it is the only thing here that changes what the
 * organisation pays next month. Interests sit directly beneath it, since those
 * two together explain both the bill and why the inbox looks the way it does —
 * an officer wondering "why am I not seeing flood reports?" finds the answer on
 * this screen, not in support.
 */
export function OrganisationAccountScreen() {
  const c = useColors();
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const profile = useAuthStore((s) => s.profile);
  const signOut = useAuthStore((s) => s.signOut);

  const organisation = ORGANISATIONS.find((b) => b.id === profile?.orgId) ?? ORGANISATIONS[1]!;
  const plan = SUBSCRIPTION_PLANS[organisation.tier];
  const interests = useEffectiveInterests(organisation);
  const setInterests = useBusinessStore((s) => s.setInterests);

  // The sheet edits a draft so backing out of it discards, rather than
  // silently re-routing the inbox on every chip tap.
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<IncidentCategory[]>(interests);

  const uncapped = isUnlimited(plan);
  const perDownload = downloadCharge(plan);
  /*
   * There is no allowance to be "over" any more — metered plans charge per
   * download from the first one, and the annual plan charges for none. The bar
   * now shows spend against this period rather than usage against a quota.
   */
  const spentThisPeriod = perDownload * organisation.reportsUsedThisPeriod;

  return (
    <ScrollView
      className="flex-1 bg-canvas"
      contentContainerStyle={{ paddingTop: insets.top + 12, paddingBottom: insets.bottom + 96 }}
      contentContainerClassName="gap-5 px-4"
      showsVerticalScrollIndicator={false}
    >
      <View className="gap-1">
        <Text variant="caption" tone="accent" className="font-sans-semibold uppercase">
          {t('organisation.brand')}
        </Text>
        <View className="flex-row items-center gap-2">
          <Text variant="display-md" className="flex-1" numberOfLines={2}>
            {organisation.name}
          </Text>
          {organisation.verified ? (
            <Ionicons name="checkmark-circle" size={22} color={c.info} />
          ) : null}
        </View>
        <Text variant="body-sm" tone="muted">
          {t(`sector.${organisation.sector}`)}
        </Text>
      </View>

      {/* Usage against plan */}
      <LinearGradient
        colors={[...accentGradient]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{ borderRadius: 20, padding: 20, gap: 14 }}
      >
        <View className="flex-row items-start justify-between">
          <View className="gap-0.5">
            <Text variant="caption" className="uppercase text-white/70">
              {t('organisationAccount.thisMonth')}
            </Text>
            <Text variant="display-md" className="font-display text-white">
              {organisation.reportsUsedThisPeriod}
            </Text>
          </View>
          <View className="rounded-pill bg-white/20 px-2.5 py-1">
            <Text variant="caption" className="font-sans-semibold text-white">
              {t(`organisation.tier.${organisation.tier}`)}
            </Text>
          </View>
        </View>
        <View className="h-1.5 overflow-hidden rounded-pill bg-white/25">
          {/* Metered plans have no quota to fill, so the bar is a simple
              activity indicator rather than a fraction of an allowance. */}
          <View
            className="h-full rounded-pill bg-white"
            style={{ width: `${Math.min(100, organisation.reportsUsedThisPeriod * 4)}%` }}
          />
        </View>
        <Text variant="caption" className="text-white/85">
          {uncapped
            ? t('organisationAccount.unlimitedNote')
            : t('organisationAccount.spentOnDownloads', { amount: formatCedis(spentThisPeriod) })}
        </Text>
      </LinearGradient>

      {/* Interests — why the inbox looks the way it does */}
      <View className="gap-2">
        <Text variant="label" tone="muted">
          {t('organisationAccount.receiving')}
        </Text>
        <Glass elevation="low" className="gap-3 rounded-lg p-4">
          <Text variant="caption" tone="muted">
            {t('organisationAccount.receivingHelp')}
          </Text>
          <View className="flex-row flex-wrap gap-2">
            {interests.map((c) => (
              <View
                key={c}
                className="flex-row items-center gap-2 rounded-pill bg-canvas-raise px-3 py-1.5"
              >
                <View
                  style={{
                    width: 7,
                    height: 7,
                    borderRadius: 4,
                    backgroundColor: categoryColor[c],
                  }}
                />
                <Text variant="body-sm">{t(`category.${c}`)}</Text>
              </View>
            ))}
          </View>
          <Button
            label={t('organisationAccount.editInterests')}
            variant="glass"
            size="sm"
            onPress={() => {
              setDraft(interests);
              setEditing(true);
            }}
          />
        </Glass>
      </View>

      {/* Plan detail */}
      <View className="gap-2">
        <Text variant="label" tone="muted">
          {t('organisationAccount.plan')}
        </Text>
        <Glass elevation="low" className="gap-0 rounded-lg">
          <Row
            label={
              plan.billingPeriod === 'annual'
                ? t('organisationAccount.annualFee')
                : t('organisationAccount.monthlyFee')
            }
            value={formatCedis(plan.feePesewas)}
          />
          <Row
            label={t('organisationAccount.perDownload')}
            value={uncapped ? t('organisation.unlimitedDownloads') : formatCedis(perDownload)}
          />
          <Row
            label={t('organisationAccount.downloadsTaken')}
            value={String(organisation.reportsUsedThisPeriod)}
          />
          <Row
            label={t('organisationAccount.seats')}
            value={`${organisation.seatsUsed} / ${plan.seats}`}
            last
          />
        </Glass>
      </View>

      <Glass elevation="low" className="gap-0 rounded-lg">
        <SettingRow icon="people-outline" label={t('organisationAccount.members')} />
        <SettingRow icon="download-outline" label={t('organisationAccount.exports')} />
        <SettingRow icon="card-outline" label={t('organisationAccount.billing')} />
        <SettingRow
          icon="log-out-outline"
          label={t('settings.signOut')}
          danger
          onPress={() => {
            void signOut();
            router.replace('/(auth)/sign-in');
          }}
        />
      </Glass>

      <Sheet
        visible={editing}
        onClose={() => setEditing(false)}
        title={t('organisationAccount.editTitle')}
        subtitle={t('organisationAccount.editSubtitle')}
      >
        <View className="flex-row flex-wrap gap-2">
          {INCIDENT_CATEGORIES.map((c) => (
            <Chip
              key={c}
              label={t(`category.${c}`)}
              selected={draft.includes(c)}
              dotColor={categoryColor[c]}
              accessibilityLabel={t(`category.${c}`)}
              onPress={() =>
                setDraft((prev) => (prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]))
              }
            />
          ))}
        </View>
        <Text variant="caption" tone={draft.length === 0 ? 'warning' : 'muted'} className="mt-3">
          {draft.length === 0
            ? t('organisationAccount.atLeastOne')
            : t('organisationAccount.editHelp', { count: draft.length })}
        </Text>
        <Button
          label={t('organisationAccount.saveInterests')}
          fullWidth
          size="lg"
          className="mt-3"
          disabled={draft.length === 0}
          onPress={() => {
            setInterests(organisation.id, draft);
            setEditing(false);
            toast.success(
              t('organisationAccount.interestsSaved'),
              t('organisationAccount.interestsSavedBody'),
            );
          }}
        />
      </Sheet>
    </ScrollView>
  );
}

function Row({ label, value, last }: { label: string; value: string; last?: boolean }) {
  return (
    <View
      className={
        last
          ? 'flex-row items-center justify-between px-4 py-3'
          : 'flex-row items-center justify-between border-b border-hairline/[0.07] px-4 py-3'
      }
    >
      <Text variant="body-sm" tone="muted" className="flex-1">
        {label}
      </Text>
      <Text variant="body-sm" className="font-sans-medium">
        {value}
      </Text>
    </View>
  );
}

function SettingRow({
  icon,
  label,
  danger,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  danger?: boolean;
  onPress?: () => void;
}) {
  const c = useColors();
  return (
    <Pressable
      onPress={onPress}
      accessibilityLabel={label}
      className="flex-row items-center gap-3 border-b border-hairline/[0.07] px-4 py-3.5"
    >
      <Ionicons name={icon} size={18} color={danger ? c.danger : c.textMuted} />
      <Text variant="body" tone={danger ? 'danger' : 'primary'} className="flex-1">
        {label}
      </Text>
      <Ionicons name="chevron-forward" size={15} color={c.textFaint} />
    </Pressable>
  );
}
