import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Button, Glass, Pressable, Sheet, Text } from '@/components/ui';
import { useColors } from '@/lib/theme';
import { formatCedis, type SurveyQuestion, type SurveyQuestionKind } from '@/types/dawuro';
import { toast } from '@/stores/toastStore';
import { MAX_QUESTIONS, estimateSurveyCost, validateSurvey, type SurveyIssue } from './surveyLogic';

const KINDS: SurveyQuestionKind[] = ['single_choice', 'multi_choice', 'scale', 'text', 'photo'];

const KIND_ICON: Record<SurveyQuestionKind, keyof typeof Ionicons.glyphMap> = {
  single_choice: 'radio-button-on-outline',
  multi_choice: 'checkbox-outline',
  scale: 'stats-chart-outline',
  text: 'text-outline',
  photo: 'camera-outline',
};

/** Reward steps, in pesewas. Discrete because arbitrary precision is noise. */
const REWARD_STEPS = [100, 250, 350, 500, 750, 1_000, 1_500] as const;
const TARGET_STEPS = [50, 100, 250, 500, 1_000, 2_500] as const;

let questionCounter = 0;

/**
 * Survey builder for organisations.
 *
 * The cost is visible and updates as the survey is edited, because publishing
 * commits the organisation to reward × target up front. A builder that reveals
 * the bill on the final screen is how a survey gets cancelled after it has
 * already gone out.
 *
 * Validation surfaces every problem at once rather than one at a time — an
 * author should be able to fix the form in a single pass.
 */
