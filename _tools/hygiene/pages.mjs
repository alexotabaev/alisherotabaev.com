#!/usr/bin/env node
/**
 * Технический фундамент: доводит индексируемые страницы до общего минимума.
 *
 *   node _tools/hygiene/pages.mjs
 *
 * Добавляет только то, чего на странице нет:
 *   - lang у <html> — язык определяется по содержимому, а не ставится наугад;
 *   - canonical на саму себя, если его нет;
 *   - Open Graph (og:title / og:type / og:url / og:site_name / og:locale);
 *   - разметку Schema.org WebPage со связью с автором и сайтом;
 *   - meta description, собранный из собственного текста страницы.
 *
 * Описание пишется не всегда. Наивный «первый абзац» даёт мусор: на пяти
 * страницах вакансий это один и тот же текст про обучающие программы, у
 * юридических документов — обрывок пункта «1.1. Для целей настоящего
 * Договора...», а где-то просто повтор заголовка. Одинаковые описания на
 * разных страницах хуже, чем их отсутствие: без описания поисковик соберёт
 * сниппет сам, а дубли он считает признаком некачественного сайта. Поэтому
 * кандидат проходит фильтры, и не прошедшие страницы остаются без описания.
 *
 * Ничего не перезаписывает: если тег уже есть — страница пропускается по
 * этому пункту. Поэтому скрипт безопасно гонять поверх страниц, собранных
 * генераторами разделов, — там всё уже стоит, и он их не тронет.
 *
 * Страницы, закрытые в robots.txt или несущие noindex, не трогаются вовсе:
 * приводить в порядок то, что не должно попасть в выдачу, смысла нет.
 *
 * Скрипт идемпотентный.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { site, abs, esc, ld } from '../shared/layout.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
process.chdir(ROOT);

const START = '<!-- meta:start (генерируется _tools/hygiene/pages.mjs) -->';
const END = '<!-- meta:end -->';
const reBlock = new RegExp(
  START.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '[\\s\\S]*?' + END.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\n?'
);

/* ---------- какие страницы вообще трогаем ---------- */

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
        if (depth < 2) walk(p, depth + 1);
      } else if (e.name === 'index.html') out.push(p);
    }
  };
  walk('.', 0);
  out.push(...fs.readdirSync('.').filter((f) => /^page\d+\.html$/.test(f)));
  return out;
}

/* ---------- язык по содержимому ---------- */

function langOf(text) {
  let cyr = 0;
  let lat = 0;
  for (const ch of text) {
    if (/[а-яё]/i.test(ch)) cyr++;
    else if (/[a-z]/i.test(ch)) lat++;
  }
  if (cyr + lat < 12) return null;
  if (cyr > lat) return 'ru';
  if (lat > cyr * 5) return 'en';
  return null;
}

/**
 * Язык страницы. Сначала по <title> и описанию: это собственный текст страницы.
 * Тело в расчёт идёт только если заголовок молчит — в вёрстке Tilda осталась
 * английская рыба из демо-шаблона («I am ready for a long road flight...»,
 * 114 страниц), и по телу русская страница легко определяется как английская.
 */
function detectLang(html) {
  const title = (html.match(/<title>([\s\S]*?)<\/title>/) || [, ''])[1];
  const descr = (html.match(/<meta[^>]+name="description"[^>]+content="([^"]*)"/) || [, ''])[1];
  const own = langOf(title + ' ' + descr);
  if (own) return own;

  const body = html.replace(/<(script|style|svg)[\s\S]*?<\/\1>/g, '').replace(/<[^>]+>/g, ' ');
  const l = langOf(body);
  return l;
}

/* ---------- описание из собственного текста страницы ---------- */

