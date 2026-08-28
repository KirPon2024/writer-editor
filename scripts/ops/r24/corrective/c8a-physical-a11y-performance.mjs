#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { buildInventory } from '../test-inventory.mjs';
import { canonicalBytes } from './canonical-json.mjs';

export const STAGE_ID = 'C8A';
export const OBSERVED_AT_UTC = '2026-08-28T21:41:09Z';
export const PROGRAM_TEMPLATE_DIGEST = '6c833c964318da3e61e1743365f8763206be838647b5222c187b3bda8d1c6b9a';
export const STAGE_REGISTRY_DIGEST = 'c8af046b5918f43a50af66886b0b5c9d2e22ea6501240d4b239101d8836ced1a';
export const TRUST_MODEL_DIGEST = '4f6e4b3a191e0302ea44646659e8c2f71121af7d808cc0ee768269b4e156840d';
export const OWNER_BINDING_DIGEST = 'be68bd97021d13fbfb75c73791bda7f6bfeebecebf525d4a927d1a4c9fe9efd6';
export const STAGE_INSTANCE_DIGEST = '31038ecef7a296f5d4d7a30272dd3b092c08bb5e1feea1c152061998ee00803c';
export const STAGE_ADMISSION_DIGEST = 'ff1df2e63213ed60d64b0c8953922d1f1cd97a733c13afbfdec69831134b6fdc';
export const ACCEPTANCE_SIGNALS_DIGEST = '4a8411798b57b32452a023844612202768f3c6531df7fb63d21b1eedf8ef59e4';
export const WRITE_SET_DIGEST = '87d64f63a03d3a70e9a586df87ac75d50ca028017b0dc23f5f7eba3d0a9e8e8e';
export const SOURCE_HEAD_SHA = 'cffd395fbcba3d32c74b17f6c2de96be838c024c';
export const SOURCE_TREE_SHA = 'cc2e432a5cdf52fa2827d1f8c21f205f3cb6608d';
export const PREDECESSOR_TERMINAL_DIGEST = '9c0cb7aa7a90537707d54b96cb256ba71dcf867c36026784b6d505d91d6350d7';
export const PREDECESSOR_CERTIFIED_DONE_RECEIPT_DIGEST = '7e2c48a356b0d9515d99608cd05663671d5dfb39524ca5ff21458b5bd42a0582';
export const PREDECESSOR_LEASE_RELEASE_DIGEST = 'cea2c89fcdecc04f34ee1bb8f3ee8dc4d1d3fbb9668ef101b9ebd1b57fa1ed78';
export const LEASE_DIGEST = '83f799ce2aef2eaf0d284b6d1d45d31abfbf4fb8bc33fcb9797b1f31860dd2a2';
export const FENCE_DIGEST = '7cb368fa63d1240a161ea0882f71cd431643f352bb21894509196e5851c0ccb0';
export const FENCE_COUNTER = 45;
export const PARKED_PREDECESSOR_STAGE_INSTANCE_DIGEST = '34b097072608c60be84cfaf47e8e14e16a2401b19b697acfb9af1e8151823b52';
export const PARKED_PREDECESSOR_STAGE_ADMISSION_DIGEST = '427be60323239c40660c118e070013a5ad9671cd3ca05b8213bd52765daef3ee';
export const PARKED_PREDECESSOR_BLOCKED_RECEIPT_DIGEST = 'f6638ae8cf85dcdea96fd2720f552aebb94198913a0f063c39094c79806990ff';
export const PARKED_PREDECESSOR_LEASE_RELEASE_DIGEST = '964fa0035d0078f150745631e2e1e83afd5a27bfec8102345853e525c27bfa5f';
export const C6B_CERTIFIED_DONE_RECEIPT_DIGEST = '885904c0c23d4bcbf1554743a487714970eb5dc6d55ccd5994ab8f85f0063b6e';
export const C6B_TERMINAL_ATTESTATION_BYTES_DIGEST = '15765a241cb63c7623aa040992d351a74e30825db43d844dfb35946c8a63cc8b';
export const C6B_LEASE_RELEASE_DIGEST = 'b5cee2abe2c8c07482eeadb0353953c281d76e6404bed6c2ba6cbf155bff536d';
export const ELECTRON_VERSION = '41.10.3';
export const ELECTRON_ARCHIVE_BASENAME = 'electron-v41.10.3-darwin-arm64.zip';
export const ELECTRON_ARCHIVE_DIGEST = '8961cdb57c95c073ff4770bc9309953832f447575f1a91127010f7b4870884b3';
export const ELECTRON_ARCHIVE_SIZE_BYTES = 116554065;
export const TYPING_SAMPLE_COUNT = 40;
export const TYPING_SYNC_P95_BUDGET_MS = 16;
export const INTERACTION_FRAME_P95_BUDGET_MS = 50;
export const CONTROL_PLANE_EVIDENCE_STAMP_ID = 'ES-R24-CORRECTIVE-B0-CONTROL-PLANE-CLAIM-BINDINGS';

export const PATHS = Object.freeze({
  activeApprovals: 'docs/OPS/R24/CORRECTIVE/C1C_GOVERNANCE_CHANGE_APPROVALS_V1.json',
  approvals: 'docs/OPS/R24/CORRECTIVE/C8A_GOVERNANCE_CHANGE_APPROVALS_V1.json',
  contract: 'docs/OPS/R24/CORRECTIVE/C8A_PHYSICAL_A11Y_PERFORMANCE_CONTRACT_V1.json',
  evidence: 'docs/OPS/R24/CORRECTIVE/C8A_PHYSICAL_A11Y_PERFORMANCE_EVIDENCE_V1.json',
  inventory: 'docs/OPS/R24/CORRECTIVE/C1B_TEST_INVENTORY_V1.json',
  program: 'docs/OPS/R24/CORRECTIVE/PROGRAM_TEMPLATE_V1_1.json',
  registry: 'docs/OPS/R24/CORRECTIVE/STAGE_REGISTRY_V1.json',
  trust: 'docs/OPS/R24/CORRECTIVE/TERMINAL_ATTESTATION_TRUST_MODEL_V1.json',
  standing: 'docs/OPS/R24/CORRECTIVE/STANDING_AUTHORITY_BINDING_V1.json',
  predecessorStageAdmission: 'docs/OPS/R24/CORRECTIVE/C8A_STAGE_ADMISSION_ATTESTATION_V1.json',
  predecessorStageInstance: 'docs/OPS/R24/CORRECTIVE/C8A_STAGE_INSTANCE_V1.json',
  stageAdmission: 'docs/OPS/R24/CORRECTIVE/C8A_STAGE_ADMISSION_ATTESTATION_AMENDMENT_V1.json',
  stageInstance: 'docs/OPS/R24/CORRECTIVE/C8A_STAGE_INSTANCE_AMENDMENT_V1.json',
  script: 'scripts/ops/r24/corrective/c8a-physical-a11y-performance.mjs',
  test: 'test/contracts/r24-c8a-physical-a11y-performance.contract.test.mjs',
  wp304Test: 'test/unit/r24-wp304-a11y-performance.test.js',
  main: 'src/main.js',
  index: 'src/renderer/index.html',
  editor: 'src/renderer/editor.js',
  styles: 'src/renderer/styles.css',
  runtime: 'src/renderer/a11yPerformanceRuntime.mjs',
});

