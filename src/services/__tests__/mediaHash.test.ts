import fs from 'fs';
import path from 'path';
import { createHash } from 'crypto';
import { bytesToHex } from '../media';

/**
 * The digest the server checks the footage against.
 *
 * `POST /uploads/{id}/complete` recomputes SHA-256 over the bytes it received
 * and compares. `hashFile` used to concatenate the file's windows as base64 and
 * hash *that string*, which is the digest of the base64 text — a different
 * value from the digest of the file, for every file. Footage that arrived
 * perfectly intact would have been rejected as corrupt at the last step.
 *
 * The mistake is invisible from inside the app: the value is 64 hex characters,
 * it passes the create call's format check, and it is stable across runs. Only
 * the server ever disagrees, and only at the very end of an upload.
 */

/** Node's own SHA-256, standing in for what the server computes. */
function sha256Hex(bytes: Uint8Array): string {
  return createHash('sha256').update(Buffer.from(bytes)).digest('hex');
}

/**
 * The body of `hashFile`, alone.
 *
 * Line endings are normalised first. This is a Windows checkout and git is
 * configured to write CRLF, under which a search for "\n}\n" finds nothing —
 * the slice then collapses to a single character, and assertions of the form
 * `not.toMatch` pass against it while proving nothing at all. Found by a probe
 * that happened to rewrite the file with CRLF endings.
 */
function hashFileSource(): string {
  const src = fs
    .readFileSync(path.resolve(__dirname, '../media.ts'), 'utf8')
    .replace(/\r\n/g, '\n');
  const body = src.slice(src.indexOf('export async function hashFile'));
  return body.slice(0, body.indexOf('\n}\n') + 2);
}

const SAMPLE = new Uint8Array([0xde, 0xad, 0xbe, 0xef, 0x00, 0x01, 0x7f, 0x80, 0xff]);

test('hex encoding is lowercase and zero-padded', () => {
  /*
   * `toString(16)` drops the leading zero on any byte below 0x10, which would
   * shorten the digest and shift every character after it. The result still
   * looks like a hash.
   */
  expect(bytesToHex(SAMPLE)).toBe('deadbeef00017f80ff');
});

test('a 32-byte digest encodes to exactly 64 characters', () => {
  // The server's format check. A short digest fails it; a long one is not a
  // digest at all.
  const digest = new Uint8Array(32).fill(0x0a);
  expect(bytesToHex(digest)).toHaveLength(64);
  expect(bytesToHex(digest)).toMatch(/^[0-9a-f]{64}$/);
});

test('an all-zero digest keeps its full width', () => {
  // The case padding gets wrong most dramatically: without it this collapses
  // from 64 characters to zero.
  expect(bytesToHex(new Uint8Array(32))).toBe('0'.repeat(64));
});

test('hashing bytes and hashing their base64 text give different answers', () => {
  /*
   * The whole bug in one assertion. If these were ever equal the old
   * implementation would have been harmless, and this file would be pointless.
   */
  const raw = sha256Hex(SAMPLE);
  const asBase64Text = sha256Hex(new TextEncoder().encode(Buffer.from(SAMPLE).toString('base64')));
  expect(raw).not.toBe(asBase64Text);
});

test('hashFile digests the file, not a rendering of it', () => {
  /*
   * Asserted against the source because the function needs a real file handle
   * and a native digest, neither of which exists under Jest.
   *
   * What matters is which call is used: `digest` takes bytes, while
   * `digestStringAsync` takes a string and would silently hash whatever text
   * was handed to it. The presence of `digestStringAsync` anywhere in this file
   * is the regression.
   */
  const fn = hashFileSource();

  expect(fn).toMatch(/Crypto\.digest\(/);
  expect(fn).not.toMatch(/digestStringAsync/);
  expect(fn).not.toMatch(/bytesToBase64/);
});

test('the slice under test is the whole function and nothing else', () => {
  /*
   * The assertions above are mostly `not.toMatch`, which an empty or truncated
   * slice satisfies without reading a line of the code they claim to check.
   * This is what stops them being vacuous, so it checks both ends: the opening
   * read and the closing handle release have to be inside the window, and
   * `bytesToHex` — the next function down — has to be outside it.
   */
  const fn = hashFileSource();

  expect(fn).toContain('hashFile');
  expect(fn).toContain('readBytes');
  expect(fn).toContain('handle.close()');
  expect(fn).not.toContain('export function bytesToHex');
  expect(fn.length).toBeGreaterThan(200);
});

test('an empty file still hashes to nothing rather than throwing', () => {
  /*
   * `hashFile` returns '' at size zero, and the create call is refused for it —
   * which is correct, but it must be refused before the row is queued rather
   * than by throwing here. Kept as a statement of the contract the outbox
   * depends on.
   */
  const src = fs.readFileSync(path.resolve(__dirname, '../media.ts'), 'utf8');
  expect(src).toMatch(/if \(size === 0\) return '';/);
});
