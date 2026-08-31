import { useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Badge, Button, ErrorState, Glass, Pressable, Text } from '@/components/ui';
import { TAB_SCROLL_CLEARANCE } from '@/components/RoleTabBar';
import { Thumbnail } from '@/components/Thumbnail';
import { BUSINESSES, SURVEYS } from '@/api/dawuroData';
import { SAMPLE_INCIDENTS } from '@/api/fixtures';
import { formatRelativeTime } from '@/lib/format';
import { categoryColor, useColors } from '@/lib/theme';
import { formatCedis, type Survey } from '@/types/dawuro';
import type { Incident } from '@/types/api';

type Tab = 'reports' | 'surveys' | 'about';

/**
 * One organisation's page.
 *
 * Three things a person actually wants from an institution, in the order they
 * want them: what it has published, what it is asking of them, and who it is.
 *
 * Surveys are second rather than buried under "about" because they are the
 * only part of this screen that pays — a reader who came to read may leave
 * having earned something, and that only happens if the tab is in front of
 * them.
 */
export function BusinessProfileScreen({ businessId }: { businessId: string }) {
  const { t } = useTranslation();
  const c = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<Tab>('reports');

  const business = BUSINESSES.find((b) => b.id === businessId);

  const reports = useMemo(
    () =>
      SAMPLE_INCIDENTS.filter(
        (i: Incident) => i.publisher.kind === 'organisation' && i.publisher.id === businessId,
      ),
    [businessId],
  );
  const surveys = useMemo(
    () => SURVEYS.filter((s) => s.businessId === businessId && s.status !== 'draft'),
    [businessId],
  );

  if (!business) {
    return (
      <View className="flex-1 bg-canvas" style={{ paddingTop: insets.top }}>
        <ErrorState
          title={t('businesses.missingTitle')}
          description={t('businesses.missingBody')}
          retryLabel={t('common.back')}
          onRetry={() => router.back()}
        />
      </View>
    );
  }

  const live = surveys.filter((s) => s.status === 'live');

  return (
    <View className="flex-1 bg-canvas" style={{ paddingTop: insets.top }}>
      <View className="flex-row items-center gap-2 px-4 pb-1 pt-1">
        <Pressable
          onPress={() => router.back()}
          accessibilityLabel={t('common.back')}
          className="h-9 w-9 items-center justify-center rounded-pill"
        >
          <Ionicons name="chevron-back" size={20} color={c.textPrimary} />
        </Pressable>
        <Text variant="body" className="flex-1 font-sans-semibold" numberOfLines={1}>
          {business.name}
        </Text>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: insets.bottom + TAB_SCROLL_CLEARANCE }}
      >
        {/* ── Identity ──────────────────────────────────────────────────── */}
        <View className="items-center gap-2 px-4 pb-4 pt-2">
          <View className="h-16 w-16 items-center justify-center rounded-lg bg-accent-wash">
            <Ionicons name="business" size={28} color={c.accent} />
          </View>
          <View className="flex-row items-center gap-1.5">
            <Text variant="title-md" className="text-center">
              {business.name}
            </Text>
            {business.verified ? (
              <Ionicons name="checkmark-circle" size={16} color={c.success} />
            ) : null}
          </View>
          <Text variant="caption" tone="muted">
            {t(`sector.${business.sector}`)}
          </Text>

          {business.verified ? (
            <Badge tone="success" label={t('businesses.verified')} />
          ) : (
            <Badge tone="neutral" label={t('businesses.unverified')} />
          )}
        </View>

        {/* ── Tabs ──────────────────────────────────────────────────────── */}
        <View className="flex-row border-b border-hairline/[0.08] px-4">
          {(['reports', 'surveys', 'about'] as const).map((value) => {
            const on = tab === value;
            const count =
              value === 'reports' ? reports.length : value === 'surveys' ? live.length : 0;
            return (
              <Pressable
                key={value}
                onPress={() => setTab(value)}
                haptic={false}
                accessibilityRole="tab"
                accessibilityState={{ selected: on }}
                className="flex-1 items-center pb-2.5 pt-2"
              >
                <Text
                  variant="body-sm"
                  tone={on ? 'primary' : 'muted'}
                  className={on ? 'font-sans-semibold' : 'font-sans-medium'}
                >
                  {t(`businesses.tab.${value}`)}
                  {count > 0 ? ` (${count})` : ''}
                </Text>
                <View
                  className="absolute bottom-0 left-4 right-4 rounded-t-pill"
                  style={{ height: 2.5, backgroundColor: on ? c.accent : 'transparent' }}
                />
              </Pressable>
            );
          })}
        </View>

        {tab === 'reports' ? (
          <ReportList
            reports={reports}
            onOpen={(i) => router.push(`/incident/${i.id}`)}
            emptyTitle={t('businesses.noReportsTitle')}
            emptyBody={t('businesses.noReportsBody', { name: business.name })}
          />
        ) : null}

        {tab === 'surveys' ? (
          <SurveyList surveys={surveys} onOpen={(s) => router.push(`/surveys/${s.id}`)} />
        ) : null}

        {tab === 'about' ? <About business={business} /> : null}
      </ScrollView>
    </View>
  );
}

