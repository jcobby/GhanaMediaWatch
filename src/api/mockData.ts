import type { AuthoredIncident, IncidentCategory, VettingState } from '@/types/api';
import { placeholderImage } from '@/lib/placeholder';
import { SAMPLE_INCIDENTS } from './fixtures';

/**
 * Demo data for the screens that have no live source yet.
 *
 * Everything here is deterministic so the app presents identically on every
 * launch — a demo that reshuffles its own content is impossible to talk over.
 * All of it is replaced by MockApiClient/HttpApiClient once Phase 2 lands; the
 * shapes already match @/types/api so that swap is a wiring change, not a
 * rewrite of the screens.
 */

// ─── the signed-in user ────────────────────────────────────────────────────

export interface DemoUser {
  id: string;
  displayName: string;
  handle: string;
  joinedIso: string;
  reportsFiled: number;
  reportsPublished: number;
  totalReactions: number;
  isOrgMember: boolean;
  orgName: string | null;
  orgRole: 'owner' | 'admin' | 'analyst' | 'viewer' | null;
}

export const DEMO_USER: DemoUser = {
  id: 'usr_demo',
  displayName: 'Justice Cobbinah',
  handle: '@justice',
  joinedIso: '2026-03-14T09:00:00.000Z',
  reportsFiled: 23,
  reportsPublished: 18,
  totalReactions: 14_206,
  isOrgMember: true,
  orgName: 'Accra Metro Assembly',
  orgRole: 'analyst',
};

// ─── the user's own reports, across every vetting state ────────────────────

const authored = (
  index: number,
  state: VettingState,
  overrides: Partial<AuthoredIncident> = {},
): AuthoredIncident => {
  const base = SAMPLE_INCIDENTS[index % SAMPLE_INCIDENTS.length]!;
  return {
    ...base,
    id: `own_${index}`,
    clientId: `client_${index}`,
    vettingState: state,
    isAnonymous: index % 2 === 0,
    rejectionReason: null,
    /*
     * The reporter's own routing decision, which decides what the outcome
     * timeline may claim. Left off the demo entirely until now, so every demo
     * report was read as a public submission — including the ones the demo
     * routes to institutions.
     */
    destination: index % 3 === 0 ? 'public' : index % 3 === 1 ? 'directed' : 'both',
    requestedBusinessIds: [],
    createdAt: base.publishedAt,
    // Null unless an editor ran it. This is the whole point of the state.
    publishedAt: state === 'published' ? base.publishedAt : null,
    displayFlags: { showLocation: true, showDate: true, showTime: true },
    location: {
      ...base.location,
      accuracyM: 6 + index * 2,
      altitude: 58,
      heading: null,
      speed: 0,
      isMocked: false,
    },
    ...overrides,
  };
};

export const MY_REPORTS: AuthoredIncident[] = [
  authored(0, 'published'),
  authored(4, 'published'),
  authored(1, 'pending_review'),
  authored(3, 'pending_review'),
  authored(2, 'rejected', {
    rejectionReason:
      'The footage does not clearly show the incident described. Re-submit with a wider shot if the issue is ongoing.',
  }),
  authored(5, 'restricted'),
];

// ─── the outbox queue ──────────────────────────────────────────────────────

export type OutboxState = 'queued' | 'uploading' | 'failed' | 'uploaded';

export interface OutboxItem {
  id: string;
  category: IncidentCategory;
  description: string;
  thumbnailUrl: string;
  kind: 'photo' | 'video';
  byteSize: number;
  capturedAtIso: string;
  state: OutboxState;
  /** 0..1, meaningful only while uploading. */
  progress: number;
  attemptCount: number;
  lastError: string | null;
  /** True when the item is a video held back by the Wi-Fi-only setting. */
  waitingForWifi: boolean;
}

const minutesAgo = (m: number): string => new Date(Date.now() - m * 60_000).toISOString();

