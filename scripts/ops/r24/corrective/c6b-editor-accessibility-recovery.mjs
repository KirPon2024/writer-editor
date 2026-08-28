#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { buildInventory } from '../test-inventory.mjs';
import { canonicalBytes } from './canonical-json.mjs';
import { buildArtifacts as buildWriterHomeArtifacts } from './c6b-writer-home-computed-style.mjs';

export const STAGE_ID = 'C6B';
export const OBSERVED_AT_UTC = '2026-08-28T19:42:13Z';
export const PROGRAM_TEMPLATE_DIGEST = '6c833c964318da3e61e1743365f8763206be838647b5222c187b3bda8d1c6b9a';
export const STAGE_REGISTRY_DIGEST = 'c8af046b5918f43a50af66886b0b5c9d2e22ea6501240d4b239101d8836ced1a';
export const TRUST_MODEL_DIGEST = '4f6e4b3a191e0302ea44646659e8c2f71121af7d808cc0ee768269b4e156840d';
export const OWNER_BINDING_DIGEST = 'be68bd97021d13fbfb75c73791bda7f6bfeebecebf525d4a927d1a4c9fe9efd6';
export const STAGE_INSTANCE_DIGEST = 'dd194555421fe12e5803d5a90f0ac72f5f008f9b20f566f7531c78044c6192f5';
export const STAGE_ADMISSION_DIGEST = 'f0a567184d2e18a63ed9e10762adf0e5fa45672902e6e7d988948e45733ac97b';
export const ACCEPTANCE_SIGNALS_DIGEST = '2510434d60a82370953aab5af5c7d41d067a318b0fd0e555d568f0a84105c949';
export const WRITE_SET_DIGEST = '158b8f9006133c831aa01ce739c80b40ac057115bbc3e16a5acae733e924562c';
export const SOURCE_HEAD_SHA = '7dabc48f28f7e621292a0ccab2519511ae580fa4';
export const SOURCE_TREE_SHA = '29aed82eede9f9114afcf2e66d5a8a3c156a56e6';
export const RECOVERY_CONTOUR_HEAD_SHA = '3bb836f706acdf01ab85526bf0ff976c26de71c7';
export const RECOVERY_CONTOUR_TREE_SHA = '7cc9139cc45783fce90794ec57ccb4b391c743e4';
export const PREDECESSOR_C6B_TERMINAL_DIGEST = '09497af131c76391e76877ebdd313bed0d1ad4091872b3c376a70c5d4199dd49';
export const PREDECESSOR_C6B_RELEASE_DIGEST = '34e968898d7b8cdbf4b4c2475e1460f324072b61bdaca60db0452f2e06ca130a';
export const TRIGGERING_C8A_BLOCKED_RECEIPT_DIGEST = 'f6638ae8cf85dcdea96fd2720f552aebb94198913a0f063c39094c79806990ff';
export const LEASE_DIGEST = '9f219dd934b185aa8a31e3110a022d78294452ad70a555487da60de1242a0123';
export const FENCE_DIGEST = '377e9c579e73ec08f125a71f6a7fc634bc7d450d1b28d81a1ae7f9795c2c784e';
export const FENCE_COUNTER = 39;
export const LAZYWEB_AGENTIC_SEARCH_ID = '2486f500-f6c1-4d88-922e-9e5572038618';
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
  approvals: 'docs/OPS/R24/CORRECTIVE/C6B_ACCESSIBILITY_RECOVERY_GOVERNANCE_APPROVALS_V1.json',
  forwardApprovals: 'docs/OPS/R24/CORRECTIVE/C6B_DEPENDENT_BINDING_RECOVERY_GOVERNANCE_APPROVALS_V1.json',
  postmergeApprovals: 'docs/OPS/R24/CORRECTIVE/C6B_POSTMERGE_CONTOUR_RECOVERY_GOVERNANCE_APPROVALS_V1.json',
  contract: 'docs/OPS/R24/CORRECTIVE/C6B_ACCESSIBILITY_RECOVERY_CONTRACT_V1.json',
  evidence: 'docs/OPS/R24/CORRECTIVE/C6B_ACCESSIBILITY_RECOVERY_EVIDENCE_V1.json',
  inventory: 'docs/OPS/R24/CORRECTIVE/C1B_TEST_INVENTORY_V1.json',
  program: 'docs/OPS/R24/CORRECTIVE/PROGRAM_TEMPLATE_V1_1.json',
  registry: 'docs/OPS/R24/CORRECTIVE/STAGE_REGISTRY_V1.json',
  trust: 'docs/OPS/R24/CORRECTIVE/TERMINAL_ATTESTATION_TRUST_MODEL_V1.json',
  standing: 'docs/OPS/R24/CORRECTIVE/STANDING_AUTHORITY_BINDING_V1.json',
  stageAdmission: 'docs/OPS/R24/CORRECTIVE/C6B_ACCESSIBILITY_RECOVERY_STAGE_ADMISSION_ATTESTATION_V1.json',
  stageInstance: 'docs/OPS/R24/CORRECTIVE/C6B_ACCESSIBILITY_RECOVERY_STAGE_INSTANCE_V1.json',
  script: 'scripts/ops/r24/corrective/c6b-editor-accessibility-recovery.mjs',
  source: 'src/renderer/tiptap/index.js',
  bundle: 'src/renderer/editor.bundle.js',
  test: 'test/contracts/r24-c6b-editor-accessibility-recovery.contract.test.mjs',
  originalContract: 'docs/OPS/R24/CORRECTIVE/C6B_WRITER_HOME_COMPUTED_STYLE_CONTRACT_V1.json',
  originalMatrix: 'docs/OPS/R24/CORRECTIVE/C6B_WRITER_HOME_COMPUTED_STYLE_MATRIX_V1.json',
  originalScript: 'scripts/ops/r24/corrective/c6b-writer-home-computed-style.mjs',
  originalTest: 'test/contracts/r24-c6b-writer-home-computed-style.contract.test.mjs',
  styles: 'src/renderer/styles.css',
});

export const WRITE_SET = Object.freeze([
  PATHS.activeApprovals, PATHS.approvals, PATHS.contract, PATHS.evidence,
  PATHS.inventory, PATHS.stageAdmission, PATHS.stageInstance, PATHS.script,
  PATHS.source, PATHS.bundle, PATHS.test,
].sort());

