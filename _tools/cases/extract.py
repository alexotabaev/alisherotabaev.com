#!/usr/bin/env python3
"""
Разбор страниц-кейсов (экспорт Tilda) в структурированный _tools/cases/data.json.

    python3 _tools/cases/extract.py

Страницы кейсов — «нулевые блоки» Tilda: текст лежит в <div class='tn-atom'>,
блоки идут в предсказуемом порядке и продублированы для десктопа и мобильных.
После дедупликации порядок такой:

    0  общая врезка про программу (одинаковая на всех страницах)
    1  заголовок с результатом
    2  ИМЯ
    3  профессия + @instagram
    4  цитата
    …  точка А / точка В

Скрипт запускается разово: дальше data.json правится руками, потому что
восстановить из вёрстки Tilda всё до последней запятой нельзя, а врать в цифрах
кейсов нельзя тем более. Всё, что не удалось разобрать, помечается в
поле "todo" — такие кейсы не попадут на страницу, пока их не дочистить.
"""

import collections
import glob
import html
import json
import os
import re

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
os.chdir(ROOT)

# Врезка про программу, одинаковая на всех страницах кейсов
BOILERPLATE = 'Программа для экспертов'
# Логотипы и служебная графика — в фото человека не годятся
SKIP_IMG = ('__3-2.png', 'generic20satellite')
# Заголовок выглядит как имя, но страница не кейс
NOT_A_CASE = {'clients', 'tehnar-demo'}
# Портрет не бывает легче 30 КБ. Всё, что мельче, — иконки и служебная графика:
# на части страниц собственного фото героя просто нет, и это честнее показать
# инициалами, чем подставить чужую картинку.
MIN_PHOTO = 30_000


def atoms(src):
    """Текстовые блоки Tilda в порядке документа, без повторов."""
    out, seen = [], set()
    for m in re.findall(r"<div class='tn-atom'[^>]*>(.*?)</div>", src, re.S):
        t = re.sub(r'\s+', ' ', re.sub(r'<[^>]+>', '', html.unescape(m))).strip()
        if t and t not in seen:
            seen.add(t)
            out.append(t)
    return out


def images(src):
    """Все картинки страницы: и в атрибутах, и в CSS-фоне Tilda."""
    urls = re.findall(r'(?:data-original|src)="(/images/[^"]+\.(?:jpg|jpeg|png|webp))"', src, re.I)
    urls += re.findall(r"background-image:\s*url\('(/images/[^']+\.(?:jpg|jpeg|png|webp))'\)", src, re.I)
    out = []
    for u in urls:
        if any(x in u for x in SKIP_IMG):
            continue
        f = u.lstrip('/')
        if os.path.exists(f):
            out.append((os.path.getsize(f), u))
    return out


def pick_photo(candidates, shared):
    """Портрет героя — самая тяжёлая картинка, встречающаяся только здесь.

    Просто «самая тяжёлая» не годится: на страницах лежит общий декоративный
    фон в 2 МБ, и он перевешивает настоящее фото. Картинка, попавшаяся ещё
    на чьём-то кейсе, — тоже оформление, а не портрет. Если своего фото нет,
    возвращаем None: карточка отрисуется с инициалами.
    """
    own = [(size, u) for size, u in candidates if shared[u] == 1 and size >= MIN_PHOTO]
    return max(own)[1] if own else None


def money(text):
    """Самая крупная сумма в тексте — задаёт порядок карточек на странице.

    Валюта после числа стоит не всегда («доход 500 000»), поэтому она
    необязательна, но тогда требуем минимум 5 цифр — иначе в сумму
    попадут годы и номера модулей.
    """
    best = 0
    for m in re.finditer(r'(\d[\d\s\u00a0\u2009]{4,})\s*(?:руб|р\.|₽)?', text, re.I):
        digits = re.sub(r'[^\d]', '', m.group(1))
        if len(digits) >= 5:
            best = max(best, int(digits))
    for m in re.finditer(r'(\d+(?:[.,]\d+)?)\s*млн', text, re.I):
        best = max(best, int(float(m.group(1).replace(',', '.')) * 1_000_000))
    return best


