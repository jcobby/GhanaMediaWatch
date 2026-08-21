import { sql } from 'drizzle-orm';
import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

/**
 * The local incident table — the app's source of truth until the server
 * confirms an upload.
 *
 * Capture writes here *before* anything touches the network, and the row
 * outlives the upload: once the media file is deleted, this row remains as the
 * reporter's personal history with its `serverId` attached.
 *
 * Columns are flat rather than nested JSON so the queue can be indexed and
 * queried — "the oldest queued item that is due" has to be a cheap query, and
 * it runs on every connectivity change.
 */
export const incidents = sqliteTable(
  'incidents',
  {
    /** Local primary key. Distinct from the server's id, which arrives later. */
    id: text('id').primaryKey(),
    /** Idempotency key. Sent on every retry so the server dedupes replays. */
    clientId: text('client_id').notNull().unique(),
    serverId: text('server_id'),
    uploadId: text('upload_id'),

    category: text('category').notNull(),
    description: text('description').notNull().default(''),
    isAnonymous: integer('is_anonymous', { mode: 'boolean' }).notNull().default(false),

    // Display flags. Stored true here regardless — suppression is a publishing
    // decision, and the reporter can change it later.
    showLocation: integer('show_location', { mode: 'boolean' }).notNull().default(true),
    showDate: integer('show_date', { mode: 'boolean' }).notNull().default(true),
    showTime: integer('show_time', { mode: 'boolean' }).notNull().default(true),

    // The fix, locked at the moment of capture and never updated afterwards.
    latitude: text('latitude'),
    longitude: text('longitude'),
    accuracyM: integer('accuracy_m'),
    altitude: integer('altitude'),
    heading: integer('heading'),
    speed: integer('speed'),
    locationConfidence: text('location_confidence').notNull().default('high'),
    isMocked: integer('is_mocked', { mode: 'boolean' }).notNull().default(false),

    // Tamper signals. Device clock, its offset, and uptime together let the
    // server spot a fabricated capture time.
    capturedAtIso: text('captured_at_iso').notNull(),
    capturedAtUtcOffsetMinutes: integer('captured_at_utc_offset_minutes').notNull().default(0),
    deviceUptimeMs: integer('device_uptime_ms').notNull().default(0),

    mediaKind: text('media_kind').notNull(),
    /** Absolute file:// path under documentDirectory, never the cache. */
    mediaUri: text('media_uri').notNull(),
    mimeType: text('mime_type').notNull(),
    byteSize: integer('byte_size').notNull().default(0),
    durationMs: integer('duration_ms'),
    width: integer('width'),
    height: integer('height'),
    /** Verified server-side at completion; a mismatch forces a re-upload. */
    sha256: text('sha256'),

    state: text('state').notNull().default('draft'),
    attemptCount: integer('attempt_count').notNull().default(0),
    lastError: text('last_error'),
    lastErrorCode: text('last_error_code'),
    nextRetryAt: integer('next_retry_at'),
    bytesUploaded: integer('bytes_uploaded').notNull().default(0),

    chunkSizeBytes: integer('chunk_size_bytes'),
    chunkCount: integer('chunk_count'),
    /** JSON array of confirmed chunk indices, for resumption after a crash. */
    receivedChunks: text('received_chunks').notNull().default('[]'),

    waitingForWifi: integer('waiting_for_wifi', { mode: 'boolean' }).notNull().default(false),

    createdAt: integer('created_at')
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
    updatedAt: integer('updated_at')
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  (table) => [
    // The drain query filters on state and orders by age; without this index it
    // is a full scan on every connectivity change.
    index('idx_incidents_state_created').on(table.state, table.createdAt),
    index('idx_incidents_next_retry').on(table.nextRetryAt),
  ],
);

export type IncidentRow = typeof incidents.$inferSelect;
export type NewIncidentRow = typeof incidents.$inferInsert;
