#!/usr/bin/env node
// R2.4 Q0 — verification read-only guard + deterministic temp path law.
// A verification lane must leave the git worktree byte-identical; any fixed
// /tmp literal in scripts/ must be registered with a class and justification.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { readJsonBounded, R24Error } from './canonical-json.mjs';

export const TEMP_PATH_REGISTRY_PATH = path.join('docs', 'OPS', 'R24', 'TEMP_PATH_REGISTRY_V1.json');

const FIXED_TMP_RE = /['"`](\/tmp\/[^'"`\s]+)['"`]/g;
const TEMP_CLASSES = new Set(['LEGACY_STATE', 'FIXTURE_PATH', 'FIXTURE_PAYLOAD', 'NEGATIVE_PROBE']);

const gitStatus = (rootDir) => {
  const r = spawnSync('git', ['-C', rootDir, 'status', '--porcelain=v1', '--untracked-files=all'], { encoding: 'utf8' });
  if (r.status !== 0) throw new R24Error('E_GIT', String(r.stderr || '').trim());
  return r.stdout;
};

export function assertReadOnlyRun(rootDir, { runId, cmd, args = [] }) {
  if (typeof runId !== 'string' || runId.length === 0) throw new R24Error('E_RUNNER_TRUTH_UNNAMED');
  const before = gitStatus(rootDir);
  const started = Date.now();
  const result = spawnSync(cmd, args, { cwd: rootDir, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  const after = gitStatus(rootDir);
  const receipt = {
    schemaVersion: 'yalken.readonly-run.v1',
    runId,
    cmd,
    args,
    exitCode: typeof result.status === 'number' ? result.status : 1,
    durationMs: Date.now() - started,
    treeChanged: before !== after,
    beforeDigest: gitStatusDigest(before),
    afterDigest: gitStatusDigest(after),
  };
  if (before !== after) {
    receipt.verdict = 'FAIL';
    receipt.delta = diffLines(before, after).slice(0, 20);
    return { receipt, stdout: String(result.stdout || ''), stderr: String(result.stderr || '') };
  }
  receipt.verdict = receipt.exitCode === 0 ? 'PASS' : 'FAIL';
  return { receipt, stdout: String(result.stdout || ''), stderr: String(result.stderr || '') };
}

const gitStatusDigest = (text) => crypto.createHash('sha256').update(text).digest('hex');
const diffLines = (a, b) => {
  const before = new Set(a.split('\n'));
  const after = new Set(b.split('\n'));
  return [...after].filter((line) => !before.has(line)).concat([...before].filter((line) => !after.has(line)));
};

export function checkTempPathRegistry(rootDir) {
  const registry = readJsonBounded(path.join(rootDir, TEMP_PATH_REGISTRY_PATH));
  if (registry.schemaVersion !== 'yalken.temp-path-registry.v1') throw new R24Error('E_TEMP_PATH_REGISTRY_SCHEMA');
  if (!Array.isArray(registry.entries)) throw new R24Error('E_TEMP_PATH_REGISTRY_SHAPE');
  const failures = [];
  const registered = new Map();
  for (const [index, entry] of registry.entries.entries()) {
    for (const field of ['literal', 'pathClass', 'justification', 'registeredBy']) {
      if (typeof entry?.[field] !== 'string' || entry[field].trim() === '') {
        failures.push(`E_TEMP_PATH_REGISTRY_INCOMPLETE:${index}:${field}`);
      }
    }
    if (entry && typeof entry.literal === 'string') {
      if (!entry.literal.startsWith('/tmp/')) failures.push(`E_TEMP_PATH_LITERAL_SHAPE:${entry.literal}`);
      if (registered.has(entry.literal)) failures.push(`E_TEMP_PATH_REGISTRY_DUPLICATE:${entry.literal}`);
      if (entry.pathClass && !TEMP_CLASSES.has(entry.pathClass)) failures.push(`E_TEMP_PATH_CLASS_UNKNOWN:${entry.literal}:${entry.pathClass}`);
      registered.set(entry.literal, entry);
    }
  }
  const scriptsDir = path.join(rootDir, 'scripts');
  const found = new Set();
  const walk = (dir) => {
    if (!fs.existsSync(dir)) return;
    for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, item.name);
      if (item.isDirectory()) {
        if (item.name !== 'node_modules' && !item.name.startsWith('.')) walk(full);
      } else if (/\.(mjs|cjs|js)$/.test(item.name)) {
        const text = fs.readFileSync(full, 'utf8');
        for (const match of text.matchAll(FIXED_TMP_RE)) found.add(match[1]);
      }
    }
  };
  walk(scriptsDir);
  for (const literal of found) {
    if (!registered.has(literal)) failures.push(`E_TEMP_PATH_UNREGISTERED:${literal}`);
  }
  for (const literal of registered.keys()) {
    if (!found.has(literal)) failures.push(`E_TEMP_PATH_STALE:${literal}`);
  }
  return { ok: failures.length === 0, failures, foundCount: found.size, registeredCount: registered.size };
}

export function main(argv = process.argv.slice(2)) {
  const rootDir = path.resolve(argv[0] || process.cwd());
  const result = checkTempPathRegistry(rootDir);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (!result.ok) process.exitCode = 1;
  return result;
}

const invokedAsScript = process.argv[1] && path.resolve(process.argv[1]).endsWith('test-readonly-guard.mjs');
if (invokedAsScript) main();
