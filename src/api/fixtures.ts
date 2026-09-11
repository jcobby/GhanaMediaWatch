import type { Incident, IncidentCategory, Publisher, Reporter, TimePrecision } from '@/types/api';
import type { NewsSection } from '@/types/sections';
import { ORGANISATIONS } from '@/api/dawuroData';
import { placeholderImage } from '@/lib/placeholder';
import { formatReportId } from '@/types/context';

/**
 * Institutions that publish, rather than only receive.
 *
 * Declared here rather than beside `publisherFor` below: the function is
 * hoisted, this list is not, and the fixture array runs between them.
 */
const PUBLISHING_ORGS = ORGANISATIONS.filter(
  (b) => b.sector === 'media' || b.sector === 'government',
);

/**
 * Seeded sample incidents for the mock API client.
 *
 * Deterministic on purpose: the same list every launch, so the feed can be
 * eyeballed for layout regressions and screenshot-compared. Real media arrives
 * from the backend as CDN URLs; these use a public placeholder service keyed by
 * a stable seed so each incident keeps its own image across restarts.
 *
 * Locations are real Accra-area landmarks — plausible coordinates matter when
 * the map and distance calculations land in Phase 5.
 */

/**
 * Placeholder media that actually matches the incident.
 *
 * Keyword-addressed rather than random: a sunset portrait standing in for a
 * two-car collision undermines every other design decision on the screen, and
 * makes the app impossible to demo honestly.
 *
 * `lock` pins the result so each incident keeps the same image across restarts
 * — a demo that reshuffles its own photography cannot be talked over.
 */
const img = (category: IncidentCategory, lock: number, w = 1080, h = 1920): string =>
  placeholderImage(`inc-${lock}`, category, { width: w, height: h });

/**
 * Sample clips for the video cells. Short, ranged-request friendly, and served
 * over HTTPS — the three things a feed player actually needs from a test asset.
 */
const VIDEO_CLIPS = [
  'https://test-videos.co.uk/vids/bigbuckbunny/mp4/h264/360/Big_Buck_Bunny_360_10s_1MB.mp4',
  'https://test-videos.co.uk/vids/bigbuckbunny/mp4/h264/360/Big_Buck_Bunny_360_10s_2MB.mp4',
  'https://test-videos.co.uk/vids/bigbuckbunny/mp4/h264/720/Big_Buck_Bunny_720_10s_1MB.mp4',
] as const;

interface Seed {
  id: string;
  category: IncidentCategory;
  /** The desk it ran on. Omitted means Ghana, which every incident report is. */
  section?: NewsSection;
  description: string;
  label: string | null;
  latitude: number | null;
  longitude: number | null;
  minutesAgo: number;
  anonymous: boolean;
  reactions: number;
  comments: number;
  distanceM?: number;
  /** Keywords the placeholder image is drawn from. */
  imagery: string;
  /** Set false to exercise the display-flag suppression path in the UI. */
  showLocation?: boolean;
  showDate?: boolean;
  showTime?: boolean;
}