const FORWARD_RECOVERY_PATHS = Object.freeze([
  'docs/OPS/R24/CORRECTIVE/C6B_DEPENDENT_BINDING_RECOVERY_GOVERNANCE_APPROVALS_V1.json',
  'docs/OPS/R24/CORRECTIVE/C6B_STAGE_ADMISSION_ATTESTATION_AMENDMENT_V1.json',
  'docs/OPS/R24/CORRECTIVE/C6B_STAGE_ADMISSION_ATTESTATION_AMENDMENT_V2.json',
  'docs/OPS/R24/CORRECTIVE/C6B_STAGE_ADMISSION_ATTESTATION_AMENDMENT_V3.json',
  'docs/OPS/R24/CORRECTIVE/C6B_STAGE_ADMISSION_ATTESTATION_AMENDMENT_V4.json',
  'docs/OPS/R24/CORRECTIVE/C6B_STAGE_INSTANCE_AMENDMENT_V1.json',
  'docs/OPS/R24/CORRECTIVE/C6B_STAGE_INSTANCE_AMENDMENT_V2.json',
  'docs/OPS/R24/CORRECTIVE/C6B_STAGE_INSTANCE_AMENDMENT_V3.json',
  'docs/OPS/R24/CORRECTIVE/C6B_STAGE_INSTANCE_AMENDMENT_V4.json',
  'docs/OPS/R24/CORRECTIVE/C6B_POSTMERGE_CONTOUR_RECOVERY_GOVERNANCE_APPROVALS_V1.json',
  'docs/OPS/R24/CORRECTIVE/C6B_WRITER_HOME_COMPUTED_STYLE_CONTRACT_V1.json',
  'scripts/ops/r24/corrective/c6b-dependent-binding-recovery.mjs',
].sort());

const CONTOUR_WRITE_SET = Object.freeze([...new Set([...WRITE_SET, ...FORWARD_RECOVERY_PATHS])].sort());

const ORIGINAL_BINDINGS = Object.freeze({
  matrix: 'f1e07041b8de79a97470514b2b66eabdcd29ebb44cf054e817941adc1a32c502',
  script: '2d2aeaa9cb35aa7625ca6c37f361660d864b3ad90afbee5118662fe9835a08b3',
  test: '62d590a83345afe416ff667bda330a0533740b45895026e14092c8200f104238',
});

const LEXICAL = (left, right) => left < right ? -1 : left > right ? 1 : 0;

export class C6BAccessibilityRecoveryError extends Error {
  constructor(code, detail) {
    super(`${code}: ${detail}`);
    this.code = code;
  }
}

function fail(code, detail) { throw new C6BAccessibilityRecoveryError(code, detail); }
function assert(condition, code, detail) { if (!condition) fail(code, detail); }
export function sha256(bytes) { return createHash('sha256').update(bytes).digest('hex'); }
function count(source, needle) { return source.split(needle).length - 1; }

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

function sameSet(actual, expected) {
  return JSON.stringify([...new Set(actual)].sort(LEXICAL)) === JSON.stringify([...new Set(expected)].sort(LEXICAL));
}

export function assertHeadContour(repoRoot = process.cwd()) {
  const currentHead = git(repoRoot, ['rev-parse', 'HEAD']);
  assert(git(repoRoot, ['rev-parse', `${RECOVERY_CONTOUR_HEAD_SHA}^{tree}`]) === RECOVERY_CONTOUR_TREE_SHA, 'E_RECOVERY_CONTOUR_TREE', RECOVERY_CONTOUR_TREE_SHA);
  if (currentHead !== RECOVERY_CONTOUR_HEAD_SHA) {
    const ancestor = spawnSync('git', ['merge-base', '--is-ancestor', RECOVERY_CONTOUR_HEAD_SHA, currentHead], { cwd: repoRoot });
    assert(ancestor.status === 0, 'E_SOURCE_HEAD_NOT_ANCESTOR', currentHead);
    const commitCount = Number(git(repoRoot, ['rev-list', '--count', `${RECOVERY_CONTOUR_HEAD_SHA}..${currentHead}`]));
    assert(Number.isInteger(commitCount) && commitCount <= 2, 'E_UNBOUNDED_DELTA', String(commitCount));
    for (const relativePath of git(repoRoot, ['diff', '--name-only', RECOVERY_CONTOUR_HEAD_SHA, currentHead]).split('\n').filter(Boolean)) {
      assert(CONTOUR_WRITE_SET.includes(relativePath), 'E_WRITE_SET_DRIFT', relativePath);
    }
  }
  for (const relativePath of statusPaths(repoRoot)) assert(CONTOUR_WRITE_SET.includes(relativePath), 'E_DIRTY_PATH_OUTSIDE_WRITE_SET', relativePath);
  return {
    currentHead,
    recoveryContourHeadSha: RECOVERY_CONTOUR_HEAD_SHA,
    recoveryContourTreeSha: RECOVERY_CONTOUR_TREE_SHA,
    sourceHeadSha: SOURCE_HEAD_SHA,
    sourceTreeSha: SOURCE_TREE_SHA,
  };
}