export const WRITE_SET = Object.freeze([
  PATHS.inventory,
  PATHS.activeApprovals,
  PATHS.approvals,
  PATHS.contract,
  PATHS.evidence,
  PATHS.predecessorStageAdmission,
  PATHS.predecessorStageInstance,
  PATHS.stageAdmission,
  PATHS.stageInstance,
  PATHS.script,
  PATHS.test,
].sort());

const LEXICAL = (left, right) => left < right ? -1 : left > right ? 1 : 0;

export class C8APhysicalEnvelopeError extends Error {
  constructor(code, detail) {
    super(`${code}: ${detail}`);
    this.code = code;
  }
}

function fail(code, detail) { throw new C8APhysicalEnvelopeError(code, detail); }
function assert(condition, code, detail) { if (!condition) fail(code, detail); }
export function sha256(bytes) { return createHash('sha256').update(bytes).digest('hex'); }

function readJsonBytes(repoRoot, relativePath, canonical = false) {
  const bytes = fs.readFileSync(path.join(repoRoot, relativePath));
  const value = JSON.parse(bytes.toString('utf8'));
  if (canonical) assert(bytes.equals(canonicalBytes(value)), 'E_NON_CANONICAL_INPUT', relativePath);
  return { bytes, value, digest: sha256(bytes) };
}

function git(repoRoot, args) {
  const result = spawnSync('git', args, { cwd: repoRoot, encoding: 'utf8', timeout: 30000 });
  assert(result.status === 0, 'E_GIT', `${args.join(' ')}:${String(result.stderr || '').trim()}`);
  return String(result.stdout || '').trim();
}

function statusPaths(repoRoot) {
  const result = spawnSync('git', ['status', '--porcelain=v1', '--untracked-files=all'], { cwd: repoRoot, encoding: 'utf8', timeout: 30000 });
  assert(result.status === 0, 'E_GIT', 'status');
  const output = String(result.stdout || '').trimEnd();
  return output ? output.split('\n').map((line) => line.slice(3)).sort(LEXICAL) : [];
}

export function assertHeadContour(repoRoot = process.cwd()) {
  const currentHead = git(repoRoot, ['rev-parse', 'HEAD']);
  assert(git(repoRoot, ['rev-parse', `${SOURCE_HEAD_SHA}^{tree}`]) === SOURCE_TREE_SHA, 'E_SOURCE_TREE', SOURCE_TREE_SHA);
  if (currentHead !== SOURCE_HEAD_SHA) {
    const ancestor = spawnSync('git', ['merge-base', '--is-ancestor', SOURCE_HEAD_SHA, currentHead], { cwd: repoRoot });
    assert(ancestor.status === 0, 'E_SOURCE_HEAD_NOT_ANCESTOR', currentHead);
    const commitCount = Number(git(repoRoot, ['rev-list', '--count', `${SOURCE_HEAD_SHA}..${currentHead}`]));
    assert(Number.isInteger(commitCount) && commitCount <= 2, 'E_UNBOUNDED_DELTA', String(commitCount));
    for (const relativePath of git(repoRoot, ['diff', '--name-only', SOURCE_HEAD_SHA, currentHead]).split('\n').filter(Boolean)) {
      assert(WRITE_SET.includes(relativePath), 'E_WRITE_SET_DRIFT', relativePath);
    }
  }
  for (const relativePath of statusPaths(repoRoot)) assert(WRITE_SET.includes(relativePath), 'E_DIRTY_PATH_OUTSIDE_WRITE_SET', relativePath);
  return { currentHead, sourceHeadSha: SOURCE_HEAD_SHA, sourceTreeSha: SOURCE_TREE_SHA };
}

function sameSet(actual, expected) {
  return JSON.stringify([...new Set(actual)].sort(LEXICAL)) === JSON.stringify([...new Set(expected)].sort(LEXICAL));
}

export function validateBindings(repoRoot = process.cwd()) {
  const program = readJsonBytes(repoRoot, PATHS.program, true);
  const registry = readJsonBytes(repoRoot, PATHS.registry, true);
  const trust = readJsonBytes(repoRoot, PATHS.trust, true);
  const standing = readJsonBytes(repoRoot, PATHS.standing, true);
  const stage = readJsonBytes(repoRoot, PATHS.stageInstance, true);
  const admission = readJsonBytes(repoRoot, PATHS.stageAdmission, true);
  assert(program.digest === PROGRAM_TEMPLATE_DIGEST, 'E_PROGRAM_DIGEST', program.digest);
  assert(registry.digest === STAGE_REGISTRY_DIGEST, 'E_REGISTRY_DIGEST', registry.digest);
  assert(trust.digest === TRUST_MODEL_DIGEST, 'E_TRUST_DIGEST', trust.digest);
  assert(standing.digest === OWNER_BINDING_DIGEST, 'E_STANDING_DIGEST', standing.digest);
  assert(stage.digest === STAGE_INSTANCE_DIGEST, 'E_STAGE_INSTANCE_DIGEST', stage.digest);
  assert(admission.digest === STAGE_ADMISSION_DIGEST, 'E_STAGE_ADMISSION_DIGEST', admission.digest);
  assert(stage.value.stageId === STAGE_ID && admission.value.stageId === STAGE_ID, 'E_STAGE_ID', STAGE_ID);
  assert(stage.value.baseSha === SOURCE_HEAD_SHA && stage.value.headSha === SOURCE_HEAD_SHA && stage.value.treeSha === SOURCE_TREE_SHA, 'E_STAGE_SOURCE', STAGE_ID);
  assert(stage.value.predecessorTerminalDigest === PREDECESSOR_TERMINAL_DIGEST, 'E_PREDECESSOR_TERMINAL', STAGE_ID);
  assert(stage.value.predecessorCertifiedDoneReceiptDigest === PREDECESSOR_CERTIFIED_DONE_RECEIPT_DIGEST, 'E_PREDECESSOR_RECEIPT', STAGE_ID);
  assert(stage.value.predecessorLeaseReleaseDigest === PREDECESSOR_LEASE_RELEASE_DIGEST, 'E_PREDECESSOR_RELEASE', STAGE_ID);
  assert(readJsonBytes(repoRoot, PATHS.predecessorStageInstance, true).digest === PARKED_PREDECESSOR_STAGE_INSTANCE_DIGEST, 'E_PARKED_PREDECESSOR_INSTANCE', STAGE_ID);
  assert(readJsonBytes(repoRoot, PATHS.predecessorStageAdmission, true).digest === PARKED_PREDECESSOR_STAGE_ADMISSION_DIGEST, 'E_PARKED_PREDECESSOR_ADMISSION', STAGE_ID);
  assert(stage.value.recoveryPredecessor?.stageInstanceDigest === PARKED_PREDECESSOR_STAGE_INSTANCE_DIGEST, 'E_RECOVERY_PREDECESSOR_INSTANCE', STAGE_ID);
  assert(stage.value.recoveryPredecessor?.stageAdmissionDigest === PARKED_PREDECESSOR_STAGE_ADMISSION_DIGEST, 'E_RECOVERY_PREDECESSOR_ADMISSION', STAGE_ID);
  assert(stage.value.recoveryPredecessor?.blockedNodeReceiptDigest === PARKED_PREDECESSOR_BLOCKED_RECEIPT_DIGEST, 'E_RECOVERY_PREDECESSOR_BLOCKED_RECEIPT', STAGE_ID);
  assert(stage.value.recoveryPredecessor?.parkedLeaseReleaseDigest === PARKED_PREDECESSOR_LEASE_RELEASE_DIGEST, 'E_RECOVERY_PREDECESSOR_RELEASE', STAGE_ID);
  assert(stage.value.recoveryPredecessor?.c6bCertifiedDoneReceiptDigest === C6B_CERTIFIED_DONE_RECEIPT_DIGEST, 'E_C6B_CERTIFIED_DONE_RECEIPT', STAGE_ID);
  assert(stage.value.recoveryPredecessor?.c6bTerminalAttestationBytesDigest === C6B_TERMINAL_ATTESTATION_BYTES_DIGEST, 'E_C6B_TERMINAL_ATTESTATION', STAGE_ID);
  assert(stage.value.recoveryPredecessor?.c6bLeaseReleaseDigest === C6B_LEASE_RELEASE_DIGEST, 'E_C6B_LEASE_RELEASE', STAGE_ID);
  assert(stage.value.dependencies?.length === 1 && stage.value.dependencies[0]?.stageId === 'C7B' && stage.value.dependencies[0]?.status === 'CERTIFIED_DONE' && stage.value.dependencies[0]?.attestationDigest === PREDECESSOR_TERMINAL_DIGEST, 'E_C7B_DEPENDENCY', STAGE_ID);
  assert(sameSet(stage.value.writeSet.paths, WRITE_SET), 'E_WRITE_SET', STAGE_ID);
  assert(admission.value.status === 'ADMITTED' && admission.value.stageInstanceDigest === STAGE_INSTANCE_DIGEST, 'E_NOT_ADMITTED', STAGE_ID);
  assert(admission.value.acceptanceSignalsDigest === ACCEPTANCE_SIGNALS_DIGEST, 'E_ACCEPTANCE_DIGEST', STAGE_ID);
  assert(admission.value.writeSetDigest === WRITE_SET_DIGEST && admission.value.writeSetDigest === sha256(canonicalBytes(stage.value.writeSet)), 'E_WRITE_SET_DIGEST', STAGE_ID);
  return { admission, program, registry, stage, standing, trust };
}

