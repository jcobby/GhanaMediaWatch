import { asc, eq, inArray, ne } from 'drizzle-orm';
import { db } from './client';
import { incidents, type IncidentRow, type NewIncidentRow } from './schema';
import type { OutboxRecord, OutboxState } from '@/features/outbox/outboxMachine';
import type { ApiErrorCode, IncidentCategory } from '@/types/api';

/**
 * The only module that touches the incidents table.
 *
 * Everything above it works with `OutboxRecord`, a plain object; everything
 * below is SQLite columns. Keeping the translation in one place means the state
 * machine never learns that `receivedChunks` is stored as a JSON string, and
 * the schema can change without rippling into the queue logic.
 */

function parseChunks(raw: string): number[] {
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((n): n is number => typeof n === 'number') : [];
  } catch {
    // A corrupt value must not strand the record — resuming from zero is worse
    // than losing progress, but far better than a permanently unreadable row.
    return [];
  }
}

export function toRecord(row: IncidentRow): OutboxRecord {
  return {
    id: row.id,
    clientId: row.clientId,
    serverId: row.serverId,
    uploadId: row.uploadId,
    category: row.category as IncidentCategory,
    description: row.description,
    state: row.state as OutboxState,
    attemptCount: row.attemptCount,
    lastError: row.lastError,
    lastErrorCode: row.lastErrorCode as ApiErrorCode | null,
    nextRetryAt: row.nextRetryAt,
    bytesUploaded: row.bytesUploaded,
    byteSize: row.byteSize,
    chunkSizeBytes: row.chunkSizeBytes,
    chunkCount: row.chunkCount,
    receivedChunks: parseChunks(row.receivedChunks),
    waitingForWifi: row.waitingForWifi,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/** The subset of a record the queue is allowed to write back. */
function toRowPatch(record: OutboxRecord): Partial<NewIncidentRow> {
  return {
    serverId: record.serverId,
    uploadId: record.uploadId,
    state: record.state,
    attemptCount: record.attemptCount,
    lastError: record.lastError,
    lastErrorCode: record.lastErrorCode,
    nextRetryAt: record.nextRetryAt,
    bytesUploaded: record.bytesUploaded,
    chunkSizeBytes: record.chunkSizeBytes,
    chunkCount: record.chunkCount,
    receivedChunks: JSON.stringify(record.receivedChunks),
    waitingForWifi: record.waitingForWifi,
    updatedAt: record.updatedAt,
  };
}

/** JSON list of institution ids, defensively parsed. */
function parseIds(raw: string): string[] {
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : [];
  } catch {
    return [];
  }
}

export interface CaptureMetadata {
  isAnonymous: boolean;
  showLocation: boolean;
  showDate: boolean;
  showTime: boolean;
  showAddress: boolean;
  address: string | null;
  plusCode: string | null;
  severity: string;
  landmark: string | null;
  consentJson: string;
  destination: string;
  /** Parsed on the way out — callers want the list, not the JSON. */
  directedBusinessIds: string[];
  latitude: number | null;
  longitude: number | null;
  accuracyM: number;
  altitude: number | null;
  heading: number | null;
  speed: number | null;
  locationConfidence: 'high' | 'low';
  isMocked: boolean;
  capturedAtIso: string;
  capturedAtUtcOffsetMinutes: number;
  deviceUptimeMs: number;
  mediaKind: 'photo' | 'video';
  mimeType: string;
  durationMs: number | null;
  width: number | null;
  height: number | null;
  sha256: string | null;
}

export const incidentsRepository = {
  insert(row: NewIncidentRow): void {
    db.insert(incidents).values(row).run();
  },

  /** Persists a record the state machine has already transitioned. */
  save(record: OutboxRecord): void {
    db.update(incidents).set(toRowPatch(record)).where(eq(incidents.id, record.id)).run();
  },

  findById(id: string): OutboxRecord | null {
    const row = db.select().from(incidents).where(eq(incidents.id, id)).get();
    return row ? toRecord(row) : null;
  },

  /**
   * Everything still in flight, oldest first.
   *
   * Cancelled rows are excluded but uploaded ones are kept: the reporter's own
   * history is built from the same table, and deleting on success would erase it.
   */
  listPending(): OutboxRecord[] {
    return db
      .select()
      .from(incidents)
      .where(inArray(incidents.state, ['draft', 'queued', 'uploading', 'failed']))
      .orderBy(asc(incidents.createdAt))
      .all()
      .map(toRecord);
  },

  listAll(): OutboxRecord[] {
    return db
      .select()
      .from(incidents)
      .where(ne(incidents.state, 'cancelled'))
      .orderBy(asc(incidents.createdAt))
      .all()
      .map(toRecord);
  },

  /** Rows whose media file may be deleted — the server holds them now. */
  listUploaded(): OutboxRecord[] {
    return db.select().from(incidents).where(eq(incidents.state, 'uploaded')).all().map(toRecord);
  },

  /** The badge count on the Outbox tab. */
  countPending(): number {
    return db
      .select()
      .from(incidents)
      .where(inArray(incidents.state, ['draft', 'queued', 'uploading', 'failed']))
      .all().length;
  },

  /**
   * The media path, kept off `OutboxRecord` deliberately.
   *
   * The queue does not need it, and leaving it out stops the state machine
   * acquiring a filesystem dependency — the reducer stays pure and testable.
   */
  findMediaUri(id: string): string | null {
    const row = db
      .select({ mediaUri: incidents.mediaUri })
      .from(incidents)
      .where(eq(incidents.id, id))
      .get();
    return row?.mediaUri ?? null;
  },

  /**
   * The frame the reporter chose as this report's thumbnail, if they chose one.
   *
   * Its own lookup rather than a field on `CaptureMetadata`, which is defined as
   * what the create-incident call needs — and this is read at the *end* of an
   * upload, after the file has been assembled, by which point that object is
   * long out of scope. A resumed upload never builds one at all.
   */
  findPosterChoice(id: string): { mediaKind: string; posterAtMs: number | null } | null {
    const row = db
      .select({ mediaKind: incidents.mediaKind, posterAtMs: incidents.posterAtMs })
      .from(incidents)
      .where(eq(incidents.id, id))
      .get();
    return row ? { mediaKind: row.mediaKind, posterAtMs: row.posterAtMs ?? null } : null;
  },

  /** Everything the create-incident call needs that the queue does not carry. */
  findCaptureMetadata(id: string): CaptureMetadata | null {
    const row = db.select().from(incidents).where(eq(incidents.id, id)).get();
    if (!row) return null;
    return {
      isAnonymous: row.isAnonymous,
      showLocation: row.showLocation,
      showDate: row.showDate,
      showTime: row.showTime,
      showAddress: row.showAddress,
      address: row.address,
      plusCode: row.plusCode,
      severity: row.severity,
      landmark: row.landmark,
      consentJson: row.consentJson,
      destination: row.destination,
      // Tolerant of a malformed value: a report that cannot be parsed should
      // still upload as an undirected one rather than fail to upload at all.
      directedBusinessIds: parseIds(row.directedBusinessIds),
      latitude: row.latitude === null ? null : Number(row.latitude),
      longitude: row.longitude === null ? null : Number(row.longitude),
      accuracyM: row.accuracyM ?? 0,
      altitude: row.altitude,
      heading: row.heading,
      speed: row.speed,
      locationConfidence: row.locationConfidence === 'low' ? 'low' : 'high',
      isMocked: row.isMocked,
      capturedAtIso: row.capturedAtIso,
      capturedAtUtcOffsetMinutes: row.capturedAtUtcOffsetMinutes,
      deviceUptimeMs: row.deviceUptimeMs,
      mediaKind: row.mediaKind === 'video' ? 'video' : 'photo',
      mimeType: row.mimeType,
      durationMs: row.durationMs,
      width: row.width,
      height: row.height,
      sha256: row.sha256,
    };
  },

  remove(id: string): void {
    db.delete(incidents).where(eq(incidents.id, id)).run();
  },

  /**
   * Clears a stale `uploading` state left behind by a crash or a force-quit.
   *
   * Nothing else will ever move those rows: the engine only picks up `queued`
   * and due `failed` records, so without this a report killed mid-upload would
   * sit in the queue forever showing a frozen progress bar.
   */
  recoverInterrupted(now: number = Date.now()): number {
    const stuck = db.select().from(incidents).where(eq(incidents.state, 'uploading')).all();
    for (const row of stuck) {
      db.update(incidents)
        .set({ state: 'queued', nextRetryAt: null, updatedAt: now })
        .where(eq(incidents.id, row.id))
        .run();
    }
    return stuck.length;
  },
};
