import { ScrollView, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Badge, Button, EmptyState, Glass, Text } from '@/components/ui';
import { SURVEYS } from '@/api/dawuroData';
import { colors } from '@/lib/theme';
import { formatCedis } from '@/types/dawuro';
import { estimateSurveyCost, fillRate } from '@/features/surveys/surveyLogic';

/**
 * A business's own surveys.
 *
 * Fill rate leads on every card, because a survey that is not filling is the
 * only thing here that needs a decision — raise the reward, widen the area, or
 * close it early.
 */
export function BusinessSurveysScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  return (
    <View className="flex-1 bg-canvas">
      <View className="gap-1 px-4 pb-3" style={{ paddingTop: insets.top + 12 }}>
        <Text variant="display-md">{t('businessTabs.surveys')}</Text>
        <Text variant="body-sm" tone="muted">
          {t('surveys.builderTeaser')}
        </Text>
      </View>

      {SURVEYS.length === 0 ? (
        <EmptyState
          icon="clipboard-outline"
          title={t('surveys.noneTitle')}
          description={t('surveys.noneBody')}
          actionLabel={t('surveys.newSurvey')}
          onAction={() => router.push('/surveys/new')}
        />
      ) : (
        <ScrollView
          contentContainerClassName="gap-3 px-4"
          contentContainerStyle={{ paddingBottom: insets.bottom + 110 }}
          showsVerticalScrollIndicator={false}
        >
          {SURVEYS.map((survey) => {
            const fill = fillRate(survey);
            const cost = estimateSurveyCost(survey.rewardPesewas, survey.responsesTarget);
            const stalling = survey.status === 'live' && fill < 0.25;

            return (
              <Glass key={survey.id} elevation="low" className="gap-3 rounded-lg p-4">
                <View className="flex-row items-start gap-3">
                  <View className="flex-1 gap-0.5">
                    <Text variant="title-sm">{survey.title}</Text>
                    <Text variant="caption" tone="muted">
                      {t('surveys.questionCount', { count: survey.questions.length })} ·{' '}
                      {formatCedis(survey.rewardPesewas)} {t('surveys.each')}
                    </Text>
                  </View>
                  <Badge
                    label={t(`surveys.status.${survey.status}`)}
                    tone={survey.status === 'live' ? 'success' : 'neutral'}
                  />
                </View>

                <View className="gap-1.5">
                  <View className="flex-row items-center justify-between">
                    <Text variant="caption" tone="muted">
                      {t('surveys.responsesOf', {
                        received: survey.responsesReceived,
                        target: survey.responsesTarget,
                      })}
                    </Text>
                    <Text variant="caption" className="font-sans-semibold">
                      {Math.round(fill * 100)}%
                    </Text>
                  </View>
                  <View className="h-1.5 overflow-hidden rounded-pill bg-canvas-raise">
                    <View
                      className={
                        stalling
                          ? 'h-full rounded-pill bg-warning'
                          : 'h-full rounded-pill bg-accent'
                      }
                      style={{ width: `${fill * 100}%` }}
                    />
                  </View>
                </View>

                {stalling ? (
                  <View className="flex-row items-start gap-2 rounded-sm bg-warning-wash p-2.5">
                    <Ionicons name="trending-down-outline" size={13} color={colors.warning} />
                    <Text variant="caption" tone="warning" className="flex-1">
                      {t('surveys.stallingHint')}
                    </Text>
                  </View>
                ) : null}

                <View className="flex-row items-center gap-2 border-t border-hairline/[0.07] pt-3">
                  <Text variant="caption" tone="muted" className="flex-1">
                    {t('surveys.committed', { amount: formatCedis(cost.totalPesewas) })}
                  </Text>
                  <Ionicons name="chevron-forward" size={15} color={colors.textFaint} />
                </View>
              </Glass>
            );
          })}
        </ScrollView>
      )}

      <View
        className="absolute bottom-0 left-0 right-0 border-t border-hairline/[0.08] bg-canvas px-4 pt-3"
        style={{ paddingBottom: insets.bottom + 76 }}
      >
        <Button
          label={t('surveys.newSurvey')}
          fullWidth
          size="lg"
          onPress={() => router.push('/surveys/new')}
        />
      </View>
    </View>
  );
}
