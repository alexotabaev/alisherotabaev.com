#!/usr/bin/env node
/**
 * Замена цветов, не проходящих по контрасту.
 *
 *   node _tools/hygiene/contrast.mjs
 *
 * Таблица замен и обоснование — в contrast.json. Значения посчитаны по
 * формуле WCAG, а не подобраны на глаз.
 *
 * Заменяются только вхождения в CSS (объявления переменных и свойства),
 * а не любое совпадение строки: цвет может встретиться в тексте статьи или
 * в имени файла, и трогать это незачем.
 *
 * Идемпотентный: новые значения в таблице замен не встречаются, повторный
 * прогон ничего не находит.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
process.chdir(ROOT);

const { replace } = JSON.parse(fs.readFileSync(path.join(HERE, 'contrast.json'), 'utf8'));

// Проверка на всякий случай: замена не должна вести обратно в исходный цвет
for (const [from, r] of Object.entries(replace)) {
  if (replace[r.to]) throw new Error(`цепочка замен: ${from} → ${r.to} → ${replace[r.to].to}`);
}

function collect() {
  const out = [];
  const walk = (dir, depth) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.name.startsWith('.') || e.name.startsWith('_')) continue;
      const p = path.join(dir, e.name).replace(/^\.\//, '');
      if (e.isDirectory()) {
        if (['images', 'js'].includes(e.name)) continue;
        if (depth < 2) walk(p, depth + 1);
      } else if (e.name.endsWith('.html') || e.name.endsWith('.css')) out.push(p);
    }
  };
  walk('.', 0);
  return out;
}

const stat = {};
let files = 0;

for (const file of collect()) {
  const s = fs.readFileSync(file, 'utf8');
  let out = s;
  for (const [from, r] of Object.entries(replace)) {
    // Цвет как значение CSS-свойства или переменной: перед ним «:» либо пробел
    // после «:», а дальше — конец значения. Так мы не заденем текст и имена файлов.
    // Тот же цвет в CSS пишут и полностью (#777777), и сокращённо (#777).
    // Lighthouse всегда показывает полную форму, поэтому ищем обе.
    const short = /^#(.)\1(.)\2(.)\3$/.exec(from);
    const alt = short ? `|#${short[1]}${short[2]}${short[3]}` : '';
    const re = new RegExp(`(:\\s*)(?:${from}${alt})(?![0-9a-f])`, 'gi');
    out = out.replace(re, (_m, pre) => {
      stat[from] = (stat[from] || 0) + 1;
      return pre + r.to;
    });
  }
  if (out !== s) {
    fs.writeFileSync(file, out);
    files++;
  }
}

const total = Object.values(stat).reduce((a, b) => a + b, 0);
console.log(`заменено вхождений: ${total} в ${files} файлах`);
for (const [from, n] of Object.entries(stat)) {
  const r = replace[from];
  console.log(`  ${from} → ${r.to}   ${n} шт.   контраст ${r.was} → ${r.now}`);
}
