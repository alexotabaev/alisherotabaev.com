#!/usr/bin/env node
/**
 * Замена страниц-дублей переадресацией на оригинал.
 *
 *   node _tools/hygiene/gone.mjs
 *
 * Список пар — в gone.json, там же объяснение по каждой. Сюда попадает
 * только то, что совпадает с оригиналом дословно.
 *
 * Что делает заглушка:
 *   canonical ведёт на оригинал — поиск склеивает адреса и переносит вес;
 *   мгновенная переадресация уводит на оригинал посетителя и робота;
 *   видимая ссылка остаётся на случай, если переадресация не сработала.
 *
 * Заглушка не помечается noindex намеренно. Робот, увидев запрет, может
 * выбросить адрес вместо того, чтобы передать накопленное оригиналу, —
 * а нам нужно именно передать.
 *
 * Идемпотентный: уже заменённые страницы узнаются по метке и пропускаются.
 *
 * Падает, если исходной страницы нет или цель не существует. Молчаливый
 * пропуск здесь опаснее всего: отчёт скажет «сделано», а дубль останется
 * висеть в выдаче.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { site, esc, ld } from '../shared/layout.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
process.chdir(ROOT);

const MARK = '<!-- gone:redirect -->';

const { redirects } = JSON.parse(fs.readFileSync(path.join(HERE, 'gone.json'), 'utf8'));

/** Файл, в котором лежит страница по такому адресу. */
const fileOf = (slug) => {
  const p = slug.replace(/^\//, '').replace(/\/$/, '');
  for (const c of [p, path.join(p, 'index.html'), p + '.html']) {
    if (fs.existsSync(c) && fs.statSync(c).isFile()) return c;
  }
  return null;
};

const stub = (to, title) => `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
${MARK}
<title>${esc(title)} — страница переехала</title>
<link rel="canonical" href="${site.origin}${to}">
<meta http-equiv="refresh" content="0; url=${to}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:type" content="website">
<meta property="og:url" content="${site.origin}${to}">
<meta name="description" content="Страница переехала на ${site.origin}${to}">
<script type="application/ld+json">${ld({
  '@context': 'https://schema.org',
  '@type': 'WebPage',
  name: title,
  url: site.origin + to,
})}</script>
<style>body{font:16px/1.6 system-ui,sans-serif;margin:4rem auto;max-width:34rem;padding:0 1rem}</style>
</head>
<body>
<h1>Страница переехала</h1>
<p>Она теперь здесь: <a href="${to}">${site.origin}${to}</a></p>
</body>
</html>
`;

let done = 0;
let already = 0;

for (const [from, { to, why }] of Object.entries(redirects)) {
  if (!fileOf(to)) {
    throw new Error(`gone.json: цель ${to} (для /${from}) не существует`);
  }
  const file = fileOf(from);
  if (!file) {
    throw new Error(`gone.json: страницы /${from} нет — уберите её из списка`);
  }

  const cur = fs.readFileSync(file, 'utf8');
  if (cur.includes(MARK)) {
    already++;
    continue;
  }

  // Заголовок берём из самой страницы, пока она ещё на месте.
  const m = cur.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = (m ? m[1] : from).replace(/\s+/g, ' ').replace(/^Copy of\s+/i, '').trim();

  fs.writeFileSync(file, stub(to, title));
  done++;
  console.log(`  /${from} → ${to}  (${why.slice(0, 60)}…)`);
}

console.log(`дублей заменено переадресацией: ${done}, уже стояли: ${already}`);