// Куски чужого и шаблонного текста, которые не должны попасть в описание
const NOISE = [
  'I am ready for a long road',
  'Everything that you dreamed of',
  'Ресурсы Проекты Услуги Контакты',
  'Книги Блог Академия',
  'Консалтинг Коучинг',
  'OUR COMPANY',
  // служебные подписи форм — не описывают страницу
  'Нажимая на кнопку',
  'согласие на обработку персональных данных',
  'попасть в папку СПАМ',
  'соглашаетесь с нашей политикой',
];

function describeCandidate(html, title) {
  const body = html.replace(/<(script|style|svg|nav|header|footer)[\s\S]*?<\/\1>/gi, '');
  for (const raw of body.match(/>([^<>]{60,400})</g) || []) {
    const t = raw
      .slice(1, -1)
      .replace(/&nbsp;/g, ' ')
      .replace(/&[a-z]+;/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    if (t.length < 60) continue;
    if (NOISE.some((n) => t.includes(n))) continue;
    if (/[{};]/.test(t)) continue;                       // остатки стилей и скриптов
    if (/^\d+[.)]/.test(t)) continue;                    // «1.1. Для целей настоящего Договора»
    if (t.toLowerCase().startsWith(title.toLowerCase().slice(0, 25))) continue;  // повтор заголовка
    if (/^https?:\/\//i.test(t)) continue;               // голая ссылка вместо текста
    if (/^[^А-ЯЁA-Z0-9]/.test(t)) continue;              // начинается с «—», «*», «•» — обрывок
    if (/^(тогда|поэтому|а также|и |но )/i.test(t)) continue;  // продолжение чужого предложения

    const letters = t.replace(/[^А-ЯЁA-Zа-яёa-z]/g, '');
    const upper = letters.replace(/[^А-ЯЁA-Z]/g, '').length;
    if (letters.length > 10 && upper / letters.length > 0.7) continue;  // набрано капсом

    return t.length > 250 ? t.slice(0, 250).replace(/\s+\S*$/, '') + '…' : t;
  }
  return null;
}

/* ---------- обработка ---------- */

const stat = { lang: 0, og: 0, schema: 0, descr: 0, canonical: 0, skipped: 0, unknownLang: [], noDescr: [] };

// Первый проход: собираем кандидатов в описания и считаем, сколько раз
// встречается каждый текст. Всё, что повторяется, отбрасываем целиком.
const candidates = new Map();
const seen = new Map();
for (const file of collect()) {
  // Свой прошлый блок снимаем до проверок: иначе скрипт увидит описание,
  // которое сам же и поставил, решит «уже есть» — а дальше по коду блок
  // всё равно снимется, и описание пропадёт при каждом повторном запуске.
  const s = fs.readFileSync(file, 'utf8').replace(reBlock, '');
  if (/<meta[^>]+name="description"/i.test(s)) continue;
  // Закрытые страницы в подсчёте дублей не участвуют: иначе хорошее описание
  // на живой странице отбрасывается из-за совпадения с той, что уже не в индексе.
  const u = file === 'index.html' ? '/' : file.endsWith('/index.html') ? '/' + path.dirname(file) + '/' : '/' + file;
  if (isBlocked(u.replace(/\/$/, '') || '/')) continue;
  if (/<meta[^>]+name="robots"[^>]+content="[^"]*noindex/i.test(s)) continue;
  const title = (s.match(/<title>([\s\S]*?)<\/title>/) || [, ''])[1].trim();
  if (!title) continue;
  const c = describeCandidate(s, title);
  if (!c) continue;
  candidates.set(file, c);
  seen.set(c, (seen.get(c) || 0) + 1);
}
for (const [file, c] of candidates) if (seen.get(c) > 1) candidates.delete(file);

