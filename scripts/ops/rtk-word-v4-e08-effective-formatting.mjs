#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const RECEIPT_PATH = path.join(REPO_ROOT, 'docs', 'OPS', 'RTK', 'WORD_SAFE_SEMANTIC_ROUNDTRIP_V4_E08_EFFECTIVE_FORMATTING_RECEIPT.json');
const REQUIRED_CASES = ['WL2-018', 'WL2-019', 'WL2-021', 'WL2-026', 'WL2-030'];

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

export function evaluateWordV4E08EffectiveFormatting(input = {}) {
  const receipt = input.receipt || readJson(RECEIPT_PATH);
  const issues = [];
  const add = (code, field, message) => issues.push(issue(code, field, message));

  if (receipt.schemaVersion !== 'yalken.rtk.word-safe-semantic-roundtrip-v4.e08-effective-formatting-receipt.v1') {
    add('RTK_V4_E08_SCHEMA_INVALID', 'schemaVersion', 'E08 receipt schema is invalid.');
  }
  if (receipt.stageId !== 'EXECUTION_08_EFFECTIVE_FORMATTING') {
    add('RTK_V4_E08_STAGE_INVALID', 'stageId', 'E08 stage id is invalid.');
  }
  if (receipt.status !== 'FORMATTING_DIAGNOSTIC_LANE_CERTIFIED_WITH_TYPED_LIMITATIONS') {
    add('RTK_V4_E08_STATUS_INVALID', 'status', 'E08 status must be formatting diagnostic lane with typed limitations.');
  }
  if (receipt.wordProfile?.versionByBundle !== '16.111.2' || receipt.wordProfile?.versionByAppleScript !== '16.111.2') {
    add('RTK_V4_E08_WORD_VERSION_INVALID', 'wordProfile', 'E08 requires observed Word 16.111.2.');
  }
  if (receipt.externalEvidence?.artifactRootKind !== 'T7_SECURE_SYNTHETIC_PHYSICAL_WORD_LAB') {
    add('RTK_V4_E08_EXTERNAL_EVIDENCE_KIND_INVALID', 'externalEvidence.artifactRootKind', 'External evidence kind must be T7 secure synthetic physical Word lab.');
  }
  if (!isHex64(receipt.externalEvidence?.externalReceiptSha256) || !isSha256(receipt.externalEvidence?.externalReceiptDigest)) {
    add('RTK_V4_E08_EXTERNAL_EVIDENCE_HASH_INVALID', 'externalEvidence', 'External evidence hashes are required.');
  }

  const totals = receipt.formattingTotals || {};
  if (totals.physicalFormattingCases !== 17 || totals.totalFormattingDeltas !== 117) {
    add('RTK_V4_E08_TOTALS_INVALID', 'formattingTotals', 'Expected 17 physical formatting cases and 117 formatting deltas.');
  }
  if (totals.writerFormattingCases !== 11 || totals.writerFormattingDeltas !== 26 || totals.commentAnchorFormattingDeltas !== 91) {
    add('RTK_V4_E08_LANE_TOTALS_INVALID', 'formattingTotals', 'Writer and comment-anchor formatting lane totals are invalid.');
  }
  if (totals.automaticFormattingApplyCertified !== 0 || totals.destructiveFormattingApplyAdded !== 0) {
    add('RTK_V4_E08_FORMATTING_APPLY_OVERCLAIM', 'formattingTotals', 'E08 must not certify automatic or destructive formatting apply.');
  }

  const cases = Array.isArray(receipt.formattingCertificationCases) ? receipt.formattingCertificationCases : [];
  for (const caseId of REQUIRED_CASES) {
    if (!cases.some((item) => item.caseId === caseId)) {
      add('RTK_V4_E08_REQUIRED_CASE_MISSING', 'formattingCertificationCases', `Missing required formatting case ${caseId}.`);
    }
  }
  for (const item of cases) {
    if (item.wordStatus !== 'PASS' || item.parserStatus !== 'PASS') {
      add('RTK_V4_E08_CASE_NOT_PASS', `formattingCertificationCases.${item.caseId}`, 'Formatting case must pass Word and parser gates.');
    }
    if ((item.reviewIrSummary?.formattingDeltas || 0) < 1) {
      add('RTK_V4_E08_CASE_WITHOUT_FORMATTING', `formattingCertificationCases.${item.caseId}`, 'Formatting case must contain formatting deltas.');
    }
    if (!isSha256(item.sourceDocxSha256) || !isSha256(item.returnedDocxSha256)) {
      add('RTK_V4_E08_CASE_DIGEST_INVALID', `formattingCertificationCases.${item.caseId}`, 'Source and returned DOCX digests are required.');
    }
  }
  const inline = cases.find((item) => item.caseId === 'WL2-018');
  if (!inline || inline.reviewIrSummary.formattingDeltas !== 4 || !inline.provenKinds.includes('rPr')) {
    add('RTK_V4_E08_INLINE_FORMATTING_MISSING', 'formattingCertificationCases.WL2-018', 'Inline rPr formatting evidence is missing.');
  }
  const styles = cases.find((item) => item.caseId === 'WL2-019');
  if (!styles || !styles.provenKinds.includes('pPr') || !styles.provenKinds.includes('hyperlink') || !styles.limitations.includes('STYLE_LIST_HYPERLINK_SEMANTICS_SEE_PACKAGE_READBACK_MANUAL')) {
    add('RTK_V4_E08_STYLE_HYPERLINK_LIMITATION_MISSING', 'formattingCertificationCases.WL2-019', 'Styles/lists/hyperlinks must remain manual readback with typed limitation.');
  }
  if (!Array.isArray(receipt.typedLimitations) || !receipt.typedLimitations.includes('FORMAT_APPLY_NOT_CERTIFIED_IN_E08')) {
    add('RTK_V4_E08_TYPED_LIMITATIONS_MISSING', 'typedLimitations', 'Formatting apply typed limitation is required.');
  }
  if (receipt.runtimeClaims?.automaticFormattingApplyAdded !== false || receipt.runtimeClaims?.writerAuthorityAdded !== false || receipt.runtimeClaims?.productRuntimeChanged !== false) {
    add('RTK_V4_E08_RUNTIME_SCOPE_OVERCLAIM', 'runtimeClaims', 'E08 must not add runtime formatting apply or writer authority.');
  }

  if (input.requireExternal === true) {
    const externalPath = String(receipt.externalEvidence?.externalReceiptPath || '');
    if (!externalPath || !fs.existsSync(externalPath)) {
      add('RTK_V4_E08_EXTERNAL_RECEIPT_MISSING', 'externalEvidence.externalReceiptPath', 'External physical receipt is missing.');
    } else if (sha256File(externalPath) !== receipt.externalEvidence.externalReceiptSha256) {
      add('RTK_V4_E08_EXTERNAL_RECEIPT_HASH_MISMATCH', 'externalEvidence.externalReceiptSha256', 'External physical receipt hash does not match.');
    }
  }

  return {
    ok: issues.length === 0,
    status: issues.length === 0 ? 'PASS' : 'FAIL',
    issues,
    cases: cases.length,
    totalFormattingDeltas: totals.totalFormattingDeltas || 0,
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
  const result = evaluateWordV4E08EffectiveFormatting({ requireExternal: args.requireExternal });
  process.stdout.write(args.json ? `${JSON.stringify(result, null, 2)}\n` : `RTK_WORD_V4_E08_EFFECTIVE_FORMATTING=${result.status}\n`);
  process.exit(result.ok ? 0 : 1);
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  main();
}
