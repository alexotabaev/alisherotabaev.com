#!/usr/bin/env node
/**
 * Заменяет формы Tilda кнопкой «Написать в Telegram».
 *
 *   node _tools/hygiene/tgforms.mjs [--dry]
 *
 * Все формы сайта отправляли заявки на серверы Tilda. Рабочих среди них
 * нет — так решил владелец, — а держать привязку к чужому сервису значит
 * зависеть от чужого аккаунта: закроется, и формы замолчат, причём молча.
 *
 * Своего обработчика пока нет и не нужно: сайт статический, принять форму
 * ему нечем. Поэтому вместо формы ставится ссылка в Telegram — там ответят
 * быстрее, чем по почте. Ключевые формы позже заменят на встроенные
 * (iframe) сервисы; к тому моменту привязок к Tilda уже не останется.
 *
 * Формы бывают двух видов, и порядок обработки важен:
 *
 *   во всплывающем окне — сначала кнопка, открывающая окно, переводится
 *     на Telegram, потом окно удаляется целиком. Наоборот получилась бы
 *     кнопка, открывающая пустоту;
 *
 *   прямо на странице — форма заменяется ссылкой на её месте.
 *
 * Границы блока всплывающего окна ищутся подсчётом вложенности div: у
 * блока Tilda их несколько десятков, регулярному выражению это не по силам.
 *
 * Идемпотентный: форм с привязкой к Tilda не остаётся, повторный прогон
 * ничего не меняет.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { site } from '../shared/layout.mjs';

/**
 * Признаки формы Tilda. Привязки formservices мало: нашлись формы вовсе
 * без приёмников — они собирали почту и телефон, а данные не уходили
 * никуда. Такие тоже убираем: форма, которая молча теряет введённое,
 * хуже её отсутствия.
 */
const TILDA_FORM = /name="formservices\[\]"|js-form-proc?cess|data-formactiontype/;

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
process.chdir(ROOT);

const DRY = process.argv.includes('--dry');
const LABEL = 'Написать в Telegram';

/** Ссылка на месте формы. Стили внутренние: вёрстка Tilda своих не даст. */
const LINK = `<div class="ao-tgform" style="text-align:center;padding:24px 16px">
<a href="${site.telegram}" target="_blank" rel="noopener"
 style="display:inline-block;background:#000d29;color:#fff;text-decoration:none;
 padding:14px 28px;border-radius:999px;font:600 16px/1.2 'Roboto',Arial,sans-serif">${LABEL}</a>
</div>`;

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

/**
 * Конец блока, начинающегося в from: позиция после тега, на котором
 * вложенность div вернулась к нулю. Возвращает -1, если блок не закрыт.
 */
function blockEnd(s, from) {
  let depth = 0;
  for (const m of s.slice(from).matchAll(/<(\/?)div\b/gi)) {
    depth += m[1] ? -1 : 1;
    if (depth === 0) return s.indexOf('>', from + m.index) + 1;
  }
  return -1;
}

let pages = 0;
let popups = 0;
let inline = 0;
let buttons = 0;

for (const file of collect()) {
  const src = fs.readFileSync(file, 'utf8');
  if (!TILDA_FORM.test(src)) continue;

  let s = src;

  // 1. Всплывающие окна с формой внутри. Обрабатываем по одному, пока есть.
  for (let guard = 0; guard < 20; guard++) {
    const hook = s.match(/data-tooltip-hook="#popup:([a-z0-9_-]+)"/i);
    if (!hook) break;

    const name = hook[1];
    const from = s.lastIndexOf('<div id="rec', hook.index);
    const to = from >= 0 ? blockEnd(s, from) : -1;
    if (from < 0 || to < 0) break;

    // Окно без формы трогать незачем — это может быть что угодно другое.
    if (!/<form\b/i.test(s.slice(from, to))) break;

    // Сначала кнопка: иначе останется открывающая пустоту.
    const trigger = new RegExp(`<a([^>]*)href="#popup:${name}"([^>]*)>([\\s\\S]*?)</a>`, 'gi');
    s = s.replace(trigger, (_m, pre, post, inner) => {
      buttons++;
      const withLabel = inner.replace(
        /(<span class="tn-atom__button-text">)([\s\S]*?)(<\/span>)/i,
        (_x, o, _t, close) => `${o}${LABEL.toUpperCase()}${close}`
      );
      return `<a${pre}href="${site.telegram}" target="_blank" rel="noopener"${post}>${withLabel}</a>`;
    });

    // Пересчитываем границы: замена кнопки могла сдвинуть блок.
    const hook2 = s.indexOf(`data-tooltip-hook="#popup:${name}"`);
    if (hook2 < 0) break;
    const f2 = s.lastIndexOf('<div id="rec', hook2);
    const t2 = f2 >= 0 ? blockEnd(s, f2) : -1;
    if (f2 < 0 || t2 < 0) break;
    s = s.slice(0, f2) + s.slice(t2);
    popups++;
  }

  // 2. Формы прямо на странице. Формы не вкладываются, пара тегов однозначна.
  s = s.replace(/<form\b[^>]*>[\s\S]*?<\/form\s*>/gi, (m) => {
    if (!TILDA_FORM.test(m)) return m;
    inline++;
    return LINK;
  });

  if (s !== src) {
    if (!DRY) fs.writeFileSync(file, s);
    pages++;
  }
}

console.log(
  `${DRY ? '[проверка] ' : ''}формы Tilda: всплывающих окон убрано ${popups}, ` +
    `форм заменено ссылкой ${inline}, кнопок переведено ${buttons}, страниц ${pages}`
);