const SEEDS: Seed[] = [
  {
    id: 'inc_01JBX7Q2K9',
    imagery: 'flood,street',
    category: 'flood',
    /*
     * Deliberately long.
     *
     * Every other seed fits the three lines a caption gets, so the "More"
     * control on the detail screen never appeared and the expanded state was
     * unreachable — a branch of the interface that existed but could not be
     * looked at. One report at the head of the feed now overflows, the way a
     * real eyewitness account written on a phone does.
     */
    description:
      'Culvert completely blocked at the Kaneshie junction. Water is over the kerb and taxis are turning back. ' +
      'It started rising around four this morning and by six the whole stretch from the traffic light down to the ' +
      'market entrance was under it. Traders have moved what they can onto the raised platforms but the ones at ' +
      'the bottom end have lost their stock. Two taxis stalled trying to push through and are still sitting there. ' +
      'People are walking through water above the knee to get to the other side because there is no other way ' +
      'round without going all the way back to the overpass. The drain was cleared some months ago but it has ' +
      'filled again with sand and plastic, and nobody has been down to it since. This is the third time this year.',
    label: 'Kaneshie, Accra',
    latitude: 5.5731,
    longitude: -0.2325,
    minutesAgo: 12,
    anonymous: true,
    reactions: 2412,
    comments: 87,
    distanceM: 1400,
  },
  {
    id: 'inc_01JBX7R4M2',
    imagery: 'car,accident',
    category: 'accident',
    description:
      'Two-car collision on the Spintex Road stretch near the Palace Mall exit. One lane blocked, no ambulance yet.',
    label: 'Spintex Road, Accra',
    latitude: 5.6265,
    longitude: -0.1289,
    minutesAgo: 34,
    anonymous: false,
    reactions: 891,
    comments: 43,
    distanceM: 5200,
  },
  {
    id: 'inc_01JBX7S6P7',
    imagery: 'river,mining',
    category: 'environment',
    description:
      'Galamsey activity visible from the riverbank. Water has turned brown for about two hundred metres downstream.',
    // Deliberately suppressed: this is the display-flag path, and the feed must
    // render cleanly with no location at all.
    label: null,
    latitude: null,
    longitude: null,
    minutesAgo: 96,
    anonymous: true,
    reactions: 5630,
    comments: 214,
    showLocation: false,
  },
  {
    id: 'inc_01JBX7T8Q1',
    imagery: 'streetlight,road',
    category: 'infrastructure',
    description:
      'Streetlight pole down across the pavement on the Achimota stretch. Cable is exposed at the base.',
    label: 'Achimota, Accra',
    latitude: 5.6215,
    longitude: -0.2276,
    minutesAgo: 180,
    anonymous: false,
    reactions: 340,
    comments: 12,
    distanceM: 3100,
  },
  {
    id: 'inc_01JBX7V2R5',
    imagery: 'fire,smoke',
    category: 'fire',
    description:
      'Market stall fire spreading along the row. Fire service on scene, crowd being pushed back.',
    label: 'Makola Market, Accra',
    latitude: 5.5484,
    longitude: -0.2094,
    minutesAgo: 6,
    anonymous: false,
    reactions: 8102,
    comments: 431,
    distanceM: 820,
  },
  {
    id: 'inc_01JBX7W4S8',
    imagery: 'powerline,pole',
    category: 'utility',
    description:
      'Third power cut on this street today. Transformer is humming loudly and there was a flash around 8pm.',
    label: 'Adenta, Accra',
    latitude: 5.7089,
    longitude: -0.1667,
    minutesAgo: 420,
    anonymous: true,
    reactions: 1203,
    comments: 96,
    // Date shown, exact time hidden — the other half of the flag matrix.
    showTime: false,
  },
  {
    id: 'inc_02AF1K7T',
    section: 'africa',
    imagery: 'summit',
    category: 'other',
    description:
      'ECOWAS summit in Abuja closes without agreement on the regional force, with three members abstaining.',
    label: 'Abuja, Nigeria',
    latitude: 9.0765,
    longitude: 7.3986,
    minutesAgo: 95,
    anonymous: false,
    reactions: 640,
    comments: 58,
  },
  {
    id: 'inc_02AF2M4R',
    section: 'africa',
    imagery: 'port',
    category: 'infrastructure',
    description:
      'Lome port expansion reaches its second phase, adding berths that Ghanaian exporters are already booking.',
    label: 'Lome, Togo',
    latitude: 6.1256,
    longitude: 1.2254,
    minutesAgo: 320,
    anonymous: false,
    reactions: 208,
    comments: 14,
  },
  {
    id: 'inc_02WD1P9Q',
    section: 'world',
    imagery: 'climate',
    category: 'environment',
    description:
      'Climate finance talks run past their deadline, with the adaptation fund still short of its target.',
    label: null,
    latitude: null,
    longitude: null,
    minutesAgo: 180,
    anonymous: false,
    reactions: 1120,
    comments: 203,
    showLocation: false,
  },
  {
    id: 'inc_02BZ1V6H',
    section: 'business',
    imagery: 'market',
    category: 'other',
    description:
      'Cedi holds against the dollar for a third week as the central bank keeps the policy rate unchanged.',
    label: 'Accra',
    latitude: 5.6037,
    longitude: -0.187,
    minutesAgo: 240,
    anonymous: false,
    reactions: 517,
    comments: 91,
  },
  {
    id: 'inc_02BZ2N8K',
    section: 'business',
    imagery: 'cocoa',
    category: 'other',
    description:
      'Cocoa farmgate price review brings a rise, but buyers in Western North say the cash has not reached them.',
    label: 'Sefwi Wiawso',
    latitude: 6.2088,
    longitude: -2.4869,
    minutesAgo: 400,
    anonymous: false,
    reactions: 388,
    comments: 77,
  },
  {
    id: 'inc_02PL1D3S',
    section: 'politics',
    imagery: 'parliament',
    category: 'corruption',
    description:
      'Public Accounts Committee recalls two agencies over unretired imprest running back three financial years.',
    label: 'Parliament House, Accra',
    latitude: 5.5573,
    longitude: -0.1963,
    minutesAgo: 150,
    anonymous: false,
    reactions: 902,
    comments: 164,
  },
  {
    id: 'inc_02SP1G2W',
    section: 'sport',
    imagery: 'stadium',
    category: 'other',
    description:
      'Black Stars name a provisional squad for the qualifier, with two uncapped players from the local league.',
    label: 'Accra Sports Stadium',
    latitude: 5.5502,
    longitude: -0.1922,
    minutesAgo: 70,
    anonymous: false,
    reactions: 2870,
    comments: 431,
  },
];

