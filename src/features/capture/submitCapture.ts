import type { ConsentFlags, Severity } from '@/types/context';
import * as Crypto from 'expo-crypto';
import { incidentsRepository } from '@/db/incidentsRepository';
import { hashFile, fileSize, persistCapture } from '@/services/media';
import { drain } from '@/services/sync';
import { useOutboxStore } from '@/stores/outboxStore';
import type { PendingCapture } from '@/stores/captureStore';
import type { IncidentCategory } from '@/types/api';

export interface SubmitCaptureInput {
  clientId: string;
  capture: PendingCapture;
  category: IncidentCategory;
  description: string;
  isAnonymous: boolean;
  displayFlags: { showLocation: boolean; showDate: boolean; showTime: boolean };
  severity: Severity;
  landmark: string;
  consent: ConsentFlags;
}

/**
 * Commit a capture to the local queue.
 *
 * The order here is the whole offline-first guarantee: the media is moved into
 * permanent storage **before** the row is written, and the row is written
 * before anything touches the network. If the app dies at any point, the worst
 * outcome is an orphaned file — never a queued row pointing at media that was
 * never saved.
 *
 * Nothing in this function requires connectivity. It returns as soon as the
 * report is durably on disk; the sync engine picks it up whenever it can.
 */
export async function submitCapture(input: SubmitCaptureInput): Promise<string> {
  const { capture, clientId } = input;
  const id = Crypto.randomUUID();

  // Keyed off the kind rather than a two-way guess: an audio recording saved
  // as .jpg is playable by nothing, and the mismatch would not surface until
  // someone tried to open the evidence.
  const EXTENSION = { photo: 'jpg', video: 'mp4', audio: 'm4a' } as const;
  const extension = EXTENSION[capture.kind];
  const mediaUri = persistCapture(capture.uri, `${id}.${extension}`);

  const byteSize = fileSize(mediaUri);
  // Hashed here rather than at upload time: the file is guaranteed present now,
  // and the server verifies this value at completion to catch corruption in
  // transit.
  const sha256 = await hashFile(mediaUri);

  const now = Date.now();
  const { fix } = capture;

  incidentsRepository.insert({
    id,
    clientId,
    category: input.category,
    description: input.description,
    isAnonymous: input.isAnonymous,
    showLocation: input.displayFlags.showLocation,
    showDate: input.displayFlags.showDate,
    showTime: input.displayFlags.showTime,
    severity: input.severity,
    // Empty is stored as null so "not answered" and "answered blank" are the
    // same thing, which is what they mean here.
    landmark: input.landmark.trim() || null,
    consentJson: JSON.stringify(input.consent),

    // Stored at full precision regardless of the display flags — suppression is
    // a publishing decision, and the reporter may change it later.
    latitude: String(fix.latitude),
    longitude: String(fix.longitude),
    accuracyM: Math.round(fix.accuracyM),
    altitude: fix.altitude === null ? null : Math.round(fix.altitude),
    heading: fix.heading === null ? null : Math.round(fix.heading),
    speed: fix.speed === null ? null : Math.round(fix.speed),
    locationConfidence: capture.confidence,
    isMocked: fix.isMocked,

    capturedAtIso: fix.capturedAtIso,
    capturedAtUtcOffsetMinutes: fix.capturedAtUtcOffsetMinutes,
    // Tamper signal: a device clock inconsistent with its uptime is a strong
    // hint the capture time was fabricated.
    deviceUptimeMs: Math.round(now - (fix.timestamp - now)),

    mediaKind: capture.kind,
    mediaUri,
    mimeType: capture.mimeType,
    byteSize,
    durationMs: capture.durationMs,
    width: capture.width,
    height: capture.height,
    sha256,

    // Queued immediately. Nothing sits in `draft` — the review screen is the
    // draft stage, and it is behind the user by the time this runs.
    state: 'queued',
    createdAt: now,
    updatedAt: now,
  });

  useOutboxStore.getState().refresh();
  // Fire and forget: the report is already safe on disk, so a failure to drain
  // right now is not a failure to submit.
  void drain();

  return id;
}
