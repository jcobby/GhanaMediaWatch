import { REPORT_OUTCOMES, outcomeFor } from '@/api/outcomeData';
import { MY_REPORTS } from '@/api/mockData';
import { outcomeSummary } from '../ReportOutcome';
import {
  RESPONSE_ACTIONS,
  TERMINAL_ACTIONS,
  latestResponse,
  outcomeStage,
  silentRecipients,
  type ReportOutcome,
} from '@/types/outcome';
import en from '@/i18n/locales/en.json';

/**
 * What the app tells a reporter became of their report.
 *
 * This is the half of the product a reporter can walk away over. They filmed
 * something, often at some risk, and every other participant — the institution,
 * the editor, the platform operator — could already see what happened to it.
 * Getting the summary wrong is worse than having none: telling someone their
 * report is "being handled" when nobody has opened it is a promise the product
 * cannot keep.
 */

const outcome = (over: Partial<ReportOutcome> = {}): ReportOutcome => ({
  incidentId: 'x',
  recipients: [{ businessId: 'b1', businessName: 'AMA', routedAtIso: '2026-09-01T00:00:00.000Z' }],
  responses: [],
  ...over,
});

const response = (action: string, businessId = 'b1') => ({
  id: `r_${action}_${businessId}`,
  businessId,
  businessName: businessId === 'b1' ? 'AMA' : 'NADMO',
  action: action as never,
  note: null,
  atIso: '2026-09-01T02:00:00.000Z',
});

describe('the stage a reporter is shown', () => {
  test('a report routed to nobody is public-only, not "awaiting"', () => {
    // A public submission is never offered to institutions. Showing it as
    // waiting for a response would invent a promise nobody made.
    expect(outcomeStage(outcome({ recipients: [] }))).toBe('public_only');
    expect(outcomeStage(null)).toBe('public_only');
  });

  test('routed and untouched is "awaiting"', () => {
    expect(outcomeStage(outcome())).toBe('awaiting');
  });

  test('any recorded action counts as being handled', () => {
    // Including a request for more information: that is a person making
    // contact, and to the reporter it reads as progress.
    expect(outcomeStage(outcome({ responses: [response('acknowledged')] }))).toBe('in_hand');
    expect(outcomeStage(outcome({ responses: [response('more_info_requested')] }))).toBe('in_hand');
    expect(outcomeStage(outcome({ responses: [response('inspecting')] }))).toBe('in_hand');
  });

  test('every terminal action closes the report', () => {
    for (const action of TERMINAL_ACTIONS) {
      expect(outcomeStage(outcome({ responses: [response(action)] }))).toBe('closed');
    }
  });

  test('closed wins over an earlier in-hand action', () => {
    // Order of arrival must not decide the headline: acknowledged then
    // resolved is a resolved report, not one still being handled.
    const both = outcome({ responses: [response('acknowledged'), response('resolved')] });
    expect(outcomeStage(both)).toBe('closed');
  });

  test('one institution closing does not close it for a silent other', () => {
    /*
     * Deliberate, and worth stating: if two bodies hold a report and one closes
     * it without action, the reporter is shown "closed". That is the honest
     * headline — something final has been said — and the timeline still names
     * the other as not having responded, so nothing is hidden.
     */
    const mixed = outcome({
      recipients: [
        { businessId: 'b1', businessName: 'AMA', routedAtIso: '2026-09-01T00:00:00.000Z' },
        { businessId: 'b2', businessName: 'NADMO', routedAtIso: '2026-09-01T00:00:00.000Z' },
      ],
      responses: [response('closed_no_action', 'b1')],
    });
    expect(outcomeStage(mixed)).toBe('closed');
    expect(silentRecipients(mixed).map((r) => r.businessName)).toEqual(['NADMO']);
  });
});

describe('naming who has gone quiet', () => {
  test('an institution that has said nothing is named', () => {
    expect(silentRecipients(outcome()).map((r) => r.businessName)).toEqual(['AMA']);
  });

  test('an institution that has responded is not', () => {
    const spoken = outcome({ responses: [response('acknowledged')] });
    expect(silentRecipients(spoken)).toEqual([]);
  });

  test('nothing is named for a report that went nowhere', () => {
    expect(silentRecipients(outcome({ recipients: [] }))).toEqual([]);
    expect(silentRecipients(null)).toEqual([]);
  });
});

describe('the latest action', () => {
  test('is the last one recorded', () => {
    const many = outcome({
      responses: [response('acknowledged'), response('inspecting'), response('resolved')],
    });
    expect(latestResponse(many)?.action).toBe('resolved');
  });

  test('is null while nobody has touched it', () => {
    expect(latestResponse(outcome())).toBeNull();
    expect(latestResponse(null)).toBeNull();
  });
});

