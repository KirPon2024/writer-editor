#!/usr/bin/env node
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const SCHEMA_VERSION = 'R24_C1B_TEST_INVENTORY_V1';
const CURRENT_STAGE = 'C1B';
const STAGE_ORDER = Object.freeze([
  'C1B', 'C1C', 'C2A', 'C2B1', 'C2B2', 'C2B3A', 'C2B3B', 'C2B3C', 'C2B4',
  'C3', 'C4', 'C5A', 'C5B', 'C5C1', 'C5C2', 'C5C3', 'C5C4', 'C6A', 'C6B',
  'C6C', 'C6D', 'C7A', 'C7B', 'C8A', 'C8B', 'C8C', 'C8D', 'C8E', 'C8Z', 'C9',
]);

const SUPERSEDED_LITERAL_TESTS = Object.freeze([
  'test/unit/palette-grouping.test.js',
  'test/unit/sector-m-design-os-command-palette-visibility.test.js',
  'test/unit/sector-m-design-os-document-context-truth.test.js',
  'test/unit/sector-m-design-os-dormant-observability.test.js',
  'test/unit/sector-m-design-os-profile-adoption.test.js',
  'test/unit/sector-m-design-os-restore-last-stable-preview-refresh.test.js',
  'test/unit/sector-m-design-os-safe-reset-adoption.test.js',
  'test/unit/sector-m-design-os-safe-reset-design-state-replay.test.js',
  'test/unit/sector-m-design-os-shell-mode-adoption.test.js',
  'test/unit/sector-m-design-os-status-hints.test.js',
  'test/unit/sector-m-design-os-theme-design-state.test.js',
  'test/unit/sector-m-design-os-token-css-adoption.test.js',
  'test/unit/sector-m-design-os-typography-design-state.test.js',
  'test/unit/sector-m-design-os-warning-hints.test.js',
]);

const SKIP_POLICIES = new Map();
for (const filePath of SUPERSEDED_LITERAL_TESTS) {
  SKIP_POLICIES.set(filePath, Object.freeze({
    classification: 'EXCLUDED_NON_REQUIRED',
    reason: 'SUPERSEDED_LITERAL_ASSERTIONS_TARGET_REMOVED_DORMANT_DESIGN_OS_SHAPE',
    owner: 'C6B_WRITER_HOME_UI_REPAIR',
    expiresBeforeStage: 'C6B',
    affectedClaims: ['HISTORICAL_DORMANT_DESIGN_OS_LITERAL_SHAPE'],
    required: false,
  }));
}

