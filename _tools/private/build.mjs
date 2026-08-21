#!/usr/bin/env node
/**
 * Страница под паролем на статическом хостинге.
 *
 *   PRIVATE_PW='пароль' node _tools/private/build.mjs <исходник> <адрес>
 *   PRIVATE_PW='пароль' node _tools/private/build.mjs _private/put-klienta.html /put-klienta/
 *
 * Настоящий пароль в примерах не пишем: файл лежит в открытом репозитории.
 *
 * Зачем не проверка пароля скриптом. GitHub Pages отдаёт файлы как есть,
 * сервера, который спросил бы пароль, нет и быть не может. Обычная проверка
 * вида «если ввели правильно — покажи блок» защитой не является совсем:
 * содержимое лежит в том же файле открытым текстом, и достаточно открыть
 * исходный код страницы. Это не мера защиты, а её изображение.
 *
 * Поэтому содержимое шифруется по-настоящему. Ключ выводится из пароля
 * (PBKDF2-SHA256), содержимое шифруется AES-GCM. В файл попадает только
 * шифротекст: без пароля в нём нечего читать. Расшифровка происходит в
 * браузере штатным Web Crypto, своей криптографии здесь не написано ни
 * строчки — самодельная была бы хуже любой стандартной.
 *
 * Неправильный пароль распознаётся сам: AES-GCM проверяет целостность и
 * на чужом ключе просто отказывается расшифровывать. Отдельной проверки
 * «правильно ли ввели» нет — а значит, нет и подсказки для перебора.
 *
 * Чего эта защита НЕ даёт. Пароль к странице подбирается перебором на
 * своём компьютере, без обращения к сайту: файл-то уже скачан. Ста тысяч
 * итераций PBKDF2 хватает, чтобы одна попытка стоила заметного времени,
 * но словарное слово из этого перебора достанут. Годится закрыть страницу
 * от случайного посетителя и от поисковиков; для тайны не годится.
 *
 * Что не попадает в репозиторий (он открытый):
 *
 *   пароль    — берётся из переменной окружения PRIVATE_PW;
 *   исходник  — лежит в _private/, эта папка в .gitignore.
 *
 * Публикуется только зашифрованный результат. Поэтому шаг не включён в
 * общую сборку: пересобрать страницу без пароля нельзя, а молча выпустить
 * вместо неё пустую — худшее, что тут можно сделать.
 */

import fs from 'node:fs';
import path from 'node:path';
import { webcrypto as crypto } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
process.chdir(ROOT);

/** Столько раз прогоняется пароль через PBKDF2. Столько же — в браузере. */
const ITER = 100000;

const [srcArg, urlArg] = process.argv.slice(2);
const PW = process.env.PRIVATE_PW;

if (!srcArg || !urlArg) {
  throw new Error(
    'нужны два аргумента: путь к исходнику и адрес страницы.\n' +
      "  PRIVATE_PW='пароль' node _tools/private/build.mjs _private/страница.html /адрес/"
  );
}
if (!PW) {
  throw new Error(
    'пароль не задан. Он передаётся через PRIVATE_PW и намеренно не хранится ' +
      'в репозитории — репозиторий открытый'
  );
}
if (!fs.existsSync(srcArg)) {
  throw new Error(`исходника нет: ${srcArg}`);
}

const url = '/' + urlArg.replace(/^\/|\/$/g, '') + '/';
const dir = path.join(ROOT, url.slice(1, -1));

/* ---------- шифрование ---------- */

const enc = new TextEncoder();
const plain = fs.readFileSync(srcArg);
const salt = crypto.getRandomValues(new Uint8Array(16));
const iv = crypto.getRandomValues(new Uint8Array(12));

const derive = (usage) =>
  crypto.subtle
    .importKey('raw', enc.encode(PW), 'PBKDF2', false, ['deriveKey'])
    .then((base) =>
      crypto.subtle.deriveKey(
        { name: 'PBKDF2', salt, iterations: ITER, hash: 'SHA-256' },
        base,
        { name: 'AES-GCM', length: 256 },
        false,
        [usage]
      )
    );

const cipher = new Uint8Array(
  await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await derive('encrypt'), plain)
);

const b64 = (u8) => Buffer.from(u8).toString('base64');

// Проверка на месте: расшифровываем обратно тем же паролём. Выпустить
// страницу, которая не открывается, было бы незаметно до первой попытки.
{
  const back = Buffer.from(
    await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, await derive('decrypt'), cipher)
  );
  if (Buffer.compare(back, plain) !== 0) {
    throw new Error('расшифровка вернула не то, что зашифровали — страница не выпущена');
  }
}

/* ---------- страница-замок ---------- */

