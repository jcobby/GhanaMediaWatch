import { useMemo, useState } from 'react';
import { ScrollView, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Button, EmptyState, Glass, Pressable, ProgressBar, Text } from '@/components/ui';
import { useSurveys } from '@/hooks/useSurveys';
import { api } from '@/api';
import { describeApiError } from '@/lib/apiErrorCopy';
import { useColors } from '@/lib/theme';
import { formatCedis, type SurveyQuestion } from '@/types/dawuro';
import { hapticError, hapticSelect, hapticUnlock } from '@/lib/haptics';
import { toast } from '@/stores/toastStore';
import { completionProgress, isAnswered, isSubmittable, type AnswerValue } from './surveyLogic';

const SCALE_POINTS = [1, 2, 3, 4, 5] as const;

interface SurveyTakeScreenProps {
  surveyId: string;
}

/**
 * Answering a paid survey.
 *
 * One question per card rather than a single long form: these are answered
 * standing in the street on a phone, and a wall of inputs gets abandoned.
 *
 * The reward is visible throughout. Someone deciding whether three questions
 * are worth their next four minutes should not have to remember what they were
 * promised on the previous screen.
 */
export function SurveyTakeScreen({ surveyId }: SurveyTakeScreenProps) {
  const c = useColors();
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  /*
   * This survey, or none — never a different one.
   *
   * The fallback here was `?? SURVEYS[0]`, so a survey that could not be found
   * silently opened somebody else's: you would answer four minutes of questions
   * about a completely different thing, and submit them against it.
   */
  const { data: surveys, isPending: surveysPending, isError: surveysFailed } = useSurveys();
  const survey = (surveys ?? []).find((s) => s.id === surveyId) ?? null;
  const [answers, setAnswers] = useState<Record<string, AnswerValue>>({});
  const [submitting, setSubmitting] = useState(false);

  const questions = useMemo(() => survey?.questions ?? [], [survey]);
  const progress = useMemo(() => completionProgress(questions, answers), [questions, answers]);
  const canSubmit = survey !== null && isSubmittable(questions, answers);

  const setAnswer = (id: string, value: AnswerValue) => {
    hapticSelect();
    setAnswers((prev) => ({ ...prev, [id]: value }));
  };

  const submit = async () => {
    setSubmitting(true);
    try {
      /*
       * Sent, not simulated.
       *
       * This waited 900ms and then announced a reward. Nothing was recorded and
       * nothing was credited, so somebody spent four minutes answering
       * questions and was told they had earned money that does not exist.
       */
      if (!survey) return;
      await api.submitSurveyResponse(survey.id, answers);
      hapticUnlock();
      toast.success(
        t('surveys.submittedTitle', { amount: formatCedis(survey.rewardPesewas) }),
        t('surveys.submittedBody'),
      );
      router.back();
    } catch (cause) {
      hapticError();
      const copy = describeApiError(cause, t, {
        title: t('surveys.submitFailedTitle'),
        body: t('surveys.submitFailedBody'),
      });
      toast.error(copy.title, copy.body);
    } finally {
      setSubmitting(false);
    }
  };

  /*
   * Three answers, kept apart.
   *
   * Opening a survey that cannot be found used to fall back to the first one in
   * the list — so somebody answered a different survey without ever being told.
   * Now it says which of the three situations it is, and none of them renders
   * as questions.
   */
  if (!survey) {
    return (
      <View className="flex-1 bg-canvas" style={{ paddingTop: insets.top }}>
        <EmptyState
          icon={surveysFailed ? 'cloud-offline-outline' : 'clipboard-outline'}
          title={
            surveysPending
              ? t('surveys.loadingTitle')
              : surveysFailed
                ? t('surveys.unavailableTitle')
                : t('surveys.missingTitle')
          }
          description={
            surveysPending
              ? t('surveys.loadingBody')
              : surveysFailed
                ? t('surveys.unavailableBody')
                : t('surveys.missingBody')
          }
        />
      </View>
    );
  }

  return (
    <View className="flex-1 bg-canvas">
      <View className="gap-3 px-4 pb-3" style={{ paddingTop: insets.top + 12 }}>
        <View className="flex-row items-center gap-3">
          <Pressable
            onPress={() => router.back()}
            accessibilityLabel={t('common.back')}
            className="h-10 w-10 items-center justify-center rounded-pill bg-canvas-raise"
          >
            <Ionicons name="close" size={20} color={c.textPrimary} />
          </Pressable>
          <View className="flex-1">
            <Text variant="title-md" numberOfLines={1}>
              {survey.title}
            </Text>
            <Text variant="caption" tone="muted">
              {survey.businessName}
            </Text>
          </View>
          <View className="items-end">
            <Text variant="body" tone="success" className="font-sans-semibold">
              {formatCedis(survey.rewardPesewas)}
            </Text>
            <Text variant="caption" tone="muted">
              {t('surveys.onCompletion')}
            </Text>
          </View>
        </View>

        <ProgressBar
          progress={progress}
          accessibilityLabel={t('surveys.progressLabel', {
            percent: Math.round(progress * 100),
          })}
        />
      </View>

      <ScrollView
        contentContainerClassName="gap-3 px-4"
        contentContainerStyle={{ paddingBottom: insets.bottom + 110 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        {survey.questions.map((question, index) => (
          <QuestionCard
            key={question.id}
            index={index}
            question={question}
            value={answers[question.id] ?? null}
            onChange={(value) => setAnswer(question.id, value)}
          />
        ))}
      </ScrollView>

      <View
        className="absolute bottom-0 left-0 right-0 border-t border-hairline/[0.08] bg-canvas px-4 pt-3"
        style={{ paddingBottom: insets.bottom + 12 }}
      >
        <Button
          label={t('surveys.submitFor', { amount: formatCedis(survey.rewardPesewas) })}
          size="lg"
          fullWidth
          loading={submitting}
          disabled={!canSubmit}
          onPress={() => void submit()}
        />
        {!canSubmit ? (
          <Text variant="caption" tone="muted" className="mt-2 text-center">
            {t('surveys.answerRequired')}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

function QuestionCard({
  index,
  question,
  value,
  onChange,
}: {
  index: number;
  question: SurveyQuestion;
  value: AnswerValue;
  onChange: (value: AnswerValue) => void;
}) {
  const c = useColors();
  const { t } = useTranslation();
  const answered = isAnswered(question, value);

  return (
    <Glass elevation="low" className="gap-3 rounded-lg p-4">
      <View className="flex-row items-start gap-2.5">
        <View
          className={
            answered
              ? 'h-6 w-6 items-center justify-center rounded-pill bg-success'
              : 'h-6 w-6 items-center justify-center rounded-pill bg-canvas-raise'
          }
        >
          {answered ? (
            <Ionicons name="checkmark" size={13} color={c.textOnDark} />
          ) : (
            <Text variant="caption" tone="muted" className="font-sans-semibold">
              {index + 1}
            </Text>
          )}
        </View>
        <View className="flex-1">
          <Text variant="body" className="font-sans-medium">
            {question.prompt}
          </Text>
          {!question.required ? (
            <Text variant="caption" tone="faint">
              {t('surveys.optional')}
            </Text>
          ) : null}
        </View>
      </View>

      {question.kind === 'single_choice' ? (
        <View className="gap-2">
          {(question.options ?? []).map((option) => (
            <Pressable
              key={option}
              onPress={() => onChange(option)}
              accessibilityRole="radio"
              accessibilityState={{ selected: value === option }}
              accessibilityLabel={option}
              className={
                value === option
                  ? 'flex-row items-center gap-2.5 rounded-sm border border-accent bg-accent-wash p-3'
                  : 'flex-row items-center gap-2.5 rounded-sm border border-hairline/[0.10] p-3'
              }
            >
              <View
                className={
                  value === option
                    ? 'h-4 w-4 items-center justify-center rounded-pill border-4 border-accent'
                    : 'h-4 w-4 rounded-pill border border-hairline/25'
                }
              />
              <Text variant="body-sm" className="flex-1">
                {option}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      {question.kind === 'multi_choice' ? (
        <View className="gap-2">
          {(question.options ?? []).map((option) => {
            const selected = Array.isArray(value) && value.includes(option);
            return (
              <Pressable
                key={option}
                onPress={() => {
                  const current = Array.isArray(value) ? value : [];
                  onChange(selected ? current.filter((o) => o !== option) : [...current, option]);
                }}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: selected }}
                accessibilityLabel={option}
                className={
                  selected
                    ? 'flex-row items-center gap-2.5 rounded-sm border border-accent bg-accent-wash p-3'
                    : 'flex-row items-center gap-2.5 rounded-sm border border-hairline/[0.10] p-3'
                }
              >
                <View
                  className={
                    selected
                      ? 'h-4 w-4 items-center justify-center rounded-xs bg-accent'
                      : 'h-4 w-4 rounded-xs border border-hairline/25'
                  }
                >
                  {selected ? <Ionicons name="checkmark" size={10} color={c.textOnDark} /> : null}
                </View>
                <Text variant="body-sm" className="flex-1">
                  {option}
                </Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}

      {question.kind === 'scale' ? (
        <View className="gap-2">
          <View className="flex-row gap-2">
            {SCALE_POINTS.map((point) => (
              <Pressable
                key={point}
                onPress={() => onChange(point)}
                accessibilityRole="radio"
                accessibilityState={{ selected: value === point }}
                accessibilityLabel={String(point)}
                className={
                  value === point
                    ? 'flex-1 items-center rounded-sm border border-accent bg-accent-wash py-3'
                    : 'flex-1 items-center rounded-sm border border-hairline/[0.10] py-3'
                }
              >
                <Text
                  variant="body"
                  tone={value === point ? 'accent' : 'muted'}
                  className="font-sans-semibold"
                >
                  {point}
                </Text>
              </Pressable>
            ))}
          </View>
          <View className="flex-row justify-between">
            <Text variant="caption" tone="faint">
              {t('surveys.scaleLow')}
            </Text>
            <Text variant="caption" tone="faint">
              {t('surveys.scaleHigh')}
            </Text>
          </View>
        </View>
      ) : null}

      {question.kind === 'text' ? (
        <TextInput
          value={typeof value === 'string' ? value : ''}
          onChangeText={onChange}
          placeholder={t('surveys.textPlaceholder')}
          placeholderTextColor={c.textFaint}
          multiline
          maxLength={300}
          accessibilityLabel={question.prompt}
          style={{
            minHeight: 80,
            color: c.textPrimary,
            fontFamily: 'Inter_400Regular',
            fontSize: 15,
            textAlignVertical: 'top',
            borderRadius: 14,
            borderWidth: 1,
            borderColor: 'rgba(14,16,36,0.10)',
            padding: 12,
          }}
        />
      ) : null}

      {question.kind === 'photo' ? (
        <Pressable
          onPress={() => onChange('photo-attached')}
          accessibilityLabel={question.prompt}
          className={
            value
              ? 'flex-row items-center justify-center gap-2 rounded-sm border border-accent bg-accent-wash py-4'
              : 'flex-row items-center justify-center gap-2 rounded-sm border border-dashed border-hairline/25 py-4'
          }
        >
          <Ionicons
            name={value ? 'checkmark-circle' : 'camera-outline'}
            size={18}
            color={value ? c.accent : c.textMuted}
          />
          <Text variant="body-sm" tone={value ? 'accent' : 'muted'} className="font-sans-semibold">
            {value ? t('surveys.photoAttached') : t('surveys.addPhoto')}
          </Text>
        </Pressable>
      ) : null}
    </Glass>
  );
}
