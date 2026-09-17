import { api } from '@/api';
import { ApiError } from '@/types/api';
import { incidentsRepository } from '@/db/incidentsRepository';
import type { OutboxRecord } from '@/features/outbox/outboxMachine';
import { buildCreateRequest } from './createRequest';
import { remainingChunks, uploadedBytes } from './chunkPlan';
import { deleteMedia, fileExists, readChunk } from './media';
import { applyEvent, configureUploader } from './sync';
import { toast } from '@/stores/toastStore';
import { queryClient } from '@/lib/queryClient';
import { queryKeys } from '@/hooks/useIncidents';
import { adoptLocalPoster } from '@/lib/videoPoster';
import i18n from '@/i18n';

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
      message: i18n.t('outbox.mediaGone'),
      code: 'VALIDATION_FAILED',
      retryable: false,
    });
    return;
  }

  /*
   * A row with no bytes in it.
   *
   * The file is present but empty, so the chunk planner produces no chunks,
   * nothing is sent, and completion fails with the server's own words —
   * "Upload is missing chunks" — which describes the symptom and names neither
   * the cause nor anything the reporter could do. It then retried on that
   * message indefinitely.
   *
   * New captures cannot reach this state: `submitCapture` refuses an empty file
   * outright. This is for the rows already queued before that check existed,
   * and it ends them rather than leaving them cycling.
   */
  if (record.byteSize === 0) {
    applyEvent(record, {
      type: 'UPLOAD_FAIL',
      message: i18n.t('outbox.mediaEmpty'),
      code: 'VALIDATION_FAILED',
      retryable: false,
    });
    return;
  }

  let current = record;

  try {
    // ── Phase 1: initialise, or recover an existing session ────────────────
    if (!current.uploadId) {
      const meta = incidentsRepository.findCaptureMetadata(current.id);
      if (!meta) throw new Error(`No capture metadata for ${current.id}`);
      /*
       * The reporter's chosen thumbnail travels with the report now, so the
       * service cuts every reader's poster at the second they picked rather
       * than at one second in.
       */
      const posterAtMs = incidentsRepository.findPosterChoice(current.id)?.posterAtMs ?? null;
      const init = await api.createIncident(
        buildCreateRequest(current, meta, posterAtMs),
        current.clientId,
      );
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

    /*
     * The moment the reporter has been waiting for, and it used to pass in
     * silence.
     *
     * Uploads finish in the background — minutes later, on a bus, after the
     * screen has moved on — so unless something says so the reporter's last
     * information is "Sending". They filmed something at some risk and were
     * never told it arrived.
     *
     * A toast, not a push notification: this fires while the app is open, and
     * a system notification for something happening on the screen in front of
     * you is noise. The queued row updates either way.
     */
    toast.success(i18n.t('outbox.sentTitle'), i18n.t('outbox.sentBody'));

    /*
     * The reporter's own list is now out of date.
     *
     * Without this the report they just filed does not appear under Profile →
     * Reports until the app is restarted: the queue row is dropped the moment
     * it uploads, and the cached page was fetched before the report existed. So
     * it left one screen and never arrived on the other, and there was nowhere
     * in the app that could answer "where did it go?".
     *
     * Marked stale rather than refetched here — the list refetches when
     * somebody actually looks at it, which on a phone that finished an upload
     * in the background may be much later, or never.
     */
    void queryClient.invalidateQueries({ queryKey: queryKeys.myIncidents() });

    /*
     * The reporter's chosen thumbnail, taken before the recording is deleted.
     *
     * This is the only moment the two things exist together: the report has a
     * server id at last, and its footage is still on the phone for another few
     * lines. Cutting the frame here costs nothing — no signed URL, no buffering
     * a remote file — where doing it later would mean downloading footage the
     * device just finished uploading.
     *
     * Awaited rather than left running, because the next line removes the file
     * it reads. It cannot fail the upload: the function swallows its own
     * errors, and a missing thumbnail is not a failed report.
     */
    const chosen = incidentsRepository.findPosterChoice(current.id);
    if (chosen?.mediaKind === 'video') {
      await adoptLocalPoster(completed.incidentId, mediaUri, chosen.posterAtMs);
    }

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

/** Called once at boot to give the sync engine something to run. */
export function registerUploader(): void {
  configureUploader(uploadRecord);
}
