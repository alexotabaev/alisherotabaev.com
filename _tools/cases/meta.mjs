#!/usr/bin/env node
/**
 * Доупаковка страниц кейсов (экспорт Tilda) под поиск.
 *
 *   node _tools/cases/meta.mjs
 *
 * Что делает с каждой страницей кейса:
 *   - <title> из имени превращает в «Имя — кейс: ниша, результат»
 *   - добавляет meta description и заполняет пустые og:title/og:description
 *   - приводит canonical к виду со слэшем (страница живёт в директории)
 *   - размечает заголовок с результатом как <h1>
 *   - добавляет JSON-LD Article
 *
 * Со страниц-дублей (короткие версии с тем же именем) ставит canonical
 * на основную — они перестают конкурировать друг с другом в выдаче.
 *
 * Скрипт идемпотентный: повторный запуск даёт тот же результат, поэтому
 * CI может пересобрать всё и сверить с закоммиченным.
 *
 * Про <h1>: в вёрстке Tilda заголовок — <div class='tn-atom'>, продублированный
 * под разрешения (t-screenmin-640px и t-screenmax-480px). Меняем тег: стили и
 * скрипты Tilda завязаны только на класс .tn-atom, сам тег не используется
 * нигде (рядом Tilda отдаёт <a class='tn-atom'> с тем же классом).
 *
 * Помечается только первое вхождение. Один и тот же текст лежит в вёрстке до
 * четырёх раз (варианты под разрешения плюс повторы блоков), и разметить все
 * значило бы получить четыре заголовка первого уровня. Робот читает разметку,
 * а не то, что скрыто стилями под конкретное разрешение, — одного достаточно.
 *
 * Если заголовка с результатом на странице нет — а у девяти кейсов он написан
 * для каталога и в вёрстке не встречается, — главным заголовком становится имя
 * клиента. До этой правки те девять страниц жили вообще без h1.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { site, abs, esc, ld } from '../shared/layout.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const { section, cases } = JSON.parse(fs.readFileSync(path.join(HERE, 'data.json'), 'utf8'));

const START = '<!-- seo:start (генерируется _tools/cases/meta.mjs) -->';
const END = '<!-- seo:end -->';

/* ---------- текст ---------- */

const sentenceCase = (s) => {
  if (!s) return '';
  const letters = s.replace(/[^А-ЯЁA-Zа-яёa-z]/g, '');
  const upper = letters.replace(/[^А-ЯЁA-Z]/g, '').length;
  if (letters.length < 8 || upper / letters.length < 0.8) return s;
  const lower = s.toLowerCase();
  return lower.charAt(0).toUpperCase() + lower.slice(1);
};

const clip = (s, max) => {
  const t = String(s || '').replace(/\s+/g, ' ').trim();
  if (t.length <= max) return t;
  return t.slice(0, max).replace(/[\s,;:—-]+\S*$/, '');
};

const shortMoney = (n) => {
  if (!n) return '';
  if (n >= 1_000_000) return `${String(n / 1_000_000).replace('.', ',')} млн ₽`;
  if (n >= 1000) return `${Math.round(n / 1000)} тыс ₽`;
  return `${n} ₽`;
};

/** Ниша одним-двумя словами: «Бизнес-психолог, мотивационный оратор» → «бизнес-психолог».
 *  Хвостовые союзы и знаки после обрезки убираем, иначе выходит «эксперт по … и». */
const niche = (role) =>
  clip(String(role || '').split(/[,;]/)[0], 34)
    .replace(/\s+(и|или|а также|по|для|с|в|на)$/i, '')
    .replace(/[\s.,;:–—-]+$/, '')
    .toLowerCase();

function titleFor(c) {
  const parts = [niche(c.role), shortMoney(c.scale)].filter(Boolean);
  return parts.length ? `${c.name} — кейс: ${parts.join(', ')}` : `${c.name} — кейс клиента`;
}

function descriptionFor(c) {
  const bits = [];
  if (c.headline) bits.push(sentenceCase(c.headline).replace(/\.$/, ''));
  if (c.role) bits.push(clip(c.role, 70));
  if (c.to) bits.push('Результат: ' + clip(c.to, 80));
  else if (c.results && c.results.length) bits.push('Результат: ' + clip(c.results[0], 80));
  return clip(bits.join('. ') + '.', 300);
}

/* ---------- правка страницы ---------- */

