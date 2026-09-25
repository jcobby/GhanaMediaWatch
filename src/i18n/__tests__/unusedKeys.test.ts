import fs from 'fs';
import path from 'path';
import en from '../locales/en.json';

/**
 * No string ships that nothing renders.
 *
 * `coverage.test.ts` checks the other direction — every `t('…')` resolves to a
 * real string. This checks that every real string is reachable from somewhere,
 * which is how four dead keys survived a rewrite:
 *
 *   `earnings.withdrawTitle`, `earnings.payoutSentTitle`,
 *   `earnings.simulationNotice`   copy for a Withdraw button that was deliberately
 *                                 deleted, because it waited 1.4 seconds and
 *                                 announced money "on its way" while nothing was
 *                                 stored and nothing was sent.
 *   `capture.previewPlaceholder`  "Camera preview — Phase 4", build scaffolding,
 *                                 sitting in a production bundle.
 *
 * Dead copy is not merely untidy. Somebody re-wiring those three in good faith
 * would have resurrected the exact false claim that was removed, and a
 * translator bills for every one of them.
 *
 * **On the allowlist below.** Keys built at runtime cannot be found by a regex,
 * so they are listed here by their *enumerated values* rather than by namespace.
 * That distinction is the whole design: `t(`capture.${m}`)` exists, so a
 * `capture.*` wildcard would have been the obvious shortcut — and it would have
 * hidden `capture.previewPlaceholder`, the key this test was written to catch.
 * Whole namespaces are allowed only where the namespace *is* the enum and every
 * member is reached the same way.
 */

const SRC = path.resolve(__dirname, '../..');

/** Namespaces that are wholly enum-driven: every member is reached by `t(`ns.${value}`)`. */
const ENUM_NAMESPACES = [
  'category',
  'sector',
  'section',
  'vetting',
  'safety',
  'onboarding',
  'outcome',
  'apiError',
  'earnings.status',
  'earnings.payout',
  'outbox.state',
  'auth.strength',
  'auth.accountType',
  'organisations.tab',
  'profile.mark',
  'review.handling',
  /*
   * The organisation app's enumerations, each reached as `t(`org.x.${value}`)`
   * over a closed union in `types/org.ts` — the assignment ladder, the response
   * actions an organisation can send a reporter, its internal statuses, the
   * inbox filter, the roles the service grants, and the plan's tier and billing
   * state.
   *
   * Named one namespace at a time rather than allowing `org.*`, which is the
   * whole point of this list: the rest of that namespace is ordinary static copy
   * and a dead key in it must still be caught.
   */
  'org.assignment',
  'org.filter',
  'org.response',
  'org.role',
  'org.status',
  'org.subscription',
  'org.tierName',
  /*
   * The organisation's application to join, which is entirely enum-driven: the
   * steps, their help text, every field and its placeholder, the document
   * types and the step statuses are all reached as `t(`apply.x.${value}`)` over
   * the closed lists in `types/onboarding.ts`. `organisationSignUp.test.ts`
   * asserts each of those lists has words for every member, which is the check
   * that actually has teeth here.
   */
  'apply.document',
  'apply.field',
  'apply.placeholder',
  'apply.status',
  'apply.step',
  'apply.stepHelp',
  // Reporter or organisation, on the sign-up screen.
  'auth.kind',
  'auth.kindHelp',
];

/**
 * Runtime keys whose namespace also holds ordinary static copy.
 *
 * Each is spelled out, so a new dead key beside them is still caught.
 */
const DYNAMIC_KEYS = [
  // CameraStage: (['photo', 'video', 'audio', 'live'] as const).map(…)
  'capture.photo',
  'capture.video',
  'capture.audio',
  'capture.live',
  // ProfileScreen: (['reports', 'settings'] as const).map(…)
  'profile.reports',
  'profile.settings',
  // ReviewScreen: t(`review.${steps[current]}`)
  'review.stepCapture',
  'review.stepDetails',
  'review.stepSend',
  'review.stepRecipients',
  // DestinationPicker: t(`destination.${option.value}.title` | `.body`)
  ...['public', 'marketplace', 'directed', 'both'].flatMap((d) => [
    `destination.${d}.title`,
    `destination.${d}.body`,
  ]),
];