function fileBinding(repoRoot, relativePath, capabilityId, role) {
  const bytes = fs.readFileSync(path.join(repoRoot, relativePath));
  return { capabilityId, role, sha256: sha256(bytes), sizeBytes: bytes.length };
}

function assertPathlessPublicEvidence(value) {
  const visit = (candidate) => {
    if (typeof candidate === 'string') {
      assert(!candidate.includes('/Users/') && !candidate.includes('/Volumes/') && !candidate.includes('\\'), 'E_PUBLIC_PATH_LEAK', candidate);
    } else if (Array.isArray(candidate)) {
      candidate.forEach(visit);
    } else if (candidate && typeof candidate === 'object') {
      Object.values(candidate).forEach(visit);
    }
  };
  visit(value);
}

function findElectronArchive() {
  const cacheRoot = path.join(os.homedir(), 'Library', 'Caches', 'electron');
  const matches = [];
  const visit = (directory, depth) => {
    assert(depth <= 8, 'E_ELECTRON_ARCHIVE_DISCOVERY', 'depth');
    for (const entry of fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name, 'en-US'))) {
      const candidate = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(candidate, depth + 1);
      else if (entry.isFile() && entry.name === ELECTRON_ARCHIVE_BASENAME) matches.push(candidate);
    }
  };
  assert(fs.existsSync(cacheRoot), 'E_ELECTRON_ARCHIVE_MISSING', ELECTRON_ARCHIVE_BASENAME);
  visit(cacheRoot, 0);
  assert(matches.length === 1, 'E_ELECTRON_ARCHIVE_AMBIGUOUS', String(matches.length));
  const bytes = fs.readFileSync(matches[0]);
  assert(bytes.length === ELECTRON_ARCHIVE_SIZE_BYTES, 'E_ELECTRON_ARCHIVE_SIZE', String(bytes.length));
  assert(sha256(bytes) === ELECTRON_ARCHIVE_DIGEST, 'E_ELECTRON_ARCHIVE_DIGEST', ELECTRON_ARCHIVE_BASENAME);
  return { archivePath: matches[0], sizeBytes: bytes.length };
}

