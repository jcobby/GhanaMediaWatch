import type { CaptureMetadata } from '@/db/incidentsRepository';
import type { OutboxRecord } from '@/features/outbox/outboxMachine';

/**
 * The submission payload.
 *
 * Takes the metadata rather than fetching it, so the shape of what leaves the
 * device can be asserted without a database. That matters here: four of the
 * reporter's own answers were silently absent from this object for as long as
 * it has existed, and nothing that touches a real SQLite file would have run
 * in a test to notice.
 */
export function buildCreateRequest(record: OutboxRecord, meta: CaptureMetadata) {
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
    /*
     * An unknown reading is an absent field, never an explicit null.
     *
     * `altitude`, `heading` and `speed` are optional in the server's schema and
     * not nullable, so a null is rejected outright: `Expected number, received
     * null`. A phone standing still reports no heading and no speed — which is
     * most captures — so every one of those submissions failed validation and
     * sat in the outbox as "Request validation failed".
     *
     * The same trap as `platformDeviceId` on device registration, and the same
     * answer: omitting the key says exactly what the null was trying to say,
     * and is what the server accepts.
     */
    location: {
      latitude: meta.latitude,
      longitude: meta.longitude,
      accuracyM: meta.accuracyM,
      ...(meta.altitude !== null ? { altitude: meta.altitude } : {}),
      ...(meta.heading !== null ? { heading: meta.heading } : {}),
      ...(meta.speed !== null ? { speed: meta.speed } : {}),
      confidence: meta.locationConfidence,
      isMocked: meta.isMocked,
    },
    /*
     * The reporter's own answers, which the server routes and pays on.
     *
     * All four were being collected by the review screen and then left behind:
     * the request went out with the footage and the category and none of the
     * decisions attached to it. `destination` in particular is what tells the
     * server whether to offer this to institutions at all — without it there is
     * nothing to route on, and no basis for a commission.
     */
    destination: meta.destination,
    /*
     * `requestedBusinessIds`, not `directedBusinessIds`.
     *
     * The spec says the latter and the running API accepts the former, and an
     * unknown key is dropped in silence — so a reporter who deliberately sent
     * footage to two named agencies would have it arrive addressed to nobody.
     * The wire name is what matters for the report to route; the naming needs
     * reconciling in the spec, not here.
     */
    ...(meta.destination === 'directed' ? { requestedBusinessIds: meta.directedBusinessIds } : {}),
    severity: meta.severity,
    ...(meta.landmark !== null ? { landmark: meta.landmark } : {}),
    consent: JSON.parse(meta.consentJson) as unknown,

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
