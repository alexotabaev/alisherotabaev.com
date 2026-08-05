#!/usr/bin/env bash
# Полная пересборка сгенерированной части сайта. Порядок важен:
# карта сайта строится последней, по фактическому состоянию файлов.
set -euo pipefail
cd "$(dirname "$0")/.."
node _tools/opensource/build.mjs
node _tools/news/build.mjs
node _tools/guides/build.mjs
node _tools/templates/build.mjs
node _tools/cases/thumbs.mjs
node _tools/cases/build.mjs
node _tools/cases/meta.mjs
node _tools/hygiene/caseforms.mjs
node _tools/hygiene/deadjs.mjs
node _tools/hygiene/links.mjs
node _tools/hygiene/deadlinks.mjs
node _tools/hygiene/notfound.mjs
node _tools/hygiene/fonts.mjs
node _tools/hygiene/alt.mjs
node _tools/hygiene/imgsize.mjs
node _tools/hygiene/blogdates.mjs
node _tools/hygiene/boilerplate.mjs
node _tools/hygiene/headings.mjs
node _tools/hygiene/apply.mjs
node _tools/hygiene/pages.mjs
node _tools/hygiene/forms.mjs
node _tools/hygiene/analytics.mjs
node _tools/hygiene/nav.mjs
node _tools/hygiene/bloglist.mjs
node _tools/hygiene/gone.mjs
node _tools/hygiene/sitemap.mjs
# CI сверяет расхождение до проверок, поэтому умеет их пропустить
if [ "${1:-}" != "--no-check" ]; then
  python3 _tools/opensource/check.py
fi
