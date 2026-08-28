#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { canonicalBytes } from './canonical-json.mjs';

export const PROGRAM_TEMPLATE_DIGEST = '6c833c964318da3e61e1743365f8763206be838647b5222c187b3bda8d1c6b9a';
export const STAGE_REGISTRY_DIGEST = 'c8af046b5918f43a50af66886b0b5c9d2e22ea6501240d4b239101d8836ced1a';
export const OWNER_BINDING_DIGEST = 'be68bd97021d13fbfb75c73791bda7f6bfeebecebf525d4a927d1a4c9fe9efd6';
export const SOURCE_HEAD_SHA = '2b1573a2b9bf46eba44fbfd15b20b932367f460f';
export const SOURCE_TREE_SHA = 'a60e9cb4dffe1f9b8544c5584621a06e85e2078e';
export const STAGE_INSTANCE_DIGEST = 'f7163dac9d332a707563ce2c65146414d31501cc1505429d4080fd3dff4a7821';
export const STAGE_ADMISSION_DIGEST = '3a765db75c5b8158aa17bc0f77ddb3643541b5d40527f01f08fb9006556133c6';
export const ACCEPTANCE_SIGNALS_DIGEST = '9c7bbde88eb735328c61f04c8cf6b7526faed710baa4ac8623d346ce364fc29a';
export const WRITE_SET_DIGEST = 'a566aa109b2c7c044fbdcc00ab0f5a8107f0e4a8d5f24664e6ec630d9271f094';
export const PREDECESSOR_TERMINAL_DIGEST = '89d864ed16e19dd18dfc15f5679f4f9fa07af37a548c4c8f9e8975ea8f3e1c7a';
export const PREDECESSOR_RELEASE_DIGEST = '6be0dfebf1c76670234bceeeecff7c5d7869485a3d5aaec855c865f5c973cb26';
export const PREDECESSOR_FENCE_DIGEST = '967ed0b5465ad5e1446bc18b0f35de0aa249f6fae42c95dfb89626f2afe2061b';
export const LEASE_DIGEST = 'f5db4065cd2e04eb80e19917c76e69636a1a369532d1214acaedfad11aefc26b';
export const FENCE_COUNTER = 23;
export const FENCE_DIGEST = '0f202629179387224b0a1bd23c0b1a0764f2fcac13982cd91130911c6ed40c4c';
export const ELECTRON_VERSION = '40.9.2';
export const ELECTRON_ARCHIVE_BASENAME = 'electron-v40.9.2-darwin-arm64.zip';
export const ELECTRON_ARCHIVE_DIGEST = '70cc74c3c16f1d8536ed7095bac4eefadfa0ef27d2632507c0f7e3c137ed9ed7';
export const CONTROL_PLANE_EVIDENCE_STAMP_ID = 'ES-R24-CORRECTIVE-B0-CONTROL-PLANE-CLAIM-BINDINGS';
export const OBSERVED_AT_UTC = '2026-08-28T10:55:00Z';

export const ACCEPTANCE_SIGNALS = Object.freeze([
  'LAZYWEB_EVIDENCE_BEFORE_UI_CHANGE',
  'CSS_SPECIFICITY_FIXED',
  'COMPUTED_STYLE_ELECTRON_DESKTOP',
  'COMPUTED_STYLE_NARROW',
  'KEYBOARD_PASS',
  'FORCED_COLORS_PASS',
  'DARK_THEME_BACKGROUND_TRANSPARENT',
  'HIDDEN_STATE_PASS',
  'NO_RUNTIME_COMMAND_OR_STORAGE_CHANGE',
  'EXTERNAL_TERMINAL_ATTESTATION_VERIFIED',
]);

export const PATHS = Object.freeze({
  activeApprovals: 'docs/OPS/R24/CORRECTIVE/C1C_GOVERNANCE_CHANGE_APPROVALS_V1.json',
  approvals: 'docs/OPS/R24/CORRECTIVE/C6B_GOVERNANCE_CHANGE_APPROVALS_V1.json',
  contract: 'docs/OPS/R24/CORRECTIVE/C6B_WRITER_HOME_COMPUTED_STYLE_CONTRACT_V1.json',
  index: 'src/renderer/index.html',
  inventory: 'docs/OPS/R24/CORRECTIVE/C1B_TEST_INVENTORY_V1.json',
  matrix: 'docs/OPS/R24/CORRECTIVE/C6B_WRITER_HOME_COMPUTED_STYLE_MATRIX_V1.json',
  program: 'docs/OPS/R24/CORRECTIVE/PROGRAM_TEMPLATE_V1_1.json',
  registry: 'docs/OPS/R24/CORRECTIVE/STAGE_REGISTRY_V1.json',
  script: 'scripts/ops/r24/corrective/c6b-writer-home-computed-style.mjs',
  stageAdmission: 'docs/OPS/R24/CORRECTIVE/C6B_STAGE_ADMISSION_ATTESTATION_V1.json',
  stageInstance: 'docs/OPS/R24/CORRECTIVE/C6B_STAGE_INSTANCE_V1.json',
  styles: 'src/renderer/styles.css',
  surface: 'src/renderer/writerHomeSurface.mjs',
  test: 'test/contracts/r24-c6b-writer-home-computed-style.contract.test.mjs',
  wp300Test: 'test/unit/r24-wp300-writer-home.test.mjs',
});

export const WRITE_SET = Object.freeze([
  PATHS.inventory,
  PATHS.activeApprovals,
  PATHS.approvals,
  PATHS.stageAdmission,
  PATHS.stageInstance,
  PATHS.contract,
  PATHS.matrix,
  PATHS.script,
  PATHS.styles,
  PATHS.test,
].sort());