const conditionalPolicies = {
  'test/contracts/path-boundary-guard.contract.test.js': ['PLATFORM_COMPLEMENT', 'WINDOWS_SYMLINK_CASE_COVERED_BY_PARENT_SEGMENT_NEGATIVE', 'C7A', 'PATH_BOUNDARY'],
  'test/contracts/revision-bridge-exact-text-apply-crash-reconciliation.contract.test.js': ['PLATFORM_COMPLEMENT', 'POSIX_SYMLINK_BOUNDARY_CASE', 'C7A', 'REVISION_BRIDGE_NO_FOLLOW'],
  'test/contracts/revision-bridge-file-authority-hardening.contract.test.js': ['PLATFORM_CAPABILITY', 'WINDOWS_RUNNER_MAY_DENY_SYMLINK_CREATION', 'C7A', 'FILE_AUTHORITY_NO_FOLLOW'],
  'test/contracts/rtk-tx01-single-scene-transaction.contract.test.js': ['PLATFORM_COMPLEMENT', 'CROSS_PROCESS_CRASH_RECONCILIATION_RUNS_ON_POSIX', 'C7A', 'TX01_CRASH_RECONCILIATION'],
  'test/electron/atomicWrite.test.js': ['PLATFORM_COMPLEMENT', 'PERMISSION_FAILURE_SEMANTICS_RUN_ON_POSIX', 'C8A', 'ATOMIC_WRITE_FAILURE'],
  'test/unit/docx-import-safe-create.test.js': ['PLATFORM_COMPLEMENT', 'DIRECTORY_SYMLINK_AUTHORITY_RUNS_ON_POSIX', 'C7A', 'DOCX_IMPORT_NO_FOLLOW'],
  'test/unit/sector-u-u6-a11y-focus-contract.test.js': ['REEXECUTED_IN_DECLARED_LANE', 'FULL_A11Y_ENVIRONMENT_LANE', 'C1C', 'SECTOR_U_A11Y'],
  'test/unit/sector-u-u6-a11y-shortcuts.test.js': ['REEXECUTED_IN_DECLARED_LANE', 'FULL_A11Y_ENVIRONMENT_LANE', 'C1C', 'SECTOR_U_A11Y'],
  'test/unit/sector-u-u7-visual-baseline.test.js': ['REEXECUTED_IN_DECLARED_LANE', 'FULL_VISUAL_ENVIRONMENT_LANE', 'C1C', 'SECTOR_U_VISUAL'],
  'test/unit/sector-u-u8-perf-baseline.test.js': ['REEXECUTED_IN_DECLARED_LANE', 'FULL_PERFORMANCE_ENVIRONMENT_LANE', 'C1C', 'SECTOR_U_PERFORMANCE'],
  'test/unit/sector-w-run-artifacts.test.js': ['EXCLUDED_NON_REQUIRED', 'OPTIONAL_SECTOR_W_GUARD_NOT_PRESENT_IN_CURRENT_BASELINE', 'C7A', 'SECTOR_W_OPTIONAL_GUARD'],
  'test/unit/typographic-sharpness-runtime-visual-proof.test.js': ['PHYSICAL_LANE_DEFERRED', 'ELECTRON_DOM_AND_SCREENSHOT_EVIDENCE_REQUIRES_PHYSICAL_HOST', 'C8A', 'TYPOGRAPHIC_SHARPNESS_PHYSICAL'],
};

for (const [filePath, [classification, reason, expiresBeforeStage, affectedClaim]] of Object.entries(conditionalPolicies)) {
  SKIP_POLICIES.set(filePath, Object.freeze({
    classification,
    reason,
    owner: classification === 'PHYSICAL_LANE_DEFERRED' ? 'C8A_PHYSICAL_ENVELOPE' : 'C1C_MERGE_GATE',
    expiresBeforeStage,
    affectedClaims: [affectedClaim],
    required: false,
  }));
}

function canonicalize(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalize(value[key])}`).join(',')}}`;
}

export function canonicalBytes(value) {
  return Buffer.from(`${canonicalize(value)}\n`, 'utf8');
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function toPosix(value) {
  return value.split(path.sep).join('/');
}

export function listTestFiles(rootDir) {
  const testRoot = path.join(rootDir, 'test');
  const files = [];
  const visit = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name, 'en-US'))) {
      const absolutePath = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(absolutePath);
      else if (entry.isFile() && /\.test\.(?:js|mjs)$/u.test(entry.name)) files.push(toPosix(path.relative(rootDir, absolutePath)));
    }
  };
  visit(testRoot);
  return files.sort((left, right) => left.localeCompare(right, 'en-US'));
}

function kindAndLane(filePath) {
  if (filePath.startsWith('test/unit/')) return { kind: 'UNIT', lane: 'npm-test-unit' };
  if (filePath.startsWith('test/contracts/')) return { kind: 'CONTRACT', lane: 'c1c-contract-shard' };
  if (filePath.startsWith('test/ops/')) return { kind: 'OPS', lane: 'c1c-ops-shard' };
  if (filePath.startsWith('test/electron/')) return { kind: 'ELECTRON', lane: 'electron-host-lane' };
  if (filePath.startsWith('test/performance/')) return { kind: 'PERFORMANCE', lane: 'r24-c1b-performance' };
  return { kind: 'OTHER', lane: 'c1c-other-test-shard' };
}

