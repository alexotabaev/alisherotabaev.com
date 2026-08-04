#!/usr/bin/env node
/**
 * Разовое сжатие тяжёлых картинок.
 *
 *   node _tools/hygiene/compress-images.mjs --dry     показать, что будет
 *   node _tools/hygiene/compress-images.mjs           сжать
 *
 * НЕ входит в build-all.sh намеренно. pngquant работает с потерями: прогнать
 * им уже сжатую картинку — значит ухудшить её ещё раз. Поэтому обработанные
 * файлы записываются в compressed.json и повторно не трогаются, а сам скрипт
 * запускается руками, когда добавились новые тяжёлые изображения.
 *
 * Берём только картинки, на которые реально ссылается разметка: в /images
 * лежит около 4700 файлов, а используется примерно 3300.
 *
 * Результат сохраняется, только если он меньше исходника. Если сжатие не
 * помогло (уже оптимизированный файл, мелкая графика) — оригинал остаётся.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
process.chdir(ROOT);

const DRY = process.argv.includes('--dry');
const MIN_SIZE = 300 * 1024;          // мельче трогать смысла нет
const STORE = path.join(HERE, 'compressed.json');
const done = fs.existsSync(STORE) ? JSON.parse(fs.readFileSync(STORE, 'utf8')) : {};

const has = (c) => spawnSync('which', [c], { stdio: 'ignore' }).status === 0;
if (!has('pngquant') || !has('sips')) {
  console.error('нужны pngquant и sips');
  process.exit(1);
}

/* ---------- какие картинки реально используются ---------- */

function collectHtml(dir, depth, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith('.') || e.name.startsWith('_')) continue;
    const p = path.join(dir, e.name).replace(/^\.\//, '');
    if (e.isDirectory()) {
      if (['images', 'css', 'js'].includes(e.name)) continue;
      if (depth < 3) collectHtml(p, depth + 1, out);
    } else if (e.name.endsWith('.html')) out.push(p);
  }
  return out;
}

const used = new Set();
for (const f of collectHtml('.', 0)) {
  const s = fs.readFileSync(f, 'utf8');
  for (const m of s.matchAll(/\/images\/([^"'?\s)]+\.(?:png|jpe?g))/gi)) used.add('images/' + m[1]);
}

const targets = [...used]
  .filter((p) => fs.existsSync(p) && !done[p] && fs.statSync(p).size >= MIN_SIZE)
  .sort((a, b) => fs.statSync(b).size - fs.statSync(a).size);

console.log(`используется картинок: ${used.size}`);
console.log(`тяжелее ${MIN_SIZE / 1024} КБ и ещё не сжаты: ${targets.length}`);
console.log(`суммарно: ${(targets.reduce((s, p) => s + fs.statSync(p).size, 0) / 1048576).toFixed(0)} МБ\n`);

if (DRY) process.exit(0);

/* ---------- сжатие ---------- */

const TMP = path.join(ROOT, '.compress-tmp');
fs.mkdirSync(TMP, { recursive: true });

let before = 0;
let after = 0;
let shrunk = 0;
let kept = 0;

targets.forEach((p, i) => {
  const size = fs.statSync(p).size;
  const tmp = path.join(TMP, 'x' + path.extname(p));
  const isPng = /\.png$/i.test(p);

  if (isPng) {
    spawnSync('pngquant', ['--quality', '70-92', '--speed', '3', '--force', '--output', tmp, p], { stdio: 'ignore' });
  } else {
    fs.copyFileSync(p, tmp);
    spawnSync('sips', ['-s', 'format', 'jpeg', '-s', 'formatOptions', '82', tmp, '--out', tmp], { stdio: 'ignore' });
  }

  before += size;
  if (fs.existsSync(tmp) && fs.statSync(tmp).size < size) {
    fs.copyFileSync(tmp, p);
    after += fs.statSync(p).size;
    shrunk++;
  } else {
    after += size;
    kept++;                            // сжатие не помогло — оставили оригинал
  }
  done[p] = true;
  if (fs.existsSync(tmp)) fs.unlinkSync(tmp);

  if ((i + 1) % 100 === 0) console.log(`  обработано ${i + 1} из ${targets.length}…`);
});

fs.rmSync(TMP, { recursive: true, force: true });
fs.writeFileSync(STORE, JSON.stringify(done, null, 0) + '\n');

console.log(`\nсжато: ${shrunk}, оставлено как есть: ${kept}`);
console.log(`вес: ${(before / 1048576).toFixed(0)} МБ → ${(after / 1048576).toFixed(0)} МБ` +
  ` (${before ? Math.round(100 - (after * 100) / before) : 0}% экономии)`);
