#!/usr/bin/env node
// R2.4 E0 — EvidenceStampV2 and ContourTerminalReceiptV2 compilers.
// Fail-closed evidence law: zero denominator, required-skip, arithmetic
// mismatch, unnamed identity, stale head shape and aggregate-only claims are
// typed refusals, never warnings.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readJsonBounded, R24Error, HEX40_RE, HEX64_RE } from './canonical-json.mjs';
import { assertValidJson } from './json-schema-lite.mjs';

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));
export const EVIDENCE_SCHEMA_PATH = path.join(MODULE_DIR, 'schemas', 'evidence-stamp-v2.schema.json');
export const TERMINAL_SCHEMA_PATH = path.join(MODULE_DIR, 'schemas', 'contour-terminal-receipt-v2.schema.json');

export const EVIDENCE_CLASSES = Object.freeze([
  'MODEL', 'CONTRACT', 'UNIT', 'INTEGRATION', 'FAULT_INJECTION', 'PHYSICAL',
  'IMPLEMENTATION_MUTANTS', 'INDEPENDENT_EXACT_HEAD', 'POSTMERGE', 'SURVIVOR_AUDIT', 'PACKAGE_INTEGRITY',
]);

const REQUIRED_WHEN_PASS = Object.freeze(['CONTRACT', 'INTEGRATION', 'UNIT', 'IMPLEMENTATION_MUTANTS', 'PHYSICAL', 'FAULT_INJECTION', 'INDEPENDENT_EXACT_HEAD', 'POSTMERGE', 'SURVIVOR_AUDIT']);

const requireName = (value, code) => {
  if (typeof value !== 'string' || value.trim().length === 0) throw new R24Error(code);
  return value;
};

export function assertEvidenceLaws(stamp) {
  if (!stamp || typeof stamp !== 'object') throw new R24Error('E_EVIDENCE_STAMP_SHAPE');
  requireName(stamp.stampId, 'E_EVIDENCE_UNNAMED');
  requireName(stamp.missionId, 'E_EVIDENCE_UNNAMED_MISSION');
  requireName(stamp.contourId, 'E_EVIDENCE_UNNAMED_CONTOUR');
  requireName(stamp.authorityEpoch, 'E_EVIDENCE_UNNAMED_EPOCH');
  if (!stamp.repo || !HEX40_RE.test(String(stamp.repo.headSha))) throw new R24Error('E_EVIDENCE_HEAD_SHAPE');
  if (!HEX40_RE.test(String(stamp.repo.treeSha))) throw new R24Error('E_EVIDENCE_TREE_SHAPE');
  if (!EVIDENCE_CLASSES.includes(stamp.test?.evidenceClass)) throw new R24Error('E_EVIDENCE_CLASS_UNKNOWN', String(stamp.test?.evidenceClass));
  const { denominator, passed, failed, skipped } = stamp.test;
  if (!Number.isInteger(denominator) || denominator < 1) throw new R24Error('E_ZERO_DENOMINATOR');
  for (const [name, value] of [['passed', passed], ['failed', failed], ['skipped', skipped]]) {
    if (!Number.isInteger(value) || value < 0) throw new R24Error('E_DENOMINATOR_ARITHMETIC', `${name}=${String(value)}`);
  }
  if (passed + failed + skipped !== denominator) {
    throw new R24Error('E_DENOMINATOR_ARITHMETIC', `${passed}+${failed}+${skipped} != ${denominator}`);
  }
  if (skipped > 0 && REQUIRED_WHEN_PASS.includes(stamp.test.evidenceClass)) throw new R24Error('E_SKIPPED_REQUIRED_EVIDENCE', `${skipped} skipped in ${stamp.test.evidenceClass}`);
  if (stamp.claim?.verdict === 'PASS' && (failed > 0 || skipped > 0 || passed !== denominator)) {
    throw new R24Error('E_PASS_BEYOND_EVIDENCE', `passed=${passed} failed=${failed} skipped=${skipped} denominator=${denominator}`);
  }
  if (stamp.claim?.verdict === 'PASS' && stamp.test.exitCode !== 0) throw new R24Error('E_PASS_WITH_NONZERO_EXIT');
  if (stamp.causal?.predecessorReceiptDigest !== null && !HEX64_RE.test(String(stamp.causal?.predecessorReceiptDigest))) {
    throw new R24Error('E_CAUSAL_DIGEST_SHAPE');
  }
  return true;
}

export function buildEvidenceStamp(input) {
  const stamp = structuredClone(input);
  stamp.schemaVersion = 'EvidenceStampV2';
  const schema = readJsonBounded(EVIDENCE_SCHEMA_PATH);
  assertValidJson(stamp, schema, 'E_EVIDENCE_STAMP_SCHEMA');
  assertEvidenceLaws(stamp);
  return stamp;
}

export function buildTerminalReceipt(input) {
  const receipt = structuredClone(input);
  receipt.schemaVersion = 'ContourTerminalReceiptV2';
  const schema = readJsonBounded(TERMINAL_SCHEMA_PATH);
  assertValidJson(receipt, schema, 'E_TERMINAL_RECEIPT_SCHEMA');
  if (!Array.isArray(receipt.evidenceStampIds) || receipt.evidenceStampIds.length === 0) {
    throw new R24Error('E_TERMINAL_RECEIPT_NO_EVIDENCE');
  }
  if (receipt.mergeState === 'MERGED' && receipt.postmergeState !== 'PASS') {
    throw new R24Error('E_TERMINAL_POSTMERGE_NOT_PASS', receipt.postmergeState);
  }
  if (receipt.mergeState === 'MERGED' && receipt.survivorState !== 'PASS') {
    throw new R24Error('E_TERMINAL_SURVIVOR_NOT_PASS', receipt.survivorState);
  }
  return receipt;
}
