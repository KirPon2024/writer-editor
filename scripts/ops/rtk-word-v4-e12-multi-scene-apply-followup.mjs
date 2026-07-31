#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const RECEIPT_PATH = path.join(REPO_ROOT, 'docs', 'OPS', 'RTK', 'WORD_SAFE_SEMANTIC_ROUNDTRIP_V4_E12_MULTI_SCENE_APPLY_FOLLOWUP_RECEIPT.json');
const E11_PATH = path.join(REPO_ROOT, 'docs', 'OPS', 'RTK', 'WORD_SAFE_SEMANTIC_ROUNDTRIP_V4_E11_MULTI_SCENE_ATOMIC_COORDINATOR_RECEIPT.json');
const E11_MODULE_PATH = path.join(REPO_ROOT, 'src', 'io', 'revisionBridge', 'reviewTransportMultiSceneAtomicCoordinatorV4.mjs');

const SCHEMA = 'yalken.rtk.word-safe-semantic-roundtrip-v4.e12-multi-scene-apply-followup-receipt.v1';
const STAGE = 'EXECUTION_12_WORD_LIMITATION_FOLLOWUP_MULTI_SCENE_APPLY_CERTIFICATION';
const STATUS = 'MULTI_SCENE_APPLY_REMAINS_SHADOW_ONLY_TYPED_LIMITATION_NOT_SATURATED';
const NEXT_STAGE = 'EXECUTION_12_WORD_LIMITATION_FOLLOWUP_MODERN_COMMENT_NATIVE_UI_CERTIFICATION';
const RESOLVED_LIMITATION = 'AUTOMATIC_MULTI_SCENE_APPLY_NOT_PHYSICAL_WORD_CERTIFIED';

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function sha256File(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function issue(code, field, message) {
  return { code, field, message };
}

function h(label) {
  return `sha256:${crypto.createHash('sha256').update(label).digest('hex')}`;
}

function isHex64(value) {
  return /^[0-9a-f]{64}$/u.test(String(value || ''));
}

function verifyBinding(binding, expectedPath, issues, field, { requireFiles }) {
  const relative = path.relative(REPO_ROOT, expectedPath).replaceAll(path.sep, '/');
  if (!binding || binding.path !== relative || !isHex64(binding.sha256)) {
    issues.push(issue('RTK_V4_E12_MULTI_SCENE_BINDING_INVALID', field, 'Binding path and lowercase SHA-256 are required.'));
    return null;
  }
  if (!requireFiles) return null;
  if (!fs.existsSync(expectedPath)) {
    issues.push(issue('RTK_V4_E12_MULTI_SCENE_BINDING_FILE_MISSING', field, 'Bound evidence file is missing.'));
    return null;
  }
  if (sha256File(expectedPath) !== binding.sha256) {
    issues.push(issue('RTK_V4_E12_MULTI_SCENE_BINDING_SHA_MISMATCH', field, 'Bound evidence SHA-256 does not match current bytes.'));
  }
  return readJson(expectedPath);
}

async function runCoordinatorProof(issues) {
  if (!fs.existsSync(E11_MODULE_PATH)) {
    issues.push(issue('RTK_V4_E12_MULTI_SCENE_MODULE_MISSING', 'boundEvidence.e11CoordinatorModule', 'E11 coordinator module is missing.'));
    return null;
  }
  const mod = await import(pathToFileURL(E11_MODULE_PATH).href);
  const cryptoPort = {
    sha256Json(value) {
      const stable = JSON.stringify(value, Object.keys(value || {}).sort());
      return h(stable);
    },
  };
  const input = {
    commitProtocol: 'single-root-pointer',
    projectId: 'project-e12-multi-scene',
    roundId: 'round-e12-multi-scene',
    baseRootPointer: h('root-before'),
    currentRootPointer: h('root-before'),
    sceneIntents: [
      {
        sceneId: 'scene-a',
        sceneRevision: 'rev-a',
        beforeSha256: h('scene-a-before'),
        afterSha256: h('scene-a-after'),
        requestKey: h('request-a'),
        effectKey: h('effect-a'),
        commandEnvelopeDigest: h('envelope-a'),
        writerPlanDigest: h('plan-a'),
      },
      {
        sceneId: 'scene-b',
        sceneRevision: 'rev-b',
        beforeSha256: h('scene-b-before'),
        afterSha256: h('scene-b-after'),
        requestKey: h('request-b'),
        effectKey: h('effect-b'),
        commandEnvelopeDigest: h('envelope-b'),
        writerPlanDigest: h('plan-b'),
      },
    ],
  };
  const prepared = mod.buildRtkWordV4MultiSceneAtomicPrepare(input, { cryptoPort });
  if (prepared.ok !== true || prepared.canWrite !== false || prepared.runtimeApplyAuthorityGranted !== false) {
    issues.push(issue('RTK_V4_E12_MULTI_SCENE_PREPARE_OVERCLAIM', 'coordinatorProof.prepare', 'Prepare must remain shadow-only and cannot grant writer authority.'));
  }
  const receipts = prepared.prepareRecord?.sceneIntents?.map((intent) => ({
    sceneId: intent.sceneId,
    requestKey: intent.requestKey,
    effectKey: intent.effectKey,
    beforeSha256: intent.beforeSha256,
    afterSha256: intent.afterSha256,
    stagedOnly: true,
    canonicalSceneWritten: false,
  })) || [];
  const commit = mod.buildRtkWordV4MultiSceneAtomicCommit({
    prepareRecord: prepared.prepareRecord,
    currentRootPointer: h('root-before'),
    proposedRootPointer: h('root-after'),
    sceneReceipts: receipts,
  }, { cryptoPort });
  if (commit.ok !== true || commit.canWrite !== false || commit.runtimeApplyAuthorityGranted !== false) {
    issues.push(issue('RTK_V4_E12_MULTI_SCENE_COMMIT_OVERCLAIM', 'coordinatorProof.commit', 'Commit readiness must remain shadow-only and cannot grant writer authority.'));
  }
  const forged = mod.buildRtkWordV4MultiSceneAtomicCommit({
    prepareRecord: prepared.prepareRecord,
    currentRootPointer: h('root-before'),
    proposedRootPointer: h('root-after'),
    sceneReceipts: receipts.map((item, index) => index === 0 ? { ...item, afterSha256: h('forged-after') } : item),
  }, { cryptoPort });
  if (forged.ok !== false || forged.canWrite !== false || forged.code !== 'RTK_V4_E11_RECEIPT_MISMATCH') {
    issues.push(issue('RTK_V4_E12_MULTI_SCENE_FORGED_RECEIPT_ACCEPTED', 'coordinatorProof.forgedReceipt', 'Forged or caller-created scene receipts must not elevate to multi-scene write authority.'));
  }
  return {
    prepareCode: prepared.code || '',
    commitCode: commit.code || '',
    forgedReceiptCode: forged.code || '',
    canWrite: prepared.canWrite === true || commit.canWrite === true,
    runtimeApplyAuthorityGranted: prepared.runtimeApplyAuthorityGranted === true || commit.runtimeApplyAuthorityGranted === true,
  };
}

export async function evaluateWordV4E12MultiSceneApplyFollowup(input = {}) {
  const receipt = input.receipt || readJson(RECEIPT_PATH);
  const issues = [];
  const add = (code, field, message) => issues.push(issue(code, field, message));

  if (receipt.schemaVersion !== SCHEMA) add('RTK_V4_E12_MULTI_SCENE_SCHEMA_INVALID', 'schemaVersion', 'Multi-scene apply followup schema is invalid.');
  if (receipt.stageId !== STAGE) add('RTK_V4_E12_MULTI_SCENE_STAGE_INVALID', 'stageId', 'Multi-scene apply followup stage is invalid.');
  if (receipt.status !== STATUS || receipt.result !== 'PASS') {
    add('RTK_V4_E12_MULTI_SCENE_STATUS_INVALID', 'status', 'Followup must pass only as a typed shadow-only limitation, not runtime apply certification.');
  }
  if (receipt.nextStage !== NEXT_STAGE || receipt.saturated !== false) {
    add('RTK_V4_E12_MULTI_SCENE_SEQUENCE_INVALID', 'nextStage', 'Followup must keep Word not saturated and continue Word-only limitation work.');
  }

  const e11 = verifyBinding(receipt.boundEvidence?.e11Coordinator, E11_PATH, issues, 'boundEvidence.e11Coordinator', { requireFiles: input.requireFiles === true });
  if (input.requireFiles === true) {
    if (e11?.status !== 'MULTI_SCENE_ATOMIC_COORDINATOR_COMPONENT_PROVEN_SHADOW_ONLY'
      || e11?.componentProof?.runtimeApplyAuthorityGranted !== false
      || e11?.runtimeClaims?.automaticMultiSceneApplyAdded !== false
      || e11?.typedLimitations?.includes('PHYSICAL_WORD_MULTI_SCENE_APPLY_NOT_CERTIFIED_IN_E11') !== true) {
      add('RTK_V4_E12_MULTI_SCENE_E11_INVALID', 'boundEvidence.e11Coordinator', 'E11 must remain component-proven shadow-only with no runtime apply authority.');
    }
  }

  const decision = receipt.certificationDecision || {};
  if (decision.automaticMultiSceneApplyCertified !== false
    || decision.runtimeApplyAuthorityGranted !== false
    || decision.productWriterAuthorityAdded !== false
    || decision.shadowCoordinatorAcceptedAsRuntimeApply !== false
    || decision.typedLimitationAccepted !== true
    || decision.nextEngineeringContourRequired !== true) {
    add('RTK_V4_E12_MULTI_SCENE_DECISION_INVALID', 'certificationDecision', 'Decision must reject runtime multi-scene apply authority and preserve a typed limitation.');
  }

  const resolved = new Set(Array.isArray(receipt.resolvedLimitations) ? receipt.resolvedLimitations : []);
  const remaining = new Set(Array.isArray(receipt.remainingWordLimitations) ? receipt.remainingWordLimitations : []);
  if (!resolved.has(RESOLVED_LIMITATION)) add('RTK_V4_E12_MULTI_SCENE_RESOLUTION_MISSING', 'resolvedLimitations', 'Old uncertified multi-scene blocker must be resolved into a typed limitation.');
  if (remaining.has(RESOLVED_LIMITATION)) add('RTK_V4_E12_MULTI_SCENE_STILL_ACTIVE', 'remainingWordLimitations', 'Old uncertified multi-scene blocker cannot remain active after typed limitation certification.');
  if (!remaining.has('MODERN_REPLY_RESOLVE_REOPEN_STILL_TYPED_LIMITATION')) {
    add('RTK_V4_E12_MULTI_SCENE_REMAINING_LIMITATION_MISSING', 'remainingWordLimitations', 'Modern comment limitation must remain explicit.');
  }

  const runtime = receipt.runtimeClaims || {};
  if (runtime.productRuntimeChanged !== false
    || runtime.uiChanged !== false
    || runtime.networkDependencyAdded !== false
    || runtime.newDependencyAdded !== false
    || runtime.writerAuthorityAdded !== false
    || runtime.automaticApplyExpanded !== false
    || runtime.automaticMultiSceneApplyAdded !== false) {
    add('RTK_V4_E12_MULTI_SCENE_RUNTIME_OVERCLAIM', 'runtimeClaims', 'Followup cannot add product runtime, UI, network, dependency, writer, apply, or multi-scene authority.');
  }
  for (const [key, value] of Object.entries(receipt.vetoMetrics || {})) {
    if (Number(value) !== 0) add('RTK_V4_E12_MULTI_SCENE_VETO_NONZERO', `vetoMetrics.${key}`, 'All multi-scene followup veto metrics must be zero.');
  }

  let coordinatorProof = null;
  if (input.requireFiles === true) {
    coordinatorProof = await runCoordinatorProof(issues);
  }

  return {
    ok: issues.length === 0,
    status: issues.length === 0 ? 'PASS' : 'FAIL',
    issues,
    automaticMultiSceneApplyCertified: decision.automaticMultiSceneApplyCertified === true,
    coordinatorProof,
    saturated: receipt.saturated === true,
  };
}

async function main() {
  const json = process.argv.includes('--json');
  const result = await evaluateWordV4E12MultiSceneApplyFollowup({ requireFiles: process.argv.includes('--require-files') });
  process.stdout.write(json ? `${JSON.stringify(result, null, 2)}\n` : `RTK_WORD_V4_E12_MULTI_SCENE_APPLY_FOLLOWUP=${result.status}\n`);
  process.exit(result.ok ? 0 : 1);
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  main();
}
