#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { canonicalBytes, canonicalize } from './canonical-json.mjs';
import { assert, assertClosedObject, assertExactJson, assertHex, fail } from './audit-r1-corrections.mjs';

const ALLOWED_STAGES = new Set(['C9', 'AUDIT_R1', 'AUDIT_R2']);
export const REQUIRED_LANE_EXECUTIONS = Object.freeze({
  SECTOR_U_FULL: Object.freeze({
    env: Object.freeze({ SECTOR_U_FULL_A11Y: '1', SECTOR_U_FULL_PERF: '1', SECTOR_U_FULL_VISUAL: '1' }),
    testFiles: Object.freeze([
      'test/unit/sector-u-u6-a11y-focus-contract.test.js',
      'test/unit/sector-u-u6-a11y-shortcuts.test.js',
      'test/unit/sector-u-u7-visual-baseline.test.js',
      'test/unit/sector-u-u8-perf-baseline.test.js',
    ]),
  }),
});
const RECONCILIATION = new Map();

for (const filePath of [
  'test/contracts/path-boundary-guard.contract.test.js',
  'test/contracts/revision-bridge-exact-text-apply-crash-reconciliation.contract.test.js',
  'test/contracts/revision-bridge-file-authority-hardening.contract.test.js',
  'test/contracts/rtk-tx01-single-scene-transaction.contract.test.js',
  'test/electron/atomicWrite.test.js',
  'test/unit/docx-import-safe-create.test.js',
]) RECONCILIATION.set(filePath, { classification: 'CURRENT_STAGE_REEXECUTED_PLATFORM_COMPLEMENT', requiredLane: 'PLATFORM_COMPLEMENTS' });

for (const filePath of [
  'test/unit/sector-u-u6-a11y-focus-contract.test.js',
  'test/unit/sector-u-u6-a11y-shortcuts.test.js',
  'test/unit/sector-u-u7-visual-baseline.test.js',
  'test/unit/sector-u-u8-perf-baseline.test.js',
]) RECONCILIATION.set(filePath, { classification: 'CURRENT_STAGE_REEXECUTED_FULL_ENVIRONMENT', requiredLane: 'SECTOR_U_FULL' });

RECONCILIATION.set('test/unit/typographic-sharpness-runtime-visual-proof.test.js', {
  classification: 'CURRENT_STAGE_REEXECUTED_PHYSICAL_MACOS',
  requiredLane: 'PHYSICAL_MACOS',
});

for (const filePath of [
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
]) RECONCILIATION.set(filePath, { classification: 'CURRENT_DIGEST_REMOVED_CONTRACT_NON_REQUIRED', requiredLane: null });

RECONCILIATION.set('test/unit/sector-w-run-artifacts.test.js', {
  classification: 'CURRENT_DIGEST_OPTIONAL_GUARD_NON_REQUIRED',
  requiredLane: null,
});

function sha256(bytes) { return createHash('sha256').update(bytes).digest('hex'); }
function toPosix(value) { return value.split(path.sep).join('/'); }
function skipSiteCount(source) {
  return (source.match(/\btest\.skip\s*\(/gu) || []).length
    + (source.match(/\bt\.skip\s*\(/gu) || []).length
    + (source.match(/\bskip\s*:/gu) || []).length;
}

export function listTestFiles(rootDir) {
  const files = [];
  const visit = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name, 'en-US'))) {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(absolute);
      else if (entry.isFile() && /\.test\.(?:js|mjs)$/u.test(entry.name)) files.push(toPosix(path.relative(rootDir, absolute)));
    }
  };
  visit(path.join(rootDir, 'test'));
  return files.sort((a, b) => a.localeCompare(b, 'en-US'));
}

export function buildAuditInventory(rootDir, currentStage) {
  assert(ALLOWED_STAGES.has(currentStage), 'E_INVENTORY_STAGE', currentStage);
  const files = listTestFiles(rootDir);
  const skipEntries = [];
  for (const filePath of files) {
    const bytes = fs.readFileSync(path.join(rootDir, filePath));
    const skipSites = skipSiteCount(bytes.toString('utf8'));
    if (skipSites === 0) continue;
    const reconciliation = RECONCILIATION.get(filePath) ?? null;
    skipEntries.push({
      path: filePath,
      sha256: sha256(bytes),
      skipSites,
      reconciliation: reconciliation ? { ...reconciliation, authoritySource: 'AUDIT_R1_CURRENT_STAGE_RECLASSIFICATION', currentStage } : null,
    });
  }
  const unexplained = skipEntries.filter((entry) => !entry.reconciliation);
  return {
    schemaVersion: 'AUDIT_R1_TEST_INVENTORY_V1',
    inventoryId: 'YALKEN_R24_AUDIT_R1_CURRENT_STAGE_TEST_INVENTORY',
    currentStage,
    staleC1bPolicyAccepted: false,
    requiredLaneIds: [...new Set(skipEntries.map((entry) => entry.reconciliation?.requiredLane).filter(Boolean))].sort(),
    totals: {
      testFiles: files.length,
      skipFiles: skipEntries.length,
      skipSites: skipEntries.reduce((sum, entry) => sum + entry.skipSites, 0),
      unexplainedSkips: unexplained.length,
      expiredPolicies: 0,
      unresolvedRequiredSkips: unexplained.length,
    },
    skipEntries,
  };
}

