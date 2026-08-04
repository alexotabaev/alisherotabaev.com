#!/usr/bin/env node
/**
 * Генератор страницы-хаба /cases/ — все кейсы клиентов одним списком.
 *
 *   node _tools/cases/build.mjs
 *
 * Источник — _tools/cases/data.json, собранный из существующих страниц
 * скриптом extract.py. Сами страницы кейсов остаются как есть (экспорт
 * Tilda), хаб на них ссылается.
 *
 * Как и в /opensource/, карточки попадают в HTML на этапе сборки: скрипт
 * только прячет уже отрисованные, поэтому краулеры без JS видят весь список.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  site, abs, esc, ld, ruDate,
  SPRITE, TG_ICON,
  header, cta, footer, head,
  personLd, breadcrumbLd,
} from '../shared/layout.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const data = JSON.parse(fs.readFileSync(path.join(HERE, 'data.json'), 'utf8'));
const { section, cases } = data;

/* ---------- вспомогательное ---------- */

const plural = (n, one, few, many) => {
  const a = Math.abs(n) % 100;
  const b = a % 10;
  if (a > 10 && a < 20) return many;
  if (b > 1 && b < 5) return few;
  if (b === 1) return one;
  return many;
};

const initials = (name) =>
  name.split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase();

/** «760 000» → «760 тыс», «2 500 000» → «2,5 млн» — для плашки на карточке. */
const shortMoney = (n) => {
  if (!n) return '';
  if (n >= 1_000_000) return `${String(n / 1_000_000).replace('.', ',')} млн ₽`;
  if (n >= 1000) return `${Math.round(n / 1000)} тыс ₽`;
  return `${n} ₽`;
};

/** Первое предложение — для описания карточки, если заголовка с результатом нет. */
const firstSentence = (s, max = 150) => {
  if (!s) return '';
  const t = s.length > max ? s.slice(0, max).replace(/\s+\S*$/, '') + '…' : s;
  return t;
};

/** Аккуратный регистр: заголовки в Tilda набраны капсом. */
const sentenceCase = (s) => {
  if (!s) return '';
  const letters = s.replace(/[^А-ЯЁA-Zа-яёa-z]/g, '');
  const upper = letters.replace(/[^А-ЯЁA-Z]/g, '').length;
  if (letters.length < 8 || upper / letters.length < 0.8) return s;  // не капс — не трогаем
  const lower = s.toLowerCase();
  return lower.charAt(0).toUpperCase() + lower.slice(1);
};

/* ---------- стили карточек ---------- */

const EXTRA_CSS = `
  /* Кейсы */
  .cases{display:grid;grid-template-columns:repeat(3,1fr);gap:20px;list-style:none;margin:0;padding:0;}
  @media(max-width:980px){.cases{grid-template-columns:repeat(2,1fr);}}
  @media(max-width:640px){.cases{grid-template-columns:1fr;}}
  .kase{display:flex;flex-direction:column;height:100%;background:#fff;border:1px solid var(--line);
    border-radius:14px;overflow:hidden;transition:transform .15s ease,box-shadow .15s ease,border-color .15s ease;}
  .kase:hover{transform:translateY(-3px);box-shadow:var(--shadow);border-color:var(--gold);}
  .kase a.full{display:flex;flex-direction:column;height:100%;}
  .kase .ph{position:relative;aspect-ratio:3/2;background:var(--cream2);overflow:hidden;
    display:flex;align-items:center;justify-content:center;}
  .kase .ph img{width:100%;height:100%;object-fit:cover;display:block;}
  .kase .ph .ini{font-family:'Roboto Condensed';font-size:52px;font-weight:700;color:var(--gold-dk);opacity:.55;}
  .kase .money{position:absolute;left:12px;bottom:12px;background:var(--ink);color:#fff;
    font-family:'Roboto Condensed';font-weight:700;font-size:15px;padding:6px 12px;border-radius:999px;}
  .kase .body{padding:18px 20px 20px;display:flex;flex-direction:column;flex-grow:1;}
  .kase h3{font-size:21px;font-weight:700;margin:0 0 3px;}
  .kase .role{font-size:13.5px;color:var(--muted);margin:0 0 12px;line-height:1.45;}
  .kase .res{font-size:15px;color:var(--ink-soft);margin:0 0 16px;line-height:1.5;flex-grow:1;}
  .kase .more{font-size:14px;font-weight:600;color:var(--gold-dk);}
  .kase:hover .more{color:var(--ink);}
  .kase .ph .ph-note{position:absolute;inset:auto 0 0 0;height:60px;
    background:linear-gradient(180deg,rgba(0,13,41,0),rgba(0,13,41,.35));}
`.trim();

/* ---------- карточка ---------- */

function card(c) {
  const url = `/${c.slug}/`;
  const money = shortMoney(c.scale);
  const result = c.headline
    ? sentenceCase(c.headline)
    : firstSentence(c.to || (c.results && c.results[0]) || c.quote);

  const photo = c.photo
    ? `<img src="${esc(c.photo)}" alt="${esc(c.name)} — кейс клиента Алишера Отабаева" loading="lazy" width="380" height="253" />`
    : `<span class="ini" aria-hidden="true">${esc(initials(c.name))}</span>`;

  return `        <li class="kase" data-name="${esc(c.name.toLowerCase())}">
          <a class="full" href="${url}">
            <span class="ph">
              ${photo}
              ${money ? `<span class="ph-note"></span><span class="money">${esc(money)}</span>` : ''}
            </span>
            <span class="body">
              <h3>${esc(c.name)}</h3>
              <p class="role">${esc(firstSentence(c.role, 90))}</p>
              <p class="res">${esc(result)}</p>
              <span class="more">Смотреть кейс →</span>
            </span>
          </a>
        </li>`;
}

