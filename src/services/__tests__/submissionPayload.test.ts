import { buildCreateRequest } from '../createRequest';
import type { CaptureMetadata } from '@/db/incidentsRepository';
import type { OutboxRecord } from '@/features/outbox/outboxMachine';

/**
 * What actually leaves the phone.
 *
 * The review screen asks the reporter four questions that decide what happens
 * to their report — where it goes, how urgent it is, what landmark identifies
 * it, what consent applies — and for a long time the answers went no further
 * than that screen. The request carried the footage, the category and the
 * location, and none of the decisions.
 *
 * `destination` is the one that matters most. It is what tells the server
 * whether to offer the report to institutions at all, and therefore whether
 * the reporter is paid. Without it there is nothing to route on, and a report
 * a reporter deliberately directed to two named agencies arrives looking
 * exactly like one they threw at the public feed.
 *
 * These assertions are about the shape of the payload, not about the upload,
 * which is why `buildCreateRequest` takes its metadata as an argument.
 */

const record = {
  id: 'inc_local_1',
  clientId: 'client-1',
  category: 'flood',
  description: 'Culvert blocked at the junction.',
  byteSize: 2_400_000,
} as unknown as OutboxRecord;

const base: CaptureMetadata = {
  isAnonymous: false,
  showLocation: true,
  showDate: true,
  showTime: true,
  severity: 'urgent',
  landmark: 'Beside the Kaneshie overpass',
  consentJson: '{"publicPlace":true}',
  destination: 'marketplace',
  directedBusinessIds: [],
  latitude: 5.5731,
  longitude: -0.2325,
  accuracyM: 8,
  altitude: null,
  heading: null,
  speed: null,
  locationConfidence: 'high',
  isMocked: false,
  capturedAtIso: '2026-09-02T09:00:00.000Z',
  capturedAtUtcOffsetMinutes: 0,
  deviceUptimeMs: 1000,
  mediaKind: 'video',
  mimeType: 'video/mp4',
  durationMs: 12_000,
  width: 1080,
  height: 1920,
  sha256: 'abc123',
} as CaptureMetadata;

test("the reporter's routing choice reaches the server", () => {
  const request = buildCreateRequest(record, base) as Record<string, unknown>;
  expect(request.destination).toBe('marketplace');
});

test('a directed submission carries the institutions it names', () => {
  const directed = {
    ...base,
    destination: 'directed',
    directedBusinessIds: ['biz_ama', 'biz_ecg'],
  };
  const request = buildCreateRequest(record, directed) as Record<string, unknown>;

  expect(request.destination).toBe('directed');
  /*
   * `requestedBusinessIds` is the wire name the running API accepts; the spec
   * calls the same field `directedBusinessIds`. Asserted on the wire name
   * because that is what decides whether the report reaches the two agencies
   * the reporter chose — an unknown key is dropped without complaint.
   */
  expect(request.requestedBusinessIds).toEqual(['biz_ama', 'biz_ecg']);
});

test('a public submission names no institutions at all', () => {
  /*
   * Not merely an empty list — the key is absent. A `public` report must never
   * be offered to institutions, and sending a recipient list with it invites a
   * server to route on one anyway.
   */
  const pub = { ...base, destination: 'public', directedBusinessIds: ['biz_ama'] };
  const request = buildCreateRequest(record, pub) as Record<string, unknown>;

  expect(request.destination).toBe('public');
  expect('requestedBusinessIds' in request).toBe(false);
  expect('directedBusinessIds' in request).toBe(false);
});

test("the reporter's other answers travel with it", () => {
  const request = buildCreateRequest(record, base) as Record<string, unknown>;

  expect(request.severity).toBe('urgent');
  expect(request.landmark).toBe('Beside the Kaneshie overpass');
  expect(request.consent).toEqual({ publicPlace: true });
});

test('an unanswered landmark is omitted rather than sent empty', () => {
  // Absence and a blank string mean different things to a server deciding
  // whether a human wrote anything.
  const request = buildCreateRequest(record, { ...base, landmark: null }) as Record<
    string,
    unknown
  >;
  expect('landmark' in request).toBe(false);
});

/** Every path in the payload whose value is explicitly null. */
function nullPaths(value: unknown, path = ''): string[] {
  if (value === null) return [path || '(root)'];
  if (Array.isArray(value)) return value.flatMap((v, i) => nullPaths(v, `${path}[${i}]`));
  if (typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>).flatMap(([k, v]) =>
      nullPaths(v, path ? `${path}.${k}` : k),
    );
  }
  return [];
}

test('nothing in the payload is an explicit null', () => {
  /*
   * The rule the whole submission path kept breaking.
   *
   * The server's optional fields are optional, not nullable: it answers a null
   * with `Expected number, received null` and rejects the entire report. So
   * "unknown" has to be sent as an absent key, never as a null.
   *
   * `heading` and `speed` are the ones that bit. A phone held still reports
   * neither, which is most captures — so nearly every real submission failed
   * validation and sat in the outbox saying "Request validation failed", with
   * nothing to say which field was wrong.
   *
   * Checked across the whole object rather than field by field, because the
   * next field to be added is the one nobody will think to test.
   */
  const request = buildCreateRequest(record, base);
  expect(nullPaths(request)).toEqual([]);
});

test('the null scan can actually see a null', () => {
  // Otherwise the assertion above passes by never looking anywhere.
  expect(nullPaths({ a: { b: [1, null] }, c: null })).toEqual(['a.b[1]', 'c']);
});

test('a known reading is still sent', () => {
  /*
   * The opposite failure: dropping the fields entirely would also produce no
   * nulls, and would quietly discard a real altitude — which for a flood report
   * is evidence, not decoration.
   */
  const request = buildCreateRequest(record, {
    ...base,
    altitude: 61,
    heading: 180,
    speed: 3,
  }) as { location: Record<string, unknown> };

  expect(request.location.altitude).toBe(61);
  expect(request.location.heading).toBe(180);
  expect(request.location.speed).toBe(3);
});

test('an unknown reading leaves the key out', () => {
  const request = buildCreateRequest(record, base) as { location: Record<string, unknown> };

  expect('altitude' in request.location).toBe(false);
  expect('heading' in request.location).toBe(false);
  expect('speed' in request.location).toBe(false);
  // The fields that are always known stay put.
  expect(request.location.latitude).toBe(5.5731);
  expect(request.location.accuracyM).toBe(8);
});

test('the payload still carries what it always did', () => {
  // The additions must not have displaced anything. A guard against a merge
  // that "fixes" this file by replacing the object rather than extending it.
  const request = buildCreateRequest(record, base) as Record<string, unknown>;

  expect(request.clientId).toBe('client-1');
  expect(request.category).toBe('flood');
  expect(request.description).toBe('Culvert blocked at the junction.');
  expect(request.capturedAtIso).toBe('2026-09-02T09:00:00.000Z');
  expect((request.location as { latitude: number }).latitude).toBe(5.5731);
  expect((request.media as { sha256: string }).sha256).toBe('abc123');
});
