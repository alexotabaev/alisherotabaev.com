#!/usr/bin/env node
/**
 * Страница 404.
 *
 *   node _tools/hygiene/notfound.mjs
 *
 * Было — стандартная заглушка Tilda: <title>Tilda</title>, логотип Tilda,
 * подгружаемый с внешнего домена, и ссылка на tilda.cc. То есть чужая
 * реклама на 404 клиента, без единой ссылки обратно на сайт.
 *
 * Стало — страница в оформлении сайта с навигацией по разделам: человек,
 * попавший на несуществующий адрес, видит куда идти дальше, а не уходит.
 *
 * Сама страница noindex: в выдаче ей делать нечего.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { site, esc, header, footer, CSS, SPRITE } from '../shared/layout.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

const LINKS = [
  { u: '/', t: 'Главная', d: 'Кто я и чем занимаюсь' },
  { u: '/cases/', t: 'Кейсы клиентов', d: '26 историй роста экспертов' },
  { u: '/opensource/', t: 'Опенсорс-каталог', d: '164 готовых решения с GitHub' },
  { u: '/blog', t: 'Блог', d: 'Статьи про деньги и мышление' },
];

const html = `<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Страница не найдена — ${esc(site.author)}</title>
<meta name="robots" content="noindex,follow" />
<link rel="shortcut icon" href="${site.favicon}" type="image/x-icon" />
<link rel="preload" href="/files/fonts/roboto-condensed-cyrillic.woff2" as="font" type="font/woff2" crossorigin />
<link rel="preload" href="/files/fonts/roboto-cyrillic.woff2" as="font" type="font/woff2" crossorigin />
<style>
${CSS}

  .nf{padding:90px 0 80px;text-align:center;}
  .nf .code{font-family:'Roboto Condensed';font-size:120px;font-weight:700;line-height:1;
    color:var(--gold);letter-spacing:-.02em;margin:0;}
  .nf h1{font-size:40px;font-weight:700;margin:14px 0 12px;}
  .nf p.lead{font-size:19px;color:var(--ink-soft);max-width:52ch;margin:0 auto 40px;}
  .nf ul{display:grid;grid-template-columns:repeat(2,1fr);gap:16px;list-style:none;padding:0;
    margin:0 auto;max-width:720px;text-align:left;}
  .nf li a{display:block;background:#fff;border:1px solid var(--line);border-radius:14px;
    padding:20px 22px;transition:transform .15s ease,box-shadow .15s ease,border-color .15s ease;}
  .nf li a:hover{transform:translateY(-3px);box-shadow:var(--shadow);border-color:var(--gold);}
  .nf li b{font-family:'Roboto Condensed';font-size:20px;font-weight:700;display:block;margin-bottom:4px;}
  .nf li span{font-size:14.5px;color:var(--muted);}
  @media(max-width:640px){.nf ul{grid-template-columns:1fr;}.nf .code{font-size:84px;}.nf h1{font-size:28px;}}
</style>
</head>
<body>
${SPRITE}
${header()}

<main id="main">
  <section class="nf">
    <div class="wrap">
      <p class="code">404</p>
      <h1>Такой страницы нет</h1>
      <p class="lead">Возможно, адрес набран с опечаткой или страницу перенесли. Вот куда можно пойти вместо неё.</p>
      <ul>
${LINKS.map((l) => `        <li><a href="${l.u}"><b>${esc(l.t)}</b><span>${esc(l.d)}</span></a></li>`).join('\n')}
      </ul>
    </div>
  </section>
</main>

${footer()}
</body>
</html>
`;

fs.writeFileSync(path.join(ROOT, '404.html'), html);
console.log(`404.html: ${Math.round(html.length / 1024)} КБ, ссылок на разделы: ${LINKS.length}`);
