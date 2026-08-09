#!/usr/bin/env node
/**
 * Генератор страницы /opensource/ и страниц категорий.
 *
 *   node _tools/opensource/build.mjs
 *
 * Источник данных — _tools/opensource/data.json. Весь каталог попадает
 * в HTML статически: JS отвечает только за фильтрацию уже отрендеренных
 * карточек, поэтому поисковые и AI-краулеры видят полный контент без
 * выполнения скриптов.
 *
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';

import {
  site, abs, esc, plain, ld, ruDate,
  SPRITE, icon, TG_ICON, GH_ICON,
  header, cta, footer, head,
  personLd, breadcrumbLd,
} from '../shared/layout.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const data = JSON.parse(fs.readFileSync(path.join(HERE, 'data.json'), 'utf8'));
const { section, categories, repos, faq } = data;

const CAT = Object.fromEntries(categories.map((c) => [c.key, c]));
const catUrl = (c) => `${section.path}${c.slug}/`;

/** Порядок внутри категории: сначала то, что взяли в работу больше людей. */
const byStars = (list) => [...list].sort((a, b) => (b.stars || 0) - (a.stars || 0));

/** «269653» → «269 тыс» — на карточке важен порядок, а не точное число. */
const shortStars = (n) => {
  if (!n) return '';
  if (n >= 1000) return `${Math.round(n / 1000)} тыс`;
  return String(n);
};

/** Карточка проекта. Заголовок — ссылка, чтобы у внешнего URL был осмысленный анкор. */
const card = (r) => {
  const c = CAT[r.cat];
  const url = `https://github.com/${r.repo}`;
  return `        <li class="card" data-cat="${esc(r.cat)}" data-name="${esc(r.name)}" data-stars="${r.stars || 0}" id="repo-${esc(slugifyRepo(r.repo))}">
          <span class="cardtop"><span class="tag">${esc(c.label)}</span>${
            r.stars
              ? `<span class="stars" title="Звёзд на GitHub — сколько людей отметили проект">★ ${esc(shortStars(r.stars))}</span>`
              : ''
          }</span>
          <h4><a href="${esc(url)}" target="_blank" rel="noopener">${esc(r.name)}</a></h4>
          <p class="repo"><code>${esc(r.repo)}</code></p>
          <p class="d">${r.desc}</p>
          <a class="gh" href="${esc(url)}" target="_blank" rel="noopener" aria-label="Открыть ${esc(r.name)} на GitHub">${GH_ICON} Открыть на GitHub</a>
        </li>`;
};

const slugifyRepo = (repo) => repo.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const softwareLd = (r) => ({
  '@type': 'SoftwareApplication',
  name: r.name,
  applicationCategory: 'DeveloperApplication',
  description: plain(r.desc),
  url: `https://github.com/${r.repo}`,
  codeRepository: `https://github.com/${r.repo}`,
  offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' }
});

/**
 * Имя автора в конце заголовка добавляется, только если заголовок с ним
 * укладывается в 65 символов. Иначе поисковик обрежет хвост в выдаче —
 * и вместо бренда покажет многоточие, съев часть смысла.
 */
const withBrand = (title, brand = ' — Алишер Отабаев') =>
  title.length + brand.length <= 65 ? title + brand : title;

/* ---------- главная страница каталога ---------- */

