#!/usr/bin/env node
/**
 * Убирает незаполненный текст из демо-шаблона Tilda.
 *
 *   node _tools/hygiene/boilerplate.mjs
 *
 * В виджете бокового меню (t450) есть поле описания. Его не заполнили, и там
 * с момента переноса стоит английская фраза из демо-шаблона:
 *
 *   «I am ready for a long road flight for work with a week- or months-long
 *    projects.»
 *
 * На сайте русского продюсера — на 134 страницах, видна при открытии меню.
 * Для читателя это выглядит как недоделка, а поисковику мешает: из-за неё
 * определение языка по тексту страницы давало «английский» там, где весь
 * контент русский.
 *
 * Блок удаляется целиком, а не заменяется другим текстом: придумывать за
 * владельца, что там должно быть, — не наше дело. Поле пустое — значит его
 * просто не должно быть.
 *
 * Идемпотентный: удалять нечего — повторный прогон ничего не находит.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
process.chdir(ROOT);

// Текст ищем целиком: так исключено, что под удаление попадёт что-то своё
const PHRASES = [
  'I am ready for a long road flight for work with a week- or months-long projects.',
];

function collect() {
  const out = [];
  const walk = (dir, depth) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.name.startsWith('.') || e.name.startsWith('_')) continue;
      const p = path.join(dir, e.name).replace(/^\.\//, '');
      if (e.isDirectory()) {
        if (['images', 'css', 'js'].includes(e.name)) continue;
        if (depth < 2) walk(p, depth + 1);
      } else if (e.name.endsWith('.html')) out.push(p);
    }
  };
  walk('.', 0);
  return out;
}

let removed = 0;
let files = 0;

for (const file of collect()) {
  const s = fs.readFileSync(file, 'utf8');
  if (!PHRASES.some((p) => s.includes(p))) continue;

  let out = s;
  for (const phrase of PHRASES) {
    // Удаляем весь элемент вместе с обёрткой, а не только текст: пустой div
    // остался бы в разметке и занимал место отступами.
    const esc = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`\\s*<div[^>]*>\\s*${esc}\\s*</div>`, 'g');
    out = out.replace(re, () => {
      removed++;
      return '';
    });
    // Если обёртка не совпала — убираем хотя бы сам текст, чтобы он не остался
    if (out.includes(phrase)) {
      out = out.split(phrase).join('');
      removed++;
    }
  }

  if (out !== s) {
    fs.writeFileSync(file, out);
    files++;
  }
}

console.log(`удалено вхождений: ${removed} на ${files} страницах`);