const NAMES = ['Ama K.', 'Kwesi B.', 'Nana A.', 'Yaw D.', 'Efua M.'];

/** The agency, as publisher of its own copy. */
const GNA_DESK = {
  kind: 'organisation',
  id: 'org_gna',
  displayName: 'Ghana News Agency',
  verified: true,
  logoUrl: null,
} as const;

export const SAMPLE_INCIDENTS: Incident[] = SEEDS.map((s, i) => {
  /*
   * Anything not on the Ghana desk is the agency's own copy.
   *
   * Derived from the desk rather than flagged per seed because that is what is
   * actually true of this fixture set: citizens file incidents in Ghana, and
   * the Africa, World, Organisation, Politics and Sport desks carry wire stories
   * nobody in this app filmed. A real backend would set it at ingestion.
   */
  const newsroom = (s.section ?? 'ghana') !== 'ghana';
  const capturedAt = new Date(Date.now() - s.minutesAgo * 60_000);
  // Every third cell is video, so the feed exercises both players.
  const isVideo = i % 3 === 0;
  const showLocation = s.showLocation ?? true;
  const showDate = s.showDate ?? true;
  const showTime = s.showTime ?? true;

  /*
   * The server is what actually suppresses these fields — this mirrors that so
   * the UI is exercised against realistically-nulled data rather than against
   * complete data it politely declines to render.
   */
  let capturedAtIso: string | null = capturedAt.toISOString();
  let capturedAtPrecision: TimePrecision = 'exact';
  if (!showDate) {
    capturedAtIso = null;
    capturedAtPrecision = 'hidden';
  } else if (!showTime) {
    const midnight = new Date(capturedAt);
    midnight.setUTCHours(0, 0, 0, 0);
    capturedAtIso = midnight.toISOString();
    capturedAtPrecision = 'date_only';
  }

  return {
    id: s.id,
    reportId: formatReportId(s.id),
    category: s.category,
    section: s.section ?? 'ghana',
    description: s.description,
    vettingState: 'published',
    publishedAt: capturedAt.toISOString(),
    media: {
      kind: isVideo ? 'video' : 'photo',
      // A video still needs a poster: the player shows it while buffering, and
      // without one the cell flashes black before the first frame arrives.
      url: isVideo ? VIDEO_CLIPS[i % VIDEO_CLIPS.length]! : img(s.category, i + 1),
      posterUrl: img(s.category, i + 1, 540, 960),
      width: 1080,
      height: 1920,
      ...(isVideo ? { durationMs: 10_000 } : {}),
    },
    location: {
      latitude: showLocation && !newsroom ? s.latitude : null,
      longitude: showLocation && !newsroom ? s.longitude : null,
      // The dateline stays — "Abuja, Nigeria" is where the story is *about* —
      // but the coordinates go. A pin on a map is a claim that someone was
      // standing there, and for agency copy that is not true.
      label: showLocation ? s.label : null,
      confidence: i === 3 ? 'low' : 'high',
    },
    origin: newsroom ? 'newsroom' : 'citizen_report',

    /*
     * Agency copy claims no capture and no citizen behind it.
     *
     * `capturedAtIso: null` is not missing data — it is the honest answer.
     * There was no capture: nobody stood at the ECOWAS summit with this app
     * open and waited for a GPS fix, and stamping "Captured 11:17 AM" on a wire
     * story tells the reader something the platform cannot stand behind.
     */
    capturedAtIso: newsroom ? null : capturedAtIso,
    capturedAtPrecision: newsroom ? 'hidden' : capturedAtPrecision,
    publisher: newsroom ? GNA_DESK : publisherFor(i, s.anonymous),
    // No citizen filed it, so there is nobody to credit and nobody to pay.
    reporter: newsroom ? { kind: 'anonymous' } : reporterFor(i, s.anonymous),
    counts: { reactions: s.reactions, comments: s.comments },
    viewerHasReacted: i === 1,
    ...(showLocation && s.distanceM !== undefined ? { distanceM: s.distanceM } : {}),
  } satisfies Incident;
});

