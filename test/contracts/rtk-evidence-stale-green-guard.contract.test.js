'use strict';

// R2.4 EXH0 stale-green guard. Counterexample against the exact-head
// evidence-integrity breach class: a committed PASS artifact whose live
// contract is never run by the required lane. This contract is rtk-prefixed
// and therefore rides the maintained graph itself.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const ROOT = path.resolve(__dirname, '..', '..');
const CATALOG_PATH = path.join(ROOT, 'docs', 'OPS', 'RTK', 'RTK_TEST_GRAPH_CATALOG_V1.json');
const STATUS_DIR = path.join(ROOT, 'docs', 'OPS', 'STATUS');

const EXTRA_MAINTAINED = [
  'b3c07-security-runtime-boundary.contract.test.js',
  'donor-port-command-surface-kernel.contract.test.js',
];

// The honest ledger: status-backed contract families whose committed
// artifacts diverge from their live evaluations at the repair base
// (4e2db88f), with the exact failing tests. Membership here is not a green
// claim; it is named pre-existing red debt.
const KNOWN_RED_LEDGER = Object.freeze([
  Object.freeze({ contract: 'b2c09-command-surface-kernel.contract.test.js', failing: ['canonical packet is green'] }),
  Object.freeze({ contract: 'b2c10-command-bypass-negative-matrix.contract.test.js', failing: ['current canonical core remains green and advisory tails are explicit', 'committed status packet matches executable state'] }),
  Object.freeze({ contract: 'b3c01-command-kernel-scope-lock.contract.test.js', failing: ['committed status equals executable state', 'evidence packets align with executable state'] }),
  Object.freeze({ contract: 'b3c06-no-network-writing-path.contract.test.js', failing: ['state artifact equals executable state', 'CLI status remains worktree independent outside repo cwd'] }),
  Object.freeze({ contract: 'b3c09-performance-baseline-binding.contract.test.js', failing: ['CLI status remains worktree independent outside repo cwd'] }),
  Object.freeze({ contract: 'b3c10-capability-tier-report.contract.test.js', failing: ['CLI status remains worktree independent outside repo cwd'] }),
  Object.freeze({ contract: 'b3c16-supply-chain-release-scope.contract.test.js', failing: ['state artifact matches stable executable fields'] }),
]);

// Status-backed contracts whose committed artifacts currently agree with
// their live evaluations but which no required lane executes. Committed by
// name so a new entrant or a silent reclassification trips the gate.
const GREEN_UNMAINTAINED_REGISTRY = Object.freeze([
  'b2c11-command-effect-model.contract.test.js',
  'b2c12-persist-effects-atomic-write.contract.test.js',
  'b2c13-save-reopen-text-no-loss.contract.test.js',
  'b2c14-recovery-readable-proof.contract.test.js',
  'b2c15-restore-drill-and-quarantine.contract.test.js',
  'b2c16-migration-policy-minimal.contract.test.js',
  'b2c17-migration-killpoint-proof.contract.test.js',
  'b2c18-basic-kernel-perf-guard.contract.test.js',
  'b2c19-independent-kernel-audit.contract.test.js',
  'b2c20-block-2-exit-dossier.contract.test.js',
  'b3c02-compile-ir-baseline.contract.test.js',
  'b3c03-docx-artifact-validation.contract.test.js',
  'b3c04-deterministic-export-mode.contract.test.js',
  'b3c05-permission-scope-enforced.contract.test.js',
  'b3c08-support-bundle-privacy.contract.test.js',
  'b3c11-xplat-normalization-baseline.contract.test.js',
  'b3c12-i18n-text-anchor-safety.contract.test.js',
  'b3c13-trust-surface-accessibility.contract.test.js',
  'b3c14-release-dossier-minimal.contract.test.js',
  'b3c15-attestation-chain.contract.test.js',
  'b3c17-future-lanes-nonblocking.contract.test.js',
  'b3c18-production-hardening-queue.contract.test.js',
  'collab-no-network-wiring.contract.test.js',
  'path-boundary-guard.contract.test.js',
  'perf-fixture.contract.test.js',
  'perf-lite-entrypoint-and-fixture.contract.test.js',
  'perf-runner-deterministic.contract.test.js',
  'perf-thresholds.contract.test.js',
]);

function readJson(targetPath) {
  return JSON.parse(fs.readFileSync(targetPath, 'utf8'));
}

