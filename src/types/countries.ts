import type { FlagDesign } from '@/components/Flag';

/**
 * The countries the picker offers, and which of them Dawuro actually covers.
 *
 * **One is live.** Every report the platform holds is Ghanaian: there is no
 * `country` on `PublicIncident`, no `country` filter on `GET /incidents`, and
 * the app's own types say "null means anywhere in the country" — singular. So
 * the picker shows Ghana as chosen and the rest as not yet covered, which is
 * the truth rather than a control that quietly changes nothing.
 *
 * `covered` is the whole mechanism. When the service grows a country field and
 * a filter, flipping one of these to `true` is the entire client change — the
 * picker, the flags and the sheet need no rework. The backend request is item
 * **W** in the console repo's `BACKEND-REQUESTS.md`.
 *
 * **The list is West Africa, and that is a product decision rather than a
 * technical one.** These are Ghana's neighbours plus the region's largest
 * market, all of whose flags are plain tricolours that can be drawn faithfully
 * (see `components/Flag`). It is trivially editable and carries no promise
 * about when — the sheet says "not yet covered", not "coming soon", because the
 * second is a date nobody here can keep.
 */

export interface Country {
  /** ISO 3166-1 alpha-2, which is what a `country` filter will almost certainly take. */
  code: string;
  name: string;
  flag: FlagDesign;
  /** Whether Dawuro holds reports for it. Exactly one is true today. */
  covered: boolean;
}

const GOLD = '#FCD116';
const GREEN = '#006B3F';
const RED = '#CE1126';

export const COUNTRIES: Country[] = [
  {
    code: 'GH',
    name: 'Ghana',
    flag: { bands: [RED, GOLD, GREEN], direction: 'horizontal', star: '#000000' },
    covered: true,
  },
  {
    code: 'NG',
    name: 'Nigeria',
    flag: { bands: ['#008751', '#FFFFFF', '#008751'], direction: 'vertical' },
    covered: false,
  },
  {
    code: 'CI',
    name: "Côte d'Ivoire",
    flag: { bands: ['#F77F00', '#FFFFFF', '#009E60'], direction: 'vertical' },
    covered: false,
  },
  {
    code: 'SN',
    name: 'Senegal',
    flag: { bands: ['#00853F', GOLD, '#E31B23'], direction: 'vertical', star: '#00853F' },
    covered: false,
  },
  {
    code: 'BF',
    name: 'Burkina Faso',
    flag: { bands: ['#EF2B2D', '#009E49'], direction: 'horizontal', star: GOLD },
    covered: false,
  },
  {
    code: 'ML',
    name: 'Mali',
    flag: { bands: ['#14B53A', GOLD, '#CE1126'], direction: 'vertical' },
    covered: false,
  },
];

/** The one country with reports in it. Ghana until the service says otherwise. */
export const HOME_COUNTRY: Country = COUNTRIES.find((c) => c.covered)!;

export const countryByCode = (code: string): Country | undefined =>
  COUNTRIES.find((c) => c.code === code);