function buildIndex() {
  const total = repos.length;
  const title = `${total} готовых опенсорс-решений для разработки и ИИ с GitHub`;
  const description = `Каталог из ${total} проверенных опенсорс-проектов по ${categories.length} категориям: ИИ-агенты, Claude Code, скрапинг, self-hosted замены сервисов, инфраструктура. С описанием, чем каждый ценен, и прямыми ссылками на GitHub.`;

  const catBlocks = categories
    .map((c) => {
      // Внутри категории — по числу звёзд: самое проверенное сверху,
      // чтобы не читать все карточки подряд в поисках нужного.
      const list = byStars(repos.filter((r) => r.cat === c.key));
      return `      <div class="catblock" data-cat="${esc(c.key)}" id="${esc(c.slug)}">
        <h3>${esc(c.label)} <span class="cnt">${c.count}&nbsp;${plural(c.count)}</span></h3>
        <p class="cdesc">${esc(c.intro)}</p>
        <a class="catlink" href="${catUrl(c)}">Отдельная страница: ${esc(c.label)} →</a>
        <ul class="grid">
${list.map(card).join('\n')}
        </ul>
      </div>`;
    })
    .join('\n\n');

  const chips = [
    `        <li><button type="button" class="chip" data-cat="all" aria-pressed="true">Все<span class="c">${total}</span></button></li>`,
    ...categories.map(
      (c) =>
        `        <li><button type="button" class="chip" data-cat="${esc(c.key)}" aria-pressed="false">${esc(
          c.label
        )}<span class="c">${c.count}</span></button></li>`
    )
  ].join('\n');

  const faqHtml = faq
    .map(
      (f) => `        <div class="item">
          <h3>${esc(f.q)}</h3>
          <p>${esc(f.a)}</p>
        </div>`
    )
    .join('\n');

  const jsonld = {
    '@context': 'https://schema.org',
    '@graph': [
      personLd,
      {
        '@type': 'CollectionPage',
        '@id': abs(section.path) + '#page',
        url: abs(section.path),
        name: title,
        headline: `${total} готовых опенсорс-решений для быстрой разработки`,
        description,
        inLanguage: 'ru-RU',
        datePublished: section.published,
        dateModified: section.updated,
        author: { '@id': abs('/#author') },
        publisher: { '@id': abs('/#author') },
        primaryImageOfPage: abs(section.ogImage),
        about: categories.map((c) => ({ '@type': 'Thing', name: c.label })),
        mainEntity: { '@id': abs(section.path) + '#list' }
      },
      breadcrumbLd([
        { name: 'Главная', url: '/' },
        { name: 'Опенсорс', url: section.path }
      ]),
      {
        '@type': 'ItemList',
        '@id': abs(section.path) + '#list',
        name: 'Каталог опенсорс-решений',
        description: `Проверенные опенсорс-проекты по ${categories.length} категориям`,
        numberOfItems: total,
        itemListOrder: 'https://schema.org/ItemListUnordered',
        itemListElement: repos.map((r, i) => ({
          '@type': 'ListItem',
          position: i + 1,
          item: softwareLd(r)
        }))
      },
      {
        '@type': 'FAQPage',
        '@id': abs(section.path) + '#faq',
        mainEntity: faq.map((f) => ({
          '@type': 'Question',
          name: f.q,
          acceptedAnswer: { '@type': 'Answer', text: f.a }
        }))
      }
    ]
  };

  return (
    head({ title, description, url: section.path, jsonld, ogImage: section.ogImage, ogImageAlt: 'Каталог опенсорс-решений — Алишер Отабаев' }) +
    `${header()}

<main id="main">

<article>

<div class="hero">
  <div class="wrap">
    <p class="eyebrow">Исследование · опенсорс, который экономит месяцы</p>
    <h1>${total} готовых опенсорс-решений, которые экономят месяцы разработки</h1>
    <p class="slogan">Бери готовое. Пиши с нуля <span class="hl">только то, чего ещё нет</span></p>
    <p class="updated">Обновлено <time datetime="${section.updated}">${ruDate(section.updated)}</time> · <b>${total}</b> ${plural(total)} · <b>${categories.length}</b> категорий · автор — <a href="${site.authorUrl}">${esc(site.author)}</a></p>
    <p class="lead">Друзья, я перелопатил десятки репозиториев и собрал то, что реально экономит недели работы и тысячи токенов. Всё по полочкам, с прямыми ссылками на GitHub. Первое правило простое: сначала ищешь готовое — и только если не нашёл, садишься писать сам.</p>
    <div class="stats">
      <p class="st"><b>${total}</b><span>готовых решений</span></p>
      <p class="st"><b>${categories.length}</b><span>категорий</span></p>
      <p class="st"><b>0₽</b><span>всё бесплатно и открыто</span></p>
    </div>
    <div class="btnrow">
      <a class="btn btn-primary" href="#catalog">Смотреть подборку</a>
      <a class="btn btn-tg" href="${site.telegram}" target="_blank" rel="noopener">${TG_ICON} Telegram</a>
      <a class="btn btn-max" href="${site.max}" target="_blank" rel="noopener">Канал в Max</a>
    </div>
  </div>
</div>

<section class="philo" aria-labelledby="philo-h">
  <div class="wrap">
    <div class="sec-head">
      <p class="kicker">Мой принцип</p>
      <h2 id="philo-h">Сначала ищи готовое. Кодь только если не нашёл</h2>
      <p>За этим — простой принцип, который экономит мне сотни часов и тысячи долларов. И делает интернет сильнее для всех нас.</p>
    </div>
    <ul class="cards3">
      <li class="pcard">
        <p class="num">01</p>
        <h3>Сначала ищи, потом кодь</h3>
        <p>Первое правило, которое сэкономило мне сотни часов: пока не написал ни строчки — найди готовое. Садись писать сам, только если реально ничего не нашёл. Есть рабочий опенсорс — бери и не изобретай велосипед.</p>
      </li>
      <li class="pcard">
        <p class="num">02</p>
        <h3>Улучшил — верни сообществу</h3>
        <p>Взял чужое, докрутил под себя — верни улучшения авторам. Так решение становится сильнее, а сообщество растёт быстрее. Помогая другим, мы растём сами — это не альтруизм, а закон.</p>
      </li>
      <li class="pcard">
        <p class="num">03</p>
        <h3>Новая экономика разработки</h3>
        <p>Магия не в том, чтобы писать больше кода. А в том, чтобы собирать из готового.</p>
        <span class="big">Раньше: 3 месяца и <em>$2000–3000</em>.<br />Теперь: 5 минут и <em>~$10</em> до результата.</span>
      </li>
    </ul>
  </div>
</section>

<section id="catalog" aria-labelledby="catalog-h">
  <div class="wrap">
    <div class="sec-head">
      <p class="kicker">Подборка находок</p>
      <h2 id="catalog-h">Готовые решения по категориям</h2>
      <p>Каждая карточка — что это и чем оно ценно для быстрой разработки. Найди нужное поиском или фильтром и переходи прямо на GitHub.</p>
    </div>

    <div id="ctrl-sentinel" aria-hidden="true"></div>
    <div class="controls">
      <form class="search" role="search" onsubmit="return false;">
        <label class="sr-only" for="q">Поиск по каталогу опенсорс-проектов</label>
        ${icon('search')}
        <input id="q" name="q" type="search" placeholder="Поиск: агент, база данных, видео, аналитика…" autocomplete="off" />
      </form>
      <div class="chipswrap">
        <ul class="chips" id="chips" aria-label="Фильтр по категориям">
${chips}
        </ul>
      </div>
    </div>

    <p class="countline" id="countline" role="status">Показано ${total} из ${total} ${plural(total)} в ${categories.length} ${categories.length % 10 === 1 && categories.length % 100 !== 11 ? 'категории' : 'категориях'}</p>

    <div id="grid">
${catBlocks}
    </div>

    <p class="empty" id="empty" hidden>Ничего не нашлось. Попробуйте другой запрос.</p>

    <p class="note">Подборка собрана в ходе исследования и отражает находки на момент публикации (обновлено <time datetime="${section.updated}">${ruDate(section.updated)}</time>). Опенсорс-проекты быстро развиваются и иногда переезжают — если ссылка изменилась, найдите репозиторий по названию на GitHub. Проверяйте лицензию и актуальность перед использованием в продакшене.</p>
  </div>
</section>

<section class="faq" id="faq" aria-labelledby="faq-h">
  <div class="wrap">
    <div class="sec-head">
      <p class="kicker">Частые вопросы</p>
      <h2 id="faq-h">Что чаще всего спрашивают про эту подборку</h2>
    </div>
    <div class="qa">
${faqHtml}
    </div>
  </div>
</section>

</article>

${cta()}

</main>

${footer()}

<script>
(function(){
  var q = document.getElementById("q");
  var chips = document.getElementById("chips");
  var countline = document.getElementById("countline");
  var empty = document.getElementById("empty");
  var blocks = Array.prototype.slice.call(document.querySelectorAll(".catblock"));
  var total = ${total};
  var activeCat = "all";

  var cards = blocks.map(function(b){
    return {
      block: b,
      items: Array.prototype.slice.call(b.querySelectorAll(".card")).map(function(el){
        return { el: el, text: (el.textContent || "").toLowerCase() };
      })
    };
  });

  function plural(n){
    var a = Math.abs(n) % 100, b = a % 10;
    if (a > 10 && a < 20) return "проектов";
    if (b > 1 && b < 5) return "проекта";
    if (b === 1) return "проект";
    return "проектов";
  }

  function render(){
    var term = q.value.trim().toLowerCase();
    var shown = 0;
    cards.forEach(function(group){
      var catOk = activeCat === "all" || group.block.dataset.cat === activeCat;
      var visible = 0;
      group.items.forEach(function(it){
        var ok = catOk && (!term || it.text.indexOf(term) !== -1);
        it.el.hidden = !ok;
        if (ok) visible++;
      });
      group.block.hidden = visible === 0;
      shown += visible;
    });
    empty.hidden = shown !== 0;
    var suffix = "";
    if (activeCat !== "all") {
      var btn = chips.querySelector('[data-cat="' + activeCat + '"]');
      if (btn) suffix += " · " + btn.childNodes[0].nodeValue.trim();
    }
    if (term) suffix += " · «" + term + "»";
    if (!suffix) suffix = " в ${categories.length} категориях";
    countline.textContent = "Показано " + shown + " из " + total + " " + plural(total) + suffix;
  }

  // Панель фильтра залипает у верха — тогда ряд категорий схлопывается в одну строку,
  // чтобы не занимать пол-экрана. Сторожок стоит в потоке перед панелью: как только
  // он уходит под шапку, панель считается залипшей.
  var controls = document.querySelector(".controls");
  var sentinel = document.getElementById("ctrl-sentinel");
  var pendingSync = false;
  function syncStuck(){
    pendingSync = false;
    controls.classList.toggle("is-stuck", sentinel.getBoundingClientRect().top < 72);
  }
  if (controls && sentinel) {
    window.addEventListener("scroll", function(){
      if (pendingSync) return;
      pendingSync = true;
      requestAnimationFrame(syncStuck);
    }, { passive: true });
    window.addEventListener("resize", syncStuck, { passive: true });
    syncStuck();
  }

  // После смены категории вернуть пользователя к списку, если он ушёл ниже него
  function revealResults(){
    var grid = document.getElementById("grid");
    var top = grid.getBoundingClientRect().top + window.scrollY - 150;
    if (window.scrollY > top) window.scrollTo({ top: top, behavior: "smooth" });
  }

  chips.addEventListener("click", function(e){
    var btn = e.target.closest(".chip");
    if (!btn) return;
    activeCat = btn.dataset.cat;
    chips.querySelectorAll(".chip").forEach(function(c){
      c.setAttribute("aria-pressed", String(c === btn));
    });
    render();
    revealResults();
  });

  q.addEventListener("input", render);
})();
</script>
</body>
</html>
`
  );
}

