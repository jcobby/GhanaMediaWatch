import {
  isTerminal,
  needsManualRetry,
  progressRatio,
  reduce,
  selectNextUploadable,
  type OutboxRecord,
} from '../outboxMachine';
import { UPLOAD_RETRY_BACKOFF_MS } from '@/lib/constants';

const NOW = 1_700_000_000_000;

/** No jitter, so scheduling assertions are exact rather than ranged. */
const noJitter = () => 0.5;

function make(overrides: Partial<OutboxRecord> = {}): OutboxRecord {
  return {
    id: 'local_1',
    clientId: 'client_1',
    serverId: null,
    uploadId: null,
    category: 'flood',
    description: 'Drain blocked',
    state: 'draft',
    attemptCount: 0,
    lastError: null,
    lastErrorCode: null,
    nextRetryAt: null,
    bytesUploaded: 0,
    byteSize: 10_000_000,
    chunkSizeBytes: null,
    chunkCount: null,
    receivedChunks: [],
    waitingForWifi: false,
    createdAt: NOW - 60_000,
    updatedAt: NOW - 60_000,
    ...overrides,
  };
}

const opts = { now: NOW, random: noJitter };

describe('outbox state machine', () => {
  describe('the happy path', () => {
    it('walks draft → queued → uploading → uploaded', () => {
      let r = make();
      r = reduce(r, { type: 'QUEUE' }, opts);
      expect(r.state).toBe('queued');

      r = reduce(
        r,
        { type: 'UPLOAD_INIT', uploadId: 'u1', chunkSizeBytes: 5, chunkCount: 2 },
        opts,
      );
      expect(r.state).toBe('uploading');
      expect(r.uploadId).toBe('u1');

      r = reduce(r, { type: 'UPLOAD_COMPLETE', serverId: 'inc_9' }, opts);
      expect(r.state).toBe('uploaded');
      expect(r.serverId).toBe('inc_9');
      // A completed upload reads as 100%, not as whatever the last chunk said.
      expect(progressRatio(r)).toBe(1);
    });
  });

  describe('illegal transitions are refused', () => {
    it('will not start an upload that was never queued', () => {
      const draft = make({ state: 'draft' });
      const after = reduce(
        draft,
        { type: 'UPLOAD_INIT', uploadId: 'u1', chunkSizeBytes: 5, chunkCount: 1 },
        opts,
      );
      expect(after).toBe(draft);
    });

    it('will not complete an upload that is not running', () => {
      const queued = make({ state: 'queued' });
      expect(reduce(queued, { type: 'UPLOAD_COMPLETE', serverId: 'x' }, opts)).toBe(queued);
    });

    it('never resurrects a cancelled record', () => {
      // A chunk acknowledgement can arrive after the user cancels; it must not
      // put the report back into the queue.
      const cancelled = make({ state: 'cancelled' });
      const after = reduce(cancelled, { type: 'CHUNK_ACK', index: 0, bytesUploaded: 500 }, opts);
      expect(after).toBe(cancelled);
      expect(isTerminal(cancelled)).toBe(true);
    });

    it('never re-uploads a record the server already confirmed', () => {
      const done = make({ state: 'uploaded', serverId: 'inc_9' });
      expect(reduce(done, { type: 'QUEUE' }, opts)).toBe(done);
    });
  });

  describe('chunk acknowledgement', () => {
    it('does not duplicate a chunk the server re-acknowledges', () => {
      let r = make({ state: 'uploading' });
      r = reduce(r, { type: 'CHUNK_ACK', index: 0, bytesUploaded: 5_000_000 }, opts);
      r = reduce(r, { type: 'CHUNK_ACK', index: 0, bytesUploaded: 5_000_000 }, opts);
      expect(r.receivedChunks).toEqual([0]);
    });

    it('keeps chunk indices sorted so resumption is predictable', () => {
      let r = make({ state: 'uploading' });
      r = reduce(r, { type: 'CHUNK_ACK', index: 2, bytesUploaded: 3 }, opts);
      r = reduce(r, { type: 'CHUNK_ACK', index: 0, bytesUploaded: 4 }, opts);
      r = reduce(r, { type: 'CHUNK_ACK', index: 1, bytesUploaded: 5 }, opts);
      expect(r.receivedChunks).toEqual([0, 1, 2]);
    });

    it('never lets progress go backwards on a re-sent chunk', () => {
      let r = make({ state: 'uploading' });
      r = reduce(r, { type: 'CHUNK_ACK', index: 1, bytesUploaded: 8_000_000 }, opts);
      r = reduce(r, { type: 'CHUNK_ACK', index: 0, bytesUploaded: 5_000_000 }, opts);
      // A progress bar that jumps backwards reads as failure even when the
      // upload is healthy.
      expect(r.bytesUploaded).toBe(8_000_000);
    });
  });

  describe('failure handling', () => {
    it('schedules a retry for a transient failure', () => {
      const r = reduce(
        make({ state: 'uploading' }),
        {
          type: 'UPLOAD_FAIL',
          message: 'Connection lost',
          code: 'NETWORK_UNAVAILABLE',
          retryable: true,
        },
        opts,
      );
      expect(r.state).toBe('failed');
      expect(r.attemptCount).toBe(1);
      // noJitter returns 0.5, which maps to zero swing — so exactly the base.
      expect(r.nextRetryAt).toBe(NOW + UPLOAD_RETRY_BACKOFF_MS[1]!);
    });

    it('does NOT schedule a retry for a permanent failure', () => {
      const r = reduce(
        make({ state: 'uploading' }),
        { type: 'UPLOAD_FAIL', message: 'Too large', code: 'MEDIA_TOO_LARGE', retryable: false },
        opts,
      );
      expect(r.state).toBe('failed');
      // Retrying a rejected file hourly forever burns battery and data to no
      // effect. The user is told instead.
      expect(r.nextRetryAt).toBeNull();
      expect(needsManualRetry(r)).toBe(true);
    });

    it('backs off further on each successive failure', () => {
      let r = make({ state: 'uploading' });
      const delays: number[] = [];
      for (let i = 0; i < 4; i++) {
        r = reduce(
          r,
          { type: 'UPLOAD_FAIL', message: 'flaky', code: 'INTERNAL', retryable: true },
          opts,
        );
        delays.push(r.nextRetryAt! - NOW);
        r = reduce(r, { type: 'RETRY' }, opts);
        r = reduce(
          r,
          { type: 'UPLOAD_INIT', uploadId: 'u', chunkSizeBytes: 1, chunkCount: 1 },
          opts,
        );
      }
      expect(delays).toEqual([...delays].sort((a, b) => a - b));
      expect(new Set(delays).size).toBe(delays.length);
    });

    it('caps the delay rather than giving up on the report', () => {
      const r = reduce(
        make({ state: 'uploading', attemptCount: 99 }),
        { type: 'UPLOAD_FAIL', message: 'still down', code: 'INTERNAL', retryable: true },
        opts,
      );
      // A phone that spent a day in a dead zone should still deliver.
      expect(r.nextRetryAt).toBe(NOW + UPLOAD_RETRY_BACKOFF_MS.at(-1)!);
    });

    it('clears the error when a failed record is retried by hand', () => {
      const failed = make({ state: 'failed', lastError: 'boom', lastErrorCode: 'INTERNAL' });
      const r = reduce(failed, { type: 'RETRY' }, opts);
      expect(r.state).toBe('queued');
      expect(r.lastError).toBeNull();
      expect(r.nextRetryAt).toBeNull();
    });
  });

  describe('Wi-Fi deferral', () => {
    it('holds a deferred item back and releases it when Wi-Fi returns', () => {
      let r = reduce(make({ state: 'queued' }), { type: 'DEFER_WIFI' }, opts);
      expect(r.waitingForWifi).toBe(true);
      r = reduce(r, { type: 'WIFI_AVAILABLE' }, opts);
      expect(r.waitingForWifi).toBe(false);
    });
  });
});

