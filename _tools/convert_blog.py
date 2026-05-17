#!/usr/bin/env python3
"""Convert Tilda blog articles (/blog/<slug>/index.html) to clean HTML.

Extracts ordered content from Tilda content blocks (by `field=` containers),
preserving inline <strong>/<em>/<a>/<br>/lists, drops chrome + related-feed,
emits a clean article on the site framework (same look as /1by1money).
"""
import os, re, html, sys, json

ROOT = sys.argv[1] if len(sys.argv) > 1 else '.'
APPLY = '--apply' in sys.argv
ONLY = None
for a in sys.argv[1:]:
    if a.startswith('--only='): ONLY = a.split('=',1)[1]

BLOGDIR = os.path.join(ROOT, 'blog')
SKIP_SLUGS = {'futer'}  # not a real article

ALLOWED_INLINE = re.compile(r'</?(strong|b|em|i|a|br|ul|ol|li|span)\b[^>]*>', re.I)

def clean_inline(frag):
    # keep only safe inline tags; normalize <br>
    frag = re.sub(r'<br\s*/?>', '\n', frag)
    # strip tags except allowed
    def strip(m):
        return m.group(0) if ALLOWED_INLINE.match(m.group(0)) else ''
    frag = re.sub(r'</?[a-zA-Z][^>]*>', strip, frag)
    # keep href on <a>, drop other attrs
    frag = re.sub(r'<a\b[^>]*?href="([^"]+)"[^>]*>', lambda m: f'<a href="{m.group(1)}" target="_blank" rel="noopener">', frag)
    frag = re.sub(r'<span\b[^>]*>', '', frag); frag = frag.replace('</span>', '')
    for a,b in [('&nbsp;',' '),('&amp;','&'),('&laquo;','«'),('&raquo;','»'),
                ('&mdash;','—'),('&ndash;','–'),('&quot;','"'),('&#39;',"'"),
                ('&gt;','>'),('&lt;','<'),('&rsquo;','’'),('&hellip;','…')]:
        frag = frag.replace(a,b)
    frag = re.sub(r'[ \t]+',' ', frag)
    return frag.strip()

def field(bd, name):
    m = re.search(r'field="'+name+r'"[^>]*>(.*?)</div>', bd, re.S)
    return m.group(1).strip() if m else ''

def paras(text):
    """split a text block into <p>/<ul> html, on blank lines."""
    out=[]
    for chunk in re.split(r'\n\s*\n+', text):
        chunk=chunk.strip()
        if not chunk: continue
        lines=[l.strip() for l in chunk.split('\n') if l.strip()]
        # bullet-ish?
        if len(lines)>1 and all(re.match(r'^([-—•*]|\d+[.)])\s', l) for l in lines):
            items=''.join('<li>'+re.sub(r'^([-—•*]|\d+[.)])\s','',l)+'</li>' for l in lines)
            out.append(f'<ul>{items}</ul>')
        else:
            out.append('<p>'+'<br>'.join(lines)+'</p>')
    return '\n'.join(out)

