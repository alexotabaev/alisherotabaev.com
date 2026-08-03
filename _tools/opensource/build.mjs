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
 * Побочный эффект: обновляет sitemap.xml (блок между маркерами opensource).
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const data = JSON.parse(fs.readFileSync(path.join(HERE, 'data.json'), 'utf8'));
const { site, categories, repos, faq } = data;

const CAT = Object.fromEntries(categories.map((c) => [c.key, c]));
const abs = (p) => site.origin + p;
const catUrl = (c) => `${site.path}${c.slug}/`;

/* ---------- helpers ---------- */

const esc = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Текст без разметки — для meta, alt и JSON-LD. */
const plain = (s) =>
  String(s)
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim();

/** JSON-LD внутри <script> не должен содержать литеральный «<». */
const ld = (obj) => JSON.stringify(obj).replace(/</g, '\\u003C');

const ruDate = (iso) => {
  const M = ['января','февраля','марта','апреля','мая','июня','июля','августа','сентября','октября','ноября','декабря'];
  const [y, m, d] = iso.split('-').map(Number);
  return `${d} ${M[m - 1]} ${y}`;
};

/* ---------- общие куски разметки ---------- */

const CSS = `
  /* Шрифты со своего домена: без обращений к fonts.googleapis.com и fonts.gstatic.com.
     Файлы вариативные — одно начертание на сабсет покрывает весь диапазон 100–900.
     unicode-range оставляет браузеру только нужные сабсеты (русская страница — cyrillic + latin). */
  @font-face{
    font-family:'Roboto';
    font-style:normal;
    font-weight:100 900;
    font-stretch:100%;
    font-display:swap;
    src:url('/files/fonts/roboto-cyrillic.woff2') format('woff2');
    unicode-range:U+0301, U+0400-045F, U+0490-0491, U+04B0-04B1, U+2116;
  }
  @font-face{
    font-family:'Roboto';
    font-style:normal;
    font-weight:100 900;
    font-stretch:100%;
    font-display:swap;
    src:url('/files/fonts/roboto-latin.woff2') format('woff2');
    unicode-range:U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD;
  }
  @font-face{
    font-family:'Roboto';
    font-style:normal;
    font-weight:100 900;
    font-stretch:100%;
    font-display:swap;
    src:url('/files/fonts/roboto-latin-ext.woff2') format('woff2');
    unicode-range:U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF;
  }
  @font-face{
    font-family:'Roboto Condensed';
    font-style:normal;
    font-weight:100 900;
    font-display:swap;
    src:url('/files/fonts/roboto-condensed-cyrillic.woff2') format('woff2');
    unicode-range:U+0301, U+0400-045F, U+0490-0491, U+04B0-04B1, U+2116;
  }
  @font-face{
    font-family:'Roboto Condensed';
    font-style:normal;
    font-weight:100 900;
    font-display:swap;
    src:url('/files/fonts/roboto-condensed-latin.woff2') format('woff2');
    unicode-range:U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD;
  }
  @font-face{
    font-family:'Roboto Condensed';
    font-style:normal;
    font-weight:100 900;
    font-display:swap;
    src:url('/files/fonts/roboto-condensed-latin-ext.woff2') format('woff2');
    unicode-range:U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF;
  }

  :root{
    --ink:#000d29;
    --ink-soft:#26324a;
    --gold:#b89168;
    --gold-dk:#96723f;
    --paper:#ffffff;
    --cream:#faf8f4;
    --cream2:#f3ede3;
    --line:#e8e1d6;
    --muted:#5c6472;
    --shadow:0 10px 40px rgba(0,13,41,.08);
    --shadow-sm:0 4px 18px rgba(0,13,41,.06);
    --radius:16px;
  }
  *{box-sizing:border-box;}
  html{scroll-behavior:smooth;}
  body{
    margin:0;background:var(--paper);color:var(--ink);
    font-family:'Roboto',Arial,Helvetica,sans-serif;
    font-size:17px;line-height:1.6;-webkit-font-smoothing:antialiased;
  }
  h1,h2,h3,h4,.cond{font-family:'Roboto Condensed','Roboto',Arial,sans-serif;}
  a{color:inherit;text-decoration:none;}
  [hidden]{display:none !important;}
  ul.plain{list-style:none;margin:0;padding:0;}
  .wrap{max-width:1180px;margin:0 auto;padding:0 24px;}
  .sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;
    clip:rect(0,0,0,0);white-space:nowrap;border:0;}
  .skip{position:absolute;left:-9999px;top:0;z-index:100;background:var(--ink);color:#fff;
    padding:12px 20px;border-radius:0 0 10px 0;font-weight:600;}
  .skip:focus{left:0;}
  :focus-visible{outline:3px solid var(--gold);outline-offset:2px;border-radius:4px;}

  /* Header */
  header.site{position:sticky;top:0;z-index:50;background:rgba(255,255,255,.92);
    backdrop-filter:saturate(180%) blur(10px);border-bottom:1px solid var(--line);}
  .nav{display:flex;align-items:center;justify-content:space-between;height:72px;}
  .nav .logo img{height:40px;width:auto;display:block;}
  .nav .logo{display:flex;align-items:center;gap:12px;font-weight:700;letter-spacing:.02em;}
  .nav .navlinks{display:flex;align-items:center;gap:26px;}
  .nav .navlinks a{font-size:15px;color:var(--ink-soft);font-weight:500;}
  .nav .navlinks a:hover{color:var(--gold-dk);}
  .nav .navlinks a.cta-mini{background:var(--ink);color:#fff;padding:10px 18px;border-radius:999px;font-size:14px;font-weight:600;}
  .nav .navlinks a.cta-mini:hover{background:var(--gold-dk);color:#fff;}
  @media(max-width:860px){.nav .navlinks a.hideable{display:none;}}

  /* Hero */
  .hero{background:linear-gradient(180deg,var(--cream) 0%,#fff 100%);border-bottom:1px solid var(--line);
    padding:76px 0 64px;position:relative;overflow:hidden;}
  .hero:before{content:"";position:absolute;top:-160px;right:-140px;width:520px;height:520px;border-radius:50%;
    background:radial-gradient(circle at center,rgba(184,145,104,.16),rgba(184,145,104,0) 70%);}
  .hero > .wrap{position:relative;}
  .hero.sm{padding:44px 0 40px;}
  .eyebrow{margin:0;display:inline-flex;align-items:center;gap:9px;font-family:'Roboto Condensed';letter-spacing:.14em;
    text-transform:uppercase;font-size:13px;font-weight:700;color:var(--gold-dk);
    background:var(--cream2);border:1px solid var(--line);padding:8px 16px;border-radius:999px;}
  .hero h1{font-size:52px;line-height:1.06;font-weight:700;margin:22px 0 14px;max-width:20ch;letter-spacing:-.01em;}
  .hero.sm h1{font-size:42px;max-width:24ch;margin-top:14px;}
  .hero h1 .hl{color:var(--gold-dk);}
  .hero .slogan{font-family:'Roboto Condensed';font-size:19px;font-weight:700;color:var(--gold-dk);
    margin:16px 0 12px;letter-spacing:.01em;}
  .hero p.lead{font-size:20px;color:var(--ink-soft);max-width:62ch;margin:0 0 20px;}
  .updated{font-size:14px;color:var(--muted);margin:0 0 22px;}
  .updated b{color:var(--ink-soft);font-weight:600;}
  .hero .stats{display:flex;gap:30px;flex-wrap:wrap;margin:22px 0 28px;}
  .hero .stats .st{margin:0;display:flex;flex-direction:column;}
  .hero .stats .st b{font-family:'Roboto Condensed';font-size:34px;font-weight:700;line-height:1;color:var(--ink);}
  .hero .stats .st span{font-size:14px;color:var(--muted);margin-top:6px;}
  .btnrow{display:flex;gap:14px;flex-wrap:wrap;}
  .btn{display:inline-flex;align-items:center;gap:10px;padding:15px 26px;border-radius:999px;font-weight:600;font-size:16px;
    transition:transform .15s ease,box-shadow .15s ease,background .15s ease;}
  .btn:hover{transform:translateY(-2px);}
  .btn-primary{background:var(--ink);color:#fff;box-shadow:var(--shadow-sm);}
  .btn-primary:hover{background:var(--gold-dk);}
  .btn-tg{background:#29a9eb;color:#fff;}
  .btn-max{background:var(--gold);color:#fff;}
  .btn-ghost{background:#fff;color:var(--ink);border:1.5px solid var(--line);}
  .btn-ghost:hover{border-color:var(--gold);}
  .btn svg{width:18px;height:18px;display:block;}
  @media(max-width:720px){.hero{padding:52px 0 44px;}.hero h1{font-size:34px;}.hero.sm h1{font-size:30px;}.hero p.lead{font-size:18px;}}

  /* Breadcrumbs */
  .crumbs{padding:16px 0 0;font-size:14px;color:var(--muted);}
  .crumbs{margin:0;}
  .crumbs ol{list-style:none;display:flex;flex-wrap:wrap;gap:8px;margin:0;padding:0;}
  .crumbs li:not(:last-child):after{content:"›";margin-left:8px;color:var(--line);}
  .crumbs a:hover{color:var(--gold-dk);}

  /* Section */
  section{padding:70px 0;}
  .sec-head{max-width:760px;margin-bottom:40px;}
  .sec-head .kicker{margin:0;font-family:'Roboto Condensed';text-transform:uppercase;letter-spacing:.14em;
    font-size:13px;font-weight:700;color:var(--gold-dk);}
  .sec-head h2{font-size:40px;line-height:1.1;font-weight:700;margin:12px 0 12px;letter-spacing:-.01em;}
  .sec-head p{font-size:18px;color:var(--ink-soft);margin:0;}
  @media(max-width:720px){.sec-head h2{font-size:30px;}}

  /* Philosophy */
  .philo{background:var(--cream);border-top:1px solid var(--line);border-bottom:1px solid var(--line);}
  .cards3{display:grid;grid-template-columns:repeat(3,1fr);gap:22px;list-style:none;margin:0;padding:0;}
  .pcard{background:#fff;border:1px solid var(--line);border-radius:var(--radius);padding:30px 28px;box-shadow:var(--shadow-sm);}
  .pcard .num{margin:0;font-family:'Roboto Condensed';font-size:15px;font-weight:700;color:var(--gold-dk);letter-spacing:.1em;}
  .pcard h3{font-size:23px;margin:12px 0 12px;font-weight:700;}
  .pcard p{margin:0;color:var(--ink-soft);font-size:16px;}
  .pcard .big{display:block;margin-top:16px;font-family:'Roboto Condensed';font-weight:700;color:var(--ink);
    font-size:17px;border-top:1px dashed var(--line);padding-top:14px;}
  .pcard .big em{color:var(--gold-dk);font-style:normal;}
  @media(max-width:900px){.cards3{grid-template-columns:1fr;}}

  /* Catalog controls */
  .controls{position:sticky;top:71px;z-index:20;background:rgba(255,255,255,.96);backdrop-filter:blur(8px);
    padding:12px 0 10px;border-bottom:1px solid var(--line);margin-bottom:22px;}
  .search{display:flex;align-items:center;gap:10px;background:#fff;border:1.5px solid var(--line);border-radius:999px;
    padding:9px 16px;max-width:400px;box-shadow:var(--shadow-sm);}
  .search input{border:0;outline:0;font-size:15px;width:100%;font-family:inherit;color:var(--ink);background:transparent;}
  .search svg{width:17px;height:17px;color:var(--muted);flex-shrink:0;}
  .chipswrap{position:relative;margin-top:12px;}
  /* Тень справа появляется только когда ряд действительно прокручивается */
  .chipswrap::after{content:"";position:absolute;top:0;right:0;width:34px;height:100%;opacity:0;
    background:linear-gradient(90deg,rgba(255,255,255,0),#fff);pointer-events:none;transition:opacity .15s ease;}
  /* В покое видны все категории сразу — переносом по строкам.
     Когда панель залипает у верха, ряд схлопывается в одну прокручиваемую строку,
     чтобы не съедать пол-экрана. */
  .chips{display:flex;gap:7px;flex-wrap:wrap;padding:0;margin:0;list-style:none;
    -webkit-overflow-scrolling:touch;scrollbar-width:none;-ms-overflow-style:none;}
  .chips::-webkit-scrollbar{display:none;}
  .controls.is-stuck .chips{flex-wrap:nowrap;overflow-x:auto;padding:0 34px 3px 0;}
  .controls.is-stuck .chipswrap::after{opacity:1;}
  @media(max-width:720px){
    .chips{flex-wrap:nowrap;overflow-x:auto;padding:0 34px 3px 0;}
    .chipswrap::after{opacity:1;}
  }
  #ctrl-sentinel{height:0;}
  .chip{cursor:pointer;border:1px solid var(--line);background:#fff;color:var(--ink-soft);
    padding:6px 12px;border-radius:999px;font-size:13px;font-weight:500;white-space:nowrap;flex-shrink:0;
    font-family:inherit;line-height:1.6;transition:all .12s ease;}
  .chip:hover{border-color:var(--gold);}
  .chip[aria-pressed="true"]{background:var(--ink);color:#fff;border-color:var(--ink);}
  .chip .c{opacity:.55;font-size:11px;margin-left:3px;}
  .countline{font-size:13.5px;color:var(--muted);margin:4px 0 20px;}

  /* Category block */
  .catblock{margin-bottom:46px;scroll-margin-top:150px;}
  .catblock h3{font-size:27px;font-weight:700;margin:0 0 6px;display:flex;align-items:baseline;gap:10px;flex-wrap:wrap;}
  .catblock h3 .cnt{font-size:14px;font-weight:500;color:var(--muted);font-family:'Roboto';}
  .catblock .cdesc{margin:0 0 8px;font-size:15.5px;color:var(--ink-soft);max-width:78ch;}
  .catblock .catlink{display:inline-block;margin:0 0 18px;font-size:14px;font-weight:600;color:var(--gold-dk);
    border-bottom:1px solid rgba(150,114,63,.35);padding-bottom:1px;}
  .catblock .catlink:hover{border-bottom-color:var(--gold-dk);}

  /* Grid */
  .grid{display:grid;grid-template-columns:repeat(3,1fr);gap:20px;list-style:none;margin:0;padding:0;}
  @media(max-width:980px){.grid{grid-template-columns:repeat(2,1fr);}}
  @media(max-width:640px){.grid{grid-template-columns:1fr;}}
  .card{display:flex;flex-direction:column;height:100%;background:#fff;border:1px solid var(--line);border-radius:14px;
    padding:22px 22px 20px;transition:transform .15s ease,box-shadow .15s ease,border-color .15s ease;position:relative;}
  .card:hover{transform:translateY(-3px);box-shadow:var(--shadow);border-color:var(--gold);}
  .card .tag{align-self:flex-start;font-size:11.5px;font-weight:600;letter-spacing:.03em;text-transform:uppercase;
    color:var(--gold-dk);background:var(--cream2);border-radius:999px;padding:5px 11px;margin-bottom:14px;}
  .card h4{font-size:22px;font-weight:700;margin:0 0 4px;letter-spacing:.01em;}
  .card .repo{font-family:'Roboto Condensed';font-size:13.5px;color:var(--muted);margin:0 0 12px;word-break:break-all;}
  .card p.d{margin:0 0 18px;font-size:15px;color:var(--ink-soft);flex-grow:1;line-height:1.55;}
  .card p.d b{color:var(--ink);font-weight:600;}
  .card .gh{display:inline-flex;align-items:center;gap:8px;font-weight:600;font-size:14px;color:var(--ink);
    border:1.5px solid var(--line);border-radius:999px;padding:9px 16px;align-self:flex-start;transition:all .12s ease;}
  .card .gh:hover{background:var(--ink);color:#fff;border-color:var(--ink);}
  .card .gh svg{width:16px;height:16px;}
  .empty{text-align:center;color:var(--muted);padding:50px 0;font-size:17px;}
  .note{margin-top:26px;font-size:13.5px;color:var(--muted);border-left:3px solid var(--gold);padding:8px 0 8px 16px;background:var(--cream);}

  /* FAQ */
  .faq{background:var(--cream);border-top:1px solid var(--line);border-bottom:1px solid var(--line);}
  .faq .qa{max-width:860px;}
  .faq .qa .item{padding:22px 0;border-bottom:1px solid var(--line);}
  .faq .qa .item:last-child{border-bottom:0;}
  .faq .qa h3{font-size:21px;font-weight:700;margin:0 0 8px;}
  .faq .qa p{margin:0;color:var(--ink-soft);font-size:16px;}

  /* Category index / other categories */
  .catnav{display:flex;flex-wrap:wrap;gap:9px;list-style:none;margin:0;padding:0;}
  .catnav a{display:inline-flex;align-items:baseline;gap:6px;border:1px solid var(--line);background:#fff;
    border-radius:999px;padding:8px 15px;font-size:14px;font-weight:500;color:var(--ink-soft);transition:all .12s ease;}
  .catnav a:hover{border-color:var(--gold);color:var(--gold-dk);}
  .catnav a .c{font-size:11.5px;opacity:.6;}

  /* CTA */
  .cta{background:var(--ink);color:#fff;text-align:center;}
  .cta h2{font-size:42px;font-weight:700;margin:0 0 14px;color:#fff;}
  .cta p{font-size:19px;color:#c7cfdd;max-width:58ch;margin:0 auto 30px;}
  .cta .btnrow{justify-content:center;}
  @media(max-width:720px){.cta h2{font-size:30px;}}

  /* Footer */
  footer.site{background:#fff;border-top:1px solid var(--line);padding:40px 0 30px;}
  .foot{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:18px;}
  .foot .fine{margin:0;font-size:13px;color:var(--muted);}
  .foot .soc{display:flex;gap:14px;list-style:none;margin:0;padding:0;}
  .foot .soc a{width:34px;height:34px;display:flex;align-items:center;justify-content:center;color:var(--ink);
    border:1px solid var(--line);border-radius:50%;transition:all .12s ease;}
  .foot .soc a:hover{background:var(--ink);color:#fff;border-color:var(--ink);}
  .foot .soc svg{width:17px;height:17px;}
  .legal{margin-top:22px;padding-top:20px;border-top:1px solid var(--line);display:flex;flex-wrap:wrap;gap:18px;list-style:none;}
  .legal a{font-size:12px;color:var(--muted);text-transform:uppercase;letter-spacing:.04em;}
  .legal a:hover{color:var(--gold-dk);}
`.trim();

