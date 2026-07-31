#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const RECEIPT_PATH = path.join(REPO_ROOT, 'docs', 'OPS', 'RTK', 'WORD_SAFE_SEMANTIC_ROUNDTRIP_V4_E06_PHYSICAL_TEXT_CERTIFICATION_RECEIPT.json');
const REQUIRED_CASES = [
  'WL2-001',
  'WL2-002',
  'WL2-003',
  'WL2-004',
  'WL2-005',
  'WL2-006',
  'WL2-009',
  'WL2-010',
  'WL2-021',
  'WL2-026',
  'WL2-027',
  'WL2-030',
  'WL2-031',
  'WL2-032',
];

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function sha256File(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function isHex64(value) {
  return /^[0-9a-f]{64}$/u.test(String(value || ''));
}

function isSha256(value) {
  return /^sha256:[0-9a-f]{64}$/u.test(String(value || ''));
}

function issue(code, field, message) {
  return { code, field, message };
}

export function evaluateWordV4E06PhysicalTextCertification(input = {}) {
  const receipt = input.receipt || readJson(RECEIPT_PATH);
  const issues = [];
  const add = (code, field, message) => issues.push(issue(code, field, message));

  if (receipt.schemaVersion !== 'yalken.rtk.word-safe-semantic-roundtrip-v4.e06-physical-text-certification-receipt.v1') {
    add('RTK_V4_E06_SCHEMA_INVALID', 'schemaVersion', 'E06 receipt schema is invalid.');
  }
  if (receipt.stageId !== 'EXECUTION_06_PHYSICAL_TEXT_CERTIFICATION') {
    add('RTK_V4_E06_STAGE_INVALID', 'stageId', 'E06 stage id is invalid.');
  }
  if (receipt.status !== 'PHYSICAL_TEXT_CERTIFIED_WITH_TYPED_LIMITATIONS') {
    add('RTK_V4_E06_STATUS_INVALID', 'status', 'E06 status must be physical text certification with typed limitations.');
  }
  if (receipt.wordProfile?.versionByAppleScript !== '16.111.2' || receipt.wordProfile?.versionByBundle !== '16.111.2') {
    add('RTK_V4_E06_WORD_VERSION_NOT_LATEST', 'wordProfile', 'E06 requires observed Word 16.111.2.');
  }
  if (receipt.externalEvidence?.artifactRootKind !== 'T7_SECURE_SYNTHETIC_PHYSICAL_WORD_LAB') {
    add('RTK_V4_E06_EXTERNAL_EVIDENCE_KIND_INVALID', 'externalEvidence.artifactRootKind', 'External evidence kind must be T7 secure synthetic physical Word lab.');
  }
  if (!isHex64(receipt.externalEvidence?.externalReceiptSha256)) {
    add('RTK_V4_E06_EXTERNAL_RECEIPT_HASH_INVALID', 'externalEvidence.externalReceiptSha256', 'External physical receipt raw sha256 is required.');
  }
  if (!isSha256(receipt.externalEvidence?.externalReceiptDigest)) {
    add('RTK_V4_E06_EXTERNAL_RECEIPT_DIGEST_INVALID', 'externalEvidence.externalReceiptDigest', 'External physical receipt digest is required.');
  }
  if (receipt.externalEvidence?.externalFileAvailableAtReceiptCreation !== true) {
    add('RTK_V4_E06_EXTERNAL_FILE_NOT_PROVEN_LOCAL', 'externalEvidence.externalFileAvailableAtReceiptCreation', 'Receipt must record local external evidence availability at creation time.');
  }

  const totals = receipt.physicalTextTotals || {};
  if (totals.physicalRoundTrips !== 32 || totals.physicalOpenEditSaveCloseReopenPass !== 32) {
    add('RTK_V4_E06_PHYSICAL_ROUNDTRIPS_INVALID', 'physicalTextTotals', 'Expected 32 physical Word open/edit/save/reopen passes.');
  }
  if (totals.parserPass !== 31) {
    add('RTK_V4_E06_PARSER_PASS_INVALID', 'physicalTextTotals.parserPass', 'Expected 31 parser PASS rows and one hostile typed BLOCKED row.');
  }
  if (totals.falseExact !== 0 || totals.silentApply !== 0 || totals.wrongSceneRouting !== 0 || totals.replayFailure !== 0) {
    add('RTK_V4_E06_VETO_METRICS_INVALID', 'physicalTextTotals', 'All veto metrics must remain zero.');
  }
  if (totals.productNetworkRequests !== 0) {
    add('RTK_V4_E06_NETWORK_REQUESTS_INVALID', 'physicalTextTotals.productNetworkRequests', 'Product network requests must be zero.');
  }
  if (totals.exactAutomaticCandidates !== 0) {
    add('RTK_V4_E06_EXACT_OVERCLAIM', 'physicalTextTotals.exactAutomaticCandidates', 'E06 physical text corpus must not overclaim automatic exact authority without V4 SourceMap/YRTK2 carrier integration.');
  }

  const cases = Array.isArray(receipt.textCertificationCases) ? receipt.textCertificationCases : [];
  for (const caseId of REQUIRED_CASES) {
    if (!cases.some((item) => item.caseId === caseId)) {
      add('RTK_V4_E06_REQUIRED_CASE_MISSING', 'textCertificationCases', `Missing required physical text case ${caseId}.`);
    }
  }
  for (const item of cases) {
    if (item.caseId === 'WL2-031') {
      if (item.parserStatus !== 'BLOCKED') add('RTK_V4_E06_HOSTILE_NOT_BLOCKED', 'textCertificationCases.WL2-031', 'Hostile package case must be typed BLOCKED.');
    } else if (item.wordStatus !== 'PASS' || item.parserStatus !== 'PASS') {
      add('RTK_V4_E06_CASE_NOT_PASS', `textCertificationCases.${item.caseId}`, 'Physical text case must pass Word and parser gates.');
    }
    if (!isSha256(item.sourceDocxSha256) || !isSha256(item.returnedDocxSha256)) {
      add('RTK_V4_E06_CASE_DIGEST_INVALID', `textCertificationCases.${item.caseId}`, 'Source and returned DOCX digests are required.');
    }
  }
  if (!cases.some((item) => item.caseId === 'WL2-026' && item.returnedBytes > 100000)) {
    add('RTK_V4_E06_100K_SCALE_MISSING', 'textCertificationCases.WL2-026', '100k word scale evidence is missing.');
  }
  if (!cases.some((item) => item.caseId === 'WL2-027' && item.returnedBytes > 200000)) {
    add('RTK_V4_E06_250K_SCALE_MISSING', 'textCertificationCases.WL2-027', '250k word scale evidence is missing.');
  }
  if (!Array.isArray(receipt.typedLimitations) || receipt.typedLimitations.length < 3) {
    add('RTK_V4_E06_TYPED_LIMITATIONS_MISSING', 'typedLimitations', 'Typed limitations are required.');
  }
  if (receipt.runtimeClaims?.automaticApplyExpanded !== false || receipt.runtimeClaims?.writerAuthorityAdded !== false) {
    add('RTK_V4_E06_RUNTIME_SCOPE_OVERCLAIM', 'runtimeClaims', 'E06 must not add writer or automatic apply authority.');
  }

  if (input.requireExternal === true) {
    const externalPath = String(receipt.externalEvidence?.externalReceiptPath || '');
    if (!externalPath || !fs.existsSync(externalPath)) {
      add('RTK_V4_E06_EXTERNAL_RECEIPT_MISSING', 'externalEvidence.externalReceiptPath', 'External physical receipt is missing.');
    } else if (sha256File(externalPath) !== receipt.externalEvidence.externalReceiptSha256) {
      add('RTK_V4_E06_EXTERNAL_RECEIPT_HASH_MISMATCH', 'externalEvidence.externalReceiptSha256', 'External physical receipt hash does not match.');
    }
  }

  return {
    ok: issues.length === 0,
    status: issues.length === 0 ? 'PASS' : 'FAIL',
    issues,
    cases: cases.length,
    physicalRoundTrips: totals.physicalRoundTrips || 0,
  };
}

function parseArgs(argv) {
  return {
    json: argv.includes('--json'),
    requireExternal: argv.includes('--require-external'),
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const result = evaluateWordV4E06PhysicalTextCertification({ requireExternal: args.requireExternal });
  process.stdout.write(args.json ? `${JSON.stringify(result, null, 2)}\n` : `RTK_WORD_V4_E06_PHYSICAL_TEXT_CERTIFICATION=${result.status}\n`);
  process.exit(result.ok ? 0 : 1);
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  main();
}
