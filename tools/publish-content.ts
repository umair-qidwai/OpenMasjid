import { readFileSync, renameSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { preparePublication, validateSite, type Site } from '../packages/core/src/index.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sourcePath = resolve(root, 'content/site.json');
const outputPaths = [resolve(root, 'apps/web/public/data/v1/site.json'), resolve(root, 'apps/web/src/lib/site.json')];
const source = JSON.parse(readFileSync(sourcePath, 'utf8')) as unknown;
const published: Site = preparePublication(validateSite(source), new Date(), 400);
const serialized = `${JSON.stringify(published)}\n`;
for (const outputPath of outputPaths) {
  mkdirSync(dirname(outputPath), { recursive: true });
  const tempPath = `${outputPath}.tmp-${process.pid}`;
  try {
    writeFileSync(tempPath, serialized, { encoding: 'utf8', flag: 'wx' });
    renameSync(tempPath, outputPath);
  } finally {
    try { readFileSync(tempPath); } catch { /* rename already removed it */ }
  }
}
console.log(`Published ${published.campuses.length} campuses and ${published.campuses.reduce((n, c) => n + c.timetable.length, 0)} prayer rows to ${outputPaths[0]}`);
