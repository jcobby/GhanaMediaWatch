/*
 * BACKEND_SPEC.md -> a print-ready HTML document.
 *
 *   npm run docs:spec        # markdown -> HTML -> PDF
 *
 * The PDF step shells out to Chrome's headless printer rather than pulling in
 * Puppeteer, which would drag a second Chromium download into a repo that has
 * no other use for one.
 *
 * The palette is carried over from GhanaMediaWatch-Backend-Spec.html so the two
 * documents read as one set. Neutrals keep their slight teal bias.
 */
const fs = require('fs');
const { marked } = require('marked');

const SRC = process.argv[2];
const OUT = process.argv[3];

const md = fs.readFileSync(SRC, 'utf8');

// The document names itself from its own H1, so a second doc needs no code
// change and the tab never disagrees with the page.
const h1 = /^#\s+(.+)$/m.exec(md);
const title = h1 ? h1[1].replace(/\s*—\s*/g, ' — ').trim() : 'Dawuro';
const description = /^\*\*(.+?)\*\*$/m.exec(md);

// Heading ids, so the contents rail can link into the body.
const slugs = new Map();
marked.use({
  renderer: {
    heading({ tokens, depth }) {
      const text = this.parser.parseInline(tokens);
      const plain = text.replace(/<[^>]+>/g, '');
      let id = plain
        .toLowerCase()
        .replace(/[^\w\s-]/g, '')
        .trim()
        .replace(/\s+/g, '-');
      if (!id) id = `s${slugs.size}`;
      while (slugs.has(id)) id = `${id}-x`;
      slugs.set(id, { depth, text: plain });
      return `<h${depth} id="${id}">${text}</h${depth}>\n`;
    },
  },
});

const body = marked.parse(md);

// Contents: top-level sections only. A two-level rail on a 1,700-line document
// becomes a second document.
/*
 * Section headings, plus any part divider.
 *
 * A single-source document has one h1 — its title — and the rail is a flat list
 * of h2s. The combined handbook has two more h1s, "Part I" and "Part II", and
 * without them the rail runs 0–16 straight into C0–C13 as one undifferentiated
 * column. The C prefix keeps that unambiguous but not legible; the dividers say
 * where the second document starts.
 *
 * The document's own title is skipped: it is already the page heading, and a
 * contents rail whose first entry is the thing you are looking at is noise.
 */
const [firstH1] = [...slugs.entries()].filter(([, v]) => v.depth === 1);

