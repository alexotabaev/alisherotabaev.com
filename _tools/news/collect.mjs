#!/usr/bin/env node
/**
 * Сбор новостей про ИИ и деньги — черновик выпуска.
 *
 *   node _tools/news/collect.mjs [--days 7] [--out файл]
 *
 * Что делает: читает ленты из sources.json, оставляет то, что задевает и
 * ИИ, и деловую сторону, выкидывает повторы и складывает кандидатов в
 * черновик выпуска _tools/news/drafts/ГГГГ-ММ-ДД.json.
 *
 * Чего НЕ делает: не пишет разбор. У каждой новости остаётся пустое поле
 * take — «что это значит». Заполняет его владелец, и генератор выпуска не
 * соберёт страницу, пока поле пустое. Смысл раздела в том, что мнение
 * принадлежит человеку; сгенерированное мнение обесценило бы всю затею.
 *
 * Упавшая лента не роняет сбор: про неё пишется отдельной строкой, а
 * остальные обрабатываются. Но если не ответила ни одна — это уже отказ,
 * и скрипт падает: пустой черновик легко принять за «новостей не было».
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');

const args = process.argv.slice(2);
const argOf = (k, d) => {
  const i = args.indexOf(k);
  return i >= 0 && args[i + 1] ? args[i + 1] : d;
};
const DAYS = Number(argOf('--days', '7'));

const cfg = JSON.parse(fs.readFileSync(path.join(HERE, 'sources.json'), 'utf8'));

/* ---------- разбор ленты ---------- */

const strip = (s) =>
  s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_m, n) => String.fromCharCode(Number(n)))
    .replace(/\s+/g, ' ')
    .trim();

const pick = (xml, tag) => {
  const m = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i'));
  return m ? strip(m[1]) : '';
};

/** Ссылка: у RSS это <link>текст</link>, у Atom — <link href="…"/>. */
const pickLink = (xml) => {
  const rss = xml.match(/<link[^>]*>([\s\S]*?)<\/link>/i);
  if (rss && strip(rss[1])) return strip(rss[1]);
  const atom = xml.match(/<link[^>]+href=["']([^"']+)["']/i);
  return atom ? atom[1] : '';
};

function parseFeed(xml) {
  const items = xml.match(/<(item|entry)\b[\s\S]*?<\/\1>/gi) || [];
  return items.map((it) => ({
    title: pick(it, 'title'),
    link: pickLink(it),
    date:
      pick(it, 'pubDate') || pick(it, 'published') || pick(it, 'updated') ||
      pick(it, 'dc:date'),
    summary: (pick(it, 'description') || pick(it, 'summary') || pick(it, 'content'))
      .slice(0, 400),
  }));
}

/* ---------- отбор по теме ---------- */

const hits = (text, words) => words.some((w) => text.includes(w));

function onTopic(item) {
  const t = `${item.title} ${item.summary}`.toLowerCase();
  return hits(t, cfg.topic.ai) && hits(t, cfg.topic.money);
}

/** Ключ для склейки повторов: одну новость перепечатывают несколько лент. */
const keyOf = (title) =>
  title
    .toLowerCase()
    .replace(/[^0-9a-zа-яё ]/g, '')
    .split(/\s+/)
    .filter((w) => w.length > 3)
    .slice(0, 6)
    .sort()
    .join(' ');

/* ---------- сбор ---------- */

const since = Date.now() - DAYS * 86400_000;
const all = [];
const failed = [];

for (const feed of cfg.feeds) {
  try {
    const res = await fetch(feed.url, {
      redirect: 'follow',
      headers: { 'user-agent': 'alisherotabaev.com news collector' },
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const xml = await res.text();
    const items = parseFeed(xml);
    let taken = 0;
    for (const it of items) {
      if (!it.title || !it.link) continue;
      const ts = Date.parse(it.date);
      if (Number.isFinite(ts) && ts < since) continue;
      if (!onTopic(it)) continue;
      all.push({ ...it, source: feed.name, ts: Number.isFinite(ts) ? ts : null });
      taken++;
    }
    console.log(`  ${feed.name}: ${items.length} записей, по теме ${taken}`);
  } catch (e) {
    failed.push(`${feed.name} — ${e.message}`);
    console.log(`  ${feed.name}: не ответила (${e.message})`);
  }
}

if (failed.length === cfg.feeds.length) {
  throw new Error(
    'ни одна лента не ответила — это отказ сети или блокировка, а не «новостей нет»'
  );
}

/* ---------- склейка повторов ---------- */

const byKey = new Map();
for (const it of all) {
  const k = keyOf(it.title);
  const was = byKey.get(k);
  if (!was) byKey.set(k, { ...it, also: [] });
  else if (!was.also.some((a) => a.source === it.source)) {
    was.also.push({ source: it.source, link: it.link });
  }
}

const picked = [...byKey.values()].sort((a, b) => (b.ts || 0) - (a.ts || 0));

/* ---------- черновик выпуска ---------- */

const stamp = new Date(Date.now()).toISOString().slice(0, 10);
const outFile = argOf('--out', path.join(HERE, 'drafts', `${stamp}.json`));
fs.mkdirSync(path.dirname(outFile), { recursive: true });

const draft = {
  _: [
    'Черновик выпуска. Поле take у каждой новости — ваше: что это значит',
    'для бизнеса. Пока оно пустое, выпуск не соберётся.',
    '',
    'Лишние новости просто удалите. Пять-семь штук на выпуск — рабочий',
    'размер: больше читают хуже, меньше не тянет на обзор.',
    '',
    'intro — одно-два предложения о неделе целиком, тоже ваше.',
  ],
  date: stamp,
  status: 'draft',
  title: '',
  intro: '',
  items: picked.slice(0, 20).map((it) => ({
    title: it.title,
    link: it.link,
    source: it.source,
    date: it.ts ? new Date(it.ts).toISOString().slice(0, 10) : '',
    summary: it.summary,
    also: it.also,
    take: '',
  })),
};

fs.writeFileSync(outFile, JSON.stringify(draft, null, 2) + '\n');

console.log(`\nсобрано по теме: ${all.length}, после склейки повторов: ${picked.length}`);
console.log(`черновик: ${path.relative(ROOT, outFile)}`);
console.log(`\nдальше: заполнить take у нужных новостей, лишние удалить`);
if (failed.length) console.log(`не ответили: ${failed.join('; ')}`);
