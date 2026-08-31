/**
 * When the app shows the boot screen, and when it must stop.
 *
 * The condition in `_layout.tsx` is small but it guards the worst failure the
 * app has: a launch that never completes. Reproduced here rather than
 * rendering the layout, because mounting the real root pulls in SQLite, the
 * sync engine and the keychain — none of which this is about.
 */

/** Mirrors `!fontsSettled || !(authHydrated || bootDeadlinePassed)`. */
function showsBootScreen(input: {
  fontsLoaded: boolean;
  fontError: boolean;
  authHydrated: boolean;
  bootDeadlinePassed: boolean;
  bootMinimumElapsed: boolean;
}): boolean {
  const fontsSettled = input.fontsLoaded || input.fontError;
  const ready = fontsSettled && (input.authHydrated || input.bootDeadlinePassed);
  return !ready || !input.bootMinimumElapsed;
}

const base = {
  fontsLoaded: false,
  fontError: false,
  authHydrated: false,
  bootDeadlinePassed: false,
  bootMinimumElapsed: false,
};

/** Everything settled, including the brand floor. */
const settled = {
  ...base,
  fontsLoaded: true,
  authHydrated: true,
  bootMinimumElapsed: true,
};

test('the logo shows from the first frame', () => {
  expect(showsBootScreen(base)).toBe(true);
});

test('fonts alone are not enough — the profile would flash signed-out', () => {
  expect(showsBootScreen({ ...base, fontsLoaded: true, bootMinimumElapsed: true })).toBe(true);
});

test('the profile alone is not enough — type would reflow when Inter lands', () => {
  expect(showsBootScreen({ ...base, authHydrated: true, bootMinimumElapsed: true })).toBe(true);
});

test('both settled hands over to the app', () => {
  expect(showsBootScreen(settled)).toBe(false);
});

test('a font failure still lets the app through', () => {
  // RN falls back to the system face. Deadlocking on a missing font would be
  // a far worse outcome than the wrong typeface.
  expect(showsBootScreen({ ...settled, fontsLoaded: false, fontError: true })).toBe(false);
});

describe('the deadlock guard', () => {
  test('a hung keychain does not strand the app on the logo', () => {
    // `hydrate()` catches a rejection but cannot catch a promise that never
    // settles. Without the deadline this case is a permanent boot screen.
    expect(
      showsBootScreen({ ...settled, authHydrated: false, bootDeadlinePassed: true }),
    ).toBe(false);
  });

  test('the deadline does not override fonts', () => {
    // Fonts settle on their own and are not a hang risk, so the deadline has
    // no business releasing that gate — it would reintroduce the reflow.
    expect(
      showsBootScreen({ ...settled, fontsLoaded: false, bootDeadlinePassed: true }),
    ).toBe(true);
  });
});

describe('the brand floor', () => {
  test('a fast start still shows the logo', () => {
    // The whole point: fonts and the profile can settle in under 200ms on a
    // warm start, and without this the mark and the words under it flash past
    // as a flicker.
    expect(showsBootScreen({ ...settled, bootMinimumElapsed: false })).toBe(true);
  });

  test('the floor alone does not release a launch that is not ready', () => {
    // It is a minimum, not a timer that ends the wait — an app that rendered
    // before the profile was read would flash the signed-out state.
    expect(showsBootScreen({ ...base, bootMinimumElapsed: true })).toBe(true);
  });
});
