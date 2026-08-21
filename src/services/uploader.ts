import { api } from '@/api';
import { ApiError } from '@/types/api';
import { incidentsRepository } from '@/db/incidentsRepository';
import type { OutboxRecord } from '@/features/outbox/outboxMachine';
import { remainingChunks, uploadedBytes } from './chunkPlan';
import { deleteMedia, fileExists, readChunk } from './media';
import { applyEvent, configureUploader } from './sync';

/**
 * Uploads one queued report, in the three phases the contract defines.
 *
 * Every step writes its outcome through the state machine before moving on, so
 * the app can be killed at any point and resume from the database on next
 * launch rather than starting the transfer over.
 */
async function uploadRecord(record: OutboxRecord): Promise<void> {
  const row = incidentsRepository.findById(record.id);
  if (!row) return;

  // The row survives; the file may not. A user clearing storage, or an OS
  // cleanup of a file that was never moved out of cache, leaves a record
  // pointing at nothing — which would otherwise retry forever against a
  // missing file.
  const mediaUri = mediaUriFor(record.id);
  if (!mediaUri || !fileExists(mediaUri)) {
    applyEvent(record, {
      type: 'UPLOAD_FAIL',
      message: 'The captured file is no longer on this device.',
      code: 'VALIDATION_FAILED',
      retryable: false,
    });
    return;
  }

  let current = record;

  try {
    // ── Phase 1: initialise, or recover an existing session ────────────────
    if (!current.uploadId) {
      const init = await api.createIncident(buildCreateRequest(current), current.clientId);
      current = applyEvent(current, {
        type: 'UPLOAD_INIT',
        uploadId: init.uploadId,
        chunkSizeBytes: init.chunkSizeBytes,
        chunkCount: init.chunkCount,
      });
    } else {
      // An upload was already started. Ask what the server holds rather than
      // assuming our local record is accurate — the app may have been killed
      // between sending a chunk and recording the acknowledgement.
      const status = await api.getUploadStatus(current.uploadId);
      current = applyEvent(current, {
        type: 'UPLOAD_INIT',
        uploadId: current.uploadId,
        chunkSizeBytes: status.chunkSizeBytes,
        chunkCount: status.chunkCount,
      });
      for (const index of status.receivedChunks) {
        current = applyEvent(current, {
          type: 'CHUNK_ACK',
          index,
          bytesUploaded: uploadedBytes(current.byteSize, status.chunkSizeBytes, [
            ...current.receivedChunks,
            index,
          ]),
        });
      }
    }

    const chunkSize = current.chunkSizeBytes;
    if (!chunkSize) throw new Error('Server did not supply a chunk size');

    // ── Phase 2: send what is missing ─────────────────────────────────────
    const pending = remainingChunks(current.byteSize, chunkSize, current.receivedChunks);

    for (const chunk of pending) {
      const bytes = readChunk(mediaUri, chunk.offset, chunk.length);
      await api.putChunk(current.uploadId!, chunk.index, bytes);

      const confirmed = [...current.receivedChunks, chunk.index];
      current = applyEvent(current, {
        type: 'CHUNK_ACK',
        index: chunk.index,
        // Recomputed from the confirmed set rather than accumulated, so a
        // re-sent chunk cannot push progress past the file size.
        bytesUploaded: uploadedBytes(current.byteSize, chunkSize, confirmed),
      });
    }

    // ── Phase 3: assemble and verify ──────────────────────────────────────
    const completed = await api.completeUpload(current.uploadId!);
    current = applyEvent(current, { type: 'UPLOAD_COMPLETE', serverId: completed.incidentId });

    // Only now is it safe to reclaim the space. The metadata row stays as the
    // reporter's history.
    deleteMedia(mediaUri);
  } catch (cause) {
    const error =
      cause instanceof ApiError
        ? cause
        : new ApiError({
            code: 'INTERNAL',
            status: 0,
            message: cause instanceof Error ? cause.message : 'Upload failed',
            retryable: true,
          });

    applyEvent(current, {
      type: 'UPLOAD_FAIL',
      message: error.message,
      code: error.code,
      // The server's classification decides whether this is worth retrying.
      // Getting it wrong either strands a report or retries a doomed one hourly
      // forever.
      retryable: error.retryable,
    });
  }
}

/**
 * The media path is not on OutboxRecord — the queue does not need it, and
 * keeping it off the record stops the state machine acquiring a filesystem
 * dependency. The repository is the one place that knows.
 */
function mediaUriFor(id: string): string | null {
  const record = incidentsRepository.findMediaUri(id);
  return record;
}

function buildCreateRequest(record: OutboxRecord) {
  const meta = incidentsRepository.findCaptureMetadata(record.id);
  if (!meta) throw new Error(`No capture metadata for ${record.id}`);
  return {
    clientId: record.clientId,
    category: record.category,
    description: record.description,
    isAnonymous: meta.isAnonymous,
    displayFlags: {
      showLocation: meta.showLocation,
      showDate: meta.showDate,
      showTime: meta.showTime,
    },
    location: {
      latitude: meta.latitude,
      longitude: meta.longitude,
      accuracyM: meta.accuracyM,
      altitude: meta.altitude,
      heading: meta.heading,
      speed: meta.speed,
      confidence: meta.locationConfidence,
      isMocked: meta.isMocked,
    },
    capturedAtIso: meta.capturedAtIso,
    capturedAtUtcOffsetMinutes: meta.capturedAtUtcOffsetMinutes,
    deviceUptimeMs: meta.deviceUptimeMs,
    media: {
      kind: meta.mediaKind,
      mimeType: meta.mimeType,
      byteSize: record.byteSize,
      ...(meta.durationMs !== null ? { durationMs: meta.durationMs } : {}),
      ...(meta.width !== null ? { width: meta.width } : {}),
      ...(meta.height !== null ? { height: meta.height } : {}),
      sha256: meta.sha256 ?? '',
    },
  };
}

/** Called once at boot to give the sync engine something to run. */
export function registerUploader(): void {
  configureUploader(uploadRecord);
}
