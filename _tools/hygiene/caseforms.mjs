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
 * Всплывающее окно тоже убирается — целиком, вместе с блоком Tilda, в
 * котором лежит. Закрывающий тег ищется подсчётом вложенности div, а не
 * регулярным выражением: у блока их несколько десятков. Удаляется только
 * то окно, на которое на странице не осталось ни одной ссылки.
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
let popups = 0;

for (const c of cases) {
  const file = path.join(ROOT, c.slug, 'index.html');
  if (!fs.existsSync(file)) continue;

  const src = fs.readFileSync(file, 'utf8');
  const hasTrigger = TRIGGER.test(src);
  TRIGGER.lastIndex = 0;
  const hasForm = /<form\b/i.test(src);

  const hasPopup = src.includes('data-tooltip-hook="#popup:myform"');
  if (!hasTrigger && !hasForm && !hasPopup) continue;
  // кнопка и форма живут парой: если осталось одно без другого, вёрстка
  // не та, что ожидалась. Осиротевший попап без обоих — нормальный случай,
  // он остаётся от прошлого прогона.
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

  // 3. осиротевшее всплывающее окно. Убираем только если на странице не
  //    осталось ссылок, которые его открывают.
  if (!/href="#popup:myform"/i.test(s)) {
    const hook = s.indexOf('data-tooltip-hook="#popup:myform"');
    if (hook >= 0) {
      const from = s.lastIndexOf('<div id="rec', hook);
      if (from >= 0) {
        // конец блока — там, где вложенность div возвращается к нулю
        const re = /<(\/?)div\b/gi;
        re.lastIndex = from;
        let depth = 0;
        let to = -1;
        for (let m = re.exec(s); m; m = re.exec(s)) {
          depth += m[1] ? -1 : 1;
          if (depth === 0) {
            to = s.indexOf('>', m.index) + 1;
            break;
          }
        }
        if (to > from) {
          s = s.slice(0, from) + s.slice(to);
          popups++;
        }
      }
    }
  }

  if (s !== src) {
    if (!DRY) fs.writeFileSync(file, s);
    pages++;
    buttons += b;
    forms += f;
  }
}

console.log(
  `${DRY ? '[проверка] ' : ''}кейсы: форм ${forms}, всплывающих окон ${popups}, ` +
    `кнопок на Telegram ${buttons}, страниц ${pages}`
);