/* ---------- страница категории ---------- */

function buildCategory(c, i) {
  const list = byStars(repos.filter((r) => r.cat === c.key));
  const url = catUrl(c);
  const others = categories.filter((x) => x.key !== c.key);

  const jsonld = {
    '@context': 'https://schema.org',
    '@graph': [
      personLd,
      {
        '@type': 'CollectionPage',
        '@id': abs(url) + '#page',
        url: abs(url),
        name: c.title,
        headline: c.h1,
        description: c.description,
        inLanguage: 'ru-RU',
        datePublished: section.published,
        dateModified: section.updated,
        author: { '@id': abs('/#author') },
        publisher: { '@id': abs('/#author') },
        isPartOf: { '@type': 'CollectionPage', '@id': abs(section.path) + '#page', url: abs(section.path) },
        mainEntity: { '@id': abs(url) + '#list' }
      },
      breadcrumbLd([
        { name: 'Главная', url: '/' },
        { name: 'Опенсорс', url: section.path },
        { name: c.label, url }
      ]),
      {
        '@type': 'ItemList',
        '@id': abs(url) + '#list',
        name: c.h1,
        numberOfItems: list.length,
        itemListOrder: 'https://schema.org/ItemListUnordered',
        itemListElement: list.map((r, n) => ({
          '@type': 'ListItem',
          position: n + 1,
          item: softwareLd(r)
        }))
      }
    ]
  };

  const prev = categories[i - 1];
  const next = categories[i + 1];

  return (
    head({ title: withBrand(c.title), description: c.description, url, jsonld, ogImage: section.ogImage, ogImageAlt: 'Каталог опенсорс-решений — Алишер Отабаев' }) +
    `${header()}

<main id="main">

<article>

<div class="hero sm">
  <div class="wrap">
    <nav class="crumbs" aria-label="Хлебные крошки">
      <ol>
        <li><a href="/">Главная</a></li>
        <li><a href="${section.path}">Опенсорс</a></li>
        <li aria-current="page">${esc(c.label)}</li>
      </ol>
    </nav>
    <h1>${esc(c.h1)}</h1>
    <p class="updated">Обновлено <time datetime="${section.updated}">${ruDate(section.updated)}</time> · <b>${list.length}</b>&nbsp;${plural(list.length)} · часть каталога <a href="${section.path}">из ${repos.length} опенсорс-решений</a></p>
    <p class="lead">${esc(c.intro)}</p>
    <div class="btnrow">
      <a class="btn btn-ghost" href="${section.path}">← Весь каталог</a>
      <a class="btn btn-tg" href="${site.telegram}" target="_blank" rel="noopener">${TG_ICON} Telegram-канал</a>
    </div>
  </div>
</div>

<section aria-labelledby="list-h">
  <div class="wrap">
    <div class="sec-head">
      <p class="kicker">${esc(c.label)}</p>
      <h2 id="list-h">${list.length}&nbsp;${plural(list.length)} в категории</h2>
    </div>
    <ul class="grid">
${list.map(card).join('\n')}
    </ul>
    <p class="note">Подборка отражает находки на момент обновления страницы. Опенсорс-проекты быстро развиваются и иногда переезжают — если ссылка изменилась, найдите репозиторий по названию на GitHub. Проверяйте лицензию и актуальность перед использованием в продакшене.</p>
  </div>
</section>

<section class="philo" aria-labelledby="other-h">
  <div class="wrap">
    <div class="sec-head">
      <p class="kicker">Другие категории</p>
      <h2 id="other-h">Смотрите также</h2>
      <p>Весь каталог — <a href="${section.path}">${repos.length} опенсорс-решений в ${categories.length} категориях</a>.</p>
    </div>
    <nav aria-label="Другие категории каталога">
      <ul class="catnav">
${others.map((x) => `        <li><a href="${catUrl(x)}">${esc(x.label)}<span class="c">${x.count}</span></a></li>`).join('\n')}
      </ul>
    </nav>
    <p style="margin-top:26px;font-size:15px;color:var(--muted);">
      ${prev ? `← <a href="${catUrl(prev)}">${esc(prev.label)}</a>` : ''}${prev && next ? ' &nbsp;·&nbsp; ' : ''}${next ? `<a href="${catUrl(next)}">${esc(next.label)}</a> →` : ''}
    </p>
  </div>
</section>

</article>

${cta()}

</main>

${footer()}
</body>
</html>
`
  );
}

