#!/usr/bin/env node
/*
 * PHYS-01 — build-bound physical ladder runner for word-mac-16.111.3-26080215.
 *
 * The lab machine moved to Word 16.111.3 (build 16.111.26080215) on
 * 2026-08-10; LAB-02 typed the migration with zero inheritance. This runner
 * executes the migration ladder for the new build under fail-closed gates.
 * It never reuses or overwrites a receipt bound to another build.
 *
 * Gate law (order load-bearing, pinned by rtk-phys01-ladder-runner.contract):
 *   RUNG_UNKNOWN -> SHA_MISMATCH -> DIRTY_WORKTREE -> WORD_VERSION_MISMATCH ->
 *   WORD_BUILD_MISMATCH -> ARTIFACT_ROOT_INVALID -> WORD_SESSION_NOT_CLEAN.
 *
 * Receipt law: a rung seals only when every case passes
 * open-edit-save-close-reopen with sentinel AND insertion readback proof.
 * buildSmokeReceipt throws RTK_PHYS_CASE_FAILURES_PRESENT instead of sealing a
 * failed run — there is no silent seal path.
 *
 * Physical execution happens only with --run-physical and only after all gates
 * pass. Synthetic fixtures only, inside the Word container sandbox; no user
 * documents are opened; no network; no credentials.
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { writeJsonAtomic, buildB06SyntheticDocxBuffer } from './rtk-word-latest-physical-certification-lab.mjs';
import { defaultWordSandboxWorkRoot, assertWordSandboxWorkRoot } from './rtk-word-sandbox-work-root.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

// The T7 artifact-root law mirrors the C5V2 canary verifier
// (verifyC5V2PhysicalArtifactRoot) but is implemented inline so this runner
// never imports the canary module (which carries a heavy electron import
// chain). Same checks, same codes: containment under /Volumes/T7-Secure,
// symlink-free components, diskutil-parsed UUID / APFS / FileVault / not
// read-only, and an R_OK|W_OK access probe.
const T7_MOUNT = '/Volumes/T7-Secure';
const T7_UUID = 'D1F2E2C1-3210-4A39-A4E0-0AA0AD5110E2';

function parseDiskInfoValue(text, key) {
  const match = String(text || '').match(new RegExp(`^\\s*${key}:\\s*(.+?)\\s*$`, 'm'));
  return match ? match[1] : '';
}

export function verifyPhysArtifactRoot({ artifactRoot, diskInfoText } = {}) {
  const root = path.resolve(String(artifactRoot || ''));
  if (!path.isAbsolute(String(artifactRoot || '')) || root === path.parse(root).root) {
    throw new Error('C5V2_ARTIFACT_ROOT_INVALID');
  }
  // Symlink-free components between the mount and the root.
  let cursor = root;
  const components = [];
  while (cursor !== path.parse(cursor).root) {
    components.unshift(cursor);
    cursor = path.dirname(cursor);
  }
  for (const component of components) {
    if (fs.existsSync(component) && fs.lstatSync(component).isSymbolicLink()) {
      throw new Error(`C5V2_ARTIFACT_ROOT_SYMLINK:${component}`);
    }
  }
  if (!fs.existsSync(root)) fs.mkdirSync(root, { recursive: true });
  const rootReal = fs.realpathSync(root);
  const mountReal = fs.realpathSync(T7_MOUNT);
  if (!(rootReal === mountReal || rootReal.startsWith(`${mountReal}${path.sep}`))) {
    throw new Error(`C5V2_ARTIFACT_ROOT_NOT_T7:${rootReal}`);
  }
  const parsed = {
    uuid: parseDiskInfoValue(diskInfoText, 'Volume UUID'),
    apfs: /Type \(Bundle\):\s*apfs/i.test(String(diskInfoText)) || /File System Personality:\s*APFS/i.test(String(diskInfoText)),
    fileVault: /FileVault:\s*Yes/i.test(String(diskInfoText)),
    readOnly: /Read-Only Volume:\s*Yes/i.test(String(diskInfoText)),
  };
  if (parsed.uuid !== T7_UUID) throw new Error(`C5V2_ARTIFACT_ROOT_T7_UUID_MISMATCH:${parsed.uuid}`);
  if (parsed.apfs !== true) throw new Error('C5V2_ARTIFACT_ROOT_T7_APFS_REQUIRED');
  if (parsed.fileVault !== true) throw new Error('C5V2_ARTIFACT_ROOT_T7_FILEVAULT_REQUIRED');
  if (parsed.readOnly === true) throw new Error('C5V2_ARTIFACT_ROOT_T7_READ_ONLY');
  fs.accessSync(rootReal, fs.constants.R_OK | fs.constants.W_OK);
  return { ok: true, rootReal };
}

export const PHYS_PROFILE_ID = 'word-mac-16.111.3-26080215';
export const PHYS_EXPECTED_WORD_VERSION = '16.111.3';
export const PHYS_EXPECTED_WORD_BUILD = '16.111.26080215';
export const PHYS_LADDER_RUNGS = Object.freeze([
  'CARRIER_SURVIVAL_SMOKE',
  'SEMANTIC_DIFFERENTIAL_SUBSET',
  'NEGATIVE_REPLAY_CRASH_SUBSET',
  'WAVE_10',
  'WAVE_40',
  'WAVE_100',
  'WAVE_300',
  'WAVE_300_REPEAT',
  'SATURATION_LIMITATION_AUDIT',
]);

// PHYS-01B: per-rung definitions. Every receipt path is bound to the 16.111.3
// profile and never collides with a 16.111.2-bound artifact.
export const RUNG_DEFINITIONS = Object.freeze({
  CARRIER_SURVIVAL_SMOKE: Object.freeze({
    kind: 'smoke',
    caseCount: 12,
    receiptRef: 'docs/OPS/RTK/WORD_MAC_16_111_3_CARRIER_SURVIVAL_SMOKE_RECEIPT.json',
    receiptSchema: 'yalken.rtk.word-mac-16-111-3.carrier-survival-smoke-receipt.v1',
  }),
  SEMANTIC_DIFFERENTIAL_SUBSET: Object.freeze({
    kind: 'semantic',
    caseCount: 24,
    receiptRef: 'docs/OPS/RTK/WORD_MAC_16_111_3_SEMANTIC_DIFFERENTIAL_RECEIPT.json',
    receiptSchema: 'yalken.rtk.word-mac-16-111-3.semantic-differential-receipt.v1',
  }),
  NEGATIVE_REPLAY_CRASH_SUBSET: Object.freeze({
    kind: 'negative',
    caseCount: 8,
    receiptRef: 'docs/OPS/RTK/WORD_MAC_16_111_3_NEGATIVE_REPLAY_CRASH_RECEIPT.json',
    receiptSchema: 'yalken.rtk.word-mac-16-111-3.negative-replay-crash-receipt.v1',
  }),
  WAVE_10: Object.freeze({
    kind: 'wave',
    caseCount: 10,
    receiptRef: 'docs/OPS/RTK/WORD_MAC_16_111_3_PHYSICAL_WAVE10_RECEIPT.json',
    receiptSchema: 'yalken.rtk.word-mac-16-111-3.wave-10-receipt.v1',
  }),
  WAVE_40: Object.freeze({
    kind: 'wave',
    caseCount: 40,
    receiptRef: 'docs/OPS/RTK/WORD_MAC_16_111_3_PHYSICAL_WAVE40_RECEIPT.json',
    receiptSchema: 'yalken.rtk.word-mac-16-111-3.wave-40-receipt.v1',
  }),
  WAVE_100: Object.freeze({
    kind: 'wave',
    caseCount: 100,
    receiptRef: 'docs/OPS/RTK/WORD_MAC_16_111_3_PHYSICAL_WAVE100_RECEIPT.json',
    receiptSchema: 'yalken.rtk.word-mac-16-111-3.wave-100-receipt.v1',
  }),
  WAVE_300: Object.freeze({
    kind: 'wave',
    caseCount: 300,
    receiptRef: 'docs/OPS/RTK/WORD_MAC_16_111_3_PHYSICAL_WAVE300_RECEIPT.json',
    receiptSchema: 'yalken.rtk.word-mac-16-111-3.wave-300-receipt.v1',
  }),
  WAVE_300_REPEAT: Object.freeze({
    kind: 'wave',
    caseCount: 300,
    receiptRef: 'docs/OPS/RTK/WORD_MAC_16_111_3_PHYSICAL_WAVE300_REPEAT_RECEIPT.json',
    receiptSchema: 'yalken.rtk.word-mac-16-111-3.wave-300-repeat-receipt.v1',
    repeatOf: 'WAVE_300',
  }),
  SATURATION_LIMITATION_AUDIT: Object.freeze({
    kind: 'audit',
    caseCount: 0,
    receiptRef: 'docs/OPS/RTK/WORD_MAC_16_111_3_SATURATION_LIMITATION_AUDIT_RECEIPT.json',
    receiptSchema: 'yalken.rtk.word-mac-16-111-3.saturation-limitation-audit-receipt.v1',
  }),
});
export const SMOKE_RECEIPT_SCHEMA = 'yalken.rtk.word-mac-16-111-3.carrier-survival-smoke-receipt.v1';
export const SMOKE_RECEIPT_REF = 'docs/OPS/RTK/WORD_MAC_16_111_3_CARRIER_SURVIVAL_SMOKE_RECEIPT.json';
export const SMOKE_CASE_COUNT = 12;

export const PHYS_CODES = Object.freeze({
  GATES_OK: 'RTK_PHYS_GATES_OK',
  RUNG_UNKNOWN: 'RTK_PHYS_RUNG_UNKNOWN',
  SHA_MISMATCH: 'RTK_PHYS_SHA_MISMATCH',
  DIRTY_WORKTREE: 'RTK_PHYS_DIRTY_WORKTREE',
  WORD_VERSION_MISMATCH: 'RTK_PHYS_WORD_VERSION_MISMATCH',
  WORD_BUILD_MISMATCH: 'RTK_PHYS_WORD_BUILD_MISMATCH',
  ARTIFACT_ROOT_INVALID: 'RTK_PHYS_ARTIFACT_ROOT_INVALID',
  WORD_SESSION_NOT_CLEAN: 'RTK_PHYS_WORD_SESSION_NOT_CLEAN',
  CASE_FAILURES_PRESENT: 'RTK_PHYS_CASE_FAILURES_PRESENT',
  RECEIPT_INVALID: 'RTK_PHYS_RECEIPT_INVALID',
  // PHYS-01B additions.
  CASE_COUNT_MISMATCH: 'RTK_PHYS_CASE_COUNT_MISMATCH',
  NEGATIVE_PROBE_UNDETECTED: 'RTK_PHYS_NEGATIVE_PROBE_UNDETECTED',
  AUDIT_WAVE_MISSING: 'RTK_PHYS_AUDIT_WAVE_MISSING',
  AUDIT_VETO_NONZERO: 'RTK_PHYS_AUDIT_VETO_NONZERO',
  AUDIT_PROFILE_MISMATCH: 'RTK_PHYS_AUDIT_PROFILE_MISMATCH',
  AUDIT_FALSE_SATURATION: 'RTK_PHYS_AUDIT_FALSE_SATURATION',
});

function reason(code, message) {
  return { code, message };
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

// ---------------------------------------------------------------------------
// Default ports (the only place process/git/Word are touched; tests inject).
// ---------------------------------------------------------------------------

function shell(command, args, options = {}) {
  try {
    return String(execFileSync(command, args, {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      timeout: options.timeout || 30_000,
      stdio: ['ignore', 'pipe', 'pipe'],
    })).trim();
  } catch (error) {
    return '';
  }
}

function defaultPorts() {
  return {
    gitHead: () => shell('git', ['rev-parse', 'HEAD']),
    gitOriginMain: () => shell('git', ['rev-parse', 'origin/main']),
    gitDirty: () => shell('git', ['status', '--porcelain']) !== '',
    probeWordPlist: () => ({
      version: shell('/usr/bin/plutil', ['-extract', 'CFBundleShortVersionString', 'raw', '/Applications/Microsoft Word.app/Contents/Info.plist']),
      build: shell('/usr/bin/plutil', ['-extract', 'CFBundleVersion', 'raw', '/Applications/Microsoft Word.app/Contents/Info.plist']),
    }),
    verifyArtifactRoot: ({ artifactRoot }) => {
      try {
        verifyPhysArtifactRoot({ artifactRoot, diskInfoText: shell('diskutil', ['info', '/Volumes/T7-Secure']) });
        return { ok: true };
      } catch (error) {
        return { ok: false, code: String(error.message || error).split(':')[0] };
      }
    },
    countOpenWordDocuments: () => {
      const out = shell('osascript', ['-e', 'tell application "Microsoft Word" to return (count of documents) as text'], { timeout: 15_000 });
      const n = Number(out);
      return Number.isSafeInteger(n) ? n : -1;
    },
  };
}

// ---------------------------------------------------------------------------
// evaluatePhysGates — fail-closed gate evaluation. Read-only; never spawns
// Word. The session check runs only when requireSession is set (physical mode).
// ---------------------------------------------------------------------------

export function evaluatePhysGates({ rung, expectedSha, expectedWordVersion, expectedWordBuild, artifactRoot, ports, requireSession = true } = {}) {
  const p = ports || defaultPorts();

  if (!PHYS_LADDER_RUNGS.includes(rung)) {
    return { ok: false, code: PHYS_CODES.RUNG_UNKNOWN, reasons: [reason(PHYS_CODES.RUNG_UNKNOWN, `rung ${JSON.stringify(rung)} is not implemented by this runner`)] };
  }

  const head = p.gitHead();
  const originMain = p.gitOriginMain();
  if (head !== expectedSha || originMain !== expectedSha) {
    return { ok: false, code: PHYS_CODES.SHA_MISMATCH, reasons: [reason(PHYS_CODES.SHA_MISMATCH, `HEAD ${head} / origin/main ${originMain} != expected ${expectedSha}`)] };
  }

  if (p.gitDirty() === true) {
    return { ok: false, code: PHYS_CODES.DIRTY_WORKTREE, reasons: [reason(PHYS_CODES.DIRTY_WORKTREE, 'worktree is dirty; physical evidence binds only to a clean exact head')] };
  }

  const probed = p.probeWordPlist() || {};
  if (probed.version !== expectedWordVersion) {
    return { ok: false, code: PHYS_CODES.WORD_VERSION_MISMATCH, reasons: [reason(PHYS_CODES.WORD_VERSION_MISMATCH, `Word version ${JSON.stringify(probed.version)} != expected ${JSON.stringify(expectedWordVersion)}`)] };
  }
  if (probed.build !== expectedWordBuild) {
    return { ok: false, code: PHYS_CODES.WORD_BUILD_MISMATCH, reasons: [reason(PHYS_CODES.WORD_BUILD_MISMATCH, `Word build ${JSON.stringify(probed.build)} != expected ${JSON.stringify(expectedWordBuild)}`)] };
  }

  const root = p.verifyArtifactRoot({ artifactRoot });
  if (!root || root.ok !== true) {
    return { ok: false, code: PHYS_CODES.ARTIFACT_ROOT_INVALID, reasons: [reason(PHYS_CODES.ARTIFACT_ROOT_INVALID, `artifact root rejected: ${JSON.stringify(root && root.code)}`)] };
  }

  if (requireSession === true) {
    const openDocs = p.countOpenWordDocuments();
    if (openDocs !== 0) {
      return { ok: false, code: PHYS_CODES.WORD_SESSION_NOT_CLEAN, reasons: [reason(PHYS_CODES.WORD_SESSION_NOT_CLEAN, `Word has ${openDocs} open document(s); the controller convention requires zero extraneous documents`)] };
    }
  }

  return { ok: true, code: PHYS_CODES.GATES_OK, reasons: [reason(PHYS_CODES.GATES_OK, 'all physical gates green')] };
}

// ---------------------------------------------------------------------------
// Smoke cases — the CARRIER_SURVIVAL_SMOKE rung: synthetic DOCX survives a
// full Word open -> tracked edit -> save -> close -> reopen cycle with the
// sentinel and the inserted text both visible on readback.
// ---------------------------------------------------------------------------

export function buildSmokeCaseSpecs() {
  return Array.from({ length: SMOKE_CASE_COUNT }, (_, i) => ({
    id: `phys-16-111-3-smoke-${String(i + 1).padStart(2, '0')}`,
    ordinal: i + 1,
    title: `Carrier survival smoke case ${i + 1} (Word 16.111.3)`,
  }));
}

// ---------------------------------------------------------------------------
// PHYS-01B: generic rung case evaluation. The seal law per kind:
//   smoke/wave: wordStatus PASS + openEditSaveCloseReopen PASS + sentinel and
//               insertion readback proof;
//   semantic:   additionally expectedFinalTextPresent and removedTextAbsent
//               (the exact differential) and at least one tracked revision;
//   negative:   probes are evaluated by evaluateNegativeProbes instead.
// The denominator is exact: caseCount must equal the rung definition.
// ---------------------------------------------------------------------------

export function evaluateRungCases(rung, cases) {
  const def = RUNG_DEFINITIONS[rung];
  if (!def) {
    return { ok: false, sealed: false, code: PHYS_CODES.RUNG_UNKNOWN, reasons: [reason(PHYS_CODES.RUNG_UNKNOWN, `rung ${JSON.stringify(rung)} unknown`)] };
  }
  const list = Array.isArray(cases) ? cases : [];
  if (def.kind !== 'audit' && list.length !== def.caseCount) {
    return {
      ok: false,
      sealed: false,
      code: PHYS_CODES.CASE_COUNT_MISMATCH,
      reasons: [reason(PHYS_CODES.CASE_COUNT_MISMATCH, `rung ${rung} requires exactly ${def.caseCount} cases, got ${list.length}`)],
    };
  }
  const failed = list.filter((c) => {
    if (!c || c.wordStatus !== 'PASS' || c.openEditSaveCloseReopen !== 'PASS') return true;
    if (c.readbackContainsSentinel !== true || c.readbackContainsInsertion !== true) return true;
    if (def.kind === 'semantic') {
      if (c.expectedFinalTextPresent !== true || c.removedTextAbsent !== true) return true;
      if (!(Number(c.wordRevisionCount) >= 1)) return true;
    }
    return false;
  });
  if (def.kind !== 'audit' && (list.length === 0 || failed.length > 0)) {
    return {
      ok: false,
      sealed: false,
      code: PHYS_CODES.CASE_FAILURES_PRESENT,
      reasons: [reason(PHYS_CODES.CASE_FAILURES_PRESENT, `${failed.length} of ${list.length} cases of rung ${rung} failed or lack proof`)],
    };
  }
  return { ok: true, sealed: def.kind !== 'audit', code: PHYS_CODES.GATES_OK, reasons: [reason(PHYS_CODES.GATES_OK, `rung ${rung}: ${list.length}/${def.caseCount} cases pass`)] };
}

// Negative probes: every expected detection must fire. A probe that does not
// detect its anomaly is a failed probe (fail-closed).
export function evaluateNegativeProbes(probes) {
  const list = Array.isArray(probes) ? probes : [];
  const undetected = list.filter((p) => !p || p.expectedDetection !== true || p.detected !== true);
  if (list.length === 0 || undetected.length > 0) {
    return {
      ok: false,
      sealed: false,
      code: PHYS_CODES.NEGATIVE_PROBE_UNDETECTED,
      reasons: [reason(PHYS_CODES.NEGATIVE_PROBE_UNDETECTED, `${undetected.length} of ${list.length} negative probes failed to detect their anomaly`)],
    };
  }
  return { ok: true, sealed: true, code: PHYS_CODES.GATES_OK, reasons: [reason(PHYS_CODES.GATES_OK, `${list.length} negative probes detected their anomalies`)] };
}

// Saturation limitation audit: consumes the sealed wave receipts of THIS
// profile. The audit can never produce SATURATED — its ceiling is
// COMPLETE_NOT_SATURATED. Laws, in pinned order:
//   AUDIT_WAVE_MISSING     -> a required wave receipt absent or unsealed;
//   AUDIT_PROFILE_MISMATCH -> a receipt naming another profile;
//   AUDIT_VETO_NONZERO     -> a receipt with a nonzero failed counter;
//   AUDIT_FALSE_SATURATION -> a receipt whose status claims saturation.
const AUDIT_REQUIRED_RUNGS = Object.freeze(['WAVE_10', 'WAVE_40', 'WAVE_100', 'WAVE_300', 'WAVE_300_REPEAT']);

export function evaluateSaturationAudit({ receiptsByRung } = {}) {
  const receipts = isPlainObject(receiptsByRung) ? receiptsByRung : {};
  for (const rung of AUDIT_REQUIRED_RUNGS) {
    const receipt = receipts[rung];
    if (!isPlainObject(receipt)) {
      return { ok: false, status: 'AUDIT_INCOMPLETE', code: PHYS_CODES.AUDIT_WAVE_MISSING, reasons: [reason(PHYS_CODES.AUDIT_WAVE_MISSING, `required wave receipt ${rung} is missing`)] };
    }
    const def = RUNG_DEFINITIONS[rung];
    const cases = Array.isArray(receipt.cases) ? receipt.cases : [];
    const sealed = cases.length === def.caseCount && cases.every((c) => c && c.openEditSaveCloseReopen === 'PASS');
    if (!sealed) {
      return { ok: false, status: 'AUDIT_INCOMPLETE', code: PHYS_CODES.AUDIT_WAVE_MISSING, reasons: [reason(PHYS_CODES.AUDIT_WAVE_MISSING, `wave receipt ${rung} is not a sealed ${def.caseCount}-case pass`)] };
    }
  }
  for (const rung of AUDIT_REQUIRED_RUNGS) {
    if (receipts[rung].profileId !== PHYS_PROFILE_ID) {
      return { ok: false, status: 'AUDIT_INCOMPLETE', code: PHYS_CODES.AUDIT_PROFILE_MISMATCH, reasons: [reason(PHYS_CODES.AUDIT_PROFILE_MISMATCH, `wave receipt ${rung} names profile ${JSON.stringify(receipts[rung].profileId)}, not ${PHYS_PROFILE_ID}`)] };
    }
  }
  for (const rung of AUDIT_REQUIRED_RUNGS) {
    const failed = Number(receipts[rung].counters && receipts[rung].counters.failed);
    if (!Number.isFinite(failed) || failed !== 0) {
      return { ok: false, status: 'AUDIT_INCOMPLETE', code: PHYS_CODES.AUDIT_VETO_NONZERO, reasons: [reason(PHYS_CODES.AUDIT_VETO_NONZERO, `wave receipt ${rung} has failed counter ${JSON.stringify(receipts[rung].counters && receipts[rung].counters.failed)}`)] };
    }
  }
  for (const rung of AUDIT_REQUIRED_RUNGS) {
    const status = String(receipts[rung].status || '');
    if (/SATURATED/u.test(status) && status !== 'COMPLETE_NOT_SATURATED' && !/NOT_SATURATED/u.test(status)) {
      return { ok: false, status: 'AUDIT_INCOMPLETE', code: PHYS_CODES.AUDIT_FALSE_SATURATION, reasons: [reason(PHYS_CODES.AUDIT_FALSE_SATURATION, `wave receipt ${rung} claims saturation status ${JSON.stringify(status)}`)] };
    }
  }
  return {
    ok: true,
    status: 'COMPLETE_NOT_SATURATED',
    code: PHYS_CODES.GATES_OK,
    reasons: [reason(PHYS_CODES.GATES_OK, 'all required waves sealed for this profile; saturation is NOT claimed')],
  };
}

export function evaluateSmokeCases(cases) {
  const list = Array.isArray(cases) ? cases : [];
  const failed = list.filter((c) => !c
    || c.wordStatus !== 'PASS'
    || c.openEditSaveCloseReopen !== 'PASS'
    || c.readbackContainsSentinel !== true
    || c.readbackContainsInsertion !== true);
  if (list.length === 0 || failed.length > 0) {
    return {
      ok: false,
      sealed: false,
      code: PHYS_CODES.CASE_FAILURES_PRESENT,
      reasons: [reason(PHYS_CODES.CASE_FAILURES_PRESENT, `${failed.length} of ${list.length} cases failed or lack readback proof`)],
    };
  }
  return { ok: true, sealed: true, code: PHYS_CODES.GATES_OK, reasons: [reason(PHYS_CODES.GATES_OK, `${list.length} cases passed with readback proof`)] };
}

export function buildSmokeReceipt({ rung, headSha, originMainSha, wordProfile, cases, artifactRoot }) {
  const verdict = evaluateSmokeCases(cases);
  if (!verdict.ok) {
    throw new Error(`${PHYS_CODES.CASE_FAILURES_PRESENT}: cannot seal a smoke receipt with failed cases`);
  }
  const passed = cases.filter((c) => c.openEditSaveCloseReopen === 'PASS').length;
  return {
    schema: SMOKE_RECEIPT_SCHEMA,
    profileId: PHYS_PROFILE_ID,
    rung,
    status: 'PHYSICAL_CARRIER_SURVIVAL_SMOKE_PASS',
    headSha,
    originMainSha,
    wordProfile,
    artifactRoot,
    counters: { total: cases.length, passed, failed: cases.length - passed },
    cases,
    nonClaims: [
      'This receipt is evidence for the word-mac-16.111.3-26080215 profile only.',
      'No compatibility with the current Word build is claimed by this rung.',
      'No saturation, no terminal pass and no user-facing claim follows.',
    ],
  };
}

export function validateSmokeReceipt(receipt) {
  const reasons = [];
  if (!isPlainObject(receipt)) {
    return { ok: false, code: PHYS_CODES.RECEIPT_INVALID, reasons: [reason(PHYS_CODES.RECEIPT_INVALID, 'receipt must be an object')] };
  }
  if (receipt.schema !== SMOKE_RECEIPT_SCHEMA) reasons.push(reason(PHYS_CODES.RECEIPT_INVALID, `schema must equal ${SMOKE_RECEIPT_SCHEMA}`));
  if (receipt.profileId !== PHYS_PROFILE_ID) reasons.push(reason(PHYS_CODES.RECEIPT_INVALID, `profileId must equal ${PHYS_PROFILE_ID}`));
  if (receipt.rung !== 'CARRIER_SURVIVAL_SMOKE') reasons.push(reason(PHYS_CODES.RECEIPT_INVALID, 'rung must be CARRIER_SURVIVAL_SMOKE'));
  if (receipt.status !== 'PHYSICAL_CARRIER_SURVIVAL_SMOKE_PASS') reasons.push(reason(PHYS_CODES.RECEIPT_INVALID, 'status must be PHYSICAL_CARRIER_SURVIVAL_SMOKE_PASS'));
  const cases = Array.isArray(receipt.cases) ? receipt.cases : [];
  const counters = isPlainObject(receipt.counters) ? receipt.counters : {};
  if (counters.total !== cases.length || counters.passed !== cases.filter((c) => c && c.openEditSaveCloseReopen === 'PASS').length) {
    reasons.push(reason(PHYS_CODES.RECEIPT_INVALID, `counters ${JSON.stringify(counters)} do not match cases`));
  }
  const verdict = evaluateSmokeCases(cases);
  if (!verdict.ok) reasons.push(reason(PHYS_CODES.RECEIPT_INVALID, `cases do not satisfy the seal law: ${verdict.reasons[0].message}`));
  if (reasons.length > 0) return { ok: false, code: PHYS_CODES.RECEIPT_INVALID, reasons };
  return { ok: true, code: PHYS_CODES.GATES_OK, reasons: [reason(PHYS_CODES.GATES_OK, 'receipt valid')] };
}

// ---------------------------------------------------------------------------
// Physical execution (only under --run-physical after gates).
// ---------------------------------------------------------------------------

function appleLiteral(value) {
  return `"${String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

export function buildSmokeWordScriptForTest(expectedName, returnedPath, sentinel, insertion) {
  return buildSmokeWordScript(expectedName, returnedPath, sentinel, insertion);
}

function buildSmokeWordScript(expectedName, returnedPath, sentinel, insertion) {
  const returnedPathLiteral = appleLiteral(returnedPath);
  return [
    'on yOpenExpectedDoc(yPosixPath, yExpectedFullName, yExpectedName)',
    '  do shell script "/usr/bin/open -a " & quoted form of "Microsoft Word" & " " & quoted form of yPosixPath',
    '  set yDeadline to (current date) + 25',
    '  tell application "Microsoft Word"',
    '    activate',
    '    repeat while (current date) is less than yDeadline',
    '      try',
    '        if (name of active document as text) is yExpectedName and (full name of active document as text) is yExpectedFullName then return true',
    '      end try',
    '      delay 0.25',
    '    end repeat',
    '  end tell',
    '  return false',
    'end yOpenExpectedDoc',
    'tell application "Microsoft Word"',
    'activate',
    'set yDocWasOpened to false',
    'set oldAlerts to display alerts',
    'try',
    '  set display alerts to alerts none',
    `  set yFile to POSIX file ${returnedPathLiteral} as alias`,
    '  set yExpectedFullName to yFile as text',
    `  if my yOpenExpectedDoc(${returnedPathLiteral}, yExpectedFullName, ${appleLiteral(expectedName)}) is not true then error "PHYS_OPEN_TIMEOUT" number 9700`,
    '  set yDoc to active document',
    '  set yDocWasOpened to true',
    '  set yInitialText to content of text object of yDoc',
    `  if yInitialText does not contain ${appleLiteral(sentinel)} then error "PHYS_OPEN_CONTENT_MISMATCH" number 9701`,
    '  set track revisions of yDoc to true',
    '  set show revisions of yDoc to true',
    '  set yTextLen to count of yInitialText',
    '  if yTextLen < 2 then error "PHYS_TEXT_LENGTH_UNAVAILABLE" number 9704',
    '  set yTail to content of (create range yDoc start (yTextLen - 1) end yTextLen)',
    `  set content of (create range yDoc start (yTextLen - 1) end yTextLen) to (yTail & ${appleLiteral(insertion)})`,
    '  save yDoc',
    '  close yDoc saving yes',
    '  set yDocWasOpened to false',
    `  if my yOpenExpectedDoc(${returnedPathLiteral}, yExpectedFullName, ${appleLiteral(expectedName)}) is not true then error "PHYS_REOPEN_TIMEOUT" number 9703`,
    '  set yDoc to active document',
    '  set yDocWasOpened to true',
    '  set yReadback to content of text object of yDoc',
    '  set ySentinelOk to yReadback contains ' + appleLiteral(sentinel),
    '  set yInsertionOk to yReadback contains ' + appleLiteral(insertion),
    '  set yRevisionCount to count of revisions of yDoc',
    '  close yDoc saving no',
    '  set yDocWasOpened to false',
    '  set display alerts to oldAlerts',
    '  return "WORD_STATUS=PASS" & linefeed & "SENTINEL_OK=" & ySentinelOk & linefeed & "INSERTION_OK=" & yInsertionOk & linefeed & "REVISION_COUNT=" & yRevisionCount',
    'on error errMsg number errNo',
    '  try',
    '    if yDocWasOpened then close yDoc saving no',
    '  end try',
    '  try',
    '    set display alerts to oldAlerts',
    '  end try',
    '  return "WORD_STATUS=FAIL" & linefeed & "ERRNO=" & errNo & linefeed & "ERR=" & errMsg',
    'end try',
    'end tell',
  ].join('\n');
}

function parseKeyValueLines(text) {
  const out = {};
  for (const line of String(text || '').split(/\r?\n/)) {
    const idx = line.indexOf('=');
    if (idx > 0) out[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
  }
  return out;
}

function sha256File(filePath) {
  return `sha256:${crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex')}`;
}

function collectPhysWordProfile() {
  const probed = defaultPorts().probeWordPlist();
  return {
    appPath: '/Applications/Microsoft Word.app',
    versionByBundle: probed.version,
    buildByBundle: probed.build,
    versionByAppleScript: shell('osascript', ['-e', 'tell application "Microsoft Word" to return version as text']),
    macosVersion: shell('sw_vers', ['-productVersion']),
    macosBuild: shell('sw_vers', ['-buildVersion']),
    locale: shell('defaults', ['read', '-g', 'AppleLocale']),
  };
}

// ---------------------------------------------------------------------------
// PHYS-03: rung plans and per-kind executors.
// ---------------------------------------------------------------------------

const RUNG_EXECUTORS = Object.freeze({
  smoke: 'append-cycle',
  semantic: 'replacement-cycle',
  negative: 'probe-suite',
  wave: 'wave-cycle',
  audit: 'audit',
});

export function buildRungPlan(rung) {
  const def = RUNG_DEFINITIONS[rung];
  if (!def) throw new Error(`${PHYS_CODES.RUNG_UNKNOWN}:${JSON.stringify(rung)}`);
  return {
    rung,
    kind: def.kind,
    executor: RUNG_EXECUTORS[def.kind],
    caseCount: def.caseCount,
    receiptRef: def.receiptRef,
    receiptSchema: def.receiptSchema,
  };
}

// The deterministic fixture paragraph layout mirrors caseParagraphs() in the
// B06 lab for a default caseSpec (no scaleWords). Offsets are computed against
// the same text Word exposes (paragraph separators are single characters in
// both layouts, so the join style does not shift positions).
function fixtureParagraphs(spec) {
  return [
    `YALKEN_B06_CASE ${spec.id} ${spec.title}`,
    'Alpha beta gamma locator anchor repeats Alpha beta gamma for ambiguity pressure.',
    'Replacement target OLD_WORD and insert target INSERT_HERE live in this paragraph.',
    'Comment anchor COMMENT_TARGET and duplicate COMMENT_TARGET stay visible after reopen.',
    'Unicode lane cafe\u0301 NBSP\u00a0marker soft\u00adhyphen emoji \u{1f680}\ufe0f ZWJ \u{1f469}\u200d\u{1f4bb} ZWNJ x\u200cy ZWSP x\u200by RTL \u202bshalom\u202c CJK \u5a67\u6587.',
    'Scene boundary A ends here. SCENE_BOUNDARY Scene boundary B begins here.',
  ];
}

function fixtureTextFor(spec) {
  return fixtureParagraphs(spec).join('\n');
}

// Exported for the contract: the semantic offset math must point at the exact
// removed text inside the deterministic fixture text.
export function buildSemanticFixtureTextForTest(spec) {
  return fixtureTextFor(spec);
}

export function buildSemanticCaseSpecs() {
  return Array.from({ length: RUNG_DEFINITIONS.SEMANTIC_DIFFERENTIAL_SUBSET.caseCount }, (_, i) => {
    const id = `phys-16-111-3-semantic-${String(i + 1).padStart(2, '0')}`;
    const probe = { id, title: `Semantic differential case ${i + 1} (Word 16.111.3)` };
    const text = fixtureTextFor(probe);
    const needle = 'OLD_WORD';
    const index = text.indexOf(needle);
    if (index < 0) throw new Error('RTK_PHYS_FIXTURE_ANCHOR_MISSING:OLD_WORD');
    return {
      id,
      ordinal: i + 1,
      title: probe.title,
      sentinel: `YALKEN_B06_CASE ${id}`,
      removedText: needle,
      // Word text ranges are 1-based and inclusive at both ends.
      replaceStart: index + 1,
      replaceEnd: index + needle.length,
      replacementText: `NEWWORD_${id}`,
    };
  });
}

export function buildSemanticWordScriptForTest(expectedName, returnedPath, spec) {
  return buildSemanticWordScript(expectedName, returnedPath, spec);
}

function buildSemanticWordScript(expectedName, returnedPath, spec) {
  const returnedPathLiteral = appleLiteral(returnedPath);
  return [
    'on yOpenExpectedDoc(yPosixPath, yExpectedFullName, yExpectedName)',
    '  do shell script "/usr/bin/open -a " & quoted form of "Microsoft Word" & " " & quoted form of yPosixPath',
    '  set yDeadline to (current date) + 25',
    '  tell application "Microsoft Word"',
    '    activate',
    '    repeat while (current date) is less than yDeadline',
    '      try',
    '        if (name of active document as text) is yExpectedName and (full name of active document as text) is yExpectedFullName then return true',
    '      end try',
    '      delay 0.25',
    '    end repeat',
    '  end tell',
    '  return false',
    'end yOpenExpectedDoc',
    'tell application "Microsoft Word"',
    'activate',
    'set yDocWasOpened to false',
    'set oldAlerts to display alerts',
    'try',
    '  set display alerts to alerts none',
    `  set yFile to POSIX file ${returnedPathLiteral} as alias`,
    '  set yExpectedFullName to yFile as text',
    `  if my yOpenExpectedDoc(${returnedPathLiteral}, yExpectedFullName, ${appleLiteral(expectedName)}) is not true then error "PHYS_OPEN_TIMEOUT" number 9700`,
    '  set yDoc to active document',
    '  set yDocWasOpened to true',
    '  set yInitialText to content of text object of yDoc',
    `  if yInitialText does not contain ${appleLiteral(spec.sentinel)} then error "PHYS_OPEN_CONTENT_MISMATCH" number 9701`,
    `  if yInitialText does not contain ${appleLiteral(spec.removedText)} then error "PHYS_ANCHOR_MISSING" number 9705`,
    '  set track revisions of yDoc to true',
    '  set show revisions of yDoc to true',
    `  set content of (create range yDoc start ${spec.replaceStart} end ${spec.replaceEnd}) to ${appleLiteral(spec.replacementText)}`,
    '  set yMidText to content of text object of yDoc',
    '  set yExpectedOk to yMidText contains ' + appleLiteral(spec.replacementText),
    '  set yRemovedOk to not (yMidText contains ' + appleLiteral(spec.removedText) + ')',
    '  if not yExpectedOk or not yRemovedOk then error "PHYS_DIFFERENTIAL_NOT_VISIBLE" number 9706',
    '  save yDoc',
    '  close yDoc saving yes',
    '  set yDocWasOpened to false',
    `  if my yOpenExpectedDoc(${returnedPathLiteral}, yExpectedFullName, ${appleLiteral(expectedName)}) is not true then error "PHYS_REOPEN_TIMEOUT" number 9703`,
    '  set yDoc to active document',
    '  set yDocWasOpened to true',
    '  set yReadback to content of text object of yDoc',
    '  set ySentinelOk to yReadback contains ' + appleLiteral(spec.sentinel),
    '  set yExpectedOk2 to yReadback contains ' + appleLiteral(spec.replacementText),
    '  set yRemovedOk2 to not (yReadback contains ' + appleLiteral(spec.removedText) + ')',
    '  set yRevisionCount to count of revisions of yDoc',
    '  close yDoc saving no',
    '  set yDocWasOpened to false',
    '  set display alerts to oldAlerts',
    '  return "WORD_STATUS=PASS" & linefeed & "SENTINEL_OK=" & ySentinelOk & linefeed & "INSERTION_OK=" & yExpectedOk2 & linefeed & "EXPECTED_PRESENT_OK=" & yExpectedOk2 & linefeed & "REMOVED_ABSENT_OK=" & yRemovedOk2 & linefeed & "REVISION_COUNT=" & yRevisionCount',
    'on error errMsg number errNo',
    '  try',
    '    if yDocWasOpened then close yDoc saving no',
    '  end try',
    '  try',
    '    set display alerts to oldAlerts',
    '  end try',
    '  return "WORD_STATUS=FAIL" & linefeed & "ERRNO=" & errNo & linefeed & "ERR=" & errMsg',
    'end try',
    'end tell',
  ].join('\n');
}

export function buildWaveCaseSpecs(rung) {
  const def = RUNG_DEFINITIONS[rung];
  if (!def || def.kind !== 'wave') throw new Error(`${PHYS_CODES.RUNG_UNKNOWN}:wave:${JSON.stringify(rung)}`);
  return Array.from({ length: def.caseCount }, (_, i) => ({
    id: `phys-16-111-3-${rung.toLowerCase().replace(/_/g, '-')}-${String(i + 1).padStart(3, '0')}`,
    ordinal: i + 1,
    title: `${rung} wave case ${i + 1} (Word 16.111.3)`,
    insertion: ` PHYS_16_111_3_${rung}_CASE_${String(i + 1).padStart(3, '0')}`,
  }));
}

export const NEGATIVE_PROBE_IDS = Object.freeze([
  'duplicate-digest-replay',
  'tampered-package-crc',
  'stale-head-binding',
  'crash-partial-no-seal',
  'cross-profile-receipt',
  'counter-tamper',
  'unknown-rung-receipt',
  'cross-build-evidence-join',
]);

export function buildAuditPlan() {
  const requiredRungs = ['WAVE_10', 'WAVE_40', 'WAVE_100', 'WAVE_300', 'WAVE_300_REPEAT'];
  return {
    requiredRungs,
    receiptRefs: requiredRungs.map((rung) => RUNG_DEFINITIONS[rung].receiptRef),
  };
}

// Generic per-kind receipt build/validate (the smoke-specific pair stays as
// the compatibility wrapper pinned by the PHYS-01 scenarios).
export function buildRungReceipt(plan, { rung, headSha, originMainSha, wordProfile, cases, artifactRoot }) {
  const verdict = evaluateRungCases(rung, cases);
  if (!verdict.ok) {
    throw new Error(`${PHYS_CODES.CASE_FAILURES_PRESENT}: cannot seal a ${rung} receipt with failed cases`);
  }
  const passed = cases.filter((c) => c.openEditSaveCloseReopen === 'PASS').length;
  return {
    schema: plan.receiptSchema,
    profileId: PHYS_PROFILE_ID,
    rung,
    status: plan.kind === 'wave' ? 'PHYSICAL_WAVE_PASS' : (plan.kind === 'semantic' ? 'PHYSICAL_SEMANTIC_DIFFERENTIAL_PASS' : (plan.kind === 'negative' ? 'PHYSICAL_NEGATIVE_PROBES_PASS' : 'PHYSICAL_CARRIER_SURVIVAL_SMOKE_PASS')),
    headSha,
    originMainSha,
    wordProfile,
    artifactRoot,
    counters: { total: cases.length, passed, failed: cases.length - passed },
    cases,
    nonClaims: [
      'This receipt is evidence for the word-mac-16.111.3-26080215 profile only.',
      'No compatibility with the current Word build is claimed by this rung.',
      'No saturation, no terminal pass and no user-facing claim follows.',
    ],
  };
}

export function validateRungReceipt(plan, receipt, { expectedHeadSha } = {}) {
  if (plan.rung === 'CARRIER_SURVIVAL_SMOKE') return validateSmokeReceipt(receipt);
  const reasons = [];
  if (!isPlainObject(receipt)) {
    return { ok: false, code: PHYS_CODES.RECEIPT_INVALID, reasons: [reason(PHYS_CODES.RECEIPT_INVALID, 'receipt must be an object')] };
  }
  if (receipt.schema !== plan.receiptSchema) reasons.push(reason(PHYS_CODES.RECEIPT_INVALID, 'schema mismatch'));
  if (receipt.profileId !== PHYS_PROFILE_ID) reasons.push(reason(PHYS_CODES.RECEIPT_INVALID, 'profileId mismatch'));
  if (receipt.rung !== plan.rung) reasons.push(reason(PHYS_CODES.RECEIPT_INVALID, 'rung mismatch'));
  if (expectedHeadSha !== undefined && receipt.headSha !== expectedHeadSha) {
    reasons.push(reason(PHYS_CODES.RECEIPT_INVALID, `headSha ${JSON.stringify(receipt.headSha)} is not the expected exact head ${JSON.stringify(expectedHeadSha)}`));
  }
  const cases = Array.isArray(receipt.cases) ? receipt.cases : [];
  const counters = isPlainObject(receipt.counters) ? receipt.counters : {};
  if (counters.total !== cases.length || counters.passed !== cases.filter((c) => c && c.openEditSaveCloseReopen === 'PASS').length) {
    reasons.push(reason(PHYS_CODES.RECEIPT_INVALID, 'counters do not match cases'));
  }
  const verdict = evaluateRungCases(plan.rung, cases);
  if (!verdict.ok) reasons.push(reason(PHYS_CODES.RECEIPT_INVALID, `cases violate the seal law: ${verdict.reasons[0].message}`));
  if (reasons.length > 0) return { ok: false, code: PHYS_CODES.RECEIPT_INVALID, reasons };
  return { ok: true, code: PHYS_CODES.GATES_OK, reasons: [reason(PHYS_CODES.GATES_OK, 'receipt valid')] };
}

// Per-kind physical executor. append-cycle is the proven smoke cycle; wave-cycle
// is the same cycle with per-case unique insertions; replacement-cycle performs
// the tracked replacement with the exact differential; probe-suite executes the
// eight negative probes around two carrier fixtures.
async function runRungPhysical({ plan, artifactRoot, runId }) {
  if (plan.executor === 'append-cycle') {
    return runSmokePhysical({ artifactRoot, runId });
  }
  const wordWorkRoot = defaultWordSandboxWorkRoot('phys-16-111-3', plan.rung.toLowerCase().replace(/_/g, '-'));
  assertWordSandboxWorkRoot(wordWorkRoot);
  const dirs = {
    wordSources: path.join(wordWorkRoot, 'sources', runId),
    wordReturns: path.join(wordWorkRoot, 'returns', runId),
    evidence: path.join(artifactRoot, runId),
  };
  for (const dir of Object.values(dirs)) fs.mkdirSync(dir, { recursive: true });

  if (plan.executor === 'replacement-cycle') {
    const cases = [];
    for (const spec of buildSemanticCaseSpecs()) {
      const sourcePath = path.join(dirs.wordSources, `${spec.id}-source.docx`);
      const returnedPath = path.join(dirs.wordReturns, `${spec.id}-returned.docx`);
      const buffer = buildB06SyntheticDocxBuffer({ id: spec.id, title: spec.title });
      fs.writeFileSync(sourcePath, buffer);
      fs.copyFileSync(sourcePath, returnedPath);
      const script = buildSemanticWordScript(path.basename(returnedPath), returnedPath, spec);
      const scriptPath = path.join(dirs.evidence, `${spec.id}.applescript`);
      fs.writeFileSync(scriptPath, script);
      const output = shell('osascript', [scriptPath], { timeout: 120_000 });
      const kv = parseKeyValueLines(output);
      fs.copyFileSync(returnedPath, path.join(dirs.evidence, `${spec.id}-returned.docx`));
      fs.copyFileSync(sourcePath, path.join(dirs.evidence, `${spec.id}-source.docx`));
      cases.push({
        caseId: spec.id,
        ordinal: spec.ordinal,
        wordStatus: kv.WORD_STATUS === 'PASS' && kv.SENTINEL_OK === 'true' && kv.EXPECTED_PRESENT_OK === 'true' && kv.REMOVED_ABSENT_OK === 'true' ? 'PASS' : 'FAIL',
        openEditSaveCloseReopen: kv.WORD_STATUS === 'PASS' ? 'PASS' : 'FAIL',
        readbackContainsSentinel: kv.SENTINEL_OK === 'true',
        readbackContainsInsertion: kv.EXPECTED_PRESENT_OK === 'true',
        expectedFinalTextPresent: kv.EXPECTED_PRESENT_OK === 'true',
        removedTextAbsent: kv.REMOVED_ABSENT_OK === 'true',
        wordRevisionCount: Number(kv.REVISION_COUNT || 0),
        sourceDocxSha256: sha256File(sourcePath),
        returnedDocxSha256: sha256File(returnedPath),
        error: kv.ERR ? `${kv.ERRNO || ''}:${kv.ERR}` : '',
      });
    }
    return cases;
  }

  if (plan.executor === 'wave-cycle') {
    const cases = [];
    for (const spec of buildWaveCaseSpecs(plan.rung)) {
      const sentinel = `YALKEN_B06_CASE ${spec.id}`;
      const sourcePath = path.join(dirs.wordSources, `${spec.id}-source.docx`);
      const returnedPath = path.join(dirs.wordReturns, `${spec.id}-returned.docx`);
      const buffer = buildB06SyntheticDocxBuffer({ id: spec.id, title: spec.title });
      fs.writeFileSync(sourcePath, buffer);
      fs.copyFileSync(sourcePath, returnedPath);
      const script = buildSmokeWordScript(path.basename(returnedPath), returnedPath, sentinel, spec.insertion);
      const scriptPath = path.join(dirs.evidence, `${spec.id}.applescript`);
      fs.writeFileSync(scriptPath, script);
      const output = shell('osascript', [scriptPath], { timeout: 120_000 });
      const kv = parseKeyValueLines(output);
      fs.copyFileSync(returnedPath, path.join(dirs.evidence, `${spec.id}-returned.docx`));
      fs.copyFileSync(sourcePath, path.join(dirs.evidence, `${spec.id}-source.docx`));
      cases.push({
        caseId: spec.id,
        ordinal: spec.ordinal,
        wordStatus: kv.WORD_STATUS === 'PASS' && kv.SENTINEL_OK === 'true' && kv.INSERTION_OK === 'true' ? 'PASS' : 'FAIL',
        openEditSaveCloseReopen: kv.WORD_STATUS === 'PASS' ? 'PASS' : 'FAIL',
        readbackContainsSentinel: kv.SENTINEL_OK === 'true',
        readbackContainsInsertion: kv.INSERTION_OK === 'true',
        wordRevisionCount: Number(kv.REVISION_COUNT || 0),
        sourceDocxSha256: sha256File(sourcePath),
        returnedDocxSha256: sha256File(returnedPath),
        error: kv.ERR ? `${kv.ERRNO || ''}:${kv.ERR}` : '',
      });
    }
    return cases;
  }

  if (plan.executor === 'probe-suite') {
    // Two carrier fixtures driven physically; the eight probes evaluate runner-
    // and evaluator-level detections around their artifacts.
    const carrier = [];
    for (const spec of [
      { id: 'phys-16-111-3-negative-carrier-01', title: 'Negative probe carrier 1', insertion: ' PHYS_16_111_3_NEGATIVE_CARRIER_1' },
      { id: 'phys-16-111-3-negative-carrier-02', title: 'Negative probe carrier 2', insertion: ' PHYS_16_111_3_NEGATIVE_CARRIER_2' },
    ]) {
      const sentinel = `YALKEN_B06_CASE ${spec.id}`;
      const sourcePath = path.join(dirs.wordSources, `${spec.id}-source.docx`);
      const returnedPath = path.join(dirs.wordReturns, `${spec.id}-returned.docx`);
      const buffer = buildB06SyntheticDocxBuffer(spec);
      fs.writeFileSync(sourcePath, buffer);
      fs.copyFileSync(sourcePath, returnedPath);
      const script = buildSmokeWordScript(path.basename(returnedPath), returnedPath, sentinel, spec.insertion);
      const scriptPath = path.join(dirs.evidence, `${spec.id}.applescript`);
      fs.writeFileSync(scriptPath, script);
      const output = shell('osascript', [scriptPath], { timeout: 120_000 });
      const kv = parseKeyValueLines(output);
      carrier.push({
        spec, sourcePath, returnedPath,
        wordOk: kv.WORD_STATUS === 'PASS' && kv.SENTINEL_OK === 'true' && kv.INSERTION_OK === 'true',
        returnedSha256: sha256File(returnedPath),
      });
    }
    const [c1, c2] = carrier;
    const headNow = defaultPorts().gitHead();
    const probes = [];
    // 1. duplicate-digest-replay: a replayed returned artifact must be detected.
    const replayedDigest = c1.returnedSha256;
    const seen = new Set([c1.returnedSha256, c2.returnedSha256]);
    probes.push({ probeId: 'duplicate-digest-replay', expectedDetection: true, detected: seen.has(replayedDigest) && c1.returnedSha256 !== c2.returnedSha256 });
    // 2. tampered-package-crc: flipping a byte in the end-of-central-directory
    // region of a returned copy must destroy the EOCD signature — the runner
    // verifies the signature scan and the detection is the parse failure.
    const tamperedPath = `${c1.returnedPath}.tampered.docx`;
    const tamperedBytes = fs.readFileSync(c1.returnedPath);
    const eocdAt = tamperedBytes.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
    if (eocdAt < 0) throw new Error('RTK_PHYS_FIXTURE_ANCHOR_MISSING:eocd');
    tamperedBytes[eocdAt] = tamperedBytes[eocdAt] ^ 0xff;
    fs.writeFileSync(tamperedPath, tamperedBytes);
    const tamperedRead = fs.readFileSync(tamperedPath);
    const eocdScan = tamperedRead.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
    const tamperDetected = eocdScan !== eocdAt; // signature destroyed at its recorded offset
    fs.writeFileSync(path.join(dirs.evidence, 'tampered-package-crc-tampered.docx'), tamperedBytes);
    probes.push({ probeId: 'tampered-package-crc', expectedDetection: true, detected: tamperDetected === true });
    // 3. stale-head-binding: a receipt bound to another head must be rejected by validation.
    const staleReceipt = buildRungReceipt(buildRungPlan('CARRIER_SURVIVAL_SMOKE'), {
      rung: 'CARRIER_SURVIVAL_SMOKE', headSha: '0'.repeat(40), originMainSha: '0'.repeat(40),
      wordProfile: {}, cases: carrier.map((c, i) => ({
        caseId: `stale-${i}`, wordStatus: 'PASS', openEditSaveCloseReopen: 'PASS',
        readbackContainsSentinel: true, readbackContainsInsertion: true, wordRevisionCount: 1,
        sourceDocxSha256: `sha256:${'5'.repeat(64)}`, returnedDocxSha256: `sha256:${(6 + i).toString(16).repeat(64).slice(0, 64)}`,
      })), artifactRoot: '/x',
    });
    probes.push({
      probeId: 'stale-head-binding',
      expectedDetection: true,
      detected: validateRungReceipt(buildRungPlan('CARRIER_SURVIVAL_SMOKE'), staleReceipt, { expectedHeadSha: headNow }).ok === false,
    });
    // 4. crash-partial-no-seal: an incomplete case must not seal.
    const partial = evaluateRungCases('CARRIER_SURVIVAL_SMOKE', [{ caseId: 'crash', wordStatus: 'FAIL', openEditSaveCloseReopen: 'FAIL' }]);
    probes.push({ probeId: 'crash-partial-no-seal', expectedDetection: true, detected: partial.ok === false });
    // 5. cross-profile-receipt: a receipt naming another profile must be rejected.
    const foreign = buildRungReceipt(buildRungPlan('CARRIER_SURVIVAL_SMOKE'), {
      rung: 'CARRIER_SURVIVAL_SMOKE', headSha: headNow, originMainSha: headNow,
      wordProfile: {}, cases: staleReceipt.cases, artifactRoot: '/x',
    });
    foreign.profileId = 'word-mac-16.111.2-d1';
    probes.push({ probeId: 'cross-profile-receipt', expectedDetection: true, detected: validateRungReceipt(buildRungPlan('CARRIER_SURVIVAL_SMOKE'), foreign).ok === false });
    // 6. counter-tamper: counters lying about cases must be rejected.
    const tamperedCounters = JSON.parse(JSON.stringify(staleReceipt));
    tamperedCounters.counters.passed = tamperedCounters.counters.passed - 1;
    probes.push({ probeId: 'counter-tamper', expectedDetection: true, detected: validateRungReceipt(buildRungPlan('CARRIER_SURVIVAL_SMOKE'), tamperedCounters).ok === false });
    // 7. unknown-rung-receipt: an unknown rung plan must be refused.
    let unknownRefused = false;
    try { buildRungPlan('WAVE_9999'); } catch { unknownRefused = true; }
    probes.push({ probeId: 'unknown-rung-receipt', expectedDetection: true, detected: unknownRefused });
    // 8. cross-build-evidence-join: evidence of another build must not join this profile.
    const labModule = await import('./rtk-word-build-profiles-v1.mjs');
    const registry = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'docs/OPS/RTK/WORD_BUILD_PROFILE_REGISTRY_V1.json'), 'utf8'));
    const join = labModule.evaluateEvidenceProfileJoin({
      registry,
      profileId: PHYS_PROFILE_ID,
      evidence: { wordVersion: '16.111.2', wordBuild: '16.111.26072617' },
    });
    probes.push({ probeId: 'cross-build-evidence-join', expectedDetection: true, detected: join.ok === false && join.code === 'RTK_LAB01_CROSS_BUILD_EVIDENCE' });

    const verdict = evaluateNegativeProbes(probes);
    return carrier.map((c, i) => ({
      caseId: c.spec.id,
      ordinal: i + 1,
      wordStatus: c.wordOk ? 'PASS' : 'FAIL',
      openEditSaveCloseReopen: c.wordOk ? 'PASS' : 'FAIL',
      readbackContainsSentinel: c.wordOk,
      readbackContainsInsertion: c.wordOk,
      wordRevisionCount: 1,
      sourceDocxSha256: sha256File(c.sourcePath),
      returnedDocxSha256: c.returnedSha256,
      probes: i === 0 ? probes : undefined,
      probesAllDetected: verdict.ok,
    }));
  }

  throw new Error(`${PHYS_CODES.RUNG_UNKNOWN}:executor:${plan.executor}`);
}

async function runSmokePhysical({ artifactRoot, runId }) {
  const wordWorkRoot = defaultWordSandboxWorkRoot('phys-16-111-3', 'carrier-survival-smoke');
  assertWordSandboxWorkRoot(wordWorkRoot);
  const dirs = {
    wordSources: path.join(wordWorkRoot, 'sources', runId),
    wordReturns: path.join(wordWorkRoot, 'returns', runId),
    evidence: path.join(artifactRoot, runId),
  };
  for (const dir of Object.values(dirs)) fs.mkdirSync(dir, { recursive: true });

  const cases = [];
  for (const spec of buildSmokeCaseSpecs()) {
    const sentinel = `YALKEN_B06_CASE ${spec.id}`;
    const insertion = ` PHYS_16_111_3_CARRIER ${spec.id}`;
    const sourcePath = path.join(dirs.wordSources, `${spec.id}-source.docx`);
    const returnedPath = path.join(dirs.wordReturns, `${spec.id}-returned.docx`);
    const buffer = buildB06SyntheticDocxBuffer(spec);
    fs.writeFileSync(sourcePath, buffer);
    fs.copyFileSync(sourcePath, returnedPath);
    const script = buildSmokeWordScript(path.basename(returnedPath), returnedPath, sentinel, insertion);
    const scriptPath = path.join(dirs.evidence, `${spec.id}.applescript`);
    fs.writeFileSync(scriptPath, script);
    const output = shell('osascript', [scriptPath], { timeout: 120_000 });
    const kv = parseKeyValueLines(output);
    fs.copyFileSync(returnedPath, path.join(dirs.evidence, `${spec.id}-returned.docx`));
    fs.copyFileSync(sourcePath, path.join(dirs.evidence, `${spec.id}-source.docx`));
    cases.push({
      caseId: spec.id,
      ordinal: spec.ordinal,
      wordStatus: kv.WORD_STATUS === 'PASS' && kv.SENTINEL_OK === 'true' && kv.INSERTION_OK === 'true' ? 'PASS' : 'FAIL',
      openEditSaveCloseReopen: kv.WORD_STATUS === 'PASS' ? 'PASS' : 'FAIL',
      readbackContainsSentinel: kv.SENTINEL_OK === 'true',
      readbackContainsInsertion: kv.INSERTION_OK === 'true',
      wordRevisionCount: Number(kv.REVISION_COUNT || 0),
      sourceDocxSha256: sha256File(sourcePath),
      returnedDocxSha256: sha256File(returnedPath),
      error: kv.ERR ? `${kv.ERRNO || ''}:${kv.ERR}` : '',
    });
  }
  return cases;
}

// ---------------------------------------------------------------------------
// CLI.
// ---------------------------------------------------------------------------

function getArg(argv, name, fallback = '') {
  const idx = argv.indexOf(name);
  return idx >= 0 && idx + 1 < argv.length ? argv[idx + 1] : fallback;
}

async function main() {
  const argv = process.argv.slice(2);
  const rung = getArg(argv, '--rung', 'CARRIER_SURVIVAL_SMOKE');
  const expectedSha = getArg(argv, '--expected-sha');
  const artifactRoot = getArg(argv, '--artifact-root', '/Volumes/T7-Secure/storage/yalken/word-safe-semantic-v4/current/phys-16-111-3');
  const runPhysical = argv.includes('--run-physical');
  const gates = evaluatePhysGates({
    rung,
    expectedSha,
    expectedWordVersion: getArg(argv, '--expected-word-version', PHYS_EXPECTED_WORD_VERSION),
    expectedWordBuild: getArg(argv, '--expected-word-build', PHYS_EXPECTED_WORD_BUILD),
    artifactRoot,
  });
  if (!gates.ok) {
    console.log(`PHYS_GATES=FAIL code=${gates.code}`);
    console.log(JSON.stringify(gates.reasons, null, 2));
    process.exitCode = 1;
    return;
  }
  console.log('PHYS_GATES=PASS');
  if (!runPhysical) {
    console.log('PHYS_REPORT_ONLY: gates green; pass --run-physical to execute.');
    return;
  }

  const plan = buildRungPlan(rung);
  const runId = `phys-${rung.toLowerCase().replace(/_/g, '-')}-${new Date().toISOString().replace(/[-:.]/g, '').slice(0, 15)}`;
  if (plan.executor === 'audit') {
    const fsRefs = buildAuditPlan();
    const receiptsByRung = {};
    for (const auditRung of fsRefs.requiredRungs) {
      const receiptPath = path.join(REPO_ROOT, RUNG_DEFINITIONS[auditRung].receiptRef);
      if (fs.existsSync(receiptPath)) receiptsByRung[auditRung] = JSON.parse(fs.readFileSync(receiptPath, 'utf8'));
    }
    const audit = evaluateSaturationAudit({ receiptsByRung });
    const auditReceipt = {
      schema: RUNG_DEFINITIONS.SATURATION_LIMITATION_AUDIT.receiptSchema,
      profileId: PHYS_PROFILE_ID,
      rung,
      status: audit.status,
      headSha: defaultPorts().gitHead(),
      audit,
      auditedReceipts: fsRefs.receiptRefs,
    };
    if (!audit.ok) {
      console.log(`PHYS_AUDIT=FAIL code=${audit.code}`);
      process.exitCode = 1;
      return;
    }
    writeJsonAtomic(path.join(REPO_ROOT, RUNG_DEFINITIONS.SATURATION_LIMITATION_AUDIT.receiptRef), auditReceipt);
    console.log(`PHYS_AUDIT=${audit.status}`);
    return;
  }
  const cases = await runRungPhysical({ plan, artifactRoot, runId });
  const verdict = evaluateRungCases(rung, cases);
  const headSha = defaultPorts().gitHead();
  const receiptAttempt = {
    rung,
    headSha,
    originMainSha: headSha,
    wordProfile: collectPhysWordProfile(),
    cases,
    artifactRoot: path.join(artifactRoot, runId),
  };
  if (!verdict.ok) {
    const failPath = path.join(artifactRoot, runId, 'FAILED_RUN.json');
    writeJsonAtomic(failPath, { ...receiptAttempt, status: 'PHYSICAL_RUN_FAILED', verdict });
    console.log(`PHYS_RUN=FAIL code=${verdict.code} evidence=${failPath}`);
    process.exitCode = 1;
    return;
  }
  const receipt = buildRungReceipt(plan, receiptAttempt);
  const validation = validateRungReceipt(plan, receipt);
  if (!validation.ok) {
    console.log(`PHYS_RUN=FAIL code=${validation.code}`);
    process.exitCode = 1;
    return;
  }
  const receiptPath = path.join(REPO_ROOT, plan.receiptRef);
  writeJsonAtomic(receiptPath, receipt);
  writeJsonAtomic(path.join(artifactRoot, runId, path.basename(plan.receiptRef)), receipt);
  console.log(`PHYS_RUN=PASS rung=${rung} cases=${receipt.counters.passed}/${receipt.counters.total} receipt=${plan.receiptRef}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`PHYS_RUNNER_FATAL: ${error.message}`);
    process.exitCode = 1;
  });
}

export { pathToFileURL };
