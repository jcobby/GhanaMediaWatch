import fs from 'fs';
import path from 'path';
import en from '@/i18n/locales/en.json';

/**
 * An organisation's homepage: approved organisations only, with its reports,
 * surveys and an About page. And a whistleblower's report is visible to the
 * organisations it is sent to.
 */

const SRC = path.resolve(__dirname, '../../..');
const code = (rel: string) =>
  fs
    .readFileSync(path.join(SRC, rel), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');

test('home search offers only approved organisations', () => {
  const screen = code('features/feed/FeedScreen.tsx');
  expect(screen).toMatch(/const approved = useMemo\(\(\) => receiving\(directory\), \[directory\]\);/);
  expect(screen).toMatch(/organisations=\{approved\}/);
  expect(screen).not.toMatch(/organisations=\{directory \?\? \[\]\}/);
});

test('an organisation homepage has reports, surveys and about', () => {
  const screen = code('features/feed/FeedScreen.tsx');
  expect(screen).toMatch(/\(\['reports', 'surveys', 'about'\] as const\)/);
  expect(screen).toMatch(/<SurveyList surveys=\{surveys\}/);
  expect(screen).toMatch(/<About organisation=\{organisation\} \/>/);
  expect(screen).toMatch(/useOrganisationSurveys\(organisation\?\.id \?\? null\)/);
});

test("surveys come from the organisation's public endpoint, made safe to render", () => {
  const http = code('api/http.ts');
  expect(http).toMatch(/`\/organisations\/\$\{encodeURIComponent\(organisationId\)\}\/surveys`/);
  expect(http).toMatch(/questions: Array\.isArray\(raw\.questions\) \? raw\.questions : \[\]/);
});

test('a whistleblower is told the organisations can see who filed it', () => {
  const note = (en.review as Record<string, unknown>).whistleblowerNote as string;
  expect(note).toMatch(/public never sees/i);
  expect(note).toMatch(/organisations you send it to can see who filed it/i);
});