function leaves(node: unknown, trail: string, out: string[] = []): string[] {
  if (typeof node === 'string') {
    out.push(trail);
    return out;
  }
  if (typeof node === 'object' && node !== null) {
    for (const [key, value] of Object.entries(node)) {
      leaves(value, trail ? `${trail}.${key}` : key, out);
    }
  }
  return out;
}

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '__tests__') continue;
      sourceFiles(full, out);
    } else if (/\.tsx?$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

/**
 * Copy for screens that left this repo.
 *
 * The organisation and platform consoles were built here first and then moved to
 * the web console — their routes are deleted, their strings are not. Roughly
 * three hundred keys, which is a product surface rather than a stray key, so
 * they are named here and tracked rather than swept out on a test's say-so. If
 * that work is never coming back to the phone, deleting these namespaces is a
 * separate and deliberate change.
 */
/*
 * `org` has come off this list. The organisation's field work is on the phone
 * again — the routed inbox, licences, dispatch and the account behind them —
 * so that namespace is live copy and its dead keys must be caught like any
 * other. The copy for the *console's* organisation screens, which did not come
 * back, is still here under its own namespaces.
 */
const MOVED_TO_CONSOLE = [
  'organisation',
  'organisationAccount',
  'organisationTabs',
  'platformTabs',
  'platform',
  'routing',
  'surveys',
  'deskOnly',
];

const files = sourceFiles(SRC);
const source = files.map((file) => fs.readFileSync(file, 'utf8')).join('\n');

/**
 * Every key the app names, by either route it can name one.
 *
 * `t('a.b')` is the obvious one. The second pattern is the reason this test
 * nearly deleted working copy: `AccountSettings` passes keys as plain arguments
 * — `failure(cause, 'account.nameFailedTitle', 'account.nameFailedBody')` — and
 * a `t(` -anchored regex cannot see those. They are live error messages, and a
 * sweep that reported them as dead would have had me delete the words somebody
 * reads when their password change fails.
 *
 * So any dotted string literal counts as a reference. That is deliberately
 * generous: the cost of over-counting is a dead key surviving, and the cost of
 * under-counting is deleting copy that renders.
 */
const referenced = new Set<string>();
for (const match of source.matchAll(/'([a-zA-Z0-9_]+(?:\.[a-zA-Z0-9_]+)+)'/g)) {
  if (match[1]) referenced.add(match[1]);
}

const allowed = new Set(DYNAMIC_KEYS);

const isAllowed = (key: string) =>
  referenced.has(key) ||
  allowed.has(key) ||
  ENUM_NAMESPACES.some((ns) => key.startsWith(`${ns}.`)) ||
  MOVED_TO_CONSOLE.some((ns) => key === ns || key.startsWith(`${ns}.`));

test('the sweep actually reads the app', () => {
  // Without this, a broken walk makes every assertion below vacuously true.
  expect(files.length).toBeGreaterThan(50);
  expect(referenced.size).toBeGreaterThan(100);
});

test('the allowlist names keys that exist', () => {
  /*
   * A stale entry exempts nothing, but it also disguises the fact that the
   * screen it was written for is gone — and the next person reads the list as
   * current. Cheap to check, and it keeps the list honest.
   */
  const present = new Set(leaves(en, ''));
  for (const key of DYNAMIC_KEYS) {
    expect([key, present.has(key)]).toEqual([key, true]);
  }
  for (const ns of ENUM_NAMESPACES) {
    expect([ns, [...present].some((k) => k.startsWith(`${ns}.`))]).toEqual([ns, true]);
  }
});

test('every string in en.json is rendered somewhere', () => {
  const orphans = leaves(en, '').filter((key) => !isAllowed(key));
  expect(orphans).toEqual([]);
});
