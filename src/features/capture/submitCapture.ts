import type { ConsentFlags, Severity } from '@/types/context';
import * as Crypto from 'expo-crypto';
import * as Device from 'expo-device';
import { incidentsRepository } from '@/db/incidentsRepository';
import { hashFile, fileSize, persistCapture } from '@/services/media';
import { drain } from '@/services/sync';
import { useOutboxStore } from '@/stores/outboxStore';
import type { PendingCapture } from '@/stores/captureStore';
import type { IncidentCategory } from '@/types/api';
import type { SubmissionDestination } from '@/types/dawuro';

/**
 * When this launch of the app began.
 *
 * The fallback for `deviceUptimeMs`, and a truthful one: the device has
 * certainly been up at least as long as the app has been running. A lower bound
 * is a usable tamper signal; a wrong number is not.
 */
const APP_STARTED_AT = Date.now();

/**
 * How long the device has been switched on, in milliseconds.
 *
 * **This was `Math.round(now - (fix.timestamp - now))`**, which simplifies to
 * `2 × now − timestamp`. For a fresh GPS fix `timestamp ≈ now`, so it evaluated
 * to *now* — an epoch value around 1.79 × 10¹², sent as a duration. Every report
 * this app has ever filed has claimed the phone had been switched on for about
 * fifty-six years.
 *
 * The field exists as a tamper signal: a device clock inconsistent with its
 * uptime is a strong hint the capture time was fabricated. A constant absurd
 * value is not a weak signal, it is a broken one — it can never agree with the
 * clock, so the check it feeds can never mean anything.
 *
 * `expo-device` measures the real thing. Where it cannot, the app's own run
 * time stands in: still a real duration, still a lower bound on the device's,
 * and never a timestamp.
 */
async function deviceUptimeMs(): Promise<number> {
  try {
    const uptime = await Device.getUptimeAsync();
    if (Number.isFinite(uptime) && uptime > 0) return Math.round(uptime);
  } catch {
    // Unsupported platform, or the module is unavailable. Fall through.
  }
  return Math.max(0, Date.now() - APP_STARTED_AT);
}

export interface SubmitCaptureInput {
  clientId: string;
  capture: PendingCapture;
  category: IncidentCategory;
  description: string;
  isAnonymous: boolean;
  displayFlags: { showLocation: boolean; showAddress: boolean; showDate: boolean; showTime: boolean };
  /**
   * The place in words, as the review screen resolved it. Null parts were not
   * found; the plus code is null only for a fix with no usable coordinates.
   */
  place: { address: string | null; plusCode: string | null };
  severity: Severity;
  landmark: string;
  /** The frame the reporter picked as the thumbnail, or null for the default. */
  posterAtMs?: number | null;
  consent: ConsentFlags;
  /** Public feed, marketplace, named institutions, or both. */
  destination: SubmissionDestination;
  /** Institutions named for a `directed` submission. Empty otherwise. */
  directedBusinessIds: string[];
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

  /*
   * An empty file is not a report.
   *
   * It happens when the camera hands back a URI for a recording that never
   * wrote — a permission revoked mid-capture, storage full, the app killed
   * during the stop. Queueing it produced the outbox row nobody could explain:
   * "0 KB", three attempts, "Upload is missing chunks" — because there were no
   * chunks to send, and no message anywhere said so.
   *
   * Refused here, while the reporter is still standing there and can film it
   * again, rather than failing silently on a bus an hour later.
   */
  if (byteSize === 0) {
    throw new Error('EMPTY_CAPTURE');
  }

  // Hashed here rather than at upload time: the file is guaranteed present now,
  // and the server verifies this value at completion to catch corruption in
  // transit.
  const sha256 = await hashFile(mediaUri);

  // Read now rather than at upload: it belongs to the moment of filing, and the
  // row may sit in the outbox for hours before it is sent.
  const uptimeMs = await deviceUptimeMs();

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
    showAddress: input.displayFlags.showLocation && input.displayFlags.showAddress,
    // Recorded whatever the flags say, like the fix itself: publishing is a separate decision.
    address: input.place.address,
    plusCode: input.place.plusCode,
    severity: input.severity,
    // Empty is stored as null so "not answered" and "answered blank" are the
    // same thing, which is what they mean here.
    landmark: input.landmark.trim() || null,
    consentJson: JSON.stringify(input.consent),

    // The reporter's routing decision travels with the report from here on.
    destination: input.destination,
    // Only meaningful for a directed submission; stored empty otherwise so the
    // column never holds a stale list from a changed mind.
    directedBusinessIds: JSON.stringify(
      input.destination === 'directed' ? input.directedBusinessIds : [],
    ),

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
    // hint the capture time was fabricated. See `deviceUptimeMs` — this used to
    // send an epoch timestamp in a field measured in elapsed milliseconds.
    deviceUptimeMs: uptimeMs,

    mediaKind: capture.kind,
    mediaUri,
    mimeType: capture.mimeType,
    byteSize,
    durationMs: capture.durationMs,
    /*
     * Only for footage. A photograph is its own thumbnail, so a chosen frame on
     * one would be a number nothing will ever read.
     */
    posterAtMs: capture.kind === 'video' ? (input.posterAtMs ?? null) : null,
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
