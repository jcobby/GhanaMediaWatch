import fs from 'fs';
import path from 'path';

/**
 * No arbitrary pixel values in class names.
 *
 * NativeWind does not compile `w-[112px]` in this project's setup. It does not
 * warn either — the class is dropped, the element gets no width, and the layout
 * silently collapses. That shipped once as a feed of headlines with no
 * thumbnails and no gap where they should have been, and every check passed
 * while it was broken.
 *
 * Exact sizes go through `style={{ }}`, which is what the rest of the app does
 * and what actually works. This is the guard, because the failure has no
 * symptom until someone looks at a device.
 */

const SRC = path.resolve(__dirname, '../..');

/** `w-[112px]`, `h-[3px]`, `leading-[21px]` — anything sizing in raw pixels. */
const ARBITRARY_PX = /className="[^"]*\b[a-z-]+-\[\d+(?:\.\d+)?px\]/g;

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '__tests__') continue;
      walk(full, out);
    } else if (/\.tsx$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

const files = walk(SRC);

test('the sweep found the component tree', () => {
  // Without this a broken walk makes the assertion below vacuous.
  expect(files.length).toBeGreaterThan(30);
});

test('no component sizes itself with an arbitrary pixel class', () => {
  const offenders: string[] = [];

  for (const file of files) {
    const source = fs.readFileSync(file, 'utf8');
    for (const match of source.matchAll(ARBITRARY_PX)) {
      const line = source.slice(0, match.index).split('\n').length;
      offenders.push(`${path.relative(SRC, file)}:${line}`);
    }
  }

  expect(offenders).toEqual([]);
});