const toc = [...slugs.entries()]
  .filter(([id, v]) => v.depth === 2 || (v.depth === 1 && id !== firstH1?.[0]))
  .map(([id, v]) => {
    const label = v.text.replace(/&/g, '&amp;');
    return v.depth === 1
      ? `<li class="part"><a href="#${id}">${label}</a></li>`
      : `<li><a href="#${id}">${label}</a></li>`;
  })
  .join('\n');

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="description" content="${(description ? description[1] : title).replace(/"/g, '&quot;')}">
<title>${title}</title>
<style>
  *,*::before,*::after{box-sizing:border-box}
  body,h1,h2,h3,h4,h5,p,figure,blockquote,dl,dd{margin:0}
  img{max-width:100%;display:block}
  table{border-collapse:collapse}

  :root{
    --ground:#EEF1F0; --panel:#F7F9F8; --panel-2:#E3E8E7;
    --rule:#C7D0CE; --rule-soft:#DAE1DF;
    --ink:#101819; --ink-2:#3C4A4B; --ink-3:#647575;
    --accent:#0F6E6A; --accent-ink:#0B534F; --accent-wash:#DCEAE8;
    --warn:#A25C00; --warn-wash:#F6EADA;
    --danger:#B4232C; --danger-wash:#F7E2E3;
    --mono:"SFMono-Regular",Consolas,"Liberation Mono",Menlo,monospace;
    --sans:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif;
  }

  body{
    background:var(--ground); color:var(--ink);
    font-family:var(--sans); font-size:16px; line-height:1.62;
    -webkit-font-smoothing:antialiased;
  }

  .wrap{
    display:grid; grid-template-columns:210px minmax(0,1fr);
    gap:44px; max-width:1180px; margin:0 auto; padding:56px 32px 96px;
  }

  /* ── contents rail ─────────────────────────────────────────────── */
  .rail{position:sticky; top:32px; align-self:start; max-height:calc(100vh - 64px); overflow-y:auto}
  .rail-title{
    font-size:10px; font-weight:700; letter-spacing:.16em; text-transform:uppercase;
    color:var(--ink-3); margin-bottom:12px;
  }
  .rail ol{list-style:none; margin:0; padding:0; counter-reset:sec}
  .rail li{margin-bottom:2px}
  .rail a{
    display:block; padding:5px 9px; border-radius:5px;
    color:var(--ink-2); text-decoration:none; font-size:12.5px; line-height:1.35;
  }
  .rail a:hover{background:var(--accent-wash); color:var(--accent-ink)}

  /* Part dividers in a combined document. Set as a label rather than as a
     louder link: they are where you are, not usually where you are going. */
  .rail li.part{margin:16px 0 4px}
  .rail li.part:first-child{margin-top:0}
  .rail li.part a{
    font-size:10px; font-weight:700; letter-spacing:.14em; text-transform:uppercase;
    color:var(--ink-3);
  }

  /* ── document ──────────────────────────────────────────────────── */
  .doc{min-width:0}
  .doc > h1{
    font-size:40px; line-height:1.14; letter-spacing:-.022em; font-weight:700;
    text-wrap:balance; margin-bottom:6px;
  }
  .doc h2{
    font-size:25px; line-height:1.22; letter-spacing:-.014em; font-weight:650;
    margin:52px 0 14px; padding-top:22px; border-top:1px solid var(--rule);
    text-wrap:balance;
  }
  .doc h3{font-size:17.5px; font-weight:650; margin:30px 0 9px; letter-spacing:-.006em}
  .doc h4{font-size:15px; font-weight:650; margin:22px 0 7px; color:var(--ink-2)}

  .doc p{margin:0 0 13px; max-width:74ch}
  .doc ul,.doc ol{margin:0 0 15px; padding-left:22px; max-width:74ch}
  .doc li{margin-bottom:5px}
  .doc li > ul,.doc li > ol{margin-top:5px; margin-bottom:2px}

  .doc a{color:var(--accent-ink); text-decoration-thickness:1px; text-underline-offset:2px}
  .doc strong{font-weight:650; color:var(--ink)}

  /* Inline code: distinct from prose without shouting. */
  .doc code{
    font-family:var(--mono); font-size:.855em;
    background:var(--panel-2); color:var(--accent-ink);
    padding:.1em .35em; border-radius:3px; white-space:nowrap;
  }
  .doc pre{
    background:var(--panel); border:1px solid var(--rule-soft); border-left:3px solid var(--accent);
    border-radius:6px; padding:15px 17px; margin:0 0 17px;
    overflow-x:auto; font-size:13px; line-height:1.58;
  }
  .doc pre code{background:none; color:var(--ink); padding:0; white-space:pre; font-size:inherit}

  /* Tables carry most of the reference material, so they get the most care. */
  .doc table{
    width:100%; margin:0 0 19px; font-size:13.5px;
    background:var(--panel); border:1px solid var(--rule-soft); border-radius:6px;
    overflow:hidden; font-variant-numeric:tabular-nums;
  }
  .doc thead th{
    background:var(--panel-2); text-align:left; font-weight:650; font-size:11.5px;
    letter-spacing:.05em; text-transform:uppercase; color:var(--ink-2);
    padding:9px 12px; border-bottom:1px solid var(--rule);
  }
  .doc td{padding:8px 12px; border-bottom:1px solid var(--rule-soft); vertical-align:top}
  .doc tbody tr:last-child td{border-bottom:none}
  .doc td code{white-space:nowrap; font-size:.9em}
  .tw{overflow-x:auto; margin-bottom:19px}
  .tw table{margin-bottom:0}

  .doc blockquote{
    border-left:3px solid var(--warn); background:var(--warn-wash);
    padding:11px 15px; margin:0 0 17px; border-radius:0 5px 5px 0;
  }
  .doc blockquote p:last-child{margin-bottom:0}

  .doc hr{border:0; height:0; margin:0}     /* section rules come from h2 */

  .meta{
    color:var(--ink-3); font-size:13.5px; margin-bottom:30px;
    padding-bottom:18px; border-bottom:1px solid var(--rule);
  }

  /* ── print ─────────────────────────────────────────────────────── */
  @page{ margin:15mm 14mm; }
  @media print{
    body{background:#fff; font-size:10pt; line-height:1.5}
    .wrap{display:block; max-width:none; padding:0}
    .rail{display:none}
    .doc > h1{font-size:24pt}
    .doc h2{
      font-size:14pt; margin:20pt 0 7pt; padding-top:9pt;
      break-after:avoid; break-inside:avoid;
    }
    .doc h3{font-size:11.5pt; margin:13pt 0 5pt; break-after:avoid}
    .doc h4{font-size:10pt; break-after:avoid}
    .doc p,.doc li{max-width:none}
    .doc pre{
      font-size:8pt; break-inside:avoid; padding:8pt 10pt;
      background:#F7F9F8; border-color:#C7D0CE;
    }
    .doc table{font-size:8.5pt; break-inside:avoid}
    .doc thead th{padding:5pt 7pt; font-size:7.5pt}
    .doc td{padding:4pt 7pt}
    .tw{overflow:visible}
    .doc a{color:inherit; text-decoration:none}
    .doc blockquote{break-inside:avoid}
  }

  @media (max-width:900px){
    .wrap{grid-template-columns:minmax(0,1fr); gap:0; padding:32px 20px 64px}
    .rail{display:none}
    .doc > h1{font-size:30px}
    .doc h2{font-size:21px}
  }
</style>
</head>
<body>
<div class="wrap">
  <nav class="rail" aria-label="Contents">
    <div class="rail-title">Contents</div>
    <ol>
${toc}
    </ol>
  </nav>
  <main class="doc">
${body}
  </main>
</div>
</body>
</html>
`;

// Wide tables scroll inside their own container rather than pushing the page.
const wrapped = html.replace(/<table>/g, '<div class="tw"><table>').replace(/<\/table>/g, '</table></div>');

fs.writeFileSync(OUT, wrapped, 'utf8');
console.log(`wrote ${OUT} (${(wrapped.length / 1024).toFixed(0)} KB, ${slugs.size} headings)`);
