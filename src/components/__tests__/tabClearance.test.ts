import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { TAB_CONTENT_HEIGHT } from '../RoleTabBar';

/*
 * Guard against content hidden behind the tab bar.
 *
 * A tab-root screen scrolls underneath its own tab bar, so its scroll view
 * needs bottom padding clearing the bar's height. Too little padding is a
 * silent failure — the screen looks correct until you scroll to the very end,
 * and the last row sits under the bar where it cannot be tapped.
 *
 * This shipped once: the role restructure moved five screens from being pushed
 * routes (no tab bar, `insets.bottom + 32` was right) into tab shells, and the
 * padding did not move with them.
 *
 * The test resolves each tab route to the screen it renders and asserts the
 * padding clears the bar.
 */

const APP = join(__dirname, '..', '..', 'app');
const FEATURES = join(__dirname, '..', '..', 'features');

function walk(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walk(full, acc);
    else if (entry.name.endsWith('.tsx')) acc.push(full);
  }
  return acc;
}

/** Every `<Tabs.Screen name="x">` across all role shells, as route file paths. */
function tabRouteFiles(): string[] {
  const out: string[] = [];
  for (const layout of walk(APP).filter((f) => basename(f) === '_layout.tsx')) {
    const src = readFileSync(layout, 'utf8');
    if (!src.includes('<Tabs.Screen')) continue;
    for (const m of src.matchAll(/<Tabs\.Screen\s+name="([^"]+)"/g)) {
      const route = join(dirname(layout), `${m[1]}.tsx`);
      if (existsSync(route)) out.push(route);
    }
  }
  return out;
}

/** The feature screen a route file renders, if it delegates to one. */
function screenFor(routeFile: string): string | null {
  const src = readFileSync(routeFile, 'utf8');
  const m = /import\s*\{\s*(\w+Screen)\s*\}\s*from\s*'[^']+'/.exec(src);
  if (!m) return null;
  const match = walk(FEATURES).find((f) => basename(f) === `${m[1]}.tsx`);
  return match ?? null;
}

describe('tab-root screens clear the tab bar', () => {
  const routes = tabRouteFiles();

  it('finds the tab routes at all', () => {
    // If this breaks, the walk above stopped matching and every case below
    // would vacuously pass. Only the reporter's tab shell remains — the
    // platform and organisation shells were removed; that work is in the console.
    expect(routes.length).toBeGreaterThanOrEqual(5);
  });

  it.each(routes.map((r) => [basename(r), r] as const))(
    '%s leaves room for the bar',
    (_name, routeFile) => {
      const screen = screenFor(routeFile);
      if (!screen) return; // Route renders inline; nothing to resolve.

      const src = readFileSync(screen, 'utf8');
      const scrolls = /ScrollView|FlashList|FlatList/.test(src);
      if (!scrolls) return;

      // Full-bleed screens (the feed, the map) position floating chrome with
      // `bottom:` instead of padding a scroll container.
      const pads = [...src.matchAll(/paddingBottom:\s*insets\.bottom\s*\+\s*(\w+)/g)].map(
        (m) => m[1]!,
      );
      const bottoms = [...src.matchAll(/bottom:\s*insets\.bottom\s*\+\s*(\w+)/g)].map((m) => m[1]!);
      const all = [...pads, ...bottoms];
      if (all.length === 0) return;

      for (const value of all) {
        // Named constants are derived from TAB_CONTENT_HEIGHT by construction.
        if (!/^\d+$/.test(value)) continue;
        expect(Number(value)).toBeGreaterThanOrEqual(TAB_CONTENT_HEIGHT);
      }
    },
  );
});
