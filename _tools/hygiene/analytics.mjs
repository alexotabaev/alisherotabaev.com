#!/usr/bin/env node
/**
 * Счётчики аналитики на всех открытых страницах.
 *
 *   node _tools/hygiene/analytics.mjs [--dry]
 *
 * Номера — в analytics.json. Пока они пустые, скрипт ничего не вставляет
 * и говорит об этом вслух: счётчик с чужим номером собирал бы данные не
 * туда, а заметить это со стороны почти невозможно.
 *
 * Ставится на страницы, открытые для индексации. На закрытые не ставим:
 * это служебные страницы и обрезки вёрстки, статистика по ним только
 * зашумит отчёты.
 *
 * Оба счётчика подключаются асинхронно и не задерживают отрисовку. Но
 * честно: это примерно 75 КБ чужого кода и куки двух рекламных компаний
 * на каждой странице — после того как мы специально убирали обращения к
 * чужим доменам. Осознанный размен ради данных, которых иначе нет.
 *
 * Идемпотентный: свой блок снимается перед вставкой.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
process.chdir(ROOT);

const DRY = process.argv.includes('--dry');
const cfg = JSON.parse(fs.readFileSync(path.join(HERE, 'analytics.json'), 'utf8'));

const START = '<!-- analytics:start (генерируется _tools/hygiene/analytics.mjs) -->';
const END = '<!-- analytics:end -->';
const reBlock = new RegExp(
  START.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '[\\s\\S]*?' + END.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\n?'
);

if (!cfg.metrica && !cfg.ga4) {
  console.log('аналитика: номера не заданы в analytics.json — ничего не вставляю');
  process.exit(0);
}

if (cfg.metrica && !/^\d+$/.test(String(cfg.metrica))) {
  throw new Error(`analytics.json: номер Метрики «${cfg.metrica}» — ожидается число`);
}
if (cfg.ga4 && !/^G-[A-Z0-9]+$/.test(cfg.ga4)) {
  throw new Error(`analytics.json: идентификатор GA4 «${cfg.ga4}» — ожидается вид G-XXXXXXXXXX`);
}

/* ---------- какие страницы ---------- */

const disallow = fs
  .readFileSync('robots.txt', 'utf8')
  .split('\n')
  .filter((l) => l.startsWith('Disallow:'))
  .map((l) => l.slice(9).trim())
  .filter(Boolean)
  .map((d) => d.replace(/\*$/, ''));

const isBlocked = (url) =>
  disallow.some((d) => {
    const p = d.replace(/\/$/, '');
    return url === p || url.startsWith(p + '/');
  });

function collect() {
  const out = [];
  const walk = (dir, depth) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.name.startsWith('.') || e.name.startsWith('_')) continue;
      const p = path.join(dir, e.name).replace(/^\.\//, '');
      if (e.isDirectory()) {
        if (['images', 'css', 'js', 'files'].includes(e.name)) continue;
        if (depth < 3) walk(p, depth + 1);
      } else if (e.name === 'index.html') out.push(p);
    }
  };
  walk('.', 0);
  out.push(...fs.readdirSync('.').filter((f) => /^page\d+\.html$/.test(f)));
  return out;
}

/* ---------- код счётчиков ---------- */

const metrica = cfg.metrica
  ? `<script>(function(m,e,t,r,i,k,a){m[i]=m[i]||function(){(m[i].a=m[i].a||[]).push(arguments)};
m[i].l=1*new Date();for(var j=0;j<e.length;j++){if(e[j].src===r){return}}
k=t.createElement("script"),a=t.getElementsByTagName("script")[0],k.async=1,k.src=r,a.parentNode.insertBefore(k,a)})
(window,document.scripts,"script","https://mc.yandex.ru/metrika/tag.js","ym");
ym(${cfg.metrica},"init",{ssr:true,clickmap:true,trackLinks:true,accurateTrackBounce:true,webvisor:${cfg.webvisor === true}});</script>
<noscript><div><img src="https://mc.yandex.ru/watch/${cfg.metrica}" style="position:absolute;left:-9999px" alt="" /></div></noscript>`
  : '';

const ga = cfg.ga4
  ? `<script async src="https://www.googletagmanager.com/gtag/js?id=${cfg.ga4}"></script>
<script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}
gtag("js",new Date());gtag("config","${cfg.ga4}");</script>`
  : '';

const BLOCK = [START, metrica, ga, END].filter(Boolean).join('\n');

/* ---------- вставка ---------- */

let done = 0;
let skipped = 0;
const noPlace = [];

for (const file of collect()) {
  const url =
    file === 'index.html' ? '/' : file.endsWith('/index.html') ? '/' + path.dirname(file) : '/' + file;

  const src = fs.readFileSync(file, 'utf8');
  let s = src.replace(reBlock, '');

  if (isBlocked(url || '/') || /<meta[^>]+name="robots"[^>]+content="[^"]*noindex/i.test(s)) {
    if (s !== src && !DRY) fs.writeFileSync(file, s); // снять с закрытых, если стояло
    skipped++;
    continue;
  }

  // Перед </head>: счётчики асинхронные, отрисовку не держат, но данные
  // начинают собирать с самого начала загрузки.
  if (s.includes('</head>')) {
    s = s.replace('</head>', BLOCK + '\n</head>');
  } else if (/<body[\s>]/i.test(s)) {
    s = s.replace(/<body[\s>]/i, (m) => BLOCK + '\n' + m);
  } else {
    noPlace.push(file);
    continue;
  }

  if (s !== src && !DRY) fs.writeFileSync(file, s);
  done++;
}

if (noPlace.length) {
  throw new Error(
    `некуда вставить счётчик: ${noPlace.join(', ')} — нет ни </head>, ни <body>. ` +
      `Молчаливый пропуск дал бы дыру в статистике, которую не видно`
  );
}

console.log(
  `${DRY ? '[проверка] ' : ''}счётчики: вставлено на ${done} страницах, пропущено закрытых ${skipped}`
);
console.log(
  `  Метрика: ${cfg.metrica || '—'}${cfg.metrica && cfg.webvisor ? ' (с вебвизором)' : ''}` +
    `, GA4: ${cfg.ga4 || '—'}`
);