const SPRITE = `<svg class="sprite" width="0" height="0" aria-hidden="true" focusable="false" style="position:absolute">
  <symbol id="i-tg" viewBox="0 0 24 24"><path fill="currentColor" d="M9.8 16.6 9.6 13l6.9-6.2c.3-.27-.07-.4-.46-.17L7.5 12.1 3.8 11c-.8-.24-.8-.8.18-1.18l14.4-5.56c.66-.3 1.3.16 1.05 1.18l-2.45 11.55c-.17.8-.65 1-1.32.62l-3.63-2.68-1.75 1.7c-.2.2-.37.36-.72.36Z"/></symbol>
  <symbol id="i-gh" viewBox="0 0 24 24"><path fill="currentColor" d="M12 2C6.48 2 2 6.58 2 12.25c0 4.53 2.87 8.37 6.84 9.73.5.1.68-.22.68-.49 0-.24-.01-.87-.01-1.71-2.78.62-3.37-1.37-3.37-1.37-.45-1.18-1.11-1.5-1.11-1.5-.91-.64.07-.62.07-.62 1 .07 1.53 1.06 1.53 1.06.89 1.56 2.34 1.11 2.91.85.09-.66.35-1.11.63-1.36-2.22-.26-4.56-1.14-4.56-5.06 0-1.12.39-2.03 1.03-2.75-.1-.26-.45-1.3.1-2.71 0 0 .84-.28 2.75 1.05a9.36 9.36 0 0 1 5 0c1.91-1.33 2.75-1.05 2.75-1.05.55 1.41.2 2.45.1 2.71.64.72 1.03 1.63 1.03 2.75 0 3.93-2.34 4.79-4.57 5.05.36.32.68.94.68 1.9 0 1.37-.01 2.48-.01 2.82 0 .27.18.6.69.49A10.02 10.02 0 0 0 22 12.25C22 6.58 17.52 2 12 2Z"/></symbol>
  <symbol id="i-ig" viewBox="0 0 24 24"><g fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none"/></g></symbol>
  <symbol id="i-vk" viewBox="0 0 24 24"><path fill="currentColor" d="M13 18c-5.5 0-8.9-3.9-9-10h2.8c.1 4.5 2.2 6.4 3.7 6.8V8h2.7v3.9c1.5-.2 3-1.8 3.6-3.9h2.6c-.5 2.3-2 3.9-3 4.6 1 .5 2.8 2 3.5 4.4h-2.9c-.5-1.6-1.9-2.9-3.8-3.1V18H13Z"/></symbol>
  <symbol id="i-yt" viewBox="0 0 24 24"><path fill="currentColor" d="M22 12s0-3.2-.4-4.7a2.5 2.5 0 0 0-1.8-1.8C18.3 5 12 5 12 5s-6.3 0-7.8.5A2.5 2.5 0 0 0 2.4 7.3C2 8.8 2 12 2 12s0 3.2.4 4.7a2.5 2.5 0 0 0 1.8 1.8C5.7 19 12 19 12 19s6.3 0 7.8-.5a2.5 2.5 0 0 0 1.8-1.8C22 15.2 22 12 22 12Zm-12 3V9l5 3-5 3Z"/></symbol>
  <symbol id="i-search" viewBox="0 0 24 24"><g fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></g></symbol>
</svg>`;

