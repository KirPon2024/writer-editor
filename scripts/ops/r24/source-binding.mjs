#!/usr/bin/env node
// R2.4 Q0 — closed-world source binding. A binding manifest declares exact
// files with sha256 and optional sizes; every declared file must match, and
// every file under declared closed directories must be declared. Drift,
// extras and absences fail closed.
import fs from 'node:fs';
import path from 'node:path';
import { readJsonBounded, sha256hex, R24Error } from './canonical-json.mjs';

export function verifySourceBinding(rootDir, manifestPath) {
  const manifest = readJsonBounded(path.resolve(rootDir, manifestPath));
  if (manifest.schemaVersion !== 'yalken.source-binding.v1') throw new R24Error('E_SOURCE_BINDING_SCHEMA');
  if (!Array.isArray(manifest.files)) throw new R24Error('E_SOURCE_BINDING_SHAPE');
  const failures = [];
  const declared = new Map();
  const seenPaths = new Set();
  for (const [index, entry] of manifest.files.entries()) {
    if (typeof entry?.path === 'string' && entry.path.length > 0) {
      if (seenPaths.has(entry.path)) failures.push(`E_SOURCE_BINDING_DUPLICATE:${entry.path}`);
      seenPaths.add(entry.path);
    }
    if (typeof entry?.path !== 'string' || entry.path.length === 0 || path.isAbsolute(entry.path) || entry.path.includes('..')) {
      failures.push(`E_SOURCE_BINDING_PATH_INVALID:${index}`);
      continue;
    }
    if (typeof entry.sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(entry.sha256)) {
      failures.push(`E_SOURCE_BINDING_DIGEST_INVALID:${entry.path}`);
      continue;
    }
    if (!declared.has(entry.path)) declared.set(entry.path, entry);
  }
  for (const [rel, entry] of declared) {
    const abs = path.join(rootDir, rel);
    if (!fs.existsSync(abs)) {
      failures.push(`E_SOURCE_BINDING_MISSING:${rel}`);
      continue;
    }
    const content = fs.readFileSync(abs);
    if (sha256hex(content) !== entry.sha256) failures.push(`E_SOURCE_BINDING_DIGEST_DRIFT:${rel}`);
    if (entry.size !== undefined && content.length !== entry.size) failures.push(`E_SOURCE_BINDING_SIZE_DRIFT:${rel}`);
  }
  for (const dir of manifest.closedDirectories || []) {
    if (typeof dir !== 'string' || path.isAbsolute(dir) || dir.includes('..')) {
      failures.push(`E_SOURCE_BINDING_CLOSED_DIR_INVALID:${String(dir)}`);
      continue;
    }
    const absDir = path.join(rootDir, dir);
    const actual = [];
    const walk = (d) => {
      if (!fs.existsSync(d)) return;
      for (const item of fs.readdirSync(d, { withFileTypes: true })) {
        const full = path.join(d, item.name);
        if (item.isDirectory()) walk(full);
        else if (item.isFile()) actual.push(path.relative(rootDir, full).split(path.sep).join('/'));
      }
    };
    walk(absDir);
    for (const rel of actual) {
      if (!declared.has(rel)) failures.push(`E_SOURCE_BINDING_EXTRA:${rel}`);
    }
  }
  return { ok: failures.length === 0, failures, declaredCount: declared.size };
}

export function main(argv = process.argv.slice(2)) {
  const [rootArg, manifestArg] = argv;
  if (!manifestArg) throw new R24Error('E_SOURCE_BINDING_MANIFEST_REQUIRED');
  const result = verifySourceBinding(path.resolve(rootArg || process.cwd()), manifestArg);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (!result.ok) process.exitCode = 1;
  return result;
}

const invokedAsScript = process.argv[1] && path.resolve(process.argv[1]).endsWith('source-binding.mjs');
if (invokedAsScript) main();
