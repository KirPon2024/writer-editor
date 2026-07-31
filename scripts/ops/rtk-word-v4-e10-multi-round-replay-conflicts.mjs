#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const RECEIPT_PATH = path.join(REPO_ROOT, 'docs', 'OPS', 'RTK', 'WORD_SAFE_SEMANTIC_ROUNDTRIP_V4_E10_MULTI_ROUND_REPLAY_CONFLICTS_RECEIPT.json');
const REQUIRED_CASES = ['WL2-022', 'WL2-023', 'WL2-029', 'WL2-030', 'WL2-031'];

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

export function evaluateWordV4E10MultiRoundReplayConflicts(input = {}) {
  const receipt = input.receipt || readJson(RECEIPT_PATH);
  const issues = [];
  const add = (code, field, message) => issues.push(issue(code, field, message));

  if (receipt.schemaVersion !== 'yalken.rtk.word-safe-semantic-roundtrip-v4.e10-multi-round-replay-conflicts-receipt.v1') {
    add('RTK_V4_E10_SCHEMA_INVALID', 'schemaVersion', 'E10 receipt schema is invalid.');
  }
  if (receipt.stageId !== 'EXECUTION_10_MULTI_ROUND_REPLAY_STALE_CONFLICTS') {
    add('RTK_V4_E10_STAGE_INVALID', 'stageId', 'E10 stage id is invalid.');
  }
  if (receipt.status !== 'MULTI_ROUND_REPLAY_STALE_CONFLICTS_CERTIFIED_WITH_TYPED_LIMITATIONS') {
    add('RTK_V4_E10_STATUS_INVALID', 'status', 'E10 status must certify replay stale and conflict guards with typed limitations.');
  }
  if (receipt.wordProfile?.versionByBundle !== '16.111.2' || receipt.wordProfile?.versionByAppleScript !== '16.111.2') {
    add('RTK_V4_E10_WORD_VERSION_INVALID', 'wordProfile', 'E10 requires observed Word 16.111.2.');
  }
  if (receipt.externalEvidence?.artifactRootKind !== 'T7_SECURE_SYNTHETIC_PHYSICAL_WORD_LAB') {
    add('RTK_V4_E10_EXTERNAL_EVIDENCE_KIND_INVALID', 'externalEvidence.artifactRootKind', 'External evidence kind must be T7 secure synthetic physical Word lab.');
  }
  if (!isHex64(receipt.externalEvidence?.externalReceiptSha256) || !isSha256(receipt.externalEvidence?.externalReceiptDigest)) {
    add('RTK_V4_E10_EXTERNAL_EVIDENCE_HASH_INVALID', 'externalEvidence', 'External evidence hashes are required.');
  }

  const totals = receipt.multiRoundTotals || {};
  if (totals.physicalGuardCases !== 5 || totals.staleTamperedStrippedCases !== 1 || totals.replayIdempotenceCases !== 1) {
    add('RTK_V4_E10_TOTALS_INVALID', 'multiRoundTotals', 'Expected five physical guard cases including stale/tamper and replay idempotence.');
  }
  if (totals.noEditConservationCases !== 1 || totals.reExportNoEditOracleCases !== 1 || totals.hostilePackageBlockedCases !== 1) {
    add('RTK_V4_E10_ORACLE_TOTALS_INVALID', 'multiRoundTotals', 'Expected no-edit, re-export, and hostile package guard cases.');
  }
  if (totals.automaticReplayApplyCertified !== 0 || totals.divergentRoundAutoMergeCertified !== 0 || totals.destructiveConflictWriteAdded !== 0) {
    add('RTK_V4_E10_AUTHORITY_OVERCLAIM', 'multiRoundTotals', 'E10 must not certify automatic replay apply, divergent round auto-merge, or destructive conflict writes.');
  }

  const cases = Array.isArray(receipt.guardCertificationCases) ? receipt.guardCertificationCases : [];
  for (const caseId of REQUIRED_CASES) {
    if (!cases.some((item) => item.caseId === caseId)) {
      add('RTK_V4_E10_REQUIRED_CASE_MISSING', 'guardCertificationCases', `Missing required guard case ${caseId}.`);
    }
  }
  for (const item of cases) {
    if (item.wordStatus !== 'PASS') {
      add('RTK_V4_E10_CASE_WORD_NOT_PASS', `guardCertificationCases.${item.caseId}`, 'Guard case must pass physical Word gate.');
    }
    if (!['PASS', 'BLOCKED'].includes(item.parserStatus)) {
      add('RTK_V4_E10_CASE_PARSER_STATUS_INVALID', `guardCertificationCases.${item.caseId}`, 'Guard case parser status must be PASS or typed BLOCKED.');
    }
    if (!isSha256(item.sourceDocxSha256) || !isSha256(item.returnedDocxSha256)) {
      add('RTK_V4_E10_CASE_DIGEST_INVALID', `guardCertificationCases.${item.caseId}`, 'Source and returned DOCX digests are required.');
    }
    if (item.classificationAuthority !== 'MANUAL_OR_BLOCKED_ONLY') {
      add('RTK_V4_E10_CASE_AUTHORITY_OVERCLAIM', `guardCertificationCases.${item.caseId}`, 'Guard cases must remain manual or blocked only.');
    }
    if (item.exactAutomaticCandidateCount !== 0) {
      add('RTK_V4_E10_FALSE_EXACT_RISK', `guardCertificationCases.${item.caseId}`, 'Guard cases must not create exact automatic candidates.');
    }
  }

  const stale = cases.find((item) => item.caseId === 'WL2-022');
  const replay = cases.find((item) => item.caseId === 'WL2-023');
  const noEdit = cases.find((item) => item.caseId === 'WL2-029');
  const reExport = cases.find((item) => item.caseId === 'WL2-030');
  const hostile = cases.find((item) => item.caseId === 'WL2-031');
  if (!stale || stale.guardKinds.includes('staleBaselineBlocked') !== true || stale.guardKinds.includes('tamperedManifestBlocked') !== true || stale.guardKinds.includes('strippedLocatorBlocked') !== true) {
    add('RTK_V4_E10_STALE_TAMPER_GUARD_MISSING', 'guardCertificationCases.WL2-022', 'Stale, tampered, and stripped locator guards are required.');
  }
  if (!replay || replay.guardKinds.includes('repeatedImportIdempotent') !== true || replay.guardOutcome !== 'ALREADY_ANALYZED_OR_ALREADY_APPLIED_NOT_SECOND_MUTATION') {
    add('RTK_V4_E10_REPLAY_GUARD_MISSING', 'guardCertificationCases.WL2-023', 'Repeated import must be idempotent and never a second mutation.');
  }
  if (!noEdit || noEdit.guardKinds.includes('noEditConservationOracle') !== true || noEdit.reviewIrSummary.textRevisions !== 0) {
    add('RTK_V4_E10_NO_EDIT_ORACLE_MISSING', 'guardCertificationCases.WL2-029', 'No-edit conservation oracle must produce zero text revisions.');
  }
  if (!reExport || reExport.guardKinds.includes('reExportNoEditOracleBlockedWithoutSignedLocator') !== true) {
    add('RTK_V4_E10_REEXPORT_GUARD_MISSING', 'guardCertificationCases.WL2-030', 'Re-export no-edit oracle must stay blocked when signed locator authority drops.');
  }
  if (!hostile || hostile.parserStatus !== 'BLOCKED' || hostile.guardKinds.includes('hostilePackageBlocked') !== true) {
    add('RTK_V4_E10_HOSTILE_GUARD_MISSING', 'guardCertificationCases.WL2-031', 'Hostile active-content package must remain typed blocked.');
  }

  const limitations = Array.isArray(receipt.typedLimitations) ? receipt.typedLimitations : [];
  for (const required of ['REPLAY_SECOND_MUTATION_NOT_CERTIFIED_IN_E10', 'DIVERGENT_ROUND_AUTOMERGE_NOT_CERTIFIED_IN_E10', 'REEXPORT_APPLY_ORACLE_REMAINS_BLOCKED_WITHOUT_SIGNED_LOCATOR']) {
    if (!limitations.includes(required)) {
      add('RTK_V4_E10_TYPED_LIMITATION_MISSING', 'typedLimitations', `Missing ${required}.`);
    }
  }
  if (receipt.runtimeClaims?.automaticReplayApplyAdded !== false || receipt.runtimeClaims?.divergentRoundAutoMergeAdded !== false || receipt.runtimeClaims?.writerAuthorityAdded !== false || receipt.runtimeClaims?.productRuntimeChanged !== false) {
    add('RTK_V4_E10_RUNTIME_SCOPE_OVERCLAIM', 'runtimeClaims', 'E10 must not add replay apply, auto-merge, writer authority, or product runtime changes.');
  }
  const veto = receipt.vetoMetrics || {};
  if (veto.falseExact !== 0 || veto.wrongSceneRouting !== 0 || veto.silentApply !== 0 || veto.replayFailure !== 0 || veto.silentConflictWrite !== 0) {
    add('RTK_V4_E10_VETO_NONZERO', 'vetoMetrics', 'All E10 veto metrics must remain zero.');
  }

  if (input.requireExternal === true) {
    const externalPath = String(receipt.externalEvidence?.externalReceiptPath || '');
    if (!externalPath || !fs.existsSync(externalPath)) {
      add('RTK_V4_E10_EXTERNAL_RECEIPT_MISSING', 'externalEvidence.externalReceiptPath', 'External physical receipt is missing.');
    } else if (sha256File(externalPath) !== receipt.externalEvidence.externalReceiptSha256) {
      add('RTK_V4_E10_EXTERNAL_RECEIPT_HASH_MISMATCH', 'externalEvidence.externalReceiptSha256', 'External physical receipt hash does not match.');
    }
  }

  return {
    ok: issues.length === 0,
    status: issues.length === 0 ? 'PASS' : 'FAIL',
    issues,
    cases: cases.length,
    physicalGuardCases: totals.physicalGuardCases || 0,
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
  const result = evaluateWordV4E10MultiRoundReplayConflicts({ requireExternal: args.requireExternal });
  process.stdout.write(args.json ? `${JSON.stringify(result, null, 2)}\n` : `RTK_WORD_V4_E10_MULTI_ROUND_REPLAY_CONFLICTS=${result.status}\n`);
  process.exit(result.ok ? 0 : 1);
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  main();
}