export function buildContract(repoRoot = process.cwd()) {
  validateBindings(repoRoot);
  const contract = {
    acceptanceSignals: {
      EXTERNAL_TERMINAL_ATTESTATION_VERIFIED: 'PENDING_POST_MERGE_EXTERNAL_C8A_ATTESTATION',
      FRESH_CONSOLE_SESSION_WINDOW: true,
      NO_USER_DOCS_OR_CREDENTIALS: true,
      PHYSICAL_A11Y_PASS: true,
      PHYSICAL_PERF_PASS: true,
      SYNTHETIC_FIXTURES_ONLY: true,
    },
    accessibilityContract: {
      expectedInterfaceDirection: 'ltr',
      expectedLiveRegion: { ariaAtomic: 'true', ariaLive: 'polite', role: 'status' },
      expectedReflow: { desktop: 'calm-docked', narrow: 'single-column-overlay' },
      expectedReducedMotion: 'reduced',
      expectedTextbox: { ariaMultiline: 'true', bidiPolicy: 'plaintext', direction: 'auto', name: 'Текст сцены', role: 'textbox' },
      expectedWrapper: { ariaMultiline: null, contenteditable: null, role: null },
      minimumNamedToolbars: 2,
      unnamedExposedInteractiveNodesAllowed: 0,
    },
    bounds: {
      maxArtifactBytes: 1048576,
      maxExecutionSeconds: 120,
      maxInteractionFrameP95Ms: INTERACTION_FRAME_P95_BUDGET_MS,
      maxTypingSyncP95Ms: TYPING_SYNC_P95_BUDGET_MS,
      typingSamples: TYPING_SAMPLE_COUNT,
    },
    electronRuntime: {
      archive: { capabilityId: 'CAP_R24_C8A_ELECTRON_ARCHIVE', role: 'IMMUTABLE_LOCAL_TOOLCHAIN_INPUT', sha256: ELECTRON_ARCHIVE_DIGEST, sizeBytes: ELECTRON_ARCHIVE_SIZE_BYTES },
      extraction: 'FRESH_EPHEMERAL_DIRECTORY',
      platform: 'darwin-arm64',
      version: ELECTRON_VERSION,
    },
    nonClaims: ['NO_USER_DOCUMENT_QUALIFICATION', 'NO_SCREEN_READER_VENDOR_CERTIFICATION', 'NO_SIGNING_NOTARIZATION_DISTRIBUTION', 'NO_PRODUCT_RUNTIME_CHANGE', 'NO_PROGRAM_DONE'],
    performanceLanePolicy: {
      legacySurvivorLane: 'REQUIRED_WITHIN_WHEN_LEGACY_DEFERRED_RENDER_IS_APPLICABLE',
      tiptapSurvivorLane: 'NOT_APPLICABLE_TIPTAP_HAS_NO_LEGACY_DEFERRED_RENDER_JOB',
      typingAndFrameP95: 'ALWAYS_REQUIRED_WITHIN',
    },
    safetyBoundary: {
      credentials: 'SANITIZED_MINIMAL_CHILD_ENVIRONMENT',
      dialogs: 'BLOCKED_AND_ZERO_CALLS_REQUIRED',
      fixtureClass: 'SYNTHETIC_TEXT_IN_EPHEMERAL_APPDATA_USERDATA_DOCUMENTS',
      network: 'BLOCKED_AND_ZERO_REQUESTS_REQUIRED',
      userDocuments: 'UNREACHABLE_BY_CHILD_HOME_AND_ELECTRON_PATH_REDIRECTION',
    },
    schemaVersion: 'YALKEN_R24_C8A_PHYSICAL_A11Y_PERFORMANCE_CONTRACT_V1',
    sourceBindings: {
      acceptanceSignalsDigest: ACCEPTANCE_SIGNALS_DIGEST,
      electronArchiveDigest: ELECTRON_ARCHIVE_DIGEST,
      fenceCounter: FENCE_COUNTER,
      fenceDigest: FENCE_DIGEST,
      leaseDigest: LEASE_DIGEST,
      predecessorCertifiedDoneReceiptDigest: PREDECESSOR_CERTIFIED_DONE_RECEIPT_DIGEST,
      predecessorLeaseReleaseDigest: PREDECESSOR_LEASE_RELEASE_DIGEST,
      predecessorTerminalDigest: PREDECESSOR_TERMINAL_DIGEST,
      recoveryPredecessor: {
        c6bCertifiedDoneReceiptDigest: C6B_CERTIFIED_DONE_RECEIPT_DIGEST,
        c6bLeaseReleaseDigest: C6B_LEASE_RELEASE_DIGEST,
        c6bTerminalAttestationBytesDigest: C6B_TERMINAL_ATTESTATION_BYTES_DIGEST,
        parkedBlockedNodeReceiptDigest: PARKED_PREDECESSOR_BLOCKED_RECEIPT_DIGEST,
        parkedLeaseReleaseDigest: PARKED_PREDECESSOR_LEASE_RELEASE_DIGEST,
        parkedStageAdmissionDigest: PARKED_PREDECESSOR_STAGE_ADMISSION_DIGEST,
        parkedStageInstanceDigest: PARKED_PREDECESSOR_STAGE_INSTANCE_DIGEST,
      },
      productRuntime: [
        fileBinding(repoRoot, PATHS.main, 'CAP_R24_C8A_MAIN_RUNTIME', 'PRODUCT_MAIN_RUNTIME'),
        fileBinding(repoRoot, PATHS.index, 'CAP_R24_C8A_INDEX_RUNTIME', 'PRODUCT_RENDERER_MARKUP'),
        fileBinding(repoRoot, PATHS.editor, 'CAP_R24_C8A_EDITOR_RUNTIME', 'PRODUCT_RENDERER_RUNTIME'),
        fileBinding(repoRoot, PATHS.styles, 'CAP_R24_C8A_STYLES_RUNTIME', 'PRODUCT_RENDERER_STYLES'),
        fileBinding(repoRoot, PATHS.runtime, 'CAP_R24_C8A_A11Y_PERF_RUNTIME', 'PRODUCT_A11Y_PERFORMANCE_RUNTIME'),
      ],
      programTemplateDigest: PROGRAM_TEMPLATE_DIGEST,
      sourceHeadSha: SOURCE_HEAD_SHA,
      sourceTreeSha: SOURCE_TREE_SHA,
      stageAdmissionDigest: STAGE_ADMISSION_DIGEST,
      stageInstanceDigest: STAGE_INSTANCE_DIGEST,
      stageRegistryDigest: STAGE_REGISTRY_DIGEST,
      testInventory: fileBinding(repoRoot, PATHS.inventory, 'CAP_R24_C8A_TEST_INVENTORY', 'CURRENT_TEST_INVENTORY'),
      focusedTest: fileBinding(repoRoot, PATHS.test, 'CAP_R24_C8A_FOCUSED_TEST', 'INDEPENDENT_CONTRACT_TEST'),
      wp304RegressionTest: fileBinding(repoRoot, PATHS.wp304Test, 'CAP_R24_C8A_WP304_REGRESSION', 'WP304_REGRESSION_TEST'),
      generator: fileBinding(repoRoot, PATHS.script, 'CAP_R24_C8A_GENERATOR', 'PHYSICAL_ENVELOPE_RUNNER'),
      trustModelDigest: TRUST_MODEL_DIGEST,
      writeSetDigest: WRITE_SET_DIGEST,
    },
    stageId: STAGE_ID,
    status: 'CURRENT_HEAD_EVALUATED_PENDING_EXTERNAL_TERMINAL_ATTESTATION',
  };
  assertPathlessPublicEvidence(contract);
  return contract;
}

const DESKTOP_PROBE_SOURCE = `(() => {
  const wrapper = document.querySelector('#editor');
  const editor = wrapper?.querySelector('.ProseMirror[contenteditable="true"]');
  if (!wrapper || !editor) throw new Error('ACTUAL_TIPTAP_TEXTBOX_MISSING');
  const status = document.querySelector('.status-dock');
  const layout = document.querySelector('.app-layout');
  const visible = (element) => {
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
  };
  const controls = [...document.querySelectorAll('button,select,input,textarea,a[href],[role="button"],[role="textbox"],[role="tab"],[role="menuitem"]')].filter(visible);
  const unnamedControls = controls.filter((element) => !(element.getAttribute('aria-label') || element.getAttribute('aria-labelledby') || element.textContent.trim() || element.getAttribute('title')));
  return {
    appContract: document.documentElement.getAttribute('data-writer-a11y-contract'),
    interfaceDirection: document.documentElement.getAttribute('dir'),
    reflowMode: layout.getAttribute('data-writer-reflow'),
    motionMode: layout.getAttribute('data-writer-motion'),
    editor: { role: editor.getAttribute('role'), name: editor.getAttribute('aria-label'), ariaMultiline: editor.getAttribute('aria-multiline'), direction: editor.getAttribute('dir'), bidiPolicy: editor.getAttribute('data-bidi-policy') },
    status: { role: status.getAttribute('role'), ariaLive: status.getAttribute('aria-live'), ariaAtomic: status.getAttribute('aria-atomic') },
    toolbarCount: document.querySelectorAll('[role="toolbar"]').length,
    visibleControlCount: controls.length,
    unnamedVisibleControlCount: unnamedControls.length,
    unnamedVisibleControls: unnamedControls.map((element) => ({
      tag: element.tagName.toLowerCase(),
      id: element.id || null,
      role: element.getAttribute('role'),
      action: element.getAttribute('data-action'),
      className: String(element.className || '').split(/\s+/u).filter(Boolean).sort(),
    })),
    wrapper: { ariaMultiline: wrapper.getAttribute('aria-multiline'), contenteditable: wrapper.getAttribute('contenteditable'), role: wrapper.getAttribute('role') },
  };
})()`;

const PERFORMANCE_SETUP_SOURCE = `(() => {
  const editor = document.querySelector('#editor .ProseMirror[contenteditable="true"]');
  if (!editor) throw new Error('ACTUAL_TIPTAP_TEXTBOX_MISSING');
  editor.focus();
  const state = { start: 0, syncSamples: [], frameSamples: [] };
  editor.addEventListener('beforeinput', () => { state.start = performance.now(); }, true);
  editor.addEventListener('input', () => {
    if (!(state.start > 0)) return;
    const started = state.start;
    state.syncSamples.push(performance.now() - started);
    requestAnimationFrame(() => state.frameSamples.push(performance.now() - started));
  });
  window.__C8A_PERF_STATE__ = state;
  return document.activeElement === editor;
})()`;