describe('the demo data is honest', () => {
  test('every outcome belongs to a report the user actually has', () => {
    const mine = new Set(MY_REPORTS.map((r) => r.id));
    const orphans = Object.keys(REPORT_OUTCOMES).filter((id) => !mine.has(id));
    expect(orphans).toEqual([]);
  });

  test('at least one report is routed and unanswered', () => {
    /*
     * The majority case in the field, and the one an interface is most tempted
     * to leave out. If the demo only ever shows success, the silence path never
     * gets looked at — and that is the path most reporters will live in.
     */
    const awaiting = MY_REPORTS.filter((r) => outcomeStage(outcomeFor(r.id)) === 'awaiting');
    expect(awaiting.length).toBeGreaterThan(0);
  });

  test('at least one report was never routed anywhere', () => {
    const none = MY_REPORTS.filter((r) => outcomeStage(outcomeFor(r.id)) === 'public_only');
    expect(none.length).toBeGreaterThan(0);
  });

  test('the demo is not all good news', () => {
    // A closed_no_action or referred outcome must be represented, or the
    // interface for a disappointing answer is never seen before release.
    const actions = Object.values(REPORT_OUTCOMES).flatMap((o) => o.responses.map((r) => r.action));
    expect(actions).toContain('closed_no_action');
    expect(actions).toContain('referred');
  });

  test('every action in the demo is one the app can label', () => {
    const actions = Object.values(REPORT_OUTCOMES).flatMap((o) => o.responses.map((r) => r.action));
    const unlabelled = actions.filter((a) => !RESPONSE_ACTIONS.includes(a));
    expect(unlabelled).toEqual([]);
  });
});

describe('every state has words', () => {
  /*
   * Read as nested objects, because that is what i18next resolves.
   *
   * These were first written as flat keys containing dots — `"stage.awaiting"`
   * inside `outcome` — which looks identical in the file and resolves to
   * nothing: i18next treats the dot as a path separator and goes looking for
   * `outcome → stage → awaiting`. The labels reached only by a template string
   * would have rendered as raw keys on the reporter's screen with no error
   * anywhere.
   */
  const copy = en.outcome as unknown as {
    action: Record<string, string>;
    stage: Record<string, string>;
  };

  test('each response action has a label', () => {
    const missing = RESPONSE_ACTIONS.filter((a) => !copy.action[a]);
    expect(missing).toEqual([]);
  });

  test('each stage has a label', () => {
    const missing = ['public_only', 'awaiting', 'in_hand', 'closed'].filter((s) => !copy.stage[s]);
    expect(missing).toEqual([]);
  });

  test('the labels are nested, not dotted keys', () => {
    // The shape itself, so the flat form cannot come back.
    const flat = Object.keys(en.outcome as Record<string, unknown>).filter((k) => k.includes('.'));
    expect(flat).toEqual([]);
  });
});

/**
 * The card's badge and its summary say different things.
 *
 * They sit side by side on every report row: a badge with the stage, then one
 * line of detail. The summary returned the stage label for an unrouted report,
 * so the row read "Public feed  Public feed" — two elements, one string, and no
 * information in the second.
 *
 * Nothing catches this. Both halves are individually correct.
 */
describe('the report row does not repeat itself', () => {
  const t = ((key: string, opts?: Record<string, unknown>) => {
    const path = key.split('.');
    let node: unknown = en;
    for (const part of path) {
      if (node && typeof node === 'object' && part in node)
        node = (node as Record<string, unknown>)[part];
      else return key;
    }
    if (typeof node !== 'string') return key;
    return node.replace(/\{\{(\w+)\}\}/g, (_m, k: string) => String(opts?.[k] ?? ''));
  }) as Parameters<typeof outcomeSummary>[1];

  const stageLabel = (stage: string) =>
    (en.outcome as unknown as { stage: Record<string, string> }).stage[stage]!;

  test('an unrouted report does not print its badge twice', () => {
    const summary = outcomeSummary({ incidentId: 'x', recipients: [], responses: [] }, t);
    expect(summary).not.toBe(stageLabel('public_only'));
    expect(summary).toBeTruthy();
  });

  test('no stage summary is simply the stage name', () => {
    // The general rule, so the same mistake cannot return for another stage.
    const cases: ReportOutcome[] = [
      { incidentId: 'a', recipients: [], responses: [] },
      {
        incidentId: 'b',
        recipients: [
          { businessId: 'b1', businessName: 'AMA', routedAtIso: '2026-09-01T00:00:00Z' },
        ],
        responses: [],
      },
    ];

    for (const outcome of cases) {
      const stage = outcomeStage(outcome);
      expect([stage, outcomeSummary(outcome, t) === stageLabel(stage)]).toEqual([stage, false]);
    }
  });
});
