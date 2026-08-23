import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { lintDocsClaims } from '../docs-claim-lint.mjs';

const HEAD = 'a'.repeat(40);
const TREE = 'b'.repeat(40);
const NOW = '2026-08-23T00:00:00Z';

function evidenceStamp(id) {
  return {
    schemaVersion: 'EvidenceStampV2',
    stampId: id,
    missionId: 'MISSION-1',
    contourId: 'CONTOUR-1',
    attemptId: 'ATTEMPT-1',
    authorityEpoch: 'EPOCH-1',
    profileId: 'PROFILE-1',
    repo: {
      canonicalPath: '/repo',
      originUrl: 'https://example.invalid/repo.git',
      headSha: HEAD,
      treeSha: TREE,
    },
    claim: { type: 'DOCS_CLAIM', ceiling: 'EXACT_FILE_ONLY', verdict: 'PASS' },
    test: {
      oracleId: 'DOCS-ORACLE-1',
      evidenceClass: 'CONTRACT',
      denominator: 1,
      passed: 1,
      failed: 0,
      skipped: 0,
      exitCode: 0,
    },
    causal: { parentStampIds: [], predecessorReceiptDigest: null },
    createdAt: NOW,
  };
}

function makeDocs({ stamps = [], docs = {} } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'r24-claim-'));
  const evidenceDir = path.join(dir, 'docs', 'OPS', 'R24', 'EVIDENCE');
  fs.mkdirSync(evidenceDir, { recursive: true });
  for (const id of stamps) {
    fs.writeFileSync(path.join(evidenceDir, `${id}.json`), JSON.stringify(evidenceStamp(id)));
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

test('stampId-only artifact cannot resolve a claim', () => {
  const dir = makeDocs({ docs: { 'STATUS.json': '{"status":"READY","evidence":"STAMP_ONLY"}' } });
  fs.writeFileSync(
    path.join(dir, 'docs', 'OPS', 'R24', 'EVIDENCE', 'minimal.json'),
    JSON.stringify({ stampId: 'STAMP_ONLY' }),
  );
  const result = lintDocsClaims(dir);
  assert.equal(result.ok, false);
  assert.ok(result.failures.some((failure) => failure.includes('E_EVIDENCE_ARTIFACT_SCHEMA:')));
});

test('claim binding misdeclared as EvidenceStampV2 fails strict schema', () => {
  const dir = makeDocs({ docs: { 'STATUS.json': '{"status":"READY","evidence":"BAD-BINDING"}' } });
  fs.writeFileSync(
    path.join(dir, 'docs', 'OPS', 'R24', 'EVIDENCE', 'bad-binding.json'),
    JSON.stringify({
      schemaVersion: 'EvidenceStampV2',
      stampId: 'BAD-BINDING',
      claimBindings: [],
    }),
  );
  const result = lintDocsClaims(dir);
  assert.equal(result.ok, false);
  assert.ok(result.failures.some((failure) => failure.endsWith(':E_EVIDENCE_STAMP_SCHEMA')));
});

test('underspecified ClaimBindingV1 fails strict schema', () => {
  const dir = makeDocs({ docs: { 'STATUS.json': '{"status":"READY","evidence":"BAD-CB"}' } });
  fs.writeFileSync(
    path.join(dir, 'docs', 'OPS', 'R24', 'EVIDENCE', 'bad-claim-binding.json'),
    JSON.stringify({
      schemaVersion: 'ClaimBindingV1',
      stampId: 'BAD-CB',
      claimBindings: [],
    }),
  );
  const result = lintDocsClaims(dir);
  assert.equal(result.ok, false);
  assert.ok(result.failures.some((failure) => failure.endsWith(':E_CLAIM_BINDING_SCHEMA')));
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
    schemaVersion: 'ClaimBindingV1',
    stampId: 'ES-R24-A0-SEALED-BINDING',
    contourId: 'A0',
    evidenceClass: 'CONTRACT',
    verdict: 'PASS',
    headSha: HEAD,
    originMainSha: HEAD,
    generatedAtUtc: NOW,
    oracle: 'exact sha-bound docs claim',
    claimBindings: [
      {
        filePath: 'docs/OPS/R24/SEALED.json',
        sha256: sha256(content),
        claimTerms: ['READY'],
      },
    ],
    nonClaims: ['No broader claim.'],
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
    schemaVersion: 'ClaimBindingV1',
    stampId: 'ES-R24-A0-SEALED-BINDING',
    contourId: 'A0',
    evidenceClass: 'CONTRACT',
    verdict: 'PASS',
    headSha: HEAD,
    originMainSha: HEAD,
    generatedAtUtc: NOW,
    oracle: 'exact sha-bound docs claim',
    claimBindings: [
      {
        filePath: 'docs/OPS/R24/SEALED.json',
        sha256: sha256('different bytes'),
        claimTerms: ['READY'],
      },
    ],
    nonClaims: ['No broader claim.'],
  };
  fs.writeFileSync(
    path.join(dir, 'docs', 'OPS', 'R24', 'EVIDENCE', 'ES-R24-A0-SEALED-BINDING.json'),
    JSON.stringify(stamp),
  );
  const result = lintDocsClaims(dir);
  assert.equal(result.ok, false);
  assert.ok(result.failures.includes('E_CLAIM_BINDING_DIGEST_MISMATCH:docs/OPS/R24/SEALED.json'));
});