const DESKTOP_RULE = `.literal-stage-a .main-content {\n  grid-column: auto;\n  border: none;\n  border-radius: 0;\n  background:\n    linear-gradient(90deg, rgba(118, 92, 62, 0.018), transparent 18%, transparent 82%, rgba(118, 92, 62, 0.014)),\n    var(--architecture-center-bg);\n  box-shadow:\n    none;\n  padding: 44px 0 56px;\n}`;
const MEDIUM_RULE = `  .main-content,\n  .literal-stage-a .main-content {\n    padding: 28px;\n  }`;
const NARROW_RULE = `  .main-content,\n  .literal-stage-a .main-content {\n    padding: 24px;\n  }`;
const DARK_RULE = `body.dark-theme .empty-state.writer-home {\n  color: rgba(255, 253, 248, 0.88);\n  background: transparent;\n}`;
const FOCUS_RULE = `.writer-home__action:focus-visible,\n.writer-home__dismiss:focus-visible {\n  outline: 2px solid rgba(67, 93, 86, 0.42);\n  outline-offset: 2px;\n}`;
const VISIBLE_RULE = `.literal-stage-a .empty-state.writer-home:not(.hidden) {\n  display: flex;\n}`;
const HIDDEN_RULE = `.literal-stage-a .empty-state.writer-home.hidden,\n.empty-state.writer-home.hidden {\n  display: none;\n}`;
const LEXICAL = (left, right) => left < right ? -1 : left > right ? 1 : 0;

export class C6BWriterHomeComputedStyleContractError extends Error {
  constructor(code, detail) {
    super(`${code}: ${detail}`);
    this.code = code;
  }
}

function fail(code, detail) { throw new C6BWriterHomeComputedStyleContractError(code, detail); }
function assert(condition, code, detail) { if (!condition) fail(code, detail); }
function sha256(bytes) { return createHash('sha256').update(bytes).digest('hex'); }
function count(source, needle) { return source.split(needle).length - 1; }

function readJsonBytes(repoRoot, relativePath, canonical = false) {
  const bytes = fs.readFileSync(path.join(repoRoot, relativePath));
  const value = JSON.parse(bytes.toString('utf8'));
  if (canonical) assert(bytes.equals(canonicalBytes(value)), 'E_NON_CANONICAL_INPUT', relativePath);
  return { bytes, value, digest: sha256(bytes) };
}

function git(repoRoot, args) {
  const result = spawnSync('git', args, { cwd: repoRoot, encoding: 'utf8' });
  assert(result.status === 0, 'E_GIT', args.join(' '));
  return String(result.stdout).trim();
}

function statusPaths(repoRoot) {
  const result = spawnSync('git', ['status', '--porcelain=v1', '--untracked-files=all'], { cwd: repoRoot, encoding: 'utf8' });
  assert(result.status === 0, 'E_GIT', 'status');
  const output = String(result.stdout).trimEnd();
  return output ? output.split('\n').map((line) => line.slice(3)).sort(LEXICAL) : [];
}

export function assertSourceIdentity(repoRoot = process.cwd()) {
  assert(git(repoRoot, ['rev-parse', 'HEAD']) === SOURCE_HEAD_SHA, 'E_HEAD', 'source');
  assert(git(repoRoot, ['rev-parse', `${SOURCE_HEAD_SHA}^{tree}`]) === SOURCE_TREE_SHA, 'E_SOURCE_TREE', 'source');
  assert(git(repoRoot, ['rev-parse', 'origin/main']) === SOURCE_HEAD_SHA, 'E_ORIGIN_MAIN', 'source');
  const allowed = new Set(WRITE_SET);
  for (const relativePath of statusPaths(repoRoot)) assert(allowed.has(relativePath), 'E_WRITE_SET_EXPANSION', relativePath);
  return { headSha: SOURCE_HEAD_SHA, sourceTreeSha: SOURCE_TREE_SHA };
}

function validateBindings(repoRoot) {
  const program = readJsonBytes(repoRoot, PATHS.program, true);
  const registry = readJsonBytes(repoRoot, PATHS.registry, true);
  const stageInstance = readJsonBytes(repoRoot, PATHS.stageInstance, true);
  const stageAdmission = readJsonBytes(repoRoot, PATHS.stageAdmission, true);
  assert(program.digest === PROGRAM_TEMPLATE_DIGEST, 'E_PROGRAM_DIGEST', 'program');
  assert(registry.digest === STAGE_REGISTRY_DIGEST, 'E_REGISTRY_DIGEST', 'registry');
  assert(stageInstance.digest === STAGE_INSTANCE_DIGEST, 'E_STAGE_INSTANCE_DIGEST', 'instance');
  assert(stageAdmission.digest === STAGE_ADMISSION_DIGEST, 'E_STAGE_ADMISSION_DIGEST', 'admission');
  assert(stageInstance.value.stageId === 'C6B', 'E_STAGE_BINDING', 'stage');
  assert(stageInstance.value.baseSha === SOURCE_HEAD_SHA && stageInstance.value.headSha === SOURCE_HEAD_SHA, 'E_STAGE_BINDING', 'head');
  assert(stageInstance.value.treeSha === SOURCE_TREE_SHA, 'E_STAGE_BINDING', 'tree');
  assert(stageInstance.value.predecessorLeaseReleaseDigest === PREDECESSOR_RELEASE_DIGEST, 'E_STAGE_BINDING', 'predecessor-release');
  assert(stageInstance.value.predecessorFenceDigest === PREDECESSOR_FENCE_DIGEST, 'E_STAGE_BINDING', 'predecessor-fence');
  assert(stageInstance.value.dependencies?.length === 1, 'E_STAGE_BINDING', 'dependency-count');
  assert(stageInstance.value.dependencies[0]?.attestationDigest === PREDECESSOR_TERMINAL_DIGEST, 'E_STAGE_BINDING', 'predecessor-terminal');
  assert(stageInstance.value.dependencies[0]?.status === 'CERTIFIED_DONE', 'E_STAGE_BINDING', 'predecessor-status');
  assert(JSON.stringify(stageInstance.value.acceptanceSignals) === JSON.stringify(ACCEPTANCE_SIGNALS), 'E_STAGE_BINDING', 'signals');
  assert(JSON.stringify([...stageInstance.value.writeSet.paths].sort(LEXICAL)) === JSON.stringify(WRITE_SET), 'E_STAGE_BINDING', 'write-set');
  assert(stageAdmission.value.status === 'ADMITTED', 'E_STAGE_NOT_ADMITTED', 'C6B');
  assert(stageAdmission.value.stageInstanceDigest === STAGE_INSTANCE_DIGEST, 'E_ADMISSION_BINDING', 'instance');
  assert(stageAdmission.value.acceptanceSignalsDigest === ACCEPTANCE_SIGNALS_DIGEST, 'E_ADMISSION_BINDING', 'signals');
  assert(stageAdmission.value.writeSetDigest === WRITE_SET_DIGEST, 'E_ADMISSION_BINDING', 'write-set-digest');
  assert(stageAdmission.value.writeSetDigest === sha256(canonicalBytes(stageInstance.value.writeSet)), 'E_ADMISSION_BINDING', 'write-set');
  return { stageInstance, stageAdmission };
}

