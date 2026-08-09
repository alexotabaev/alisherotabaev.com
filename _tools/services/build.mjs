#!/usr/bin/env node
/**
 * Генератор раздела /services/ — каталог полезных сервисов.
 *
 *   node _tools/services/build.mjs
 *
 * Раздел-близнец каталога опенсорса и намеренно отделён от него: здесь
 * готовые сервисы, за которые платят и которыми пользуются без своего
 * сервера, там — то, что ставится у себя. Человек выбирает между
 * «заплатить и не думать» и «поднять самому», поэтому у половины карточек
 * есть ссылка на замену из другого раздела.
 *
 * Карточки попадают в HTML на этапе сборки: краулеры ИИ-ассистентов не
 * выполняют JavaScript, и каталог, собранный в браузере, для них пуст.
 * Разбор по группам — обычные якоря, скриптов на странице нет.
 *
 * Падает, если у сервиса указана опенсорс-замена, которой нет в каталоге,
 * или группа, которой не существует. Ссылка в никуда хуже её отсутствия,
 * а молча пропустить такую — значит выпустить каталог с битой связью.
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
const { section, groups, services } = JSON.parse(
  fs.readFileSync(path.join(HERE, 'data.json'), 'utf8')
);
const oss = JSON.parse(fs.readFileSync(path.join(ROOT, '_tools/opensource/data.json'), 'utf8'));

const plural = (n, one, few, many) => {
  const a = Math.abs(n) % 100;
  const b = a % 10;
  if (a > 10 && a < 20) return many;
  if (b > 1 && b < 5) return few;
  if (b === 1) return one;
  return many;
};

/* ---------- связь с каталогом опенсорса ---------- */

const slugifyRepo = (repo) => repo.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/** Находит проект каталога по короткому ключу вида «appflowy» или «cal-com». */
function findOss(key) {
  const k = key.toLowerCase();
  return (
    oss.repos.find((r) => slugifyRepo(r.repo).includes(k)) ||
    oss.repos.find((r) => r.name.toLowerCase().replace(/[^a-z0-9]+/g, '-') === k) ||
    null
  );
}

const known = new Set(groups.map((g) => g.id));
const ossLink = new Map();

for (const s of services) {
  if (!known.has(s.group)) {
    throw new Error(`data.json: у «${s.name}» группа «${s.group}», которой нет`);
  }
  if (s.oss) {
    const r = findOss(s.oss);
    if (!r) {
      throw new Error(
        `data.json: у «${s.name}» указана опенсорс-замена «${s.oss}», ` +
          `но такого проекта нет в каталоге /opensource/`
      );
    }
    ossLink.set(s.name, r);
  }
}

/* ---------- доступность ---------- */

const RU = {
  yes: { text: 'работает в РФ', cls: 'ok' },
  hard: { text: 'оплата затруднена', cls: 'warn' },
  no: { text: 'карты РФ не принимает', cls: 'no' },
  free: { text: 'бесплатный', cls: 'ok' },
};

/* ---------- оформление ---------- */

const EXTRA_CSS = `
  .groups{display:flex;flex-wrap:wrap;gap:.5rem;margin:0 0 2.5rem;padding:0;list-style:none}
  .groups a{display:inline-block;padding:.4rem .85rem;border:1px solid var(--line);
    border-radius:999px;background:var(--cream);color:var(--ink);text-decoration:none;font-size:.94rem}
  .groups a:hover,.groups a:focus{background:var(--cream2);border-color:var(--gold)}
  /* глобальное section{padding:70px 0} добавляло бы по 140px на группу */
  .sgroup{margin:0 0 3rem;padding:0}
  .sgroup > h2{margin:0 0 .35rem}
  .sgroup > .why{margin:0 0 1.25rem;color:var(--muted);max-width:52rem}
  .svcs{display:grid;gap:1rem;padding:0;margin:0;list-style:none;
    grid-template-columns:repeat(auto-fill,minmax(18rem,1fr))}
  .svc{border:1px solid var(--line);border-radius:.7rem;background:var(--paper);
    padding:1.1rem 1.2rem;display:flex;flex-direction:column}
  .svc.pick{border-color:var(--gold)}
  .svc__top{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:.5rem}
  .svc h3{margin:0;font-size:1.05rem;line-height:1.3}
  .svc__pick{font-size:.76rem;font-weight:700;letter-spacing:.04em;text-transform:uppercase;
    color:var(--gold-dk);background:var(--cream2);border-radius:999px;padding:3px 9px;white-space:nowrap}
  .svc p{margin:0 0 .9rem;color:var(--ink-soft);font-size:.95rem;line-height:1.5;flex-grow:1}
  .svc__foot{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap}
  .ru{font-size:.82rem;font-weight:600;border-radius:999px;padding:3px 10px;white-space:nowrap}
  .ru.ok{color:#1c6b3f;background:#e8f5ee}
  .ru.warn{color:#8a5a00;background:#fdf3e0}
  .ru.no{color:#8d2f2f;background:#fbeaea}
  .svc__oss{font-size:.86rem;color:var(--gold-dk);text-decoration:none;font-weight:600}
  .svc__oss:hover,.svc__oss:focus{text-decoration:underline}
`.trim();

