/**
 * News desks.
 *
 * GNA is a news agency, so the feed is organised the way a newsroom is: Ghana,
 * Africa, World, Organisation, Politics, Sport. That is the axis a reader arrives
 * with — they want a desk, not a taxonomy.
 *
 * This is deliberately *not* the incident category. A report is filed as
 * `flood` or `accident`, which is what routing, commission and the editorial
 * queue all key off; the desk is where it is published. A burst main in
 * Kaneshie is a `flood` on the Ghana desk. Collapsing the two would mean
 * either the newsroom inherits a taxonomy it does not use, or routing loses
 * the precision it depends on.
 */

export type NewsSection = 'ghana' | 'africa' | 'world' | 'business' | 'politics' | 'sport';

/** Order as a newsroom would run them: nearest first. */
export const NEWS_SECTIONS: NewsSection[] = [
  'ghana',
  'africa',
  'world',
  'business',
  'politics',
  'sport',
];

/**
 * The desks as the strip shows them, Latest first.
 *
 * `null` is a position, not an absence: it is the "all desks" tab, and a
 * reader swiping back from Ghana expects to land on it.
 */
export const DESKS: (NewsSection | null)[] = [null, ...NEWS_SECTIONS];

/**
 * The desk one step either side of the current one, for swipe navigation.
 *
 * Returns the current desk unchanged at either end rather than wrapping.
 * Wrapping would take a reader from Sport straight back to Latest, which reads
 * as the app having lost its place rather than as navigation — and on a feed
 * the two look identical until you notice the stories changed.
 */
export function adjacentDesk(current: NewsSection | null, delta: number): NewsSection | null {
  const at = DESKS.indexOf(current);
  // An unknown desk is treated as Latest, so a stale value cannot strand the
  // reader on a tab the strip no longer offers.
  const from = at === -1 ? 0 : at;
  const next = DESKS[from + delta];
  return next === undefined ? current : next;
}
