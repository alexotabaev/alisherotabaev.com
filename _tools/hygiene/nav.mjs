#!/usr/bin/env node
/**
 * Одно меню на весь сайт.
 *
 *   node _tools/hygiene/nav.mjs
 *
 * До этого меню было пять разных. Сгенерированные разделы несли своё
 * (Главная, Блог, Гайды, Кейсы, Опенсорс, Шаблоны), рукописные страницы —
 * своё («Обо мне, Блог, Гайд 100к»), причём на /about оно короче, чем на
 * главной; страницы из выгрузки Tilda — вовсе чужое, оставшееся от прежнего
 * проекта: «Ресурсы, Проекты, Услуги, Контакты». Человек, переходя между
 * разделами, каждый раз видел другой сайт.
 *
 * Что делает скрипт:
 *
 *   1. вставляет в каждую страницу боковое меню — одинаковое, из site.nav;
 *   2. на широких экранах прячет собственную шапку страницы, чтобы меню не
 *      дублировалось: все три вида шапок обёрнуты в <header> с известными
 *      классами (site, site-header, t-records);
 *   3. на рукописных страницах приводит список ссылок в шапке к тому же
 *      site.nav — их видно на узких экранах, где бокового меню нет.
 *
 * Страницы Tilda в пункте 3 не трогаются: там меню собрано из абсолютно
 * позиционированных блоков, и переписать список ссылок, не сломав вёрстку,
 * нельзя. На узких экранах у них остаётся прежняя шапка — это хуже, чем
 * хотелось бы, но лучше, чем поехавшая страница. Пункты 1 и 2 работают и там.
 *
 * Идемпотентный: свой блок снимается перед вставкой.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { site, esc } from '../shared/layout.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
process.chdir(ROOT);

const START = '<!-- nav:start (генерируется _tools/hygiene/nav.mjs) -->';
const END = '<!-- nav:end -->';
const reBlock = new RegExp(
  START.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '[\\s\\S]*?' + END.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\n?'
);

/* ---------- какие страницы трогаем ---------- */

const disallow = fs
  .readFileSync('robots.txt', 'utf8')
  .split('\n')
  .filter((l) => l.startsWith('Disallow:'))
  .map((l) => l.slice(9).trim())
  .filter(Boolean)
  .map((d) => d.replace(/\*$/, ''));

const isBlocked = (url) =>
  disallow.some((d) => {
    const p = d.replace(/\/$/, '');
    return url === p || url.startsWith(p + '/');
  });

function collect() {
  const out = [];
  const walk = (dir, depth) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.name.startsWith('.') || e.name.startsWith('_')) continue;
      const p = path.join(dir, e.name).replace(/^\.\//, '');
      if (e.isDirectory()) {
        if (['images', 'css', 'js', 'files'].includes(e.name)) continue;
        if (depth < 3) walk(p, depth + 1);
      } else if (e.name === 'index.html') out.push(p);
    }
  };
  walk('.', 0);
  out.push(...fs.readdirSync('.').filter((f) => /^page\d+\.html$/.test(f)));
  return out;
}

/* ---------- меню ---------- */

const SIDE_CSS = `<style>
.ao-side{display:none}
@media (min-width:1200px){
.ao-side{display:flex;flex-direction:column;gap:6px;position:fixed;left:0;top:0;bottom:0;
 width:248px;z-index:9000;padding:26px 18px;box-sizing:border-box;overflow-y:auto;
 background:#faf8f4;border-right:1px solid #e8e1d6;
 font:16px/1.5 'Roboto',Arial,Helvetica,sans-serif}
.ao-side__logo{display:block;margin:0 6px 22px}
.ao-side__logo img{display:block;height:40px;width:auto}
.ao-side__list{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:2px}
.ao-side__list a{display:block;padding:10px 12px;border-radius:8px;color:#000d29;
 text-decoration:none;font-weight:500}
.ao-side__list a:hover,.ao-side__list a:focus{background:#f3ede3;color:#876638}
.ao-side__tg{margin-top:auto;display:block;text-align:center;background:#000d29;color:#fff;
 text-decoration:none;padding:12px 14px;border-radius:9px;font-weight:600}
.ao-side__tg:hover,.ao-side__tg:focus{background:#876638;color:#fff}
/* собственные шапки страниц: на широком экране их заменяет боковое меню */
header.site,header.site-header,header.t-records{display:none !important}
body{padding-left:248px}
}
</style>`;

const SIDE_HTML = `<nav class="ao-side" aria-label="Разделы сайта">
<a class="ao-side__logo" href="/"><img src="${site.logo}" width="42" height="40" alt="Алишер Отабаев — главная страница" /></a>
<ul class="ao-side__list">
${site.nav.map((n) => `<li><a href="${n.u}">${esc(n.t)}</a></li>`).join('\n')}
</ul>
<a class="ao-side__tg" href="${site.telegram}" target="_blank" rel="noopener">Telegram-канал</a>
</nav>`;

const BLOCK = [START, SIDE_CSS, SIDE_HTML, END].join('\n');

/** Ссылки для рукописной шапки — тот же site.nav плюс Telegram. */
const HAND_NAV =
  site.nav.map((n) => `      <a href="${n.u}">${esc(n.t)}</a>`).join('\n') +
  `\n      <a href="${site.telegram}" target="_blank" rel="noopener">Telegram</a>`;

/* ---------- обработка ---------- */

let injected = 0;
let normalized = 0;
let skipped = 0;
const noBody = [];

for (const file of collect()) {
  const url =
    file === 'index.html' ? '/' : file.endsWith('/index.html') ? '/' + path.dirname(file) : '/' + file;
  if (isBlocked(url || '/')) {
    skipped++;
    continue;
  }

  const src = fs.readFileSync(file, 'utf8');
  let s = src.replace(reBlock, '');

  // Список ссылок в рукописной шапке — к общему виду. Тег <nav> у неё один
  // и с известным классом, поэтому замена точная.
  const handRe = /(<nav class="site-header__nav">)([\s\S]*?)(<\/nav>)/;
  if (handRe.test(s)) {
    const before = s;
    s = s.replace(handRe, (_m, open, _inner, close) => `${open}\n${HAND_NAV}\n    ${close}`);
    if (s !== before) normalized++;
  }

  // Боковое меню сразу после <body>: оно позиционируется абсолютно и от
  // места вставки не зависит, но в начале его точно не проглотит чужой блок.
  const m = s.match(/<body[^>]*>/i);
  if (!m) {
    noBody.push(file);
    continue;
  }
  s = s.replace(m[0], m[0] + '\n' + BLOCK);
  injected++;

  if (s !== src) fs.writeFileSync(file, s);
}

if (noBody.length) {
  throw new Error(
    `нет тега <body>, меню вставить некуда: ${noBody.join(', ')}. ` +
      `Молча пропустить нельзя — страница осталась бы без навигации`
  );
}

console.log(`меню вставлено:       ${injected}`);
console.log(`шапок приведено:      ${normalized}`);
console.log(`пропущено (закрыты):  ${skipped}`);