function plural(n) {
  const a = Math.abs(n) % 100;
  const b = a % 10;
  if (a > 10 && a < 20) return 'проектов';
  if (b > 1 && b < 5) return 'проекта';
  if (b === 1) return 'проект';
  return 'проектов';
}

/* ---------- llms.txt ---------- */

function buildLlmsTxt() {
  const lines = [];
  lines.push('# Алишер Отабаев');
  lines.push('');
  lines.push(
    '> Практик ИИ-разработки и продюсер. Собираю и проверяю инструменты, которые ускоряют создание продуктов: опенсорс-проекты, ИИ-агенты, автоматизацию. Материалы на русском языке.'
  );
  lines.push('');
  lines.push(`Последнее обновление: ${section.updated}.`);
  lines.push('');
  lines.push('## Каталог опенсорс-решений');
  lines.push('');
  lines.push(
    `- [Каталог из ${repos.length} опенсорс-решений](${abs(section.path)}): проверенные проекты с GitHub по ${categories.length} категориям — что это, чем ценно и прямая ссылка на репозиторий. Обновлён ${section.updated}.`
  );
  lines.push('');
  lines.push('### Категории каталога');
  lines.push('');
  for (const c of categories) {
    lines.push(`- [${c.label} (${c.count})](${abs(catUrl(c))}): ${plain(c.intro)}`);
  }
  lines.push('');
  lines.push('### Часто задаваемые вопросы по каталогу');
  lines.push('');
  for (const f of faq) {
    lines.push(`- **${f.q}** ${f.a}`);
  }
  lines.push('');
  lines.push('## Другое');
  lines.push('');
  lines.push('- [Главная](https://alisherotabaev.com/): о проектах и направлениях работы.');
  lines.push('- [Блог](https://alisherotabaev.com/blog): статьи и разборы.');
  lines.push('- [Об авторе](https://alisherotabaev.com/about): биография и опыт.');
  lines.push('- [Telegram-канал](https://t.me/AlisherOtabaev_ai): свежие находки и инструменты.');
  lines.push('');
  fs.writeFileSync(path.join(ROOT, 'llms.txt'), lines.join('\n'));
}