/** Убирает ранее вставленный блок и теги, которыми управляет этот скрипт. */
function strip(html) {
  const re = new RegExp(
    START.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '[\\s\\S]*?' + END.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\n?'
  );
  let s = html.replace(re, '');
  // Вернуть h1 обратно в div. Без этого повторный прогон не находит блок
  // (он уже не div) и помечает заголовком следующее вхождение — с каждым
  // запуском их становится больше, а сборка перестаёт быть повторяемой.
  s = s.replace(
    /<h1 class='tn-atom' style='margin:0'([^>]*)>([\s\S]*?)<\/h1>/g,
    (_m, attrs, inner) => `<div class='tn-atom'${attrs}>${inner}</div>`
  );
  s = s.replace(/[ \t]*<link rel="canonical"[^>]*>\n?/g, '');
  s = s.replace(/[ \t]*<meta property="og:(url|title|description|image)"[^>]*>\n?/g, '');
  s = s.replace(/[ \t]*<meta name="description"[^>]*>\n?/g, '');
  return s;
}

function patchCase(c) {
  const file = path.join(ROOT, c.slug, 'index.html');
  let s = fs.readFileSync(file, 'utf8');
  const url = `/${c.slug}/`;
  const title = titleFor(c);
  const description = descriptionFor(c);

  s = strip(s);

  // <title> Tilda содержит только имя
  s = s.replace(/<title>[\s\S]*?<\/title>/, `<title>${esc(title)}</title>`);

  // style='margin:0' гасит браузерный отступ h1 — вёрстка Tilda позиционируется
  // абсолютно, лишний margin сдвинул бы текст.
  // Сравниваем не литералы, а нормализованный текст: в вёрстке внутри заголовка
  // попадаются <br> и висячие пробелы, которых нет в извлечённых данных.
  const norm = (x) => x.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

  /**
   * Разметить как h1 блоки Tilda, чей текст совпал.
   * only=true — пометить лишь первое вхождение.
   */
  const markH1 = (want, only = false) => {
    let n = 0;
    s = s.replace(
      /<div class='tn-atom'([^>]*)>([\s\S]*?)<\/div>/g,
      (m, attrs, inner) => {
        if (norm(inner) !== want) return m;
        if (only && n) return m;
        n++;
        return `<h1 class='tn-atom' style='margin:0'${attrs}>${inner}</h1>`;
      }
    );
    return n;
  };

  // Сначала заголовок с результатом; если такого текста на странице нет —
  // главным заголовком становится имя клиента. Подробнее в шапке файла.
  let h1count = c.headline ? markH1(norm(c.headline), true) : 0;
  if (!h1count) h1count = markH1(norm(c.name), true);

  const jsonld = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: c.headline ? sentenceCase(c.headline) : title,
    description,
    inLanguage: 'ru-RU',
    mainEntityOfPage: abs(url),
    author: { '@type': 'Person', name: site.author, url: site.authorUrl },
    publisher: { '@type': 'Person', name: site.author, url: site.origin + '/' },
    about: { '@type': 'Person', name: c.name, ...(c.role ? { jobTitle: c.role } : {}) },
    isPartOf: { '@type': 'CollectionPage', name: 'Кейсы клиентов', url: abs(section.path) },
    ...(c.photo ? { image: abs(c.photo) } : {}),
  };

  const block = [
    START,
    `<meta name="description" content="${esc(description)}" />`,
    `<link rel="canonical" href="${esc(abs(url))}" />`,
    `<meta property="og:type" content="article" />`,
    `<meta property="og:url" content="${esc(abs(url))}" />`,
    `<meta property="og:title" content="${esc(title)}" />`,
    `<meta property="og:description" content="${esc(description)}" />`,
    `<meta property="og:image" content="${esc(abs(c.photo || section.ogImage))}" />`,
    `<meta property="og:site_name" content="${esc(site.author)}" />`,
    `<meta property="og:locale" content="ru_RU" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<script type="application/ld+json">${ld(jsonld)}</script>`,
    END,
  ].join('\n');

  s = s.replace('</head>', block + '\n</head>');
  fs.writeFileSync(file, s);
  return { title, description, h1count };
}

/** Короткая версия страницы: canonical на основную, чтобы не конкурировали. */
function patchDuplicate(slug, mainSlug) {
  const file = path.join(ROOT, slug, 'index.html');
  if (!fs.existsSync(file)) return false;
  let s = strip(fs.readFileSync(file, 'utf8'));
  const block = [
    START,
    `<link rel="canonical" href="${esc(abs(`/${mainSlug}/`))}" />`,
    `<meta property="og:url" content="${esc(abs(`/${mainSlug}/`))}" />`,
    END,
  ].join('\n');
  s = s.replace('</head>', block + '\n</head>');
  fs.writeFileSync(file, s);
  return true;
}

/* ---------- запуск ---------- */

let dupes = 0;
for (const c of cases) {
  const { title } = patchCase(c);
  for (const d of c.duplicates || []) if (patchDuplicate(d, c.slug)) dupes++;
  console.log(`  ${c.slug.padEnd(22)} ${title}`);
}
console.log(`\nстраниц кейсов: ${cases.length}, дублей склеено на основные: ${dupes}`);
