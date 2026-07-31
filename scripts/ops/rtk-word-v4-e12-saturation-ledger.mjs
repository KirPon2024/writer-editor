#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const RECEIPT_PATH = path.join(REPO_ROOT, 'docs', 'OPS', 'RTK', 'WORD_SAFE_SEMANTIC_ROUNDTRIP_V4_E12_SATURATION_LEDGER_RECEIPT.json');
const PROFILE_PATH = path.join(REPO_ROOT, 'docs', 'OPS', 'RTK', 'WORD_SAFE_SEMANTIC_ROUNDTRIP_V4_CAPABILITY_PROFILE_V1.json');
const PROGRAM_PATH = path.join(REPO_ROOT, 'docs', 'OPS', 'RTK', 'POST_D1_PORTABILITY_PROGRAM_V1.json');

const REQUIRED_EVIDENCE = [
  'E06_PHYSICAL_TEXT',
  'E07_COMMENTS',
  'E08_FORMATTING',
  'E09_STRUCTURE',
  'E10_REPLAY_HOSTILE',
  'E11_MULTI_SCENE_COORDINATOR',
  'E12_PHYSICAL_WAVE40',
  'E12_PHYSICAL_WAVE100',
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

function issue(code, field, message) {
  return { code, field, message };
}

function getById(items, id) {
  return Array.isArray(items) ? items.find((item) => item && item.id === id) : null;
}

function allZero(record, allowedMissing = []) {
  if (!record || typeof record !== 'object' || Array.isArray(record)) return false;
  for (const [key, value] of Object.entries(record)) {
    if (allowedMissing.includes(key)) continue;
    if (Number(value) !== 0) return false;
  }
  return true;
}

function verifyEvidenceBinding(binding, issues, { requireFiles }) {
  if (!binding) {
    issues.push(issue('RTK_V4_E12_EVIDENCE_BINDING_MISSING', 'evidenceBindings', 'Required evidence binding is missing.'));
    return null;
  }
  if (!REQUIRED_EVIDENCE.includes(binding.id)) {
    issues.push(issue('RTK_V4_E12_EVIDENCE_ID_INVALID', `evidenceBindings.${binding.id}`, 'Unknown E12 evidence binding id.'));
  }
  if (!isHex64(binding.sha256)) {
    issues.push(issue('RTK_V4_E12_EVIDENCE_SHA_INVALID', `evidenceBindings.${binding.id}.sha256`, 'Evidence binding requires a lowercase SHA-256 digest.'));
  }
  if (binding.status !== 'BOUND') {
    issues.push(issue('RTK_V4_E12_EVIDENCE_STATUS_INVALID', `evidenceBindings.${binding.id}.status`, 'Evidence binding must be BOUND.'));
  }

  const relativePath = String(binding.path || '');
  if (requireFiles) {
    const absolutePath = path.join(REPO_ROOT, relativePath);
    if (!relativePath || !fs.existsSync(absolutePath)) {
      issues.push(issue('RTK_V4_E12_EVIDENCE_FILE_MISSING', `evidenceBindings.${binding.id}.path`, 'Evidence file must exist when requireFiles is enabled.'));
      return null;
    }
    const actual = sha256File(absolutePath);
    if (actual !== binding.sha256) {
      issues.push(issue('RTK_V4_E12_EVIDENCE_SHA_MISMATCH', `evidenceBindings.${binding.id}.sha256`, 'Evidence file SHA-256 does not match binding.'));
    }
    return readJson(absolutePath);
  }
  return null;
}

export function evaluateWordV4E12SaturationLedger(input = {}) {
  const receipt = input.receipt || readJson(RECEIPT_PATH);
  const profile = input.profile || readJson(PROFILE_PATH);
  const program = input.program || readJson(PROGRAM_PATH);
  const issues = [];
  const add = (code, field, message) => issues.push(issue(code, field, message));

  if (receipt.schemaVersion !== 'yalken.rtk.word-safe-semantic-roundtrip-v4.e12-saturation-ledger-receipt.v1') {
    add('RTK_V4_E12_SCHEMA_INVALID', 'schemaVersion', 'E12 receipt schema is invalid.');
  }
  if (receipt.stageId !== 'EXECUTION_12_UNICODE_HOSTILE_PERFORMANCE_CRASH_REPLAY_ESCALATING_WORD_WAVES') {
    add('RTK_V4_E12_STAGE_INVALID', 'stageId', 'E12 stage id is invalid.');
  }
  if (receipt.status !== 'WORD_SATURATION_WAVE100_COMPLETE_NOT_SATURATED') {
    add('RTK_V4_E12_STATUS_INVALID', 'status', 'E12 must bind wave 100 complete while staying not-saturated until all wave criteria are proven.');
  }

  const wave = receipt.saturationRule || {};
  if (wave.saturated !== false || wave.wordSaturationClaimAllowed !== false) {
    add('RTK_V4_E12_FALSE_SATURATION_CLAIM', 'saturationRule', 'E12 receipt must not claim Word SATURATED before criteria are met.');
  }
  if (JSON.stringify(wave.requiredWaveSequence) !== JSON.stringify([10, 40, 100, 300])) {
    add('RTK_V4_E12_WAVE_SEQUENCE_INVALID', 'saturationRule.requiredWaveSequence', 'Required physical wave sequence must be 10, 40, 100, 300.');
  }
  if (JSON.stringify(wave.completedWaves) !== JSON.stringify([10, 40, 100])
    || Number(wave.lastCompletedWaveTarget) !== 100
    || Number(wave.currentWaveTarget) !== 300
    || Number(wave.currentWaveObservedRounds) !== 100) {
    add('RTK_V4_E12_WAVE_ACCOUNTING_INVALID', 'saturationRule', 'E12 must bind completed waves 10, 40, and 100, then advance to the 300-round target.');
  }
  if (Number(wave.consecutiveStableApprovedWaves) !== 0) {
    add('RTK_V4_E12_STABLE_WAVE_OVERCLAIM', 'saturationRule.consecutiveStableApprovedWaves', 'Stable wave count must remain zero until two approved no-new-class waves exist.');
  }

  const bindings = Array.isArray(receipt.evidenceBindings) ? receipt.evidenceBindings : [];
  for (const id of REQUIRED_EVIDENCE) {
    verifyEvidenceBinding(getById(bindings, id), issues, { requireFiles: input.requireFiles === true });
  }

  if (input.requireFiles === true) {
    const e06 = verifyEvidenceBinding(getById(bindings, 'E06_PHYSICAL_TEXT'), issues, { requireFiles: true });
    const e07 = verifyEvidenceBinding(getById(bindings, 'E07_COMMENTS'), issues, { requireFiles: true });
    const e10 = verifyEvidenceBinding(getById(bindings, 'E10_REPLAY_HOSTILE'), issues, { requireFiles: true });
    const e12Wave40 = verifyEvidenceBinding(getById(bindings, 'E12_PHYSICAL_WAVE40'), issues, { requireFiles: true });
    const e12Wave100 = verifyEvidenceBinding(getById(bindings, 'E12_PHYSICAL_WAVE100'), issues, { requireFiles: true });
    if (e06?.physicalTextTotals?.physicalRoundTrips !== 32 || e06?.vetoMetrics?.falseExact !== 0) {
      add('RTK_V4_E12_E06_TOTALS_INVALID', 'evidenceBindings.E06_PHYSICAL_TEXT', 'E06 must bind 32 physical text round trips with zero false exact.');
    }
    if (e07?.commentTotals?.visibleAnchoredThreads !== 91 || e07?.commentTotals?.silentCommentLoss !== 0 || e07?.commentTotals?.noOpCommentPassClaimed !== 0) {
      add('RTK_V4_E12_E07_COMMENT_TOTALS_INVALID', 'evidenceBindings.E07_COMMENTS', 'E07 must bind visible comments without silent loss or no-op pass.');
    }
    if (e10?.multiRoundTotals?.hostilePackageBlockedCases !== 1 || e10?.vetoMetrics?.replayFailure !== 0) {
      add('RTK_V4_E12_E10_REPLAY_HOSTILE_INVALID', 'evidenceBindings.E10_REPLAY_HOSTILE', 'E10 must bind hostile package block and zero replay failure.');
    }
    if (e12Wave40?.wave?.target !== 40
      || e12Wave40?.wave?.observedRounds !== 40
      || e12Wave40?.wave?.completed !== true
      || e12Wave40?.totals?.physicalOpenEditSaveCloseReopenPass !== 40
      || e12Wave40?.vetoMetrics?.falseExact !== 0
      || e12Wave40?.saturationDecision?.wordSaturated !== false) {
      add('RTK_V4_E12_WAVE40_INVALID', 'evidenceBindings.E12_PHYSICAL_WAVE40', 'E12 must bind a complete 40-round physical Word wave without a saturation claim.');
    }
    if (e12Wave100?.wave?.target !== 100
      || e12Wave100?.wave?.observedRounds !== 100
      || e12Wave100?.wave?.completed !== true
      || e12Wave100?.totals?.physicalOpenEditSaveCloseReopenPass !== 100
      || e12Wave100?.totals?.parserPass !== 99
      || e12Wave100?.vetoMetrics?.falseExact !== 0
      || e12Wave100?.saturationDecision?.wordSaturated !== false
      || e12Wave100?.wordSandboxWorkRoot?.insideWordContainer !== true
      || e12Wave100?.wordSandboxWorkRoot?.plainTmpForbidden !== true) {
      add('RTK_V4_E12_WAVE100_INVALID', 'evidenceBindings.E12_PHYSICAL_WAVE100', 'E12 must bind a complete 100-round physical Word wave in the Word sandbox work root without a saturation claim.');
    }
  }

  const coverage = receipt.coverageLedger || {};
  for (const required of ['unicodeAndBidi', 'hostilePackage', 'performanceScale', 'crashRecovery', 'replayIdempotence', 'physicalWave40', 'physicalWave100']) {
    if (coverage[required]?.status !== 'BOUND') {
      add('RTK_V4_E12_COVERAGE_MISSING', `coverageLedger.${required}`, `${required} coverage must be bound.`);
    }
  }

  const veto = receipt.vetoMetrics || {};
  if (!allZero(veto)) {
    add('RTK_V4_E12_VETO_NONZERO', 'vetoMetrics', 'All E12 aggregate veto metrics must be zero.');
  }

  if (!Array.isArray(receipt.notSaturatedReasons) || receipt.notSaturatedReasons.length < 3) {
    add('RTK_V4_E12_NOT_SATURATED_REASONS_MISSING', 'notSaturatedReasons', 'E12 must list concrete remaining saturation blockers.');
  }
  if (receipt.runtimeClaims?.productRuntimeChanged !== false || receipt.runtimeClaims?.automaticApplyExpanded !== false || receipt.runtimeClaims?.googleDocsOpened !== false) {
    add('RTK_V4_E12_RUNTIME_SCOPE_OVERCLAIM', 'runtimeClaims', 'E12 must not change runtime apply authority or open Google Docs.');
  }

  const cell = Array.isArray(profile.cells) ? profile.cells.find((item) => item.capabilityId === 'rtk.word.v4.saturationLedger') : null;
  if (!cell || cell.state !== 'PHYSICAL_WORD_PROVEN' || cell.currentCapability !== 'SATURATION_WAVE100_COMPLETE_NOT_SATURATED' || cell.physicalWordEvidence !== true) {
    add('RTK_V4_E12_PROFILE_CELL_INVALID', 'profile.cells.rtk.word.v4.saturationLedger', 'Capability profile must bind E12 wave 100 as physical evidence proven but not saturated.');
  }
  if (profile.status !== 'WORD_16_111_2_E12_WAVE100_COMPLETE_NOT_SATURATED') {
    add('RTK_V4_E12_PROFILE_STATUS_INVALID', 'profile.status', 'Profile status must reflect E12 wave 100 complete not-saturated ledger.');
  }

  const state = program.v4ExecutionState || {};
  if (program.status !== 'WORD_E12_PHYSICAL_WAVE100_COMPLETE_NOT_SATURATED') {
    add('RTK_V4_E12_PROGRAM_STATUS_INVALID', 'program.status', 'Program status must reflect E12 physical wave 100 completion.');
  }
  if (state.status !== 'EXECUTION_12_WAVE100_LOCAL_VERIFIED_NOT_SATURATED_CONTINUE_WORD_WAVE_300') {
    add('RTK_V4_E12_PROGRAM_STATE_INVALID', 'program.v4ExecutionState.status', 'Program state must keep E12 active and advance to wave 300.');
  }
  if (state.nextStage !== 'EXECUTION_12_NEXT_PHYSICAL_WAVE_300') {
    add('RTK_V4_E12_NEXT_STAGE_INVALID', 'program.v4ExecutionState.nextStage', 'Next stage must continue the 300-round Word wave, not Google Docs.');
  }
  if (state.googleDocsOpened !== false || state.wordSaturated !== false || state.wordSaturationCurrentFocus !== true) {
    add('RTK_V4_E12_SEQUENCE_BROKEN', 'program.v4ExecutionState', 'Word must remain current focus and Google Docs must stay closed until saturation.');
  }

  return {
    ok: issues.length === 0,
    status: issues.length === 0 ? 'PASS' : 'FAIL',
    issues,
    completedWaves: wave.completedWaves || [],
    currentWaveTarget: wave.currentWaveTarget || 0,
    currentWaveObservedRounds: wave.currentWaveObservedRounds || 0,
    saturated: wave.saturated === true,
  };
}

function main() {
  const json = process.argv.includes('--json');
  const result = evaluateWordV4E12SaturationLedger({ requireFiles: process.argv.includes('--require-files') });
  process.stdout.write(json ? `${JSON.stringify(result, null, 2)}\n` : `RTK_WORD_V4_E12_SATURATION_LEDGER=${result.status}\n`);
  process.exit(result.ok ? 0 : 1);
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  main();
}
