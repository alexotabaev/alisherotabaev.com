# alisherotabaev.com

Static export of [alisherotabaev.com](https://alisherotabaev.com) (Tilda → GitHub Pages).

- 334 published pages, restructured into human-readable URLs (`/about/`, `/blog/`, etc.)
- 43 pages without alias kept as `/pageXXXXXX.html`
- Assets in `css/`, `js/`, `images/`, `files/`

## `/opensource/` — генерируемый каталог

Страница каталога и 19 страниц категорий **не редактируются вручную** — они собираются из
`_tools/opensource/data.json`:

```bash
node _tools/opensource/build.mjs
```

Что делает сборка:

| Выход | Что это |
|---|---|
| `opensource/index.html` | каталог целиком: все карточки в статическом HTML |
| `opensource/<slug>/index.html` × 19 | страница каждой категории |
| `sitemap.xml` | блок между маркерами `opensource:start` / `opensource:end` перезаписывается |
| `llms.txt` | карта содержимого для языковых моделей |

Ключевое ограничение: **весь каталог должен оставаться в HTML**. Карточки рендерятся на
этапе сборки, а браузерный скрипт только прячет/показывает уже отрисованные элементы через
атрибут `hidden`. Краулеры поисковиков и ИИ-ассистентов (GPTBot, ClaudeBot, PerplexityBot)
не выполняют JavaScript — если вернуть клиентский рендеринг, страница снова станет для них
пустой.

### Проверка расхождений

`.github/workflows/opensource.yml` на каждый push в `main` пересобирает каталог и падает,
если результат отличается от закоммиченного. Это ловит два случая:

1. данные в `data.json` поменяли, а сборку не запустили;
2. HTML в `opensource/` поправили руками — такая правка будет молча затёрта
   при следующей сборке.

Плюс `_tools/opensource/check.py`: валидность JSON-LD, баланс тегов, canonical, og-теги,
битые внутренние ссылки, наличие страниц в `sitemap.xml`, отсутствие обращений к Google
Fonts. Гоняется локально одной командой:

```bash
node _tools/opensource/build.mjs && git diff --exit-code && python3 _tools/opensource/check.py
```

Проверка **не блокирует публикацию** — GitHub Pages собирает сайт параллельно. О падении
сообщает красный крестик у коммита и письмо от GitHub.

### Как вносить изменения

- **Добавить проект** — новый объект в массив `repos` (`name`, `repo`, `cat`, `desc`).
  `cat` должен совпадать с одним из `key` в `categories`.
- **Добавить категорию** — объект в `categories`: `key`, `slug` (латиницей, идёт в URL),
  `label`, `h1`, `title`, `description`, `intro`.
- **Обновить дату** — `site.updated` в `data.json`. Она попадает в видимый текст,
  в `dateModified` разметки Schema.org, в `sitemap.xml` и в `llms.txt`.
- После любой правки — пересобрать и закоммитить сгенерированные файлы.

### Шрифты

Страницы `/opensource/` **не обращаются к Google Fonts** — Roboto и Roboto Condensed лежат
в `files/fonts/`. Файлы вариативные, поэтому одно начертание на сабсет покрывает весь
диапазон 100–900:

| Файл | Размер |
|---|---|
| `roboto-cyrillic.woff2` | 19 КБ |
| `roboto-latin.woff2` | 37 КБ |
| `roboto-latin-ext.woff2` | 24 КБ |
| `roboto-condensed-cyrillic.woff2` | 24 КБ |
| `roboto-condensed-latin.woff2` | 45 КБ |
| `roboto-condensed-latin-ext.woff2` | 28 КБ |

`unicode-range` оставляет браузеру только нужное: русская страница качает 4 файла
(~125 КБ), `latin-ext` не загружается вовсе. Два кириллических сабсета идут через
`<link rel="preload">`, остальное — по мере необходимости, с `font-display: swap`.

К Open Sans это тоже относится: `open-sans-*.woff2` (94 КБ на три сабсета).
Весь сайт переведён на свои шрифты — обращений к `fonts.googleapis.com`
и `fonts.gstatic.com` не осталось нигде, за этим следит `check.py`.

### OG-картинка

Исходник — `_tools/opensource/og-image.html`, рендерится в `images/og-opensource.png`
(1200×630) отдельным флагом:

```bash
node _tools/opensource/build.mjs --og
```

Нужен установленный Google Chrome; если есть `pngquant`, результат дополнительно сжимается.
Обычная сборка без флага картинку не трогает.
