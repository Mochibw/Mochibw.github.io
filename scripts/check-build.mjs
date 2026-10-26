import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dist = fileURLToPath(new URL('../dist/', import.meta.url));
const errors = [];
let pages = 0;

async function* htmlFiles(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) yield* htmlFiles(file);
    else if (entry.name.endsWith('.html')) yield file;
  }
}

for await (const file of htmlFiles(dist)) {
  pages++;
  const relative = path.relative(dist, file).split(path.sep).join('/');
  const base = new URL('/' + relative.replace(/index\.html$/, ''), 'https://build.invalid');
  const html = await readFile(file, 'utf8');
  if (!/<title>\s*[^<]+<\/title>/.test(html)) errors.push(`${relative}: missing title`);
  if (!/<meta\s+name="description"\s+content="[^"]+"/.test(html)) errors.push(`${relative}: missing description`);
  const canonical = /<link\s+rel="canonical"\s+href="([^"]+)"/.exec(html)?.[1];
  if (!canonical || !canonical.startsWith('https://')) errors.push(`${relative}: missing HTTPS canonical URL`);
  else if (new URL(canonical).pathname !== base.pathname) errors.push(`${relative}: canonical points to another page`);

  for (const [tag] of html.matchAll(/<(?:a|link|img|script)\b[^>]*>/g)) {
    const href = /\s(?:href|src)="([^"]+)"/.exec(tag)?.[1];
    if (!href) continue;
    const url = new URL(href.replaceAll('&amp;', '&'), base);
    if (url.origin !== base.origin) continue;
    const target = path.resolve(dist, '.' + decodeURIComponent(url.pathname));
    const relativeTarget = path.relative(dist, target);
    if (relativeTarget.startsWith('..') || path.isAbsolute(relativeTarget)) {
      errors.push(`${relative}: path escapes dist: ${href}`);
      continue;
    }
    try {
      const info = await stat(target);
      if (info.isDirectory()) await stat(path.join(target, 'index.html'));
    } catch {
      errors.push(`${relative}: broken internal reference: ${href}`);
    }
  }
}

if (pages === 0) errors.push('No HTML pages were generated.');
if (errors.length) {
  console.error(errors.join('\n'));
  process.exitCode = 1;
} else {
  console.log(`Checked ${pages} pages: titles, descriptions, canonical URLs and internal links/assets are valid.`);
}
