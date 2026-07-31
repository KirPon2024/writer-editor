#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const RECEIPT_PATH = path.join(REPO_ROOT, 'docs', 'OPS', 'RTK', 'WORD_SAFE_SEMANTIC_ROUNDTRIP_V4_E11_MULTI_SCENE_ATOMIC_COORDINATOR_RECEIPT.json');
const MODULE_PATH = path.join(REPO_ROOT, 'src', 'io', 'revisionBridge', 'reviewTransportMultiSceneAtomicCoordinatorV4.mjs');

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function issue(code, field, message) {
  return { code, field, message };
}

export function evaluateWordV4E11MultiSceneAtomicCoordinator(input = {}) {
  const receipt = input.receipt || readJson(RECEIPT_PATH);
  const issues = [];
  const add = (code, field, message) => issues.push(issue(code, field, message));

  if (receipt.schemaVersion !== 'yalken.rtk.word-safe-semantic-roundtrip-v4.e11-multi-scene-atomic-coordinator-receipt.v1') {
    add('RTK_V4_E11_SCHEMA_INVALID', 'schemaVersion', 'E11 receipt schema is invalid.');
  }
  if (receipt.stageId !== 'EXECUTION_11_MULTI_SCENE_ATOMIC_COORDINATOR_CRASH_PROOF') {
    add('RTK_V4_E11_STAGE_INVALID', 'stageId', 'E11 stage id is invalid.');
  }
  if (receipt.status !== 'MULTI_SCENE_ATOMIC_COORDINATOR_COMPONENT_PROVEN_SHADOW_ONLY') {
    add('RTK_V4_E11_STATUS_INVALID', 'status', 'E11 status must be component proven shadow only.');
  }
  const proof = receipt.componentProof || {};
  if (proof.commitProtocol !== 'single-root-pointer' || proof.focusedContractTests !== 7) {
    add('RTK_V4_E11_PROOF_INVALID', 'componentProof', 'E11 must prove six focused single-root-pointer contract tests.');
  }
  if (proof.prepareDeterministic !== true || proof.commitRequiresAllStagedReceipts !== true || proof.recoveryClassifiesCrashWindows !== true) {
    add('RTK_V4_E11_CRASH_PROOF_MISSING', 'componentProof', 'Prepare, commit, and recovery proof flags are required.');
  }
  if (proof.runtimeApplyAuthorityGranted !== false || proof.productRuntimeChanged !== false || proof.directWriterAuthorityAdded !== false) {
    add('RTK_V4_E11_RUNTIME_OVERCLAIM', 'componentProof', 'E11 must not grant runtime apply or writer authority.');
  }
  const veto = receipt.vetoMetrics || {};
  if (veto.falseExact !== 0 || veto.wrongSceneRouting !== 0 || veto.silentApply !== 0 || veto.partialCanonicalWriteAllowed !== 0 || veto.replayFailure !== 0) {
    add('RTK_V4_E11_VETO_NONZERO', 'vetoMetrics', 'All E11 veto metrics must remain zero.');
  }
  const limitations = Array.isArray(receipt.typedLimitations) ? receipt.typedLimitations : [];
  for (const required of ['PRODUCT_MULTI_SCENE_APPLY_NOT_ENABLED_IN_E11', 'PHYSICAL_WORD_MULTI_SCENE_APPLY_NOT_CERTIFIED_IN_E11']) {
    if (!limitations.includes(required)) {
      add('RTK_V4_E11_LIMITATION_MISSING', 'typedLimitations', `Missing ${required}.`);
    }
  }
  if (input.requireSource === true) {
    if (!fs.existsSync(MODULE_PATH)) {
      add('RTK_V4_E11_SOURCE_MISSING', 'source', 'E11 coordinator source is missing.');
    } else {
      const source = fs.readFileSync(MODULE_PATH, 'utf8');
      if (/from ['"]node:/u.test(source) || ['electron', 'ipcRenderer', 'BrowserWindow', 'fetch(', 'XMLHttpRequest', 'localStorage'].some((token) => source.includes(token))) {
        add('RTK_V4_E11_PLATFORM_BOUNDARY_BROKEN', 'source', 'E11 coordinator must stay platform-neutral.');
      }
    }
  }
  return {
    ok: issues.length === 0,
    status: issues.length === 0 ? 'PASS' : 'FAIL',
    issues,
    focusedContractTests: proof.focusedContractTests || 0,
  };
}

function main() {
  const json = process.argv.includes('--json');
  const result = evaluateWordV4E11MultiSceneAtomicCoordinator({ requireSource: process.argv.includes('--require-source') });
  process.stdout.write(json ? `${JSON.stringify(result, null, 2)}\n` : `RTK_WORD_V4_E11_MULTI_SCENE_ATOMIC_COORDINATOR=${result.status}\n`);
  process.exit(result.ok ? 0 : 1);
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  main();
}
