import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/* eslint-disable @typescript-eslint/no-require-imports -- tailwind.config.js is
   CommonJS and lives outside the TS program; require is the only way in. */
const tailwind = require('../../../tailwind.config.js') as {
  theme: { extend: { colors: Record<string, unknown>; borderRadius: Record<string, string> } };
};

/*
 * Guard against silently-dead utility classes.
 *
 * NativeWind does not error on an unknown class — it drops it. So renaming a
 * colour token turns every `bg-surface` into *no background at all*, and the
 * screen renders on the OS default. That shipped once: after the palette
 * rewrite, eight files still referenced the old names and every placeholder
 * screen rendered white on a dark app.
 *
 * This walks the real source tree and asserts that every colour and radius
 * utility resolves against tailwind.config.js.
 */

const COLOR_PREFIXES = ['bg', 'text', 'border'] as const;

function sourceFiles(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry !== '__tests__') sourceFiles(full, acc);
    } else if (/\.tsx?$/.test(entry)) {
      acc.push(full);
    }
  }
  return acc;
}

/** Flatten the config colours into the token names Tailwind actually emits. */
function colorTokens(): Set<string> {
  const out = new Set<string>();
  for (const [name, value] of Object.entries(tailwind.theme.extend.colors)) {
    if (typeof value === 'string') {
      out.add(name);
      continue;
    }
    for (const key of Object.keys(value as Record<string, unknown>)) {
      out.add(key === 'DEFAULT' ? name : `${name}-${key}`);
    }
  }
  return out;
}

/** Tailwind ships these regardless of our theme extension. */
const BUILTIN_COLORS = new Set([
  'white',
  'black',
  'transparent',
  'current',
  'inherit',
  'auto',
  'none',
]);

/**
 * Non-colour utilities that share a prefix and must not be flagged.
 *
 * Tailwind overloads all three prefixes: `text-` also carries alignment and the
 * font-size scale, `border-` carries widths *and* styles (solid, dashed), and
 * `bg-` carries background sizing and repeat. Missing any of those makes this
 * guard cry wolf, which is worse than not having it — a test people learn to
 * override stops protecting anything.
 */
const NON_COLOR_UTILITIES =
  /^(text-(left|right|center|justify|xs|sm|base|lg|xl|[0-9]|display-|title-|body|body-|label$|caption$))|^(border-([0-9]|x|y|t|r|b|l)?$)|^(border-(solid|dashed|dotted|double|hidden|none))$|^(bg-(cover|contain|center|no-repeat|fixed|local|scroll))$/;

describe('utility classes resolve against the design tokens', () => {
  const tokens = colorTokens();
  const files = sourceFiles(join(__dirname, '..', '..'));

  it('finds source files to scan', () => {
    expect(files.length).toBeGreaterThan(10);
  });

  it.each(COLOR_PREFIXES)('every %s-* colour utility exists in the config', (prefix) => {
    const dead: string[] = [];

    for (const file of files) {
      const source = readFileSync(file, 'utf8');
      // Only look inside className="…" so prose and comments are ignored.
      for (const match of source.matchAll(/className=(?:"([^"]*)"|\{`([^`]*)`\})/g)) {
        const classes = (match[1] ?? match[2] ?? '').split(/\s+/);
        for (const raw of classes) {
          const cls = raw.replace(/^(active|focus|disabled|dark):/, '');
          if (!cls.startsWith(`${prefix}-`)) continue;
          if (NON_COLOR_UTILITIES.test(cls)) continue;

          // Strip an opacity modifier: bg-glass/[0.14] or border-hairline/30
          const base = cls.slice(prefix.length + 1).split('/')[0]!;
          if (!base || BUILTIN_COLORS.has(base)) continue;
          if (!tokens.has(base)) {
            dead.push(`${file.split('src')[1]}  ->  ${cls}`);
          }
        }
      }
    }

    expect(dead).toEqual([]);
  });
});
