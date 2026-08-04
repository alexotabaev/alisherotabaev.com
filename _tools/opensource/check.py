#!/usr/bin/env python3
"""
Проверки сгенерированных разделов сайта: /opensource/ и /cases/.

    python3 _tools/opensource/check.py

Запускается вручную и в CI (.github/workflows/opensource.yml) после пересборки.
Ненулевой код возврата = что-то не так; список проблем печатается в stdout.
"""

import glob
import html.parser
import json
import os
import re
import sys
import xml.etree.ElementTree as ET

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
os.chdir(ROOT)

DATA = json.load(open('_tools/opensource/data.json', encoding='utf-8'))
SECTION = DATA['section']
SITE = json.load(open('_tools/shared/site.json', encoding='utf-8'))
CASES = json.load(open('_tools/cases/data.json', encoding='utf-8'))
PAGES = (['opensource/index.html'] + sorted(glob.glob('opensource/*/index.html'))
         + ['cases/index.html'])

problems = []


def fail(page, msg):
    problems.append(f'{page}: {msg}')


# --- 1. Все ожидаемые страницы на месте -------------------------------------

expected = {'opensource/index.html', 'cases/index.html'} | {
    f"opensource/{c['slug']}/index.html" for c in DATA['categories']
}
missing = expected - set(PAGES)
extra = set(PAGES) - expected
for m in sorted(missing):
    fail(m, 'страница не сгенерирована')
for e in sorted(extra):
    fail(e, 'лишняя страница — категории с таким slug нет в data.json')

# --- 2. Каталог должен быть в HTML, а не собираться скриптом -----------------

index = open('opensource/index.html', encoding='utf-8').read()
cards = index.count('class="card"')
if cards != len(DATA['repos']):
    fail(
        'opensource/index.html',
        f'карточек в HTML {cards}, а в data.json проектов {len(DATA["repos"])} — '
        'каталог должен рендериться на этапе сборки, а не в браузере',
    )

hub = open('cases/index.html', encoding='utf-8').read()
if hub.count('class="kase"') != len(CASES['cases']):
    fail('cases/index.html',
         f'карточек {hub.count(chr(34) + "kase" + chr(34))}, а кейсов в data.json {len(CASES["cases"])}')
for c in CASES['cases']:
    if f'href="/{c["slug"]}/"' not in hub:
        fail('cases/index.html', f'нет ссылки на кейс /{c["slug"]}/')
    if not os.path.exists(f'{c["slug"]}/index.html'):
        fail('cases/index.html', f'кейс ссылается на несуществующую страницу /{c["slug"]}/')

for page in PAGES:
    s = open(page, encoding='utf-8').read()
    if re.search(r'\.innerHTML\s*=', s):
        fail(page, 'скрипт собирает разметку через innerHTML — краулеры без JS её не увидят')

# --- 3. JSON-LD ---------------------------------------------------------------

for page in PAGES:
    s = open(page, encoding='utf-8').read()
    blocks = re.findall(r'<script type="application/ld\+json">\n(.*?)\n</script>', s, re.S)
    if not blocks:
        fail(page, 'нет разметки JSON-LD')
        continue
    for raw in blocks:
        try:
            d = json.loads(raw)
        except json.JSONDecodeError as e:
            fail(page, f'JSON-LD не парсится: {e}')
            continue
        graph = d.get('@graph', [d])
        types = {x.get('@type') for x in graph}
        for required in ('CollectionPage', 'BreadcrumbList', 'ItemList'):
            if required not in types:
                fail(page, f'в JSON-LD нет {required}')
        for item in graph:
            if item.get('@type') != 'ItemList':
                continue
            n = len(item.get('itemListElement', []))
            declared = item.get('numberOfItems')
            if declared is not None and declared != n:
                fail(page, f'ItemList: numberOfItems={declared}, а элементов {n}')

# --- 4. Баланс тегов ----------------------------------------------------------

VOID = {
    'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta',
    'param', 'source', 'track', 'wbr', 'path', 'circle', 'rect', 'use', 'symbol', 'stop',
}


