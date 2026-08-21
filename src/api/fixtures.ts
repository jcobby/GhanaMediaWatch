import type { Incident, IncidentCategory, TimePrecision } from '@/types/api';

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
const img = (keywords: string, lock: number, w = 1080, h = 1920): string =>
  `https://loremflickr.com/${w}/${h}/${keywords}?lock=${lock}`;

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
    description:
      'Culvert completely blocked at the Kaneshie junction. Water is over the kerb and taxis are turning back.',
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
];

const NAMES = ['Ama K.', 'Kwesi B.', 'Nana A.', 'Yaw D.', 'Efua M.'];

export const SAMPLE_INCIDENTS: Incident[] = SEEDS.map((s, i) => {
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
    category: s.category,
    description: s.description,
    vettingState: 'published',
    publishedAt: capturedAt.toISOString(),
    media: {
      kind: isVideo ? 'video' : 'photo',
      // A video still needs a poster: the player shows it while buffering, and
      // without one the cell flashes black before the first frame arrives.
      url: isVideo ? VIDEO_CLIPS[i % VIDEO_CLIPS.length]! : img(s.imagery, i + 1),
      posterUrl: img(s.imagery, i + 1, 540, 960),
      width: 1080,
      height: 1920,
      ...(isVideo ? { durationMs: 10_000 } : {}),
    },
    location: {
      latitude: showLocation ? s.latitude : null,
      longitude: showLocation ? s.longitude : null,
      label: showLocation ? s.label : null,
      confidence: i === 3 ? 'low' : 'high',
    },
    capturedAtIso,
    capturedAtPrecision,
    publisher: s.anonymous
      ? { kind: 'anonymous' }
      : { kind: 'user', id: `usr_${i}`, displayName: NAMES[i % NAMES.length]!, avatarUrl: null },
    counts: { reactions: s.reactions, comments: s.comments },
    viewerHasReacted: i === 1,
    ...(showLocation && s.distanceM !== undefined ? { distanceM: s.distanceM } : {}),
  } satisfies Incident;
});