/**
 * Who a seeded report is credited to.
 *
 * Roughly a third are released by an institution, because that is the shape of
 * the real feed: most reports come from the public, and the ones an
 * organisation has licensed and stood behind are the minority — but they are
 * the ones that make an organisation page worth opening.
 *
 * The rest split between named reporters and anonymous, which the reporter
 * chooses at submission.
 */
/**
 * Who filed it — independent of who published it.
 *
 * Deliberately not derived from `publisherFor`: an organisation-published
 * report still has a reporter behind it, and that is exactly the case where
 * the publisher union has thrown the name away.
 */
function reporterFor(i: number, anonymous: boolean): Reporter {
  if (anonymous) return { kind: 'anonymous' };
  return { kind: 'user', id: `usr_${i}`, displayName: NAMES[i % NAMES.length]!, avatarUrl: null };
}

function publisherFor(i: number, anonymous: boolean): Publisher {
  /*
   * Cycled on the count of organisation-published reports, not on the report
   * index.
   *
   * Keying both off `i` meant the two modulos interfered: only every third
   * report went to an organisation, and `i % 4` then picked which — so the
   * fourth publisher did not appear until the tenth report, and with fewer
   * seeds than that some organisations never published at all. Their page
   * opened onto an empty Reports tab.
   */
  const org = PUBLISHING_ORGS[Math.floor(i / 3) % PUBLISHING_ORGS.length];
  if (i % 3 === 0 && org) {
    return {
      kind: 'organisation',
      id: org.id,
      displayName: org.name,
      verified: org.verified,
      logoUrl: org.logoUrl,
    };
  }
  if (anonymous) return { kind: 'anonymous' };
  return { kind: 'user', id: `usr_${i}`, displayName: NAMES[i % NAMES.length]!, avatarUrl: null };
}
