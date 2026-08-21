import { autoRoute, canReceive, needsReview, type RoutableSubmission } from '../autoRoute';
import type { BusinessAccount } from '@/types/dawuro';

function biz(overrides: Partial<BusinessAccount> = {}): BusinessAccount {
  return {
    id: 'b1',
    name: 'Test Org',
    sector: 'government',
    verified: true,
    tier: 'professional',
    subscriptionStatus: 'active',
    renewsAtIso: '2026-12-01T00:00:00.000Z',
    seatsUsed: 1,
    reportsUsedThisPeriod: 10,
    interests: ['flood'],
    logoUrl: null,
    ...overrides,
  };
}

function sub(overrides: Partial<RoutableSubmission> = {}): RoutableSubmission {
  return {
    category: 'flood',
    destination: 'marketplace',
    requestedBusinessIds: [],
    location: { latitude: 5.6037, longitude: -0.187 },
    ...overrides,
  };
}

describe('what never routes', () => {
  it('sends a public-only report to nobody', () => {
    // Routing it would quietly turn a free contribution into a commercial one.
    expect(autoRoute(sub({ destination: 'public' }), [biz()])).toEqual([]);
  });

  it('skips a cancelled subscription', () => {
    expect(autoRoute(sub(), [biz({ subscriptionStatus: 'cancelled' })])).toEqual([]);
    expect(canReceive(biz({ subscriptionStatus: 'cancelled' }))).toBe(false);
  });

  it('skips an account that is past due', () => {
    expect(autoRoute(sub(), [biz({ subscriptionStatus: 'past_due' })])).toEqual([]);
  });

  it('includes a trialing account', () => {
    // A trial that receives nothing never converts.
    expect(autoRoute(sub(), [biz({ subscriptionStatus: 'trialing' })])).toHaveLength(1);
  });

  it('never routes on budget alone', () => {
    // Matching purely on "has allowance" would send a wildlife report to an
    // insurer because they happened to have headroom.
    const uninterested = biz({ interests: ['crime'], reportsUsedThisPeriod: 0 });
    expect(autoRoute(sub({ category: 'wildlife' }), [uninterested])).toEqual([]);
  });
});

describe('interest matching', () => {
  it('routes to a business that declared the category', () => {
    const matches = autoRoute(sub({ category: 'flood' }), [biz({ interests: ['flood'] })]);
    expect(matches).toHaveLength(1);
    expect(matches[0]!.reasons).toContain('interest_match');
  });

  it('does not route a category nobody declared', () => {
    expect(autoRoute(sub({ category: 'wildlife' }), [biz({ interests: ['flood'] })])).toEqual([]);
  });
});

describe('explicit requests outrank heuristics', () => {
  it('routes to a named business even with no interest match', () => {
    // The reporter was there. Their judgement beats a category list.
    const matches = autoRoute(sub({ category: 'wildlife', requestedBusinessIds: ['b1'] }), [
      biz({ interests: ['flood'] }),
    ]);
    expect(matches).toHaveLength(1);
    expect(matches[0]!.reasons).toContain('requested');
  });

  it('ranks a requested business above an interest match', () => {
    const matches = autoRoute(sub({ requestedBusinessIds: ['b2'] }), [
      biz({ id: 'b1', interests: ['flood'] }),
      biz({ id: 'b2', interests: [] }),
    ]);
    expect(matches[0]!.businessId).toBe('b2');
  });
});

describe('directed submissions', () => {
  it('goes only to the named businesses', () => {
    const matches = autoRoute(sub({ destination: 'directed', requestedBusinessIds: ['b2'] }), [
      biz({ id: 'b1', interests: ['flood'] }),
      biz({ id: 'b2', interests: ['flood'] }),
    ]);
    expect(matches.map((m) => m.businessId)).toEqual(['b2']);
  });

  it('routes nowhere when the named business cannot receive', () => {
    const matches = autoRoute(sub({ destination: 'directed', requestedBusinessIds: ['b1'] }), [
      biz({ id: 'b1', subscriptionStatus: 'cancelled' }),
    ]);
    expect(matches).toEqual([]);
  });
});

describe('watch areas', () => {
  const areas = [{ businessId: 'b1', latitude: 5.6037, longitude: -0.187, radiusM: 5000 }];

  it('routes a report inside the area', () => {
    const matches = autoRoute(sub(), [biz()], areas);
    expect(matches[0]!.reasons).toContain('in_watch_area');
  });

  it('excludes a report outside the area', () => {
    // They drew a boundary; respect it rather than second-guessing.
    const far = sub({ location: { latitude: 6.7, longitude: -1.6 } });
    expect(autoRoute(far, [biz()], areas)).toEqual([]);
  });

  it('still routes to a named business outside their own area', () => {
    const far = sub({
      location: { latitude: 6.7, longitude: -1.6 },
      requestedBusinessIds: ['b1'],
    });
    expect(autoRoute(far, [biz()], areas)).toHaveLength(1);
  });

  it('does not exclude on geography when the reporter hid the location', () => {
    // A suppressed location means we cannot tell, not that the answer is no.
    const hidden = sub({ location: null });
    expect(autoRoute(hidden, [biz()], areas)).toHaveLength(1);
  });
});

describe('ordering', () => {
  it('returns best fit first', () => {
    const matches = autoRoute(sub({ requestedBusinessIds: ['b3'] }), [
      biz({ id: 'b1', interests: [], reportsUsedThisPeriod: 0 }),
      biz({ id: 'b2', interests: ['flood'] }),
      biz({ id: 'b3', interests: ['flood'] }),
    ]);
    expect(matches[0]!.businessId).toBe('b3');
    expect(matches.map((m) => m.score)).toEqual(
      [...matches.map((m) => m.score)].sort((a, b) => b - a),
    );
  });
});

describe('when an operator should look', () => {
  it('flags a submission nobody matched', () => {
    // An operator may know a recipient the rules do not.
    expect(needsReview(sub({ category: 'wildlife' }), [])).toBe(true);
  });

  it('flags a requested business that did not match', () => {
    const submission = sub({ requestedBusinessIds: ['b1', 'b9'] });
    const matches = [{ businessId: 'b1', score: 100, reasons: ['requested' as const] }];
    expect(needsReview(submission, matches)).toBe(true);
  });

  it('leaves an ordinary matched submission alone', () => {
    const matches = [{ businessId: 'b1', score: 50, reasons: ['interest_match' as const] }];
    expect(needsReview(sub(), matches)).toBe(false);
  });
});