for (const file of collect()) {
  const url = file === 'index.html' ? '/' : file.endsWith('/index.html') ? '/' + path.dirname(file) + '/' : '/' + file;
  if (isBlocked(url.replace(/\/$/, '') || '/')) {
    stat.skipped++;
    continue;
  }

  let s = fs.readFileSync(file, 'utf8');
  if (/<meta[^>]+name="robots"[^>]+content="[^"]*noindex/i.test(s)) {
    stat.skipped++;
    continue;
  }

  s = s.replace(reBlock, '');
  const before = s;

  // lang у <html>
  if (/<html(?![^>]*\blang=)/i.test(s)) {
    const lang = detectLang(s);
    if (lang) {
      s = s.replace(/<html(?![^>]*\blang=)([^>]*)>/i, `<html lang="${lang}"$1>`);
      stat.lang++;
    } else {
      stat.unknownLang.push(url);
    }
  }

  const title = (s.match(/<title>([\s\S]*?)<\/title>/) || [, ''])[1].trim();
  const descr = (s.match(/<meta[^>]+name="description"[^>]+content="([^"]*)"/) || [, ''])[1];

  const add = [];

  // canonical на саму себя. Tilda выдала его почти везде, но не всем —
  // без него две версии адреса (со слэшем и без) конкурируют друг с другом.
  if (!/rel="canonical"/i.test(s)) {
    add.push(`<link rel="canonical" href="${esc(abs(url))}" />`);
    stat.canonical++;
  }

  if (!descr && candidates.has(file)) {
    add.push(`<meta name="description" content="${esc(candidates.get(file))}" />`);
    stat.descr++;
  } else if (!descr) {
    stat.noDescr.push(url);
  }
  if (!/property="og:title"/.test(s) && title) {
    add.push(`<meta property="og:title" content="${esc(title)}" />`);
    add.push(`<meta property="og:type" content="website" />`);
    add.push(`<meta property="og:url" content="${esc(abs(url))}" />`);
    if (descr) add.push(`<meta property="og:description" content="${esc(descr)}" />`);
    stat.og++;
  }
  if (!/property="og:site_name"/.test(s)) {
    add.push(`<meta property="og:site_name" content="${esc(site.author)}" />`);
    add.push(`<meta property="og:locale" content="ru_RU" />`);
  }

  if (!/application\/ld\+json/.test(s) && title) {
    const jsonld = {
      '@context': 'https://schema.org',
      '@type': 'WebPage',
      name: title,
      url: abs(url),
      inLanguage: 'ru-RU',
      ...(descr ? { description: descr } : {}),
      isPartOf: { '@type': 'WebSite', name: site.author, url: site.origin + '/' },
      author: { '@type': 'Person', name: site.author, url: site.authorUrl },
    };
    add.push(`<script type="application/ld+json">${ld(jsonld)}</script>`);
    stat.schema++;
  }

  if (add.length) {
    const block = [START, ...add, END].join('\n');
    if (s.includes('</head>')) s = s.replace('</head>', block + '\n</head>');
    else if (/<body[\s>]/i.test(s)) s = s.replace(/<body[\s>]/i, (m) => block + '\n' + m);
    else throw new Error(`${file}: некуда вставить мета-блок`);
  }

  if (s !== before) fs.writeFileSync(file, s);
}

console.log(`lang проставлен:      ${stat.lang}`);
console.log(`Open Graph добавлен:  ${stat.og}`);
console.log(`Schema.org добавлена: ${stat.schema}`);
console.log(`описание добавлено:   ${stat.descr}`);
console.log(`canonical добавлен:   ${stat.canonical}`);
console.log(`пропущено (закрыты):  ${stat.skipped}`);
if (stat.noDescr.length) {
  console.log(`\nбез описания осталось ${stat.noDescr.length} — свой текст не прошёл фильтры,`);
  console.log(`сниппет соберёт поисковик; лучше вписать вручную:`);
  for (const u of stat.noDescr.slice(0, 12)) console.log(`   ${u}`);
}
if (stat.unknownLang.length) {
  console.log(`\nязык не определён однозначно (${stat.unknownLang.length}) — оставлены как есть:`);
  for (const u of stat.unknownLang.slice(0, 10)) console.log(`   ${u}`);
}
