#!/usr/bin/env node
/**
 * Даты статей блога.
 *
 *   node _tools/hygiene/blogdates.mjs
 *
 * Настоящих дат публикации не сохранилось: их нет ни в разметке, ни в истории
 * git — все 54 файла легли одним импортом 6 мая 2026 года. Выдумывать даты
 * нельзя, а без них статья в теме, где важна свежесть, выглядит протухшей.
 *
 * Поэтому ставим то, что известно точно:
 *   datePublished — 6 мая 2026, когда страница появилась по этому адресу;
 *   dateModified  — дата последней правки статьи, из истории git.
 *
 * Важно: dateModified берётся по коммитам, которые меняли ТЕКСТ статьи, а не
 * по любым касаниям файла. Иначе массовая техническая правка (мета-теги,
 * шрифты) выставила бы всем 54 статьям «обновлено сегодня» — формально верно
 * по файлу, но неправда по содержанию, и поисковик такую свежесть распознаёт.
 *
 * Видимая строка «Опубликовано … · Обновлено …» добавляется в начало статьи,
 * чтобы дата была не только в разметке, но и для читателя.
 *
 * Посчитанные даты складываются в blogdates.json и дальше берутся оттуда.
 * Это не кэш ради скорости: CI клонирует репозиторий поверхностно, истории
 * коммитов там нет, и без файла сборка в CI дала бы другой результат, чем
 * локальная — проверка на расхождение падала бы на пустом месте.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
process.chdir(ROOT);

const START = '<!-- dates:start (генерируется _tools/hygiene/blogdates.mjs) -->';
const END = '<!-- dates:end -->';
const reBlock = new RegExp(
  START.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '[\\s\\S]*?' + END.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\n?'
);

const MONTHS = ['января','февраля','марта','апреля','мая','июня','июля','августа','сентября','октября','ноября','декабря'];
const ru = (iso) => {
  const [y, m, d] = iso.split('-').map(Number);
  return `${d} ${MONTHS[m - 1]} ${y}`;
};

/** Дата появления файла в репозитории. */
function firstCommit(file) {
  const out = spawnSync('git', ['log', '--diff-filter=A', '--format=%ad', '--date=short', '--', file], {
    encoding: 'utf8',
  }).stdout.trim().split('\n').filter(Boolean);
  return out[out.length - 1] || null;
}

/**
 * Дата последней правки текста. Коммиты, где менялась только служебная
 * разметка, в расчёт не идут — иначе «обновлено» врёт.
 */
const TECHNICAL = /^(SEO|Этап|Гигиена|Шрифты|Кейсы|Проверка|Вес страниц|Сплошная|CI|Каталог|Подтверждение)/;
function lastContentChange(file) {
  const log = spawnSync('git', ['log', '--format=%ad\t%s', '--date=short', '--', file], { encoding: 'utf8' })
    .stdout.trim().split('\n').filter(Boolean);
  for (const line of log) {
    const [date, subject] = line.split('\t');
    if (!TECHNICAL.test(subject || '')) return date;
  }
  return null;
}

const STORE = path.join(HERE, 'blogdates.json');
const saved = fs.existsSync(STORE) ? JSON.parse(fs.readFileSync(STORE, 'utf8')) : {};
let learned = 0;

const posts = fs
  .readdirSync('blog', { withFileTypes: true })
  .filter((e) => e.isDirectory())
  .map((e) => `blog/${e.name}/index.html`)
  .filter((f) => fs.existsSync(f));

let touched = 0;
const stats = {};

for (const file of posts) {
  let s = fs.readFileSync(file, 'utf8').replace(reBlock, '');
  // Закрытые от индексации служебные страницы в папке блога — не статьи
  if (/<meta[^>]+name="robots"[^>]+content="[^"]*noindex/i.test(s)) {
    fs.writeFileSync(file, s);
    continue;
  }
  let entry = saved[file];
  if (!entry) {
    const published = firstCommit(file);
    if (!published) {
      console.warn(`  ⚠ ${file}: даты нет ни в blogdates.json, ни в истории git — пропускаю`);
      continue;
    }
    entry = { published, modified: lastContentChange(file) || published };
    saved[file] = entry;
    learned++;
  }
  const { published, modified } = entry;
  stats[`${published} → ${modified}`] = (stats[`${published} → ${modified}`] || 0) + 1;

  // Даты в разметку Article
  s = s.replace(/("@type"\s*:\s*"Article",)/, (m) =>
    `${m}\n  "datePublished": "${published}",\n  "dateModified": "${modified}",`
  );
  // Если разметка уже содержала даты после прошлого прогона — убираем дубли
  s = s.replace(/("datePublished": "[^"]*",\s*"dateModified": "[^"]*",)(\s*"datePublished": "[^"]*",\s*"dateModified": "[^"]*",)+/g, '$1');

  // Инлайновый стиль, а не класс: у статей нет общего файла стилей, куда его
  // положить, а тащить ради одной строки отдельный CSS ни к чему.
  const style = 'margin:0 0 26px;font-size:14px;color:#767676;';
  const visible =
    `${START}\n<p class="post-dates" style="${style}">Опубликовано <time datetime="${published}">${ru(published)}</time>` +
    (modified !== published ? ` · обновлено <time datetime="${modified}">${ru(modified)}</time>` : '') +
    `</p>\n${END}`;

  // Ставим в начало текста статьи, а не под заголовок: заголовок лежит
  // в тёмном герой-блоке поверх фотографии, и серая строка там нечитаема.
  if (/<article[^>]*class="article"[^>]*>/.test(s)) {
    s = s.replace(/(<article[^>]*class="article"[^>]*>)/, `$1\n${visible}`);
  } else if (/<h1[^>]*>[\s\S]*?<\/h1>/.test(s)) {
    s = s.replace(/(<h1[^>]*>[\s\S]*?<\/h1>)/, `$1\n${visible}`);
  }

  fs.writeFileSync(file, s);
  touched++;
}

if (learned) {
  fs.writeFileSync(STORE, JSON.stringify(saved, null, 2) + '\n');
  console.log(`даты вычислены по истории git и записаны в blogdates.json: ${learned}`);
}
console.log(`статей размечено: ${touched}`);
for (const [k, n] of Object.entries(stats)) console.log(`  ${k}  — ${n} шт.`);