TEMPLATE = '''<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Type" content="text/html; charset=utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>{title} — Алишер Отабаев</title>
<meta name="description" content="{desc}">
<meta name="author" content="Алишер Отабаев">
<link rel="canonical" href="https://alisherotabaev.com/blog/{slug}">
<meta property="og:type" content="article">
<meta property="og:url" content="https://alisherotabaev.com/blog/{slug}">
<meta property="og:title" content="{title}">
<meta property="og:description" content="{desc}">
<meta property="og:image" content="{ogimg}">
<meta property="og:locale" content="ru_RU">
<meta property="og:site_name" content="Алишер Отабаев">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="{title}">
<meta name="twitter:description" content="{desc}">
<meta name="twitter:image" content="{ogimg}">
<link rel="shortcut icon" href="/images/tild6665-3732-4262-a336-653034633261__favicon_2.ico" type="image/x-icon">
<link rel="preconnect" href="https://fonts.gstatic.com">
<link href="https://fonts.googleapis.com/css2?family=Open+Sans:wght@300..800&family=Roboto:wght@300;400;500;700&subset=latin,cyrillic" rel="stylesheet">
<script type="application/ld+json">
{{"@context":"https://schema.org","@type":"Article","headline":{title_json},"description":{desc_json},"image":"{ogimg}","author":{{"@type":"Person","name":"Алишер Отабаев","url":"https://alisherotabaev.com/about"}},"publisher":{{"@type":"Person","name":"Алишер Отабаев","url":"https://alisherotabaev.com/"}},"mainEntityOfPage":"https://alisherotabaev.com/blog/{slug}","inLanguage":"ru-RU"}}
</script>
<style>
  :root{{--accent:#b89168;--accent-dark:#8a6d4d;--text:#111;--muted:#555;--bg:#fff;--line:#eee;--soft:#faf6f0}}
  *{{box-sizing:border-box}}
  body{{margin:0;font-family:'Open Sans','Roboto',-apple-system,Helvetica,Arial,sans-serif;color:var(--text);background:var(--bg);line-height:1.7;font-size:18px;-webkit-font-smoothing:antialiased}}
  img{{max-width:100%;height:auto;display:block}}
  a{{color:var(--accent)}}a:hover{{color:var(--accent-dark)}}
  h1,h2,h3{{margin:0;line-height:1.2}}
  .site-header{{border-bottom:1px solid var(--line)}}
  .site-header__inner{{max-width:1100px;margin:0 auto;padding:18px 24px;display:flex;align-items:center;justify-content:space-between;gap:24px}}
  .site-header__logo{{font-weight:700;color:var(--text);text-decoration:none;letter-spacing:.5px;font-size:16px}}
  .site-header__nav{{display:flex;gap:24px;font-size:15px;font-weight:500}}
  .site-header__nav a{{color:var(--text);text-decoration:none}}
  .site-header__nav a:hover{{color:var(--accent)}}
  @media (max-width:700px){{.site-header__nav{{display:none}}}}
  .hero{{position:relative;background:#111 center/cover no-repeat;color:#fff;padding:120px 24px;text-align:center}}
  .hero::after{{content:"";position:absolute;inset:0;background:rgba(0,0,0,.5)}}
  .hero__in{{position:relative;z-index:1;max-width:820px;margin:0 auto}}
  .hero__eyebrow{{font-size:13px;letter-spacing:3px;text-transform:uppercase;color:#e8d8c4;margin:0 0 16px}}
  .hero h1{{font-size:44px;font-weight:800;margin:0 0 16px}}
  .hero p{{font-size:20px;color:#eee;margin:0}}
  @media (max-width:700px){{.hero{{padding:80px 20px}}.hero h1{{font-size:30px}}}}
  .article{{max-width:760px;margin:0 auto;padding:56px 24px 80px}}
  .article h2{{font-size:30px;font-weight:800;margin:48px 0 8px}}
  .article .sub{{color:var(--muted);font-size:18px;margin:0 0 24px}}
  .article h3{{font-size:22px;font-weight:700;margin:36px 0 12px;color:var(--accent-dark)}}
  .article p{{margin:0 0 20px}}
  .article ul,.article ol{{margin:0 0 20px;padding-left:24px}}
  .article li{{margin:8px 0}}
  .article .hl{{background:var(--soft);border-left:4px solid var(--accent);border-radius:8px;padding:18px 24px;margin:0 0 24px;font-size:18px}}
  .article .dlg{{background:var(--soft);border-radius:12px;padding:20px 24px;margin:0 0 24px}}
  .article .dlg p{{margin:0 0 10px}}.article .dlg b{{color:var(--accent-dark)}}
  .article figure{{margin:32px 0}}.article figure img{{width:100%;border-radius:12px}}
  .cta{{background:#111;color:#fff;border-radius:14px;padding:36px;text-align:center;margin:40px 0}}
  .cta h3{{color:#fff;font-size:24px;margin:0 0 10px}}
  .cta p{{color:#ccc;margin:0 0 22px;font-size:16px}}
  .cta a{{display:inline-block;background:var(--accent);color:#000;font-weight:700;padding:14px 32px;border-radius:8px;text-decoration:none}}
  .backlink{{display:inline-block;margin-bottom:8px;color:var(--accent);text-decoration:none;font-size:15px}}
  footer{{background:#0f0f0f;color:#bbb;padding:40px 24px 24px;font-size:14px}}
  footer .c{{max-width:1100px;margin:0 auto}}
  .ft{{display:flex;justify-content:space-between;flex-wrap:wrap;gap:28px;margin-bottom:24px}}
  .fb{{font-weight:700;color:#fff;font-size:16px;margin-bottom:6px}}
  .fl{{display:flex;flex-direction:column;gap:8px}}
  .fl a{{color:#bbb;text-decoration:underline;text-decoration-color:#444;text-underline-offset:3px}}
  .fl a:hover{{color:#fff}}
  .flegal{{border-top:1px solid #333;padding-top:18px;color:#777;font-size:13px;line-height:1.6}}
</style>
</head>
<body>
<header class="site-header">
  <div class="site-header__inner">
    <a class="site-header__logo" href="/">Алишер Отабаев</a>
    <nav class="site-header__nav">
      <a href="/about">Обо мне</a>
      <a href="/blog">Блог</a>
      <a href="/1by1money">Гайд 100к</a>
      <a href="https://t.me/alisher_otabaev" target="_blank" rel="noopener">Telegram</a>
    </nav>
  </div>
</header>
<section class="hero"{herostyle}>
  <div class="hero__in">
    <p class="hero__eyebrow"><a href="/blog" style="color:#e8d8c4;text-decoration:none">← Блог</a></p>
    <h1>{h1}</h1>
    {herosub}
  </div>
</section>
<article class="article">
{body}
  <div class="cta">
    <h3>Хотите системный онлайн-бизнес?</h3>
    <p>Разберём ваш проект и точки роста лично.</p>
    <a href="https://t.me/alisher_otabaev" target="_blank" rel="noopener">Написать в Telegram</a>
  </div>
</article>
<footer>
  <div class="c">
    <div class="ft">
      <div><div class="fb">Алишер Отабаев</div><div>Продюсер · CEO ClientHunter.Pro</div></div>
      <nav class="fl"><a href="/">Главная</a><a href="/about">Обо мне</a><a href="/blog">Блог</a><a href="/1by1money">Гайд 100к</a></nav>
      <nav class="fl"><a href="/privacypolicy">Политика конфиденциальности</a><a href="/agreement">Согласие с рассылкой</a><a href="/otkazototvetstvennosti">Отказ от ответственности</a><a href="/oferta">Публичная оферта</a></nav>
    </div>
    <div class="flegal">ИП Отабаев Алишер Камолович · ОГРН 324508100462661<br>© 2017–2026 Алишер Отабаев. Все права защищены.</div>
  </div>
</footer>
</body>
</html>
'''