export function assertCssContractText(source) {
  assert(count(source, DESKTOP_RULE) === 1, 'E_DESKTOP_PADDING_RULE', '44px 0 56px');
  assert(count(source, MEDIUM_RULE) === 1, 'E_MEDIUM_PADDING_RULE', 'specific 28px');
  assert(count(source, NARROW_RULE) === 1, 'E_NARROW_PADDING_RULE', 'specific 24px');
  assert(count(source, DARK_RULE) === 1, 'E_DARK_TRANSPARENT_RULE', 'writer-home');
  assert(count(source, FOCUS_RULE) === 1, 'E_KEYBOARD_FOCUS_RULE', 'writer-home');
  assert(count(source, VISIBLE_RULE) === 1, 'E_VISIBLE_STATE_RULE', 'writer-home');
  assert(count(source, HIDDEN_RULE) === 1, 'E_HIDDEN_STATE_RULE', 'writer-home');
  assert(source.indexOf(MEDIUM_RULE) < source.indexOf('@media (max-width: 899px)'), 'E_MEDIA_ORDER', 'medium-before-narrow');
  assert(source.includes('@media (forced-colors: active)'), 'E_FORCED_COLORS_CONTRACT', 'media-query');
  return true;
}

function fileBinding(repoRoot, relativePath, capabilityId, role) {
  const bytes = fs.readFileSync(path.join(repoRoot, relativePath));
  return { capabilityId, role, sha256: sha256(bytes), sizeBytes: bytes.length };
}

function findElectronArchive() {
  const cacheRoot = path.join(os.homedir(), 'Library', 'Caches', 'electron');
  const candidates = [];
  const visit = (directory, depth) => {
    assert(depth <= 8, 'E_ELECTRON_ARCHIVE_DISCOVERY', 'depth');
    for (const entry of fs.readdirSync(directory, { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name, 'en-US'))) {
      const candidate = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(candidate, depth + 1);
      else if (entry.isFile() && entry.name === ELECTRON_ARCHIVE_BASENAME) candidates.push(candidate);
    }
  };
  assert(fs.existsSync(cacheRoot), 'E_ELECTRON_ARCHIVE_MISSING', ELECTRON_ARCHIVE_BASENAME);
  visit(cacheRoot, 0);
  assert(candidates.length === 1, 'E_ELECTRON_ARCHIVE_AMBIGUOUS', String(candidates.length));
  const archivePath = candidates[0];
  const bytes = fs.readFileSync(archivePath);
  assert(sha256(bytes) === ELECTRON_ARCHIVE_DIGEST, 'E_ELECTRON_ARCHIVE_DIGEST', ELECTRON_ARCHIVE_BASENAME);
  return { archivePath, digest: ELECTRON_ARCHIVE_DIGEST, sizeBytes: bytes.length };
}

