import { useMemo } from 'react';
import { ScrollView, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Badge, EmptyState, Glass, Pressable, Text } from '@/components/ui';
import { SURVEYS } from '@/api/dawuroData';
import { accentGradient, colors } from '@/lib/theme';
import { formatDistance } from '@/lib/format';
import { haversineMetres } from '@/lib/geo';
import { useViewerLocation } from '@/hooks/useViewerLocation';
import { formatCedis } from '@/types/dawuro';
import { isAcceptingResponses } from './surveyLogic';

/**
 * Paid tasks available to a reporter.
 *
 * The second earning route, and the one that does not depend on an incident
 * happening nearby. Someone who never witnesses a fire can still earn by
 * answering three questions about their own street.
 *
 * Surveys are targeted geographically, so distance is shown prominently — a
 * task twenty kilometres away is not a task.
 */
export function SurveyListScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const viewer = useViewerLocation();

  const available = useMemo(
    () =>
      SURVEYS.filter((s) => isAcceptingResponses(s)).map((survey) => {
        const distanceM = survey.targetArea
          ? haversineMetres(viewer.location, survey.targetArea)
          : null;
        return {
          survey,
          distanceM,
          // Outside the target radius the reporter is not who the business is
          // asking, so it is shown but not offered.
          inRange: survey.targetArea === null || (distanceM ?? 0) <= survey.targetArea.radiusM,
        };
      }),
    [viewer.location],
  );

  const totalAvailable = available
    .filter((a) => a.inRange)
    .reduce((sum, a) => sum + a.survey.rewardPesewas, 0);

  return (
    <View className="flex-1 bg-canvas">
      <View className="gap-4 px-4 pb-3" style={{ paddingTop: insets.top + 12 }}>
        <View className="flex-row items-center gap-3">
          <Pressable
            onPress={() => router.back()}
            accessibilityLabel={t('common.back')}
            className="h-10 w-10 items-center justify-center rounded-pill bg-canvas-raise"
          >
            <Ionicons name="chevron-back" size={20} color={colors.textPrimary} />
          </Pressable>
          <Text variant="title-lg" className="flex-1">
            {t('surveys.title')}
          </Text>
        </View>

        {totalAvailable > 0 ? (
          <LinearGradient
            colors={[...accentGradient]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={{ borderRadius: 16, padding: 16, flexDirection: 'row', gap: 12 }}
          >
            <Ionicons name="cash-outline" size={20} color={colors.textOnDark} />
            <View className="flex-1">
              <Text variant="body" className="font-sans-semibold text-white">
                {t('surveys.availableNow', { amount: formatCedis(totalAvailable) })}
              </Text>
              <Text variant="caption" className="text-white/80">
                {t('surveys.availableHelp')}
              </Text>
            </View>
          </LinearGradient>
        ) : null}
      </View>

      {available.length === 0 ? (
        <EmptyState
          icon="clipboard-outline"
          title={t('surveys.emptyTitle')}
          description={t('surveys.emptyBody')}
        />
      ) : (
        <ScrollView
          contentContainerClassName="gap-3 px-4"
          contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}
          showsVerticalScrollIndicator={false}
        >
          {available.map(({ survey, distanceM, inRange }) => (
            <Pressable
              key={survey.id}
              onPress={() => inRange && router.push(`/surveys/${survey.id}`)}
              disabled={!inRange}
              accessibilityLabel={survey.title}
            >
              <Glass elevation="low" className="gap-3 rounded-lg p-4">
                <View className="flex-row items-start gap-3">
                  <View className="flex-1 gap-1">
                    <Text variant="title-sm">{survey.title}</Text>
                    <Text variant="caption" tone="muted">
                      {survey.businessName}
                    </Text>
                  </View>
                  <View className="items-end gap-0.5">
                    <Text variant="title-md" tone="success" className="font-display">
                      {formatCedis(survey.rewardPesewas)}
                    </Text>
                    <Text variant="caption" tone="muted">
                      {t('surveys.questionCount', { count: survey.questions.length })}
                    </Text>
                  </View>
                </View>

                <Text variant="body-sm" tone="secondary" numberOfLines={2}>
                  {survey.description}
                </Text>

                <View className="flex-row flex-wrap items-center gap-2 border-t border-hairline/[0.07] pt-3">
                  {distanceM !== null ? (
                    <View className="flex-row items-center gap-1.5">
                      <Ionicons name="location-outline" size={13} color={colors.textMuted} />
                      <Text variant="caption" tone={inRange ? 'muted' : 'warning'}>
                        {inRange ? formatDistance(distanceM) : t('surveys.outOfRange')}
                      </Text>
                    </View>
                  ) : (
                    <Badge label={t('surveys.anywhere')} />
                  )}
                  <View className="flex-1" />
                  {/* Spaces remaining, not responses received — a reporter
                      cares whether there is still room for theirs. */}
                  <Text variant="caption" tone="muted">
                    {t('surveys.spacesLeft', {
                      count: survey.responsesTarget - survey.responsesReceived,
                    })}
                  </Text>
                  {inRange ? (
                    <Ionicons name="chevron-forward" size={15} color={colors.accent} />
                  ) : null}
                </View>
              </Glass>
            </Pressable>
          ))}
        </ScrollView>
      )}
    </View>
  );
}
