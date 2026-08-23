#!/usr/bin/env node
// R2.4 E0 — docs claim linter for the R2.4 mission surface.
// Law: within docs/OPS/R24, any file carrying a claim term (PASS, DONE,
// READY, CLOSED, SAFE, COMPLETE) must reference at least one evidence stamp
// id that exists as a stamped artifact in docs/OPS/R24/EVIDENCE.
// Claim text without a resolvable stamp fails closed.
import fs from 'node:fs';
import path from 'node:path';
import { readJsonBounded, sha256hex } from './canonical-json.mjs';

const CLAIM_TERMS = ['PASS', 'DONE', 'READY', 'CLOSED', 'SAFE', 'COMPLETE'];
const CLAIM_RE = new RegExp(`\\b(${CLAIM_TERMS.join('|')})\\b`);

function listFiles(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) listFiles(full, out);
    else if (entry.isFile()) out.push(full);
  }
  return out;
}

function safeSurfaceRelative(value) {
  if (typeof value !== 'string' || value.length === 0) return false;
  if (path.isAbsolute(value)) return false;
  const normalized = value.replaceAll('\\', '/');
  return normalized.startsWith('docs/OPS/R24/')
    && !normalized.includes('../')
    && /\.(md|json)$/.test(normalized);
}

function addBinding({ rootDir, evidenceDir, stamp, file, bindingsByFile, failures }) {
  if (!Array.isArray(stamp.claimBindings)) return;
  for (const binding of stamp.claimBindings) {
    const relativePath = binding?.filePath || binding?.path || '';
    if (!safeSurfaceRelative(relativePath)) {
      failures.push(`E_CLAIM_BINDING_UNSAFE_PATH:${path.relative(rootDir, file)}`);
      continue;
    }
    if (relativePath.startsWith('docs/OPS/R24/EVIDENCE/')) {
      failures.push(`E_CLAIM_BINDING_EVIDENCE_SELF_REFERENCE:${path.relative(rootDir, file)}`);
      continue;
    }
    const target = path.join(rootDir, relativePath);
    const normalizedTarget = path.resolve(target);
    if (!normalizedTarget.startsWith(path.resolve(rootDir, 'docs', 'OPS', 'R24') + path.sep)) {
      failures.push(`E_CLAIM_BINDING_OUTSIDE_SURFACE:${path.relative(rootDir, file)}`);
      continue;
    }
    if (normalizedTarget.startsWith(path.resolve(evidenceDir) + path.sep)) {
      failures.push(`E_CLAIM_BINDING_EVIDENCE_SELF_REFERENCE:${path.relative(rootDir, file)}`);
      continue;
    }
    if (!fs.existsSync(normalizedTarget)) {
      failures.push(`E_CLAIM_BINDING_TARGET_MISSING:${relativePath}`);
      continue;
    }
    if (typeof binding.sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(binding.sha256)) {
      failures.push(`E_CLAIM_BINDING_DIGEST_REQUIRED:${relativePath}`);
      continue;
    }
    const actual = sha256hex(fs.readFileSync(normalizedTarget));
    if (actual !== binding.sha256) {
      failures.push(`E_CLAIM_BINDING_DIGEST_MISMATCH:${relativePath}`);
      continue;
    }
    const set = bindingsByFile.get(relativePath) || new Set();
    set.add(stamp.stampId);
    bindingsByFile.set(relativePath, set);
  }
}

export function lintDocsClaims(rootDir) {
  const surface = path.join(rootDir, 'docs', 'OPS', 'R24');
  const evidenceDir = path.join(surface, 'EVIDENCE');
  const stampIds = new Set();
  const bindingsByFile = new Map();
  const failures = [];
  for (const file of listFiles(evidenceDir)) {
    if (!file.endsWith('.json')) continue;
    try {
      const stamp = readJsonBounded(file);
      if (stamp && typeof stamp.stampId === 'string' && stamp.stampId.length > 0) {
        stampIds.add(stamp.stampId);
        addBinding({ rootDir, evidenceDir, stamp, file, bindingsByFile, failures });
      }
    } catch {
      return { ok: false, failures: [`E_EVIDENCE_STAMP_UNREADABLE:${path.relative(rootDir, file)}`] };
    }
  }
  let filesWithClaims = 0;
  for (const file of listFiles(surface)) {
    if (file.startsWith(evidenceDir)) continue;
    if (!/\.(md|json)$/.test(file)) continue;
    const text = fs.readFileSync(file, 'utf8');
    if (!CLAIM_RE.test(text)) continue;
    filesWithClaims += 1;
    const relativePath = path.relative(rootDir, file).split(path.sep).join('/');
    const resolved = new Set([
      ...[...stampIds].filter((id) => text.includes(id)),
      ...[...(bindingsByFile.get(relativePath) || [])],
    ]);
    if (resolved.size === 0) failures.push(`E_CLAIM_WITHOUT_EVIDENCE:${path.relative(rootDir, file)}`);
  }
  return { ok: failures.length === 0, failures, filesWithClaims, stampCount: stampIds.size };
}

export function main(argv = process.argv.slice(2)) {
  const rootDir = path.resolve(argv[0] || process.cwd());
  const result = lintDocsClaims(rootDir);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (!result.ok) process.exitCode = 1;
  return result;
}

const invokedAsScript = process.argv[1] && path.resolve(process.argv[1]).endsWith('docs-claim-lint.mjs');
if (invokedAsScript) main();
