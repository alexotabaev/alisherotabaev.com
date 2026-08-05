#!/usr/bin/env node
/**
 * Убирает из ленты блога карточки уехавших статей.
 *
 *   node _tools/hygiene/bloglist.mjs [--dry]
 *
 * Лента /blog/ написана руками и перечисляет все статьи карточками вида
 * <a class="post" href="/blog/слаг">…</a>. После переезда 48 статей на
 * «Место силы» их карточки вели бы на страницы-заглушки: человек кликает
 * по обложке и попадает не в статью, а на переадресацию.
 *
 * Какие статьи уехали, берётся из gone.json — второго списка заводить не
 * надо, он бы разошёлся с первым.
 *
 * Ссылки не переписываются на новый домен намеренно. Лента — это раздел
 * этого сайта; уводить с неё на чужой блог из каждой карточки значит
 * превращать её в витрину другого проекта. Уехавшие статьи просто
 * перестают показываться, а кто придёт по старому адресу — попадёт куда
 * надо через переадресацию.
 *
 * Якори не вкладываются друг в друга, поэтому пара тегов однозначна и
 * карточка вырезается без разбора вложенности.
 *
 * Идемпотентный: карточек уже нет, повторный прогон ничего не меняет.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
process.chdir(ROOT);

const DRY = process.argv.includes('--dry');
const FILE = 'blog/index.html';

if (!fs.existsSync(FILE)) {
  throw new Error(`${FILE} не найден — ленту блога переименовали или удалили`);
}

const { redirects } = JSON.parse(fs.readFileSync(path.join(HERE, 'gone.json'), 'utf8'));
const moved = Object.keys(redirects)
  .filter((k) => k.startsWith('blog/'))
  .map((k) => k.slice('blog/'.length));

const src = fs.readFileSync(FILE, 'utf8');
let s = src;
let removed = 0;

for (const slug of moved) {
  const re = new RegExp(
    `\\s*<a class="post" href="/blog/${slug.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/?"[\\s\\S]*?</a>`,
    'g'
  );
  s = s.replace(re, () => {
    removed++;
    return '';
  });
}

const left = [...s.matchAll(/href="\/blog\/([a-z0-9-]+)\/?"/g)].map((m) => m[1]);
const uniqueLeft = [...new Set(left)];

if (s !== src && !DRY) fs.writeFileSync(FILE, s);

console.log(
  `${DRY ? '[проверка] ' : ''}лента блога: убрано карточек ${removed}, осталось статей ${uniqueLeft.length}`
);
if (uniqueLeft.length) console.log(`  остались: ${uniqueLeft.join(', ')}`);