const icon = (id) => `<svg aria-hidden="true" focusable="false"><use href="#i-${id}"/></svg>`;
const TG_ICON = icon('tg');
const GH_ICON = icon('gh');

const header = () => `<a class="skip" href="#main">Перейти к содержимому</a>

<header class="site">
  <div class="wrap nav">
    <a class="logo" href="/"><img src="${site.logo}" width="120" height="40" alt="Алишер Отабаев — главная страница" /></a>
    <nav class="navlinks" aria-label="Основная навигация">
      <a class="hideable" href="/">Главная</a>
      <a class="hideable" href="/blog">Блог</a>
      <a class="hideable" href="${site.path}">Опенсорс</a>
      <a class="cta-mini" href="${site.telegram}" target="_blank" rel="noopener">Telegram-канал</a>
    </nav>
  </div>
</header>`;

const cta = () => `<section class="cta" aria-labelledby="cta-h">
  <div class="wrap">
    <h2 id="cta-h">Хочешь забирать такие находки первым?</h2>
    <p>Я постоянно в полях — нахожу инструменты, которые ускоряют работу в разы, и сразу делюсь ими в каналах. Подписывайся: пока другие пишут с нуля, ты будешь собирать из готового.</p>
    <div class="btnrow">
      <a class="btn btn-tg" href="${site.telegram}" target="_blank" rel="noopener">${TG_ICON} Telegram-канал</a>
      <a class="btn btn-max" href="${site.max}" target="_blank" rel="noopener">Канал в Max</a>
    </div>
  </div>
</section>`;

