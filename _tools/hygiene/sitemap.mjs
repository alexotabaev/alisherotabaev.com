#!/usr/bin/env node
/**
 * Пересборка sitemap.xml по фактическому состоянию сайта.
 *
 *   node _tools/hygiene/sitemap.mjs
 *
 * Запускать последним — после генераторов разделов и после hygiene/apply.mjs,
 * потому что карта строится из того, что реально лежит на диске.
 *
 * В карту попадает страница, для которой верно всё:
 *   - это index.html в директории либо /pageXXXX.html в корне;
 *   - её не запрещает robots.txt;
 *   - на ней нет <meta name="robots" content="noindex">;
 *   - её canonical (если указан) ведёт на неё же — то есть это не дубль.
 *
 * Про lastmod: настоящих дат публикации в исходниках нет (проверено — их нет
 * ни в разметке, ни в истории git, туда всё легло одним импортом). Ставить
 * сегодняшнюю дату всем страницам — враньё, которое поисковик всё равно
 * распознаёт и перестаёт доверять полю. Поэтому lastmod указывается только
 * там, где дата известна: у сгенерированных разделов.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { site } from '../shared/layout.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
process.chdir(ROOT);

/* ---------- правила robots.txt ---------- */

const robots = fs.readFileSync('robots.txt', 'utf8');
const disallow = robots
  .split('\n')
  .filter((l) => l.startsWith('Disallow:'))
  .map((l) => l.slice(9).trim())
  .filter(Boolean)
  .map((d) => d.replace(/\*$/, ''));

const isBlocked = (url) =>
  disallow.some((d) => {
    const p = d.replace(/\/$/, '');
    return url === p || url.startsWith(p + '/') || url === p + '/';
  });

/* ---------- разделы с известной датой ---------- */

const dated = new Map();
for (const f of ['_tools/opensource/data.json', '_tools/cases/data.json']) {
  if (!fs.existsSync(f)) continue;
  const d = JSON.parse(fs.readFileSync(f, 'utf8'));
  if (d.section?.updated) dated.set(d.section.path, d.section.updated);
}

/* ---------- сбор страниц ---------- */

const files = [];
const walk = (dir, depth) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith('.') || e.name.startsWith('_')) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (['images', 'css', 'js', 'files'].includes(e.name)) continue;
      if (depth < 3) walk(p, depth + 1);
    } else if (e.name === 'index.html') {
      files.push(p);
    }
  }
};
walk('.', 0);
files.push(...fs.readdirSync('.').filter((f) => /^page\d+\.html$/.test(f)));

const urls = [];
const skipped = { blocked: 0, noindex: 0, canonical: 0 };

for (const f of files) {
  const url =
    f === 'index.html' ? '/' : f.endsWith('/index.html') ? '/' + path.dirname(f).replace(/^\.\//, '') + '/' : '/' + f;
  if (url.startsWith('/./')) continue;
  if (isBlocked(url.replace(/\/$/, '') || '/')) {
    skipped.blocked++;
    continue;
  }
  const s = fs.readFileSync(f, 'utf8');
  if (/<meta[^>]+name="robots"[^>]+content="[^"]*noindex/i.test(s)) {
    skipped.noindex++;
    continue;
  }
  const can = s.match(/rel="canonical"\s+href="([^"]+)"/i);
  if (can) {
    const target = can[1].replace(site.origin, '');
    if (target.replace(/\/$/, '') !== url.replace(/\/$/, '')) {
      skipped.canonical++;
      continue;
    }
  }
  urls.push(url);
}

urls.sort();

/* ---------- вес страницы ---------- */

function priority(url) {
  if (url === '/') return '1.0';
  if (['/opensource/', '/cases/', '/about/', '/blog/'].includes(url)) return '0.9';
  if (url.startsWith('/opensource/') || url.startsWith('/blog/')) return '0.7';
  return '0.6';
}

const lastmodFor = (url) => {
  for (const [prefix, date] of dated) if (url.startsWith(prefix)) return date;
  return null;
};

const body = urls
  .map((u) => {
    const lm = lastmodFor(u);
    return (
      `\t<url>\n\t\t<loc>${site.origin}${u}</loc>\n` +
      (lm ? `\t\t<lastmod>${lm}</lastmod>\n` : '') +
      `\t\t<priority>${priority(u)}</priority>\n\t</url>`
    );
  })
  .join('\n');

fs.writeFileSync(
  'sitemap.xml',
  '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<!-- Генерируется _tools/hygiene/sitemap.mjs. Руками не править. -->\n' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    body +
    '\n</urlset>\n'
);

console.log(`sitemap.xml: ${urls.length} URL`);
console.log(
  `не включены: ${skipped.blocked} закрыты в robots, ` +
    `${skipped.noindex} с noindex, ${skipped.canonical} дубли по canonical`
);