function skipSiteCount(source) {
  return (source.match(/\btest\.skip\s*\(/gu) || []).length
    + (source.match(/\bt\.skip\s*\(/gu) || []).length
    + (source.match(/\bskip\s*:/gu) || []).length;
}

function isLateMjs(filePath) {
  return /\/r24-(?:wp205|wp30[0-8])[^/]*\.test\.mjs$/u.test(filePath);
}

export function buildInventory(rootDir) {
  const entries = listTestFiles(rootDir).map((filePath) => {
    const bytes = fs.readFileSync(path.join(rootDir, filePath));
    const source = bytes.toString('utf8');
    const skipSites = skipSiteCount(source);
    const skipPolicy = SKIP_POLICIES.get(filePath) || null;
    const { kind, lane } = kindAndLane(filePath);
    const excluded = skipPolicy?.classification === 'EXCLUDED_NON_REQUIRED';
    return {
      path: filePath,
      extension: path.extname(filePath).slice(1),
      kind,
      lane,
      required: !excluded,
      executionStatus: excluded ? 'EXCLUDED_NON_REQUIRED' : 'DECLARED_EXECUTABLE',
      sha256: sha256(bytes),
      skipSites,
      skipPolicy,
    };
  });

  const byKind = Object.fromEntries([...new Set(entries.map((entry) => entry.kind))]
    .sort()
    .map((kind) => [kind, entries.filter((entry) => entry.kind === kind).length]));
  const lateMjsPaths = entries.filter((entry) => isLateMjs(entry.path)).map((entry) => entry.path);
  const unexplainedSkips = entries.filter((entry) => entry.skipSites > 0 && !entry.skipPolicy).length;
  const requiredSkips = entries.filter((entry) => entry.skipSites > 0 && entry.skipPolicy?.required === true).length;

  return {
    schemaVersion: SCHEMA_VERSION,
    inventoryId: 'YALKEN_R24_CORRECTIVE_C1B_TEST_INVENTORY',
    classificationStage: CURRENT_STAGE,
    discovery: {
      root: 'test',
      extensions: ['test.js', 'test.mjs'],
      ordering: 'NFC_POSIX_EN_US_LEXICOGRAPHIC',
    },
    totals: {
      all: entries.length,
      byKind,
      js: entries.filter((entry) => entry.extension === 'js').length,
      mjs: entries.filter((entry) => entry.extension === 'mjs').length,
      lateMjs: lateMjsPaths.length,
      skipFiles: entries.filter((entry) => entry.skipSites > 0).length,
      skipSites: entries.reduce((sum, entry) => sum + entry.skipSites, 0),
      requiredSkips,
      unexplainedSkips,
    },
    lateMjsPaths,
    entries,
  };
}

function failure(code, detail) {
  return `${code}:${detail}`;
}

export function validateInventory(rootDir, inventory) {
  const failures = [];
  if (inventory?.schemaVersion !== SCHEMA_VERSION) failures.push(failure('E_INVENTORY_SCHEMA', inventory?.schemaVersion));
  const actual = buildInventory(rootDir);
  const entries = Array.isArray(inventory?.entries) ? inventory.entries : [];
  const paths = entries.map((entry) => entry.path);
  if (new Set(paths).size !== paths.length) failures.push(failure('E_INVENTORY_DUPLICATE_PATH', 'entries'));
  if (JSON.stringify(paths) !== JSON.stringify(actual.entries.map((entry) => entry.path))) {
    failures.push(failure('E_INVENTORY_FILE_SET_MISMATCH', `${paths.length}/${actual.entries.length}`));
  }

  const actualByPath = new Map(actual.entries.map((entry) => [entry.path, entry]));
  for (const entry of entries) {
    const observed = actualByPath.get(entry.path);
    if (!observed) continue;
    if (entry.sha256 !== observed.sha256) failures.push(failure('E_INVENTORY_DIGEST_MISMATCH', entry.path));
    if (entry.kind !== observed.kind || entry.lane !== observed.lane) failures.push(failure('E_INVENTORY_CLASSIFICATION_MISMATCH', entry.path));
    if (entry.skipSites !== observed.skipSites) failures.push(failure('E_SKIP_SITE_COUNT_MISMATCH', entry.path));
    if (observed.skipSites > 0 && !entry.skipPolicy) failures.push(failure('E_SKIP_POLICY_MISSING', entry.path));
    if (entry.skipPolicy) {
      for (const field of ['classification', 'reason', 'owner', 'expiresBeforeStage']) {
        if (typeof entry.skipPolicy[field] !== 'string' || entry.skipPolicy[field].length === 0) failures.push(failure('E_SKIP_POLICY_FIELD', `${entry.path}:${field}`));
      }
      if (!Array.isArray(entry.skipPolicy.affectedClaims) || entry.skipPolicy.affectedClaims.length === 0) failures.push(failure('E_SKIP_POLICY_FIELD', `${entry.path}:affectedClaims`));
      const expiryIndex = STAGE_ORDER.indexOf(entry.skipPolicy.expiresBeforeStage);
      if (expiryIndex <= STAGE_ORDER.indexOf(CURRENT_STAGE)) failures.push(failure('E_SKIP_POLICY_EXPIRED', entry.path));
      const excluded = entry.skipPolicy.classification === 'EXCLUDED_NON_REQUIRED';
      if (excluded === entry.required || (excluded && entry.executionStatus !== 'EXCLUDED_NON_REQUIRED')) failures.push(failure('E_CLASSIFICATION_CONTRADICTORY', entry.path));
      if (entry.skipPolicy.required === true) failures.push(failure('E_REQUIRED_SKIP', entry.path));
    }
  }

  if (inventory?.totals?.unexplainedSkips !== 0) failures.push(failure('E_UNEXPLAINED_SKIP', inventory?.totals?.unexplainedSkips));
  if (inventory?.totals?.requiredSkips !== 0) failures.push(failure('E_REQUIRED_SKIP', inventory?.totals?.requiredSkips));
  if (JSON.stringify(inventory?.lateMjsPaths) !== JSON.stringify(actual.lateMjsPaths) || actual.lateMjsPaths.length !== 8) {
    failures.push(failure('E_LATE_MJS_INVENTORY', actual.lateMjsPaths.length));
  }
  return { ok: failures.length === 0, failures, inventory: actual };
}

function parseArgs(argv) {
  const result = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) continue;
    result[token.slice(2)] = argv[index + 1] && !argv[index + 1].startsWith('--') ? argv[++index] : true;
  }
  return result;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const options = parseArgs(process.argv.slice(2));
  const rootDir = process.cwd();
  if (typeof options.write === 'string') {
    fs.writeFileSync(path.resolve(rootDir, options.write), canonicalBytes(buildInventory(rootDir)));
  } else if (typeof options.check === 'string') {
    const filePath = path.resolve(rootDir, options.check);
    const bytes = fs.readFileSync(filePath);
    const inventory = JSON.parse(bytes.toString('utf8'));
    const canonical = bytes.equals(canonicalBytes(inventory));
    const result = validateInventory(rootDir, inventory);
    if (!canonical) result.failures.unshift('E_INVENTORY_NON_CANONICAL:bytes');
    result.ok = result.failures.length === 0;
    process.stdout.write(`${JSON.stringify({
      status: result.ok ? 'VALID' : 'INVALID',
      all: inventory?.totals?.all ?? null,
      lateMjs: inventory?.totals?.lateMjs ?? null,
      requiredSkips: inventory?.totals?.requiredSkips ?? null,
      unexplainedSkips: inventory?.totals?.unexplainedSkips ?? null,
      failures: result.failures,
    }, null, 2)}\n`);
    if (!result.ok) process.exitCode = 1;
  } else {
    process.stderr.write('E_USAGE: use --write <path> or --check <path>\n');
    process.exitCode = 1;
  }
}