test('stale-green guard: the two repaired live-claim contracts ride the maintained graph', () => {
  const catalog = readJson(CATALOG_PATH);
  const extra = catalog.extraMaintainedContractBasenames || [];
  for (const name of EXTRA_MAINTAINED) {
    assert.equal(extra.includes(name), true, `${name} must be declared extra-maintained`);
    assert.equal(fs.existsSync(path.join(ROOT, 'test', 'contracts', name)), true, `${name} must exist on disk`);
  }
  assert.equal(extra.length, EXTRA_MAINTAINED.length, 'the extra-maintained set is exactly the declared live-claim class');
  const maintained = new Set([...(catalog.contractBasenames || []), ...extra]);
  for (const name of EXTRA_MAINTAINED) {
    assert.equal(maintained.has(name), true, `${name} must be in the runner maintained union`);
  }
});

test('stale-green guard: b3c07 committed status equals the live executable evaluation', async () => {
  const moduleUrl = pathToFileURL(path.join(ROOT, 'scripts', 'ops', 'b3c07-security-runtime-boundary-state.mjs')).href;
  const { evaluateB3C07SecurityRuntimeBoundaryState } = await import(moduleUrl);
  const live = await evaluateB3C07SecurityRuntimeBoundaryState({ repoRoot: ROOT });
  const committed = readJson(path.join(STATUS_DIR, 'B3C07_SECURITY_RUNTIME_BOUNDARY_STATUS_V1.json'));
  assert.deepEqual(committed, live, 'committed PASS artifact diverged from the live evaluation');
  assert.equal(live.status, 'PASS');
  assert.deepEqual(live.failRows, []);
});

test('stale-green guard: donor expectation and kernel registry stay reconciled', () => {
  const { ALLOWED_COMMAND_IDS } = require(path.join(ROOT, 'src', 'command', 'commandSurfaceKernel.js'));
  const donorSource = fs.readFileSync(path.join(ROOT, 'test', 'contracts', 'donor-port-command-surface-kernel.contract.test.js'), 'utf8');
  for (const id of ALLOWED_COMMAND_IDS) {
    assert.ok(donorSource.includes(`'${id}'`), `kernel id missing from the donor contract expectation: ${id}`);
  }
  assert.equal(ALLOWED_COMMAND_IDS.includes('cmd.rtk.review.applyMultiSceneStructuralReturn'), true);
  assert.equal(ALLOWED_COMMAND_IDS.includes('cmd.project.blackBox.exportManualCoreCapsuleKitV1'), true);
});

test('stale-green guard: the status-backed class is fully registered and cannot grow silently', () => {
  const catalog = readJson(CATALOG_PATH);
  const maintained = new Set([...(catalog.contractBasenames || []), ...(catalog.extraMaintainedContractBasenames || [])]);
  const ledgered = new Set(KNOWN_RED_LEDGER.map((entry) => entry.contract));
  const greenUnmaintained = new Set(GREEN_UNMAINTAINED_REGISTRY);
  // Enumerate the class authoritatively: contracts cited by status
  // producer scripts (state scripts with a --write mode that commit live
  // claim artifacts).
  const opsDir = path.join(ROOT, 'scripts', 'ops');
  const backed = new Set();
  let producerScripts = 0;
  for (const name of fs.readdirSync(opsDir)) {
    if (!name.endsWith('-state.mjs')) continue;
    const source = fs.readFileSync(path.join(opsDir, name), 'utf8');
    if (!source.includes("'--write'") && !source.includes('"--write"')) continue;
    producerScripts += 1;
    for (const match of source.matchAll(/test\/contracts\/([a-zA-Z0-9.-]+\.contract\.test\.js)/gu)) {
      backed.add(match[1]);
    }
  }
  assert.equal(producerScripts >= 30, true, `producer denominator must be meaningful, got ${producerScripts}`);
  assert.equal(backed.size >= 30, true, `class denominator must be meaningful, got ${backed.size}`);
  const violators = [];
  for (const name of backed) {
    if (!maintained.has(name) && !ledgered.has(name) && !greenUnmaintained.has(name)) {
      violators.push(name);
    }
  }
  assert.deepEqual([...violators].sort(), [], 'status-backed contracts missing from all three registers');
  for (const name of EXTRA_MAINTAINED) {
    assert.equal(ledgered.has(name), false, `${name} is repaired and maintained, never ledgered`);
  }
  for (const name of ledgered) {
    assert.equal(fs.existsSync(path.join(ROOT, 'test', 'contracts', name)), true, `ledgered contract missing on disk: ${name}`);
  }
  console.log(`R24_EXH0_GUARD=${JSON.stringify({ classSize: backed.size, maintained: EXTRA_MAINTAINED.length, ledgeredRed: ledgered.size, greenUnmaintained: greenUnmaintained.size, violators: violators.length })}`);
});
