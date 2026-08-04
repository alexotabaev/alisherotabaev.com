#!/usr/bin/env node
/**
 * Чинит порядок заголовков.
 *
 *   node _tools/hygiene/headings.mjs
 *
 * Заголовки должны идти без пропусков: после h1 — h2, после h2 — h3. Пропуск
 * уровня ломает структуру документа: программы чтения экрана строят по ней
 * оглавление, а поисковик — иерархию смысла страницы. Lighthouse отмечает это
 * отдельной проверкой (heading-order).
 *
 * Два случая, найденных на сайте:
 *
 *   статьи блога — после h1 сразу h3 у призыва «Хотите системный
 *     онлайн-бизнес?». Это раздел верхнего уровня, ему место на h2;
 *
 *   /about/ — четыре h4 («Близкая связь с экспертами» и соседние) стоят
 *     под h2 «Мои ценности», промежуточного h3 между ними нет.
 *
 * Меняется только уровень тега, текст и оформление не трогаются: внешний вид
 * задаётся классами и CSS, а не номером заголовка.
 *
 * Идемпотентный.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
process.chdir(ROOT);

/** Заменить уровень у всех заголовков с данным классом. */
function relevelByClass(html, cls, from, to) {
  const re = new RegExp(`<h${from}(\\s[^>]*class="[^"]*\\b${cls}\\b[^"]*"[^>]*)>([\\s\\S]*?)</h${from}>`, 'g');
  let n = 0;
  const out = html.replace(re, (_m, attrs, inner) => {
    n++;
    return `<h${to}${attrs}>${inner}</h${to}>`;
  });
  return [out, n];
}

/** Заменить уровень заголовка у элемента с конкретным текстом. */
function relevel(html, text, from, to) {
  const esc = text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`<h${from}(\\s[^>]*)?>(\\s*${esc}[\\s\\S]*?)</h${from}>`, 'g');
  let n = 0;
  const out = html.replace(re, (_m, attrs, inner) => {
    n++;
    return `<h${to}${attrs || ''}>${inner}</h${to}>`;
  });
  return [out, n];
}

// На страницах-списках заголовок карточки шёл h3 сразу после h1: между ними
// нет промежуточного раздела, поэтому карточка — это уровень h2.
const CLASS_RULES = [
  { file: 'blog/index.html', cls: 'post__title', from: 3, to: 2 },
  { file: 'case/index.html', cls: 'case__name', from: 3, to: 2 },
];

const RULES = [
  { glob: 'blog/*/index.html', text: 'Хотите системный онлайн-бизнес', from: 3, to: 2 },
  { file: 'about/index.html', text: 'Близкая связь с экспертами', from: 4, to: 3 },
  { file: 'about/index.html', text: 'Качественный рынок онлайн-образования', from: 4, to: 3 },
  { file: 'about/index.html', text: 'Конкуренция на уровне ценностей', from: 4, to: 3 },
  { file: 'about/index.html', text: 'Атмосфера доверия и открытости', from: 4, to: 3 },
];

const expand = (r) =>
  r.file ? [r.file] : fs.readdirSync('blog', { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => `blog/${e.name}/index.html`)
    .filter((f) => fs.existsSync(f));

let total = 0;
const touched = new Set();

for (const rule of RULES) {
  for (const file of expand(rule)) {
    const s = fs.readFileSync(file, 'utf8');
    const [out, n] = relevel(s, rule.text, rule.from, rule.to);
    if (n) {
      fs.writeFileSync(file, out);
      total += n;
      touched.add(file);
    }
  }
}

for (const rule of CLASS_RULES) {
  if (!fs.existsSync(rule.file)) continue;
  const s = fs.readFileSync(rule.file, 'utf8');
  const [out, n] = relevelByClass(s, rule.cls, rule.from, rule.to);
  if (n) {
    fs.writeFileSync(rule.file, out);
    total += n;
    touched.add(rule.file);
  }
}

console.log(`уровней заголовков исправлено: ${total} на ${touched.size} страницах`);