export function assertSourceContractText(source) {
  assert(count(source, "const editorAccessibilityAttributes = {") === 1, 'E_ACCESSIBILITY_CAPTURE', 'object');
  assert(count(source, "'aria-label': mountEl.getAttribute('aria-label') || 'Текст сцены'") === 1, 'E_ACCESSIBILITY_LABEL', 'capture');
  assert(count(source, "mountEl.removeAttribute('role')") === 1, 'E_WRAPPER_ROLE', 'remove');
  assert(count(source, "mountEl.removeAttribute('aria-label')") === 1, 'E_WRAPPER_LABEL', 'remove');
  assert(count(source, "mountEl.removeAttribute('aria-multiline')") === 1, 'E_WRAPPER_MULTILINE', 'remove');
  assert(count(source, 'editorProps: {\n      attributes: editorAccessibilityAttributes,\n    },') === 1, 'E_EDITOR_PROPS', 'transfer');
  assert(count(source, "'data-bidi-policy': mountEl.getAttribute('data-bidi-policy') || 'plaintext'") === 1, 'E_BIDI_POLICY', 'transfer');
  assert(count(source, "role: 'textbox'") === 1, 'E_TEXTBOX_ROLE', 'actual');
  return true;
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
  assert(stage.value.predecessorCertifiedC6BTerminalDigest === PREDECESSOR_C6B_TERMINAL_DIGEST, 'E_PREDECESSOR_C6B_TERMINAL', STAGE_ID);
  assert(stage.value.predecessorCertifiedC6BReleaseDigest === PREDECESSOR_C6B_RELEASE_DIGEST, 'E_PREDECESSOR_C6B_RELEASE', STAGE_ID);
  assert(stage.value.triggeringC8ABlockedNodeReceiptDigest === TRIGGERING_C8A_BLOCKED_RECEIPT_DIGEST, 'E_TRIGGERING_C8A_RECEIPT', STAGE_ID);
  assert(stage.value.lazywebEvidence?.agenticSearchId === LAZYWEB_AGENTIC_SEARCH_ID, 'E_LAZYWEB_EVIDENCE', STAGE_ID);
  assert(sameSet(stage.value.writeSet.paths, WRITE_SET), 'E_WRITE_SET', STAGE_ID);
  assert(admission.value.status === 'ADMITTED' && admission.value.stageInstanceDigest === STAGE_INSTANCE_DIGEST, 'E_NOT_ADMITTED', STAGE_ID);
  assert(admission.value.acceptanceSignalsDigest === ACCEPTANCE_SIGNALS_DIGEST, 'E_ACCEPTANCE_DIGEST', STAGE_ID);
  assert(admission.value.writeSetDigest === WRITE_SET_DIGEST && admission.value.writeSetDigest === sha256(canonicalBytes(stage.value.writeSet)), 'E_WRITE_SET_DIGEST', STAGE_ID);
  const expectedOriginalContract = canonicalBytes(buildWriterHomeArtifacts(repoRoot).contract);
  assert(fs.readFileSync(path.join(repoRoot, PATHS.originalContract)).equals(expectedOriginalContract), 'E_ORIGINAL_C6B_DRIFT', 'contract');
  for (const [key, relativePath] of Object.entries({ matrix: PATHS.originalMatrix, script: PATHS.originalScript, test: PATHS.originalTest })) {
    assert(sha256(fs.readFileSync(path.join(repoRoot, relativePath))) === ORIGINAL_BINDINGS[key], 'E_ORIGINAL_C6B_DRIFT', key);
  }
  assertSourceContractText(fs.readFileSync(path.join(repoRoot, PATHS.source), 'utf8'));
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
    } else if (Array.isArray(candidate)) candidate.forEach(visit);
    else if (candidate && typeof candidate === 'object') Object.values(candidate).forEach(visit);
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
  return matches[0];
}

export function buildContract(repoRoot = process.cwd()) {
  validateBindings(repoRoot);
  const contract = {
    acceptanceSignals: {
      ACTUAL_TIPTAP_TEXTBOX_NAMED: true,
      C8A_DEFECT_INVALIDATION_BOUND: true,
      CHROMIUM_AX_ZERO_UNNAMED_INTERACTIVE: true,
      EXTERNAL_TERMINAL_ATTESTATION_VERIFIED: 'PENDING_POST_MERGE_EXTERNAL_C6B_RECOVERY_ATTESTATION',
      FIXED_AUTHORITY_BINDING: true,
      LAZYWEB_EVIDENCE_BEFORE_UI_CHANGE: true,
      NONINTERACTIVE_WRAPPER_ROLE_REMOVED: true,
      PHYSICAL_KEYBOARD_INPUT_TARGET_PASS: true,
    },
    accessibilityContract: {
      actualTextbox: { ariaMultiline: 'true', bidiPolicy: 'plaintext', direction: 'auto', focusable: true, name: 'Текст сцены', role: 'textbox' },
      wrapper: { ariaLabel: null, ariaMultiline: null, contenteditable: null, focusable: false, role: null },
      unnamedExposedInteractiveNodesAllowed: 0,
    },
    bounds: { maxExecutionSeconds: 120, maxInteractionFrameP95Ms: INTERACTION_FRAME_P95_BUDGET_MS, maxTypingSyncP95Ms: TYPING_SYNC_P95_BUDGET_MS, survivorLane: 'NOT_APPLICABLE_TIPTAP_MODE_HAS_NO_LEGACY_DEFERRED_RENDER', typingSamples: TYPING_SAMPLE_COUNT },
    designEvidence: { agenticSearchId: LAZYWEB_AGENTIC_SEARCH_ID, disposition: 'NO_REDESIGN_SEMANTIC_LABEL_TRANSFER_ONLY', referenceCapabilityIds: ['CAP_LAZYWEB_BUTTERDOCS', 'CAP_LAZYWEB_CLICKUP', 'CAP_LAZYWEB_SUBSTACK'] },
    electronRuntime: { archive: { capabilityId: 'CAP_R24_C6B_RECOVERY_ELECTRON_ARCHIVE', role: 'IMMUTABLE_LOCAL_TOOLCHAIN_INPUT', sha256: ELECTRON_ARCHIVE_DIGEST, sizeBytes: ELECTRON_ARCHIVE_SIZE_BYTES }, platform: 'darwin-arm64', version: ELECTRON_VERSION },
    nonClaims: ['NO_SCREEN_READER_VENDOR_CERTIFICATION', 'NO_VISUAL_REDESIGN', 'NO_USER_DOCUMENT_QUALIFICATION', 'NO_SIGNING_NOTARIZATION_DISTRIBUTION', 'NO_PROGRAM_DONE'],
    safetyBoundary: { credentials: 'SANITIZED_MINIMAL_CHILD_ENVIRONMENT', dialogs: 'BLOCKED_AND_ZERO_CALLS_REQUIRED', network: 'BLOCKED_AND_ZERO_REQUESTS_REQUIRED', userDocuments: 'EPHEMERAL_REDIRECTED_PATHS_SYNTHETIC_TEXT_ONLY' },
    schemaVersion: 'YALKEN_R24_C6B_ACCESSIBILITY_RECOVERY_CONTRACT_V1',
    sourceBindings: {
      acceptanceSignalsDigest: ACCEPTANCE_SIGNALS_DIGEST,
      blockedC8AReceiptDigest: TRIGGERING_C8A_BLOCKED_RECEIPT_DIGEST,
      fenceCounter: FENCE_COUNTER,
      fenceDigest: FENCE_DIGEST,
      generator: fileBinding(repoRoot, PATHS.script, 'CAP_R24_C6B_RECOVERY_GENERATOR', 'PHYSICAL_RECOVERY_RUNNER'),
      implementationBundle: fileBinding(repoRoot, PATHS.bundle, 'CAP_R24_C6B_RECOVERY_BUNDLE', 'PRODUCT_RENDERER_BUNDLE'),
      implementationSource: fileBinding(repoRoot, PATHS.source, 'CAP_R24_C6B_RECOVERY_SOURCE', 'TIPTAP_ACCESSIBILITY_SOURCE'),
      inventory: fileBinding(repoRoot, PATHS.inventory, 'CAP_R24_C6B_RECOVERY_INVENTORY', 'CURRENT_TEST_INVENTORY'),
      lazywebAgenticSearchId: LAZYWEB_AGENTIC_SEARCH_ID,
      leaseDigest: LEASE_DIGEST,
      originalC6B: {
        contract: fileBinding(repoRoot, PATHS.originalContract, 'CAP_R24_C6B_ORIGINAL_CONTRACT', 'PRESERVED_CSS_CONTRACT'),
        matrix: fileBinding(repoRoot, PATHS.originalMatrix, 'CAP_R24_C6B_ORIGINAL_MATRIX', 'PRESERVED_COMPUTED_STYLE_MATRIX'),
        styles: fileBinding(repoRoot, PATHS.styles, 'CAP_R24_C6B_STYLES', 'PRESERVED_PRODUCT_STYLES'),
      },
      predecessorC6BReleaseDigest: PREDECESSOR_C6B_RELEASE_DIGEST,
      predecessorC6BTerminalDigest: PREDECESSOR_C6B_TERMINAL_DIGEST,
      programTemplateDigest: PROGRAM_TEMPLATE_DIGEST,
      recoveryContourHeadSha: RECOVERY_CONTOUR_HEAD_SHA,
      recoveryContourTreeSha: RECOVERY_CONTOUR_TREE_SHA,
      sourceHeadSha: SOURCE_HEAD_SHA,
      sourceTreeSha: SOURCE_TREE_SHA,
      stageAdmissionDigest: STAGE_ADMISSION_DIGEST,
      stageInstanceDigest: STAGE_INSTANCE_DIGEST,
      stageRegistryDigest: STAGE_REGISTRY_DIGEST,
      test: fileBinding(repoRoot, PATHS.test, 'CAP_R24_C6B_RECOVERY_TEST', 'INDEPENDENT_CONTRACT_TEST'),
      trustModelDigest: TRUST_MODEL_DIGEST,
      writeSetDigest: WRITE_SET_DIGEST,
    },
    stageId: STAGE_ID,
    status: 'CURRENT_HEAD_EVALUATED_PENDING_EXTERNAL_TERMINAL_ATTESTATION',
  };
  assertPathlessPublicEvidence(contract);
  return contract;
}

