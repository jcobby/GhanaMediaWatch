import {
  MIN_REWARD_PESEWAS,
  canPublish,
  completionProgress,
  estimateSurveyCost,
  fillRate,
  isAcceptingResponses,
  isAnswered,
  isSubmittable,
  validateSurvey,
} from '../surveyLogic';
import { PLATFORM_FEE_RATE } from '@/features/earnings/commission';
import type { Survey, SurveyQuestion } from '@/types/dawuro';

const NOW = 1_700_000_000_000;
const LATER = new Date(NOW + 7 * 86_400_000).toISOString();

const q = (overrides: Partial<SurveyQuestion> = {}): SurveyQuestion => ({
  id: 'q1',
  kind: 'text',
  prompt: 'What happened?',
  required: true,
  ...overrides,
});

const draft = (overrides = {}) => ({
  title: 'Drainage before the rains',
  questions: [q()],
  rewardPesewas: 500,
  responsesTarget: 300,
  closesAtIso: LATER,
  ...overrides,
});

describe('publish validation', () => {
  it('accepts a complete survey', () => {
    expect(validateSurvey(draft(), NOW)).toEqual([]);
    expect(canPublish(draft(), NOW)).toBe(true);
  });

  it('reports every problem at once, not just the first', () => {
    // Revealing one error at a time turns publishing into a guessing game.
    const issues = validateSurvey(
      draft({ title: '', questions: [], rewardPesewas: 0, responsesTarget: 0 }),
      NOW,
    );
    expect(issues).toEqual(
      expect.arrayContaining(['no_title', 'no_questions', 'reward_too_low', 'no_target']),
    );
    expect(issues.length).toBeGreaterThanOrEqual(4);
  });

  it('rejects a choice question with fewer than two options', () => {
    // One option is not a choice.
    const single = draft({
      questions: [q({ kind: 'single_choice', options: ['Only one'] })],
    });
    expect(validateSurvey(single, NOW)).toContain('choice_needs_options');
  });

  it('ignores blank options when counting', () => {
    const padded = draft({
      questions: [q({ kind: 'multi_choice', options: ['Yes', '  ', ''] })],
    });
    expect(validateSurvey(padded, NOW)).toContain('choice_needs_options');
  });

  it('does not demand options on a text or scale question', () => {
    expect(validateSurvey(draft({ questions: [q({ kind: 'scale' })] }), NOW)).toEqual([]);
  });

  it('rejects a reward too small to be worth answering', () => {
    const stingy = draft({ rewardPesewas: MIN_REWARD_PESEWAS - 1 });
    expect(validateSurvey(stingy, NOW)).toContain('reward_too_low');
  });

  it('rejects a close date in the past', () => {
    const expired = draft({ closesAtIso: new Date(NOW - 1000).toISOString() });
    expect(validateSurvey(expired, NOW)).toContain('closes_in_past');
  });

  it('rejects an unparseable close date rather than accepting it', () => {
    expect(validateSurvey(draft({ closesAtIso: 'not a date' }), NOW)).toContain('closes_in_past');
  });

  it('rejects a whitespace-only question prompt', () => {
    expect(validateSurvey(draft({ questions: [q({ prompt: '   ' })] }), NOW)).toContain(
      'question_missing_prompt',
    );
  });
});

describe('cost', () => {
  it('charges the full target, not responses so far', () => {
    // A finance team discovering the real number after it fills is how a
    // product loses their trust.
    const cost = estimateSurveyCost(500, 300);
    expect(cost.rewardsPesewas).toBe(150_000);
  });

  it('reconciles exactly', () => {
    const cost = estimateSurveyCost(350, 173);
    expect(cost.rewardsPesewas + cost.platformFeePesewas).toBe(cost.totalPesewas);
  });

  it('applies the same platform share as report commissions', () => {
    const cost = estimateSurveyCost(1_000, 100);
    expect(cost.platformFeePesewas / cost.rewardsPesewas).toBeCloseTo(PLATFORM_FEE_RATE, 5);
  });

  it('returns whole pesewas', () => {
    const cost = estimateSurveyCost(333, 7);
    Object.values(cost).forEach((v) => expect(Number.isInteger(v)).toBe(true));
  });

  it('never goes negative on nonsense input', () => {
    expect(estimateSurveyCost(-500, 10).rewardsPesewas).toBe(0);
    expect(estimateSurveyCost(500, -3).rewardsPesewas).toBe(0);
  });
});

