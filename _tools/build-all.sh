#!/usr/bin/env bash
# Полная пересборка сгенерированной части сайта. Порядок важен:
# карта сайта строится последней, по фактическому состоянию файлов.
set -euo pipefail
cd "$(dirname "$0")/.."
node _tools/opensource/build.mjs
node _tools/cases/thumbs.mjs
node _tools/cases/build.mjs
node _tools/cases/meta.mjs
node _tools/hygiene/links.mjs
node _tools/hygiene/notfound.mjs
node _tools/hygiene/fonts.mjs
node _tools/hygiene/alt.mjs
node _tools/hygiene/apply.mjs
node _tools/hygiene/pages.mjs
node _tools/hygiene/sitemap.mjs
python3 _tools/opensource/check.py
