#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const RECEIPT_PATH = path.join(REPO_ROOT, 'docs', 'OPS', 'RTK', 'WORD_SAFE_SEMANTIC_ROUNDTRIP_V4_E07_COMMENTS_REPLIES_STATES_RECEIPT.json');
const REQUIRED_COMMENT_CASES = ['WL2-012', 'WL2-013', 'WL2-014', 'WL2-015', 'WL2-016', 'WL2-017', 'WL2-023', 'WL2-028'];
const REQUIRED_VISIBLE_CASES = ['WL2-012', 'WL2-013', 'WL2-014', 'WL2-016', 'WL2-017', 'WL2-028'];
const REQUIRED_BLOCKED_CASES = ['WL2-015', 'WL2-023'];

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

export function evaluateWordV4E07CommentsRepliesStates(input = {}) {
  const receipt = input.receipt || readJson(RECEIPT_PATH);
  const issues = [];
  const add = (code, field, message) => issues.push(issue(code, field, message));

  if (receipt.schemaVersion !== 'yalken.rtk.word-safe-semantic-roundtrip-v4.e07-comments-replies-states-receipt.v1') {
    add('RTK_V4_E07_SCHEMA_INVALID', 'schemaVersion', 'E07 receipt schema is invalid.');
  }
  if (receipt.stageId !== 'EXECUTION_07_COMMENTS_REPLIES_STATES') {
    add('RTK_V4_E07_STAGE_INVALID', 'stageId', 'E07 stage id is invalid.');
  }
  if (receipt.status !== 'COMMENT_SHADOW_ANALYSIS_CERTIFIED_WITH_TYPED_LIMITATIONS') {
    add('RTK_V4_E07_STATUS_INVALID', 'status', 'E07 status must be comment shadow analysis with typed limitations.');
  }
  if (receipt.wordProfile?.versionByBundle !== '16.111.2' || receipt.wordProfile?.versionByAppleScript !== '16.111.2') {
    add('RTK_V4_E07_WORD_VERSION_INVALID', 'wordProfile', 'E07 requires observed Word 16.111.2.');
  }
  if (receipt.externalEvidence?.artifactRootKind !== 'T7_SECURE_SYNTHETIC_PHYSICAL_WORD_LAB') {
    add('RTK_V4_E07_EXTERNAL_EVIDENCE_KIND_INVALID', 'externalEvidence.artifactRootKind', 'External evidence kind must be T7 secure synthetic physical Word lab.');
  }
  if (!isHex64(receipt.externalEvidence?.externalReceiptSha256) || !isSha256(receipt.externalEvidence?.externalReceiptDigest)) {
    add('RTK_V4_E07_EXTERNAL_EVIDENCE_HASH_INVALID', 'externalEvidence', 'External evidence hashes are required.');
  }

  const totals = receipt.commentTotals || {};
  if (totals.declaredCommentCases !== 8 || totals.visibleAndParsedCommentCases !== 6) {
    add('RTK_V4_E07_COMMENT_TOTALS_INVALID', 'commentTotals', 'Expected 8 declared comment cases and 6 visible parsed cases.');
  }
  if (totals.visibleAnchoredThreads !== 91 || totals.unsupportedBlockedThreads !== 2) {
    add('RTK_V4_E07_COMMENT_THREAD_TOTALS_INVALID', 'commentTotals', 'Expected 91 visible anchored threads and 2 unsupported blocked threads.');
  }
  if (totals.replyThreadsCertified !== 0 || totals.resolveReopenCertified !== 0 || totals.deleteCertified !== 0) {
    add('RTK_V4_E07_UNSUPPORTED_OVERCLAIM', 'commentTotals', 'Replies resolve reopen and delete must not be certified by E07.');
  }
  if (totals.silentCommentLoss !== 0 || totals.noOpCommentPassClaimed !== 0) {
    add('RTK_V4_E07_COMMENT_VETO_INVALID', 'commentTotals', 'Silent comment loss and no-op comment PASS claims must stay zero.');
  }

  const cases = Array.isArray(receipt.commentCertificationCases) ? receipt.commentCertificationCases : [];
  for (const caseId of REQUIRED_COMMENT_CASES) {
    if (!cases.some((item) => item.caseId === caseId)) {
      add('RTK_V4_E07_REQUIRED_CASE_MISSING', 'commentCertificationCases', `Missing required comment case ${caseId}.`);
    }
  }
  for (const caseId of REQUIRED_VISIBLE_CASES) {
    const item = cases.find((candidate) => candidate.caseId === caseId);
    if (!item || item.commentPass !== true || item.commentGraphCapability?.commentPassAllowed !== true) {
      add('RTK_V4_E07_VISIBLE_CASE_NOT_CERTIFIED', `commentCertificationCases.${caseId}`, 'Visible anchored comment case must be certified.');
    }
    if (item && item.commentGraphCapability?.physicalWordReopenVisibility !== true) {
      add('RTK_V4_E07_REOPEN_VISIBILITY_MISSING', `commentCertificationCases.${caseId}`, 'Visible comment case must prove Word reopen visibility.');
    }
  }
  for (const caseId of REQUIRED_BLOCKED_CASES) {
    const item = cases.find((candidate) => candidate.caseId === caseId);
    if (!item || item.commentPass !== false || item.commentGraphCapability?.commentPassAllowed !== false) {
      add('RTK_V4_E07_BLOCKED_CASE_OVERCLAIM', `commentCertificationCases.${caseId}`, 'Unsupported comment state case must stay blocked.');
    }
  }
  for (const item of cases) {
    if (item.wordStatus !== 'PASS' || item.parserStatus !== 'PASS') {
      add('RTK_V4_E07_CASE_NOT_PASS', `commentCertificationCases.${item.caseId}`, 'Comment case must pass Word and parser gates.');
    }
    if (!isSha256(item.sourceDocxSha256) || !isSha256(item.returnedDocxSha256)) {
      add('RTK_V4_E07_CASE_DIGEST_INVALID', `commentCertificationCases.${item.caseId}`, 'Source and returned DOCX digests are required.');
    }
  }
  const highDensity = cases.find((item) => item.caseId === 'WL2-028');
  if (!highDensity || highDensity.wordCommentCount !== 80 || highDensity.commentGraphCapability?.threadCount !== 80) {
    add('RTK_V4_E07_HIGH_DENSITY_MISSING', 'commentCertificationCases.WL2-028', 'High comment density physical evidence is missing.');
  }
  if (!Array.isArray(receipt.typedLimitations) || !receipt.typedLimitations.includes('MODERN_REPLY_UI_NOT_AVAILABLE_IN_APPLESCRIPT_DICTIONARY_PROBE') || !receipt.typedLimitations.includes('COMMENT_RESOLVE_REOPEN_APPLESCRIPT_UNSUPPORTED')) {
    add('RTK_V4_E07_TYPED_LIMITATIONS_MISSING', 'typedLimitations', 'Reply and resolve/reopen typed limitations are required.');
  }
  if (receipt.runtimeClaims?.reviewSessionMutationAdded !== false || receipt.runtimeClaims?.writerAuthorityAdded !== false || receipt.runtimeClaims?.automaticApplyExpanded !== false) {
    add('RTK_V4_E07_RUNTIME_SCOPE_OVERCLAIM', 'runtimeClaims', 'E07 must not add review session mutation, writer authority, or automatic apply authority.');
  }

  if (input.requireExternal === true) {
    const externalPath = String(receipt.externalEvidence?.externalReceiptPath || '');
    if (!externalPath || !fs.existsSync(externalPath)) {
      add('RTK_V4_E07_EXTERNAL_RECEIPT_MISSING', 'externalEvidence.externalReceiptPath', 'External physical receipt is missing.');
    } else if (sha256File(externalPath) !== receipt.externalEvidence.externalReceiptSha256) {
      add('RTK_V4_E07_EXTERNAL_RECEIPT_HASH_MISMATCH', 'externalEvidence.externalReceiptSha256', 'External physical receipt hash does not match.');
    }
  }

  return {
    ok: issues.length === 0,
    status: issues.length === 0 ? 'PASS' : 'FAIL',
    issues,
    cases: cases.length,
    visibleAnchoredThreads: totals.visibleAnchoredThreads || 0,
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
  const result = evaluateWordV4E07CommentsRepliesStates({ requireExternal: args.requireExternal });
  process.stdout.write(args.json ? `${JSON.stringify(result, null, 2)}\n` : `RTK_WORD_V4_E07_COMMENTS_REPLIES_STATES=${result.status}\n`);
  process.exit(result.ok ? 0 : 1);
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  main();
}
