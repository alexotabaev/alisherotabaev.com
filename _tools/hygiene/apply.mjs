#!/usr/bin/env node
/**
 * Гигиена индексации.
 *
 *   node _tools/hygiene/apply.mjs
 *
 * Два действия:
 *
 * 1. Служебным страницам из noindex.json проставляет
 *    <meta name="robots" content="noindex,follow">.
 *
 *    Почему не robots.txt: запрет обхода мешает роботу прочитать сам noindex,
 *    и уже известный ему URL остаётся в индексе — без описания, но остаётся.
 *    Чтобы страница ушла из выдачи, её нужно разрешить обходить и отдать
 *    noindex. Именно так здесь и сделано.
 *
 * 2. Чинит битые canonical: экспорт Tilda оставил у корневых /pageXXXX.html
 *    адреса вида «alisherotabaev.com//page...» с двойным слэшем. Для поисковика
 *    это другой URL, то есть страница указывала canonical сама не на себя.
 *
 * 3. Фрагменты Tilda в /files/ закрывает через robots.txt.
 *
 *    Здесь наоборот: это не страницы, а куски разметки без <html>, <title>
 *    и <head>. Вставить в них мета-тег некуда, а ссылок на них нет ни в HTML,
 *    ни в JS — значит в индекс они попасть не успели, и запрета обхода хватает.
 *
 * Скрипт идемпотентный: повторный запуск ничего не меняет.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const { pages } = JSON.parse(fs.readFileSync(path.join(HERE, 'noindex.json'), 'utf8'));

const START = '<!-- hygiene:start (генерируется _tools/hygiene/apply.mjs) -->';
const END = '<!-- hygiene:end -->';
const reBlock = new RegExp(
  START.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '[\\s\\S]*?' + END.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\n?'
);

/* ---------- 1. noindex на служебные страницы ---------- */

let done = 0;
for (const { slug, why } of pages) {
  const file = path.join(ROOT, slug, 'index.html');
  if (!fs.existsSync(file)) {
    console.warn(`  ⚠ /${slug}/ — файла нет, пропускаю`);
    continue;
  }
  let s = fs.readFileSync(file, 'utf8').replace(reBlock, '');
  // Ранее выставленные Tilda robots-теги убираем, чтобы не спорили с нашим
  s = s.replace(/[ \t]*<meta name="robots"[^>]*>\n?/g, '');

  const block = [START, `<meta name="robots" content="noindex,follow" />`, `<!-- ${why} -->`, END].join('\n');

  // Не у всех страниц есть <head>: часть написана вручную и состоит из
  // <!doctype>, <title> и сразу <body>. Ставим блок туда, куда получится,
  // и падаем, если не получилось нигде — молчаливый пропуск здесь опаснее
  // ошибки: страница осталась бы в индексе, а отчёт сказал бы «закрыта».
  if (s.includes('</head>')) {
    s = s.replace('</head>', block + '\n</head>');
  } else if (/<body[\s>]/i.test(s)) {
    s = s.replace(/<body[\s>]/i, (m) => block + '\n' + m);
  } else if (s.includes('</title>')) {
    s = s.replace('</title>', '</title>\n' + block);
  } else {
    throw new Error(`/${slug}/: некуда вставить мета-тег — нет ни </head>, ни <body>, ни </title>`);
  }

  fs.writeFileSync(file, s);
  console.log(`  noindex  /${slug}/  — ${why}`);
  done++;
}

/* ---------- 2. битые canonical с двойным слэшем ---------- */

const badUrl = 'https://alisherotabaev.com//';
const goodUrl = 'https://alisherotabaev.com/';
let fixedCanonical = 0;

for (const f of fs.readdirSync(ROOT)) {
  if (!/^page\d+\.html$/.test(f)) continue;
  const file = path.join(ROOT, f);
  const s = fs.readFileSync(file, 'utf8');
  if (!s.includes(badUrl)) continue;
  fs.writeFileSync(file, s.split(badUrl).join(goodUrl));
  fixedCanonical++;
}

/* ---------- 3. фрагменты Tilda ---------- */

const robotsFile = path.join(ROOT, 'robots.txt');
let robots = fs.readFileSync(robotsFile, 'utf8');
const RULE = 'Disallow: /files/*.html';
let fragments = 0;

if (!robots.includes(RULE)) {
  // Ставим в конец списка Disallow, перед пустой строкой и Sitemap
  robots = robots.replace(
    /\n\nSitemap:/,
    `\n${RULE}\n\nSitemap:`
  );
  fs.writeFileSync(robotsFile, robots);
}
fragments = fs.readdirSync(path.join(ROOT, 'files')).filter((f) => f.endsWith('.html')).length;

console.log(`\nстраниц закрыто от индексации: ${done}`);
console.log(`страниц с починенным canonical: ${fixedCanonical}`);
console.log(`фрагментов Tilda под запретом обхода: ${fragments} (правило ${RULE})`);
