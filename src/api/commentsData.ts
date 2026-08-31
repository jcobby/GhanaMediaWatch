import { SAMPLE_INCIDENTS } from './fixtures';
import type { IncidentComment } from '@/types/comments';
import type { IncidentCategory } from '@/types/api';
import { placeholderImage } from '@/lib/placeholder';

/**
 * Seeded comments for the mock API client.
 *
 * Written to show the two kinds of thing that land under a report: people
 * saying something about it, and people adding footage of the same event. The
 * second kind is the one this product actually needs to handle well, so the
 * fixtures lean on it.
 *
 * Replaced by the API once the backend implements the comment endpoints; the
 * shapes match @/types/comments so that swap is wiring rather than a rewrite.
 */

const minutesAgo = (m: number): string => new Date(Date.now() - m * 60_000).toISOString();

const img = (category: IncidentCategory, lock: number): string =>
  placeholderImage(`cmt-${lock}`, category, { width: 540, height: 960 });

const CLIP = 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerJoyrides.mp4';

/** Attached to the first seeded incident so the demo has somewhere obvious to look. */
const first = SAMPLE_INCIDENTS[0]?.id ?? 'inc_001';
const second = SAMPLE_INCIDENTS[1]?.id ?? 'inc_002';

export const SAMPLE_COMMENTS: IncidentComment[] = [
  {
    id: 'cmt_001',
    incidentId: first,
    author: { handle: 'Kojo Mensah', avatarUrl: null, isAnonymous: false },
    body: 'I passed here around the same time. It had already been going on for a while.',
    media: null,
    createdAtIso: minutesAgo(38),
    isContribution: false,
    reactions: 4,
    viewerHasReacted: false,
  },
  {
    id: 'cmt_002',
    incidentId: first,
    author: { handle: 'Adjoa B.', avatarUrl: null, isAnonymous: false },
    body: 'Filmed this from the other side of the road, you can see more of what happened.',
    media: {
      kind: 'video',
      posterUrl: img('accident', 501),
      playbackUrl: CLIP,
      durationMs: 21_000,
    },
    createdAtIso: minutesAgo(26),
    isContribution: true,
    reactions: 12,
    viewerHasReacted: false,
  },
  {
    id: 'cmt_003',
    incidentId: first,
    author: { handle: 'Anonymous', avatarUrl: null, isAnonymous: true },
    body: 'Still like this as of this morning. Nobody has come.',
    media: {
      kind: 'photo',
      posterUrl: img('infrastructure', 502),
      playbackUrl: null,
      durationMs: null,
    },
    createdAtIso: minutesAgo(9),
    isContribution: true,
    reactions: 7,
    viewerHasReacted: false,
  },
  {
    id: 'cmt_004',
    incidentId: first,
    author: {
      handle: 'AMA Operations',
      avatarUrl: null,
      isAnonymous: false,
      organisationName: 'Accra Metropolitan Assembly',
    },
    body: 'We have received this and a team has been assigned. Thank you for reporting.',
    media: null,
    createdAtIso: minutesAgo(4),
    isContribution: false,
    reactions: 21,
    viewerHasReacted: false,
  },
  {
    id: 'cmt_005',
    incidentId: second,
    author: { handle: 'Yaw O.', avatarUrl: null, isAnonymous: false },
    body: 'Which junction exactly? I take this road every day.',
    media: null,
    createdAtIso: minutesAgo(52),
    isContribution: false,
    reactions: 1,
    viewerHasReacted: false,
  },
];

export function commentsFor(incidentId: string): IncidentComment[] {
  return SAMPLE_COMMENTS.filter((c) => c.incidentId === incidentId).sort(
    (a, b) => Date.parse(a.createdAtIso) - Date.parse(b.createdAtIso),
  );
}

/** Footage added by others — surfaced separately because it is evidence. */
export function contributionsFor(incidentId: string): IncidentComment[] {
  return commentsFor(incidentId).filter((c) => c.isContribution && c.media !== null);
}
