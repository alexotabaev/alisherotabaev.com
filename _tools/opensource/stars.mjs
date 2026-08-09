#!/usr/bin/env node
/**
 * Обновляет число звёзд у проектов каталога.
 *
 *   node _tools/opensource/stars.mjs
 *
 * Запускается руками, в общую сборку не входит: числа меняются медленно,
 * а дёргать GitHub на каждой сборке незачем — и в CI это упёрлось бы в
 * ограничение на запросы.
 *
 * Почему звёзды, а не «оценка полезности». Оценку пришлось бы придумать,
 * и она была бы моей, а не проверяемой. Звёзды — внешнее число, которое
 * любой может сверить, открыв репозиторий. Это не мера качества, но
 * хороший ориентир: по нему видно, что взяли в работу тысячи людей, а что
 * пока эксперимент.
 *
 * Личный выбор владельца отмечается отдельным полем pick в data.json —
 * оно важнее звёзд и в каталоге показывается заметнее.
 *
 * Проект, который не отвечает (переименован, удалён, стал приватным),
 * называется вслух и остаётся с прежним числом. Молча обнулить хуже:
 * в каталоге появился бы ноль, похожий на настоящий.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const run = promisify(execFile);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const FILE = path.join(HERE, 'data.json');

const data = JSON.parse(fs.readFileSync(FILE, 'utf8'));

/** Запрос через gh: он ходит с авторизацией, лимит на порядок выше. */
async function stars(repo) {
  try {
    const { stdout } = await run('gh', ['api', `repos/${repo}`, '--jq', '.stargazers_count'], {
      timeout: 20_000,
    });
    const n = Number(stdout.trim());
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

const failed = [];
let updated = 0;

// Последовательно и без спешки: 175 запросов укладываются в лимит, а
// параллельный залп GitHub встречает как всплеск.
for (const r of data.repos) {
  const n = await stars(r.repo);
  if (n === null) {
    failed.push(r.repo);
    continue;
  }
  if (r.stars !== n) {
    r.stars = n;
    updated++;
  }
}

fs.writeFileSync(FILE, JSON.stringify(data, null, 2) + '\n');

console.log(`звёзды обновлены: ${updated} из ${data.repos.length}`);
if (failed.length) {
  console.log(`не ответили (${failed.length}), число оставлено прежним:`);
  for (const r of failed) console.log(`   ${r}`);
}
