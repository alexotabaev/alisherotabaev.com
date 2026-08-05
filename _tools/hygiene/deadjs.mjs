#!/usr/bin/env node
/**
 * Снимает скрипты форм со страниц, где форм нет.
 *
 *   node _tools/hygiene/deadjs.mjs [--dry]
 *
 * В выгрузке Tilda набор скриптов подключается блоком, а не по надобности.
 * После того как с кейсов убрали формы, на этих страницах остались
 * tilda-forms и его родня — от 98 до 166 КБ, которые браузер честно
 * скачивает и разбирает ради ничего.
 *
 * Скрипт удаляет подключение, только если на странице действительно нет
 * ни одного тега <form>. Функции, которыми пользуется остальная вёрстка
 * (t702_initPopup и подобные), определены в tilda-blocks-*.js — это другой
 * файл, его не трогаем.
 *
 * Идемпотентный: снимать нечего, повторный прогон ничего не меняет.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
process.chdir(ROOT);

const DRY = process.argv.includes('--dry');

// Скрипты, которые нужны исключительно формам.
const FORM_JS = /tilda-(forms|conditional-form|step-form|zero-forms|t862-popupstepform)-[\d.]+\.min\.js/i;

function collect() {
  const out = [];
  const walk = (dir, depth) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.name.startsWith('.') || e.name.startsWith('_')) continue;
      const p = path.join(dir, e.name).replace(/^\.\//, '');
      if (e.isDirectory()) {
        if (['images', 'css', 'js', 'files'].includes(e.name)) continue;
        if (depth < 3) walk(p, depth + 1);
      } else if (e.name.endsWith('.html')) out.push(p);
    }
  };
  walk('.', 0);
  return out;
}

const sizeOf = (src) => {
  const p = src.replace(/^\//, '');
  return fs.existsSync(p) ? fs.statSync(p).size : 0;
};

let pages = 0;
let removed = 0;
let saved = 0;

for (const file of collect()) {
  const src = fs.readFileSync(file, 'utf8');
  if (/<form\b/i.test(src)) continue;
  if (!FORM_JS.test(src)) continue;

  let n = 0;
  let bytes = 0;
  const s = src.replace(
    /[ \t]*<script[^>]+src="([^"]+)"[^>]*>\s*<\/script>\n?/gi,
    (m, url) => {
      if (!FORM_JS.test(url)) return m;
      n++;
      bytes += sizeOf(url);
      return '';
    }
  );

  if (n) {
    if (!DRY) fs.writeFileSync(file, s);
    pages++;
    removed += n;
    saved += bytes;
  }
}

console.log(
  `${DRY ? '[проверка] ' : ''}скриптов форм снято: ${removed} на ${pages} страницах, ` +
    `${(saved / 1024).toFixed(0)} КБ меньше загрузки`
);
