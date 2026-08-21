import { nextRetryAt } from '@/services/backoff';
import type { ApiErrorCode, IncidentCategory } from '@/types/api';

/**
 * The outbox state machine.
 *
 * A pure reducer over a single queued report. It owns every legal transition,
 * so the sync engine never mutates a record directly — it computes the next
 * state here, persists the result, and moves on.
 *
 * Keeping it pure is what makes the queue testable: no SQLite, no network, no
 * timers. Given a record and an event, the next record is deterministic.
 */

export type OutboxState = 'draft' | 'queued' | 'uploading' | 'uploaded' | 'failed' | 'cancelled';

/** States that will never change again without user action. */
const TERMINAL: ReadonlySet<OutboxState> = new Set(['uploaded', 'cancelled']);

export interface OutboxRecord {
  id: string;
  /** Idempotency key. Survives retries so the server can dedupe replays. */
  clientId: string;
  serverId: string | null;
  uploadId: string | null;

  category: IncidentCategory;
  description: string;

  state: OutboxState;
  attemptCount: number;
  lastError: string | null;
  lastErrorCode: ApiErrorCode | null;
  /** Epoch ms. Null means eligible immediately. */
  nextRetryAt: number | null;

  bytesUploaded: number;
  byteSize: number;
  chunkSizeBytes: number | null;
  chunkCount: number | null;
  /** Indices the server has confirmed. Drives resumption after a crash. */
  receivedChunks: number[];

  /** Video deferred by the Wi-Fi-only setting. */
  waitingForWifi: boolean;

  createdAt: number;
  updatedAt: number;
}

export type OutboxEvent =
  | { type: 'QUEUE' }
  | { type: 'UPLOAD_INIT'; uploadId: string; chunkSizeBytes: number; chunkCount: number }
  | { type: 'CHUNK_ACK'; index: number; bytesUploaded: number }
  | { type: 'UPLOAD_COMPLETE'; serverId: string }
  | { type: 'UPLOAD_FAIL'; message: string; code: ApiErrorCode; retryable: boolean }
  | { type: 'RETRY' }
  | { type: 'CANCEL' }
  | { type: 'DEFER_WIFI' }
  | { type: 'WIFI_AVAILABLE' };

export interface ReduceOptions {
  now?: number;
  random?: () => number;
}

/**
 * Apply an event. Returns the same reference when the event is not legal in the
 * current state, so callers can skip a write.
 */
export function reduce(
  record: OutboxRecord,
  event: OutboxEvent,
  options: ReduceOptions = {},
): OutboxRecord {
  const now = options.now ?? Date.now();
  const random = options.random ?? Math.random;

  // Nothing reopens a terminal record. Without this guard a late-arriving
  // chunk acknowledgement could resurrect a report the user already cancelled.
  if (TERMINAL.has(record.state) && event.type !== 'RETRY') return record;

  const touch = (patch: Partial<OutboxRecord>): OutboxRecord => ({
    ...record,
    ...patch,
    updatedAt: now,
  });

  switch (event.type) {
    case 'QUEUE':
      if (record.state !== 'draft' && record.state !== 'failed') return record;
      return touch({ state: 'queued', nextRetryAt: null, lastError: null, lastErrorCode: null });

    case 'UPLOAD_INIT':
      if (record.state !== 'queued') return record;
      return touch({
        state: 'uploading',
        uploadId: event.uploadId,
        chunkSizeBytes: event.chunkSizeBytes,
        chunkCount: event.chunkCount,
      });

    case 'CHUNK_ACK': {
      if (record.state !== 'uploading') return record;
      // Chunks may be acknowledged more than once — a retry can re-send one the
      // server already holds — so the set must not grow duplicates.
      const received = record.receivedChunks.includes(event.index)
        ? record.receivedChunks
        : [...record.receivedChunks, event.index].sort((a, b) => a - b);
      return touch({
        receivedChunks: received,
        // Never let progress go backwards on a re-sent chunk; a bar that jumps
        // back reads as a failure even when the upload is healthy.
        bytesUploaded: Math.max(record.bytesUploaded, event.bytesUploaded),
      });
    }

    case 'UPLOAD_COMPLETE':
      if (record.state !== 'uploading') return record;
      return touch({
        state: 'uploaded',
        serverId: event.serverId,
        bytesUploaded: record.byteSize,
        lastError: null,
        lastErrorCode: null,
        nextRetryAt: null,
      });

    case 'UPLOAD_FAIL': {
      if (record.state !== 'uploading' && record.state !== 'queued') return record;
      const attemptCount = record.attemptCount + 1;
      return touch({
        state: 'failed',
        attemptCount,
        lastError: event.message,
        lastErrorCode: event.code,
        // A permanent failure gets no schedule at all. Retrying a 413 or a
        // rejected GPS fix hourly forever burns battery and data to no effect;
        // the user is told instead, and may retry by hand.
        nextRetryAt: event.retryable ? nextRetryAt(attemptCount, now, random) : null,
      });
    }

    case 'RETRY':
      if (record.state !== 'failed') return record;
      return touch({
        state: 'queued',
        nextRetryAt: null,
        lastError: null,
        lastErrorCode: null,
      });

    case 'CANCEL':
      return touch({ state: 'cancelled', nextRetryAt: null });

    case 'DEFER_WIFI':
      if (record.state !== 'queued') return record;
      return touch({ waitingForWifi: true });

    case 'WIFI_AVAILABLE':
      if (!record.waitingForWifi) return record;
      return touch({ waitingForWifi: false });

    default: {
      // Exhaustiveness: a new event type becomes a compile error here rather
      // than silently doing nothing at runtime.
      const never: never = event;
      return never;
    }
  }
}

// ─── selectors ─────────────────────────────────────────────────────────────

export function isTerminal(record: OutboxRecord): boolean {
  return TERMINAL.has(record.state);
}

/** A failed record with no schedule failed permanently and needs a human. */
export function needsManualRetry(record: OutboxRecord): boolean {
  return record.state === 'failed' && record.nextRetryAt === null;
}

export function progressRatio(record: OutboxRecord): number {
  if (record.state === 'uploaded') return 1;
  if (record.byteSize <= 0) return 0;
  return Math.min(1, Math.max(0, record.bytesUploaded / record.byteSize));
}

/**
 * The next record the engine should work on.
 *
 * Oldest first, and one at a time: a phone on a congested mobile connection
 * uploading three videos in parallel finishes all three later than it would
 * have finished them in sequence, and shows three stalled progress bars while
 * doing it.
 */
export function selectNextUploadable(
  records: readonly OutboxRecord[],
  options: { now?: number; hasWifi?: boolean } = {},
): OutboxRecord | null {
  const now = options.now ?? Date.now();
  const hasWifi = options.hasWifi ?? true;

  const eligible = records
    .filter((r) => r.state === 'queued' || (r.state === 'failed' && r.nextRetryAt !== null))
    .filter((r) => !(r.waitingForWifi && !hasWifi))
    .filter((r) => r.nextRetryAt === null || now >= r.nextRetryAt)
    .sort((a, b) => a.createdAt - b.createdAt);

  return eligible[0] ?? null;
}
