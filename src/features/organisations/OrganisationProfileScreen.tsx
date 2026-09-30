import { useMemo, useState } from 'react';
import { ScrollView, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Badge, Button, ErrorState, Glass, Pressable, Sheet, Text } from '@/components/ui';
import { TAB_SCROLL_CLEARANCE } from '@/components/RoleTabBar';
import { Thumbnail } from '@/components/Thumbnail';
import { useOrganisations } from '@/hooks/useOrganisations';
import { useRequestMembership } from '@/hooks/useOrg';
import { useAuthStore } from '@/stores/authStore';
import { toast } from '@/stores/toastStore';
import { useSurveys } from '@/hooks/useSurveys';
import { useFeed } from '@/hooks/useIncidents';
import { formatRelativeTime } from '@/lib/format';
import { categoryHue, useColors } from '@/lib/theme';
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
export function OrganisationProfileScreen({ businessId }: { businessId: string }) {
  const { t } = useTranslation();
  const c = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<Tab>('reports');
  const [asking, setAsking] = useState(false);
  const [statedRole, setStatedRole] = useState('');
  const [note, setNote] = useState('');

  const requestMembership = useRequestMembership();
  const accountType = useAuthStore((s) => s.profile?.accountType);
  /*
   * Offered to a signed-in reporter and to nobody else.
   *
   * An organisation account asking to join another organisation is not a thing
   * the service models, and a signed-out visitor has no identity to attach the
   * request to — the service answers 401, which would be a button that exists
   * only to refuse. A blogger is a reporter with a checked byline, so both
   * ask the same way.
   */
  const mayAsk = accountType === 'reporter' || accountType === 'blogger';

  const { data: directory, isPending: dirPending, isError: dirFailed } = useOrganisations();
  const { data: surveyList } = useSurveys();
  const { data: feed } = useFeed({ limit: 100 });
  // Memoised so the two lists below keep a stable identity between renders;
  // a fresh `?? []` each time makes their dependency arrays useless.
  const allSurveys = useMemo(() => surveyList ?? [], [surveyList]);
  const publishedFeed = useMemo(() => feed?.items ?? [], [feed]);

  const organisation = (directory ?? []).find((b) => b.id === businessId);

  const reports = useMemo(
    () =>
      publishedFeed.filter(
        (i: Incident) => i.publisher.kind === 'organisation' && i.publisher.id === businessId,
      ),
    [businessId, publishedFeed],
  );
  const surveys = useMemo(
    () => allSurveys.filter((s) => s.businessId === businessId && s.status !== 'draft'),
    [businessId, allSurveys],
  );

  /*
   * Not found, still loading, and could not ask are three different answers.
   *
   * The directory is fetched, so a slow connection briefly has no organisation
   * to match — and telling somebody "this organisation does not exist" while
   * the list is still arriving is a flat statement that is simply untrue.
   */
  if (!organisation) {
    return (
      <View className="flex-1 bg-canvas" style={{ paddingTop: insets.top }}>
        <ErrorState
          title={
            dirPending
              ? t('organisations.loadingTitle')
              : dirFailed
                ? t('organisations.unavailableTitle')
                : t('organisations.missingTitle')
          }
          description={
            dirPending
              ? t('organisations.loadingBody')
              : dirFailed
                ? t('organisations.unavailableBody')
                : t('organisations.missingBody')
          }
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
          {organisation.name}
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
              {organisation.name}
            </Text>
            {organisation.verified ? (
              <Ionicons name="checkmark-circle" size={16} color={c.success} />
            ) : null}
          </View>
          <Text variant="caption" tone="muted">
            {t(`sector.${organisation.sector}`)}
          </Text>

          {organisation.verified ? (
            <Badge tone="success" label={t('organisations.verified')} />
          ) : (
            <Badge tone="neutral" label={t('organisations.unverified')} />
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
                  {t(`organisations.tab.${value}`)}
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
            emptyTitle={t('organisations.noReportsTitle')}
            emptyBody={t('organisations.noReportsBody', { name: organisation.name })}
          />
        ) : null}

        {tab === 'surveys' ? (
          <SurveyList surveys={surveys} onOpen={(s) => router.push(`/surveys/${s.id}`)} />
        ) : null}

        {tab === 'about' ? <About organisation={organisation} /> : null}

        {/*
          Asking to join, from the page you are already looking at.

          **The reporter's half of joining, which the phone could not do at
          all.** `POST /membership-requests` has been live throughout; no
          client on this device called it, so somebody who films for an
          institution had no way to say so from the app they film in.

          Here rather than buried in settings: this is the screen where a
          person has just established that their employer is on Dawuro, which
          is the moment the question occurs to them. Anywhere else and they
          have to already know the feature exists.
        */}
        {mayAsk ? (
          <View className="px-4 pt-2">
            <Button
              label={t('organisations.askToJoin')}
              variant="glass"
              fullWidth
              onPress={() => setAsking(true)}
              leading={<Ionicons name="person-add-outline" size={18} color={c.textPrimary} />}
            />
          </View>
        ) : null}
      </ScrollView>

      <Sheet
        visible={asking}
        onClose={() => setAsking(false)}
        title={t('organisations.askTitle', { name: organisation.name })}
      >
        <Text variant="body-sm" tone="secondary">
          {t('organisations.askBody')}
        </Text>

        <View className="mt-4 gap-3">
          <View className="gap-1.5">
            <Text variant="label" tone="muted">
              {t('organisations.askRole')}
            </Text>
            <Glass elevation="low" className="rounded-lg px-3 py-3">
              <TextInput
                value={statedRole}
                onChangeText={setStatedRole}
                placeholder={t('organisations.askRolePlaceholder')}
                placeholderTextColor={c.textFaint}
                maxLength={64}
                accessibilityLabel={t('organisations.askRole')}
                style={{
                  color: c.textPrimary,
                  fontFamily: 'Inter_400Regular',
                  fontSize: 15,
                  padding: 0,
                }}
              />
            </Glass>
          </View>

          <View className="gap-1.5">
            <Text variant="label" tone="muted">
              {t('organisations.askNote')}
            </Text>
            <Glass elevation="low" className="rounded-lg px-3 py-3">
              <TextInput
                value={note}
                onChangeText={setNote}
                placeholder={t('organisations.askNotePlaceholder')}
                placeholderTextColor={c.textFaint}
                multiline
                maxLength={500}
                accessibilityLabel={t('organisations.askNote')}
                style={{
                  color: c.textPrimary,
                  minHeight: 64,
                  textAlignVertical: 'top',
                  fontFamily: 'Inter_400Regular',
                  fontSize: 15,
                  padding: 0,
                }}
              />
            </Glass>
          </View>

          <Button
            label={t('organisations.askSend')}
            fullWidth
            loading={requestMembership.isPending}
            onPress={() => {
              /*
               * Closed and cleared only once the service has taken it. A sheet
               * that dismisses on tap tells somebody their request exists
               * before anything has said so — and this one cannot be checked
               * afterwards from this account, so a false confirmation here is
               * one nothing later corrects.
               */
              requestMembership.mutate(
                {
                  orgId: organisation.id,
                  ...(statedRole.trim() ? { statedRole: statedRole.trim() } : {}),
                  ...(note.trim() ? { note: note.trim() } : {}),
                },
                {
                  onSuccess: () => {
                    setAsking(false);
                    setStatedRole('');
                    setNote('');
                    toast.success(
                      t('organisations.askSentTitle', { name: organisation.name }),
                      t('organisations.askSentBody'),
                    );
                  },
                  onError: (cause) => {
                    toast.error(
                      t('organisations.askFailedTitle'),
                      cause instanceof Error ? cause.message : t('common.unknownErrorHelp'),
                    );
                  },
                },
              );
            }}
          />
        </View>
      </Sheet>
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
            cacheKey={incident.id}
            category={incident.category}
            glyphSize={22}
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
              <Text variant="caption" style={{ color: categoryHue(incident.category) }}>
                {t(`category.${incident.category}`)}
              </Text>
            </View>
          </View>
        </Pressable>
      ))}
    </View>
  );
}

