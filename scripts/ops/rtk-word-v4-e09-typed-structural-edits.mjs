#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const RECEIPT_PATH = path.join(REPO_ROOT, 'docs', 'OPS', 'RTK', 'WORD_SAFE_SEMANTIC_ROUNDTRIP_V4_E09_TYPED_STRUCTURAL_EDITS_RECEIPT.json');
const REQUIRED_CASES = ['WL2-005', 'WL2-006', 'WL2-007', 'WL2-008', 'WL2-020', 'WL2-024', 'WL2-025'];

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

export function evaluateWordV4E09TypedStructuralEdits(input = {}) {
  const receipt = input.receipt || readJson(RECEIPT_PATH);
  const issues = [];
  const add = (code, field, message) => issues.push(issue(code, field, message));

  if (receipt.schemaVersion !== 'yalken.rtk.word-safe-semantic-roundtrip-v4.e09-typed-structural-edits-receipt.v1') {
    add('RTK_V4_E09_SCHEMA_INVALID', 'schemaVersion', 'E09 receipt schema is invalid.');
  }
  if (receipt.stageId !== 'EXECUTION_09_TYPED_STRUCTURAL_EDITS') {
    add('RTK_V4_E09_STAGE_INVALID', 'stageId', 'E09 stage id is invalid.');
  }
  if (receipt.status !== 'STRUCTURAL_DIAGNOSTIC_BLOCKING_CERTIFIED_WITH_TYPED_LIMITATIONS') {
    add('RTK_V4_E09_STATUS_INVALID', 'status', 'E09 status must be structural diagnostic blocking with typed limitations.');
  }
  if (receipt.wordProfile?.versionByBundle !== '16.111.2' || receipt.wordProfile?.versionByAppleScript !== '16.111.2') {
    add('RTK_V4_E09_WORD_VERSION_INVALID', 'wordProfile', 'E09 requires observed Word 16.111.2.');
  }
  if (receipt.externalEvidence?.artifactRootKind !== 'T7_SECURE_SYNTHETIC_PHYSICAL_WORD_LAB') {
    add('RTK_V4_E09_EXTERNAL_EVIDENCE_KIND_INVALID', 'externalEvidence.artifactRootKind', 'External evidence kind must be T7 secure synthetic physical Word lab.');
  }
  if (!isHex64(receipt.externalEvidence?.externalReceiptSha256) || !isSha256(receipt.externalEvidence?.externalReceiptDigest)) {
    add('RTK_V4_E09_EXTERNAL_EVIDENCE_HASH_INVALID', 'externalEvidence', 'External evidence hashes are required.');
  }

  const totals = receipt.structuralTotals || {};
  if (totals.physicalStructuralCases !== 30 || totals.totalStructureChanges !== 31) {
    add('RTK_V4_E09_TOTALS_INVALID', 'structuralTotals', 'Expected 30 physical structural cases and 31 structure changes.');
  }
  if (totals.nativeMoveRevisionCases !== 0 || totals.nativeMoveRevisions !== 0) {
    add('RTK_V4_E09_NATIVE_MOVE_OVERCLAIM', 'structuralTotals', 'E09 corpus did not certify native moveFrom/moveTo revisions.');
  }
  if (totals.automaticStructuralApplyCertified !== 0 || totals.destructiveStructuralApplyAdded !== 0) {
    add('RTK_V4_E09_STRUCTURAL_APPLY_OVERCLAIM', 'structuralTotals', 'E09 must not certify automatic or destructive structural apply.');
  }

  const cases = Array.isArray(receipt.structuralCertificationCases) ? receipt.structuralCertificationCases : [];
  for (const caseId of REQUIRED_CASES) {
    if (!cases.some((item) => item.caseId === caseId)) {
      add('RTK_V4_E09_REQUIRED_CASE_MISSING', 'structuralCertificationCases', `Missing required structural case ${caseId}.`);
    }
  }
  for (const item of cases) {
    if (item.wordStatus !== 'PASS' || item.parserStatus !== 'PASS') {
      add('RTK_V4_E09_CASE_NOT_PASS', `structuralCertificationCases.${item.caseId}`, 'Structural case must pass Word and parser gates.');
    }
    if ((item.reviewIrSummary?.structureChanges || 0) < 1) {
      add('RTK_V4_E09_CASE_WITHOUT_STRUCTURE', `structuralCertificationCases.${item.caseId}`, 'Structural case must contain structure changes.');
    }
    if (item.classificationAuthority !== 'MANUAL_OR_BLOCKED_ONLY') {
      add('RTK_V4_E09_CASE_AUTHORITY_OVERCLAIM', `structuralCertificationCases.${item.caseId}`, 'Structural cases must remain manual or blocked only.');
    }
    if (!isSha256(item.sourceDocxSha256) || !isSha256(item.returnedDocxSha256)) {
      add('RTK_V4_E09_CASE_DIGEST_INVALID', `structuralCertificationCases.${item.caseId}`, 'Source and returned DOCX digests are required.');
    }
  }

  const tableBoundary = cases.find((item) => item.caseId === 'WL2-020');
  if (!tableBoundary || tableBoundary.reviewIrSummary.structureChanges !== 2 || !tableBoundary.structuralKinds.includes('tableSectionFootnoteEndnoteFieldBoundary')) {
    add('RTK_V4_E09_COMPLEX_BOUNDARY_MISSING', 'structuralCertificationCases.WL2-020', 'Complex structural boundary evidence is missing.');
  }
  const moveAttempt = cases.find((item) => item.caseId === 'WL2-007');
  const crossScene = cases.find((item) => item.caseId === 'WL2-008');
  if (!moveAttempt || !moveAttempt.structuralKinds.includes('moveAttemptManualOnly')) {
    add('RTK_V4_E09_MOVE_ATTEMPT_LIMIT_MISSING', 'structuralCertificationCases.WL2-007', 'Move attempt must remain typed manual only.');
  }
  if (!crossScene || !crossScene.structuralKinds.includes('crossSceneMoveBlocked')) {
    add('RTK_V4_E09_CROSS_SCENE_BLOCK_MISSING', 'structuralCertificationCases.WL2-008', 'Cross-scene move attempt must remain blocked.');
  }
  if (!Array.isArray(receipt.typedLimitations) || !receipt.typedLimitations.includes('STRUCTURAL_APPLY_NOT_CERTIFIED_IN_E09')) {
    add('RTK_V4_E09_TYPED_LIMITATIONS_MISSING', 'typedLimitations', 'Structural apply typed limitation is required.');
  }
  if (!receipt.typedLimitations.includes('NATIVE_MOVEFROM_MOVETO_NOT_OBSERVED_IN_E09')) {
    add('RTK_V4_E09_NATIVE_MOVE_LIMITATION_MISSING', 'typedLimitations', 'Native moveFrom/moveTo limitation is required.');
  }
  if (receipt.runtimeClaims?.automaticStructuralApplyAdded !== false || receipt.runtimeClaims?.writerAuthorityAdded !== false || receipt.runtimeClaims?.productRuntimeChanged !== false) {
    add('RTK_V4_E09_RUNTIME_SCOPE_OVERCLAIM', 'runtimeClaims', 'E09 must not add runtime structural apply or writer authority.');
  }

  if (input.requireExternal === true) {
    const externalPath = String(receipt.externalEvidence?.externalReceiptPath || '');
    if (!externalPath || !fs.existsSync(externalPath)) {
      add('RTK_V4_E09_EXTERNAL_RECEIPT_MISSING', 'externalEvidence.externalReceiptPath', 'External physical receipt is missing.');
    } else if (sha256File(externalPath) !== receipt.externalEvidence.externalReceiptSha256) {
      add('RTK_V4_E09_EXTERNAL_RECEIPT_HASH_MISMATCH', 'externalEvidence.externalReceiptSha256', 'External physical receipt hash does not match.');
    }
  }

  return {
    ok: issues.length === 0,
    status: issues.length === 0 ? 'PASS' : 'FAIL',
    issues,
    cases: cases.length,
    totalStructureChanges: totals.totalStructureChanges || 0,
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
  const result = evaluateWordV4E09TypedStructuralEdits({ requireExternal: args.requireExternal });
  process.stdout.write(args.json ? `${JSON.stringify(result, null, 2)}\n` : `RTK_WORD_V4_E09_TYPED_STRUCTURAL_EDITS=${result.status}\n`);
  process.exit(result.ok ? 0 : 1);
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  main();
}