export function validateAuditInventory(rootDir, inventory, acceptanceBundle) {
  assertClosedObject(inventory, ['schemaVersion', 'inventoryId', 'currentStage', 'staleC1bPolicyAccepted', 'requiredLaneIds', 'totals', 'skipEntries'], ['schemaVersion', 'inventoryId', 'currentStage', 'staleC1bPolicyAccepted', 'requiredLaneIds', 'totals', 'skipEntries'], 'inventory');
  assert(inventory.schemaVersion === 'AUDIT_R1_TEST_INVENTORY_V1', 'E_INVENTORY_SCHEMA', inventory.schemaVersion);
  assert(ALLOWED_STAGES.has(inventory.currentStage) && inventory.currentStage !== 'C1B', 'E_INVENTORY_STAGE', inventory.currentStage);
  assert(inventory.staleC1bPolicyAccepted === false, 'E_STALE_SKIP_AUTHORITY', 'C1B');
  const actual = buildAuditInventory(rootDir, inventory.currentStage);
  assertExactJson(inventory, actual, 'E_INVENTORY_CURRENT_STATE_MISMATCH', 'inventory');
  assert(inventory.totals.unexplainedSkips === 0 && inventory.totals.expiredPolicies === 0 && inventory.totals.unresolvedRequiredSkips === 0, 'E_SKIP_RECONCILIATION', canonicalize(inventory.totals));
  for (const entry of inventory.skipEntries) {
    assertClosedObject(entry, ['path', 'sha256', 'skipSites', 'reconciliation'], ['path', 'sha256', 'skipSites', 'reconciliation'], `skipEntries.${entry?.path}`);
    assertHex(entry.sha256, 64, `${entry.path}.sha256`);
    assert(entry.reconciliation !== null && entry.reconciliation.currentStage === inventory.currentStage, 'E_SKIP_POLICY_MISSING', entry.path);
  }
  if (acceptanceBundle) {
    const byId = new Map(acceptanceBundle.results.map((entry) => [entry.id, entry]));
    for (const laneId of inventory.requiredLaneIds) {
      const result = byId.get(laneId);
      assert(result?.status === 'PASS' && result?.exitCode === 0, 'E_SKIP_REQUIRED_LANE_NOT_PASS', laneId);
    }
  }
  return true;
}

export function runRequiredLane(rootDir, laneId, runner = execFileSync) {
  const lane = REQUIRED_LANE_EXECUTIONS[laneId];
  assert(lane, 'E_REQUIRED_LANE_UNKNOWN', laneId);
  const output = runner(process.execPath, ['--test', ...lane.testFiles], {
    cwd: rootDir,
    encoding: 'utf8',
    env: { ...process.env, ...lane.env },
    maxBuffer: 8 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  process.stdout.write(output);
  process.stdout.write(`${canonicalize({ laneId, reexecutedFiles: lane.testFiles.length, status: 'PASS' })}\n`);
  return true;
}

function parseArgs(argv) {
  const result = {};
  for (let index = 0; index < argv.length; index += 1) {
    if (!argv[index].startsWith('--')) continue;
    result[argv[index].slice(2)] = argv[index + 1] && !argv[index + 1].startsWith('--') ? argv[++index] : true;
  }
  return result;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    const options = parseArgs(process.argv.slice(2));
    const rootDir = process.cwd();
    if (typeof options['run-lane'] === 'string') {
      runRequiredLane(rootDir, options['run-lane']);
    } else {
      assert(typeof options.stage === 'string', 'E_USAGE', '--stage C9|AUDIT_R1|AUDIT_R2');
      if (typeof options.write === 'string') {
      fs.writeFileSync(path.resolve(rootDir, options.write), canonicalBytes(buildAuditInventory(rootDir, options.stage)), { flag: 'wx' });
      } else if (typeof options.check === 'string') {
        const bytes = fs.readFileSync(path.resolve(rootDir, options.check));
        const inventory = JSON.parse(bytes.toString('utf8'));
        assert(bytes.equals(canonicalBytes(inventory)), 'E_INVENTORY_NON_CANONICAL', options.check);
        const bundle = typeof options.acceptance === 'string' ? JSON.parse(fs.readFileSync(path.resolve(rootDir, options.acceptance), 'utf8')) : null;
        validateAuditInventory(rootDir, inventory, bundle);
        process.stdout.write(`${canonicalize({ currentStage: inventory.currentStage, requiredLaneIds: inventory.requiredLaneIds, status: 'PASS', totals: inventory.totals })}\n`);
      } else fail('E_USAGE', '--write or --check');
    }
  } catch (error) {
    process.stderr.write(`${canonicalize({ code: error.code ?? 'E_UNTYPED', message: error.message })}\n`);
    process.exitCode = 1;
  }
}