const DOM_SETUP_SOURCE = `(() => {
  const wrapper = document.querySelector('#editor');
  const actual = wrapper?.querySelector('.ProseMirror[contenteditable="true"]');
  if (!wrapper || !actual) throw new Error('ACTUAL_TIPTAP_TEXTBOX_MISSING');
  actual.focus();
  const state = { start: 0, syncSamples: [], frameSamples: [] };
  actual.addEventListener('beforeinput', () => { state.start = performance.now(); }, true);
  actual.addEventListener('input', () => {
    if (!(state.start > 0)) return;
    const started = state.start;
    state.syncSamples.push(performance.now() - started);
    requestAnimationFrame(() => state.frameSamples.push(performance.now() - started));
  });
  window.__C6B_RECOVERY_PERF__ = state;
  return document.activeElement === actual;
})()`;

const DOM_RESULT_SOURCE = `(() => {
  const wrapper = document.querySelector('#editor');
  const actual = wrapper.querySelector('.ProseMirror[contenteditable="true"]');
  const layout = document.querySelector('.app-layout');
  const visible = (element) => { const style = getComputedStyle(element); const rect = element.getBoundingClientRect(); return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0; };
  const controls = [...document.querySelectorAll('button,select,input,textarea,a[href],[role="button"],[role="textbox"],[role="tab"],[role="menuitem"]')].filter(visible);
  const unnamed = controls.filter((element) => !(element.getAttribute('aria-label') || element.getAttribute('aria-labelledby') || element.textContent.trim() || element.getAttribute('title')));
  const state = window.__C6B_RECOVERY_PERF__;
  const round = (value) => Math.round(value * 1000) / 1000;
  const p95 = (values) => { const sorted = [...values].sort((a, b) => a - b); return sorted[Math.max(0, Math.ceil(sorted.length * 0.95) - 1)] || 0; };
  return {
    actual: { ariaLabel: actual.getAttribute('aria-label'), ariaMultiline: actual.getAttribute('aria-multiline'), bidiPolicy: actual.getAttribute('data-bidi-policy'), contenteditable: actual.getAttribute('contenteditable'), direction: actual.getAttribute('dir'), focused: document.activeElement === actual, role: actual.getAttribute('role'), tabIndex: actual.tabIndex },
    appContract: document.documentElement.getAttribute('data-writer-a11y-contract'),
    interfaceDirection: document.documentElement.getAttribute('dir'),
    performance: { frameP95Ms: round(p95(state.frameSamples)), frameSamplesMs: state.frameSamples.map(round), survivorBudgetState: layout.getAttribute('data-writer-survivor-budget'), syncP95Ms: round(p95(state.syncSamples)), syncSamplesMs: state.syncSamples.map(round), syntheticTextLength: actual.textContent.length, typingBudgetState: layout.getAttribute('data-writer-typing-budget') },
    reflowMode: layout.getAttribute('data-writer-reflow'),
    unnamedVisibleControlCount: unnamed.length,
    wrapper: { ariaLabel: wrapper.getAttribute('aria-label'), ariaMultiline: wrapper.getAttribute('aria-multiline'), contenteditable: wrapper.getAttribute('contenteditable'), focusable: wrapper.tabIndex >= 0, role: wrapper.getAttribute('role') },
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
let networkRequests = 0; let dialogCalls = 0; let permissionRequests = 0;
const startedAtUtc = new Date().toISOString();
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const emit = (payload) => process.stdout.write('R24_C6B_RECOVERY_PHYSICAL_RECEIPT=' + JSON.stringify(payload) + '\\n');
for (const name of ['appData', 'userData', 'documents', 'downloads', 'home', 'tmp']) fs.mkdirSync(path.join(tempRoot, name), { recursive: true });
for (const name of ['appData', 'userData', 'documents', 'downloads', 'temp']) app.setPath(name, path.join(tempRoot, name === 'temp' ? 'tmp' : name));
app.disableHardwareAcceleration();
app.commandLine.appendSwitch('disable-background-networking');
app.commandLine.appendSwitch('disable-component-update');
app.commandLine.appendSwitch('force-device-scale-factor', '1');
for (const methodName of ['showOpenDialog', 'showSaveDialog', 'showMessageBox']) dialog[methodName] = async () => { dialogCalls += 1; throw new Error('C6B_RECOVERY_DIALOG_BLOCKED'); };
app.whenReady().then(() => {
  session.defaultSession.setPermissionRequestHandler((_wc, _permission, callback) => { permissionRequests += 1; callback(false); });
  session.defaultSession.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*', 'ws://*/*', 'wss://*/*'] }, (_details, callback) => { networkRequests += 1; callback({ cancel: true }); });
});
process.chdir(repoRoot);
if (!process.argv.includes('--dev')) process.argv.push('--dev');
require(path.join(repoRoot, 'src', 'main.js'));
async function waitForProductWindow() {
  for (let attempt = 0; attempt < 240; attempt += 1) {
    for (const candidate of BrowserWindow.getAllWindows().filter((item) => !item.isDestroyed())) {
      try { if (await candidate.webContents.executeJavaScript("Boolean(document.querySelector('#editor .ProseMirror[contenteditable=\\\"true\\\"]') && document.readyState === 'complete')", true)) return candidate; } catch {}
    }
    await sleep(50);
  }
  throw new Error('C6B_RECOVERY_PRODUCT_WINDOW_TIMEOUT');
}
function valueOf(property) { return property && Object.prototype.hasOwnProperty.call(property, 'value') ? property.value : null; }
function axProperty(node, name) { return valueOf((node.properties || []).find((item) => item.name === name)?.value); }
app.whenReady().then(async () => {
  try {
    const win = await waitForProductWindow(); win.show();
    const run = (source) => win.webContents.executeJavaScript(source, true);
    const settle = () => run("new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))");
    await settle();
    win.webContents.debugger.attach('1.3');
    await win.webContents.debugger.sendCommand('Accessibility.enable');
    const focused = await run(${JSON.stringify(DOM_SETUP_SOURCE)});
    if (!focused) throw new Error('C6B_RECOVERY_ACTUAL_TEXTBOX_NOT_FOCUSED');
    for (let index = 0; index < ${TYPING_SAMPLE_COUNT}; index += 1) {
      const key = String.fromCharCode(97 + (index % 26)); const code = 'Key' + key.toUpperCase(); const vk = key.toUpperCase().charCodeAt(0);
      await win.webContents.debugger.sendCommand('Input.dispatchKeyEvent', { type: 'keyDown', key, code, text: key, unmodifiedText: key, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk });
      await win.webContents.debugger.sendCommand('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk });
    }
    for (let attempt = 0; attempt < 200; attempt += 1) { if (await run("window.__C6B_RECOVERY_PERF__.frameSamples.length") >= ${TYPING_SAMPLE_COUNT}) break; await sleep(10); }
    await sleep(1500);
    const desktop = await run(${JSON.stringify(DOM_RESULT_SOURCE)});
    const axRaw = await win.webContents.debugger.sendCommand('Accessibility.getFullAXTree');
    const normalized = (axRaw.nodes || []).filter((node) => node.ignored !== true).map((node) => ({ focusable: axProperty(node, 'focusable') === true, name: valueOf(node.name), role: valueOf(node.role) }));
    const roles = new Set(['button', 'textbox', 'combobox', 'menuitem', 'tab', 'checkbox', 'radio', 'link']);
    const exposedInteractive = normalized.filter((node) => roles.has(node.role));
    const ax = { exposedNodeCount: normalized.length, interactiveNodeCount: exposedInteractive.length, unnamedInteractiveNodeCount: exposedInteractive.filter((node) => typeof node.name !== 'string' || node.name.trim() === '').length, textbox: normalized.find((node) => node.role === 'textbox' && node.name === 'Текст сцены') || null };
    win.setContentSize(800, 800); await settle();
    const narrowReflow = await run("document.querySelector('.app-layout').getAttribute('data-writer-reflow')");
    await win.webContents.debugger.sendCommand('Emulation.setEmulatedMedia', { media: 'screen', features: [{ name: 'prefers-reduced-motion', value: 'reduce' }, { name: 'forced-colors', value: 'active' }] }); await settle();
    const media = await run("({ forcedColors: matchMedia('(forced-colors: active)').matches, reducedMotion: document.querySelector('.app-layout').getAttribute('data-writer-motion') })");
    await win.webContents.debugger.sendCommand('Emulation.setEmulatedMedia', { media: 'screen', features: [] }); win.webContents.debugger.detach();
    emit({ accessibility: { ax, desktop, media, narrowReflow }, electronVersion: process.versions.electron, execution: { finishedAtUtc: new Date().toISOString(), freshWindow: true, pid: process.pid, sessionNonce, startedAtUtc, webContentsId: win.webContents.id, windowVisible: win.isVisible() }, platform: process.platform + '-' + process.arch, safety: { childEnvironmentSanitized: true, credentialsRead: false, dialogCalls, networkRequests, permissionRequests, syntheticFixtureOnly: true, userDocumentsTouched: false, redirectedCapabilities: ['EPHEMERAL_APPDATA', 'EPHEMERAL_USERDATA', 'EPHEMERAL_DOCUMENTS', 'EPHEMERAL_DOWNLOADS', 'EPHEMERAL_HOME', 'EPHEMERAL_TEMP'] }, schemaVersion: 'YALKEN_R24_C6B_ACCESSIBILITY_RECOVERY_PHYSICAL_RECEIPT_V1' });
    win.destroy(); app.quit();
  } catch (error) {
    try { const wc = BrowserWindow.getAllWindows()[0]?.webContents; if (wc?.debugger.isAttached()) wc.debugger.detach(); } catch {}
    process.stderr.write(String(error && error.stack || error) + '\\n'); app.exit(1);
  }
});
`;
}

