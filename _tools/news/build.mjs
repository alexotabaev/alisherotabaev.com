#!/usr/bin/env node
/**
 * Генератор раздела /news/ — обзоры новостей про ИИ и бизнес с разбором.
 *
 *   node _tools/news/build.mjs
 *
 * Читает готовые выпуски из _tools/news/issues/*.json и собирает:
 *   /news/            — лента всех выпусков;
 *   /news/ГГГГ-ММ-ДД/ — страница выпуска;
 *   /news/rss.xml     — лента для подписки.
 *
 * Откуда берутся выпуски. Сначала collect.mjs приносит кандидатов в
 * _tools/news/drafts/. Владелец выбирает нужные, пишет к каждой разбор
 * «что это значит», добавляет заголовок и вступление, ставит status:
 * published и кладёт файл в issues/. Только после этого выпуск появится
 * на сайте.
 *
 * Почему так строго. Ценность раздела не в новости — её публикуют сотни
 * площадок в тот же час, — а в разборе. Поэтому:
 *
 *   пустое поле take — отказ сборки. Новость без разбора это пересказ
 *     чужого заголовка, ради которого раздел не нужен;
 *   status не published — выпуск пропускается молча, он ещё в работе.
 *
 * Если готовых выпусков нет, раздел не создаётся вовсе. Пустая лента
 * новостей вредит: посетитель видит «последнее обновление — никогда» и
 * делает вывод обо всём сайте.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  site, abs, esc, ld, ruDate,
  header, cta, footer, head,
  personLd, breadcrumbLd,
} from '../shared/layout.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const DIR = path.join(HERE, 'issues');

const plural = (n, one, few, many) => {
  const a = Math.abs(n) % 100;
  const b = a % 10;
  if (a > 10 && a < 20) return many;
  if (b > 1 && b < 5) return few;
  if (b === 1) return one;
  return many;
};

/* ---------- загрузка выпусков ---------- */

const files = fs.existsSync(DIR)
  ? fs.readdirSync(DIR).filter((f) => f.endsWith('.json')).sort().reverse()
  : [];

const issues = [];
for (const f of files) {
  const raw = JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8'));
  if (raw.status !== 'published') continue;

  if (!raw.date || !/^\d{4}-\d{2}-\d{2}$/.test(raw.date)) {
    throw new Error(`issues/${f}: нет даты в виде ГГГГ-ММ-ДД`);
  }
  if (!raw.title) throw new Error(`issues/${f}: нет заголовка выпуска`);
  const items = (raw.items || []).filter((i) => i && i.title);
  if (!items.length) throw new Error(`issues/${f}: в выпуске нет новостей`);

  for (const it of items) {
    if (!it.take || !it.take.trim()) {
      throw new Error(
        `issues/${f}: у новости «${it.title.slice(0, 50)}» пустой разбор (take). ` +
          `Новость без разбора — пересказ чужого заголовка, ради него раздел не нужен`
      );
    }
    if (!it.link) throw new Error(`issues/${f}: у новости «${it.title.slice(0, 50)}» нет ссылки`);
  }
  issues.push({ ...raw, items, file: f });
}

if (!issues.length) {
  console.log('выпусков нет — раздел /news/ не создаётся');
  console.log('  собрать кандидатов:  node _tools/news/collect.mjs');
  console.log('  дальше: заполнить take, поставить status: published, положить в issues/');
  process.exit(0);
}

/* ---------- оформление ---------- */

const EXTRA_CSS = `
  .issues{list-style:none;margin:0;padding:0;display:grid;gap:1.1rem}
  .issue{border:1px solid var(--line);border-radius:.8rem;background:var(--paper);padding:1.3rem 1.5rem}
  .issue h2{margin:0 0 .3rem;font-size:1.22rem;line-height:1.3}
  .issue h2 a{color:var(--ink);text-decoration:none}
  .issue h2 a:hover,.issue h2 a:focus{color:var(--gold-dk)}
  .issue .when{margin:0 0 .6rem;color:var(--muted);font-size:.9rem}
  .issue p.lead{margin:0 0 .8rem;color:var(--muted)}
  .issue .count{font-size:.9rem;color:var(--gold-dk);font-weight:600}
  .news-item{border-left:3px solid var(--line);padding:0 0 0 1.2rem;margin:0 0 2.4rem}
  .news-item h2{margin:0 0 .4rem;font-size:1.16rem;line-height:1.35}
  .news-item .src{margin:0 0 .7rem;font-size:.88rem;color:var(--muted)}
  .news-item .src a{color:var(--gold-dk);text-decoration:none}
  .news-item .src a:hover{text-decoration:underline}
  .news-item .sum{margin:0 0 .8rem;color:var(--muted)}
  .news-item .take{margin:0;padding:.9rem 1.1rem;background:var(--cream);border-radius:.6rem}
  .news-item .take b{display:block;font-size:.82rem;letter-spacing:.06em;
    text-transform:uppercase;color:var(--gold-dk);margin-bottom:.3rem}
  .backlink{display:inline-block;margin:0 0 1.6rem;color:var(--gold-dk);font-weight:600;text-decoration:none}
  .backlink:hover{text-decoration:underline}
`.trim();

const urlOf = (d) => `/news/${d}/`;

/* ---------- страница выпуска ---------- */

