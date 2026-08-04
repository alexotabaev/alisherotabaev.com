#!/usr/bin/env node
/**
 * Починка битых внутренних ссылок.
 *
 *   node _tools/hygiene/links.mjs
 *
 * Заменяет адреса по таблице из links.json. Таблица небольшая и заполняется
 * руками: каждое соответствие проверено по заголовку целевой страницы.
 *
 * Скрипт проверяет, что цель замены существует, и падает, если нет —
 * иначе он тихо заменил бы одну битую ссылку на другую.
 *
 * Идемпотентный: заменять уже нечего, повторный запуск ничего не меняет.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
process.chdir(ROOT);

const { redirects } = JSON.parse(fs.readFileSync(path.join(HERE, 'links.json'), 'utf8'));

/** Существует ли страница по такому адресу. */
const exists = (href) => {
  const p = href.replace(/^\//, '').split('#')[0].split('?')[0];
  if (!p) return true;
  return [p, path.join(p, 'index.html'), p + '.html', p.replace(/\/$/, '') + '.html'].some((c) =>
    fs.existsSync(c)
  );
};

for (const [from, to] of Object.entries(redirects)) {
  if (!exists(to)) throw new Error(`links.json: цель ${to} (для ${from}) не существует`);
}

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

let files = 0;
let replaced = 0;

for (const file of collect()) {
  const s = fs.readFileSync(file, 'utf8');
  let out = s;
  for (const [from, to] of Object.entries(redirects)) {
    // Только точное совпадение адреса в href, чтобы не задеть /politika-2 и подобные
    const re = new RegExp(`href="${from.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')}(["#?])`, 'g');
    out = out.replace(re, (_m, tail) => {
      replaced++;
      return `href="${to}${tail}`;
    });
  }
  if (out !== s) {
    fs.writeFileSync(file, out);
    files++;
  }
}

console.log(`ссылок исправлено: ${replaced} на ${files} страницах`);
