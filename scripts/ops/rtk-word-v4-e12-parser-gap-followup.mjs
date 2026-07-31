#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const RECEIPT_PATH = path.join(REPO_ROOT, 'docs', 'OPS', 'RTK', 'WORD_SAFE_SEMANTIC_ROUNDTRIP_V4_E12_PARSER_GAP_FOLLOWUP_RECEIPT.json');
const WAVE300_PATH = path.join(REPO_ROOT, 'docs', 'OPS', 'RTK', 'WORD_SAFE_SEMANTIC_ROUNDTRIP_V4_E12_PHYSICAL_WAVE300_RECEIPT.json');
const REPEAT_PATH = path.join(REPO_ROOT, 'docs', 'OPS', 'RTK', 'WORD_SAFE_SEMANTIC_ROUNDTRIP_V4_E12_PHYSICAL_WAVE300_REPEAT_RECEIPT.json');

const SCHEMA = 'yalken.rtk.word-safe-semantic-roundtrip-v4.e12-parser-gap-followup-receipt.v1';
const STATUS = 'WORD_E12_WL2_031_HOSTILE_PACKAGE_TYPED_BLOCK_CONFIRMED_NOT_SATURATED';
const STAGE = 'EXECUTION_12_WORD_LIMITATION_FOLLOWUP_AFTER_STABLE_WAVES';
const NEXT_STAGE = 'EXECUTION_12_WORD_LIMITATION_FOLLOWUP_REMAINING_TYPED_LIMITATIONS';
const CASE_ID = 'WL2-031';

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function sha256File(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function isHex64(value) {
  return /^[0-9a-f]{64}$/u.test(String(value || ''));
}

function issue(code, field, message) {
  return { code, field, message };
}

function getCase(receipt, caseId) {
  return Array.isArray(receipt?.cases) ? receipt.cases.find((item) => item?.caseId === caseId) : null;
}

function hasExternalRelationship(caseRow) {
  const rels = Array.isArray(caseRow?.packageInventory?.relationships)
    ? caseRow.packageInventory.relationships
    : [];
  return rels.some((item) => String(item?.targetMode || '').toLowerCase() === 'external');
}

function verifyBinding(binding, expectedPath, issues, field, { requireFiles }) {
  if (!binding || binding.path !== expectedPath || !isHex64(binding.sha256)) {
    issues.push(issue('RTK_V4_E12_FOLLOWUP_BINDING_INVALID', field, 'Evidence binding path and SHA-256 are required.'));
    return null;
  }
  if (!requireFiles) return null;
  const absolutePath = path.isAbsolute(expectedPath) ? expectedPath : path.join(REPO_ROOT, expectedPath);
  if (!fs.existsSync(absolutePath)) {
    issues.push(issue('RTK_V4_E12_FOLLOWUP_BINDING_MISSING', field, 'Bound evidence file is missing.'));
    return null;
  }
  if (sha256File(absolutePath) !== binding.sha256) {
    issues.push(issue('RTK_V4_E12_FOLLOWUP_BINDING_SHA_MISMATCH', field, 'Bound evidence SHA-256 does not match current bytes.'));
  }
  return readJson(absolutePath);
}

function verifyCaseRow(row, issues, prefix) {
  if (!row) {
    issues.push(issue('RTK_V4_E12_FOLLOWUP_CASE_MISSING', prefix, 'WL2-031 case row is missing from bound physical evidence.'));
    return;
  }
  if (row.caseId !== CASE_ID) issues.push(issue('RTK_V4_E12_FOLLOWUP_CASE_ID_INVALID', `${prefix}.caseId`, 'Case id must be WL2-031.'));
  if (row.wordStatus !== 'PASS' || row.openEditSaveCloseReopen !== 'PASS') {
    issues.push(issue('RTK_V4_E12_FOLLOWUP_WORD_PHYSICAL_INVALID', prefix, 'WL2-031 must be a physical Word open/edit/save/close/reopen PASS.'));
  }
  if (row.parserStatus !== 'BLOCKED') {
    issues.push(issue('RTK_V4_E12_FOLLOWUP_HOSTILE_NOT_BLOCKED', `${prefix}.parserStatus`, 'WL2-031 hostile package must remain typed BLOCKED.'));
  }
  if (!Array.isArray(row.wordLimitations) || !row.wordLimitations.includes('POST_WORD_HOSTILE_PACKAGE_NEGATIVE')) {
    issues.push(issue('RTK_V4_E12_FOLLOWUP_LIMITATION_MISSING', `${prefix}.wordLimitations`, 'WL2-031 must carry POST_WORD_HOSTILE_PACKAGE_NEGATIVE.'));
  }
  if (row.packageZipOk !== true || Number(row.exactAutomaticCandidateCount || 0) !== 0) {
    issues.push(issue('RTK_V4_E12_FOLLOWUP_CASE_TOTALS_INVALID', prefix, 'WL2-031 must have valid ZIP inventory and zero exact automatic candidates.'));
  }
  if (!hasExternalRelationship(row)) {
    issues.push(issue('RTK_V4_E12_FOLLOWUP_EXTERNAL_REL_MISSING', `${prefix}.packageInventory.relationships`, 'WL2-031 must prove external relationship hostile input.'));
  }
  if (row.authority?.validSignedLocator !== false || row.authority?.allRelevantXmlSemanticsAccounted !== false) {
    issues.push(issue('RTK_V4_E12_FOLLOWUP_AUTHORITY_OVERCLAIM', `${prefix}.authority`, 'WL2-031 must not retain signed locator authority or semantic PASS authority.'));
  }
}

export function evaluateWordV4E12ParserGapFollowup(input = {}) {
  const receipt = input.receipt || readJson(RECEIPT_PATH);
  const issues = [];
  const add = (code, field, message) => issues.push(issue(code, field, message));

  if (receipt.schemaVersion !== SCHEMA) add('RTK_V4_E12_FOLLOWUP_SCHEMA_INVALID', 'schemaVersion', 'Parser gap followup schema is invalid.');
  if (receipt.stageId !== STAGE) add('RTK_V4_E12_FOLLOWUP_STAGE_INVALID', 'stageId', 'Parser gap followup stage is invalid.');
  if (receipt.status !== STATUS) add('RTK_V4_E12_FOLLOWUP_STATUS_INVALID', 'status', 'Parser gap followup must confirm WL2-031 typed block without saturation.');

  const wave300 = verifyBinding(
    receipt.boundEvidence?.wave300,
    'docs/OPS/RTK/WORD_SAFE_SEMANTIC_ROUNDTRIP_V4_E12_PHYSICAL_WAVE300_RECEIPT.json',
    issues,
    'boundEvidence.wave300',
    { requireFiles: input.requireFiles === true },
  );
  const repeatWrapper = verifyBinding(
    receipt.boundEvidence?.wave300RepeatWrapper,
    'docs/OPS/RTK/WORD_SAFE_SEMANTIC_ROUNDTRIP_V4_E12_PHYSICAL_WAVE300_REPEAT_RECEIPT.json',
    issues,
    'boundEvidence.wave300RepeatWrapper',
    { requireFiles: input.requireFiles === true },
  );
  const repeatExternalPath = String(receipt.boundEvidence?.wave300RepeatExternal?.path || '');
  const repeatExternal = verifyBinding(
    receipt.boundEvidence?.wave300RepeatExternal,
    repeatExternalPath,
    issues,
    'boundEvidence.wave300RepeatExternal',
    { requireFiles: input.requireFiles === true },
  );

  const assessment = receipt.caseAssessment || {};
  if (assessment.caseId !== CASE_ID) add('RTK_V4_E12_FOLLOWUP_CASE_INVALID', 'caseAssessment.caseId', 'Followup must assess WL2-031.');
  if (assessment.reclassification !== 'HOSTILE_PACKAGE_TYPED_BLOCK_NOT_PARSER_GAP') {
    add('RTK_V4_E12_FOLLOWUP_RECLASSIFICATION_INVALID', 'caseAssessment.reclassification', 'WL2-031 must be reclassified as typed hostile package block, not parser gap.');
  }
  if (assessment.parserPassExpected !== false || assessment.parserBlockedExpected !== true || assessment.exactAutomaticCandidateAllowed !== false) {
    add('RTK_V4_E12_FOLLOWUP_EXPECTATION_INVALID', 'caseAssessment', 'Followup must preserve BLOCKED expectation and zero exact authority.');
  }
  if (assessment.externalRelationshipDetected !== true || assessment.hostilePackageBlockedBeforePreviewOrApply !== true) {
    add('RTK_V4_E12_FOLLOWUP_HOSTILE_PROOF_INVALID', 'caseAssessment', 'Followup must bind external relationship and block before preview/apply.');
  }

  if (input.requireFiles === true) {
    verifyCaseRow(getCase(wave300, CASE_ID), issues, 'wave300.cases.WL2-031');
    verifyCaseRow(getCase(repeatExternal, CASE_ID), issues, 'wave300RepeatExternal.cases.WL2-031');
    if (repeatWrapper?.externalEvidence?.sha256 !== receipt.boundEvidence?.wave300RepeatExternal?.sha256) {
      add('RTK_V4_E12_FOLLOWUP_REPEAT_EXTERNAL_SHA_UNBOUND', 'boundEvidence.wave300RepeatExternal.sha256', 'Repeat wrapper must bind the same external physical receipt SHA.');
    }
  }

  const resolved = new Set(Array.isArray(receipt.resolvedLimitations) ? receipt.resolvedLimitations : []);
  if (!resolved.has('WAVE300_SINGLE_PARSER_GAP_REQUIRES_CASE_LEVEL_FOLLOWUP')) {
    add('RTK_V4_E12_FOLLOWUP_RESOLVED_LIMITATION_MISSING', 'resolvedLimitations', 'Original wave300 parser gap limitation must be explicitly resolved.');
  }
  if (!resolved.has('WAVE300_WL2_031_HOSTILE_PACKAGE_TYPED_BLOCK_CONFIRMED')) {
    add('RTK_V4_E12_FOLLOWUP_TYPED_BLOCK_RESOLUTION_MISSING', 'resolvedLimitations', 'WL2-031 typed hostile block resolution must be explicit.');
  }

  const remaining = new Set(Array.isArray(receipt.remainingLimitations) ? receipt.remainingLimitations : []);
  for (const id of [
    'MODERN_REPLY_RESOLVE_REOPEN_STILL_TYPED_LIMITATION',
    'CUSTOM_XML_MUTATING_WORD_SAVE_DROPS_AUTHORITY',
    'AUTOMATIC_MULTI_SCENE_APPLY_NOT_PHYSICAL_WORD_CERTIFIED',
  ]) {
    if (!remaining.has(id)) add('RTK_V4_E12_FOLLOWUP_REMAINING_LIMITATION_MISSING', `remainingLimitations.${id}`, 'Remaining Word limitation must stay active.');
  }
  if (remaining.has('WAVE300_SINGLE_PARSER_GAP_REQUIRES_CASE_LEVEL_FOLLOWUP')) {
    add('RTK_V4_E12_FOLLOWUP_OLD_GAP_STILL_ACTIVE', 'remainingLimitations', 'Old parser gap cannot remain active after case-level followup.');
  }

  const decision = receipt.saturationDecision || {};
  if (decision.wordSaturated !== false
    || decision.wordSaturationClaimAllowed !== false
    || decision.googleDocsAllowedToOpen !== false
    || decision.nextStage !== NEXT_STAGE) {
    add('RTK_V4_E12_FOLLOWUP_FALSE_SATURATION_OR_SEQUENCE', 'saturationDecision', 'Followup must keep Word not saturated and Google closed.');
  }
  const veto = receipt.vetoMetrics || {};
  for (const [key, value] of Object.entries(veto)) {
    if (Number(value) !== 0) add('RTK_V4_E12_FOLLOWUP_VETO_NONZERO', `vetoMetrics.${key}`, 'All followup veto metrics must be zero.');
  }
  if (receipt.runtimeClaims?.productRuntimeChanged !== false
    || receipt.runtimeClaims?.automaticApplyExpanded !== false
    || receipt.runtimeClaims?.writerAuthorityAdded !== false
    || receipt.runtimeClaims?.googleDocsOpened !== false) {
    add('RTK_V4_E12_FOLLOWUP_RUNTIME_OVERCLAIM', 'runtimeClaims', 'Followup cannot mutate runtime authority or open Google Docs.');
  }

  return {
    ok: issues.length === 0,
    status: issues.length === 0 ? 'PASS' : 'FAIL',
    issues,
    caseId: assessment.caseId || '',
    reclassification: assessment.reclassification || '',
    saturated: decision.wordSaturated === true,
    nextStage: decision.nextStage || '',
  };
}

function main() {
  const json = process.argv.includes('--json');
  const result = evaluateWordV4E12ParserGapFollowup({ requireFiles: process.argv.includes('--require-files') });
  process.stdout.write(json ? `${JSON.stringify(result, null, 2)}\n` : `RTK_WORD_V4_E12_PARSER_GAP_FOLLOWUP=${result.status}\n`);
  process.exit(result.ok ? 0 : 1);
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  main();
}
