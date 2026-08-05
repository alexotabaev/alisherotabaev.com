#!/usr/bin/env node
/**
 * Счётчики аналитики и согласие на куки.
 *
 *   node _tools/hygiene/analytics.mjs [--dry]
 *
 * Номера — в analytics.json. Пока они пустые, скрипт ничего не вставляет
 * и говорит об этом вслух: счётчик с чужим номером собирал бы данные не
 * туда, а заметить это со стороны почти невозможно.
 *
 * Главное про согласие. Баннер имеет смысл, только если он действительно
 * придерживает счётчик. Поэтому здесь код Метрики не выполняется до
 * ответа человека: скрипт вставляется в страницу, но обращение к
 * mc.yandex.ru происходит лишь после нажатия «Принять». Отказ запоминается
 * так же, как согласие, и больше не спрашивается.
 *
 * Пикселя <noscript> нет намеренно. Он сработал бы до всякого согласия и
 * ровно у тех, кто отключил скрипты, — то есть у самых чувствительных
 * к слежке.
 *
 * Ставится на страницы, открытые для индексации. На закрытые не ставим:
 * это служебные страницы и обрезки вёрстки, статистика по ним только
 * зашумит отчёты. Если счётчик когда-то попал на закрытую страницу, при
 * следующем прогоне он снимется.
 *
 * Баннер позиционируется поверх содержимого (position:fixed) и вёрстку не
 * двигает — иначе страница дёргалась бы при загрузке.
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

// Номеров нет — снимаем всё, что стояло раньше. Просто выйти нельзя:
// после очистки номеров на страницах остался бы счётчик, которого уже
// нет в настройках, и никто бы этого не заметил.
if (!cfg.metrica && !cfg.ga4) {
  let cleaned = 0;
  for (const file of collect()) {
    const src = fs.readFileSync(file, 'utf8');
    const s = src.replace(reBlock, '').replace(reBlock, '');
    if (s !== src) {
      if (!DRY) fs.writeFileSync(file, s);
      cleaned++;
    }
  }
  console.log(`аналитика: номера не заданы — счётчики не ставятся` +
    (cleaned ? `, снято со страниц: ${cleaned}` : ''));
  process.exit(0);
}

/* ---------- оформление баннера ---------- */

const CSS = `<style>
.ao-cc{display:none;position:fixed;left:16px;right:16px;bottom:16px;z-index:9500;
 max-width:44rem;margin:0 auto;padding:18px 20px;border-radius:14px;
 background:#faf8f4;border:1px solid #e8e1d6;box-shadow:0 10px 40px rgba(0,13,41,.14);
 font:15px/1.5 'Roboto',Arial,Helvetica,sans-serif;color:#000d29}
.ao-cc[data-show]{display:flex;gap:16px;align-items:center;flex-wrap:wrap}
.ao-cc__text{flex:1 1 20rem;margin:0}
.ao-cc__text a{color:#876638;text-decoration:underline}
.ao-cc__row{display:flex;gap:10px;flex-wrap:wrap}
.ao-cc__btn{border:0;cursor:pointer;padding:11px 20px;border-radius:999px;
 font:600 15px 'Roboto',Arial,sans-serif}
.ao-cc__yes{background:#000d29;color:#fff}
.ao-cc__yes:hover{background:#876638}
.ao-cc__no{background:transparent;color:#000d29;border:1.5px solid #e8e1d6}
.ao-cc__no:hover{border-color:#8f7151}
@media (max-width:640px){.ao-cc{left:10px;right:10px;bottom:10px;padding:16px}}
</style>`;

const BANNER = `<div class="ao-cc" id="ao-cc" role="dialog" aria-live="polite"
 aria-label="Согласие на использование куки">
<p class="ao-cc__text">Сайт использует куки для статистики посещений. Без согласия счётчик не запускается.
 Подробнее — в <a href="/cookie">политике использования куки</a>.</p>
<div class="ao-cc__row">
<button type="button" class="ao-cc__btn ao-cc__yes" id="ao-cc-yes">Принять</button>
<button type="button" class="ao-cc__btn ao-cc__no" id="ao-cc-no">Отклонить</button>
</div>
</div>`;