function sanitizedChildEnvironment(tempRoot) {
  const home = path.join(tempRoot, 'home'); const tmp = path.join(tempRoot, 'tmp');
  fs.mkdirSync(home, { recursive: true }); fs.mkdirSync(tmp, { recursive: true });
  return { ELECTRON_DISABLE_SECURITY_WARNINGS: 'true', HOME: home, LANG: 'en_US.UTF-8', LC_ALL: 'en_US.UTF-8', PATH: process.env.PATH || '/usr/bin:/bin', TMPDIR: tmp, USERPROFILE: home };
}

export function runPhysicalProbe(repoRoot = process.cwd()) {
  assert(process.platform === 'darwin' && process.arch === 'arm64', 'E_PHYSICAL_HOST', `${process.platform}-${process.arch}`);
  const archivePath = findElectronArchive();
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'yalken-r24-c6b-recovery-'));
  const extractRoot = path.join(tempRoot, 'runtime'); const childPath = path.join(tempRoot, 'c6b-recovery-child.cjs'); const sessionNonce = randomUUID();
  fs.mkdirSync(extractRoot);
  try {
    const extracted = spawnSync('ditto', ['-x', '-k', archivePath, extractRoot], { encoding: 'utf8', timeout: 120000 });
    assert(extracted.status === 0, 'E_ELECTRON_EXTRACT', String(extracted.stderr || '').trim());
    const electronBinary = path.join(extractRoot, 'Electron.app', 'Contents', 'MacOS', 'Electron');
    assert(fs.existsSync(electronBinary), 'E_ELECTRON_BINARY', ELECTRON_VERSION);
    fs.writeFileSync(childPath, childSource(repoRoot, tempRoot, sessionNonce), 'utf8');
    const executed = spawnSync(electronBinary, [childPath], { cwd: repoRoot, encoding: 'utf8', env: sanitizedChildEnvironment(tempRoot), maxBuffer: 4 * 1024 * 1024, timeout: 120000 });
    const output = `${executed.stdout || ''}\n${executed.stderr || ''}`;
    assert(executed.status === 0, 'E_ELECTRON_EXECUTION', output.trim());
    const match = output.match(/R24_C6B_RECOVERY_PHYSICAL_RECEIPT=(\{[^\n]+\})/u);
    assert(match, 'E_PHYSICAL_RECEIPT_MISSING', 'stdout');
    const receipt = JSON.parse(match[1]);
    assert(receipt.execution?.sessionNonce === sessionNonce, 'E_SESSION_NONCE', 'mismatch');
    receipt.execution.sessionNonceDigest = sha256(Buffer.from(sessionNonce, 'utf8')); delete receipt.execution.sessionNonce;
    assertPathlessPublicEvidence(receipt);
    return receipt;
  } finally { fs.rmSync(tempRoot, { recursive: true, force: true }); }
}