def convert(path, slug):
    h = open(path, encoding='utf-8').read()
    title = re.search(r'<title>(.*?)</title>', h, re.S)
    title = re.sub(r'\s+',' ', title.group(1)).strip() if title else slug
    title = re.sub(r'\s*[—|].*$','',title).strip() or slug
    dm = re.search(r'<meta name="description" content="([^"]*)"', h)
    desc = (dm.group(1).strip() if dm else '')
    om = re.search(r'og:image"\s+content="([^"]+)"', h)
    ogimg = om.group(1) if om else ''
    if ogimg and not ogimg.startswith('http'):
        ogimg = '/'+ogimg.lstrip('/')
        ogimg = 'https://alisherotabaev.com'+ogimg if ogimg.startswith('/images') else ogimg

    h2 = re.sub(r'<script[^>]*>.*?</script>','',h,flags=re.S)
    h2 = re.sub(r'<style[^>]*>.*?</style>','',h2,flags=re.S)
    h2 = re.sub(r'<!--.*?-->','',h2,flags=re.S)
    recs = re.findall(r'(<div\s+id="rec\d+"[^>]*data-record-type="[^"]+"[^>]*>)(.*?)(?=<div\s+id="rec\d+"|\Z)', h2, re.S)

    h1=''; herosub=''; herostyle=''; body=[]
    for hd,bd in recs:
        rt = re.search(r'data-record-type="([^"]+)"', hd).group(1)
        if rt == '46':  # cover hero
            h1 = clean_inline(field(bd,'title')) or title
            sub = clean_inline(field(bd,'descr'))
            if sub: herosub = f'<p>{sub}</p>'
            cm = re.search(r'data-content-cover-bg="([^"]+)"', bd)
            if cm:
                u='/'+cm.group(1).lstrip('/')
                herostyle = f' style="background-image:url(\'{u}\')"'
        elif rt == '475':  # section cover → h2
            t=clean_inline(field(bd,'title')); s=clean_inline(field(bd,'descr'))
            if t: body.append(f'<h2>{t}</h2>')
            if s: body.append(f'<p class="sub">{s}</p>')
        elif rt in ('106','182','58','126'):  # text blocks
            txt=clean_inline(field(bd,'text'))
            if txt: body.append(paras(txt))
        elif rt == '23':  # highlight
            txt=clean_inline(field(bd,'text'))
            if txt: body.append(f'<div class="hl">{paras(txt)}</div>')
        elif rt == '673':  # callout heading
            txt=clean_inline(field(bd,'text'))
            if txt: body.append(f'<h3>{txt}</h3>')
        elif rt == '665':  # dialogue
            blocks=re.findall(r'field="li_(title2?|text2?)__\d+"[^>]*>(.*?)</div>', bd, re.S)
            if blocks:
                rows=''.join(f'<p><b>{clean_inline(v)}</b></p>' if k.startswith('title') else f'<p>{clean_inline(v)}</p>' for k,v in blocks)
                body.append(f'<div class="dlg">{rows}</div>')
        # everything else (chrome, T336 cta, T404 related, spacers) skipped

    if not h1: h1 = title
    bodyhtml = '\n'.join(b for b in body if b.strip())
    if not bodyhtml.strip():
        return None  # nothing extracted — skip, don't damage

    out = TEMPLATE.format(
        title=html.escape(title,quote=True), desc=html.escape(desc,quote=True),
        slug=slug, ogimg=ogimg or 'https://alisherotabaev.com/images/tild6437-3263-4864-b531-316334656537__dsc02203.png',
        title_json=json.dumps(title,ensure_ascii=False), desc_json=json.dumps(desc,ensure_ascii=False),
        h1=h1, herosub=herosub, herostyle=herostyle, body=bodyhtml)
    return out

slugs = sorted(d for d in os.listdir(BLOGDIR)
               if os.path.isdir(os.path.join(BLOGDIR,d)) and d not in SKIP_SLUGS
               and os.path.isfile(os.path.join(BLOGDIR,d,'index.html')))
done=skip=0
for sl in slugs:
    if ONLY and sl != ONLY: continue
    p=os.path.join(BLOGDIR,sl,'index.html')
    src=open(p,encoding='utf-8').read()
    if 'data-record-type' not in src:  # already clean
        skip+=1; continue
    res=convert(p,sl)
    if res is None:
        print('  !! no content extracted:', sl); skip+=1; continue
    done+=1
    if APPLY: open(p,'w',encoding='utf-8').write(res)
print(f"[{'APPLIED' if APPLY else 'DRY'}] converted={done} skipped={skip} total_slugs={len(slugs)}")
