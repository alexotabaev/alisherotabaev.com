#!/usr/bin/env node
/**
 * Проставляет alt картинкам, у которых его нет.
 *
 *   node _tools/hygiene/alt.mjs
 *
 * Правила берутся из alt.json: по классу (декорация и иконки рядом с текстом)
 * и по файлу (содержательные картинки, каждая просмотрена глазами).
 *
 * Если попадётся картинка, для которой правила нет, скрипт падает: молча
 * оставить её без alt значит соврать в отчёте, а подставить «изображение» —
 * засорить озвучку экранного диктора. Такую картинку нужно посмотреть и
 * дописать правило.
 *
 * Идемпотентный.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
process.chdir(ROOT);

const rules = JSON.parse(fs.readFileSync(path.join(HERE, 'alt.json'), 'utf8'));

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

const esc = (s) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

let decorative = 0;
let described = 0;
const unknown = [];

for (const file of collect()) {
  const s = fs.readFileSync(file, 'utf8');
  const out = s.replace(/<img\b[^>]*>/g, (tag) => {
    if (/\balt\s*=/.test(tag)) return tag;

    const cls = (tag.match(/class=["']([^"']*)["']/) || [, ''])[1];
    // В src Tilda держит заглушку ленивой загрузки («…__-__empty__файл.png»),
    // настоящий путь лежит в data-original. Берём его, а из имени убираем
    // вставку -__empty__, иначе один и тот же файл выглядит как два разных.
    const rawSrc =
      (tag.match(/data-original=["']([^"']*)["']/) || tag.match(/src=["']([^"']*)["']/) || [, ''])[1];
    const src = rawSrc.replace(/^\//, '').replace(/__-__empty__/, '__');

    let alt = null;
    for (const [k, v] of Object.entries(rules.byClass)) {
      if (cls.includes(k)) {
        alt = v.alt;
        break;
      }
    }
    if (alt === null && rules.byFile[src] !== undefined) alt = rules.byFile[src];

    if (alt === null) {
      unknown.push(`${file}  class="${cls}"  src="${src}"`);
      return tag;
    }

    if (alt === '') decorative++;
    else described++;
    return tag.replace(/<img\b/, `<img alt="${esc(alt)}"`);
  });
  if (out !== s) fs.writeFileSync(file, out);
}

if (unknown.length) {
  console.error('Картинки без alt, для которых нет правила в alt.json:');
  for (const u of unknown) console.error('  ' + u);
  throw new Error(`${unknown.length} картинок без правила — посмотрите их и допишите alt.json`);
}

console.log(`alt="" декоративным:  ${decorative}`);
console.log(`описание содержательным: ${described}`);