export function SurveyBuilderScreen() {
  const c = useColors();
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [questions, setQuestions] = useState<SurveyQuestion[]>([]);
  const [rewardIndex, setRewardIndex] = useState(3);
  const [targetIndex, setTargetIndex] = useState(2);
  const [addOpen, setAddOpen] = useState(false);
  const [publishing, setPublishing] = useState(false);

  const rewardPesewas = REWARD_STEPS[rewardIndex]!;
  const responsesTarget = TARGET_STEPS[targetIndex]!;
  /*
   * Two weeks from when the builder opened.
   *
   * Lazy `useState`, not `useMemo`: a memo's factory still runs during render,
   * so reading the clock there is an impure render — and a memo may legally be
   * recomputed, which would silently move the closing date. This is a value
   * that must be decided once.
   */
  const [closesAtIso] = useState(() => new Date(Date.now() + 14 * 86_400_000).toISOString());

  const cost = estimateSurveyCost(rewardPesewas, responsesTarget);
  const issues = validateSurvey({ title, questions, rewardPesewas, responsesTarget, closesAtIso });

  const addQuestion = (kind: SurveyQuestionKind) => {
    setAddOpen(false);
    setQuestions((prev) => [
      ...prev,
      {
        id: `q_${++questionCounter}`,
        kind,
        prompt: '',
        required: true,
        // Choice questions start with two blanks, because one option is not a
        // choice and an empty list gives the author nothing to edit.
        ...(kind === 'single_choice' || kind === 'multi_choice' ? { options: ['', ''] } : {}),
      },
    ]);
  };

  const updateQuestion = (id: string, patch: Partial<SurveyQuestion>) => {
    setQuestions((prev) => prev.map((q) => (q.id === id ? { ...q, ...patch } : q)));
  };

  const publish = async () => {
    setPublishing(true);
    try {
      await new Promise((resolve) => setTimeout(resolve, 800));
      toast.success(
        t('surveys.publishedTitle'),
        t('surveys.publishedBody', { count: responsesTarget }),
      );
      router.back();
    } finally {
      setPublishing(false);
    }
  };

  /*
   * The keyboard covers the bottom of the screen, which is where a form's last
   * field and its submit button live. Every screen here that takes typed input
   * needs this; only the sign-in screens had it, so the rest hid the control
   * you were reaching for the moment you tapped to type.
   *
   * `padding` on iOS, matching the sign-in screens. Left unset on Android,
   * where the window resizing under `adjustResize` already does it — the
   * exception is a `Modal`, which that does not reach, and which `Sheet`
   * handles itself.
   */
  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      className="flex-1 bg-canvas"
    >
      <ScrollView
        contentContainerStyle={{ paddingTop: insets.top + 12, paddingBottom: insets.bottom + 130 }}
        contentContainerClassName="gap-5 px-4"
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
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
            <Text variant="title-lg">{t('surveys.newSurvey')}</Text>
          </View>
        </View>

        {/* Title and description */}
        <View className="gap-3">
          <Field
            label={t('surveys.surveyTitle')}
            value={title}
            onChangeText={setTitle}
            placeholder={t('surveys.titlePlaceholder')}
          />
          <Field
            label={t('surveys.description')}
            value={description}
            onChangeText={setDescription}
            placeholder={t('surveys.descriptionPlaceholder')}
            multiline
          />
        </View>

        {/* Questions */}
        <View className="gap-2">
          <View className="flex-row items-center justify-between">
            <Text variant="label" tone="muted">
              {t('surveys.questions')}
            </Text>
            <Text variant="caption" tone="faint">
              {questions.length}/{MAX_QUESTIONS}
            </Text>
          </View>

          {questions.map((question, index) => (
            <Glass key={question.id} elevation="low" className="gap-3 rounded-lg p-3.5">
              <View className="flex-row items-center gap-2">
                <Ionicons name={KIND_ICON[question.kind]} size={15} color={c.accent} />
                <Text variant="caption" tone="accent" className="flex-1 uppercase">
                  {t(`surveys.kind.${question.kind}`)}
                </Text>
                <Pressable
                  onPress={() => setQuestions((prev) => prev.filter((q) => q.id !== question.id))}
                  accessibilityLabel={t('surveys.removeQuestion')}
                  className="h-7 w-7 items-center justify-center rounded-pill bg-canvas-raise"
                >
                  <Ionicons name="trash-outline" size={13} color={c.danger} />
                </Pressable>
              </View>

              <TextInput
                value={question.prompt}
                onChangeText={(prompt) => updateQuestion(question.id, { prompt })}
                placeholder={t('surveys.questionPlaceholder', { number: index + 1 })}
                placeholderTextColor={c.textFaint}
                accessibilityLabel={t('surveys.questionPlaceholder', { number: index + 1 })}
                style={{
                  color: c.textPrimary,
                  fontFamily: 'Inter_500Medium',
                  fontSize: 15,
                  paddingVertical: 4,
                }}
              />

              {question.options ? (
                <View className="gap-2">
                  {question.options.map((option, optionIndex) => (
                    <View key={optionIndex} className="flex-row items-center gap-2">
                      <View className="h-1.5 w-1.5 rounded-pill bg-hairline/30" />
                      <TextInput
                        value={option}
                        onChangeText={(next) => {
                          const options = [...(question.options ?? [])];
                          options[optionIndex] = next;
                          updateQuestion(question.id, { options });
                        }}
                        placeholder={t('surveys.optionPlaceholder', { number: optionIndex + 1 })}
                        placeholderTextColor={c.textFaint}
                        accessibilityLabel={t('surveys.optionPlaceholder', {
                          number: optionIndex + 1,
                        })}
                        style={{
                          flex: 1,
                          color: c.textPrimary,
                          fontFamily: 'Inter_400Regular',
                          fontSize: 14,
                          paddingVertical: 6,
                        }}
                      />
                    </View>
                  ))}
                  <Pressable
                    onPress={() =>
                      updateQuestion(question.id, { options: [...(question.options ?? []), ''] })
                    }
                    accessibilityLabel={t('surveys.addOption')}
                    className="flex-row items-center gap-1.5 self-start"
                  >
                    <Ionicons name="add" size={13} color={c.accent} />
                    <Text variant="caption" tone="accent" className="font-sans-semibold">
                      {t('surveys.addOption')}
                    </Text>
                  </Pressable>
                </View>
              ) : null}

              <Pressable
                onPress={() => updateQuestion(question.id, { required: !question.required })}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: question.required }}
                accessibilityLabel={t('surveys.required')}
                className="flex-row items-center gap-2 border-t border-hairline/[0.07] pt-2.5"
              >
                <View
                  className={
                    question.required
                      ? 'h-4 w-4 items-center justify-center rounded-xs bg-accent'
                      : 'h-4 w-4 rounded-xs border border-hairline/25'
                  }
                >
                  {question.required ? (
                    <Ionicons name="checkmark" size={10} color={c.textOnDark} />
                  ) : null}
                </View>
                <Text variant="caption" tone="muted">
                  {t('surveys.required')}
                </Text>
              </Pressable>
            </Glass>
          ))}

          {questions.length < MAX_QUESTIONS ? (
            <Pressable
              onPress={() => setAddOpen(true)}
              accessibilityLabel={t('surveys.addQuestion')}
              className="flex-row items-center justify-center gap-2 rounded-lg border border-dashed border-hairline/25 py-4"
            >
              <Ionicons name="add-circle-outline" size={17} color={c.accent} />
              <Text variant="body-sm" tone="accent" className="font-sans-semibold">
                {t('surveys.addQuestion')}
              </Text>
            </Pressable>
          ) : (
            <Text variant="caption" tone="muted">
              {t('surveys.maxQuestions', { count: MAX_QUESTIONS })}
            </Text>
          )}
        </View>

        {/* Reward and target */}
        <View className="gap-3">
          <Stepper
            label={t('surveys.rewardPer')}
            value={formatCedis(rewardPesewas)}
            index={rewardIndex}
            length={REWARD_STEPS.length}
            onChange={setRewardIndex}
          />
          <Stepper
            label={t('surveys.responsesWanted')}
            value={String(responsesTarget)}
            index={targetIndex}
            length={TARGET_STEPS.length}
            onChange={setTargetIndex}
          />
        </View>

        {/* Cost. Visible while editing, not revealed at the end. */}
        <Glass elevation="mid" className="gap-2.5 rounded-lg p-4">
          <View className="flex-row items-center justify-between">
            <Text variant="body-sm" tone="muted">
              {t('surveys.rewardsTotal')}
            </Text>
            <Text variant="body-sm">{formatCedis(cost.rewardsPesewas)}</Text>
          </View>
          <View className="flex-row items-center justify-between">
            <Text variant="body-sm" tone="muted">
              {t('surveys.platformFee')}
            </Text>
            <Text variant="body-sm">{formatCedis(cost.platformFeePesewas)}</Text>
          </View>
          <View className="flex-row items-center justify-between border-t border-hairline/[0.07] pt-2.5">
            <Text variant="body" className="font-sans-semibold">
              {t('surveys.totalCommitted')}
            </Text>
            <Text variant="title-md" className="font-display">
              {formatCedis(cost.totalPesewas)}
            </Text>
          </View>
          <Text variant="caption" tone="muted">
            {t('surveys.costNote')}
          </Text>
        </Glass>

        {/* Every problem at once */}
        {issues.length > 0 ? (
          <View className="gap-1.5 rounded-lg bg-warning-wash p-3.5">
            {issues.map((issue) => (
              <View key={issue} className="flex-row items-start gap-2">
                <Ionicons name="alert-circle-outline" size={14} color={c.warning} />
                <Text variant="caption" tone="warning" className="flex-1">
                  {t(`surveys.issue.${issue as SurveyIssue}`)}
                </Text>
              </View>
            ))}
          </View>
        ) : null}
      </ScrollView>

      <View
        className="absolute bottom-0 left-0 right-0 border-t border-hairline/[0.08] bg-canvas px-4 pt-3"
        style={{ paddingBottom: insets.bottom + 12 }}
      >
        <Button
          label={t('surveys.publishFor', { amount: formatCedis(cost.totalPesewas) })}
          size="lg"
          fullWidth
          loading={publishing}
          disabled={issues.length > 0}
          onPress={() => void publish()}
        />
      </View>

      <Sheet
        visible={addOpen}
        onClose={() => setAddOpen(false)}
        title={t('surveys.addQuestion')}
        subtitle={t('surveys.addQuestionHelp')}
      >
        <View className="gap-2">
          {KINDS.map((kind) => (
            <Pressable
              key={kind}
              onPress={() => addQuestion(kind)}
              accessibilityLabel={t(`surveys.kind.${kind}`)}
              className="flex-row items-center gap-3 rounded-lg border border-hairline/[0.10] p-3.5"
            >
              <View className="h-10 w-10 items-center justify-center rounded-pill bg-accent-wash">
                <Ionicons name={KIND_ICON[kind]} size={17} color={c.accent} />
              </View>
              <View className="flex-1">
                <Text variant="body-sm" className="font-sans-semibold">
                  {t(`surveys.kind.${kind}`)}
                </Text>
                <Text variant="caption" tone="muted">
                  {t(`surveys.kindHelp.${kind}`)}
                </Text>
              </View>
            </Pressable>
          ))}
        </View>
      </Sheet>
    </KeyboardAvoidingView>
  );
}

