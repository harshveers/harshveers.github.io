#!/usr/bin/env node
// Checks the built site in dist/ the way GitHub Pages serves it.
//   --links   every internal href/src/srcset in every HTML page resolves to a file, and every
//             outside link (http/https to another site) opens in a new tab
//   --legacy  every path in tests/legacy-urls.txt resolves (directly or via a redirect page)
// Exits non-zero on any failure.

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, posix } from 'node:path';

const DIST = 'dist';
const ORIGIN = 'https://harshveer.me';

/** Resolves a URL path to a file in dist/ using GitHub Pages' rules, or null. */
export function resolvePath(urlPath) {
  const p = decodeURIComponent(urlPath.split(/[?#]/)[0]);
  const file = (rel) => {
    const full = join(DIST, rel);
    return existsSync(full) && statSync(full).isFile() ? full : null;
  };
  if (p.endsWith('/')) return file(`${p}index.html`);
  return file(p) ?? file(`${p}.html`) ?? file(`${p}/index.html`);
}

function htmlFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = join(dir, e.name);
    if (e.isDirectory()) return htmlFiles(full);
    return e.name.endsWith('.html') ? [full] : [];
  });
}

function internalRefs(html, pagePath) {
  const refs = [];
  const add = (raw) => {
    if (!raw || /^(mailto:|tel:|data:|javascript:|#)/.test(raw)) return;
    let url;
    try {
      url = new URL(raw, ORIGIN + pagePath);
    } catch {
      refs.push({ raw, path: null });
      return;
    }
    if (url.origin === ORIGIN) refs.push({ raw, path: url.pathname });
  };
  for (const m of html.matchAll(/\s(?:href|src|content)="([^"]*)"/g)) {
    // content="" only matters for refresh redirects and og:image-style absolute URLs.
    const v = m[1];
    if (m[0].includes('content=')) {
      const refresh = /^\d+;\s*url=(.+)$/i.exec(v);
      if (refresh) add(refresh[1]);
      else if (v.startsWith(ORIGIN)) add(v);
    } else add(v);
  }
  for (const m of html.matchAll(/\ssrcset="([^"]*)"/g)) {
    for (const part of m[1].split(',')) add(part.trim().split(/\s+/)[0]);
  }
  return refs;
}

function checkLinks() {
  let failures = 0;
  let count = 0;
  for (const file of htmlFiles(DIST)) {
    const pagePath = '/' + posix.relative(DIST, file.split('\\').join('/')).replace(/index\.html$/, '');
    const html = readFileSync(file, 'utf8');
    for (const m of html.matchAll(/<a\s[^>]*>/g)) {
      const href = /\shref="(https?:\/\/[^"]*)"/.exec(m[0])?.[1];
      if (href && !href.startsWith(ORIGIN) && !/\starget="_blank"/.test(m[0])) {
        failures++;
        console.error(`SAME TAB  ${pagePath}  ->  ${href} (outside links must have target="_blank")`);
      }
    }
    for (const ref of internalRefs(html, pagePath)) {
      count++;
      if (!ref.path || !resolvePath(ref.path)) {
        failures++;
        console.error(`BROKEN  ${pagePath}  ->  ${ref.raw}`);
      }
    }
  }
  console.log(`links: ${count} internal references checked, ${failures} broken`);
  return failures;
}

function checkLegacy() {
  const lines = readFileSync('tests/legacy-urls.txt', 'utf8')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'));
  let failures = 0;
  for (const path of lines) {
    const file = resolvePath(path);
    if (!file) {
      failures++;
      console.log(`FAIL  ${path}  (no file in dist/)`);
      continue;
    }
    const body = file.endsWith('.html') ? readFileSync(file, 'utf8') : '';
    const refresh = /http-equiv="refresh" content="\d+;\s*url=([^"]+)"/.exec(body);
    if (refresh) {
      const target = resolvePath(refresh[1]);
      if (!target) {
        failures++;
        console.log(`FAIL  ${path}  -> redirect to ${refresh[1]}, which does not exist`);
      } else console.log(`OK    ${path}  -> redirect to ${refresh[1]}`);
    } else {
      console.log(`OK    ${path}  -> ${file}`);
    }
  }
  console.log(`legacy: ${lines.length - failures}/${lines.length} legacy URLs resolve`);
  return failures;
}

if (!existsSync(DIST)) {
  console.error('dist/ not found: run npm run build first');
  process.exit(1);
}
const mode = process.argv[2];
const failures = mode === '--links' ? checkLinks() : mode === '--legacy' ? checkLegacy() : (console.error('usage: check-dist.mjs --links | --legacy'), 1);
process.exit(failures ? 1 : 0);
