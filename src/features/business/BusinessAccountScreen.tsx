import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Button, Chip, Glass, Pressable, Sheet, Text } from '@/components/ui';
import { BUSINESSES } from '@/api/dawuroData';
import { accentGradient, categoryColor, colors } from '@/lib/theme';
import { SUBSCRIPTION_PLANS, formatCedis } from '@/types/dawuro';
import { useAuthStore } from '@/stores/authStore';
import { useBusinessStore, useEffectiveInterests } from '@/stores/businessStore';
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
export function BusinessAccountScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const profile = useAuthStore((s) => s.profile);
  const signOut = useAuthStore((s) => s.signOut);

  const business = BUSINESSES.find((b) => b.id === profile?.orgId) ?? BUSINESSES[1]!;
  const plan = SUBSCRIPTION_PLANS[business.tier];
  const interests = useEffectiveInterests(business);
  const setInterests = useBusinessStore((s) => s.setInterests);

  // The sheet edits a draft so backing out of it discards, rather than
  // silently re-routing the inbox on every chip tap.
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<IncidentCategory[]>(interests);

  const usage = Math.min(1, business.reportsUsedThisPeriod / plan.includedReports);
  const over = business.reportsUsedThisPeriod > plan.includedReports;

  return (
    <ScrollView
      className="flex-1 bg-canvas"
      contentContainerStyle={{ paddingTop: insets.top + 12, paddingBottom: insets.bottom + 96 }}
      contentContainerClassName="gap-5 px-4"
      showsVerticalScrollIndicator={false}
    >
      <View className="gap-1">
        <Text variant="caption" tone="accent" className="font-sans-semibold uppercase">
          {t('business.brand')}
        </Text>
        <View className="flex-row items-center gap-2">
          <Text variant="display-md" className="flex-1" numberOfLines={2}>
            {business.name}
          </Text>
          {business.verified ? (
            <Ionicons name="checkmark-circle" size={22} color={colors.info} />
          ) : null}
        </View>
        <Text variant="body-sm" tone="muted">
          {t(`sector.${business.sector}`)}
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
              {t('businessAccount.thisMonth')}
            </Text>
            <Text variant="display-md" className="font-display text-white">
              {business.reportsUsedThisPeriod}
            </Text>
          </View>
          <View className="rounded-pill bg-white/20 px-2.5 py-1">
            <Text variant="caption" className="font-sans-semibold text-white">
              {t(`business.tier.${business.tier}`)}
            </Text>
          </View>
        </View>
        <View className="h-1.5 overflow-hidden rounded-pill bg-white/25">
          <View className="h-full rounded-pill bg-white" style={{ width: `${usage * 100}%` }} />
        </View>
        <Text variant="caption" className="text-white/85">
          {over
            ? t('businessAccount.overBy', {
                count: business.reportsUsedThisPeriod - plan.includedReports,
                amount: formatCedis(plan.overagePesewas),
              })
            : t('businessAccount.ofIncluded', {
                remaining: plan.includedReports - business.reportsUsedThisPeriod,
                total: plan.includedReports,
              })}
        </Text>
      </LinearGradient>

      {/* Interests — why the inbox looks the way it does */}
      <View className="gap-2">
        <Text variant="label" tone="muted">
          {t('businessAccount.receiving')}
        </Text>
        <Glass elevation="low" className="gap-3 rounded-lg p-4">
          <Text variant="caption" tone="muted">
            {t('businessAccount.receivingHelp')}
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
            label={t('businessAccount.editInterests')}
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
          {t('businessAccount.plan')}
        </Text>
        <Glass elevation="low" className="gap-0 rounded-lg">
          <Row label={t('businessAccount.monthly')} value={formatCedis(plan.monthlyPesewas)} />
          <Row label={t('businessAccount.included')} value={String(plan.includedReports)} />
          <Row label={t('businessAccount.perExtra')} value={formatCedis(plan.overagePesewas)} />
          <Row
            label={t('businessAccount.seats')}
            value={`${business.seatsUsed} / ${plan.seats}`}
            last
          />
        </Glass>
      </View>

      <Glass elevation="low" className="gap-0 rounded-lg">
        <SettingRow icon="people-outline" label={t('businessAccount.members')} />
        <SettingRow icon="download-outline" label={t('businessAccount.exports')} />
        <SettingRow icon="card-outline" label={t('businessAccount.billing')} />
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
        title={t('businessAccount.editTitle')}
        subtitle={t('businessAccount.editSubtitle')}
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
                setDraft((prev) =>
                  prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c],
                )
              }
            />
          ))}
        </View>
        <Text variant="caption" tone={draft.length === 0 ? 'warning' : 'muted'} className="mt-3">
          {draft.length === 0
            ? t('businessAccount.atLeastOne')
            : t('businessAccount.editHelp', { count: draft.length })}
        </Text>
        <Button
          label={t('businessAccount.saveInterests')}
          fullWidth
          size="lg"
          className="mt-3"
          disabled={draft.length === 0}
          onPress={() => {
            setInterests(business.id, draft);
            setEditing(false);
            toast.success(
              t('businessAccount.interestsSaved'),
              t('businessAccount.interestsSavedBody'),
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
  return (
    <Pressable
      onPress={onPress}
      accessibilityLabel={label}
      className="flex-row items-center gap-3 border-b border-hairline/[0.07] px-4 py-3.5"
    >
      <Ionicons name={icon} size={18} color={danger ? colors.danger : colors.textMuted} />
      <Text variant="body" tone={danger ? 'danger' : 'primary'} className="flex-1">
        {label}
      </Text>
      <Ionicons name="chevron-forward" size={15} color={colors.textFaint} />
    </Pressable>
  );
}
