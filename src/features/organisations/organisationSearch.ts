/**
 * Finding an organisation by what somebody types.
 *
 * Every word has to match somewhere — "adom news" finds "Adom TV News" — and
 * accents and case are ignored. Names that begin with the search come first,
 * so typing "joy" puts "Joy News" above "Enjoy FM".
 */

const normalise = (value: string) =>
  value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

export function filterOrganisations<T extends { name: string }>(
  organisations: T[],
  query: string,
  /** Extra words to search on, such as the sector in the reader's language. */
  alsoMatch?: (organisation: T) => string,
): T[] {
  const q = normalise(query);
  if (!q) return organisations;
  const words = q.split(' ');

  const matches = organisations.filter((organisation) => {
    const haystack = normalise(`${organisation.name} ${alsoMatch?.(organisation) ?? ''}`);
    return words.every((word) => haystack.includes(word));
  });

  const rank = (organisation: T) => {
    const name = normalise(organisation.name);
    if (name.startsWith(q)) return 0;
    if (name.split(' ').some((part) => part.startsWith(words[0]!))) return 1;
    return 2;
  };

  // A stable sort: organisations of equal rank keep the directory's own order.
  return matches
    .map((organisation, index) => ({ organisation, index }))
    .sort((a, b) => rank(a.organisation) - rank(b.organisation) || a.index - b.index)
    .map(({ organisation }) => organisation);
}