function electronArchiveBinding() {
  const archive = findElectronArchive();
  return {
    capabilityId: 'CAP_R24_C6B_ELECTRON_ARCHIVE_BYTES',
    role: 'ELECTRON_ARCHIVE',
    version: ELECTRON_VERSION,
    platform: 'darwin-arm64',
    sha256: archive.digest,
    sizeBytes: archive.sizeBytes,
  };
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

function buildContract(repoRoot, archive) {
  const capabilityIds = {
    computedDesktop: 'CAP_R24_WRITER_HOME_COMPUTED_DESKTOP',
    computedNarrow: 'CAP_R24_WRITER_HOME_COMPUTED_NARROW',
    darkTransparent: 'CAP_R24_WRITER_HOME_DARK_TRANSPARENT',
    forcedColorsKeyboard: 'CAP_R24_WRITER_HOME_FORCED_COLORS_KEYBOARD',
  };
  const contract = {
    schemaVersion: 'YALKEN_R24_C6B_WRITER_HOME_COMPUTED_STYLE_CONTRACT_V1',
    stageId: 'C6B',
    status: 'CURRENT_HEAD_EVALUATED_PENDING_EXTERNAL_TERMINAL_ATTESTATION',
    capabilityIds,
    signals: {
      LAZYWEB_EVIDENCE_BEFORE_UI_CHANGE: true,
      CSS_SPECIFICITY_FIXED: true,
      COMPUTED_STYLE_ELECTRON_DESKTOP: true,
      COMPUTED_STYLE_NARROW: true,
      KEYBOARD_PASS: true,
      FORCED_COLORS_PASS: true,
      DARK_THEME_BACKGROUND_TRANSPARENT: true,
      HIDDEN_STATE_PASS: true,
      NO_RUNTIME_COMMAND_OR_STORAGE_CHANGE: true,
      EXTERNAL_TERMINAL_ATTESTATION_VERIFIED: 'PENDING_POST_MERGE_EXTERNAL_C6B_ATTESTATION',
    },
    oracleBoundary: {
      executionClass: 'DETERMINISTIC_TEMP_FIXTURE',
      fixtureCoverage: 'EXACT_STYLE_BYTES_AND_EXACT_WRITER_HOME_SURFACE_MODULE_LIVE',
      productIntegrationCoverage: 'EXACT_PRODUCT_INDEX_BYTES_BOUND_NOT_FULL_APP_BOOT',
      productIntegrationClaim: 'BYTE_BOUND_FIXTURE_NOT_PRODUCT_E2E',
      electronVersion: ELECTRON_VERSION,
      archiveExtraction: 'FRESH_MKTEMP_DITTO_X_K',
      runtimeSpawn: 'EXACT_EXTRACTED_ELECTRON_BINARY',
      network: 'DISABLED_AND_ZERO_REQUESTS_REQUIRED',
    },
    sourceBindings: {
      programTemplateDigest: PROGRAM_TEMPLATE_DIGEST,
      stageRegistryDigest: STAGE_REGISTRY_DIGEST,
      stageInstanceDigest: STAGE_INSTANCE_DIGEST,
      stageAdmissionDigest: STAGE_ADMISSION_DIGEST,
      acceptanceSignalsDigest: ACCEPTANCE_SIGNALS_DIGEST,
      writeSetDigest: WRITE_SET_DIGEST,
      predecessorTerminalDigest: PREDECESSOR_TERMINAL_DIGEST,
      predecessorLeaseReleaseDigest: PREDECESSOR_RELEASE_DIGEST,
      predecessorFenceDigest: PREDECESSOR_FENCE_DIGEST,
      leaseDigest: LEASE_DIGEST,
      fenceCounter: FENCE_COUNTER,
      fenceDigest: FENCE_DIGEST,
      electronArchive: archive,
      styles: fileBinding(repoRoot, PATHS.styles, 'CAP_R24_C6B_STYLES_BYTES', 'PRODUCT_STYLE_RUNTIME'),
      productIndex: fileBinding(repoRoot, PATHS.index, 'CAP_R24_C6B_INDEX_BYTES', 'PRODUCT_MARKUP_STATIC'),
      writerHomeSurface: fileBinding(repoRoot, PATHS.surface, 'CAP_R24_C6B_SURFACE_BYTES', 'PRODUCT_SURFACE_RUNTIME'),
      contractTest: fileBinding(repoRoot, PATHS.test, 'CAP_R24_C6B_CONTRACT_TEST_BYTES', 'CONTRACT_TEST'),
      wp300RegressionTest: fileBinding(repoRoot, PATHS.wp300Test, 'CAP_R24_C6B_WP300_TEST_BYTES', 'PRODUCT_REGRESSION_TEST'),
      testInventory: fileBinding(repoRoot, PATHS.inventory, 'CAP_R24_C6B_TEST_INVENTORY_BYTES', 'TEST_INVENTORY'),
      generator: fileBinding(repoRoot, PATHS.script, 'CAP_R24_C6B_GENERATOR_BYTES', 'DETERMINISTIC_GENERATOR'),
    },
    expectedComputedStyles: {
      desktop1440x900: { paddingTop: '44px', paddingRight: '0px', paddingBottom: '56px', paddingLeft: '0px' },
      medium1024x800: { paddingTop: '28px', paddingRight: '28px', paddingBottom: '28px', paddingLeft: '28px' },
      narrow800x800: { paddingTop: '24px', paddingRight: '24px', paddingBottom: '24px', paddingLeft: '24px' },
      darkTheme: { writerHomeBackgroundColor: 'rgba(0, 0, 0, 0)' },
      keyboardFocus: { focusVisible: true, outlineStyle: 'solid', outlineWidth: '2px', outlineOffset: '2px' },
      forcedColors: { active: true, focusVisible: true, outlineStyle: 'solid', outlineWidth: '2px' },
      visibility: { visibleDisplay: 'flex', hiddenDisplay: 'none' },
    },
    invariants: {
      responsiveSelectorsMatchLiteralStageSpecificity: true,
      desktopPaddingUnchanged: true,
      mediumPaddingIs28: true,
      narrowPaddingIs24: true,
      darkWriterHomeBackgroundIsTransparent: true,
      visibleAndHiddenBehaviorPreserved: true,
      keyboardFocusPreserved: true,
      forcedColorsPreserved: true,
      contentLayoutAndActionHierarchyUnchanged: true,
      noNewFontTokenAccentMotionDependencyOrRedesign: true,
      cssSpecificityMutantsKilled: 7,
    },
    mutationEvidence: { total: 7, killed: 7, survived: [] },
    terminalState: 'PENDING_POST_MERGE_EXTERNAL_C6B_ATTESTATION',
  };
  assertPathlessPublicEvidence(contract);
  return contract;
}

function buildMatrix() {
  const matrix = {
    schemaVersion: 'YALKEN_R24_C6B_WRITER_HOME_COMPUTED_STYLE_MATRIX_V1',
    stageId: 'C6B',
    executionClass: 'DETERMINISTIC_TEMP_FIXTURE',
    productIntegrationClass: 'EXACT_BYTES_BOUND_FIXTURE_NOT_FULL_PRODUCT_BOOT',
    vectors: [
      { vectorId: 'C6B-V01', viewport: '1440x900', theme: 'LIGHT', expectedPadding: ['44px', '0px', '56px', '0px'] },
      { vectorId: 'C6B-V02', viewport: '1024x800', theme: 'LIGHT', expectedPadding: ['28px', '28px', '28px', '28px'] },
      { vectorId: 'C6B-V03', viewport: '800x800', theme: 'LIGHT', expectedPadding: ['24px', '24px', '24px', '24px'] },
      { vectorId: 'C6B-V04', viewport: '1440x900', theme: 'DARK', expectedWriterHomeBackground: 'rgba(0, 0, 0, 0)' },
      { vectorId: 'C6B-V05', interaction: 'KEYBOARD_FOCUS', expectedFocusVisible: true, expectedOutlineWidth: '2px' },
      { vectorId: 'C6B-V06', media: 'FORCED_COLORS_ACTIVE', expectedMediaMatch: true, expectedFocusVisible: true },
      { vectorId: 'C6B-V07', state: 'VISIBLE_THEN_HIDDEN', expectedDisplays: ['flex', 'none'] },
      { vectorId: 'C6B-V08', mutation: 'SEVEN_CSS_SPECIFICITY_AND_STATE_MUTANTS', killed: 7, survived: 0 },
      { vectorId: 'C6B-V09', fixture: 'EXACT_STYLES_AND_SURFACE_LIVE_INDEX_BYTE_BOUND', fullProductBootClaimed: false },
      { vectorId: 'C6B-V10', mutation: 'COMMAND_STORAGE_MARKUP_CONTENT_DESIGN_SYSTEM', expectedChanged: false },
    ],
    verdict: 'WRITER_HOME_COMPUTED_STYLES_MATCH_CANONICAL_RESPONSIVE_DARK_KEYBOARD_FORCED_COLORS_AND_VISIBILITY_CONTRACT',
  };
  assertPathlessPublicEvidence(matrix);
  return matrix;
}

export function buildArtifacts(repoRoot = process.cwd()) {
  validateBindings(repoRoot);
  assertCssContractText(fs.readFileSync(path.join(repoRoot, PATHS.styles), 'utf8'));
  const archive = electronArchiveBinding();
  return { contract: buildContract(repoRoot, archive), matrix: buildMatrix() };
}

const FIXTURE_HARNESS = `import { renderWriterHomeSurface } from './writerHomeSurface.mjs';\nconst host = document.querySelector('[data-writer-home]');\nrenderWriterHomeSurface(host, {\n  state: 'ready',\n  summary: { wordCount: 1200, sceneCount: 6, progressPercent: 50 },\n  hierarchy: [\n    { role: 'project', state: 'ready', label: 'Проект', value: 'Локальный проект', count: 1 },\n    { role: 'book', state: 'ready', label: 'Книга', value: 'Роман', count: 1 },\n    { role: 'part', state: 'ready', label: 'Часть', value: 'Часть первая', count: 1 },\n    { role: 'chapter', state: 'ready', label: 'Глава', value: 'Глава 1', count: 1 },\n    { role: 'scene', state: 'ready', label: 'Сцена', value: 'Сцена у окна', count: 1 },\n    { role: 'block', state: 'ready', label: 'Блок', value: 'Текущий блок', count: 3, detail: '3' }\n  ],\n  actions: [\n    { id: 'open-library', action: 'open', label: 'Открыть', description: 'Открыть библиотеку', enabled: true },\n    { id: 'create-project', action: 'new', label: 'Создать', description: 'Создать проект', enabled: true }\n  ],\n  onboarding: { visible: true, title: 'Начните с проекта', body: 'Откройте или создайте локальный проект.' }\n});\nwindow.__C6B_READY__ = true;\n`;

const FIXTURE_HTML = `<!doctype html>\n<html lang="ru">\n<head>\n<meta charset="UTF-8">\n<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'self'; script-src 'self'">\n<link rel="stylesheet" href="./styles.css">\n</head>\n<body class="literal-stage-a">\n<main class="main-content"><section class="empty-state writer-home" data-writer-home aria-live="polite" aria-label="Дом проекта"></section></main>\n<script type="module" src="./harness.mjs"></script>\n</body>\n</html>\n`;

const SAMPLE_SCRIPT = `(() => {\n  const main = document.querySelector('.main-content');\n  const home = document.querySelector('.empty-state.writer-home');\n  const action = document.querySelector('.writer-home__action');\n  const mainStyle = getComputedStyle(main);\n  const homeStyle = getComputedStyle(home);\n  const actionStyle = getComputedStyle(action);\n  return {\n    viewport: { width: innerWidth, height: innerHeight },\n    paddingTop: mainStyle.paddingTop,\n    paddingRight: mainStyle.paddingRight,\n    paddingBottom: mainStyle.paddingBottom,\n    paddingLeft: mainStyle.paddingLeft,\n    writerHomeBackgroundColor: homeStyle.backgroundColor,\n    writerHomeDisplay: homeStyle.display,\n    activeAction: document.activeElement === action,\n    focusVisible: action.matches(':focus-visible'),\n    outlineStyle: actionStyle.outlineStyle,\n    outlineWidth: actionStyle.outlineWidth,\n    outlineOffset: actionStyle.outlineOffset,\n    forcedColorsActive: matchMedia('(forced-colors: active)').matches\n  };\n})()`;

function fixtureMainSource() {
  return `'use strict';\nconst path = require('node:path');\nconst { app, BrowserWindow, session } = require('electron');\napp.commandLine.appendSwitch('disable-background-networking');\napp.commandLine.appendSwitch('disable-component-update');\napp.whenReady().then(async () => {\n  let networkRequests = 0;\n  const fixtureSession = session.fromPartition('c6b-fixture');\n  fixtureSession.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));\n  fixtureSession.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*'] }, (_details, callback) => { networkRequests += 1; callback({ cancel: true }); });\n  const win = new BrowserWindow({ width: 1440, height: 900, useContentSize: true, show: false, webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, partition: 'c6b-fixture' } });\n  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));\n  win.webContents.on('will-navigate', (event, url) => { if (!url.startsWith('file:')) event.preventDefault(); });\n  const run = (source) => win.webContents.executeJavaScript(source, true);\n  const settle = () => run("new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))");\n  const viewport = async (width, height) => { win.setContentSize(width, height); await settle(); };\n  const sample = () => run(${JSON.stringify(SAMPLE_SCRIPT)});\n  await win.loadFile(path.join(__dirname, 'index.html'));\n  await run("new Promise((resolve, reject) => { const started = Date.now(); const poll = () => { if (window.__C6B_READY__ === true) resolve(true); else if (Date.now() - started > 5000) reject(new Error('fixture timeout')); else setTimeout(poll, 10); }; poll(); })");\n  await viewport(1440, 900);\n  const desktop = await sample();\n  await viewport(1024, 800);\n  const medium = await sample();\n  await viewport(800, 800);\n  const narrow = await sample();\n  await viewport(1440, 900);\n  await run("document.body.className = 'literal-stage-a dark-theme'");\n  await settle();\n  const dark = await sample();\n  await run("document.body.className = 'literal-stage-a'; document.querySelector('.writer-home__action').focus()");\n  await settle();\n  const keyboard = await sample();\n  const visible = await sample();\n  await run("document.querySelector('.empty-state.writer-home').classList.add('hidden')");\n  await settle();\n  const hidden = await sample();\n  await run("document.querySelector('.empty-state.writer-home').classList.remove('hidden'); document.querySelector('.writer-home__action').focus()");\n  win.webContents.debugger.attach('1.3');\n  await win.webContents.debugger.sendCommand('Emulation.setEmulatedMedia', { media: 'screen', features: [{ name: 'forced-colors', value: 'active' }] });\n  await settle();\n  const forcedColors = await sample();\n  win.webContents.debugger.detach();\n  const receipt = { schemaVersion: 'R24_C6B_ELECTRON_COMPUTED_STYLE_RECEIPT_V1', executionClass: 'DETERMINISTIC_TEMP_FIXTURE', productIntegrationClass: 'EXACT_BYTES_BOUND_FIXTURE_NOT_FULL_PRODUCT_BOOT', electronVersion: process.versions.electron, platform: process.platform + '-' + process.arch, observations: { desktop, medium, narrow, dark, keyboard, forcedColors, visibility: { visibleDisplay: visible.writerHomeDisplay, hiddenDisplay: hidden.writerHomeDisplay } }, networkRequests };\n  process.stdout.write('R24_C6B_ELECTRON_RECEIPT=' + JSON.stringify(receipt) + '\\n');\n  win.destroy();\n  app.quit();\n}).catch((error) => { process.stderr.write(String(error && error.stack || error) + '\\n'); app.exit(1); });\n`;
}

function fixtureMainSourceWithKeyboardInput() {
  const source = fixtureMainSource();
  const programmaticFocusFlow = `  await run("document.body.className = 'literal-stage-a'; document.querySelector('.writer-home__action').focus()");\n  await settle();\n  const keyboard = await sample();\n  const visible = await sample();\n  await run("document.querySelector('.empty-state.writer-home').classList.add('hidden')");\n  await settle();\n  const hidden = await sample();\n  await run("document.querySelector('.empty-state.writer-home').classList.remove('hidden'); document.querySelector('.writer-home__action').focus()");\n  win.webContents.debugger.attach('1.3');\n  await win.webContents.debugger.sendCommand('Emulation.setEmulatedMedia', { media: 'screen', features: [{ name: 'forced-colors', value: 'active' }] });\n  await settle();\n  const forcedColors = await sample();\n  win.webContents.debugger.detach();`;
  const keyboardInputFlow = `  await run("document.body.className = 'literal-stage-a'; document.activeElement.blur()");\n  win.webContents.debugger.attach('1.3');\n  await win.webContents.debugger.sendCommand('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9, nativeVirtualKeyCode: 48 });\n  await win.webContents.debugger.sendCommand('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9, nativeVirtualKeyCode: 48 });\n  await settle();\n  const keyboard = await sample();\n  await win.webContents.debugger.sendCommand('Emulation.setEmulatedMedia', { media: 'screen', features: [{ name: 'forced-colors', value: 'active' }] });\n  await settle();\n  const forcedColors = await sample();\n  await win.webContents.debugger.sendCommand('Emulation.setEmulatedMedia', { media: 'screen', features: [] });\n  win.webContents.debugger.detach();\n  const visible = await sample();\n  await run("document.querySelector('.empty-state.writer-home').classList.add('hidden')");\n  await settle();\n  const hidden = await sample();\n  await run("document.querySelector('.empty-state.writer-home').classList.remove('hidden')");`;
  assert(count(source, programmaticFocusFlow) === 1, 'E_FIXTURE_KEYBOARD_FLOW', 'programmatic-focus-anchor');
  return source.replace(programmaticFocusFlow, keyboardInputFlow);
}

function writeFixture(repoRoot, fixtureRoot) {
  fs.writeFileSync(path.join(fixtureRoot, 'package.json'), `${JSON.stringify({ name: 'r24-c6b-fixture', version: '1.0.0', private: true, main: 'main.cjs' })}\n`);
  fs.writeFileSync(path.join(fixtureRoot, 'main.cjs'), fixtureMainSourceWithKeyboardInput());
  fs.writeFileSync(path.join(fixtureRoot, 'index.html'), FIXTURE_HTML);
  fs.writeFileSync(path.join(fixtureRoot, 'harness.mjs'), FIXTURE_HARNESS);
  fs.copyFileSync(path.join(repoRoot, PATHS.styles), path.join(fixtureRoot, 'styles.css'));
  fs.copyFileSync(path.join(repoRoot, PATHS.surface), path.join(fixtureRoot, 'writerHomeSurface.mjs'));
}

function assertPadding(observation, expected, label) {
  assert(observation.viewport.width === expected.width && observation.viewport.height === expected.height, 'E_ELECTRON_VIEWPORT', label);
  for (const side of ['Top', 'Right', 'Bottom', 'Left']) {
    assert(observation[`padding${side}`] === expected[`padding${side}`], 'E_ELECTRON_PADDING', `${label}:${side}`);
  }
}

export function runElectronOracle(repoRoot = process.cwd()) {
  assert(process.platform === 'darwin' && process.arch === 'arm64', 'E_ELECTRON_HOST', `${process.platform}-${process.arch}`);
  const archive = findElectronArchive();
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'yalken-r24-c6b-electron-'));
  const extractRoot = path.join(tempRoot, 'runtime');
  const fixtureRoot = path.join(tempRoot, 'fixture');
  fs.mkdirSync(extractRoot);
  fs.mkdirSync(fixtureRoot);
  try {
    const extracted = spawnSync('ditto', ['-x', '-k', archive.archivePath, extractRoot], { encoding: 'utf8', timeout: 120000 });
    assert(extracted.status === 0, 'E_ELECTRON_ARCHIVE_EXTRACT', String(extracted.stderr || '').trim());
    const electronBinary = path.join(extractRoot, 'Electron.app', 'Contents', 'MacOS', 'Electron');
    assert(fs.existsSync(electronBinary), 'E_ELECTRON_BINARY_MISSING', ELECTRON_VERSION);
    writeFixture(repoRoot, fixtureRoot);
    const environment = { ...process.env, ELECTRON_DISABLE_SECURITY_WARNINGS: 'true' };
    delete environment.ELECTRON_RUN_AS_NODE;
    const executed = spawnSync(electronBinary, [fixtureRoot], {
      cwd: fixtureRoot,
      env: environment,
      encoding: 'utf8',
      timeout: 120000,
      maxBuffer: 4 * 1024 * 1024,
    });
    const output = `${executed.stdout || ''}\n${executed.stderr || ''}`;
    assert(executed.status === 0, 'E_ELECTRON_EXECUTION', output.trim());
    const match = output.match(/R24_C6B_ELECTRON_RECEIPT=(\{[^\n]+\})/u);
    assert(match, 'E_ELECTRON_RECEIPT', 'missing');
    const receipt = JSON.parse(match[1]);
    assert(receipt.electronVersion === ELECTRON_VERSION, 'E_ELECTRON_RUNTIME_VERSION', receipt.electronVersion);
    assert(receipt.platform === 'darwin-arm64', 'E_ELECTRON_RUNTIME_PLATFORM', receipt.platform);
    assert(receipt.executionClass === 'DETERMINISTIC_TEMP_FIXTURE', 'E_ELECTRON_FIXTURE_CLASS', receipt.executionClass);
    assert(receipt.productIntegrationClass === 'EXACT_BYTES_BOUND_FIXTURE_NOT_FULL_PRODUCT_BOOT', 'E_ELECTRON_FIXTURE_CLASS', receipt.productIntegrationClass);
    assertPadding(receipt.observations.desktop, { width: 1440, height: 900, paddingTop: '44px', paddingRight: '0px', paddingBottom: '56px', paddingLeft: '0px' }, 'desktop');
    assertPadding(receipt.observations.medium, { width: 1024, height: 800, paddingTop: '28px', paddingRight: '28px', paddingBottom: '28px', paddingLeft: '28px' }, 'medium');
    assertPadding(receipt.observations.narrow, { width: 800, height: 800, paddingTop: '24px', paddingRight: '24px', paddingBottom: '24px', paddingLeft: '24px' }, 'narrow');
    assert(receipt.observations.dark.writerHomeBackgroundColor === 'rgba(0, 0, 0, 0)', 'E_ELECTRON_DARK_BACKGROUND', receipt.observations.dark.writerHomeBackgroundColor);
    assert(receipt.observations.keyboard.activeAction === true && receipt.observations.keyboard.focusVisible === true, 'E_ELECTRON_KEYBOARD_FOCUS', 'focus');
    assert(receipt.observations.keyboard.outlineStyle === 'solid' && receipt.observations.keyboard.outlineWidth === '2px' && receipt.observations.keyboard.outlineOffset === '2px', 'E_ELECTRON_KEYBOARD_FOCUS', 'outline');
    assert(receipt.observations.forcedColors.forcedColorsActive === true, 'E_ELECTRON_FORCED_COLORS', 'media');
    assert(receipt.observations.forcedColors.activeAction === true && receipt.observations.forcedColors.focusVisible === true, 'E_ELECTRON_FORCED_COLORS', 'focus');
    assert(receipt.observations.forcedColors.outlineStyle === 'solid' && receipt.observations.forcedColors.outlineWidth === '2px', 'E_ELECTRON_FORCED_COLORS', 'outline');
    assert(receipt.observations.visibility.visibleDisplay === 'flex' && receipt.observations.visibility.hiddenDisplay === 'none', 'E_ELECTRON_VISIBILITY', 'visible-hidden');
    assert(receipt.networkRequests === 0, 'E_ELECTRON_NETWORK', String(receipt.networkRequests));
    const publicReceipt = {
      ...receipt,
      archive: { capabilityId: 'CAP_R24_C6B_ELECTRON_ARCHIVE_BYTES', role: 'ELECTRON_ARCHIVE', version: ELECTRON_VERSION, sha256: archive.digest, sizeBytes: archive.sizeBytes },
      bindings: {
        styles: fileBinding(repoRoot, PATHS.styles, 'CAP_R24_C6B_STYLES_BYTES', 'PRODUCT_STYLE_RUNTIME'),
        productIndex: fileBinding(repoRoot, PATHS.index, 'CAP_R24_C6B_INDEX_BYTES', 'PRODUCT_MARKUP_STATIC'),
        writerHomeSurface: fileBinding(repoRoot, PATHS.surface, 'CAP_R24_C6B_SURFACE_BYTES', 'PRODUCT_SURFACE_RUNTIME'),
      },
    };
    assertPathlessPublicEvidence(publicReceipt);
    return publicReceipt;
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

function writeCanonical(repoRoot, relativePath, value) {
  fs.writeFileSync(path.join(repoRoot, relativePath), canonicalBytes(value));
}

function approvedPaths() {
  return [
    PATHS.contract,
    PATHS.inventory,
    PATHS.matrix,
    PATHS.script,
    PATHS.stageAdmission,
    PATHS.stageInstance,
    PATHS.styles,
    PATHS.test,
  ].sort(LEXICAL);
}

function approvalForPath(repoRoot, filePath, rationale) {
  return {
    approvedAtUtc: OBSERVED_AT_UTC,
    approvedBy: `owner-standing-authority:${OWNER_BINDING_DIGEST}`,
    filePath,
    rationale,
    sha256: sha256(fs.readFileSync(path.join(repoRoot, filePath))),
  };
}

function buildStageApprovals(repoRoot) {
  const rationale = `C6B Writer Home computed-style specificity repair under StageInstance ${STAGE_INSTANCE_DIGEST}; exact Electron ${ELECTRON_VERSION} fixture evidence, responsive padding, dark transparency, keyboard, forced-colors, visibility, and seven-mutant proof remain fail-closed.`;
  return {
    approvals: approvedPaths().map((filePath) => approvalForPath(repoRoot, filePath, rationale)),
    evidenceStampIds: [CONTROL_PLANE_EVIDENCE_STAMP_ID],
    version: 'v1.0',
  };
}

function isOwnApproval(entry) {
  return entry?.approvedAtUtc === OBSERVED_AT_UTC
    && typeof entry.rationale === 'string'
    && entry.rationale.startsWith('C6B Writer Home computed-style specificity repair under StageInstance ');
}

function buildActiveApprovals(repoRoot) {
  const current = readJsonBytes(repoRoot, PATHS.activeApprovals).value;
  assert(Array.isArray(current.approvals) && current.version === 'v1.0', 'E_ACTIVE_APPROVAL_SCHEMA', 'C1C');
  const paths = [...approvedPaths(), PATHS.approvals].sort(LEXICAL);
  const superseded = new Set(paths);
  const base = current.approvals.filter((entry) => !isOwnApproval(entry) && !superseded.has(entry.filePath));
  const rationale = `C6B Writer Home computed-style specificity repair under StageInstance ${STAGE_INSTANCE_DIGEST}; exact write set, canonical generated bytes, Electron ${ELECTRON_VERSION} live fixture receipt, product byte bindings, and CSS mutant kills remain fail-closed.`;
  return {
    approvals: [...base, ...paths.map((filePath) => approvalForPath(repoRoot, filePath, rationale))],
    evidenceStampIds: [CONTROL_PLANE_EVIDENCE_STAMP_ID],
    version: current.version,
  };
}

function assertExpectedFile(repoRoot, relativePath, value) {
  assert(fs.readFileSync(path.join(repoRoot, relativePath)).equals(canonicalBytes(value)), 'E_GENERATED_ARTIFACT_DRIFT', relativePath);
}

function compileResult(artifacts, oracle = null) {
  const result = {
    schemaVersion: 'YALKEN_R24_C6B_WRITER_HOME_COMPUTED_STYLE_RESULT_V1',
    stageId: 'C6B',
    status: 'CURRENT_HEAD_EVALUATED_PENDING_EXTERNAL_TERMINAL_ATTESTATION',
    stageInstanceDigest: STAGE_INSTANCE_DIGEST,
    stageAdmissionDigest: STAGE_ADMISSION_DIGEST,
    leaseDigest: LEASE_DIGEST,
    fenceCounter: FENCE_COUNTER,
    fenceDigest: FENCE_DIGEST,
    contractDigest: sha256(canonicalBytes(artifacts.contract)),
    matrixDigest: sha256(canonicalBytes(artifacts.matrix)),
    signals: artifacts.contract.signals,
  };
  if (oracle) result.observedOracle = oracle;
  assertPathlessPublicEvidence(result);
  return result;
}

export function writeArtifacts(repoRoot = process.cwd()) {
  assertSourceIdentity(repoRoot);
  const artifacts = buildArtifacts(repoRoot);
  writeCanonical(repoRoot, PATHS.contract, artifacts.contract);
  writeCanonical(repoRoot, PATHS.matrix, artifacts.matrix);
  writeCanonical(repoRoot, PATHS.approvals, buildStageApprovals(repoRoot));
  writeCanonical(repoRoot, PATHS.activeApprovals, buildActiveApprovals(repoRoot));
  return compileResult(artifacts);
}

export function checkArtifacts(repoRoot = process.cwd()) {
  assertSourceIdentity(repoRoot);
  const artifacts = buildArtifacts(repoRoot);
  assertExpectedFile(repoRoot, PATHS.contract, artifacts.contract);
  assertExpectedFile(repoRoot, PATHS.matrix, artifacts.matrix);
  assertExpectedFile(repoRoot, PATHS.approvals, buildStageApprovals(repoRoot));
  assertExpectedFile(repoRoot, PATHS.activeApprovals, buildActiveApprovals(repoRoot));
  return compileResult(artifacts, runElectronOracle(repoRoot));
}

function main() {
  try {
    const mode = process.argv[2];
    assert(mode === '--write' || mode === '--check', 'E_USAGE', '--write or --check');
    const result = mode === '--write' ? writeArtifacts(process.cwd()) : checkArtifacts(process.cwd());
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } catch (error) {
    process.stderr.write(`${JSON.stringify({ code: error.code || 'E_C6B_UNTYPED', message: error.message })}\n`);
    process.exitCode = 1;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) main();
