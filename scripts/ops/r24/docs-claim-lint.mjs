#!/usr/bin/env node
// R2.4 E0 — docs claim linter for the R2.4 mission surface.
// Law: within docs/OPS/R24, any file carrying a claim term (PASS, DONE,
// READY, CLOSED, SAFE, COMPLETE) must reference at least one evidence stamp
// id that exists as a stamped artifact in docs/OPS/R24/EVIDENCE.
// Claim text without a resolvable stamp fails closed.
import fs from 'node:fs';
import path from 'node:path';
import { readJsonBounded } from './canonical-json.mjs';

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

export function lintDocsClaims(rootDir) {
  const surface = path.join(rootDir, 'docs', 'OPS', 'R24');
  const evidenceDir = path.join(surface, 'EVIDENCE');
  const stampIds = new Set();
  for (const file of listFiles(evidenceDir)) {
    if (!file.endsWith('.json')) continue;
    try {
      const stamp = readJsonBounded(file);
      if (stamp && typeof stamp.stampId === 'string' && stamp.stampId.length > 0) stampIds.add(stamp.stampId);
    } catch {
      return { ok: false, failures: [`E_EVIDENCE_STAMP_UNREADABLE:${path.relative(rootDir, file)}`] };
    }
  }
  const failures = [];
  let filesWithClaims = 0;
  for (const file of listFiles(surface)) {
    if (file.startsWith(evidenceDir)) continue;
    if (!/\.(md|json)$/.test(file)) continue;
    const text = fs.readFileSync(file, 'utf8');
    if (!CLAIM_RE.test(text)) continue;
    filesWithClaims += 1;
    const resolved = [...stampIds].filter((id) => text.includes(id));
    if (resolved.length === 0) failures.push(`E_CLAIM_WITHOUT_EVIDENCE:${path.relative(rootDir, file)}`);
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