function ReportList({
  reports,
  onOpen,
  emptyTitle,
  emptyBody,
}: {
  reports: Incident[];
  onOpen: (incident: Incident) => void;
  emptyTitle: string;
  emptyBody: string;
}) {
  const { t } = useTranslation();
  const c = useColors();

  if (reports.length === 0) {
    return (
      <View className="items-center gap-1.5 px-8 py-12">
        <Ionicons name="newspaper-outline" size={26} color={c.textFaint} />
        <Text variant="body-sm" className="mt-1 text-center font-sans-semibold">
          {emptyTitle}
        </Text>
        <Text variant="caption" tone="muted" className="text-center">
          {emptyBody}
        </Text>
      </View>
    );
  }

  return (
    <View>
      {reports.map((incident) => (
        <Pressable
          key={incident.id}
          onPress={() => onOpen(incident)}
          accessibilityLabel={incident.description}
          className="flex-row gap-3 border-b border-hairline/[0.06] px-4 py-3.5"
        >
          <Thumbnail
            uri={incident.media.posterUrl}
            category={incident.category}
            style={{ width: 96, height: 74, borderRadius: 6 }}
          />
          <View className="flex-1 justify-between py-0.5">
            <Text variant="body-sm" className="font-sans-medium" numberOfLines={3}>
              {incident.description}
            </Text>
            <View className="mt-1 flex-row items-center">
              <Text variant="caption" tone="faint">
                {formatRelativeTime(incident.publishedAt)}
              </Text>
              <Text variant="caption" tone="faint">
                {'  ·  '}
              </Text>
              <Text variant="caption" style={{ color: categoryColor[incident.category] }}>
                {t(`category.${incident.category}`)}
              </Text>
            </View>
          </View>
        </Pressable>
      ))}
    </View>
  );
}

function SurveyList({ surveys, onOpen }: { surveys: Survey[]; onOpen: (survey: Survey) => void }) {
  const { t } = useTranslation();
  const c = useColors();

  if (surveys.length === 0) {
    return (
      <View className="items-center gap-1.5 px-8 py-12">
        <Ionicons name="clipboard-outline" size={26} color={c.textFaint} />
        <Text variant="body-sm" className="mt-1 text-center font-sans-semibold">
          {t('businesses.noSurveysTitle')}
        </Text>
        <Text variant="caption" tone="muted" className="text-center">
          {t('businesses.noSurveysBody')}
        </Text>
      </View>
    );
  }

  return (
    <View className="gap-2.5 p-4">
      {surveys.map((survey) => {
        const closed = survey.status === 'closed';
        const filled =
          survey.responsesTarget > 0 ? survey.responsesReceived / survey.responsesTarget : 0;

        return (
          <Glass key={survey.id} elevation="low" className="gap-2.5 rounded-lg p-4">
            <View className="flex-row items-start justify-between gap-3">
              <Text variant="body" className="flex-1 font-sans-semibold">
                {survey.title}
              </Text>
              <Badge
                tone={closed ? 'neutral' : 'success'}
                label={closed ? t('businesses.surveyClosed') : formatCedis(survey.rewardPesewas)}
              />
            </View>

            <Text variant="caption" tone="muted">
              {survey.description}
            </Text>

            <View className="flex-row items-center gap-3">
              <Text variant="caption" tone="faint">
                {t('businesses.surveyQuestions', { count: survey.questions.length })}
              </Text>
              <Text variant="caption" tone="faint">
                {t('businesses.surveyFilled', { percent: Math.round(filled * 100) })}
              </Text>
            </View>

            {/* Closed surveys are shown, not hidden — seeing that an
                organisation ran one and finished it is worth more than a page
                that looks like nothing ever happens here. */}
            <Button
              label={closed ? t('businesses.surveyEnded') : t('businesses.surveyStart')}
              variant={closed ? 'glass' : 'primary'}
              disabled={closed}
              fullWidth
              onPress={() => onOpen(survey)}
              leading={
                <Ionicons
                  name={closed ? 'lock-closed-outline' : 'create-outline'}
                  size={15}
                  color={closed ? c.textMuted : c.textOnDark}
                />
              }
            />
          </Glass>
        );
      })}
    </View>
  );
}

function About({ business }: { business: { name: string; sector: string; interests: string[] } }) {
  const { t } = useTranslation();

  return (
    <View className="gap-3 p-4">
      <Glass elevation="low" className="gap-2 rounded-lg p-4">
        <Text variant="body-sm" className="font-sans-semibold">
          {t('businesses.watches')}
        </Text>
        <Text variant="caption" tone="muted">
          {t('businesses.watchesHelp')}
        </Text>
        <View className="mt-1 flex-row flex-wrap gap-1.5">
          {business.interests.map((category) => (
            <View
              key={category}
              className="flex-row items-center gap-1.5 rounded-pill bg-canvas-raise px-2.5 py-1"
            >
              <View
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: 3,
                  backgroundColor: categoryColor[category as keyof typeof categoryColor],
                }}
              />
              <Text variant="caption" tone="secondary">
                {t(`category.${category}`)}
              </Text>
            </View>
          ))}
        </View>
      </Glass>

      <Glass elevation="low" className="gap-1.5 rounded-lg p-4">
        <Text variant="body-sm" className="font-sans-semibold">
          {t('businesses.sendDirect')}
        </Text>
        <Text variant="caption" tone="muted">
          {t('businesses.sendDirectHelp', { name: business.name })}
        </Text>
      </Glass>
    </View>
  );
}
