#!/usr/bin/env node
/**
 * Генератор длинных разборов запусков: /razbor/<slug>/index.html
 *
 *   node _tools/razbor/build.mjs
 *
 * Источник — Markdown в _tools/razbor/<slug>.md и список в data.json.
 * Текст правится только в .md: HTML перезаписывается при каждой сборке.
 *
 * Весь текст попадает в HTML на этапе сборки — краулеры ИИ-ассистентов
 * JavaScript не выполняют. Скриптов на странице нет вообще.
 *
 * Что понимает разметка (ровно то, что нужно разборам, не весь Markdown):
 *   # Заголовок страницы       — h1, первая строка *курсивом* под ним — подзаголовок
 *   ## / ### / ####            — h2 (попадает в оглавление) / h3 / h4
 *   - пункт                    — список
 *   1 - пункт                  — нумерованный список (соседние пункты склеиваются
 *                                даже через пустую строку)
 *   ✅ пункт                    — чек-лист
 *   | a | b |                  — таблица, вторая строка — разделитель
 *   ![alt](/путь "подпись")    — скрин; несколько строк подряд — галерея
 *   📸 [СКРИН N: что снять]     — место под скрин, которого ещё нет
 *   [ПРОВЕРИТЬ: …], [ДОПИСАТЬ] — пометки автора (любые [СЛОВА КАПСОМ …])
 *   ::: lane … :::             — лента этапов: внутри #### этап, текст и скрины
 *   **жирный**, *курсив*, [текст](https://…)
 *   ———                        — разделитель в исходнике, на страницу не выводится
 *
 * Черновик (draft: true): noindex, пометки и места под скрины видны.
 * Публикация (draft: false): сборка падает, пока в тексте есть хоть одна
 * пометка или пустое место под скрин.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  site, abs, esc, plain, ruDate,
  header, cta, footer, head,
  personLd, breadcrumbLd,
} from '../shared/layout.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const { razbory } = JSON.parse(fs.readFileSync(path.join(HERE, 'data.json'), 'utf8'));

/* ---------- размеры картинок из самих файлов ---------- */

function imageSize(file) {
  const b = fs.readFileSync(file);
  if (b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP') {
    const kind = b.toString('ascii', 12, 16);
    if (kind === 'VP8X') return { w: 1 + b.readUIntLE(24, 3), h: 1 + b.readUIntLE(27, 3) };
    if (kind === 'VP8 ') return { w: b.readUInt16LE(26) & 0x3fff, h: b.readUInt16LE(28) & 0x3fff };
    if (kind === 'VP8L') {
      const bits = b.readUInt32LE(21);
      return { w: 1 + (bits & 0x3fff), h: 1 + ((bits >> 14) & 0x3fff) };
    }
  }
  if (b.readUInt32BE(0) === 0x89504e47) return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
  if (b[0] === 0xff && b[1] === 0xd8) {
    let i = 2;
    while (i < b.length) {
      const marker = b[i + 1];
      const len = b.readUInt16BE(i + 2);
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
        return { w: b.readUInt16BE(i + 7), h: b.readUInt16BE(i + 5) };
      }
      i += 2 + len;
    }
  }
  throw new Error(`не удалось прочитать размер картинки: ${file}`);
}

/* ---------- разметка ---------- */

/* Якоря латиницей: ссылка на раздел целиком читается в мессенджере, а не превращается в %D0%BF… */
const TR = { а:'a',б:'b',в:'v',г:'g',д:'d',е:'e',ё:'e',ж:'zh',з:'z',и:'i',й:'y',к:'k',л:'l',м:'m',н:'n',о:'o',
  п:'p',р:'r',с:'s',т:'t',у:'u',ф:'f',х:'h',ц:'ts',ч:'ch',ш:'sh',щ:'sch',ъ:'',ы:'y',ь:'',э:'e',ю:'yu',я:'ya' };
const slugify = (s) =>
  plain(s)
    .toLowerCase()
    .replace(/[а-яё]/g, (c) => TR[c])
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
    .replace(/-+$/, '');

const TODO = /\[([А-ЯЁ]{3,}[А-ЯЁ ]*(?::[^\]]*)?)\]/g;
const SHOT_TODO = /^📸\s*\[СКРИН\s+(\d+):\s*([^\]]+)\]\s*$/;
const IMG = /^!\[([^\]]+)\]\((\S+?)(?:\s+"([^"]*)")?\)\s*$/;
/* Строки-реакции для Telegram («🔥 - если разбор был ценным») на сайте не нужны. */
const REACTION = /^(🔥|❤️|👍|💯)\s*-\s/;