export const OUTBOX_ITEMS: OutboxItem[] = [
  {
    id: 'out_1',
    category: 'accident',
    description: 'Motorbike down at the Tetteh Quarshie underpass, rider sitting up.',
    thumbnailUrl: placeholderImage('mock-9', 'other', { width: 540, height: 960 }),
    kind: 'video',
    byteSize: 18_400_000,
    capturedAtIso: minutesAgo(4),
    state: 'uploading',
    progress: 0.62,
    attemptCount: 1,
    lastError: null,
    waitingForWifi: false,
  },
  {
    id: 'out_2',
    category: 'infrastructure',
    description: 'Manhole cover missing on the pavement outside the school gate.',
    thumbnailUrl: placeholderImage('mock-9', 'other', { width: 540, height: 960 }),
    kind: 'photo',
    byteSize: 2_100_000,
    capturedAtIso: minutesAgo(31),
    state: 'queued',
    progress: 0,
    attemptCount: 0,
    lastError: null,
    waitingForWifi: false,
  },
  {
    id: 'out_3',
    category: 'flood',
    description: 'Drain overflowing across both lanes after last night’s rain.',
    thumbnailUrl: placeholderImage('mock-9', 'other', { width: 540, height: 960 }),
    kind: 'video',
    byteSize: 44_800_000,
    capturedAtIso: minutesAgo(96),
    state: 'queued',
    progress: 0,
    attemptCount: 0,
    lastError: null,
    // Exercises the Wi-Fi-only deferral path: video waits, photos do not.
    waitingForWifi: true,
  },
  {
    id: 'out_4',
    category: 'utility',
    description: 'Sparking cable on the pole at the corner.',
    thumbnailUrl: placeholderImage('mock-9', 'other', { width: 540, height: 960 }),
    kind: 'photo',
    byteSize: 3_300_000,
    capturedAtIso: minutesAgo(220),
    state: 'failed',
    progress: 0.18,
    attemptCount: 4,
    lastError: 'Connection lost while uploading. Will retry automatically.',
    waitingForWifi: false,
  },
];

// ─── org tier ──────────────────────────────────────────────────────────────

export interface OrgStat {
  category: IncidentCategory;
  count: number;
  deltaPct: number;
}

export const ORG_STATS: OrgStat[] = [
  { category: 'flood', count: 128, deltaPct: 34 },
  { category: 'infrastructure', count: 96, deltaPct: -8 },
  { category: 'accident', count: 74, deltaPct: 12 },
  { category: 'utility', count: 61, deltaPct: 4 },
  { category: 'environment', count: 38, deltaPct: 41 },
  { category: 'fire', count: 22, deltaPct: -15 },
];

/** Fourteen days of report volume, for the dashboard sparkline. */
export const ORG_TREND: number[] = [12, 18, 15, 22, 19, 31, 28, 24, 36, 42, 38, 47, 51, 44];

export interface SavedQuery {
  id: string;
  name: string;
  categories: IncidentCategory[];
  radiusM: number;
  centerLabel: string;
  matchCount: number;
  alertsOn: boolean;
}

export const SAVED_QUERIES: SavedQuery[] = [
  {
    id: 'qry_1',
    name: 'Flooding — Odaw catchment',
    categories: ['flood', 'infrastructure'],
    radiusM: 3000,
    centerLabel: 'Odaw River, Accra',
    matchCount: 41,
    alertsOn: true,
  },
  {
    id: 'qry_2',
    name: 'Road incidents — Spintex corridor',
    categories: ['accident', 'infrastructure'],
    radiusM: 5000,
    centerLabel: 'Spintex Road',
    matchCount: 27,
    alertsOn: true,
  },
  {
    id: 'qry_3',
    name: 'Power faults — Adenta',
    categories: ['utility'],
    radiusM: 2500,
    centerLabel: 'Adenta Municipal',
    matchCount: 13,
    alertsOn: false,
  },
];