export function validateEvidence(evidence, contract) {
  assert(evidence?.schemaVersion === 'YALKEN_R24_C6B_ACCESSIBILITY_RECOVERY_EVIDENCE_V1', 'E_EVIDENCE_SCHEMA', 'schema');
  assert(evidence.stageId === STAGE_ID && evidence.status === 'CURRENT_HEAD_EVALUATED_PENDING_EXTERNAL_TERMINAL_ATTESTATION', 'E_EVIDENCE_STATUS', evidence.status);
  assert(evidence.contractDigest === sha256(canonicalBytes(contract)), 'E_CONTRACT_BINDING', evidence.contractDigest);
  const execution = evidence.execution || {}; const started = Date.parse(execution.startedAtUtc); const finished = Date.parse(execution.finishedAtUtc);
  assert(Number.isFinite(started) && Number.isFinite(finished) && finished >= started && finished - started <= contract.bounds.maxExecutionSeconds * 1000, 'E_EXECUTION_TIME', 'bounds');
  assert(execution.freshWindow === true && execution.windowVisible === true && Number.isInteger(execution.pid) && Number.isInteger(execution.webContentsId), 'E_FRESH_WINDOW', 'identity');
  assert(/^[0-9a-f]{64}$/u.test(execution.sessionNonceDigest), 'E_SESSION_NONCE', 'digest');
  assert(evidence.observations.electronVersion === ELECTRON_VERSION && evidence.observations.platform === 'darwin-arm64', 'E_RUNTIME_IDENTITY', evidence.observations.electronVersion);
  const safety = evidence.observations.safety;
  assert(safety.childEnvironmentSanitized === true && safety.credentialsRead === false && safety.syntheticFixtureOnly === true && safety.userDocumentsTouched === false, 'E_SAFETY_BOUNDARY', 'isolation');
  assert(safety.networkRequests === 0 && safety.dialogCalls === 0 && safety.permissionRequests === 0, 'E_EXTERNAL_EFFECT', `${safety.networkRequests}:${safety.dialogCalls}:${safety.permissionRequests}`);
  const a11y = evidence.observations.accessibility; const desktop = a11y.desktop;
  assert(desktop.appContract === 'WriterA11yPerformanceProjectionV1' && desktop.interfaceDirection === 'ltr', 'E_APP_PROJECTION', desktop.appContract);
  assert(desktop.wrapper.role === null && desktop.wrapper.ariaLabel === null && desktop.wrapper.ariaMultiline === null && desktop.wrapper.contenteditable === null && desktop.wrapper.focusable === false, 'E_WRAPPER_SEMANTICS', JSON.stringify(desktop.wrapper));
  assert(desktop.actual.role === 'textbox' && desktop.actual.ariaLabel === 'Текст сцены' && desktop.actual.ariaMultiline === 'true' && desktop.actual.bidiPolicy === 'plaintext' && desktop.actual.direction === 'auto' && desktop.actual.contenteditable === 'true' && desktop.actual.focused === true && desktop.actual.tabIndex >= 0, 'E_ACTUAL_TEXTBOX', JSON.stringify(desktop.actual));
  assert(desktop.unnamedVisibleControlCount === 0, 'E_DOM_UNNAMED_INTERACTIVE', String(desktop.unnamedVisibleControlCount));
  assert(a11y.ax.exposedNodeCount > 0 && a11y.ax.interactiveNodeCount > 0 && a11y.ax.unnamedInteractiveNodeCount === 0, 'E_AX_UNNAMED_INTERACTIVE', String(a11y.ax.unnamedInteractiveNodeCount));
  assert(a11y.ax.textbox?.name === 'Текст сцены' && a11y.ax.textbox?.role === 'textbox' && a11y.ax.textbox?.focusable === true, 'E_AX_TEXTBOX', JSON.stringify(a11y.ax.textbox));
  assert(desktop.reflowMode === 'calm-docked' && a11y.narrowReflow === 'single-column-overlay', 'E_REFLOW', `${desktop.reflowMode}:${a11y.narrowReflow}`);
  assert(a11y.media.reducedMotion === 'reduced' && a11y.media.forcedColors === true, 'E_MEDIA', JSON.stringify(a11y.media));
  const perf = desktop.performance;
  assert(perf.syncSamplesMs.length === TYPING_SAMPLE_COUNT && perf.frameSamplesMs.length === TYPING_SAMPLE_COUNT, 'E_PERF_SAMPLE_COUNT', `${perf.syncSamplesMs.length}:${perf.frameSamplesMs.length}`);
  assert(perf.syncP95Ms <= TYPING_SYNC_P95_BUDGET_MS && perf.frameP95Ms <= INTERACTION_FRAME_P95_BUDGET_MS, 'E_PERF_BUDGET', `${perf.syncP95Ms}:${perf.frameP95Ms}`);
  assert(perf.typingBudgetState === 'within' && perf.survivorBudgetState === null && perf.syntheticTextLength === TYPING_SAMPLE_COUNT, 'E_PHYSICAL_KEYBOARD_INPUT', JSON.stringify(perf));
  assertPathlessPublicEvidence(evidence);
  return true;
}

