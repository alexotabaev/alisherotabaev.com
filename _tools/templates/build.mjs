#!/usr/bin/env node
/**
 * Генератор страницы-хаба /templates/ — каталог шаблонов страниц и воронок.
 *
 *   node _tools/templates/build.mjs
 *
 * Источник — _tools/templates/data.json. Сами шаблоны остаются на своих
 * адресах (выгрузка Tilda), хаб на них ссылается.
 *
 * Карточки попадают в HTML на этапе сборки, а не собираются скриптом в
 * браузере: GPTBot, ClaudeBot и PerplexityBot не выполняют JavaScript, и
 * страница, отрисованная на клиенте, для них пустая. Разбор по группам —
 * обычные ссылки-якоря, без скриптов вообще.
 *
 * Падает, если у шаблона нет страницы-примера: каталог, ведущий в никуда,
 * хуже отсутствующего.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  site, abs, esc, ld,
  header, cta, footer, head,
  personLd, breadcrumbLd,
} from '../shared/layout.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const { section, groups, templates } = JSON.parse(
  fs.readFileSync(path.join(HERE, 'data.json'), 'utf8')
);

const plural = (n, one, few, many) => {
  const a = Math.abs(n) % 100;
  const b = a % 10;
  if (a > 10 && a < 20) return many;
  if (b > 1 && b < 5) return few;
  if (b === 1) return one;
  return many;
};

/* ---------- проверки ---------- */

const fileOf = (slug) => {
  const p = slug.replace(/^\//, '').replace(/\/$/, '');
  return [p, path.join(p, 'index.html'), p + '.html']
    .map((c) => path.join(ROOT, c))
    .find((c) => fs.existsSync(c) && fs.statSync(c).isFile()) || null;
};

const known = new Set(groups.map((g) => g.id));
for (const t of templates) {
  if (!known.has(t.group)) {
    throw new Error(`data.json: у шаблона ${t.slug} группа «${t.group}», которой нет`);
  }
  if (!fileOf(t.example)) {
    throw new Error(`data.json: у шаблона ${t.slug} нет страницы-примера ${t.example}`);
  }
}

/* ---------- оформление ---------- */

const EXTRA_CSS = `
  .groups{display:flex;flex-wrap:wrap;gap:.5rem;margin:0 0 2.5rem;padding:0;list-style:none}
  .groups a{display:inline-block;padding:.4rem .85rem;border:1px solid var(--line);
    border-radius:999px;background:var(--cream);color:var(--ink);text-decoration:none;font-size:.94rem}
  .groups a:hover,.groups a:focus{background:var(--cream2);border-color:var(--gold)}
  /* глобальное section{padding:70px 0} добавляло бы по 140px на группу */
  .tgroup{margin:0 0 3rem;padding:0}
  .tgroup > h2{margin:0 0 .35rem}
  .tgroup > .why{margin:0 0 1.25rem;color:var(--muted);max-width:52rem}
  .tpls{display:grid;gap:1rem;padding:0;margin:0;list-style:none;
    grid-template-columns:repeat(auto-fill,minmax(17rem,1fr))}
  .tpl{border:1px solid var(--line);border-radius:.7rem;background:var(--paper);padding:1.1rem 1.2rem}
  .tpl h3{margin:0 0 .4rem;font-size:1.02rem;line-height:1.3}
  .tpl p{margin:0 0 .8rem;color:var(--muted);font-size:.94rem}
  .tpl a{color:var(--gold-dk);font-weight:600;text-decoration:none}
  .tpl a:hover,.tpl a:focus{text-decoration:underline}
`.trim();

/* ---------- страница ---------- */

const n = templates.length;

function cardOf(t) {
  return `          <li class="tpl">
            <h3>${esc(t.name)}</h3>
            <p>${esc(t.why)}</p>
            <a href="${esc(t.example)}">Посмотреть пример →</a>
          </li>`;
}

function groupOf(g) {
  const items = templates.filter((t) => t.group === g.id);
  if (!items.length) return '';
  return `      <section class="tgroup" id="${esc(g.id)}">
        <h2>${esc(g.name)}</h2>
        <p class="why">${esc(g.why)}</p>
        <ul class="tpls">
${items.map(cardOf).join('\n')}
        </ul>
      </section>`;
}

function build() {
  const title = `Шаблоны страниц и воронок — ${n} ${plural(n, 'заготовка', 'заготовки', 'заготовок')}`;
  const description =
    `${n} шаблонов страниц из работающих проектов: лид-магниты, трипваеры, ` +
    `регистрации на вебинар, серии прогрева, полноценные сайты курсов. ` +
    `К каждому — зачем он нужен и живой пример.`;

  const jsonld = {
    '@context': 'https://schema.org',
    '@graph': [
      personLd,
      {
        '@type': 'CollectionPage',
        '@id': abs(section.path) + '#page',
        url: abs(section.path),
        name: title,
        headline: section.title,
        description,
        inLanguage: 'ru-RU',
        dateModified: section.updated,
        author: { '@id': abs('/#author') },
        publisher: { '@id': abs('/#author') },
        mainEntity: { '@id': abs(section.path) + '#list' },
      },
      breadcrumbLd([
        { name: 'Главная', url: '/' },
        { name: 'Шаблоны', url: section.path },
      ]),
      {
        '@type': 'ItemList',
        '@id': abs(section.path) + '#list',
        name: section.title,
        numberOfItems: n,
        itemListElement: templates.map((t, i) => ({
          '@type': 'ListItem',
          position: i + 1,
          url: abs(t.example),
          name: t.name,
        })),
      },
    ],
  };

  return (
    head({
      title,
      description,
      url: section.path,
      jsonld,
      extraCss: EXTRA_CSS,
    }) +
    `
${header()}

<main id="main">
<article class="wrap">

  <header class="lede">
    <h1>${esc(section.title)}</h1>
    <p>${esc(description)}</p>
  </header>

  <nav aria-label="Разделы каталога">
    <ul class="groups">
${groups
  .filter((g) => templates.some((t) => t.group === g.id))
  .map((g) => `      <li><a href="#${esc(g.id)}">${esc(g.name)}</a></li>`)
  .join('\n')}
    </ul>
  </nav>

${groups.map(groupOf).filter(Boolean).join('\n\n')}

</article>

${cta()}

</main>

${footer()}
</body>
</html>
`
  );
}

fs.mkdirSync(path.join(ROOT, 'templates'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'templates', 'index.html'), build());

console.log(`templates/index.html: ${n} шаблонов в ${groups.length} группах`);
