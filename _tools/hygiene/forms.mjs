#!/usr/bin/env node
/**
 * Отвязка форм от Tilda.
 *
 *   node _tools/hygiene/forms.mjs [--dry]
 *
 * Все формы сайта (около 170 на 142 файлах) отправляют данные на серверы
 * Tilda. Устроено так: action пустой, отправку перехватывает локальный
 * js/tilda-forms-1.0.min.js и шлёт на forms.tildacdn.com/procces/, а скрытые
 * поля formservices[] говорят Tilda, в какой проект доставить заявку.
 * Пока жив проект в Tilda — работает; закроется — все формы замолчат, и
 * человек этого не увидит: кнопка нажмётся, экран не изменится.
 *
 * Что делает скрипт с каждой формой:
 *
 *   1. в action ставит адрес из forms.json вместо пустого;
 *   2. удаляет скрытые поля formservices[] — привязку к проекту Tilda;
 *   3. снимает класс js-form-proccess, чтобы скрипт Tilda не перехватывал;
 *   4. убирает data-formactiontype по той же причине;
 *   5. добавляет скрытое поле _page с адресом страницы — чтобы в заявке
 *      было видно, откуда она пришла.
 *
 * Разметку форм не переписывает. Формы вшиты в позиционированную вёрстку
 * Tilda, и замена блока целиком сложила бы раскладку — так уже было
 * с битыми ссылками, поэтому меняются только атрибуты и скрытые поля.
 *
 * Без адреса в forms.json не делает НИЧЕГО и говорит об этом. Неверный
 * адрес — это молча потерянные заявки, а такую поломку не видно снаружи.
 *
 * Идемпотентный: обработанные формы помечаются data-ao-form и при повторном
 * прогоне у них обновляется только адрес.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
process.chdir(ROOT);

const DRY = process.argv.includes('--dry');
const cfg = JSON.parse(fs.readFileSync(path.join(HERE, 'forms.json'), 'utf8'));

if (!cfg.endpoint) {
  console.log('формы: адрес не задан в forms.json — ничего не меняю');
  console.log('  формы остаются привязанными к Tilda; впишите endpoint, когда решите куда слать');
  process.exit(0);
}

const keep = new Set(cfg.keepTilda || []);

function collect() {
  const out = [];
  const walk = (dir, depth) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.name.startsWith('.') || e.name.startsWith('_')) continue;
      const p = path.join(dir, e.name).replace(/^\.\//, '');
      if (e.isDirectory()) {
        if (['images', 'css', 'js'].includes(e.name)) continue;
        if (depth < 3) walk(p, depth + 1);
      } else if (e.name.endsWith('.html')) out.push(p);
    }
  };
  walk('.', 0);
  return out;
}

const urlOf = (file) =>
  file === 'index.html'
    ? '/'
    : file.endsWith('/index.html')
      ? '/' + path.dirname(file) + '/'
      : '/' + file;

/** Один тег <form …>: чистим атрибуты и проставляем адрес. */
function patchOpenTag(tag, pageUrl) {
  let t = tag;

  // action → наш адрес (и если форма уже обработана — обновляем)
  t = /\baction\s*=/.test(t)
    ? t.replace(/\baction\s*=\s*("[^"]*"|'[^']*')/i, `action="${cfg.endpoint}"`)
    : t.replace(/^<form/i, `<form action="${cfg.endpoint}"`);

  if (/\bmethod\s*=/.test(t)) {
    t = t.replace(/\bmethod\s*=\s*("[^"]*"|'[^']*')/i, `method="${cfg.method}"`);
  } else {
    t = t.replace(/^<form/i, `<form method="${cfg.method}"`);
  }

  // класс, которым скрипт Tilda находит «свои» формы
  t = t.replace(/(\bclass\s*=\s*)("([^"]*)"|'([^']*)')/i, (_m, pre, _q, d, s) => {
    const cls = (d ?? s ?? '').split(/\s+/).filter((c) => c && c !== 'js-form-proccess');
    return `${pre}"${cls.join(' ')}"`;
  });

  t = t.replace(/\s*\bdata-formactiontype\s*=\s*("[^"]*"|'[^']*')/i, '');

  if (!/\bdata-ao-form\b/.test(t)) t = t.replace(/^<form/i, '<form data-ao-form="1"');
  return t;
}

let files = 0;
let forms = 0;
let removedKeys = 0;

for (const file of collect()) {
  const url = urlOf(file);
  if (keep.has(url) || keep.has(url.replace(/\/$/, ''))) continue;

  const src = fs.readFileSync(file, 'utf8');
  if (!/<form\b/i.test(src)) continue;

  let s = src;
  let touched = 0;

  s = s.replace(/<form\b[^>]*>/gi, (tag) => {
    // поиск по каталогу — не форма отправки, не трогаем
    if (/onsubmit\s*=\s*["']return false/i.test(tag)) return tag;
    touched++;
    return patchOpenTag(tag, url);
  });

  if (!touched) continue;

  // скрытые поля привязки к проекту Tilda
  s = s.replace(/\s*<input[^>]+name="formservices\[\]"[^>]*>/gi, () => {
    removedKeys++;
    return '';
  });

  // откуда пришла заявка — иначе в почте будут одинаковые письма без контекста
  if (!s.includes('name="_page"')) {
    s = s.replace(/(<form\b[^>]*data-ao-form[^>]*>)/gi,
      (m) => `${m}\n<input type="hidden" name="_page" value="${url}">`);
  }

  if (s !== src) {
    if (!DRY) fs.writeFileSync(file, s);
    files++;
    forms += touched;
  }
}

console.log(
  `${DRY ? '[проверка] ' : ''}форм переведено на свой адрес: ${forms} на ${files} файлах`
);
console.log(`  удалено привязок к проектам Tilda: ${removedKeys}`);
console.log(`  адрес: ${cfg.endpoint}`);
