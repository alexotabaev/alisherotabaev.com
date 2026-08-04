#!/usr/bin/env node
/**
 * Миниатюры портретов для карточек на /cases/.
 *
 *   node _tools/cases/thumbs.mjs
 *
 * Карточка показывает портрет шириной 380 пикселей, а в вёрстке стояли
 * исходники по 2–3 МБ: страница /cases/ тянула 30 МБ картинок. Здесь из них
 * делаются миниатюры шириной 760 (двойная плотность для ретины) в
 * images/cases/.
 *
 * Оригиналы не трогаются: они лежат на своих местах и используются на самих
 * страницах кейсов. Здесь только копии под конкретный размер показа.
 *
 * Картинки уже thé меньше 760 пикселей не увеличиваются — апскейл раздувает
 * файл, ничего не улучшая (у одного портрета 400×400 «миниатюра» вышла
 * тяжелее исходника).
 *
 * Нужны sips (есть в macOS) и pngquant. Без них шаг пропускается, а карточки
 * продолжают показывать оригиналы — страница станет тяжёлой, но не сломается.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
process.chdir(ROOT);

const TARGET_WIDTH = 760;
const OUT_DIR = 'images/cases';

const has = (cmd) => spawnSync('which', [cmd], { stdio: 'ignore' }).status === 0;
if (!has('sips') || !has('pngquant')) {
  console.warn('⚠ нет sips или pngquant — миниатюры не пересобраны, карточки покажут оригиналы');
  process.exit(0);
}

const data = JSON.parse(fs.readFileSync(path.join(HERE, 'data.json'), 'utf8'));
fs.mkdirSync(OUT_DIR, { recursive: true });

const widthOf = (f) => {
  const out = spawnSync('sips', ['-g', 'pixelWidth', f], { encoding: 'utf8' }).stdout || '';
  const m = out.match(/pixelWidth:\s*(\d+)/);
  return m ? Number(m[1]) : 0;
};

let before = 0;
let after = 0;
let made = 0;

for (const c of data.cases) {
  if (!c.photo) continue;
  const src = c.photo.replace(/^\//, '');
  if (!fs.existsSync(src)) continue;

  const dst = path.join(OUT_DIR, `${c.slug}.png`);
  const w = widthOf(src);

  if (w > TARGET_WIDTH) {
    spawnSync('sips', ['--resampleWidth', String(TARGET_WIDTH), src, '--out', dst], { stdio: 'ignore' });
  } else {
    fs.copyFileSync(src, dst);          // уже мельче цели — только сжимаем
  }
  spawnSync('pngquant', ['--quality', '65-88', '--speed', '1', '--force', '--output', dst, dst], {
    stdio: 'ignore',
  });

  // Если сжатие не помогло (бывает у маленьких картинок) — оставляем оригинал
  if (fs.statSync(dst).size >= fs.statSync(src).size) fs.copyFileSync(src, dst);

  before += fs.statSync(src).size;
  after += fs.statSync(dst).size;
  made++;
}

console.log(`миниатюр: ${made}`);
console.log(`вес портретов на /cases/: ${(before / 1048576).toFixed(1)} МБ → ${(after / 1024).toFixed(0)} КБ`);