/* ---------- код счётчиков ---------- */

const metricaInit = cfg.metrica
  ? `(function(m,e,t,r,i,k,a){m[i]=m[i]||function(){(m[i].a=m[i].a||[]).push(arguments)};
m[i].l=1*new Date();for(var j=0;j<e.length;j++){if(e[j].src===r){return}}
k=t.createElement("script"),a=t.getElementsByTagName("script")[0],k.async=1,k.src=r,a.parentNode.insertBefore(k,a)})
(window,document.scripts,"script","https://mc.yandex.ru/metrika/tag.js","ym");
ym(${cfg.metrica},"init",{clickmap:true,trackLinks:true,accurateTrackBounce:true,webvisor:${cfg.webvisor === true}});`
  : '';

const gaInit = cfg.ga4
  ? `var s=document.createElement("script");s.async=1;
s.src="https://www.googletagmanager.com/gtag/js?id=${cfg.ga4}";document.head.appendChild(s);
window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}
gtag("js",new Date());gtag("config","${cfg.ga4}");`
  : '';

// Ключ хранения с версией: если однажды состав счётчиков изменится,
// достаточно поднять версию — и согласие спросят заново.
const GATE = `<script>(function(){
var KEY="ao-consent-v1";
function start(){${metricaInit}${gaInit}}
var saved=null;try{saved=localStorage.getItem(KEY)}catch(e){}
if(saved==="yes"){start();return}
if(saved==="no"){return}
function ready(fn){if(document.readyState!=="loading"){fn()}else{document.addEventListener("DOMContentLoaded",fn)}}
ready(function(){
 var box=document.getElementById("ao-cc");if(!box)return;
 box.setAttribute("data-show","1");
 function answer(v){try{localStorage.setItem(KEY,v)}catch(e){}
  box.removeAttribute("data-show");if(v==="yes"){start()}}
 document.getElementById("ao-cc-yes").addEventListener("click",function(){answer("yes")});
 document.getElementById("ao-cc-no").addEventListener("click",function(){answer("no")});
});
})();</script>`;

const HEAD_BLOCK = [START, CSS, END].join('\n');
const BODY_BLOCK = [START, BANNER, GATE, END].join('\n');

/* ---------- вставка ---------- */

let done = 0;
let skipped = 0;
const noPlace = [];

for (const file of collect()) {
  const url =
    file === 'index.html' ? '/' : file.endsWith('/index.html') ? '/' + path.dirname(file) : '/' + file;

  const src = fs.readFileSync(file, 'utf8');
  let s = src.replace(reBlock, '').replace(reBlock, '');

  if (isBlocked(url || '/') || /<meta[^>]+name="robots"[^>]+content="[^"]*noindex/i.test(s)) {
    if (s !== src && !DRY) fs.writeFileSync(file, s);
    skipped++;
    continue;
  }

  if (s.includes('</head>')) {
    s = s.replace('</head>', HEAD_BLOCK + '\n</head>');
  } else if (/<body[\s>]/i.test(s)) {
    s = s.replace(/<body[\s>]/i, (m) => HEAD_BLOCK + '\n' + m);
  } else {
    noPlace.push(file);
    continue;
  }

  // Баннер и гейт — в конец страницы: разметка баннера должна уже
  // существовать к моменту, когда скрипт её ищет.
  if (s.includes('</body>')) {
    s = s.replace('</body>', BODY_BLOCK + '\n</body>');
  } else {
    s += '\n' + BODY_BLOCK + '\n';
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
  `${DRY ? '[проверка] ' : ''}счётчики и согласие: ${done} страниц, пропущено закрытых ${skipped}`
);
console.log(
  `  Метрика: ${cfg.metrica || '—'}${cfg.metrica && cfg.webvisor ? ' (с вебвизором)' : ''}` +
    `, GA4: ${cfg.ga4 || '— не используется'}`
);
console.log('  счётчик не запускается до нажатия «Принять»');
