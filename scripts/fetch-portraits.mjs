#!/usr/bin/env node
// Download the cover portraits described by src/data/portraits.json.
// into public/portraits/{slug}.webp. Sequential + polite delay to avoid
// Wikimedia rate limits; retries 429/5xx with backoff. Idempotent (skips existing files).
// Usage: npm run portraits:fetch. Normal dev/build stays offline.
import { readFile, writeFile, mkdir, rename, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { encodePortraitWebp, readPortraitManifest, validatePortraitWebp } from './lib/portraitAssets.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const list = await readPortraitManifest(join(here, '..'));
const outDir = join(here, '..', 'public', 'portraits');
await mkdir(outDir, { recursive: true });
const UA = 'mcw-mathclass/1.0 (portrait cache build; contact: site admin)';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let ok = 0, skipped = 0, failed = [];
for (const p of list) {
  const dest = join(outDir, p.slug + '.webp');
  try { validatePortraitWebp(await readFile(dest), p.file); skipped++; continue; } catch {
    // Missing or damaged local files need a fresh, validated download.
  }
  const url = p.sourceUrl + '?width=280';
  let done = false;
  for (let attempt = 1; attempt <= 4 && !done; attempt++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': UA }, redirect: 'follow', signal: AbortSignal.timeout(20000) });
      if (res.status === 429 || res.status >= 500) throw new Error('HTTP ' + res.status);
      if (!res.ok) { failed.push(p.slug + ' HTTP ' + res.status); break; }
      const source = Buffer.from(await res.arrayBuffer());
      const buf = await encodePortraitWebp(source);
      validatePortraitWebp(buf, p.file);
      const temporary = dest + '.download';
      try {
        await writeFile(temporary, buf);
        await rename(temporary, dest);
      } finally {
        await rm(temporary, { force: true });
      }
      console.log('ok  ' + p.slug + ' (' + Math.round(buf.length / 1024) + ' KB)');
      ok++; done = true;
    } catch (e) {
      if (attempt === 4) failed.push(p.slug + ' ' + e.message);
      else await sleep(1500 * attempt);
    }
  }
  await sleep(350); // polite pacing
}
console.log('\ndone: ' + ok + ' downloaded, ' + skipped + ' skipped, ' + failed.length + ' failed');
if (failed.length) { console.error(failed.join('\n')); process.exit(1); }
