import * as SQLite from 'expo-sqlite';
import { drizzle } from 'drizzle-orm/expo-sqlite';
import * as schema from './schema';

const DATABASE_NAME = 'ghanamediawatch.db';

/**
 * The local database handle.
 *
 * Opened synchronously at module load so the outbox is queryable on the first
 * frame — the queue badge and the outbox screen both read it during initial
 * render, and an async handle would make them flash empty first.
 */
const sqlite = SQLite.openDatabaseSync(DATABASE_NAME);

export const db = drizzle(sqlite, { schema });

/**
 * Creates the schema if it does not exist.
 *
 * Hand-written rather than generated because there is exactly one table and no
 * migration history yet; the moment a second version ships this is replaced by
 * drizzle-kit migrations and `migrate()`. Idempotent, so calling it on every
 * launch is safe.
 */
export function initialiseDatabase(): void {
  sqlite.execSync(`
    PRAGMA journal_mode = WAL;

    CREATE TABLE IF NOT EXISTS incidents (
      id TEXT PRIMARY KEY NOT NULL,
      client_id TEXT NOT NULL UNIQUE,
      server_id TEXT,
      upload_id TEXT,
      category TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      is_anonymous INTEGER NOT NULL DEFAULT 0,
      show_location INTEGER NOT NULL DEFAULT 1,
      show_date INTEGER NOT NULL DEFAULT 1,
      show_time INTEGER NOT NULL DEFAULT 1,
      show_address INTEGER NOT NULL DEFAULT 0,
      address TEXT,
      plus_code TEXT,
      severity TEXT NOT NULL DEFAULT 'concern',
      landmark TEXT,
      consent_json TEXT NOT NULL DEFAULT '{}',
      destination TEXT NOT NULL DEFAULT 'marketplace',
      directed_business_ids TEXT NOT NULL DEFAULT '[]',
      latitude TEXT,
      longitude TEXT,
      accuracy_m INTEGER,
      altitude INTEGER,
      heading INTEGER,
      speed INTEGER,
      location_confidence TEXT NOT NULL DEFAULT 'high',
      is_mocked INTEGER NOT NULL DEFAULT 0,
      captured_at_iso TEXT NOT NULL,
      captured_at_utc_offset_minutes INTEGER NOT NULL DEFAULT 0,
      device_uptime_ms INTEGER NOT NULL DEFAULT 0,
      media_kind TEXT NOT NULL,
      media_uri TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      byte_size INTEGER NOT NULL DEFAULT 0,
      duration_ms INTEGER,
      poster_at_ms INTEGER,
      width INTEGER,
      height INTEGER,
      sha256 TEXT,
      state TEXT NOT NULL DEFAULT 'draft',
      attempt_count INTEGER NOT NULL DEFAULT 0,
      last_error TEXT,
      last_error_code TEXT,
      next_retry_at INTEGER,
      bytes_uploaded INTEGER NOT NULL DEFAULT 0,
      chunk_size_bytes INTEGER,
      chunk_count INTEGER,
      received_chunks TEXT NOT NULL DEFAULT '[]',
      waiting_for_wifi INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
    );

    CREATE INDEX IF NOT EXISTS idx_incidents_state_created ON incidents (state, created_at);
    CREATE INDEX IF NOT EXISTS idx_incidents_next_retry ON incidents (next_retry_at);
  `);

  addMissingColumns();
}

/**
 * Brings an existing table up to the current schema.
 *
 * `CREATE TABLE IF NOT EXISTS` does nothing to a table that already exists, so
 * a column added after a build has shipped is missing on every device that
 * already ran the old one — and the failure is at insert time, on the reporter's
 * phone, after they have filmed something.
 *
 * Three columns had already drifted this way: `severity`, `landmark` and
 * `consent_json` were declared in `schema.ts` and written by `submitCapture`
 * while the DDL never created them. Nothing caught it because the schema and
 * the DDL are two hand-maintained lists that no test compared.
 *
 * Driven off `PRAGMA table_info` rather than a version number, so it is
 * idempotent and cannot double-apply.
 */
function addMissingColumns(): void {
  const existing = new Set(
    sqlite
      .getAllSync<{ name: string }>('PRAGMA table_info(incidents)')
      .map((column) => column.name),
  );

  // Every column added after the original DDL, with the definition it needs.
  // A default is required: these rows already exist and cannot be null-filled
  // into a NOT NULL column.
  const later: [string, string][] = [
    ['severity', "TEXT NOT NULL DEFAULT 'concern'"],
    ['landmark', 'TEXT'],
    ['consent_json', "TEXT NOT NULL DEFAULT '{}'"],
    ['destination', "TEXT NOT NULL DEFAULT 'marketplace'"],
    ['directed_business_ids', "TEXT NOT NULL DEFAULT '[]'"],
    ['poster_at_ms', 'INTEGER'],
    ['show_address', 'INTEGER NOT NULL DEFAULT 0'],
    ['address', 'TEXT'],
    ['plus_code', 'TEXT'],
  ];

  for (const [name, definition] of later) {
    if (existing.has(name)) continue;
    sqlite.execSync(`ALTER TABLE incidents ADD COLUMN ${name} ${definition};`);
  }
}

export { schema };
