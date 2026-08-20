import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { lintDocsClaims } from '../docs-claim-lint.mjs';

function makeDocs({ stamps = [], docs = {} } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'r24-claim-'));
  const evidenceDir = path.join(dir, 'docs', 'OPS', 'R24', 'EVIDENCE');
  fs.mkdirSync(evidenceDir, { recursive: true });
  for (const id of stamps) {
    fs.writeFileSync(path.join(evidenceDir, `${id}.json`), JSON.stringify({ schemaVersion: 'EvidenceStampV2', stampId: id }));
  }
  for (const [name, content] of Object.entries(docs)) {
    const file = path.join(dir, 'docs', 'OPS', 'R24', name);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content);
  }
  return dir;
}

test('claim term without resolvable stamp fails closed', () => {
  const dir = makeDocs({ docs: { 'STATUS.json': '{"status":"READY"}' } });
  const result = lintDocsClaims(dir);
  assert.equal(result.ok, false);
  assert.ok(result.failures.some((f) => f.startsWith('E_CLAIM_WITHOUT_EVIDENCE:')));
});

test('claim term resolved by existing stamp passes', () => {
  const dir = makeDocs({
    stamps: ['ES-E0-CONTRACT-1'],
    docs: { 'STATUS.json': '{"status":"READY","evidence":"ES-E0-CONTRACT-1"}' },
  });
  const result = lintDocsClaims(dir);
  assert.equal(result.ok, true);
  assert.equal(result.filesWithClaims, 1);
});

test('surface without claim terms passes vacuously', () => {
  const dir = makeDocs({ docs: { 'REGISTRY.json': '{"note":"plain operational text"}' } });
  const result = lintDocsClaims(dir);
  assert.equal(result.ok, true);
  assert.equal(result.filesWithClaims, 0);
});

test('unreadable evidence artifact fails closed', () => {
  const dir = makeDocs({ docs: {} });
  fs.writeFileSync(path.join(dir, 'docs', 'OPS', 'R24', 'EVIDENCE', 'broken.json'), '{nope');
  const result = lintDocsClaims(dir);
  assert.equal(result.ok, false);
  assert.ok(result.failures.some((f) => f.startsWith('E_EVIDENCE_STAMP_UNREADABLE:')));
});
