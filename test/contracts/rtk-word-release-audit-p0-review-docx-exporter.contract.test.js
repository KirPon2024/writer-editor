'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const SCRIPT_PATH = path.join(REPO_ROOT, 'scripts', 'ops', 'rtk-word-release-audit-p0-review-docx-exporter.mjs');
const RECEIPT_PATH = path.join(REPO_ROOT, 'docs', 'OPS', 'RTK', 'WORD_ROUNDTRIP_RELEASE_AUDIT_NIGHT_01_P0_REVIEW_DOCX_EXPORTER_RECEIPT.json');
const PROGRAM_PATH = path.join(REPO_ROOT, 'docs', 'OPS', 'RTK', 'POST_D1_PORTABILITY_PROGRAM_V1.json');
const PROFILE_PATH = path.join(REPO_ROOT, 'docs', 'OPS', 'RTK', 'WORD_SAFE_SEMANTIC_ROUNDTRIP_V4_CAPABILITY_PROFILE_V1.json');
const LEDGER_PATH = path.join(REPO_ROOT, 'docs', 'OPS', 'RTK', 'WORD_SAFE_SEMANTIC_ROUNDTRIP_V4_E12_SATURATION_LEDGER_RECEIPT.json');

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

async function loadScript() {
  return import(pathToFileURL(SCRIPT_PATH).href);
}

test('release audit P0 verifier binds product Review DOCX exporter without return or apply overclaim', async () => {
  const mod = await loadScript();
  const result = mod.evaluateWordReleaseAuditP0ReviewDocxExporter({
    receipt: readJson(RECEIPT_PATH),
    program: readJson(PROGRAM_PATH),
    profile: readJson(PROFILE_PATH),
    ledger: readJson(LEDGER_PATH),
  });

  assert.equal(result.status, 'PASS', JSON.stringify(result, null, 2));
  assert.equal(result.productRuntimeWired, true);
  assert.equal(result.returnIntakeWired, false);
  assert.equal(result.automaticApplyCertified, false);
  assert.equal(result.wordSaturated, false);
});

test('release audit P0 verifier fails on exporter authority overclaim or missing carrier proof', async () => {
  const mod = await loadScript();
  const receipt = readJson(RECEIPT_PATH);
  const program = readJson(PROGRAM_PATH);
  const profile = readJson(PROFILE_PATH);
  const ledger = readJson(LEDGER_PATH);

  receipt.implementedCapability.automaticApplyCertified = true;
  let result = mod.evaluateWordReleaseAuditP0ReviewDocxExporter({
    receipt,
    program,
    profile,
    ledger,
  });
  assert.equal(result.status, 'FAIL');
  assert.equal(result.issues.some((issue) => issue.code === 'RTK_RELEASE_AUDIT_P0_EXPORTER_AUTHORITY_INVALID'), true);

  receipt.implementedCapability.automaticApplyCertified = false;
  receipt.runtimeProof.hasAuthorityCarrier = false;
  result = mod.evaluateWordReleaseAuditP0ReviewDocxExporter({
    receipt,
    program,
    profile,
    ledger,
  });
  assert.equal(result.status, 'FAIL');
  assert.equal(result.issues.some((issue) => issue.code === 'RTK_RELEASE_AUDIT_P0_EXPORTER_RUNTIME_PROOF_INVALID'), true);
});