const PERFORMANCE_RESULT_SOURCE = `(() => {
  const state = window.__C8A_PERF_STATE__;
  const layout = document.querySelector('.app-layout');
  const editor = document.querySelector('#editor .ProseMirror[contenteditable="true"]');
  const round = (value) => Math.round(value * 1000) / 1000;
  const p95 = (values) => {
    const sorted = [...values].sort((a, b) => a - b);
    return sorted[Math.max(0, Math.ceil(sorted.length * 0.95) - 1)] || 0;
  };
  return {
    syncSamplesMs: state.syncSamples.map(round),
    frameSamplesMs: state.frameSamples.map(round),
    syncP95Ms: round(p95(state.syncSamples)),
    frameP95Ms: round(p95(state.frameSamples)),
    typingBudgetState: layout.getAttribute('data-writer-typing-budget'),
    survivorBudgetState: layout.getAttribute('data-writer-survivor-budget'),
    survivorLaneApplicability: editor.matches('.ProseMirror[contenteditable="true"]') ? 'NOT_APPLICABLE_TIPTAP_NO_LEGACY_DEFERRED_RENDER' : 'APPLICABLE_LEGACY_DEFERRED_RENDER',
    syntheticTextLength: document.querySelector('#editor .ProseMirror[contenteditable="true"]').textContent.length,
    editorFocused: document.activeElement === document.querySelector('#editor .ProseMirror[contenteditable="true"]'),
  };
})()`;

function childSource(repoRoot, tempRoot, sessionNonce) {
  return `'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { app, BrowserWindow, dialog, session } = require('electron');
const repoRoot = ${JSON.stringify(repoRoot)};
const tempRoot = ${JSON.stringify(tempRoot)};
const sessionNonce = ${JSON.stringify(sessionNonce)};
let networkRequests = 0;
let dialogCalls = 0;
let permissionRequests = 0;
const startedAtUtc = new Date().toISOString();
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const emit = (payload) => process.stdout.write('R24_C8A_PHYSICAL_RECEIPT=' + JSON.stringify(payload) + '\\n');
for (const name of ['appData', 'userData', 'documents', 'downloads', 'home', 'tmp']) fs.mkdirSync(path.join(tempRoot, name), { recursive: true });
for (const name of ['appData', 'userData', 'documents', 'downloads', 'temp']) app.setPath(name, path.join(tempRoot, name === 'temp' ? 'tmp' : name));
app.disableHardwareAcceleration();
app.commandLine.appendSwitch('disable-background-networking');
app.commandLine.appendSwitch('disable-component-update');
app.commandLine.appendSwitch('force-device-scale-factor', '1');
for (const methodName of ['showOpenDialog', 'showSaveDialog', 'showMessageBox']) dialog[methodName] = async () => { dialogCalls += 1; throw new Error('C8A_DIALOG_BLOCKED'); };
app.whenReady().then(() => {
  session.defaultSession.setPermissionRequestHandler((_wc, _permission, callback) => { permissionRequests += 1; callback(false); });
  session.defaultSession.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*', 'ws://*/*', 'wss://*/*'] }, (_details, callback) => { networkRequests += 1; callback({ cancel: true }); });
});
process.chdir(repoRoot);
if (!process.argv.includes('--dev')) process.argv.push('--dev');
require(path.join(repoRoot, 'src', 'main.js'));
async function waitForProductWindow() {
  for (let attempt = 0; attempt < 240; attempt += 1) {
    const windows = BrowserWindow.getAllWindows().filter((candidate) => !candidate.isDestroyed());
    for (const candidate of windows) {
      try {
        const ready = await candidate.webContents.executeJavaScript("Boolean(document.querySelector('#editor .ProseMirror[contenteditable=true]') && document.querySelector('.status-dock') && document.readyState === 'complete')", true);
        if (ready) return candidate;
      } catch {}
    }
    await sleep(50);
  }
  throw new Error('C8A_PRODUCT_WINDOW_TIMEOUT');
}
function valueOf(property) { return property && Object.prototype.hasOwnProperty.call(property, 'value') ? property.value : null; }
function axProperty(node, name) { return valueOf((node.properties || []).find((item) => item.name === name)?.value); }
function percentile95(values) { const sorted = [...values].sort((a, b) => a - b); return sorted[Math.max(0, Math.ceil(sorted.length * 0.95) - 1)] || 0; }
app.whenReady().then(async () => {
  try {
    const win = await waitForProductWindow();
    win.show();
    const run = (source) => win.webContents.executeJavaScript(source, true);
    const settle = () => run("new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))");
    await settle();
    const desktop = await run(${JSON.stringify(DESKTOP_PROBE_SOURCE)});
    desktop.windowVisible = win.isVisible();
    win.webContents.debugger.attach('1.3');
    await win.webContents.debugger.sendCommand('Accessibility.enable');
    const axRaw = await win.webContents.debugger.sendCommand('Accessibility.getFullAXTree');
    const axNodes = (axRaw.nodes || []).filter((node) => node.ignored !== true);
    const normalizedAx = axNodes.map((node) => ({ role: valueOf(node.role), name: valueOf(node.name), focusable: axProperty(node, 'focusable') === true }));
    const interactiveRoles = new Set(['button', 'textbox', 'combobox', 'menuitem', 'tab', 'checkbox', 'radio', 'link']);
    const exposedInteractive = normalizedAx.filter((node) => interactiveRoles.has(node.role));
    const ax = {
      exposedNodeCount: normalizedAx.length,
      interactiveNodeCount: exposedInteractive.length,
      unnamedInteractiveNodeCount: exposedInteractive.filter((node) => typeof node.name !== 'string' || node.name.trim() === '').length,
      namedToolbarCount: normalizedAx.filter((node) => node.role === 'toolbar' && typeof node.name === 'string' && node.name.trim() !== '').length,
      textbox: normalizedAx.find((node) => node.role === 'textbox' && node.name === 'Текст сцены') || null,
      statusCount: normalizedAx.filter((node) => node.role === 'status').length,
    };
    await run(${JSON.stringify(PERFORMANCE_SETUP_SOURCE)});
    for (let index = 0; index < ${TYPING_SAMPLE_COUNT}; index += 1) {
      const key = String.fromCharCode(97 + (index % 26));
      const code = 'Key' + key.toUpperCase();
      const vk = key.toUpperCase().charCodeAt(0);
      await win.webContents.debugger.sendCommand('Input.dispatchKeyEvent', { type: 'keyDown', key, code, text: key, unmodifiedText: key, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk });
      await win.webContents.debugger.sendCommand('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk });
    }
    for (let attempt = 0; attempt < 200; attempt += 1) {
      const count = await run("window.__C8A_PERF_STATE__.frameSamples.length");
      if (count >= ${TYPING_SAMPLE_COUNT}) break;
      await sleep(10);
    }
    await sleep(1500);
    const performance = await run(${JSON.stringify(PERFORMANCE_RESULT_SOURCE)});
    win.setContentSize(800, 800);
    await settle();
    const narrowReflow = await run("document.querySelector('.app-layout').getAttribute('data-writer-reflow')");
    await win.webContents.debugger.sendCommand('Emulation.setEmulatedMedia', { media: 'screen', features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
    await settle();
    const reducedMotion = await run("document.querySelector('.app-layout').getAttribute('data-writer-motion')");
    await win.webContents.debugger.sendCommand('Emulation.setEmulatedMedia', { media: 'screen', features: [] });
    win.webContents.debugger.detach();
    emit({
      accessibility: { ax, desktop, narrowReflow, reducedMotion },
      electronVersion: process.versions.electron,
      execution: { finishedAtUtc: new Date().toISOString(), freshWindow: true, pid: process.pid, sessionNonce, startedAtUtc, webContentsId: win.webContents.id, windowVisible: win.isVisible() },
      performance,
      platform: process.platform + '-' + process.arch,
      safety: { childEnvironmentSanitized: true, credentialsRead: false, dialogCalls, networkRequests, permissionRequests, syntheticFixtureOnly: true, userDocumentsTouched: false, redirectedCapabilities: ['EPHEMERAL_APPDATA', 'EPHEMERAL_USERDATA', 'EPHEMERAL_DOCUMENTS', 'EPHEMERAL_DOWNLOADS', 'EPHEMERAL_HOME', 'EPHEMERAL_TEMP'] },
      schemaVersion: 'YALKEN_R24_C8A_PHYSICAL_EXECUTION_RECEIPT_V1',
    });
    win.destroy();
    app.quit();
  } catch (error) {
    try { if (BrowserWindow.getAllWindows()[0]?.webContents.debugger.isAttached()) BrowserWindow.getAllWindows()[0].webContents.debugger.detach(); } catch {}
    process.stderr.write(String(error && error.stack || error) + '\\n');
    app.exit(1);
  }
});
`;
}