const footer = () => `<footer class="site">
  <div class="wrap">
    <div class="foot">
      <p class="fine">ИП Отабаев Алишер Камолович · ОГРН 324508100462661</p>
      <ul class="soc" aria-label="Социальные сети">
        <li><a href="${site.telegram}" target="_blank" rel="noopener" aria-label="Telegram">${TG_ICON}</a></li>
        <li><a href="https://www.instagram.com/alisherotabaev/" target="_blank" rel="noopener" aria-label="Instagram">${icon('ig')}</a></li>
        <li><a href="https://vk.com/alisherotabaev" target="_blank" rel="noopener" aria-label="ВКонтакте">${icon('vk')}</a></li>
        <li><a href="https://www.youtube.com/channel/UCnfrMWRFTpyeCM7XK6TMtRw/about" target="_blank" rel="noopener" aria-label="YouTube">${icon('yt')}</a></li>
      </ul>
    </div>
    <ul class="legal">
      <li><a href="/privacypolicy">Политика конфиденциальности</a></li>
      <li><a href="/agreement">Согласие с рассылкой</a></li>
      <li><a href="/otkazototvetstvennosti">Отказ от ответственности</a></li>
      <li><a href="/oferta">Публичная оферта</a></li>
    </ul>
  </div>
</footer>`;

