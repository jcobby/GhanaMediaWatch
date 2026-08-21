import { chunkCount, planChunks, remainingChunks, uploadedBytes } from '../chunkPlan';

const MIB = 1024 * 1024;
const CHUNK = 5 * MIB;

describe('chunk planning', () => {
  it('splits a file into ceil(size / chunkSize) chunks', () => {
    expect(chunkCount(12 * MIB, CHUNK)).toBe(3);
    expect(chunkCount(10 * MIB, CHUNK)).toBe(2);
    expect(chunkCount(1, CHUNK)).toBe(1);
  });

  it('handles a file smaller than one chunk', () => {
    const plan = planChunks(100, CHUNK);
    expect(plan).toEqual([{ index: 0, offset: 0, length: 100 }]);
  });

  it('never reads past the end of the file', () => {
    const size = 12 * MIB;
    const plan = planChunks(size, CHUNK);
    const last = plan[plan.length - 1]!;
    // Reading a full chunk on the final slice would run past EOF and, on some
    // platforms, silently pad the buffer — corrupting the hash.
    expect(last.offset + last.length).toBe(size);
    expect(last.length).toBe(2 * MIB);
  });

  it('produces contiguous, non-overlapping chunks that sum to the file size', () => {
    const size = 37_123_456;
    const plan = planChunks(size, CHUNK);
    let cursor = 0;
    for (const chunk of plan) {
      expect(chunk.offset).toBe(cursor);
      cursor += chunk.length;
    }
    expect(cursor).toBe(size);
  });

  it('produces exactly one chunk when the size is an exact multiple', () => {
    const plan = planChunks(CHUNK * 4, CHUNK);
    expect(plan).toHaveLength(4);
    expect(plan.every((c) => c.length === CHUNK)).toBe(true);
  });

  it('treats an empty or invalid file as no work', () => {
    expect(planChunks(0, CHUNK)).toEqual([]);
    expect(planChunks(-5, CHUNK)).toEqual([]);
    expect(planChunks(100, 0)).toEqual([]);
  });
});

describe('resumption', () => {
  it('sends only what the server has not confirmed', () => {
    const remaining = remainingChunks(12 * MIB, CHUNK, [0, 2]);
    expect(remaining.map((c) => c.index)).toEqual([1]);
  });

  it('returns nothing once every chunk is confirmed', () => {
    expect(remainingChunks(12 * MIB, CHUNK, [0, 1, 2])).toEqual([]);
  });

  it('ignores acknowledgements for chunks outside the plan', () => {
    // A stale upload session could report indices from a previous, larger file.
    const remaining = remainingChunks(10 * MIB, CHUNK, [0, 1, 7, 99]);
    expect(remaining).toEqual([]);
  });

  it('resumes rather than restarting after a dropped connection', () => {
    const size = 40 * MIB;
    const all = planChunks(size, CHUNK).map((c) => c.index);
    const afterDrop = remainingChunks(size, CHUNK, all.slice(0, 6));
    // Six of eight already sent: the retry must send two, not eight.
    expect(afterDrop.map((c) => c.index)).toEqual([6, 7]);
  });
});

describe('progress accounting', () => {
  it('counts confirmed bytes from the acknowledged indices', () => {
    expect(uploadedBytes(12 * MIB, CHUNK, [0, 1])).toBe(10 * MIB);
  });

  it('counts the short final chunk at its real length', () => {
    // Assuming a full-size final chunk would report more bytes than the file
    // actually contains, and the bar would exceed 100%.
    expect(uploadedBytes(12 * MIB, CHUNK, [2])).toBe(2 * MIB);
    expect(uploadedBytes(12 * MIB, CHUNK, [0, 1, 2])).toBe(12 * MIB);
  });

  it('never exceeds the file size even with duplicate acknowledgements', () => {
    const size = 12 * MIB;
    expect(uploadedBytes(size, CHUNK, [0, 0, 1, 1, 2, 2])).toBe(size);
  });

  it('reports nothing before the first acknowledgement', () => {
    expect(uploadedBytes(12 * MIB, CHUNK, [])).toBe(0);
  });
});