const page = `<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow, noarchive">
<title>Страница под паролем — Алишер Отабаев</title>
<link rel="shortcut icon" href="/images/tild6665-3732-4262-a336-653034633261__favicon_2.ico">
<style>
@font-face{font-family:'Manrope';font-style:normal;font-weight:200 800;font-display:swap;
 src:url('/files/fonts/manrope-cyrillic.woff2') format('woff2');
 unicode-range:U+0301,U+0400-045F,U+0490-0491,U+04B0-04B1,U+2116}
@font-face{font-family:'Manrope';font-style:normal;font-weight:200 800;font-display:swap;
 src:url('/files/fonts/manrope-latin.woff2') format('woff2');
 unicode-range:U+0000-00FF,U+0131,U+0152-0153,U+2000-206F,U+20AC,U+2122,U+FEFF,U+FFFD}
*{box-sizing:border-box}
body{margin:0;min-height:100vh;display:grid;place-items:center;padding:24px;
 background:#000d29;color:#e9eff9;font:16px/1.6 'Manrope',system-ui,sans-serif;
 background-image:radial-gradient(1000px 500px at 70% -10%,rgba(90,210,244,.09),transparent 60%),
                  radial-gradient(800px 460px at 12% 10%,rgba(232,195,126,.055),transparent 60%)}
.box{width:100%;max-width:26rem;border:1px solid rgba(140,175,225,.18);border-radius:18px;
 background:linear-gradient(178deg,#081a3a,#04122f 62%);padding:32px 30px 30px}
h1{margin:0 0 10px;font-size:21px;font-weight:700;letter-spacing:-.01em;line-height:1.25}
p{margin:0 0 22px;color:#93a7c6;font-size:14.5px}
label{display:block;font-size:12px;letter-spacing:.14em;text-transform:uppercase;
 color:#6c83a7;margin-bottom:8px}
input{width:100%;padding:13px 15px;border-radius:11px;background:rgba(0,0,0,.28);
 border:1px solid rgba(140,175,225,.28);color:#e9eff9;font:16px 'Manrope',sans-serif}
input:focus{outline:none;border-color:#e8c37e}
button{width:100%;margin-top:12px;padding:13px 15px;border:0;border-radius:11px;cursor:pointer;
 background:#e8c37e;color:#000d29;font:700 15px 'Manrope',sans-serif}
button:hover{background:#f0d199}
button[disabled]{opacity:.55;cursor:default}
.msg{margin:14px 0 0;min-height:1.4em;font-size:13.5px;color:#ff8a5c}
.msg[data-wait]{color:#93a7c6}
.foot{margin:22px 0 0;font-size:12.5px;color:#48597a}
.foot a{color:#93a7c6}
</style>
</head>
<body>

<main class="box">
  <h1>Страница под паролем</h1>
  <p>Ссылку и пароль выдаёт Алишер. Содержимое зашифровано — без пароля открыть его нечем.</p>

  <form id="f" autocomplete="off">
    <label for="pw">Пароль</label>
    <input id="pw" type="password" autocomplete="current-password" autofocus
           aria-describedby="msg" enterkeyhint="go">
    <button id="go" type="submit">Открыть</button>
    <p class="msg" id="msg" role="status" aria-live="polite"></p>
  </form>

  <noscript>
    <p class="msg">Страница расшифровывается в браузере, поэтому без JavaScript не откроется.</p>
  </noscript>

  <p class="foot"><a href="/">← На главную alisherotabaev.com</a></p>
</main>

<script>
(function () {
  var D = {
    salt: "${b64(salt)}",
    iv: "${b64(iv)}",
    data: "${b64(cipher)}",
    iter: ${ITER}
  };

  var f = document.getElementById('f');
  var pw = document.getElementById('pw');
  var go = document.getElementById('go');
  var msg = document.getElementById('msg');

  function bytes(b64) {
    var s = atob(b64), u = new Uint8Array(s.length);
    for (var i = 0; i < s.length; i++) u[i] = s.charCodeAt(i);
    return u;
  }

  function say(text, waiting) {
    msg.textContent = text;
    if (waiting) msg.setAttribute('data-wait', '1'); else msg.removeAttribute('data-wait');
  }

  /**
   * Показывает расшифрованную страницу вместо текущей.
   *
   * Разобранная разметка вставляется в документ целиком, но теги script
   * при этом не выполняются — так устроен разбор. Поэтому каждый из них
   * пересоздаётся заново. async=false сохраняет порядок: внешний файл
   * успевает загрузиться раньше, чем до него доберётся встроенный код.
   */
  function show(html) {
    var doc = new DOMParser().parseFromString(html, 'text/html');
    var scripts = [].slice.call(doc.querySelectorAll('script'));

    document.replaceChild(document.adoptNode(doc.documentElement), document.documentElement);

    scripts.forEach(function (old) {
      var s = document.createElement('script');
      for (var i = 0; i < old.attributes.length; i++) {
        s.setAttribute(old.attributes[i].name, old.attributes[i].value);
      }
      s.async = false;
      s.textContent = old.textContent;
      old.parentNode.replaceChild(s, old);
    });
  }

  if (!window.crypto || !crypto.subtle) {
    say('Браузер не умеет расшифровывать страницу. Нужен любой современный.');
    go.disabled = true;
    return;
  }

  f.addEventListener('submit', function (e) {
    e.preventDefault();
    if (!pw.value) return;
    go.disabled = true;
    say('Расшифровываю…', true);

    var enc = new TextEncoder();
    crypto.subtle
      .importKey('raw', enc.encode(pw.value), 'PBKDF2', false, ['deriveKey'])
      .then(function (base) {
        return crypto.subtle.deriveKey(
          { name: 'PBKDF2', salt: bytes(D.salt), iterations: D.iter, hash: 'SHA-256' },
          base,
          { name: 'AES-GCM', length: 256 },
          false,
          ['decrypt']
        );
      })
      .then(function (key) {
        return crypto.subtle.decrypt({ name: 'AES-GCM', iv: bytes(D.iv) }, key, bytes(D.data));
      })
      .then(function (buf) {
        show(new TextDecoder().decode(buf));
      })
      .catch(function () {
        // AES-GCM не отличает неверный пароль от испорченных данных, и это
        // к лучшему: подсказки для перебора не остаётся.
        go.disabled = false;
        say('Пароль не подошёл.');
        pw.select();
      });
  });
})();
</script>

</body>
</html>
`;

fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, 'index.html'), page);

const kb = (n) => (n / 1024).toFixed(0);
console.log(
  `${url}index.html: зашифровано ${kb(plain.length)} КБ → страница ${kb(Buffer.byteLength(page))} КБ, ` +
    `PBKDF2 ${ITER.toLocaleString('ru')} итераций, обратная расшифровка сошлась`
);
console.log(`  адрес закрыть в robots.txt: Disallow: ${url}`);