/** Карточка проекта. Заголовок — ссылка, чтобы у внешнего URL был осмысленный анкор. */
const card = (r) => {
  const c = CAT[r.cat];
  const url = `https://github.com/${r.repo}`;
  return `        <li class="card" data-cat="${esc(r.cat)}" data-name="${esc(r.name)}" id="repo-${esc(slugifyRepo(r.repo))}">
          <span class="tag">${esc(c.label)}</span>
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

const personLd = {
  '@type': 'Person',
  '@id': abs('/#author'),
  name: site.author,
  url: site.authorUrl,
  sameAs: [site.telegram, 'https://www.instagram.com/alisherotabaev/', 'https://vk.com/alisherotabaev']
};

const breadcrumbLd = (items) => ({
  '@type': 'BreadcrumbList',
  itemListElement: items.map((it, i) => ({
    '@type': 'ListItem',
    position: i + 1,
    name: it.name,
    item: abs(it.url)
  }))
});

/** Общая «шапка» документа. */
const head = ({ title, description, url, jsonld, ogType = 'website' }) => `<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}" />
<meta name="robots" content="index,follow,max-snippet:-1,max-image-preview:large,max-video-preview:-1" />
<meta name="author" content="${esc(site.author)}" />
<link rel="canonical" href="${esc(abs(url))}" />
<meta property="og:type" content="${ogType}" />
<meta property="og:site_name" content="${esc(site.author)}" />
<meta property="og:locale" content="ru_RU" />
<meta property="og:title" content="${esc(title)}" />
<meta property="og:description" content="${esc(description)}" />
<meta property="og:url" content="${esc(abs(url))}" />
<meta property="og:image" content="${esc(abs(site.ogImage))}" />
<meta property="og:image:width" content="1200" />
<meta property="og:image:height" content="630" />
<meta property="og:image:alt" content="Каталог опенсорс-решений — Алишер Отабаев" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="${esc(title)}" />
<meta name="twitter:description" content="${esc(description)}" />
<meta name="twitter:image" content="${esc(abs(site.ogImage))}" />
<link rel="shortcut icon" href="${site.favicon}" type="image/x-icon" />
<link rel="preload" href="/files/fonts/roboto-condensed-cyrillic.woff2" as="font" type="font/woff2" crossorigin />
<link rel="preload" href="/files/fonts/roboto-cyrillic.woff2" as="font" type="font/woff2" crossorigin />
<style>
${CSS}
</style>
<script type="application/ld+json">
${ld(jsonld)}
</script>
</head>
<body>
${SPRITE}
`;

/* ---------- главная страница каталога ---------- */

function buildIndex() {
  const total = repos.length;
  const title = `${total} готовых опенсорс-решений для разработки и ИИ — подборка с GitHub`;
  const description = `Каталог из ${total} проверенных опенсорс-проектов по ${categories.length} категориям: ИИ-агенты, Claude Code, скрапинг, self-hosted замены сервисов, инфраструктура. С описанием, чем каждый ценен, и прямыми ссылками на GitHub.`;

  const catBlocks = categories
    .map((c) => {
      const list = repos.filter((r) => r.cat === c.key);
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
        '@id': abs(site.path) + '#page',
        url: abs(site.path),
        name: title,
        headline: `${total} готовых опенсорс-решений для быстрой разработки`,
        description,
        inLanguage: 'ru-RU',
        datePublished: site.published,
        dateModified: site.updated,
        author: { '@id': abs('/#author') },
        publisher: { '@id': abs('/#author') },
        primaryImageOfPage: abs(site.ogImage),
        about: categories.map((c) => ({ '@type': 'Thing', name: c.label })),
        mainEntity: { '@id': abs(site.path) + '#list' }
      },
      breadcrumbLd([
        { name: 'Главная', url: '/' },
        { name: 'Опенсорс', url: site.path }
      ]),
      {
        '@type': 'ItemList',
        '@id': abs(site.path) + '#list',
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
        '@id': abs(site.path) + '#faq',
        mainEntity: faq.map((f) => ({
          '@type': 'Question',
          name: f.q,
          acceptedAnswer: { '@type': 'Answer', text: f.a }
        }))
      }
    ]
  };

  return (
    head({ title, description, url: site.path, jsonld }) +
    `${header()}