/* ---------- страница ---------- */

function build() {
  const n = cases.length;
  const withMoney = cases.filter((c) => c.scale > 0);
  const max = Math.max(...cases.map((c) => c.scale));

  const title = `Кейсы клиентов — ${n} ${plural(n, 'история', 'истории', 'историй')} роста экспертов`;
  const description =
    `${n} разобранных кейсов: психологи, коучи, врачи, астрологи, маркетологи. ` +
    `Что было до работы, что изменилось после, с цифрами по доходу и продуктам.`;

  const jsonld = {
    '@context': 'https://schema.org',
    '@graph': [
      personLd,
      {
        '@type': 'CollectionPage',
        '@id': abs(section.path) + '#page',
        url: abs(section.path),
        name: title,
        headline: `Кейсы клиентов: ${n} ${plural(n, 'история', 'истории', 'историй')} роста`,
        description,
        inLanguage: 'ru-RU',
        dateModified: section.updated,
        author: { '@id': abs('/#author') },
        publisher: { '@id': abs('/#author') },
        mainEntity: { '@id': abs(section.path) + '#list' },
      },
      breadcrumbLd([
        { name: 'Главная', url: '/' },
        { name: 'Кейсы', url: section.path },
      ]),
      {
        '@type': 'ItemList',
        '@id': abs(section.path) + '#list',
        name: 'Кейсы клиентов',
        numberOfItems: n,
        itemListOrder: 'https://schema.org/ItemListOrderDescending',
        itemListElement: cases.map((c, i) => ({
          '@type': 'ListItem',
          position: i + 1,
          url: abs(`/${c.slug}/`),
          name: `${c.name} — ${c.headline ? sentenceCase(c.headline) : c.role}`,
        })),
      },
    ],
  };

  return (
    head({
      title: title.length + 17 <= 65 ? `${title} — Алишер Отабаев` : title,
      description,
      url: section.path,
      jsonld,
      ogImage: section.ogImage,
      ogImageAlt: 'Кейсы клиентов Алишера Отабаева',
      extraCss: EXTRA_CSS,
    }) +
    `${header()}

<main id="main">

<article>

<div class="hero">
  <div class="wrap">
    <p class="eyebrow">Кейсы · истории клиентов</p>
    <h1>${n} ${plural(n, 'история', 'истории', 'историй')} экспертов, которые выстроили онлайн-проект</h1>
    <p class="updated">Обновлено <time datetime="${section.updated}">${ruDate(section.updated)}</time> · автор — <a href="${site.authorUrl}">${esc(site.author)}</a></p>
    <p class="lead">Психологи, коучи, врачи, астрологи, маркетологи, оценщики. У каждого — своя ниша и своя точка старта. Здесь собрано, что было до работы, что поменялось после и какими цифрами это измеряется. Нажмите на карточку, чтобы открыть кейс целиком.</p>
    <div class="stats">
      <p class="st"><b>${n}</b><span>${plural(n, 'кейс', 'кейса', 'кейсов')}</span></p>
      <p class="st"><b>${withMoney.length}</b><span>с цифрами по доходу</span></p>
      <p class="st"><b>${shortMoney(max)}</b><span>крупнейший результат</span></p>
    </div>
  </div>
</div>

<section aria-labelledby="list-h">
  <div class="wrap">
    <div class="sec-head">
      <p class="kicker">Все кейсы</p>
      <h2 id="list-h">Кто и с чем приходил</h2>
      <p>Отсортированы по масштабу результата. Ищите по имени или нише — например «психолог» или «врач».</p>
    </div>

    <div id="ctrl-sentinel" aria-hidden="true"></div>
    <div class="controls">
      <form class="search" role="search" onsubmit="return false;">
        <label class="sr-only" for="q">Поиск по кейсам</label>
        <svg aria-hidden="true" focusable="false"><use href="#i-search"/></svg>
        <input id="q" name="q" type="search" placeholder="Поиск: психолог, врач, астролог, коуч…" autocomplete="off" />
      </form>
    </div>

    <p class="countline" id="countline" role="status">Показано ${n} из ${n} ${plural(n, 'кейса', 'кейсов', 'кейсов')}</p>

    <ul class="cases" id="grid">
${cases.map(card).join('\n')}
    </ul>

    <p class="empty" id="empty" hidden>Ничего не нашлось. Попробуйте другой запрос.</p>
  </div>
</section>

</article>

${cta()}

</main>

${footer()}

<script>
(function(){
  var q = document.getElementById("q");
  var countline = document.getElementById("countline");
  var empty = document.getElementById("empty");
  var total = ${n};
  var items = Array.prototype.slice.call(document.querySelectorAll(".kase")).map(function(el){
    return { el: el, text: (el.textContent || "").toLowerCase() };
  });

  function render(){
    var term = q.value.trim().toLowerCase();
    var shown = 0;
    items.forEach(function(it){
      var ok = !term || it.text.indexOf(term) !== -1;
      it.el.hidden = !ok;
      if (ok) shown++;
    });
    empty.hidden = shown !== 0;
    countline.textContent = "Показано " + shown + " из " + total + " кейсов" + (term ? " · «" + term + "»" : "");
  }

  q.addEventListener("input", render);
})();
</script>
</body>
</html>
`
  );
}

/* ---------- запуск ---------- */

fs.mkdirSync(path.join(ROOT, 'cases'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'cases', 'index.html'), build());


console.log(`cases/index.html: ${cases.length} кейсов`);
