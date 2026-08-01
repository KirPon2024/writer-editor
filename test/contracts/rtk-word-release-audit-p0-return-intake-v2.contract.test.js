'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const SCRIPT_PATH = path.join(REPO_ROOT, 'scripts', 'ops', 'rtk-word-release-audit-p0-return-intake-v2.mjs');
const RECEIPT_PATH = path.join(REPO_ROOT, 'docs', 'OPS', 'RTK', 'WORD_ROUNDTRIP_RELEASE_AUDIT_NIGHT_01_P0_RETURN_INTAKE_V2_RECEIPT.json');
const PROGRAM_PATH = path.join(REPO_ROOT, 'docs', 'OPS', 'RTK', 'POST_D1_PORTABILITY_PROGRAM_V1.json');
const PROFILE_PATH = path.join(REPO_ROOT, 'docs', 'OPS', 'RTK', 'WORD_SAFE_SEMANTIC_ROUNDTRIP_V4_CAPABILITY_PROFILE_V1.json');
const LEDGER_PATH = path.join(REPO_ROOT, 'docs', 'OPS', 'RTK', 'WORD_SAFE_SEMANTIC_ROUNDTRIP_V4_E12_SATURATION_LEDGER_RECEIPT.json');

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

async function loadScript() {
  return import(pathToFileURL(SCRIPT_PATH).href);
}

test('release audit P0 return intake verifier binds parser V2 gate without apply overclaim', async () => {
  const mod = await loadScript();
  const result = await mod.evaluateWordReleaseAuditP0ReturnIntakeV2({
    receipt: readJson(RECEIPT_PATH),
    program: readJson(PROGRAM_PATH),
    profile: readJson(PROFILE_PATH),
    ledger: readJson(LEDGER_PATH),
  });

  assert.equal(result.status, 'PASS', JSON.stringify(result, null, 2));
  assert.equal(result.returnIntakeWired, true);
  assert.equal(result.parsedWordIrConsumerWired, true);
  assert.equal(result.automaticApplyCertified, false);
  assert.equal(result.wordSaturated, false);
});

test('release audit P0 return intake verifier fails on missing return gate or apply overclaim', async () => {
  const mod = await loadScript();
  const receipt = readJson(RECEIPT_PATH);
  const program = readJson(PROGRAM_PATH);
  const profile = readJson(PROFILE_PATH);
  const ledger = readJson(LEDGER_PATH);

  receipt.implementedCapability.returnIntakeWired = false;
  let result = await mod.evaluateWordReleaseAuditP0ReturnIntakeV2({
    receipt,
    program,
    profile,
    ledger,
  });
  assert.equal(result.status, 'FAIL');
  assert.equal(result.issues.some((issue) => issue.code === 'RTK_RELEASE_AUDIT_P0_RETURN_INTAKE_AUTHORITY_INVALID'), true);

  receipt.implementedCapability.returnIntakeWired = true;
  receipt.implementedCapability.automaticApplyCertified = true;
  result = await mod.evaluateWordReleaseAuditP0ReturnIntakeV2({
    receipt,
    program,
    profile,
    ledger,
  });
  assert.equal(result.status, 'FAIL');
  assert.equal(result.issues.some((issue) => issue.code === 'RTK_RELEASE_AUDIT_P0_RETURN_INTAKE_AUTHORITY_INVALID'), true);
});