def parse(slug, shared):
    src = open(f'{slug}/index.html', encoding='utf-8', errors='replace').read()
    a = atoms(src)
    title = re.search(r'<title>(.*?)</title>', src, re.S)
    name = html.unescape(title.group(1)).strip() if title else slug

    # Всё, что до врезки про программу, — навигация; отсчитываем от неё
    start = next((i for i, x in enumerate(a) if BOILERPLATE in x), -1)
    rest = a[start + 1:] if start >= 0 else a

    todo = []
    headline = rest[0] if rest else ''
    if not headline or len(headline) < 15:
        todo.append('не найден заголовок с результатом')

    role = ''
    for x in rest[1:5]:
        if x[0] in '"«“\'':                      # цитата, а не профессия
            continue
        if x.upper() != x or '@' in x:          # не «ИМЯ КАПСОМ» — значит профессия
            role = x
            break
    inst = re.search(r'@([\w.]+)', role)

    quote = next((x for x in rest[1:8] if x.startswith(('"', '«', '“'))), '')

    a_point = b_point = ''
    for i, x in enumerate(rest):
        if x.lower().startswith('точка а'):
            a_point = next((y for y in rest[i + 1:i + 5] if len(y) > 40), '')
        if x.lower().startswith('точка в'):
            b_point = next((y for y in rest[i + 1:i + 5] if len(y) > 40), '')

    # Второй шаблон: заголовка с результатом нет, имя слитно первым блоком,
    # дальше профессия и список достижений после маркера «В результате».
    results = []
    if not (a_point and b_point):
        flat = name.replace(' ', '')
        if rest and rest[0].replace(' ', '') == flat:
            headline = ''
            role = rest[1] if len(rest) > 1 else role
            for i, x in enumerate(rest):
                if re.match(r'(в результате|итог|что получилось)', x, re.I):
                    results = [y for y in rest[i + 1:i + 8] if 25 < len(y) < 220]
                    break
            if not results:
                results = [y for y in rest[2:10] if 25 < len(y) < 220]
            todo[:] = [t for t in todo if 'заголовок' not in t]

    if not (a_point and b_point) and not results:
        todo.append('нет ни точки А/В, ни списка результатов')

    img = pick_photo(images(src), shared)
    if not img:
        todo.append('не найдено фото')

    return {
        'slug': slug,
        'name': name,
        'headline': headline,
        'role': re.sub(r'\s*@[\w.]+\s*', '', role).strip(' ,·'),
        'instagram': inst.group(1) if inst else '',
        'quote': quote.strip('"«»“” '),
        'from': a_point,
        'to': b_point,
        'results': results,
        'template': 'points' if (a_point and b_point) else 'story',
        'photo': img,
        'scale': money(headline + ' ' + b_point),
        'todo': todo,
    }


# Кейсы — страницы, у которых <title> состоит из имени и фамилии кириллицей
CASES, DUPES = [], {}
for p in sorted(glob.glob('*/index.html')):
    slug = os.path.dirname(p)
    src = open(p, encoding='utf-8', errors='replace').read()
    t = re.search(r'<title>(.*?)</title>', src, re.S)
    if not t:
        continue
    t = html.unescape(t.group(1)).strip()
    if slug in NOT_A_CASE or not re.fullmatch(r'[А-ЯЁ][а-яё]+ [А-ЯЁ][а-яё]+', t):
        continue
    words = len(re.sub(r'<[^>]+>', ' ', re.sub(r'<(script|style).*?</\1>', '', src, flags=re.S)).split())
    DUPES.setdefault(t, []).append((words, slug))

# Сколько кейсовых страниц ссылается на каждую картинку: то, что встречается
# у многих, — общий фон, а не портрет
SHARED = collections.Counter()
for t, variants in DUPES.items():
    main = max(variants)[1]
    src = open(f'{main}/index.html', encoding='utf-8', errors='replace').read()
    for _, u in images(src):
        SHARED[u] += 1

for t, variants in DUPES.items():
    variants.sort(reverse=True)          # самая полная версия — основная
    main = variants[0][1]
    c = parse(main, SHARED)
    c['duplicates'] = [s for _, s in variants[1:]]
    CASES.append(c)

CASES.sort(key=lambda c: -c['scale'])

os.makedirs('_tools/cases', exist_ok=True)
# section с настройками раздела правится руками — сохраняем его при перезапуске
prev = {}
if os.path.exists('_tools/cases/data.json'):
    prev = json.load(open('_tools/cases/data.json', encoding='utf-8'))

json.dump(
    {'section': prev.get('section', {}), 'cases': CASES},
    open('_tools/cases/data.json', 'w', encoding='utf-8'),
    ensure_ascii=False, indent=2,
)

ok = [c for c in CASES if not c['todo']]
print(f'кейсов найдено: {len(CASES)}, разобрано полностью: {len(ok)}')
print(f'страниц-дублей: {sum(len(c["duplicates"]) for c in CASES)}\n')
for c in CASES:
    mark = '  ' if not c['todo'] else '! '
    scale = f'{c["scale"]:,}'.replace(',', ' ') if c['scale'] else '—'
    print(f'{mark}{c["slug"]:24s} {scale:>12s}  {c["headline"][:58]}')
    if c['todo']:
        print(f'{"":26s} {"":12s}  → {"; ".join(c["todo"])}')
