/* eslint-disable @typescript-eslint/no-require-imports */
// RNTL v14 registers its jest matchers automatically as soon as a test imports
// anything from @testing-library/react-native, so no setup import is needed.

/*
 * Reanimated 4 cannot be imported under Jest without stubbing worklets first.
 *
 * Version 4 moved its runtime into `react-native-worklets`, whose `.native`
 * entry points call into a native module at import time. Requiring reanimated —
 * or its own `/mock`, or `setUpTests()` — reaches that code and throws
 * `Cannot read properties of undefined (reading 'loadUnpackers')`, which fails
 * every suite in the project before a single test runs, not only the animated
 * ones.
 *
 * So worklets is stubbed first and reanimated's shipped mock is used on top.
 * Order matters: the stub has to be registered before anything pulls the real
 * module in.
 */
jest.mock('react-native-worklets', () => {
  /*
   * A no-op for anything reanimated reaches for.
   *
   * Listing exports one by one does not converge: each missing function is
   * only discovered when import-time code hits it, so the stub grows by one
   * name per failed run — `createSerializable`, then `serializableMappingCache`,
   * then `scheduleOnUI`, and so on down the module graph.
   *
   * A proxy answers all of them. Nothing here exercises worklets — the tests
   * assert logic and copy, never animation — so a function that does nothing is
   * the honest stand-in, and the few real values reanimated stores are handled
   * explicitly below.
   */
  const real: Record<string, unknown> = {
    serializableMappingCache: new WeakMap<object, unknown>(),
    createSerializable: (value: unknown) => value,
    isWorkletFunction: () => false,
  };

  return new Proxy(real, {
    get: (target, prop: string) =>
      prop in target ? target[prop] : () => undefined,
  });
});

jest.mock('react-native-reanimated', () => require('react-native-reanimated/mock'));

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  notificationAsync: jest.fn(),
  selectionAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium', Heavy: 'heavy' },
  NotificationFeedbackType: { Success: 'success', Warning: 'warning', Error: 'error' },
}));

jest.mock('expo-secure-store', () => {
  const store = new Map<string, string>();
  return {
    getItemAsync: jest.fn(async (k: string) => store.get(k) ?? null),
    setItemAsync: jest.fn(async (k: string, v: string) => void store.set(k, v)),
    deleteItemAsync: jest.fn(async (k: string) => void store.delete(k)),
  };
});