function makeRenderer(slug, draft) {
  const todos = [];
  const shots = [];

  const inline = (text) => {
    let s = esc(text);
    s = s.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" rel="noopener">$1</a>');
    s = s.replace(TODO, (m, t) => {
      todos.push(t);
      return draft ? `<mark class="todo">${t}</mark>` : m;
    });
    s = s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    s = s.replace(/(^|[^*])\*([^*\s][^*]*?)\*(?!\*)/g, '$1<em>$2</em>');
    return s;
  };

  const figure = (line) => {
    const [, alt, src, cap] = line.match(IMG);
    const file = path.join(ROOT, src.replace(/^\//, ''));
    if (!fs.existsSync(file)) throw new Error(`${slug}: нет картинки ${src}`);
    const { w, h } = imageSize(file);
    const wide = w / h > 1.6 ? ' wide' : '';
    return `<figure class="shot${wide}">
  <a href="${esc(src)}" target="_blank" rel="noopener"><img src="${esc(src)}" width="${w}" height="${h}" alt="${esc(alt)}" loading="lazy" decoding="async" /></a>
  ${cap ? `<figcaption>${inline(cap)}</figcaption>` : ''}
</figure>`;
  };

  const placeholder = (line) => {
    const [, n, what] = line.match(SHOT_TODO);
    shots.push(`СКРИН ${n}: ${what}`);
    return draft ? `<p class="ph">Скрин ${n}: ${inline(what)}</p>` : '';
  };

  /** Разбирает кусок Markdown в список блоков { html, kind }. */
  function blocks(src, { inLane = false } = {}) {
    const out = [];
    const lines = src.split('\n');
    let para = [];

    const flush = () => {
      if (para.length) out.push({ kind: 'p', html: `<p>${inline(para.join(' '))}</p>` });
      para = [];
    };
    const last = () => out[out.length - 1];

    for (let i = 0; i < lines.length; i++) {
      const raw = lines[i];
      const line = raw.trim();

      if (!line) { flush(); continue; }
      if (line === '———' || REACTION.test(line)) { flush(); continue; }

      if (!inLane && line === '::: lane') {
        flush();
        const body = [];
        while (++i < lines.length && lines[i].trim() !== ':::') body.push(lines[i]);
        out.push({ kind: 'lane', html: lane(body.join('\n')) });
        continue;
      }

      let m;
      if ((m = line.match(/^(#{2,4})\s+(.+)$/))) {
        flush();
        const level = inLane ? 3 : m[1].length;
        const text = m[2];
        const id = slugify(text);
        out.push({ kind: `h${level}`, text, id, html: `<h${level} id="${id}">${inline(text)}</h${level}>` });
        continue;
      }
      if (line === '...тишина...') {
        flush();
        out.push({ kind: 'pause', html: '<p class="pause" aria-hidden="true">· · ·</p>' });
        continue;
      }
      if (IMG.test(line) || SHOT_TODO.test(line)) {
        flush();
        const group = [];
        let j = i;
        while (j < lines.length && (IMG.test(lines[j].trim()) || SHOT_TODO.test(lines[j].trim()))) {
          group.push(lines[j].trim());
          j++;
        }
        i = j - 1;
        const figs = group.filter((l) => IMG.test(l)).map(figure);
        const phs = group.filter((l) => SHOT_TODO.test(l)).map(placeholder).filter(Boolean);
        let html = '';
        if (figs.length === 1) html += figs[0];
        if (figs.length > 1) html += `<div class="shots">\n${figs.join('\n')}\n</div>`;
        html += phs.join('\n');
        if (html) out.push({ kind: 'shots', html, figs });
        continue;
      }
      if (line.startsWith('|')) {
        flush();
        const rows = [];
        while (i < lines.length && lines[i].trim().startsWith('|')) rows.push(lines[i++].trim());
        i--;
        const cells = (r) => r.replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
        const [hd, , ...body] = rows;
        out.push({
          kind: 'table',
          html: `<div class="tbl" role="region" aria-label="Таблица" tabindex="0"><table>
<thead><tr>${cells(hd).map((c) => `<th scope="col">${inline(c)}</th>`).join('')}</tr></thead>
<tbody>
${body.map((r) => `<tr>${cells(r).map((c) => `<td>${inline(c)}</td>`).join('')}</tr>`).join('\n')}
</tbody>
</table></div>`,
        });
        continue;
      }
      if ((m = line.match(/^(\d+)\s+-\s+(.+)$/))) {
        flush();
        const item = `<li>${inline(m[2])}</li>`;
        if (last() && last().kind === 'ol') last().items.push(item);
        else out.push({ kind: 'ol', items: [item] });
        continue;
      }
      if ((m = line.match(/^-\s+(.+)$/))) {
        flush();
        const item = `<li>${inline(m[1])}</li>`;
        if (last() && last().kind === 'ul' && !last().closed) last().items.push(item);
        else out.push({ kind: 'ul', items: [item] });
        continue;
      }
      if ((m = line.match(/^✅\s*(.+)$/))) {
        flush();
        const item = `<li>${inline(m[1])}</li>`;
        if (last() && last().kind === 'check') last().items.push(item);
        else out.push({ kind: 'check', items: [item] });
        continue;
      }

      // обычная строка: маркированный список закрывается, если за ним идёт текст
      if (last() && last().kind === 'ul') last().closed = true;
      para.push(line);
    }
    flush();

    for (const b of out) {
      if (b.kind === 'ol') b.html = `<ol class="nums">\n${b.items.join('\n')}\n</ol>`;
      if (b.kind === 'ul') b.html = `<ul>\n${b.items.join('\n')}\n</ul>`;
      if (b.kind === 'check') b.html = `<ul class="check">\n${b.items.join('\n')}\n</ul>`;
    }
    return out;
  }

  /** Лента этапов: каждый #### — этап с текстом слева и полосой скринов справа. */
  function lane(src) {
    const steps = src.split(/\n(?=####\s)/).map((s) => s.trim()).filter(Boolean);
    const items = steps.map((step) => {
      const bs = blocks(step, { inLane: true });
      const title = bs.find((b) => b.kind === 'h3');
      const text = bs.filter((b) => !['h3', 'shots'].includes(b.kind)).map((b) => b.html).join('\n');
      const figs = bs.filter((b) => b.kind === 'shots').flatMap((b) => b.figs || []);
      return `<li class="step">
  <div class="step-text">
    ${title ? title.html : ''}
    ${text}
  </div>
  <div class="strip" role="region" aria-label="Скрины: ${esc(title ? plain(title.text) : 'этап')}" tabindex="0">
${figs.join('\n')}
  </div>
</li>`;
    });
    return `<ol class="lane">\n${items.join('\n')}\n</ol>`;
  }

  return { blocks, inline, todos, shots };
}

/* ---------- оформление ---------- */

const EXTRA_CSS = `
  /* глобальное section{padding:70px 0} здесь не нужно — разбор свёрстан без section */
  .hero.sm h1.long{font-size:40px;max-width:34ch;}
  @media(max-width:720px){.hero.sm h1.long{font-size:28px;}}
  .draft-note{margin:18px 0 0;padding:12px 16px;border-left:3px solid var(--gold);background:#fff;
    font-size:15px;color:var(--ink-soft);max-width:62ch;}
  /* только вертикаль: сокращённое padding затёрло бы боковые отступы .wrap */
  .reading{padding-top:44px;padding-bottom:30px;}
  .prose{max-width:760px;}
  .prose h2{font-size:34px;line-height:1.12;margin:64px 0 18px;letter-spacing:-.01em;scroll-margin-top:90px;}
  .prose h3{font-size:24px;line-height:1.25;margin:40px 0 12px;scroll-margin-top:90px;}
  .prose h4{font-size:19px;margin:28px 0 10px;}
  .prose p{margin:0 0 16px;}
  .prose ul,.prose ol{margin:0 0 20px;padding-left:1.3em;}
  .prose li{margin:0 0 8px;}
  .prose li::marker{color:var(--gold-dk);}
  .prose strong{font-weight:700;}
  .prose a{color:var(--gold-dk);text-decoration:underline;text-underline-offset:3px;}
  .prose ul.check{list-style:none;padding:0;}
  .prose ul.check li{position:relative;padding-left:30px;}
  .prose ul.check li::before{content:"";position:absolute;left:4px;top:.45em;width:12px;height:7px;
    border-left:2px solid var(--gold-dk);border-bottom:2px solid var(--gold-dk);transform:rotate(-45deg);}
  .pause{text-align:center;color:var(--muted);letter-spacing:.4em;margin:30px 0;}
  mark.todo{background:var(--cream2);color:var(--gold-dk);border-bottom:1px dashed var(--gold);
    padding:0 4px;border-radius:3px;font-size:.92em;}
  .ph{border:1.5px dashed var(--gold);background:var(--cream);border-radius:10px;padding:14px 16px;
    color:var(--ink-soft);font-size:15px;margin:22px 0;}

  .toc{max-width:760px;margin:0 0 8px;background:var(--cream);border:1px solid var(--line);border-radius:14px;padding:22px 26px;}
  .toc p{margin:0 0 10px;font-family:'Roboto Condensed';font-weight:700;font-size:19px;}
  .toc ol{margin:0;padding-left:1.3em;columns:2;column-gap:36px;font-size:15.5px;}
  .toc li{margin:0 0 6px;break-inside:avoid;}
  .toc li::marker{color:var(--gold-dk);}
  .toc a{color:var(--ink-soft);}
  .toc a:hover,.toc a:focus{color:var(--gold-dk);text-decoration:underline;}
  @media(max-width:720px){.toc ol{columns:1;}}

  figure.shot{margin:26px 0;}
  figure.shot img{display:block;width:100%;height:auto;border:1px solid var(--line);border-radius:10px;background:var(--cream);}
  figure.shot figcaption{font-size:14px;color:var(--muted);margin-top:8px;line-height:1.45;}
  .shots{display:grid;grid-template-columns:repeat(auto-fill,minmax(14rem,1fr));gap:18px;margin:26px 0;}
  .shots figure.shot{margin:0;}
  .shots figure.wide{grid-column:1/-1;}

  .tbl{overflow-x:auto;border:1px solid var(--line);border-radius:14px;margin:8px 0 26px;}
  .tbl table{border-collapse:collapse;width:100%;min-width:560px;font-size:15px;line-height:1.45;}
  .tbl th{background:var(--cream);text-align:left;font-family:'Roboto Condensed';font-size:16px;}
  .tbl th,.tbl td{padding:12px 14px;border-bottom:1px solid var(--line);vertical-align:top;}
  .tbl tr:last-child td{border-bottom:0;}

  /* Лента этапов — единственный широкий элемент: выходит из колонки чтения */
  .lane{list-style:none;margin:34px 0 46px;padding:0;counter-reset:step;position:relative;}
  .lane::before{content:"";position:absolute;left:19px;top:10px;bottom:30px;width:2px;background:var(--line);}
  .step{position:relative;counter-increment:step;display:grid;grid-template-columns:minmax(0,330px) minmax(0,1fr);
    gap:30px;padding:0 0 48px 66px;}
  .step::before{content:counter(step);position:absolute;left:0;top:0;width:40px;height:40px;border-radius:50%;
    background:var(--ink);color:#fff;font-family:'Roboto Condensed';font-weight:700;font-size:18px;
    display:grid;place-items:center;}
  .step h3{font-size:23px;line-height:1.2;margin:6px 0 12px;}
  .step p{font-size:16px;line-height:1.55;color:var(--ink-soft);margin:0 0 12px;}
  .strip{display:flex;gap:14px;overflow-x:auto;scroll-snap-type:x proximity;padding:2px 2px 12px;align-items:flex-start;
    -webkit-mask-image:linear-gradient(90deg,#000 88%,transparent);mask-image:linear-gradient(90deg,#000 88%,transparent);}
  .strip:focus-visible{outline:3px solid var(--gold);}
  .strip figure.shot{flex:0 0 auto;width:250px;margin:0;scroll-snap-align:start;}
  .strip figure.wide{width:600px;}
  .strip figure.shot:last-child{margin-right:48px;}
  @media(max-width:980px){.step{grid-template-columns:1fr;gap:16px;}}
  @media(max-width:720px){
    .lane::before{left:15px;}
    .step{padding-left:50px;}
    .step::before{width:32px;height:32px;font-size:15px;}
    .strip figure.shot{width:70vw;}
    .strip figure.wide{width:86vw;}
  }
`.trim();

/* ---------- страница ---------- */

function build(r) {
  const srcFile = path.join(HERE, r.source);
  const md = fs.readFileSync(srcFile, 'utf8').split('<!-- author-notes -->')[0];
  const R = makeRenderer(r.slug, r.draft);

  // h1 и подзаголовок берутся из data.json, в тексте их пропускаем
  const body = md.replace(/^#\s.+\n+(\*[^*\n].*\*\n)?/, '');
  const bs = R.blocks(body);
  const url = `/razbor/${r.slug}/`;

  if (!r.draft && (R.todos.length || R.shots.length)) {
    throw new Error(
      `${r.slug}: draft: false, но в тексте осталось пометок — ${R.todos.length}, мест под скрины — ${R.shots.length}.\n` +
      [...R.todos.map((t) => `  [${t}]`), ...R.shots.map((s) => `  ${s}`)].join('\n')
    );
  }

  const toc = bs.filter((b) => b.kind === 'h2');
  const firstImg = bs.find((b) => b.figs && b.figs.length);

  // колонка чтения прерывается только ради ленты
  const parts = [];
  let buf = [];
  for (const b of bs) {
    if (b.kind === 'lane') {
      if (buf.length) parts.push(`<div class="prose">\n${buf.join('\n')}\n</div>`);
      buf = [];
      parts.push(b.html);
    } else buf.push(b.html);
  }
  if (buf.length) parts.push(`<div class="prose">\n${buf.join('\n')}\n</div>`);

  const jsonld = {
    '@context': 'https://schema.org',
    '@graph': [
      personLd,
      {
        '@type': 'Article',
        '@id': abs(url) + '#article',
        headline: r.title,
        description: r.description,
        inLanguage: 'ru-RU',
        datePublished: r.published,
        dateModified: r.updated,
        image: abs(r.ogImage),
        url: abs(url),
        mainEntityOfPage: abs(url),
        author: { '@id': abs('/#author') },
        publisher: { '@id': abs('/#author') },
      },
      breadcrumbLd([
        { name: 'Главная', url: '/' },
        { name: 'Гайды', url: '/guides/' },
        { name: r.crumb, url },
      ]),
    ],
  };

  let html =
    head({
      title: r.title,
      description: r.description,
      url,
      jsonld,
      ogImage: r.ogImage,
      ogImageAlt: r.ogImageAlt,
      ogType: 'article',
      extraCss: EXTRA_CSS,
    }) +
    `
${header()}

<main id="main">
<div class="hero sm">
  <div class="wrap">
    <nav class="crumbs" aria-label="Хлебные крошки">
      <ol>
        <li><a href="/">Главная</a></li>
        <li><a href="/guides/">Гайды</a></li>
        <li aria-current="page">${esc(r.crumb)}</li>
      </ol>
    </nav>
    <p class="eyebrow">${esc(r.eyebrow)}</p>
    <h1 class="long">${esc(r.title)}</h1>
    <p class="lead">${esc(r.description)}</p>
    <p class="updated">Обновлено <b>${ruDate(r.updated)}</b></p>
${r.draft ? `    <p class="draft-note" role="note">Черновик: страница закрыта от поисковиков. Пометок в тексте — ${R.todos.length}, мест под скрины — ${R.shots.length}.</p>\n` : ''}  </div>
</div>

<article class="wrap reading">
  <nav class="toc" aria-label="Содержание">
    <p>Содержание</p>
    <ol>
${toc.map((h) => `      <li><a href="#${h.id}">${R.inline(h.text)}</a></li>`).join('\n')}
    </ol>
  </nav>

${parts.join('\n\n')}
</article>

${cta()}

</main>

${footer()}
</body>
</html>
`;

  if (r.draft) {
    html = html.replace(
      /<meta name="robots" content="[^"]*" \/>/,
      '<meta name="robots" content="noindex,nofollow" />'
    );
  }

  const outDir = path.join(ROOT, 'razbor', r.slug);
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'index.html'), html);

  const ids = toc.map((h) => h.id);
  const dup = ids.filter((id, i) => ids.indexOf(id) !== i);
  if (dup.length) throw new Error(`${r.slug}: одинаковые якоря разделов: ${dup.join(', ')}`);

  console.log(
    `razbor/${r.slug}/index.html: ${toc.length} разделов` +
    (r.draft ? `, черновик — пометок ${R.todos.length}, мест под скрины ${R.shots.length}` : '') +
    (firstImg ? '' : ', без картинок')
  );
}

for (const r of razbory) build(r);