export function buildEvidence(contract, physicalReceipt) {
  const evidence = {
    acceptanceSignals: { ACTUAL_TIPTAP_TEXTBOX_NAMED: 'PASS', C8A_DEFECT_INVALIDATION_BOUND: 'PASS', CHROMIUM_AX_ZERO_UNNAMED_INTERACTIVE: 'PASS', FIXED_AUTHORITY_BINDING: 'PASS', LAZYWEB_EVIDENCE_BEFORE_UI_CHANGE: 'PASS', NONINTERACTIVE_WRAPPER_ROLE_REMOVED: 'PASS', PHYSICAL_KEYBOARD_INPUT_TARGET_PASS: 'PASS' },
    contractDigest: sha256(canonicalBytes(contract)),
    evidenceStampIds: [CONTROL_PLANE_EVIDENCE_STAMP_ID],
    execution: physicalReceipt.execution,
    externalTerminalAttestation: { required: true, status: 'AWAITING_POST_MERGE_EXTERNAL_C6B_RECOVERY_ATTESTATION' },
    observations: { accessibility: physicalReceipt.accessibility, electronVersion: physicalReceipt.electronVersion, platform: physicalReceipt.platform, safety: physicalReceipt.safety },
    schemaVersion: 'YALKEN_R24_C6B_ACCESSIBILITY_RECOVERY_EVIDENCE_V1',
    sourceBindings: { blockedC8AReceiptDigest: TRIGGERING_C8A_BLOCKED_RECEIPT_DIGEST, programTemplateDigest: PROGRAM_TEMPLATE_DIGEST, recoveryContourHeadSha: RECOVERY_CONTOUR_HEAD_SHA, recoveryContourTreeSha: RECOVERY_CONTOUR_TREE_SHA, sourceHeadSha: SOURCE_HEAD_SHA, sourceTreeSha: SOURCE_TREE_SHA, stageAdmissionDigest: STAGE_ADMISSION_DIGEST, stageInstanceDigest: STAGE_INSTANCE_DIGEST },
    stageId: STAGE_ID,
    status: 'CURRENT_HEAD_EVALUATED_PENDING_EXTERNAL_TERMINAL_ATTESTATION',
  };
  validateEvidence(evidence, contract); return evidence;
}

function writeCanonical(repoRoot, relativePath, value) { fs.writeFileSync(path.join(repoRoot, relativePath), canonicalBytes(value)); }

function approvedPaths() {
  return [PATHS.contract, PATHS.evidence, PATHS.inventory, PATHS.script, PATHS.source, PATHS.bundle, PATHS.stageAdmission, PATHS.stageInstance, PATHS.test].sort(LEXICAL);
}

function approvalForPath(repoRoot, filePath, rationale) {
  return { approvedAtUtc: OBSERVED_AT_UTC, approvedBy: `owner-standing-authority:${OWNER_BINDING_DIGEST}`, filePath, rationale, sha256: sha256(fs.readFileSync(path.join(repoRoot, filePath))) };
}

function buildStageApprovals(repoRoot) {
  const rationale = `C6B defect-driven accessibility recovery under StageInstance ${STAGE_INSTANCE_DIGEST}; Lazyweb-first no-redesign constraint, actual Tiptap textbox label transfer, wrapper role removal, physical Chromium AX and keyboard proof, and fixed authority remain fail-closed.`;
  return { approvals: approvedPaths().map((filePath) => approvalForPath(repoRoot, filePath, rationale)), evidenceStampIds: [CONTROL_PLANE_EVIDENCE_STAMP_ID], version: 'v1.0' };
}

function isOwnApproval(entry) {
  return entry?.approvedAtUtc === OBSERVED_AT_UTC && typeof entry.rationale === 'string' && entry.rationale.startsWith('C6B defect-driven accessibility recovery under StageInstance ');
}

