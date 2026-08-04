#!/usr/bin/env node
/**
 * Проставляет картинкам width и height.
 *
 *   node _tools/hygiene/imgsize.mjs
 *
 * Без этих атрибутов браузер не знает пропорций картинки, пока она не
 * загрузится, и верстает страницу дважды: сначала без места под картинку,
 * потом со сдвигом всего, что ниже. Это Cumulative Layout Shift — одна из
 * трёх метрик Core Web Vitals, по которым Google ранжирует.
 *
 * На главной Lighthouse показал CLS 0.105 при пороге 0.1 и прямо назвал
 * виновников: фото в шапке и три обложки книг.
 *
 * Размеры берутся из самих файлов через sips, а не угадываются. CSS при этом
 * не трогается: ширина по-прежнему задаётся стилями, атрибуты нужны только
 * чтобы браузер заранее знал соотношение сторон.
 *
 * Идемпотентный: у кого атрибуты уже есть — не трогаем.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
process.chdir(ROOT);

if (spawnSync('which', ['sips'], { stdio: 'ignore' }).status !== 0) {
  console.warn('⚠ нет sips — размеры не проставлены');
  process.exit(0);
}

const dims = new Map();
function sizeOf(file) {
  if (dims.has(file)) return dims.get(file);
  let r = null;
  if (fs.existsSync(file)) {
    const out = spawnSync('sips', ['-g', 'pixelWidth', '-g', 'pixelHeight', file], { encoding: 'utf8' }).stdout || '';
    const w = out.match(/pixelWidth:\s*(\d+)/);
    const h = out.match(/pixelHeight:\s*(\d+)/);
    if (w && h) r = { w: Number(w[1]), h: Number(h[1]) };
  }
  dims.set(file, r);
  return r;
}

function collect() {
  const out = [];
  const walk = (dir, depth) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.name.startsWith('.') || e.name.startsWith('_')) continue;
      const p = path.join(dir, e.name).replace(/^\.\//, '');
      if (e.isDirectory()) {
        if (['images', 'css', 'js', 'files'].includes(e.name)) continue;
        if (depth < 2) walk(p, depth + 1);
      } else if (e.name.endsWith('.html')) out.push(p);
    }
  };
  walk('.', 0);
  return out;
}

let added = 0;
let skipped = 0;

for (const file of collect()) {
  const s = fs.readFileSync(file, 'utf8');
  const out = s.replace(/<img\b[^>]*>/g, (tag) => {
    if (/\bwidth\s*=/.test(tag) || /\bheight\s*=/.test(tag)) return tag;

    // Настоящий путь у Tilda лежит в data-original, в src — заглушка
    const raw = (tag.match(/data-original=["']([^"']*)["']/) || tag.match(/src=["']([^"']*)["']/) || [, ''])[1];
    if (!raw.startsWith('/images/')) return tag;      // внешние и data: пропускаем

    const d = sizeOf(raw.replace(/^\//, ''));
    if (!d) {
      skipped++;
      return tag;
    }
    added++;
    return tag.replace(/<img\b/, `<img width="${d.w}" height="${d.h}"`);
  });
  if (out !== s) fs.writeFileSync(file, out);
}

console.log(`width/height проставлены: ${added}`);
if (skipped) console.log(`пропущено (файл не найден или не читается): ${skipped}`);
