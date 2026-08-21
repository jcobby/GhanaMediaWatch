import { PLATFORM_FEE_RATE } from '@/features/earnings/commission';
import type { Survey, SurveyQuestion, SurveyQuestionKind } from '@/types/dawuro';

/**
 * Survey validation, costing and completion.
 *
 * Pure, because a survey commits an organisation to real money the moment it
 * goes live: reward multiplied by target responses, up front. Getting the
 * arithmetic or the publish rules wrong is expensive in a way a layout bug is
 * not.
 */

export type SurveyIssue =
  | 'no_title'
  | 'no_questions'
  | 'question_missing_prompt'
  | 'choice_needs_options'
  | 'reward_too_low'
  | 'no_target'
  | 'closes_in_past';

/** Below this a survey is not worth a reporter's attention. */
export const MIN_REWARD_PESEWAS = 100;

/** Answering more than this in one sitting produces careless data. */
export const MAX_QUESTIONS = 12;

const CHOICE_KINDS: ReadonlySet<SurveyQuestionKind> = new Set(['single_choice', 'multi_choice']);

/**
 * Everything wrong with a survey, rather than the first problem found.
 *
 * A builder that reveals one error at a time turns publishing into a guessing
 * game; showing all of them lets the author fix the form in one pass.
 */
export function validateSurvey(
  survey: Pick<Survey, 'title' | 'questions' | 'rewardPesewas' | 'responsesTarget' | 'closesAtIso'>,
  now: number = Date.now(),
): SurveyIssue[] {
  const issues: SurveyIssue[] = [];

  if (survey.title.trim().length < 3) issues.push('no_title');
  if (survey.questions.length === 0) issues.push('no_questions');

  if (survey.questions.some((q) => q.prompt.trim().length < 3)) {
    issues.push('question_missing_prompt');
  }

  // A choice question with fewer than two options is not a choice.
  if (
    survey.questions.some(
      (q) => CHOICE_KINDS.has(q.kind) && (q.options?.filter((o) => o.trim()).length ?? 0) < 2,
    )
  ) {
    issues.push('choice_needs_options');
  }

  if (survey.rewardPesewas < MIN_REWARD_PESEWAS) issues.push('reward_too_low');
  if (survey.responsesTarget < 1) issues.push('no_target');

  const closes = new Date(survey.closesAtIso).getTime();
  if (Number.isNaN(closes) || closes <= now) issues.push('closes_in_past');

  return issues;
}

export function canPublish(survey: Parameters<typeof validateSurvey>[0], now?: number): boolean {
  return validateSurvey(survey, now).length === 0;
}

export interface SurveyCost {
  /** Paid to reporters if the survey fills. */
  rewardsPesewas: number;
  platformFeePesewas: number;
  totalPesewas: number;
}

/**
 * What a survey commits the business to.
 *
 * The full target is charged, not the responses received so far — an
 * organisation budgeting for a survey needs the worst case, and discovering
 * the real number after it fills is how a finance team learns to distrust a
 * product.
 */
export function estimateSurveyCost(rewardPesewas: number, responsesTarget: number): SurveyCost {
  const rewardsPesewas = Math.max(0, Math.round(rewardPesewas * responsesTarget));
  const platformFeePesewas = Math.round(rewardsPesewas * PLATFORM_FEE_RATE);
  return {
    rewardsPesewas,
    platformFeePesewas,
    // Sum rather than a second rounding, so the three figures reconcile.
    totalPesewas: rewardsPesewas + platformFeePesewas,
  };
}

export type AnswerValue = string | string[] | number | null;

/**
 * Whether an answer counts as given.
 *
 * Decided by the value alone — the question kind adds nothing, since every
 * kind is unanswered when blank, empty or NaN. Taking the question as a
 * parameter would imply a per-kind rule that does not exist.
 */
export function isAnswered(_question: SurveyQuestion, answer: AnswerValue): boolean {
  if (answer === null || answer === undefined) return false;
  if (typeof answer === 'string') return answer.trim().length > 0;
  if (Array.isArray(answer)) return answer.length > 0;
  if (typeof answer === 'number') return Number.isFinite(answer);
  return false;
}

/**
 * Whether the response may be submitted.
 *
 * Only required questions count. An optional photo left blank must not block
 * someone who answered everything that mattered.
 */
export function isSubmittable(
  questions: readonly SurveyQuestion[],
  answers: Readonly<Record<string, AnswerValue>>,
): boolean {
  return questions.filter((q) => q.required).every((q) => isAnswered(q, answers[q.id] ?? null));
}

/**
 * Progress through the form, 0..1.
 *
 * Counts every question, not just required ones — a bar that reads 100% while
 * two optional questions remain visible looks broken.
 */
export function completionProgress(
  questions: readonly SurveyQuestion[],
  answers: Readonly<Record<string, AnswerValue>>,
): number {
  if (questions.length === 0) return 0;
  const done = questions.filter((q) => isAnswered(q, answers[q.id] ?? null)).length;
  return done / questions.length;
}

/** How full the survey is, 0..1, for the business's progress display. */
export function fillRate(survey: Pick<Survey, 'responsesReceived' | 'responsesTarget'>): number {
  if (survey.responsesTarget <= 0) return 0;
  return Math.min(1, survey.responsesReceived / survey.responsesTarget);
}

/** A live survey that has hit its target stops accepting responses. */
export function isAcceptingResponses(survey: Survey, now: number = Date.now()): boolean {
  if (survey.status !== 'live') return false;
  if (survey.responsesReceived >= survey.responsesTarget) return false;
  const closes = new Date(survey.closesAtIso).getTime();
  return !Number.isNaN(closes) && closes > now;
}