class TagBalance(html.parser.HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.stack = []
        self.errors = []

    def handle_starttag(self, tag, attrs):
        if tag not in VOID:
            self.stack.append((tag, self.getpos()))

    def handle_endtag(self, tag):
        if tag in VOID:
            return
        if not self.stack:
            self.errors.append(f'лишний </{tag}> в {self.getpos()}')
            return
        if self.stack[-1][0] != tag:
            self.errors.append(
                f'</{tag}> в {self.getpos()}, ожидался </{self.stack[-1][0]}> '
                f'(открыт в {self.stack[-1][1]})'
            )
            for i in range(len(self.stack) - 1, -1, -1):
                if self.stack[i][0] == tag:
                    del self.stack[i:]
                    return
        else:
            self.stack.pop()


for page in PAGES:
    p = TagBalance()
    p.feed(open(page, encoding='utf-8').read())
    for e in p.errors[:3]:
        fail(page, f'структура HTML: {e}')
    if p.stack:
        fail(page, f'незакрытые теги: {[t for t, _ in p.stack][:5]}')

# --- 5. Мета и внешние зависимости -------------------------------------------

for page in PAGES:
    s = open(page, encoding='utf-8').read()
    url = '/' + os.path.dirname(page) + '/'
    canonical = re.search(r'rel="canonical" href="([^"]+)"', s)
    if not canonical:
        fail(page, 'нет canonical')
    elif canonical.group(1) != SITE['origin'] + url:
        fail(page, f'canonical {canonical.group(1)}, ожидался {SITE["origin"] + url}')

    for tag in ('og:image', 'og:title', 'og:description', 'twitter:card'):
        if tag not in s:
            fail(page, f'нет {tag}')

    if re.search(r'<link[^>]+fonts\.(googleapis|gstatic)\.com', s):
        fail(page, 'страница подключает Google Fonts — шрифты должны браться из /files/fonts/')

# --- 6. Внутренние ссылки резолвятся -----------------------------------------

for page in PAGES:
    s = open(page, encoding='utf-8').read()
    for href in sorted(set(re.findall(r'href="(/[^"#]*)"', s))):
        rel = href.lstrip('/')
        candidates = [rel, os.path.join(rel, 'index.html'), rel + '.html', rel.rstrip('/') + '.html']
        if not any(c and os.path.exists(c) for c in candidates):
            fail(page, f'битая внутренняя ссылка: {href}')

# --- 7. Страницы попали в sitemap.xml ----------------------------------------

ns = '{http://www.sitemaps.org/schemas/sitemap/0.9}'
locs = {u.find(ns + 'loc').text for u in ET.parse('sitemap.xml').getroot().findall(ns + 'url')}
for page in PAGES:
    url = SITE['origin'] + '/' + os.path.dirname(page) + '/'
    if url not in locs:
        fail('sitemap.xml', f'нет {url}')

# --- 8. Шрифты на месте -------------------------------------------------------

for font in re.findall(r"url\('(/files/fonts/[^']+)'\)", index):
    if not os.path.exists(font.lstrip('/')):
        fail('opensource/index.html', f'файл шрифта отсутствует: {font}')

# --- 9. Страницы кейсов доупакованы ------------------------------------------

for c in CASES['cases']:
    f = f'{c["slug"]}/index.html'
    s = open(f, encoding='utf-8', errors='replace').read()

    t = re.search(r'<title>(.*?)</title>', s, re.S)
    if not t or t.group(1).strip() == c['name']:
        fail(f, '<title> не доупакован — остался только именем')
    if len(t.group(1)) > 70 if t else False:
        fail(f, f'<title> длиннее 70 символов ({len(t.group(1))})')

    d = re.search(r'<meta name="description" content="([^"]*)"', s)
    if not d or len(d.group(1)) < 50:
        fail(f, 'нет осмысленного meta description')

    can = re.search(r'rel="canonical" href="([^"]+)"', s)
    want = SITE['origin'] + '/' + c['slug'] + '/'
    if not can:
        fail(f, 'нет canonical')
    elif can.group(1) != want:
        fail(f, f'canonical {can.group(1)}, ожидался {want}')
    if s.count('rel="canonical"') > 1:
        fail(f, 'несколько canonical')

    if c['headline'] and '<h1 ' not in s:
        fail(f, 'заголовок с результатом не размечен как h1')

    for dup in c.get('duplicates', []):
        df = f'{dup}/index.html'
        if not os.path.exists(df):
            continue
        ds = open(df, encoding='utf-8', errors='replace').read()
        dc = re.search(r'rel="canonical" href="([^"]+)"', ds)
        if not dc or dc.group(1) != want:
            fail(df, f'дубль должен указывать canonical на {want}')

# --- 10. Гигиена индексации применена ----------------------------------------

HYGIENE = json.load(open('_tools/hygiene/noindex.json', encoding='utf-8'))
for item in HYGIENE['pages']:
    f = f'{item["slug"]}/index.html'
    if not os.path.exists(f):
        fail('_tools/hygiene/noindex.json', f'страницы /{item["slug"]}/ нет — уберите её из списка')
        continue
    s = open(f, encoding='utf-8', errors='replace').read()
    if not re.search(r'<meta[^>]+name="robots"[^>]+content="[^"]*noindex', s, re.I):
        fail(f, 'числится в noindex.json, но мета-тега на странице нет')

# Битые canonical с двойным слэшем не должны появиться снова
for f in glob.glob('page*.html') + glob.glob('*/index.html'):
    s = open(f, encoding='utf-8', errors='replace').read()
    if SITE['origin'] + '//' in s:
        fail(f, 'адрес с двойным слэшем (alisherotabaev.com//) — canonical ведёт не на эту страницу')

# --- 11. Базовый минимум на всех индексируемых страницах ---------------------

_dis = [l[9:].strip().rstrip('*') for l in open('robots.txt', encoding='utf-8').read().split('\n')
        if l.startswith('Disallow:') and l[9:].strip()]


def _blocked(u):
    return any(u == d.rstrip('/') or u.startswith(d.rstrip('/') + '/') for d in _dis)


indexable = 0
for f in sorted(glob.glob('*/index.html') + glob.glob('*/*/index.html')
                + glob.glob('page*.html') + ['index.html']):
    url = '/' + (os.path.dirname(f) if f.endswith('index.html') and f != 'index.html'
                 else (f if f != 'index.html' else ''))
    if _blocked(url or '/'):
        continue
    s = open(f, encoding='utf-8', errors='replace').read()
    if re.search(r'<meta[^>]+name="robots"[^>]+content="[^"]*noindex', s, re.I):
        continue
    indexable += 1
    if not re.search(r'<html[^>]*\blang=', s):
        fail(f, 'у <html> нет lang')
    if 'name="viewport"' not in s:
        fail(f, 'нет viewport — страница не адаптивная')
    if 'og:title' not in s:
        fail(f, 'нет Open Graph')
    if 'application/ld+json' not in s:
        fail(f, 'нет разметки Schema.org')

# --- 12. Битые внутренние ссылки ---------------------------------------------

LINKS = json.load(open('_tools/hygiene/links.json', encoding='utf-8'))
known_bad = set(LINKS['unresolved'])


def _resolves(href):
    p = href.split('#')[0].split('?')[0].lstrip('/')
    if not p:
        return True
    return any(os.path.exists(c) for c in
               (p, os.path.join(p, 'index.html'), p + '.html', p.rstrip('/') + '.html'))


for f in sorted(glob.glob('*/index.html') + glob.glob('*/*/index.html')
                + glob.glob('page*.html') + ['index.html', '404.html']):
    s = open(f, encoding='utf-8', errors='replace').read()
    for href in sorted(set(re.findall(r'href="(/[^"]*)"', s))):
        if _resolves(href):
            continue
        if href.split('#')[0].split('?')[0] in known_bad:
            continue          # известны, перечислены в links.json → unresolved
        fail(f, f'битая внутренняя ссылка: {href}')

# Замены из links.json не должны отменяться
for src in LINKS['redirects']:
    for f in sorted(glob.glob('*/index.html') + glob.glob('page*.html')):
        s = open(f, encoding='utf-8', errors='replace').read()
        if re.search(r'href="' + re.escape(src) + r'["#?]', s):
            fail(f, f'вернулась битая ссылка {src} — должна быть заменена по links.json')

# --- 13. У каждой картинки есть alt ------------------------------------------

noalt = 0
for f in (sorted(glob.glob('*/index.html') + glob.glob('*/*/index.html')
                 + glob.glob('page*.html')) + ['index.html', '404.html']):
    s = open(f, encoding='utf-8', errors='replace').read()
    bad = [t for t in re.findall(r'<img\b[^>]*>', s) if not re.search(r'\balt\s*=', t)]
    if bad:
        noalt += len(bad)
        fail(f, f'{len(bad)} картинок без alt — добавьте правило в _tools/hygiene/alt.json')

# --- итог ---------------------------------------------------------------------

if problems:
    print(f'Проблем: {len(problems)}\n')
    for p in problems:
        print('  ✗', p)
    sys.exit(1)

print(
    f'OK — {len(PAGES)} страниц: {len(DATA["repos"])} проектов в '
    f'{len(DATA["categories"])} категориях, {len(DATA["faq"])} FAQ, '
    f'{len(CASES["cases"])} кейсов (+{sum(len(c.get("duplicates", [])) for c in CASES["cases"])} дублей); '
    f'{indexable} индексируемых страниц с базовой разметкой.'
)
