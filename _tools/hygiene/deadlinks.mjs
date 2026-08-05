#!/usr/bin/env node
/**
 * Обезвреживание ссылок на страницы, которых нет.
 *
 *   node _tools/hygiene/deadlinks.mjs
 *
 * Адреса берутся из раздела unresolved в links.json — там перечислено то,
 * что нечем заменить: страницы удалены, а кнопки на них остались.
 *
 * Почему не вырезать тег целиком. В выгрузке Tilda ссылка часто и есть
 * позиционируемый элемент: <a class='tn-atom'> с картинкой внутри. Убрать
 * его — сложить вёрстку. Поэтому тег заменяется на <span> с теми же
 * классами и стилями, а href и target отбрасываются. Внешне ничего не
 * меняется, кликать больше не на что.
 *
 * Идемпотентный: после первого прохода таких ссылок не остаётся.
 *
 * Падает, если адрес из unresolved вдруг стал существовать: значит страницу
 * восстановили и ссылку надо не глушить, а вернуть — это решение владельца,
 * а не скрипта.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
process.chdir(ROOT);

const { unresolved } = JSON.parse(fs.readFileSync(path.join(HERE, 'links.json'), 'utf8'));
const dead = Object.keys(unresolved);

const exists = (href) => {
  const p = href.replace(/^\//, '').split('#')[0].split('?')[0];
  if (!p) return true;
  return [p, path.join(p, 'index.html'), p + '.html'].some(
    (c) => fs.existsSync(c) && fs.statSync(c).isFile()
  );
};

for (const u of dead) {
  if (exists(u)) {
    throw new Error(
      `links.json: /${u} снова существует — уберите его из unresolved ` +
        `и решите, возвращать ли ссылку`
    );
  }
}

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

/** Выбросить href и target, остальные атрибуты сохранить. */
const stripLinkAttrs = (attrs) =>
  attrs
    .replace(/\s*\bhref\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/\s*\btarget\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .trim();

let files = 0;
let killed = 0;

for (const file of collect()) {
  const src = fs.readFileSync(file, 'utf8');
  let out = src;

  for (const u of dead) {
    // Ссылка вместе с содержимым: <a …href="/xxx"…> … </a>
    const re = new RegExp(
      `<a\\b([^>]*?href\\s*=\\s*["']/?${u.replace(/^\//, '')}["'][^>]*)>([\\s\\S]*?)</a\\s*>`,
      'gi'
    );
    out = out.replace(re, (_m, attrs, inner) => {
      killed++;
      const rest = stripLinkAttrs(attrs);
      return `<span${rest ? ' ' + rest : ''}>${inner}</span>`;
    });
  }

  if (out !== src) {
    fs.writeFileSync(file, out);
    files++;
  }
}

console.log(`битых ссылок обезврежено: ${killed} на ${files} страницах`);