export function SurveyList({ surveys, onOpen }: { surveys: Survey[]; onOpen: (survey: Survey) => void }) {
  const { t } = useTranslation();
  const c = useColors();

  if (surveys.length === 0) {
    return (
      <View className="items-center gap-1.5 px-8 py-12">
        <Ionicons name="clipboard-outline" size={26} color={c.textFaint} />
        <Text variant="body-sm" className="mt-1 text-center font-sans-semibold">
          {t('organisations.noSurveysTitle')}
        </Text>
        <Text variant="caption" tone="muted" className="text-center">
          {t('organisations.noSurveysBody')}
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
                label={closed ? t('organisations.surveyClosed') : formatCedis(survey.rewardPesewas)}
              />
            </View>

            <Text variant="caption" tone="muted">
              {survey.description}
            </Text>

            <View className="flex-row items-center gap-3">
              <Text variant="caption" tone="faint">
                {t('organisations.surveyQuestions', { count: survey.questions.length })}
              </Text>
              <Text variant="caption" tone="faint">
                {t('organisations.surveyFilled', { percent: Math.round(filled * 100) })}
              </Text>
            </View>

            {/* Closed surveys are shown, not hidden — seeing that an
                organisation ran one and finished it is worth more than a page
                that looks like nothing ever happens here. */}
            <Button
              label={closed ? t('organisations.surveyEnded') : t('organisations.surveyStart')}
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

/*
 * `interests` is optional here because the public directory does not send it.
 * An organisation whose interests we have not been told simply shows none —
 * see `OrganisationAccount`, where every billing and preference field is optional
 * for the same reason.
 */
export function About({
  organisation,
}: {
  organisation: { name: string; sector: string; interests?: string[] };
}) {
  const { t } = useTranslation();

  return (
    <View className="gap-3 p-4">
      <Glass elevation="low" className="gap-2 rounded-lg p-4">
        <Text variant="body-sm" className="font-sans-semibold">
          {t('organisations.watches')}
        </Text>
        <Text variant="caption" tone="muted">
          {t('organisations.watchesHelp')}
        </Text>
        <View className="mt-1 flex-row flex-wrap gap-1.5">
          {(organisation.interests ?? []).map((category) => (
            <View
              key={category}
              className="flex-row items-center gap-1.5 rounded-pill bg-canvas-raise px-2.5 py-1"
            >
              <View
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: 3,
                  backgroundColor: categoryHue(category),
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
          {t('organisations.sendDirect')}
        </Text>
        <Text variant="caption" tone="muted">
          {t('organisations.sendDirectHelp', { name: organisation.name })}
        </Text>
      </Glass>
    </View>
  );
}
