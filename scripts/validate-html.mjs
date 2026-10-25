#!/usr/bin/env node
// Validates every HTML page in dist/ with the W3C Nu HTML Checker (needs Java 11+).
import { spawnSync } from 'node:child_process';
import vnu from 'vnu-jar';

const result = spawnSync('java', ['-jar', vnu, '--errors-only', '--skip-non-html', '--format', 'gnu', 'dist'], { stdio: 'inherit' });
if (result.error) {
  console.error(`validate-html: could not run java (${result.error.message}). Install a JDK 11+.`);
  process.exit(1);
}
if (result.status === 0) console.log('validate-html: every page in dist/ is valid HTML');
process.exit(result.status ?? 1);
