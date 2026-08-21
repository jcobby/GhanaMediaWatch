/**
 * Chunk arithmetic for resumable uploads.
 *
 * Pure and dependency-free so the plan can be unit-tested without a file, a
 * network, or a device. Off-by-one errors here corrupt evidence rather than
 * merely breaking a screen, so it is worth testing exhaustively.
 */

export interface Chunk {
  /** 0-based, matching `PUT /uploads/{id}/chunks/{index}`. */
  index: number;
  /** Byte offset into the source file. */
  offset: number;
  /** Bytes in this chunk. The final chunk is usually shorter. */
  length: number;
}

/** Number of chunks a file of `byteSize` splits into. */
export function chunkCount(byteSize: number, chunkSizeBytes: number): number {
  if (byteSize <= 0 || chunkSizeBytes <= 0) return 0;
  return Math.ceil(byteSize / chunkSizeBytes);
}

/** The full plan, in order. */
export function planChunks(byteSize: number, chunkSizeBytes: number): Chunk[] {
  const count = chunkCount(byteSize, chunkSizeBytes);
  const chunks: Chunk[] = [];
  for (let index = 0; index < count; index++) {
    const offset = index * chunkSizeBytes;
    chunks.push({
      index,
      offset,
      // The last chunk is the remainder, never a full-size read past EOF.
      length: Math.min(chunkSizeBytes, byteSize - offset),
    });
  }
  return chunks;
}

/**
 * The chunks still to send.
 *
 * `received` comes from the server via `GET /uploads/{id}`, which is what makes
 * an interrupted upload resume instead of restarting. A 60 s video on a dropped
 * connection would otherwise re-send everything on every attempt and never
 * finish.
 */
export function remainingChunks(
  byteSize: number,
  chunkSizeBytes: number,
  received: readonly number[],
): Chunk[] {
  const done = new Set(received);
  return planChunks(byteSize, chunkSizeBytes).filter((c) => !done.has(c.index));
}

/**
 * Bytes confirmed by the server.
 *
 * Computed from the acknowledged indices rather than accumulated as we go —
 * an accumulator drifts when a chunk is re-sent after a retry, and the progress
 * bar ends up reporting more than the file contains.
 */
export function uploadedBytes(
  byteSize: number,
  chunkSizeBytes: number,
  received: readonly number[],
): number {
  const plan = planChunks(byteSize, chunkSizeBytes);
  const done = new Set(received);
  return plan.filter((c) => done.has(c.index)).reduce((sum, c) => sum + c.length, 0);
}
