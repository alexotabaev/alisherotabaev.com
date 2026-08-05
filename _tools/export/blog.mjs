#!/usr/bin/env node
/**
 * Выгрузка статей блога для переноса на другой сайт.
 *
 *   node _tools/export/blog.mjs [папка]
 *
 * По умолчанию кладёт в _export/blog/. Папка выгрузки в репозиторий не
 * коммитится — это разовый пакет для переноса, а не часть сайта.
 *
 * Что получается на каждую статью: файл .md с заголовком-шапкой (front
 * matter) и текстом. Формат выбран из-за переносимости — его понимают
 * WordPress, Ghost, Tilda и статические генераторы. Рядом кладётся файл
 * .html с исходной разметкой: если импорт умеет HTML, брать лучше его —
 * переносы и вложенность гарантированно не поедут.
 *
 * Призыв «Хотите системный онлайн-бизнес?» из конца статьи вырезается:
 * это обвязка этого сайта, на другом блоге она не нужна.
 *
 * Статус везде draft. Владелец просил, чтобы публикация планировалась
 * отдельно, а не происходила при импорте.
 *
 * Список статей — _tools/export/blog.json. Туда попадают только те, что
 * уезжают; какие именно, решал владелец.
 *
 * Падает, если статьи из списка нет на диске: молчаливо выгрузить 45 из
 * 46 хуже, чем не выгрузить ничего.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
process.chdir(ROOT);

const OUT = path.resolve(ROOT, process.argv[2] || '_export/blog');
const { origin, slugs } = JSON.parse(fs.readFileSync(path.join(HERE, 'blog.json'), 'utf8'));

const dec = (s) =>
  s
    .replace(/&nbsp;/g, ' ')
    .replace(/&mdash;/g, '—')
    .replace(/&ndash;/g, '–')
    .replace(/&laquo;/g, '«')
    .replace(/&raquo;/g, '»')
    .replace(/&hellip;/g, '…')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');

const text = (html) => dec(html.replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();

/** Грубое приведение к markdown: заголовки, списки, ссылки, выделение. */
function toMarkdown(html) {
  let s = html;
  s = s.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, '');
  s = s.replace(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi,
    (_m, href, inner) => `[${text(inner)}](${href})`);
  s = s.replace(/<(strong|b)\b[^>]*>([\s\S]*?)<\/\1>/gi, (_m, _t, i) => `**${text(i)}**`);
  s = s.replace(/<(em|i)\b[^>]*>([\s\S]*?)<\/\1>/gi, (_m, _t, i) => `*${text(i)}*`);
  s = s.replace(/<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/gi,
    (_m, lvl, i) => `\n\n${'#'.repeat(Number(lvl))} ${text(i)}\n\n`);
  s = s.replace(/<li\b[^>]*>([\s\S]*?)<\/li>/gi, (_m, i) => `\n- ${text(i)}`);
  s = s.replace(/<\/(ul|ol)>/gi, '\n\n');
  s = s.replace(/<br\s*\/?>/gi, '\n');
  s = s.replace(/<p\b[^>]*>([\s\S]*?)<\/p>/gi, (_m, i) => `\n\n${text(i)}\n\n`);
  s = s.replace(/<blockquote\b[^>]*>([\s\S]*?)<\/blockquote>/gi,
    (_m, i) => `\n\n> ${text(i)}\n\n`);
  s = s.replace(/<img\b[^>]*src=["']([^"']+)["'][^>]*>/gi, (_m, src) => `\n\n![](${src})\n\n`);
  s = s.replace(/<[^>]+>/g, '');
  return dec(s).replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

const yaml = (v) => `"${String(v).replace(/"/g, '\\"')}"`;

fs.mkdirSync(OUT, { recursive: true });
const manifest = [];

for (const slug of slugs) {
  const file = path.join(ROOT, 'blog', slug, 'index.html');
  if (!fs.existsSync(file)) {
    throw new Error(`blog.json: статьи /blog/${slug}/ нет — уберите её из списка`);
  }
  const src = fs.readFileSync(file, 'utf8');

  const title = dec((src.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i) || [, slug])[1]).trim();
  const desc = dec((src.match(/<meta[^>]+name="description"[^>]*content="([^"]*)"/i) || [, ''])[1]);
  const pub = (src.match(/Опубликовано[\s\S]*?datetime="([\d-]+)"/) || [, ''])[1];
  const mod = (src.match(/обновлено[\s\S]*?datetime="([\d-]+)"/) || [, ''])[1];

  let body = (src.match(/<article[^>]*>([\s\S]*?)<\/article>/i) || [, ''])[1];
  // строку с датами публикации переносить не надо: даты уже в шапке файла
  body = body.replace(/<!-- dates:start[\s\S]*?dates:end -->/g, '');
  // призыв в конце статьи — обвязка этого сайта, на другом блоге она лишняя
  body = body.replace(/<div class="cta">[\s\S]*?<\/div>/g, '');

  const md = toMarkdown(body);
  const front = [
    '---',
    `title: ${yaml(title)}`,
    `slug: ${yaml(slug)}`,
    `status: "draft"`,
    desc ? `description: ${yaml(desc)}` : null,
    pub ? `date: ${yaml(pub)}` : null,
    mod ? `updated: ${yaml(mod)}` : null,
    `original_url: ${yaml(`${origin}/blog/${slug}`)}`,
    `redirect_from: ${yaml(`/blog/${slug}`)}`,
    '---',
    '',
    '',
  ].filter((x) => x !== null).join('\n');

  fs.writeFileSync(path.join(OUT, `${slug}.md`), front + md + '\n');
  fs.writeFileSync(
    path.join(OUT, `${slug}.html`),
    `<!-- ${origin}/blog/${slug} -->\n${body.trim()}\n`
  );

  manifest.push({ slug, title, words: md.split(/\s+/).length, pub, mod });
}

const csv = ['slug,title,words,published,updated']
  .concat(manifest.map((m) => [
    m.slug, `"${m.title.replace(/"/g, '""')}"`, m.words, m.pub, m.mod,
  ].join(',')))
  .join('\n');
fs.writeFileSync(path.join(OUT, 'manifest.csv'), csv + '\n');

console.log(`выгружено статей: ${manifest.length} → ${path.relative(ROOT, OUT)}/`);
console.log(`  .md — текст с шапкой, .html — исходная разметка, manifest.csv — список`);