/* ---------- страница ---------- */

const n = services.length;
const picks = services.filter((s) => s.pick).length;

function cardOf(s) {
  const ru = RU[s.ru] || RU.yes;
  const r = ossLink.get(s.name);
  return `          <li class="svc${s.pick ? ' pick' : ''}">
            <span class="svc__top"><h3>${esc(s.name)}</h3>${
              s.pick ? '<span class="svc__pick">выбор автора</span>' : ''
            }</span>
            <p>${esc(s.why)}</p>
            <span class="svc__foot">
              <span class="ru ${ru.cls}">${esc(ru.text)}</span>${
                r
                  ? `<a class="svc__oss" href="/opensource/#repo-${esc(slugifyRepo(r.repo))}">опенсорс: ${esc(r.name)} →</a>`
                  : ''
              }
            </span>
          </li>`;
}

function groupOf(g) {
  const items = services.filter((s) => s.group === g.id);
  if (!items.length) return '';
  // Личный выбор автора — вверх: он весит больше описания.
  items.sort((a, b) => (b.pick ? 1 : 0) - (a.pick ? 1 : 0));
  return `      <section class="sgroup" id="${esc(g.id)}">
        <h2>${esc(g.name)}</h2>
        <p class="why">${esc(g.why)}</p>
        <ul class="svcs">
${items.map(cardOf).join('\n')}
        </ul>
      </section>`;
}

function build() {
  const title = `Полезные сервисы — ${n} ${plural(n, 'инструмент', 'инструмента', 'инструментов')} для бизнеса`;
  const description =
    `${n} сервисов по задачам: CRM, рассылки, хостинг, формы, аналитика, платежи, ` +
    `онлайн-школы, боты. У каждого — доступность из России и опенсорс-замена, если она есть.`;

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
        { name: 'Сервисы', url: section.path },
      ]),
      {
        '@type': 'ItemList',
        '@id': abs(section.path) + '#list',
        name: section.title,
        numberOfItems: n,
        itemListElement: services.map((s, i) => ({
          '@type': 'ListItem',
          position: i + 1,
          name: s.name,
          description: s.why,
        })),
      },
    ],
  };

  return (
    head({ title, description, url: section.path, jsonld, extraCss: EXTRA_CSS }) +
    `
${header()}

<main id="main">
<article class="wrap">

  <header class="lede">
    <h1>${esc(section.title)}</h1>
    <p>${esc(description)}</p>
    <p style="color:var(--muted)">Пометка «выбор автора» стоит у ${picks} ${plural(picks, 'сервиса', 'сервисов', 'сервисов')} — это то, чем Алишер пользуется сам или что рекомендует. Цены не указаны намеренно: они устаревают быстрее, чем обновляется страница.</p>
  </header>

  <nav aria-label="Разделы каталога">
    <ul class="groups">
${groups
  .filter((g) => services.some((s) => s.group === g.id))
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

fs.mkdirSync(path.join(ROOT, 'services'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'services', 'index.html'), build());

console.log(
  `services/index.html: ${n} сервисов в ${groups.length} группах, ` +
    `выбор автора у ${picks}, связей с опенсорсом ${ossLink.size}`
);
