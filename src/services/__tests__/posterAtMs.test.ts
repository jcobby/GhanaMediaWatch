import fs from 'fs';
import path from 'path';

/**
 * The thumbnail the reporter picked reaches every reader.
 *
 * The review screen lets a reporter choose which moment of their clip is its
 * thumbnail, because one second in often catches the phone still being raised.
 * That choice used to stay on the device. `POST /incidents` now accepts
 * `media.posterAtMs`, and the service cuts `posterUrl` at that point.
 */

const SRC = path.resolve(__dirname, '..', '..');

/** Comments stripped, so a rule cannot pass by matching the note about it. */
const code = (rel: string) =>
  fs
    .readFileSync(path.join(SRC, rel), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');

test('the create request carries the chosen frame, for a clip only', () => {
  const request = code('services/createRequest.ts');
  expect(request).toMatch(/posterAtMs: number \| null = null/);
  expect(request).toMatch(/meta\.mediaKind === 'video' && posterAtMs !== null \? \{ posterAtMs \}/);
});

test('the uploader sends what the reporter chose', () => {
  const uploader = code('services/uploader.ts');
  expect(uploader).toMatch(/findPosterChoice\(current\.id\)\?\.posterAtMs \?\? null/);
  expect(uploader).toMatch(/buildCreateRequest\(current, meta, posterAtMs\)/);
});

test('the wire type declares it', () => {
  expect(code('api/client.ts')).toMatch(/posterAtMs\?: number;/);
});
