import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
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

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
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

test('claim term in immutable file resolves through exact sha-bound evidence binding', () => {
  const content = '{"status":"READY"}';
  const dir = makeDocs({ docs: { 'SEALED.json': content } });
  const stamp = {
    schemaVersion: 'EvidenceStampV2',
    stampId: 'ES-R24-A0-SEALED-BINDING',
    claimBindings: [
      {
        filePath: 'docs/OPS/R24/SEALED.json',
        sha256: sha256(content),
      },
    ],
  };
  fs.writeFileSync(
    path.join(dir, 'docs', 'OPS', 'R24', 'EVIDENCE', 'ES-R24-A0-SEALED-BINDING.json'),
    JSON.stringify(stamp),
  );
  const result = lintDocsClaims(dir);
  assert.equal(result.ok, true);
  assert.equal(result.filesWithClaims, 1);
  assert.equal(result.stampCount, 1);
});

test('sha-bound evidence binding fails closed when target digest changes', () => {
  const dir = makeDocs({ docs: { 'SEALED.json': '{"status":"READY"}' } });
  const stamp = {
    schemaVersion: 'EvidenceStampV2',
    stampId: 'ES-R24-A0-SEALED-BINDING',
    claimBindings: [
      {
        filePath: 'docs/OPS/R24/SEALED.json',
        sha256: sha256('different bytes'),
      },
    ],
  };
  fs.writeFileSync(
    path.join(dir, 'docs', 'OPS', 'R24', 'EVIDENCE', 'ES-R24-A0-SEALED-BINDING.json'),
    JSON.stringify(stamp),
  );
  const result = lintDocsClaims(dir);
  assert.equal(result.ok, false);
  assert.ok(result.failures.includes('E_CLAIM_BINDING_DIGEST_MISMATCH:docs/OPS/R24/SEALED.json'));
});