describe('answering', () => {
  it('treats blank and whitespace text as unanswered', () => {
    expect(isAnswered(q(), '')).toBe(false);
    expect(isAnswered(q(), '   ')).toBe(false);
    expect(isAnswered(q(), 'Blocked')).toBe(true);
  });

  it('treats an empty multi-choice selection as unanswered', () => {
    expect(isAnswered(q({ kind: 'multi_choice' }), [])).toBe(false);
    expect(isAnswered(q({ kind: 'multi_choice' }), ['Yes'])).toBe(true);
  });

  it('accepts zero as a valid scale answer', () => {
    // A falsy check here would silently discard the lowest point on the scale.
    expect(isAnswered(q({ kind: 'scale' }), 0)).toBe(true);
  });

  it('rejects NaN as an answer', () => {
    expect(isAnswered(q({ kind: 'scale' }), Number.NaN)).toBe(false);
  });
});

describe('submittability', () => {
  const questions = [
    q({ id: 'a', required: true }),
    q({ id: 'b', required: false }),
    q({ id: 'c', kind: 'photo', required: false }),
  ];

  it('allows submission once required questions are answered', () => {
    // An optional photo left blank must not block someone who answered
    // everything that mattered.
    expect(isSubmittable(questions, { a: 'Yes' })).toBe(true);
  });

  it('blocks submission while a required question is blank', () => {
    expect(isSubmittable(questions, { b: 'Something' })).toBe(false);
  });

  it('allows submission of a survey with no required questions', () => {
    expect(isSubmittable([q({ required: false })], {})).toBe(true);
  });
});

describe('progress', () => {
  const questions = [q({ id: 'a' }), q({ id: 'b' }), q({ id: 'c', required: false })];

  it('counts every question, including optional ones', () => {
    // A bar reading 100% with two optional questions still visible looks broken.
    expect(completionProgress(questions, { a: 'x', b: 'y' })).toBeCloseTo(2 / 3);
    expect(completionProgress(questions, { a: 'x', b: 'y', c: 'z' })).toBe(1);
  });

  it('is zero for an empty form rather than NaN', () => {
    expect(completionProgress([], {})).toBe(0);
  });
});

describe('acceptance', () => {
  const live: Survey = {
    id: 's1',
    businessId: 'b1',
    businessName: 'AMA',
    title: 'Drains',
    description: '',
    questions: [q()],
    rewardPesewas: 500,
    targetArea: null,
    responsesTarget: 100,
    responsesReceived: 40,
    closesAtIso: LATER,
    status: 'live',
  };

  it('accepts a live survey below target and before close', () => {
    expect(isAcceptingResponses(live, NOW)).toBe(true);
  });

  it('stops once the target is reached', () => {
    // Paying for responses beyond what was budgeted is money out the door.
    expect(isAcceptingResponses({ ...live, responsesReceived: 100 }, NOW)).toBe(false);
  });

  it('stops after the close date', () => {
    expect(
      isAcceptingResponses({ ...live, closesAtIso: new Date(NOW - 1).toISOString() }, NOW),
    ).toBe(false);
  });

  it('never accepts a draft or closed survey', () => {
    expect(isAcceptingResponses({ ...live, status: 'draft' }, NOW)).toBe(false);
    expect(isAcceptingResponses({ ...live, status: 'closed' }, NOW)).toBe(false);
  });

  it('reports fill rate as a clamped fraction', () => {
    expect(fillRate({ responsesReceived: 40, responsesTarget: 100 })).toBe(0.4);
    expect(fillRate({ responsesReceived: 150, responsesTarget: 100 })).toBe(1);
    expect(fillRate({ responsesReceived: 5, responsesTarget: 0 })).toBe(0);
  });
});