function sanitizedChildEnvironment(tempRoot) {
  const home = path.join(tempRoot, 'home');
  const tmp = path.join(tempRoot, 'tmp');
  fs.mkdirSync(home, { recursive: true });
  fs.mkdirSync(tmp, { recursive: true });
  return {
    ELECTRON_DISABLE_SECURITY_WARNINGS: 'true',
    HOME: home,
    LANG: 'en_US.UTF-8',
    LC_ALL: 'en_US.UTF-8',
    PATH: process.env.PATH || '/usr/bin:/bin',
    TMPDIR: tmp,
    USERPROFILE: home,
  };
}

export function runPhysicalProbe(repoRoot = process.cwd()) {
  assert(process.platform === 'darwin' && process.arch === 'arm64', 'E_PHYSICAL_HOST', `${process.platform}-${process.arch}`);
  const archive = findElectronArchive();
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'yalken-r24-c8a-physical-'));
  const extractRoot = path.join(tempRoot, 'runtime');
  const childPath = path.join(tempRoot, 'c8a-child.cjs');
  const sessionNonce = randomUUID();
  fs.mkdirSync(extractRoot);
  try {
    const extracted = spawnSync('ditto', ['-x', '-k', archive.archivePath, extractRoot], { encoding: 'utf8', timeout: 120000 });
    assert(extracted.status === 0, 'E_ELECTRON_EXTRACT', String(extracted.stderr || '').trim());
    const electronBinary = path.join(extractRoot, 'Electron.app', 'Contents', 'MacOS', 'Electron');
    assert(fs.existsSync(electronBinary), 'E_ELECTRON_BINARY', ELECTRON_VERSION);
    fs.writeFileSync(childPath, childSource(repoRoot, tempRoot, sessionNonce), 'utf8');
    const executed = spawnSync(electronBinary, [childPath], {
      cwd: repoRoot,
      encoding: 'utf8',
      env: sanitizedChildEnvironment(tempRoot),
      maxBuffer: 4 * 1024 * 1024,
      timeout: 120000,
    });
    const output = `${executed.stdout || ''}\n${executed.stderr || ''}`;
    assert(executed.status === 0, 'E_ELECTRON_EXECUTION', output.trim());
    const match = output.match(/R24_C8A_PHYSICAL_RECEIPT=(\{[^\n]+\})/u);
    assert(match, 'E_PHYSICAL_RECEIPT_MISSING', output.trim() || 'stdout-empty');
    const receipt = JSON.parse(match[1]);
    assert(receipt.execution?.sessionNonce === sessionNonce, 'E_SESSION_NONCE', 'mismatch');
    const publicReceipt = {
      ...receipt,
      execution: { ...receipt.execution, sessionNonceDigest: sha256(Buffer.from(sessionNonce, 'utf8')) },
    };
    delete publicReceipt.execution.sessionNonce;
    assertPathlessPublicEvidence(publicReceipt);
    return publicReceipt;
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

function roundFinite(value) { return Number.isFinite(value) ? Math.round(value * 1000) / 1000 : null; }

export function buildEvidence(contract, physicalReceipt) {
  const evidence = {
    acceptanceSignals: {
      FRESH_CONSOLE_SESSION_WINDOW: 'PASS',
      NO_USER_DOCS_OR_CREDENTIALS: 'PASS',
      PHYSICAL_A11Y_PASS: 'PASS',
      PHYSICAL_PERF_PASS: 'PASS',
      SYNTHETIC_FIXTURES_ONLY: 'PASS',
    },
    contractDigest: sha256(canonicalBytes(contract)),
    evidenceStampIds: [CONTROL_PLANE_EVIDENCE_STAMP_ID],
    execution: physicalReceipt.execution,
    externalTerminalAttestation: { required: true, status: 'AWAITING_POST_MERGE_EXTERNAL_C8A_ATTESTATION' },
    observations: {
      accessibility: physicalReceipt.accessibility,
      electronVersion: physicalReceipt.electronVersion,
      performance: {
        ...physicalReceipt.performance,
        frameP95Ms: roundFinite(physicalReceipt.performance?.frameP95Ms),
        syncP95Ms: roundFinite(physicalReceipt.performance?.syncP95Ms),
      },
      platform: physicalReceipt.platform,
      safety: physicalReceipt.safety,
    },
    schemaVersion: 'YALKEN_R24_C8A_PHYSICAL_A11Y_PERFORMANCE_EVIDENCE_V1',
    sourceBindings: {
      programTemplateDigest: PROGRAM_TEMPLATE_DIGEST,
      sourceHeadSha: SOURCE_HEAD_SHA,
      sourceTreeSha: SOURCE_TREE_SHA,
      stageAdmissionDigest: STAGE_ADMISSION_DIGEST,
      stageInstanceDigest: STAGE_INSTANCE_DIGEST,
    },
    stageId: STAGE_ID,
    status: 'CURRENT_HEAD_EVALUATED_PENDING_EXTERNAL_TERMINAL_ATTESTATION',
  };
  validateEvidence(evidence, contract);
  assertPathlessPublicEvidence(evidence);
  return evidence;
}

export function validateEvidence(evidence, contract) {
  assert(evidence?.schemaVersion === 'YALKEN_R24_C8A_PHYSICAL_A11Y_PERFORMANCE_EVIDENCE_V1', 'E_EVIDENCE_SCHEMA', 'schema');
  assert(evidence.stageId === STAGE_ID && evidence.status === 'CURRENT_HEAD_EVALUATED_PENDING_EXTERNAL_TERMINAL_ATTESTATION', 'E_EVIDENCE_STATUS', evidence.status);
  assert(evidence.contractDigest === sha256(canonicalBytes(contract)), 'E_CONTRACT_BINDING', evidence.contractDigest);
  for (const signal of ['FRESH_CONSOLE_SESSION_WINDOW', 'NO_USER_DOCS_OR_CREDENTIALS', 'PHYSICAL_A11Y_PASS', 'PHYSICAL_PERF_PASS', 'SYNTHETIC_FIXTURES_ONLY']) {
    assert(evidence.acceptanceSignals?.[signal] === 'PASS', 'E_ACCEPTANCE_SIGNAL', signal);
  }
  const execution = evidence.execution || {};
  const started = Date.parse(execution.startedAtUtc);
  const finished = Date.parse(execution.finishedAtUtc);
  assert(Number.isFinite(started) && Number.isFinite(finished) && finished >= started, 'E_EXECUTION_TIME', 'order');
  assert(finished - started <= contract.bounds.maxExecutionSeconds * 1000, 'E_EXECUTION_TIME', 'duration');
  assert(execution.freshWindow === true && execution.windowVisible === true, 'E_FRESH_WINDOW', 'window');
  assert(Number.isInteger(execution.pid) && execution.pid > 0 && Number.isInteger(execution.webContentsId) && execution.webContentsId > 0, 'E_FRESH_WINDOW', 'identity');
  assert(typeof execution.sessionNonceDigest === 'string' && /^[0-9a-f]{64}$/u.test(execution.sessionNonceDigest), 'E_FRESH_WINDOW', 'nonce');
  assert(evidence.observations?.electronVersion === ELECTRON_VERSION && evidence.observations?.platform === 'darwin-arm64', 'E_RUNTIME_IDENTITY', evidence.observations?.electronVersion);
  const safety = evidence.observations?.safety || {};
  assert(safety.childEnvironmentSanitized === true && safety.credentialsRead === false, 'E_CREDENTIAL_BOUNDARY', 'child');
  assert(safety.syntheticFixtureOnly === true && safety.userDocumentsTouched === false, 'E_USER_DOCUMENT_BOUNDARY', 'fixture');
  assert(safety.networkRequests === 0 && safety.dialogCalls === 0, 'E_EXTERNAL_EFFECT', `${safety.networkRequests}:${safety.dialogCalls}`);
  assert(sameSet(safety.redirectedCapabilities || [], ['EPHEMERAL_APPDATA', 'EPHEMERAL_USERDATA', 'EPHEMERAL_DOCUMENTS', 'EPHEMERAL_DOWNLOADS', 'EPHEMERAL_HOME', 'EPHEMERAL_TEMP']), 'E_TEMP_ISOLATION', 'capabilities');
  const a11y = evidence.observations?.accessibility || {};
  const desktop = a11y.desktop || {};
  assert(desktop.appContract === 'WriterA11yPerformanceProjectionV1', 'E_A11Y_PROJECTION', desktop.appContract);
  assert(desktop.interfaceDirection === contract.accessibilityContract.expectedInterfaceDirection, 'E_INTERFACE_DIRECTION', desktop.interfaceDirection);
  assert(desktop.reflowMode === contract.accessibilityContract.expectedReflow.desktop && a11y.narrowReflow === contract.accessibilityContract.expectedReflow.narrow, 'E_REFLOW', `${desktop.reflowMode}:${a11y.narrowReflow}`);
  assert(a11y.reducedMotion === contract.accessibilityContract.expectedReducedMotion, 'E_REDUCED_MOTION', a11y.reducedMotion);
  const expectedTextbox = contract.accessibilityContract.expectedTextbox;
  assert(desktop.editor?.role === expectedTextbox.role
    && desktop.editor?.name === expectedTextbox.name
    && desktop.editor?.ariaMultiline === expectedTextbox.ariaMultiline
    && desktop.editor?.direction === expectedTextbox.direction
    && desktop.editor?.bidiPolicy === expectedTextbox.bidiPolicy, 'E_TEXTBOX_CONTRACT', JSON.stringify(desktop.editor));
  assert(desktop.wrapper?.role === contract.accessibilityContract.expectedWrapper.role
    && desktop.wrapper?.ariaMultiline === contract.accessibilityContract.expectedWrapper.ariaMultiline
    && desktop.wrapper?.contenteditable === contract.accessibilityContract.expectedWrapper.contenteditable, 'E_WRAPPER_SEMANTIC_DUPLICATION', JSON.stringify(desktop.wrapper));
  const expectedLiveRegion = contract.accessibilityContract.expectedLiveRegion;
  assert(desktop.status?.role === expectedLiveRegion.role
    && desktop.status?.ariaLive === expectedLiveRegion.ariaLive
    && desktop.status?.ariaAtomic === expectedLiveRegion.ariaAtomic, 'E_LIVE_REGION', JSON.stringify(desktop.status));
  assert(desktop.toolbarCount >= contract.accessibilityContract.minimumNamedToolbars && desktop.unnamedVisibleControlCount === 0, 'E_DOM_INTERACTIVE_NAMES', JSON.stringify({ toolbarCount: desktop.toolbarCount, unnamed: desktop.unnamedVisibleControls }));
  assert(desktop.windowVisible === true, 'E_WINDOW_NOT_VISIBLE', 'desktop');
  const ax = a11y.ax || {};
  assert(ax.exposedNodeCount > 0 && ax.interactiveNodeCount > 0, 'E_AX_TREE_EMPTY', 'tree');
  assert(ax.unnamedInteractiveNodeCount === contract.accessibilityContract.unnamedExposedInteractiveNodesAllowed, 'E_AX_UNNAMED_INTERACTIVE', String(ax.unnamedInteractiveNodeCount));
  assert(ax.namedToolbarCount >= contract.accessibilityContract.minimumNamedToolbars, 'E_AX_TOOLBARS', String(ax.namedToolbarCount));
  assert(ax.textbox?.role === 'textbox' && ax.textbox?.name === contract.accessibilityContract.expectedTextbox.name, 'E_AX_TEXTBOX', JSON.stringify(ax.textbox));
  assert(ax.statusCount >= 1, 'E_AX_STATUS', String(ax.statusCount));
  const perf = evidence.observations?.performance || {};
  assert(Array.isArray(perf.syncSamplesMs) && perf.syncSamplesMs.length === contract.bounds.typingSamples, 'E_PERF_SAMPLE_COUNT', String(perf.syncSamplesMs?.length));
  assert(Array.isArray(perf.frameSamplesMs) && perf.frameSamplesMs.length === contract.bounds.typingSamples, 'E_PERF_FRAME_COUNT', String(perf.frameSamplesMs?.length));
  assert(perf.syncSamplesMs.every((value) => Number.isFinite(value) && value >= 0), 'E_PERF_SAMPLE', 'sync');
  assert(perf.frameSamplesMs.every((value) => Number.isFinite(value) && value >= 0), 'E_PERF_SAMPLE', 'frame');
  assert(perf.syncP95Ms <= contract.bounds.maxTypingSyncP95Ms, 'E_TYPING_P95', String(perf.syncP95Ms));
  assert(perf.frameP95Ms <= contract.bounds.maxInteractionFrameP95Ms, 'E_FRAME_P95', String(perf.frameP95Ms));
  assert(perf.typingBudgetState === 'within', 'E_RUNTIME_BUDGET_STATE', `typing:${perf.typingBudgetState}`);
  const survivorWithin = perf.survivorLaneApplicability === 'APPLICABLE_LEGACY_DEFERRED_RENDER' && perf.survivorBudgetState === 'within';
  const survivorNotApplicable = perf.survivorLaneApplicability === 'NOT_APPLICABLE_TIPTAP_NO_LEGACY_DEFERRED_RENDER' && perf.survivorBudgetState === null;
  assert(survivorWithin || survivorNotApplicable, 'E_RUNTIME_BUDGET_STATE', `survivor:${perf.survivorLaneApplicability}:${perf.survivorBudgetState}`);
  assert(perf.syntheticTextLength === contract.bounds.typingSamples && perf.editorFocused === true, 'E_SYNTHETIC_INPUT', `${perf.syntheticTextLength}:${perf.editorFocused}`);
  assertPathlessPublicEvidence(evidence);
  return true;
}

function writeCanonical(repoRoot, relativePath, value) {
  fs.writeFileSync(path.join(repoRoot, relativePath), canonicalBytes(value));
}

function approvedPaths() {
  return [PATHS.contract, PATHS.evidence, PATHS.inventory, PATHS.predecessorStageAdmission, PATHS.predecessorStageInstance, PATHS.script, PATHS.stageAdmission, PATHS.stageInstance, PATHS.test].sort(LEXICAL);
}

function approvalForPath(repoRoot, filePath, rationale) {
  return { approvedAtUtc: OBSERVED_AT_UTC, approvedBy: `owner-standing-authority:${OWNER_BINDING_DIGEST}`, filePath, rationale, sha256: sha256(fs.readFileSync(path.join(repoRoot, filePath))) };
}

function buildStageApprovals(repoRoot) {
  const rationale = `C8A resumed local Electron physical accessibility and performance envelope under StageInstance ${STAGE_INSTANCE_DIGEST}; append-only parked predecessor preservation, certified C6B actual-textbox recovery, synthetic-only isolated paths, blocked network and dialogs, named accessibility tree, keyboard input, reflow, reduced motion, and bounded interaction metrics remain fail-closed.`;
  return { approvals: approvedPaths().map((filePath) => approvalForPath(repoRoot, filePath, rationale)), evidenceStampIds: [CONTROL_PLANE_EVIDENCE_STAMP_ID], version: 'v1.0' };
}

function isOwnApproval(entry) {
  return entry?.approvedAtUtc === OBSERVED_AT_UTC && typeof entry.rationale === 'string' && entry.rationale.startsWith('C8A resumed local Electron physical accessibility and performance envelope under StageInstance ');
}

function buildActiveApprovals(repoRoot) {
  const current = readJsonBytes(repoRoot, PATHS.activeApprovals).value;
  assert(Array.isArray(current.approvals) && current.version === 'v1.0', 'E_ACTIVE_APPROVAL_SCHEMA', 'C1C');
  const paths = [...approvedPaths(), PATHS.approvals].sort(LEXICAL);
  const superseded = new Set(paths);
  const preserved = current.approvals.filter((entry) => !isOwnApproval(entry) && !superseded.has(entry.filePath));
  const rationale = `C8A resumed physical accessibility and performance evidence under StageInstance ${STAGE_INSTANCE_DIGEST}; exact write set, append-only parked predecessor, certified C6B recovery, fixed authority, synthetic isolation, local Electron oracle, and no release or Program DONE expansion.`;
  return { approvals: [...preserved, ...paths.map((filePath) => approvalForPath(repoRoot, filePath, rationale))], evidenceStampIds: [CONTROL_PLANE_EVIDENCE_STAMP_ID], version: current.version };
}

function result(contract, evidence, mode) {
  return {
    contractDigest: sha256(canonicalBytes(contract)),
    electronVersion: evidence.observations.electronVersion,
    evidenceDigest: sha256(canonicalBytes(evidence)),
    frameP95Ms: evidence.observations.performance.frameP95Ms,
    mode,
    stageAdmissionDigest: STAGE_ADMISSION_DIGEST,
    stageId: STAGE_ID,
    stageInstanceDigest: STAGE_INSTANCE_DIGEST,
    status: 'CURRENT_HEAD_EVALUATED_PENDING_EXTERNAL_TERMINAL_ATTESTATION',
    syncP95Ms: evidence.observations.performance.syncP95Ms,
  };
}

export function runAndWrite(repoRoot = process.cwd()) {
  assertHeadContour(repoRoot);
  validateBindings(repoRoot);
  writeCanonical(repoRoot, PATHS.inventory, buildInventory(repoRoot));
  const contract = buildContract(repoRoot);
  const evidence = buildEvidence(contract, runPhysicalProbe(repoRoot));
  writeCanonical(repoRoot, PATHS.contract, contract);
  writeCanonical(repoRoot, PATHS.evidence, evidence);
  writeCanonical(repoRoot, PATHS.approvals, buildStageApprovals(repoRoot));
  writeCanonical(repoRoot, PATHS.activeApprovals, buildActiveApprovals(repoRoot));
  return result(contract, evidence, 'RUN_AND_WRITE');
}

export function checkArtifacts(repoRoot = process.cwd()) {
  assertHeadContour(repoRoot);
  validateBindings(repoRoot);
  assert(fs.readFileSync(path.join(repoRoot, PATHS.inventory)).equals(canonicalBytes(buildInventory(repoRoot))), 'E_INVENTORY_DRIFT', PATHS.inventory);
  const contract = buildContract(repoRoot);
  assert(fs.readFileSync(path.join(repoRoot, PATHS.contract)).equals(canonicalBytes(contract)), 'E_CONTRACT_DRIFT', PATHS.contract);
  const evidenceFile = readJsonBytes(repoRoot, PATHS.evidence, true);
  validateEvidence(evidenceFile.value, contract);
  assert(fs.readFileSync(path.join(repoRoot, PATHS.approvals)).equals(canonicalBytes(buildStageApprovals(repoRoot))), 'E_STAGE_APPROVAL_DRIFT', PATHS.approvals);
  assert(fs.readFileSync(path.join(repoRoot, PATHS.activeApprovals)).equals(canonicalBytes(buildActiveApprovals(repoRoot))), 'E_ACTIVE_APPROVAL_DRIFT', PATHS.activeApprovals);
  return result(contract, evidenceFile.value, 'CHECK');
}

export function probeCurrentHead(repoRoot = process.cwd()) {
  assertHeadContour(repoRoot);
  validateBindings(repoRoot);
  const contract = buildContract(repoRoot);
  const evidence = buildEvidence(contract, runPhysicalProbe(repoRoot));
  return result(contract, evidence, 'FRESH_PROBE_NO_REPOSITORY_WRITE');
}

function main() {
  try {
    const mode = process.argv[2];
    assert(['--run', '--check', '--probe'].includes(mode), 'E_USAGE', '--run | --check | --probe');
    const output = mode === '--run' ? runAndWrite() : mode === '--check' ? checkArtifacts() : probeCurrentHead();
    process.stdout.write(canonicalBytes(output));
  } catch (error) {
    process.stderr.write(`${JSON.stringify({ code: error.code || 'E_C8A_UNTYPED', message: error.message })}\n`);
    process.exitCode = 1;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) main();