/* ---------- OG-картинка (--og) ---------- */

/**
 * Рендерит og-image.html в PNG 1200×630 через headless Chrome.
 * Запускается только по флагу --og: обычная пересборка HTML картинку не трогает.
 */
function buildOgImage() {
  const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  if (!fs.existsSync(CHROME)) {
    console.warn('⚠ Chrome не найден — OG-картинка не перерисована.');
    return false;
  }
  const src = path.join(HERE, 'og-image.html');
  const dest = path.join(ROOT, section.ogImage.replace(/^\//, ''));

  spawnSync(
    CHROME,
    [
      '--headless',
      '--disable-gpu',
      '--hide-scrollbars',
      '--window-size=1200,630',
      `--screenshot=${dest}`,
      '--virtual-time-budget=8000',
      pathToFileURL(src).href
    ],
    { stdio: 'ignore' }
  );

  if (!fs.existsSync(dest)) {
    console.warn('⚠ Chrome не отдал файл — OG-картинка не перерисована.');
    return false;
  }
  // Необязательное сжатие: картинка почти плоская, pngquant срезает ~85% веса
  const q = spawnSync('pngquant', ['--quality', '65-88', '--speed', '1', '--force', '--output', dest, dest], {
    stdio: 'ignore'
  });
  const kb = Math.round(fs.statSync(dest).size / 1024);
  console.log(`${section.ogImage}: 1200×630, ${kb} КБ${q.status === 0 ? ' (pngquant)' : ''}`);
  return true;
}

/* ---------- запуск ---------- */

const out = [];

fs.writeFileSync(path.join(ROOT, 'opensource', 'index.html'), buildIndex());
out.push('opensource/index.html');

categories.forEach((c, i) => {
  const dir = path.join(ROOT, 'opensource', c.slug);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'index.html'), buildCategory(c, i));
  out.push(`opensource/${c.slug}/index.html (${c.count})`);
});


buildLlmsTxt();
if (process.argv.includes('--og')) buildOgImage();

console.log(out.join('\n'));
console.log('llms.txt: обновлён');
console.log(`\nВсего: ${repos.length} проектов, ${categories.length} категорий, ${faq.length} FAQ`);