<main id="main">

<article>

<div class="hero">
  <div class="wrap">
    <p class="eyebrow">Исследование · опенсорс, который экономит месяцы</p>
    <h1>${total} готовых опенсорс-решений, которые экономят месяцы разработки</h1>
    <p class="slogan">Бери готовое. Пиши с нуля <span class="hl">только то, чего ещё нет</span></p>
    <p class="updated">Обновлено <time datetime="${site.updated}">${ruDate(site.updated)}</time> · <b>${total}</b> ${plural(total)} · <b>${categories.length}</b> категорий · автор — <a href="${site.authorUrl}">${esc(site.author)}</a></p>
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

    <p class="note">Подборка собрана в ходе исследования и отражает находки на момент публикации (обновлено <time datetime="${site.updated}">${ruDate(site.updated)}</time>). Опенсорс-проекты быстро развиваются и иногда переезжают — если ссылка изменилась, найдите репозиторий по названию на GitHub. Проверяйте лицензию и актуальность перед использованием в продакшене.</p>
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
  const list = repos.filter((r) => r.cat === c.key);
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
        datePublished: site.published,
        dateModified: site.updated,
        author: { '@id': abs('/#author') },
        publisher: { '@id': abs('/#author') },
        isPartOf: { '@type': 'CollectionPage', '@id': abs(site.path) + '#page', url: abs(site.path) },
        mainEntity: { '@id': abs(url) + '#list' }
      },
      breadcrumbLd([
        { name: 'Главная', url: '/' },
        { name: 'Опенсорс', url: site.path },
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
    head({ title: `${c.title} — Алишер Отабаев`, description: c.description, url, jsonld }) +
    `${header()}

<main id="main">

<article>

<div class="hero sm">
  <div class="wrap">
    <nav class="crumbs" aria-label="Хлебные крошки">
      <ol>
        <li><a href="/">Главная</a></li>
        <li><a href="${site.path}">Опенсорс</a></li>
        <li aria-current="page">${esc(c.label)}</li>
      </ol>
    </nav>
    <h1>${esc(c.h1)}</h1>
    <p class="updated">Обновлено <time datetime="${site.updated}">${ruDate(site.updated)}</time> · <b>${list.length}</b>&nbsp;${plural(list.length)} · часть каталога <a href="${site.path}">из ${repos.length} опенсорс-решений</a></p>
    <p class="lead">${esc(c.intro)}</p>
    <div class="btnrow">
      <a class="btn btn-ghost" href="${site.path}">← Весь каталог</a>
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
      <p>Весь каталог — <a href="${site.path}">${repos.length} опенсорс-решений в ${categories.length} категориях</a>.</p>
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

/* ---------- sitemap ---------- */

function updateSitemap() {
  const file = path.join(ROOT, 'sitemap.xml');
  let xml = fs.readFileSync(file, 'utf8');
  const START = '\t<!-- opensource:start (генерируется _tools/opensource/build.mjs) -->';
  const END = '\t<!-- opensource:end -->';

  const entries = [{ loc: abs(site.path), priority: '0.9' }]
    .concat(categories.map((c) => ({ loc: abs(catUrl(c)), priority: '0.7' })))
    .map(
      (e) =>
        `\t<url>\n\t\t<loc>${e.loc}</loc>\n\t\t<lastmod>${site.updated}T00:00:00+00:00</lastmod>\n\t\t<changefreq>weekly</changefreq>\n\t\t<priority>${e.priority}</priority>\n\t</url>`
    )
    .join('\n');

  const block = `${START}\n${entries}\n${END}`;
  const re = new RegExp(
    START.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '[\\s\\S]*?' + END.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  );

  xml = re.test(xml) ? xml.replace(re, block) : xml.replace('</urlset>', block + '\n</urlset>');
  fs.writeFileSync(file, xml);
  return 1 + categories.length;
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
  lines.push(`Последнее обновление: ${site.updated}.`);
  lines.push('');
  lines.push('## Каталог опенсорс-решений');
  lines.push('');
  lines.push(
    `- [Каталог из ${repos.length} опенсорс-решений](${abs(site.path)}): проверенные проекты с GitHub по ${categories.length} категориям — что это, чем ценно и прямая ссылка на репозиторий. Обновлён ${site.updated}.`
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
  const dest = path.join(ROOT, site.ogImage.replace(/^\//, ''));

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
  console.log(`${site.ogImage}: 1200×630, ${kb} КБ${q.status === 0 ? ' (pngquant)' : ''}`);
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

const n = updateSitemap();
buildLlmsTxt();
if (process.argv.includes('--og')) buildOgImage();

console.log(out.join('\n'));
console.log(`\nsitemap.xml: ${n} URL`);
console.log('llms.txt: обновлён');
console.log(`\nВсего: ${repos.length} проектов, ${categories.length} категорий, ${faq.length} FAQ`);
