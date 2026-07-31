#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const RECEIPT_PATH = path.join(REPO_ROOT, 'docs', 'OPS', 'RTK', 'WORD_SAFE_SEMANTIC_ROUNDTRIP_V4_E12_PHYSICAL_WAVE300_REPEAT_RECEIPT.json');
const EXTERNAL_SCHEMA = 'yalken.rtk.word-safe-semantic-roundtrip-v4.e12-physical-wave300-receipt.v1';
const SCHEMA = 'yalken.rtk.word-safe-semantic-roundtrip-v4.e12-physical-wave300-repeat-receipt.v1';
const STATUS = 'PHYSICAL_STABILITY_WAVE_300_REPEAT_COMPLETE_NOT_SATURATED';
const NEXT_STAGE = 'EXECUTION_12_WORD_LIMITATION_FOLLOWUP_AFTER_STABLE_WAVES';

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

function allZero(record) {
  return !!record && Object.values(record).every((value) => Number(value) === 0);
}

export function evaluateWordV4E12StabilityWave300Repeat(input = {}) {
  const receipt = input.receipt || readJson(RECEIPT_PATH);
  const issues = [];
  const add = (code, field, message) => issues.push(issue(code, field, message));

  if (receipt.schemaVersion !== SCHEMA) add('RTK_V4_E12_REPEAT_SCHEMA_INVALID', 'schemaVersion', 'Repeat wave receipt schema is invalid.');
  if (receipt.stageId !== 'EXECUTION_12_NEXT_PHYSICAL_STABILITY_WAVE_300_REPEAT') add('RTK_V4_E12_REPEAT_STAGE_INVALID', 'stageId', 'Repeat wave stage id is invalid.');
  if (receipt.status !== STATUS) add('RTK_V4_E12_REPEAT_STATUS_INVALID', 'status', 'Repeat wave must complete without claiming saturation.');
  if (receipt.externalEvidence?.schemaVersion !== EXTERNAL_SCHEMA) add('RTK_V4_E12_REPEAT_EXTERNAL_SCHEMA_INVALID', 'externalEvidence.schemaVersion', 'External physical receipt schema must be the wave300 physical schema.');
  if (!isHex64(receipt.externalEvidence?.sha256)) add('RTK_V4_E12_REPEAT_EXTERNAL_SHA_INVALID', 'externalEvidence.sha256', 'External receipt SHA-256 is invalid.');

  if (input.requireExternal === true) {
    const externalPath = String(receipt.externalEvidence?.path || '');
    if (!externalPath || !fs.existsSync(externalPath)) {
      add('RTK_V4_E12_REPEAT_EXTERNAL_MISSING', 'externalEvidence.path', 'External repeat wave receipt is missing.');
    } else {
      const actualSha = sha256File(externalPath);
      if (actualSha !== receipt.externalEvidence.sha256) {
        add('RTK_V4_E12_REPEAT_EXTERNAL_SHA_MISMATCH', 'externalEvidence.sha256', 'External repeat wave receipt SHA-256 mismatch.');
      }
      const external = readJson(externalPath);
      if (external.schemaVersion !== EXTERNAL_SCHEMA
        || external.status !== 'PHYSICAL_WAVE_300_COMPLETE_NOT_SATURATED'
        || external.wave?.target !== 300
        || external.wave?.observedRounds !== 300
        || external.wave?.completed !== true
        || external.totals?.physicalOpenEditSaveCloseReopenPass !== 300
        || external.totals?.parserPass !== 299
        || external.vetoMetrics?.falseExact !== 0
        || external.saturationDecision?.wordSaturated !== false
        || external.wordSandboxWorkRoot?.insideWordContainer !== true
        || external.wordSandboxWorkRoot?.plainTmpForbidden !== true) {
        add('RTK_V4_E12_REPEAT_EXTERNAL_TOTALS_INVALID', 'externalEvidence', 'External repeat wave physical receipt totals are invalid.');
      }
    }
  }

  const totals = receipt.totals || {};
  if (totals.physicalRoundTrips !== 300
    || totals.physicalOpenEditSaveCloseReopenPass !== 300
    || totals.parserPass !== 299
    || totals.exactAutomaticCandidates !== 0
    || totals.falseExact !== 0
    || totals.silentApply !== 0
    || totals.wrongSceneRouting !== 0
    || totals.replayFailure !== 0) {
    add('RTK_V4_E12_REPEAT_TOTALS_INVALID', 'totals', 'Repeat wave totals must bind 300 physical rounds and zero veto metrics.');
  }
  if (receipt.wordProfile?.observedWordVersion !== '16.111.2') add('RTK_V4_E12_REPEAT_WORD_VERSION_INVALID', 'wordProfile.observedWordVersion', 'Repeat wave must bind Word 16.111.2.');
  if (receipt.wordSandboxWorkRoot?.insideWordContainer !== true || receipt.wordSandboxWorkRoot?.plainTmpForbidden !== true) {
    add('RTK_V4_E12_REPEAT_SANDBOX_ROOT_INVALID', 'wordSandboxWorkRoot', 'Repeat wave must use the Word container work root.');
  }
  if (String(receipt.artifactRoot || '').startsWith('/Volumes/T7-Secure/') !== true) {
    add('RTK_V4_E12_REPEAT_ARTIFACT_ROOT_INVALID', 'artifactRoot', 'Repeat wave artifacts must remain on T7-Secure.');
  }

  const decision = receipt.saturationDecision || {};
  if (decision.wordSaturated !== false
    || decision.wordSaturationClaimAllowed !== false
    || decision.googleDocsAllowedToOpen !== false
    || decision.nextStage !== NEXT_STAGE
    || Number(decision.consecutiveStableApprovedWaves) !== 2
    || decision.stableHistogram !== true) {
    add('RTK_V4_E12_REPEAT_FALSE_SATURATION_OR_SEQUENCE', 'saturationDecision', 'Repeat wave must prove two stable waves while keeping Word not saturated and Google closed.');
  }
  if (!Array.isArray(receipt.remainingLimitations) || receipt.remainingLimitations.length < 3) {
    add('RTK_V4_E12_REPEAT_LIMITATIONS_MISSING', 'remainingLimitations', 'Repeat wave must bind typed limitations that still block saturation.');
  }
  if (!allZero(receipt.vetoMetrics)) add('RTK_V4_E12_REPEAT_VETO_NONZERO', 'vetoMetrics', 'Repeat wave veto metrics must all be zero.');

  return {
    ok: issues.length === 0,
    status: issues.length === 0 ? 'PASS' : 'FAIL',
    issues,
    observedRounds: totals.physicalRoundTrips || 0,
    parserPass: totals.parserPass || 0,
    stableWaves: decision.consecutiveStableApprovedWaves || 0,
    saturated: decision.wordSaturated === true,
    nextStage: decision.nextStage || '',
  };
}

function main() {
  const json = process.argv.includes('--json');
  const result = evaluateWordV4E12StabilityWave300Repeat({ requireExternal: process.argv.includes('--require-external') });
  process.stdout.write(json ? `${JSON.stringify(result, null, 2)}\n` : `RTK_WORD_V4_E12_STABILITY_WAVE300_REPEAT=${result.status}\n`);
  process.exit(result.ok ? 0 : 1);
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  main();
}
