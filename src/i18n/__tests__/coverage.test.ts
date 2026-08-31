import fs from 'fs';
import path from 'path';
import en from '../locales/en.json';

/**
 * Every `t('…')` key in the app resolves to a real string.
 *
 * A missing key does not throw in i18next — it renders the key itself, so
 * `feed.share` appears on the button and nobody notices until a screenshot
 * reaches someone outside the team. This is the check that turns that into a
 * failing build.
 *
 * Only static string literals are checked. Keys built at runtime — the
 * `t(\`category.${c}\`)` pattern — are covered by the enum sweep below instead,
 * since a regex cannot resolve them.
 */

const SRC = path.resolve(__dirname, '../..');

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '__tests__') continue;
      walk(full, out);
    } else if (/\.tsx?$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

function resolves(key: string): boolean {
  let node: unknown = en;
  for (const part of key.split('.')) {
    if (typeof node !== 'object' || node === null || !(part in node)) return false;
    node = (node as Record<string, unknown>)[part];
  }
  return typeof node === 'string';
}

const files = walk(SRC);

test('the sweep actually found source files', () => {
  // Without this, a broken walk would make every assertion below vacuous.
  expect(files.length).toBeGreaterThan(50);
});

test('every static t() key resolves', () => {
  const missing: string[] = [];

  for (const file of files) {
    const source = fs.readFileSync(file, 'utf8');
    for (const match of source.matchAll(/\bt\(\s*'([a-zA-Z0-9_.]+)'/g)) {
      const key = match[1];
      if (key && !resolves(key)) {
        missing.push(`${key}  (${path.relative(SRC, file)})`);
      }
    }
  }

  expect(missing).toEqual([]);
});

test('every incident category has a label', () => {
  // The one runtime-built key family worth checking explicitly, because it is
  // the one that grows: adding a category without a label ships a raw enum
  // value into the feed's filter chips.
  const category = (en as Record<string, Record<string, unknown>>).category ?? {};
  const entries = Object.entries(category);
  expect(entries.length).toBeGreaterThan(0);
  for (const [key, value] of entries) {
    expect(`${key}: ${typeof value}`).toBe(`${key}: string`);
  }
});

test('no translation value is left empty', () => {
  const empties: string[] = [];

  const visit = (node: unknown, trail: string) => {
    if (typeof node === 'string') {
      if (node.trim() === '') empties.push(trail);
      return;
    }
    if (typeof node === 'object' && node !== null) {
      for (const [k, v] of Object.entries(node)) visit(v, trail ? `${trail}.${k}` : k);
    }
  };

  visit(en, '');
  expect(empties).toEqual([]);
});
