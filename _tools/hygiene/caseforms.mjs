#!/usr/bin/env node
/**
 * Убирает формы со страниц кейсов.
 *
 *   node _tools/hygiene/caseforms.mjs [--dry]
 *
 * На семнадцати страницах кейсов стояла одна и та же форма: всплывающее
 * окно «Почти все… Заполните форму» с полем почты, открывалось кнопкой
 * «ЗАПОЛНИТЬ АНКЕТУ». Это не воронка, а остаток прежней сборки: человек
 * дочитал историю клиента, и предлагать ему оставить почту неизвестно
 * зачем — хуже, чем позвать в Telegram, где ответят сразу.
 *
 * Что делает:
 *
 *   1. кнопку #popup:myform переводит на Telegram и меняет надпись;
 *   2. удаляет сам <form>…</form> внутри всплывающего окна.
 *
 * Порядок важен. Удалить форму, не тронув кнопку, — оставить кнопку,
 * которая открывает пустое окно. Это хуже, чем было.
 *
 * Всплывающее окно как блок остаётся: оно скрыто (display:none) и больше
 * ничем не открывается. Вырезать его целиком значило бы искать закрывающий
 * тег среди вложенных div вручную — риск сложить вёрстку ради невидимого
 * куска разметки того не стоит.
 *
 * Идемпотентный: после первого прогона ни кнопок, ни форм не остаётся.
 *
 * Падает, если на странице кейса кнопка есть, а формы нет (или наоборот) —
 * значит вёрстка не та, что ожидалась, и трогать её вслепую нельзя.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { site } from '../shared/layout.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
process.chdir(ROOT);

const DRY = process.argv.includes('--dry');
const { cases } = JSON.parse(fs.readFileSync(path.join(ROOT, '_tools/cases/data.json'), 'utf8'));

const LABEL = 'НАПИСАТЬ В TELEGRAM';
const TRIGGER = /href="#popup:myform"/gi;

let pages = 0;
let buttons = 0;
let forms = 0;

for (const c of cases) {
  const file = path.join(ROOT, c.slug, 'index.html');
  if (!fs.existsSync(file)) continue;

  const src = fs.readFileSync(file, 'utf8');
  const hasTrigger = TRIGGER.test(src);
  TRIGGER.lastIndex = 0;
  const hasForm = /<form\b/i.test(src);

  if (!hasTrigger && !hasForm) continue;
  if (hasTrigger !== hasForm) {
    throw new Error(
      `/${c.slug}/: кнопка ${hasTrigger ? 'есть' : 'отсутствует'}, ` +
        `форма ${hasForm ? 'есть' : 'отсутствует'} — вёрстка не та, что ожидалась`
    );
  }

  let s = src;
  let b = 0;
  let f = 0;

  // 1. кнопка → Telegram
  s = s.replace(/<a([^>]*)href="#popup:myform"([^>]*)>([\s\S]*?)<\/a>/gi, (_m, pre, post, inner) => {
    b++;
    const withLabel = inner.replace(
      /(<span class="tn-atom__button-text">)([\s\S]*?)(<\/span>)/i,
      (_x, o, _t, close) => `${o}${LABEL}${close}`
    );
    return `<a${pre}href="${site.telegram}" target="_blank" rel="noopener"${post}>${withLabel}</a>`;
  });

  // 2. форма прочь. Формы не вкладываются друг в друга, поэтому пара тегов
  //    однозначна и вырезается без разбора вложенности.
  s = s.replace(/<form\b[\s\S]*?<\/form\s*>/gi, () => {
    f++;
    return '';
  });

  if (s !== src) {
    if (!DRY) fs.writeFileSync(file, s);
    pages++;
    buttons += b;
    forms += f;
  }
}

console.log(
  `${DRY ? '[проверка] ' : ''}кейсы: убрано форм ${forms}, кнопок переведено на Telegram ${buttons}, страниц ${pages}`
);
