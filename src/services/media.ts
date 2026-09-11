import { Directory, File, Paths } from 'expo-file-system';
import * as Crypto from 'expo-crypto';
import { MEDIA_DIRECTORY } from '@/lib/constants';

/**
 * Local media storage for captured incidents.
 *
 * Everything lives under the **document** directory, never the cache. The OS
 * evicts the cache directory under storage pressure without warning, and losing
 * a reporter's only copy of an incident before it uploads is unacceptable —
 * that footage may be the sole record of what happened.
 */

function incidentsDirectory(): Directory {
  return new Directory(Paths.document, MEDIA_DIRECTORY);
}

export function ensureMediaDirectory(): void {
  const dir = incidentsDirectory();
  if (!dir.exists) dir.create({ intermediates: true });
}

/**
 * Move a freshly captured file into permanent storage.
 *
 * Camera output lands in the cache directory, so this is a move rather than a
 * copy — leaving the original behind doubles the storage a capture consumes
 * until the OS decides to reclaim it.
 */
export function persistCapture(sourceUri: string, filename: string): string {
  ensureMediaDirectory();
  const source = new File(sourceUri);
  const destination = new File(incidentsDirectory(), filename);
  source.move(destination);
  return destination.uri;
}

export function fileSize(uri: string): number {
  const file = new File(uri);
  return file.exists ? file.size : 0;
}

export function fileExists(uri: string): boolean {
  return new File(uri).exists;
}

/**
 * Read one slice of a file as bytes.
 *
 * A handle with an explicit offset rather than reading the whole file and
 * slicing in JS: a 60-second video is tens of megabytes, and materialising it
 * in the JS heap to send 5 MiB of it would spike memory and can crash the app
 * on a low-end device.
 */
export function readChunk(uri: string, offset: number, length: number): Uint8Array {
  const handle = new File(uri).open();
  try {
    handle.offset = offset;
    return handle.readBytes(length);
  } finally {
    // A leaked handle keeps the file descriptor open; on Android a few hundred
    // of those exhaust the process limit.
    handle.close();
  }
}

/**
 * SHA-256 of the complete file, for the server to verify at completion.
 *
 * Hashes the file's **bytes**. It used to concatenate the windows as base64 and
 * hash that string, which produces the digest of the base64 *text* — a
 * different value from the digest of the file, and never the one the server
 * computes over what it received. Every completed upload would have been
 * rejected for a hash mismatch on footage that arrived perfectly intact.
 *
 * Still read in windows, then assembled into one buffer because `Crypto.digest`
 * has no streaming form. That buffer is the raw file, which is smaller than the
 * base64 string this replaced — so the memory cost went down, not up. If the
 * 200 MB cap ever rises, this is the line to revisit.
 */
export async function hashFile(uri: string, windowBytes = 4 * 1024 * 1024): Promise<string> {
  const size = fileSize(uri);
  if (size === 0) return '';

  const handle = new File(uri).open();
  try {
    const whole = new Uint8Array(size);
    for (let offset = 0; offset < size; offset += windowBytes) {
      handle.offset = offset;
      whole.set(handle.readBytes(Math.min(windowBytes, size - offset)), offset);
    }
    const digest = await Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256, whole);
    return bytesToHex(new Uint8Array(digest));
  } finally {
    handle.close();
  }
}

/** Lowercase hex, which is the form the API's `sha256` field is matched against. */
export function bytesToHex(bytes: Uint8Array): string {
  let out = '';
  for (const byte of bytes) out += byte.toString(16).padStart(2, '0');
  return out;
}

/**
 * Delete a media file after the server confirms it holds the upload.
 *
 * The metadata row stays behind — that is the reporter's personal history, and
 * deleting it on success would erase everything they have ever filed.
 */
export function deleteMedia(uri: string): void {
  const file = new File(uri);
  if (file.exists) file.delete();
}

/** Total bytes held locally, for the settings screen's storage readout. */
export function mediaStorageBytes(): number {
  const dir = incidentsDirectory();
  if (!dir.exists) return 0;
  return dir
    .list()
    .filter((entry): entry is File => entry instanceof File)
    .reduce((sum, file) => sum + file.size, 0);
}

const BASE64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/**
 * Encode bytes as base64.
 *
 * Hand-rolled because React Native has no `Buffer` and `btoa` is not reliably
 * present across engines; pulling a polyfill in for one function is not worth
 * the dependency.
 */
export function bytesToBase64(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i]!;
    const b1 = i + 1 < bytes.length ? bytes[i + 1]! : 0;
    const b2 = i + 2 < bytes.length ? bytes[i + 2]! : 0;

    out += BASE64_ALPHABET[b0 >> 2];
    out += BASE64_ALPHABET[((b0 & 0x03) << 4) | (b1 >> 4)];
    out += i + 1 < bytes.length ? BASE64_ALPHABET[((b1 & 0x0f) << 2) | (b2 >> 6)] : '=';
    out += i + 2 < bytes.length ? BASE64_ALPHABET[b2 & 0x3f] : '=';
  }
  return out;
}
