import type { ReportOutcome } from '@/types/outcome';

/**
 * What became of the demo user's own reports.
 *
 * Keyed by the ids `mockData` gives them (`own_0`…`own_5`).
 *
 * The spread is deliberate and is mostly *not* success. A demo where every
 * report ends in "Resolved" teaches the wrong thing about the product and sets
 * an expectation the field will not meet: most reports sit unopened for a
 * while, some are closed without action, and some go to an institution that
 * turns out to be the wrong one. The interface has to be honest about all of
 * that or a reporter stops believing the parts that are good news.
 *
 * A report with no entry here has not been routed to anyone — which is correct
 * for a `public` submission and is a real state, not missing data.
 */

const hoursAgo = (h: number): string => new Date(Date.now() - h * 3_600_000).toISOString();

export const REPORT_OUTCOMES: Record<string, ReportOutcome> = {
  /* Resolved — the case the whole product exists to produce. */
  own_0: {
    incidentId: 'own_0',
    recipients: [
      {
        businessId: 'biz_ama',
        businessName: 'Accra Metropolitan Assembly',
        routedAtIso: hoursAgo(30),
      },
      { businessId: 'biz_nadmo', businessName: 'NADMO', routedAtIso: hoursAgo(30) },
    ],
    responses: [
      {
        id: 'res_1',
        businessId: 'biz_ama',
        businessName: 'Accra Metropolitan Assembly',
        action: 'acknowledged',
        note: null,
        atIso: hoursAgo(27),
      },
      {
        id: 'res_2',
        businessId: 'biz_ama',
        businessName: 'Accra Metropolitan Assembly',
        action: 'inspecting',
        note: 'Team going out this afternoon with the desilting crew.',
        atIso: hoursAgo(20),
      },
      {
        id: 'res_3',
        businessId: 'biz_ama',
        businessName: 'Accra Metropolitan Assembly',
        action: 'resolved',
        note: 'Culvert cleared. Two lorry loads of silt and refuse removed.',
        atIso: hoursAgo(4),
      },
    ],
  },

  /* Acted on, but by someone who says it is not theirs. Common and honest. */
  own_1: {
    incidentId: 'own_1',
    recipients: [
      {
        businessId: 'biz_ecg',
        businessName: 'Electricity Company of Ghana',
        routedAtIso: hoursAgo(9),
      },
    ],
    responses: [
      {
        id: 'res_4',
        businessId: 'biz_ecg',
        businessName: 'Electricity Company of Ghana',
        action: 'referred',
        note: 'The pole belongs to the Assembly, not to us. Passed to AMA street lighting.',
        atIso: hoursAgo(6),
      },
    ],
  },

  /* Seen, and the institution needs something before it can act. */
  own_3: {
    incidentId: 'own_3',
    recipients: [
      {
        businessId: 'biz_ama',
        businessName: 'Accra Metropolitan Assembly',
        routedAtIso: hoursAgo(5),
      },
    ],
    responses: [
      {
        id: 'res_5',
        businessId: 'biz_ama',
        businessName: 'Accra Metropolitan Assembly',
        action: 'more_info_requested',
        note: 'Can you say which end of the street this is? The footage could be either.',
        atIso: hoursAgo(2),
      },
    ],
  },

  /*
   * Sent, and nobody has opened it.
   *
   * The most important fixture here. It is the majority case in the field, it
   * is the one an interface is most tempted to hide, and hiding it is how a
   * reporter concludes the app does nothing.
   */
  own_4: {
    incidentId: 'own_4',
    recipients: [
      {
        businessId: 'biz_ec',
        businessName: 'Electoral Commission of Ghana',
        routedAtIso: hoursAgo(11),
      },
      { businessId: 'biz_joy', businessName: 'Joy News', routedAtIso: hoursAgo(11) },
    ],
    responses: [],
  },

  /* Considered and deliberately not acted on. A real answer, and not a failure. */
  own_5: {
    incidentId: 'own_5',
    recipients: [{ businessId: 'biz_nadmo', businessName: 'NADMO', routedAtIso: hoursAgo(50) }],
    responses: [
      {
        id: 'res_6',
        businessId: 'biz_nadmo',
        businessName: 'NADMO',
        action: 'closed_no_action',
        note: 'Outside our mandate. No flooding risk to dwellings at this location.',
        atIso: hoursAgo(41),
      },
    ],
  },

  /* `own_2` is absent on purpose: a public-feed submission, routed to nobody. */
};

export function outcomeFor(incidentId: string): ReportOutcome | null {
  return REPORT_OUTCOMES[incidentId] ?? null;
}
