/*
 * <name>.html -> <name>.pdf
 *
 * Uses whichever Chrome or Edge is already installed rather than pulling in
 * Puppeteer, which would download a second Chromium into a repo that has no
 * other use for one.
 *
 * Run via `npm run docs:spec`, which renders the HTML first.
 */
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

const arg = process.argv[2];
if (!arg) {
  console.error('usage: node scripts/print-pdf.js <file.html>');
  process.exit(1);
}

const HTML = path.isAbsolute(arg) ? arg : path.join(ROOT, arg);
const PDF = HTML.replace(/\.html$/i, '.pdf');

const CANDIDATES = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
].filter(Boolean);

const browser = CANDIDATES.find((p) => fs.existsSync(p));

if (!browser) {
  console.error(
    'No Chrome or Edge found. Set CHROME_PATH to a Chromium-based browser and re-run.',
  );
  process.exit(1);
}

if (!fs.existsSync(HTML)) {
  console.error(`${HTML} is missing — render the markdown first.`);
  process.exit(1);
}

// A throwaway profile: without one, a running Chrome instance takes over the
// command and the print silently never happens.
const profile = path.join(require('os').tmpdir(), 'dawuro-pdf-profile');

execFileSync(
  browser,
  [
    '--headless=new',
    '--disable-gpu',
    '--no-sandbox',
    `--user-data-dir=${profile}`,
    // Give webfonts and layout time to settle before the snapshot.
    '--virtual-time-budget=10000',
    '--no-pdf-header-footer',
    `--print-to-pdf=${PDF}`,
    `file:///${HTML.replace(/\\/g, '/')}`,
  ],
  { stdio: 'ignore' },
);

const { size } = fs.statSync(PDF);
console.log(`wrote ${path.basename(PDF)} (${Math.round(size / 1024)} KB)`);
