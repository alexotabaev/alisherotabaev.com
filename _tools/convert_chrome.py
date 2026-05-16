#!/usr/bin/env python3
"""Convert Tilda pages WITHOUT Zero Block (t396) to our own framework.

- strips all tilda-*.css / tilda-*.js local links
- strips tildacdn.com CDN refs (fallback script, preconnect/dns-prefetch)
- injects /css/site-core.css and /js/site-core.js
- leaves HTML structure intact (our CSS targets the existing classes)

Pages containing data-record-type="396" are SKIPPED (manual rebuild).
"""
import os, re, sys

ROOT = sys.argv[1] if len(sys.argv) > 1 else '.'
DRY  = '--apply' not in sys.argv
ONLY = None
for a in sys.argv[1:]:
    if a.startswith('--only='):
        ONLY = a.split('=', 1)[1]

SKIP_DIRS = {'1by1money'}                 # already clean
CLEAN_BASENAMES = {'index.html'}          # our hand-built pages live as dir/index.html
HANDBUILT = {'index.html', 'about', 'blog'}  # don't touch our rebuilt ones at these paths

inject = (
  '<link rel="stylesheet" href="/css/site-core.css">'
  '<script src="/js/site-core.js" defer></script>'
)

re_tilda_css = re.compile(r'<link\b[^>]*href="[^"]*tilda-[^"]*\.css[^"]*"[^>]*>', re.I)
re_tilda_css_ns = re.compile(r'<noscript>\s*<link\b[^>]*tilda-[^>]*</noscript>', re.I)
re_tilda_js  = re.compile(r'<script\b[^>]*src="[^"]*tilda-[^"]*\.js[^"]*"[^>]*>\s*</script>', re.I)
re_cdn_js    = re.compile(r'<script\b[^>]*src="https?://[a-z0-9.-]*tildacdn\.com/[^"]*"[^>]*>\s*</script>', re.I)
re_cdn_link  = re.compile(r'<link\b[^>]*href="https?://[a-z0-9.-]*tildacdn\.com[^"]*"[^>]*>', re.I)
# inline <script> blocks that load/refer Tilda assets (e.g. tilda-stat loader)
re_inline_tilda = re.compile(
    r'<script\b(?![^>]*\bsrc=)[^>]*>(?:(?!</script>).)*?'
    r'(?:tilda-stat|tildacdn\.com|tilda-fallback)(?:(?!</script>).)*?</script>',
    re.I | re.S)
re_already   = re.compile(r'/css/site-core\.css')

scanned = converted = skipped_396 = skipped_done = skipped_content = 0
for dp, dn, fns in os.walk(ROOT):
    if '/.git' in dp or dp.endswith('/.git'):
        dn[:] = []; continue
    rel = os.path.relpath(dp, ROOT)
    top = rel.split(os.sep)[0]
    if top in SKIP_DIRS: continue
    for fn in fns:
        if not fn.endswith('.html'): continue
        path = os.path.join(dp, fn)
        if ONLY and os.path.abspath(path) != os.path.abspath(ONLY):
            continue
        scanned += 1
        try:
            src = open(path, encoding='utf-8').read()
        except UnicodeDecodeError:
            continue
        # skip our own hand-built clean pages
        if re_already.search(src):
            skipped_done += 1; continue
        # skip Zero Block pages (manual rebuild)
        if 'data-record-type="396"' in src:
            skipped_396 += 1; continue
        # only convert stub / near-chrome pages (<=2 content block types).
        # content-rich pages need manual rebuild — would render unstyled.
        CHROME = {'360','602','450','456','794','795','345','258','270','229'}
        types = set(re.findall(r'data-record-type="(\d+)"', src))
        if len(types - CHROME) > 2:
            skipped_content += 1
            continue

        new = src
        new = re_tilda_css_ns.sub('', new)
        new = re_tilda_css.sub('', new)
        new = re_tilda_js.sub('', new)
        new = re_cdn_js.sub('', new)
        new = re_cdn_link.sub('', new)
        new = re_inline_tilda.sub('', new)
        # inject our framework right before </head>
        if '/css/site-core.css' not in new:
            new = re.sub(r'</head>', inject + '</head>', new, count=1, flags=re.I)

        if new != src:
            converted += 1
            if not DRY:
                open(path, 'w', encoding='utf-8').write(new)

mode = 'DRY-RUN' if DRY else 'APPLIED'
print(f"[{mode}] scanned={scanned} converted={converted} "
      f"skipped(396)={skipped_396} skipped(content)={skipped_content} "
      f"skipped(done)={skipped_done}")