function buildIssue(iss) {
  const n = iss.items.length;
  const description =
    (iss.intro && iss.intro.slice(0, 300)) ||
    `${n} ${plural(n, 'новость', 'новости', 'новостей')} про ИИ и бизнес за неделю с разбором: что это значит на практике.`;

  const jsonld = {
    '@context': 'https://schema.org',
    '@graph': [
      personLd,
      {
        '@type': 'Article',
        '@id': abs(urlOf(iss.date)) + '#article',
        url: abs(urlOf(iss.date)),
        headline: iss.title,
        description,
        inLanguage: 'ru-RU',
        datePublished: iss.date,
        dateModified: iss.updated || iss.date,
        author: { '@id': abs('/#author') },
        publisher: { '@id': abs('/#author') },
        mainEntityOfPage: abs(urlOf(iss.date)),
      },
      breadcrumbLd([
        { name: 'Главная', url: '/' },
        { name: 'Новости', url: '/news/' },
        { name: iss.title, url: urlOf(iss.date) },
      ]),
    ],
  };

  const body = iss.items
    .map(
      (it) => `      <section class="news-item">
        <h2>${esc(it.title)}</h2>
        <p class="src">${esc(it.source || 'источник')}${it.date ? ` · ${esc(ruDate(it.date))}` : ''} · <a href="${esc(it.link)}" target="_blank" rel="noopener nofollow">читать первоисточник</a></p>
${it.summary ? `        <p class="sum">${esc(it.summary)}</p>\n` : ''}        <div class="take"><b>Что это значит</b>${esc(it.take)}</div>
      </section>`
    )
    .join('\n\n');

  return (
    head({
      title: `${iss.title} — ${ruDate(iss.date)}`,
      description,
      url: urlOf(iss.date),
      jsonld,
      ogType: 'article',
      extraCss: EXTRA_CSS,
    }) +
    `
${header()}

<main id="main">
<article class="wrap">

  <a class="backlink" href="/news/">← Все выпуски</a>

  <header class="lede">
    <h1>${esc(iss.title)}</h1>
    <p class="when" style="color:var(--muted)">${esc(ruDate(iss.date))} · ${n} ${plural(n, 'новость', 'новости', 'новостей')}</p>
${iss.intro ? `    <p>${esc(iss.intro)}</p>\n` : ''}  </header>

${body}

</article>

${cta()}

</main>

${footer()}
</body>
</html>
`
  );
}

/* ---------- лента выпусков ---------- */

function buildHub() {
  const n = issues.length;
  const title = `Новости ИИ и бизнеса — ${n} ${plural(n, 'выпуск', 'выпуска', 'выпусков')} с разбором`;
  const description =
    'Главные новости про искусственный интеллект, бизнес и маркетинг — с разбором, ' +
    'что каждая из них означает на практике. Не пересказ заголовков, а мнение.';

  const jsonld = {
    '@context': 'https://schema.org',
    '@graph': [
      personLd,
      {
        '@type': 'CollectionPage',
        '@id': abs('/news/') + '#page',
        url: abs('/news/'),
        name: title,
        description,
        inLanguage: 'ru-RU',
        dateModified: issues[0].date,
        author: { '@id': abs('/#author') },
        publisher: { '@id': abs('/#author') },
        mainEntity: { '@id': abs('/news/') + '#list' },
      },
      breadcrumbLd([
        { name: 'Главная', url: '/' },
        { name: 'Новости', url: '/news/' },
      ]),
      {
        '@type': 'ItemList',
        '@id': abs('/news/') + '#list',
        numberOfItems: n,
        itemListOrder: 'https://schema.org/ItemListOrderDescending',
        itemListElement: issues.map((iss, i) => ({
          '@type': 'ListItem',
          position: i + 1,
          url: abs(urlOf(iss.date)),
          name: iss.title,
        })),
      },
    ],
  };

  const cards = issues
    .map((iss) => {
      const c = iss.items.length;
      return `      <li class="issue">
        <h2><a href="${urlOf(iss.date)}">${esc(iss.title)}</a></h2>
        <p class="when">${esc(ruDate(iss.date))}</p>
${iss.intro ? `        <p class="lead">${esc(iss.intro.slice(0, 220))}</p>\n` : ''}        <span class="count">${c} ${plural(c, 'новость', 'новости', 'новостей')} с разбором →</span>
      </li>`;
    })
    .join('\n');

  return (
    head({ title, description, url: '/news/', jsonld, extraCss: EXTRA_CSS }) +
    `
${header()}

<main id="main">
<article class="wrap">

  <header class="lede">
    <h1>Новости ИИ и бизнеса</h1>
    <p>${esc(description)}</p>
  </header>

  <ul class="issues">
${cards}
  </ul>

</article>

${cta()}

</main>

${footer()}
</body>
</html>
`
  );
}

/* ---------- RSS ---------- */

function buildRss() {
  const items = issues
    .slice(0, 20)
    .map(
      (iss) => `    <item>
      <title>${esc(iss.title)}</title>
      <link>${abs(urlOf(iss.date))}</link>
      <guid isPermaLink="true">${abs(urlOf(iss.date))}</guid>
      <pubDate>${new Date(iss.date + 'T09:00:00Z').toUTCString()}</pubDate>
      <description>${esc(iss.intro || iss.title)}</description>
    </item>`
    )
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Новости ИИ и бизнеса — ${esc(site.author)}</title>
    <link>${abs('/news/')}</link>
    <description>Главные новости про ИИ, бизнес и маркетинг с разбором, что они означают на практике.</description>
    <language>ru</language>
${items}
  </channel>
</rss>
`;
}

/* ---------- запись ---------- */

fs.mkdirSync(path.join(ROOT, 'news'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'news', 'index.html'), buildHub());
fs.writeFileSync(path.join(ROOT, 'news', 'rss.xml'), buildRss());

for (const iss of issues) {
  const dir = path.join(ROOT, 'news', iss.date);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'index.html'), buildIssue(iss));
}

const total = issues.reduce((s, i) => s + i.items.length, 0);
console.log(`news/: ${issues.length} выпусков, ${total} новостей с разбором`);