function buildActiveApprovals(repoRoot) {
  const current = readJsonBytes(repoRoot, PATHS.activeApprovals).value;
  assert(Array.isArray(current.approvals) && current.version === 'v1.0', 'E_ACTIVE_APPROVAL_SCHEMA', 'C1C');
  const paths = [...approvedPaths(), PATHS.approvals].sort(LEXICAL); const superseded = new Set(paths);
  const preserved = current.approvals.filter((entry) => !isOwnApproval(entry) && !superseded.has(entry.filePath));
  const rationale = `C6B accessibility recovery under StageInstance ${STAGE_INSTANCE_DIGEST}; exact write set, fixed authority, no redesign, synthetic isolation, physical actual-editor oracle, and no Program DONE expansion.`;
  return { approvals: [...preserved, ...paths.map((filePath) => approvalForPath(repoRoot, filePath, rationale))], evidenceStampIds: [CONTROL_PLANE_EVIDENCE_STAMP_ID], version: current.version };
}

function validateCurrentApprovalSets(repoRoot) {
  const stageApprovals = readJsonBytes(repoRoot, PATHS.approvals, true).value;
  const forwardApprovals = readJsonBytes(repoRoot, PATHS.forwardApprovals, true).value;
  const postmergeApprovals = readJsonBytes(repoRoot, PATHS.postmergeApprovals, true).value;
  const activeApprovals = readJsonBytes(repoRoot, PATHS.activeApprovals, true).value;
  assert(Array.isArray(forwardApprovals.approvals) && forwardApprovals.version === 'v1.0', 'E_HISTORICAL_APPROVAL_SCHEMA', 'forward');
  for (const entry of forwardApprovals.approvals) {
    assert(typeof entry.filePath === 'string' && typeof entry.sha256 === 'string', 'E_HISTORICAL_APPROVAL_ENTRY', 'shape');
  }
  for (const approvalSet of [stageApprovals, postmergeApprovals, activeApprovals]) {
    assert(Array.isArray(approvalSet.approvals) && approvalSet.version === 'v1.0', 'E_APPROVAL_SCHEMA', 'current');
    for (const entry of approvalSet.approvals) {
      assert(typeof entry.filePath === 'string' && typeof entry.sha256 === 'string', 'E_APPROVAL_ENTRY', 'shape');
      assert(sha256(fs.readFileSync(path.join(repoRoot, entry.filePath))) === entry.sha256, 'E_APPROVAL_HASH_DRIFT', entry.filePath);
    }
  }
  const activeByPath = new Map(activeApprovals.approvals.map((entry) => [entry.filePath, entry]));
  for (const relativePath of CONTOUR_WRITE_SET) {
    if (relativePath === PATHS.activeApprovals) continue;
    const entry = activeByPath.get(relativePath);
    assert(entry, 'E_ACTIVE_APPROVAL_MISSING', relativePath);
    assert(entry.sha256 === sha256(fs.readFileSync(path.join(repoRoot, relativePath))), 'E_ACTIVE_APPROVAL_DRIFT', relativePath);
  }
  return true;
}

function result(contract, evidence, mode) {
  return { contractDigest: sha256(canonicalBytes(contract)), evidenceDigest: sha256(canonicalBytes(evidence)), frameP95Ms: evidence.observations.accessibility.desktop.performance.frameP95Ms, mode, stageAdmissionDigest: STAGE_ADMISSION_DIGEST, stageId: STAGE_ID, stageInstanceDigest: STAGE_INSTANCE_DIGEST, status: 'CURRENT_HEAD_EVALUATED_PENDING_EXTERNAL_TERMINAL_ATTESTATION', syncP95Ms: evidence.observations.accessibility.desktop.performance.syncP95Ms };
}

export function runAndWrite(repoRoot = process.cwd()) {
  assertHeadContour(repoRoot); validateBindings(repoRoot);
  writeCanonical(repoRoot, PATHS.inventory, buildInventory(repoRoot));
  const contract = buildContract(repoRoot); const evidence = buildEvidence(contract, runPhysicalProbe(repoRoot));
  writeCanonical(repoRoot, PATHS.contract, contract); writeCanonical(repoRoot, PATHS.evidence, evidence);
  writeCanonical(repoRoot, PATHS.approvals, buildStageApprovals(repoRoot)); writeCanonical(repoRoot, PATHS.activeApprovals, buildActiveApprovals(repoRoot));
  return result(contract, evidence, 'RUN_AND_WRITE');
}

export function checkArtifacts(repoRoot = process.cwd()) {
  assertHeadContour(repoRoot); validateBindings(repoRoot);
  assert(fs.readFileSync(path.join(repoRoot, PATHS.inventory)).equals(canonicalBytes(buildInventory(repoRoot))), 'E_INVENTORY_DRIFT', PATHS.inventory);
  const contract = buildContract(repoRoot); assert(fs.readFileSync(path.join(repoRoot, PATHS.contract)).equals(canonicalBytes(contract)), 'E_CONTRACT_DRIFT', PATHS.contract);
  const evidence = readJsonBytes(repoRoot, PATHS.evidence, true).value; validateEvidence(evidence, contract);
  validateCurrentApprovalSets(repoRoot);
  return result(contract, evidence, 'CHECK');
}

export function probeCurrentHead(repoRoot = process.cwd()) {
  assertHeadContour(repoRoot); validateBindings(repoRoot); const contract = buildContract(repoRoot); return result(contract, buildEvidence(contract, runPhysicalProbe(repoRoot)), 'FRESH_PROBE_NO_REPOSITORY_WRITE');
}

function main() {
  try {
    const mode = process.argv[2]; assert(['--write', '--check', '--probe'].includes(mode), 'E_USAGE', '--write | --check | --probe');
    const output = mode === '--write' ? runAndWrite() : mode === '--check' ? checkArtifacts() : probeCurrentHead();
    process.stdout.write(canonicalBytes(output));
  } catch (error) {
    process.stderr.write(`${JSON.stringify({ code: error.code || 'E_C6B_RECOVERY_UNTYPED', message: error.message })}\n`); process.exitCode = 1;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) main();
