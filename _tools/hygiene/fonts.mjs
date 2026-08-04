#!/usr/bin/env node
/**
 * Переводит страницы с Google Fonts на шрифты со своего домена.
 *
 *   node _tools/hygiene/fonts.mjs
 *
 * Экспорт Tilda подключает Open Sans и Roboto с fonts.googleapis.com. Это два
 * лишних соединения к чужим доменам, блокирующий запрос CSS перед отрисовкой
 * и передача IP посетителя третьей стороне на каждой загрузке.
 *
 * Файлы лежат в files/fonts, вариативные: одно начертание на сабсет покрывает
 * весь диапазон толщин, который запрашивала Tilda (300..800 у Open Sans,
 * 300–700 у Roboto). unicode-range оставляет браузеру только нужные сабсеты —
 * русская страница качает два файла вместо шести.
 *
 * Заменяется только <link> на googleapis: сам набор шрифтов и начертаний
 * не меняется, поэтому вёрстка остаётся прежней.
 *
 * Идемпотентный.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
process.chdir(ROOT);

const START = '<!-- fonts:start (генерируется _tools/hygiene/fonts.mjs) -->';
const END = '<!-- fonts:end -->';
const reBlock = new RegExp(
  START.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '[\\s\\S]*?' + END.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\n?'
);

const CYR = 'U+0301, U+0400-045F, U+0490-0491, U+04B0-04B1, U+2116';
const LAT =
  'U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, ' +
  'U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD';
const LATEXT =
  'U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, ' +
  'U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF';

const FACES = [
  ['Open Sans', 'open-sans-cyrillic.woff2', CYR],
  ['Open Sans', 'open-sans-latin.woff2', LAT],
  ['Open Sans', 'open-sans-latin-ext.woff2', LATEXT],
  ['Roboto', 'roboto-cyrillic.woff2', CYR],
  ['Roboto', 'roboto-latin.woff2', LAT],
  ['Roboto', 'roboto-latin-ext.woff2', LATEXT],
];

for (const [, file] of FACES) {
  if (!fs.existsSync(path.join('files/fonts', file))) throw new Error(`нет файла шрифта: ${file}`);
}

const css = FACES.map(
  ([family, file, range]) => `  @font-face{font-family:'${family}';font-style:normal;font-weight:100 900;` +
    `font-display:swap;src:url('/files/fonts/${file}') format('woff2');unicode-range:${range};}`
).join('\n');

const BLOCK = [
  START,
  '<style>',
  css,
  '</style>',
  '<link rel="preload" href="/files/fonts/open-sans-cyrillic.woff2" as="font" type="font/woff2" crossorigin />',
  END,
].join('\n');

function collect() {
  const out = [];
  const walk = (dir, depth) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.name.startsWith('.') || e.name.startsWith('_')) continue;
      const p = path.join(dir, e.name).replace(/^\.\//, '');
      if (e.isDirectory()) {
        if (['images', 'css', 'js', 'files'].includes(e.name)) continue;
        if (depth < 2) walk(p, depth + 1);
      } else if (e.name.endsWith('.html')) out.push(p);
    }
  };
  walk('.', 0);
  return out;
}

let patched = 0;
let removed = 0;

for (const file of collect()) {
  let s = fs.readFileSync(file, 'utf8').replace(reBlock, '');
  const before = s;

  // Условие вставки нельзя завязывать на присутствие ссылок Google: после
  // первого прогона их уже нет, и блок со шрифтами перестал бы возвращаться —
  // страница откатилась бы на системный шрифт. Ориентируемся на то, какие
  // семейства реально использует CSS страницы.
  const links = s.match(/[ \t]*<link[^>]*fonts\.(?:googleapis|gstatic)\.com[^>]*>\n?/g) || [];
  const needsFonts = /font-family\s*:[^;}]*(Open Sans|Roboto)/i.test(s);
  const hasOwnFaces = /@font-face[\s\S]{0,400}\/files\/fonts\//.test(s);

  if ((!links.length && !needsFonts) || hasOwnFaces) {
    if (links.length) {
      removed += links.length;
      s = s.replace(/[ \t]*<link[^>]*fonts\.(?:googleapis|gstatic)\.com[^>]*>\n?/g, '');
    }
    if (s !== fs.readFileSync(file, 'utf8')) fs.writeFileSync(file, s);
    continue;
  }
  removed += links.length;
  s = s.replace(/[ \t]*<link[^>]*fonts\.(?:googleapis|gstatic)\.com[^>]*>\n?/g, '');

  if (s.includes('</head>')) s = s.replace('</head>', BLOCK + '\n</head>');
  else if (/<body[\s>]/i.test(s)) s = s.replace(/<body[\s>]/i, (m) => BLOCK + '\n' + m);
  else throw new Error(`${file}: некуда вставить шрифты`);

  if (s !== before) {
    fs.writeFileSync(file, s);
    patched++;
  }
}

console.log(`страниц переведено на свои шрифты: ${patched}`);
console.log(`убрано <link> на Google: ${removed}`);