function Field({
  label,
  multiline,
  ...rest
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder: string;
  multiline?: boolean;
}) {
  const c = useColors();
  return (
    <View className="gap-2">
      <Text variant="label" tone="muted">
        {label}
      </Text>
      <Glass elevation="low" className="rounded-lg px-4">
        <TextInput
          {...rest}
          multiline={multiline}
          accessibilityLabel={label}
          placeholderTextColor={c.textFaint}
          style={{
            minHeight: multiline ? 76 : 52,
            paddingVertical: multiline ? 14 : 0,
            color: c.textPrimary,
            fontFamily: 'Inter_400Regular',
            fontSize: 15,
            textAlignVertical: multiline ? 'top' : 'center',
          }}
        />
      </Glass>
    </View>
  );
}

function Stepper({
  label,
  value,
  index,
  length,
  onChange,
}: {
  label: string;
  value: string;
  index: number;
  length: number;
  onChange: (index: number) => void;
}) {
  const c = useColors();
  const { t } = useTranslation();
  return (
    <Glass elevation="low" className="gap-3 rounded-lg p-4">
      <View className="flex-row items-center justify-between">
        <Text variant="body-sm" tone="muted">
          {label}
        </Text>
        <Text variant="title-md" className="font-display">
          {value}
        </Text>
      </View>
      <View className="flex-row items-center gap-2">
        <Pressable
          onPress={() => onChange(Math.max(0, index - 1))}
          disabled={index === 0}
          accessibilityLabel={t('org.smaller')}
          className="h-10 w-10 items-center justify-center rounded-pill bg-canvas-raise"
        >
          <Ionicons name="remove" size={18} color={c.textPrimary} />
        </Pressable>
        <View className="h-1.5 flex-1 flex-row gap-1">
          {Array.from({ length }, (_, i) => (
            <View
              key={i}
              className={
                i <= index
                  ? 'h-1.5 flex-1 rounded-pill bg-accent'
                  : 'h-1.5 flex-1 rounded-pill bg-canvas-raise'
              }
            />
          ))}
        </View>
        <Pressable
          onPress={() => onChange(Math.min(length - 1, index + 1))}
          disabled={index === length - 1}
          accessibilityLabel={t('org.larger')}
          className="h-10 w-10 items-center justify-center rounded-pill bg-canvas-raise"
        >
          <Ionicons name="add" size={18} color={c.textPrimary} />
        </Pressable>
      </View>
    </Glass>
  );
}