describe('selectNextUploadable', () => {
  it('drains oldest first', () => {
    const older = make({ id: 'a', state: 'queued', createdAt: NOW - 100_000 });
    const newer = make({ id: 'b', state: 'queued', createdAt: NOW - 10_000 });
    expect(selectNextUploadable([newer, older], { now: NOW })?.id).toBe('a');
  });

  it('skips a failed item whose backoff has not elapsed', () => {
    const notYet = make({ id: 'a', state: 'failed', nextRetryAt: NOW + 60_000 });
    expect(selectNextUploadable([notYet], { now: NOW })).toBeNull();
  });

  it('picks up a failed item once its backoff has elapsed', () => {
    const due = make({ id: 'a', state: 'failed', nextRetryAt: NOW - 1 });
    expect(selectNextUploadable([due], { now: NOW })?.id).toBe('a');
  });

  it('never picks a permanently failed item', () => {
    const permanent = make({ id: 'a', state: 'failed', nextRetryAt: null });
    expect(selectNextUploadable([permanent], { now: NOW })).toBeNull();
  });

  it('holds Wi-Fi-deferred items back on mobile data but not on Wi-Fi', () => {
    const deferred = make({ id: 'a', state: 'queued', waitingForWifi: true });
    expect(selectNextUploadable([deferred], { now: NOW, hasWifi: false })).toBeNull();
    expect(selectNextUploadable([deferred], { now: NOW, hasWifi: true })?.id).toBe('a');
  });

  it('ignores terminal records entirely', () => {
    const records = [
      make({ id: 'a', state: 'uploaded' }),
      make({ id: 'b', state: 'cancelled' }),
      make({ id: 'c', state: 'uploading' }),
    ];
    expect(selectNextUploadable(records, { now: NOW })).toBeNull();
  });
});
