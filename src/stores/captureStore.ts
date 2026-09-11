import { create } from 'zustand';
import type { IncidentCategory } from '@/types/api';
import type { LockedFix } from '@/features/capture/gpsGate';
import type { SubmissionDestination } from '@/types/dawuro';
import { EMPTY_CONSENT, type ConsentFlags, type Severity } from '@/types/context';

export interface PendingCapture {
  /** Cache-directory URI straight from the camera, before it is persisted. */
  uri: string;
  kind: 'photo' | 'video' | 'audio';
  mimeType: string;
  width: number | null;
  height: number | null;
  durationMs: number | null;
  /** Locked at the shutter and never updated afterwards. */
  fix: LockedFix;
  confidence: 'high' | 'low';
}

interface CaptureState {
  pending: PendingCapture | null;
  category: IncidentCategory;
  description: string;
  isAnonymous: boolean;
  /** The reporter's own account of how urgent it is. */
  severity: Severity;
  /** A nearby name people actually use, when coordinates are not enough. */
  landmark: string;
  /** What the footage contains, which decides how it must be handled. */
  consent: ConsentFlags;
  showLocation: boolean;
  showDate: boolean;
  showTime: boolean;
  /** Where this report goes — public feed, organisations, or both. */
  destination: SubmissionDestination;
  /** Named recipients, for a directed submission. */
  businessIds: string[];
  /**
   * Which moment of the clip stands for it, in milliseconds from the start.
   *
   * Null means nobody chose, and the app takes its usual frame a second in.
   * Only meaningful for a video: a photograph is its own thumbnail.
   */
  posterAtMs: number | null;

  setPending: (capture: PendingCapture) => void;
  setCategory: (category: IncidentCategory) => void;
  setDescription: (description: string) => void;
  setAnonymous: (value: boolean) => void;
  setSeverity: (value: Severity) => void;
  setLandmark: (value: string) => void;
  setPosterAtMs: (value: number | null) => void;
  setConsent: (key: keyof ConsentFlags, value: boolean) => void;
  setShowLocation: (value: boolean) => void;
  setShowDate: (value: boolean) => void;
  setShowTime: (value: boolean) => void;
  setDestination: (destination: SubmissionDestination) => void;
  setBusinessIds: (ids: string[]) => void;
  reset: () => void;
}

const DEFAULTS = {
  pending: null,
  category: 'other' as IncidentCategory,
  description: '',
  isAnonymous: false,
  severity: 'concern' as Severity,
  landmark: '',
  posterAtMs: null,
  consent: EMPTY_CONSENT,
  showLocation: true,
  showDate: true,
  showTime: true,
  /*
   * Organisations by default.
   *
   * The product's purpose is getting information to organisations who can act
   * on it — the public feed is what happens *after* one of them licenses a
   * report, not the primary destination. Defaulting to public buried the main
   * flow behind an opt-in most people would never find.
   */
  destination: 'marketplace' as SubmissionDestination,
  businessIds: [] as string[],
};

/**
 * The in-progress capture session.
 *
 * Zustand rather than route params: the media reference and the locked fix must
 * survive navigation between camera and review without being serialised into a
 * URL, and the review screen mutates them continuously as the reporter edits.
 */
export const useCaptureStore = create<CaptureState>((set) => ({
  ...DEFAULTS,
  // A new capture clears the old one's chosen frame. Carried over, it would
  // point at a moment of a recording that is no longer the one being filed.
  setPending: (pending) => set({ pending, posterAtMs: null }),
  setCategory: (category) => set({ category }),
  setDescription: (description) => set({ description }),
  setAnonymous: (isAnonymous) => set({ isAnonymous }),
  setSeverity: (severity) => set({ severity }),
  setLandmark: (landmark) => set({ landmark }),
  setPosterAtMs: (posterAtMs) => set({ posterAtMs }),
  setConsent: (key, value) => set((state) => ({ consent: { ...state.consent, [key]: value } })),
  setShowLocation: (showLocation) =>
    set((state) => ({
      showLocation,
      // Hiding the place while still publishing an exact time narrows a
      // reporter's whereabouts more than most people expect, so the two move
      // together rather than leaving a misleading half-private state.
      showTime: showLocation ? state.showTime : false,
    })),
  setShowDate: (showDate) =>
    // A bare time with no date is meaningless and still narrows the window,
    // so suppressing the date suppresses the time with it.
    set((state) => ({ showDate, showTime: showDate ? state.showTime : false })),
  setShowTime: (showTime) => set({ showTime }),
  setDestination: (destination) =>
    set((state) => ({
      destination,
      // Recipients only mean something for a directed submission; keeping a
      // stale list around would send the report somewhere unintended.
      businessIds: destination === 'directed' ? state.businessIds : [],
    })),
  setBusinessIds: (businessIds) => set({ businessIds }),
  reset: () => set(DEFAULTS),
}));
