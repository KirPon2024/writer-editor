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
const { spawnSync } = require('node:child_process');

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
  Object.freeze({ contract: 'b2c09-command-surface-kernel.contract.test.js', failing: { any: ['canonical packet is green'] } }),
  Object.freeze({ contract: 'b2c10-command-bypass-negative-matrix.contract.test.js', failing: { any: ['current canonical core remains green and advisory tails are explicit', 'committed status packet matches executable state'] } }),
  Object.freeze({ contract: 'b3c01-command-kernel-scope-lock.contract.test.js', failing: { any: ['committed status equals executable state', 'evidence packets align with executable state'] } }),
  Object.freeze({ contract: 'b3c06-no-network-writing-path.contract.test.js', failing: { any: ['state artifact equals executable state', 'CLI status remains worktree independent outside repo cwd'] } }),
  Object.freeze({ contract: 'b3c16-supply-chain-release-scope.contract.test.js', failing: { any: ['state artifact matches stable executable fields'] } }),
]);

// Platform-divergent defects: committed status artifacts embed platform-shaped
// state. They are neither globally green nor globally red; the executable
// classification is bound per platform so CI cannot hide a local-only repair.
const PLATFORM_DIVERGENT = Object.freeze([
  Object.freeze({
    contract: 'b3c10-capability-tier-report.contract.test.js',
    expected: Object.freeze({
      darwin: Object.freeze({
        status: 'red',
        failing: ['b3c10 capability tier report: CLI status remains worktree independent outside repo cwd'],
      }),
      linux: Object.freeze({ status: 'red', failing: ['b3c10 capability tier report: state artifact equals executable state'] }),
    }),
  }),
  Object.freeze({
    contract: 'b3c11-xplat-normalization-baseline.contract.test.js',
    expected: Object.freeze({
      darwin: Object.freeze({ status: 'green' }),
      linux: Object.freeze({ status: 'red', failing: ['state artifact matches stable executable fields'] }),
    }),
  }),
  Object.freeze({
    contract: 'b3c12-i18n-text-anchor-safety.contract.test.js',
    expected: Object.freeze({
      darwin: Object.freeze({ status: 'green' }),
      linux: Object.freeze({ status: 'red', failing: ['state artifact matches stable executable fields'] }),
    }),
  }),
  Object.freeze({
    contract: 'b3c13-trust-surface-accessibility.contract.test.js',
    expected: Object.freeze({
      darwin: Object.freeze({ status: 'green' }),
      linux: Object.freeze({ status: 'red', failing: ['state artifact matches stable executable fields'] }),
    }),
  }),
  Object.freeze({
    contract: 'b3c14-release-dossier-minimal.contract.test.js',
    expected: Object.freeze({
      darwin: Object.freeze({ status: 'green' }),
      linux: Object.freeze({ status: 'red', failing: ['state artifact matches stable executable fields'] }),
    }),
  }),
  Object.freeze({
    contract: 'b3c15-attestation-chain.contract.test.js',
    expected: Object.freeze({
      darwin: Object.freeze({ status: 'green' }),
      linux: Object.freeze({ status: 'red', failing: ['state artifact matches stable executable fields'] }),
    }),
  }),
]);

// Evidence-unstable families: every accepted outcome is finite and
// platform-bound. This records the current b3c09 instability without creating
// an "any outcome passes" registry.
const FLAKY_REGISTER = Object.freeze([
  Object.freeze({
    contract: 'b3c09-performance-baseline-binding.contract.test.js',
    maxAttempts: 1,
    accepted: Object.freeze({
      darwin: Object.freeze([
        Object.freeze({
          status: 'red',
          failing: Object.freeze(['b3c09 performance baseline: CLI status remains worktree independent outside repo cwd']),
        }),
      ]),
      linux: Object.freeze([
        Object.freeze({ status: 'green', failing: Object.freeze([]) }),
        Object.freeze({
          status: 'red',
          failing: Object.freeze(['b3c09 performance baseline: records exact unsupported rows instead of false PERF_BASELINE_OK']),
        }),
        Object.freeze({
          status: 'red',
          failing: Object.freeze(['b3c09 performance baseline: state artifact equals executable state']),
        }),
        Object.freeze({
          status: 'red',
          failing: Object.freeze([
            'b3c09 performance baseline: CLI status remains worktree independent outside repo cwd',
            'b3c09 performance baseline: state artifact equals executable state',
          ]),
        }),
      ]),
    }),
  }),
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

function enumerateStatusBackedClass() {
  // Contracts cited by status producer scripts (state scripts with a
  // --write mode that commit live-claim artifacts).
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
  return { backed: [...backed].sort(), producerScripts };
}

function failingTestNames(tapOutput) {
  const names = new Set();
  for (const line of tapOutput.split('\n')) {
    const tapMatch = line.match(/^not ok \d+ - (.+)$/u);
    if (tapMatch) {
      names.add(tapMatch[1]);
      continue;
    }
    const specMatch = line.match(/^\u2716 (?!failing tests:)(.+?)(?: \(\d+(?:\.\d+)?ms\))?$/u);
    if (specMatch) names.add(specMatch[1]);
  }
  return [...names];
}

function sortedUnique(values) {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b));
}

function matchesOutcome(outcome, expected) {
  const expectedExit = expected.status === 'green' ? 0 : 1;
  const actualExit = outcome.exit === 0 ? 0 : 1;
  if (actualExit !== expectedExit) return false;
  return JSON.stringify(sortedUnique(outcome.failing)) === JSON.stringify(sortedUnique(expected.failing || []));
}

test('stale-green guard: registration is complete and no entrant slips through', () => {
  const catalog = readJson(CATALOG_PATH);
  const maintained = new Set([...(catalog.contractBasenames || []), ...(catalog.extraMaintainedContractBasenames || [])]);
  const ledgered = new Set(KNOWN_RED_LEDGER.map((entry) => entry.contract));
  const greenUnmaintained = new Set(GREEN_UNMAINTAINED_REGISTRY);
  const divergent = new Set(PLATFORM_DIVERGENT.map((entry) => entry.contract));
  const flaky = new Set(FLAKY_REGISTER.map((entry) => entry.contract));
  const { backed, producerScripts } = enumerateStatusBackedClass();
  assert.equal(producerScripts >= 30, true, `producer denominator must be meaningful, got ${producerScripts}`);
  assert.equal(backed.length >= 30, true, `class denominator must be meaningful, got ${backed.length}`);
  const violators = backed.filter((name) => !maintained.has(name) && !ledgered.has(name) && !greenUnmaintained.has(name) && !divergent.has(name) && !flaky.has(name));
  assert.deepEqual(violators, [], 'status-backed contracts missing from all three registers');
  for (const name of EXTRA_MAINTAINED) {
    assert.equal(ledgered.has(name), false, `${name} is repaired and maintained, never ledgered`);
  }
});

test('stale-green guard: b3c09 flaky register remains finite and exact-shaped', () => {
  const entry = FLAKY_REGISTER.find((candidate) => candidate.contract === 'b3c09-performance-baseline-binding.contract.test.js');
  assert.ok(entry, 'b3c09 must be the only bounded flaky status-backed contract');
  assert.equal(FLAKY_REGISTER.length, 1);
  assert.equal(entry.maxAttempts, 1);

  for (const [platformName, outcomes] of Object.entries(entry.accepted)) {
    assert.ok(['darwin', 'linux'].includes(platformName), `unexpected platform key ${platformName}`);
    assert.ok(Array.isArray(outcomes) && outcomes.length > 0 && outcomes.length <= 4, `${platformName} outcomes must be finite`);
    const seen = new Set();
    for (const outcome of outcomes) {
      assert.ok(['green', 'red'].includes(outcome.status), `unexpected outcome status ${outcome.status}`);
      assert.ok(Array.isArray(outcome.failing), 'failing tests must be an exact array');
      for (const failingName of outcome.failing) {
        assert.equal(typeof failingName, 'string');
        assert.equal(failingName.includes('*'), false, 'wildcard failing names are forbidden');
        assert.equal(failingName.includes('any'), false, 'any-outcome failing names are forbidden');
      }
      const key = JSON.stringify({ status: outcome.status, failing: sortedUnique(outcome.failing) });
      assert.equal(seen.has(key), false, `${platformName} duplicate flaky outcome ${key}`);
      seen.add(key);
    }
  }

  const linuxShapes = entry.accepted.linux.map((outcome) => JSON.stringify({
    status: outcome.status,
    failing: sortedUnique(outcome.failing),
  }));
  assert.ok(linuxShapes.includes(JSON.stringify({
    status: 'red',
    failing: sortedUnique([
      'b3c09 performance baseline: CLI status remains worktree independent outside repo cwd',
      'b3c09 performance baseline: state artifact equals executable state',
    ]),
  })));
});

// R2.4 EXH1: the classification is verified by execution, fail-closed.
// Every ledgered red contract must currently fail with exactly the recorded
// test names; every green-registered contract must currently pass. A
// green-to-red flip, a red-to-green flip and a changed failure shape all
// fail this gate deterministically.
test('stale-green guard: executable classification of every status-backed contract', { timeout: 720000 }, () => {
  const childEnv = { ...process.env };
  delete childEnv.NODE_TEST_CONTEXT;
  const platform = process.platform === 'darwin' ? 'darwin' : 'linux';
  const runContract = (name) => {
    const filePath = path.join(ROOT, 'test', 'contracts', name);
    const run = spawnSync(process.execPath, ['--test', filePath], { encoding: 'utf8', timeout: 180000, cwd: ROOT, env: childEnv });
    return { exit: run.status, failing: failingTestNames(`${run.stdout || ''}\n${run.stderr || ''}`) };
  };
  const greenToRed = [];
  const redToGreen = [];
  const shapeDrift = [];
  const divergentDrift = [];

  for (const entry of KNOWN_RED_LEDGER) {
    const outcome = runContract(entry.contract);
    if (outcome.exit === 0) {
      redToGreen.push(entry.contract);
      continue;
    }
    if (outcome.failing.length === 0) {
      shapeDrift.push({ contract: entry.contract, platform, detail: 'nonzero exit with zero failing tests' });
      continue;
    }
    const recorded = entry.failing.any || entry.failing[platform] || [];
    const actual = outcome.failing;
    const missingRecorded = recorded.filter((name) => !actual.some((line) => line.includes(name)));
    if (missingRecorded.length > 0) {
      shapeDrift.push({ contract: entry.contract, platform, missingRecorded });
    }
  }
  for (const entry of PLATFORM_DIVERGENT) {
    const outcome = runContract(entry.contract);
    const expected = entry.expected?.[platform] || entry.expected?.linux || {};
    if (expected.status === 'green') {
      if (outcome.exit !== 0) divergentDrift.push({ contract: entry.contract, platform, detail: `expected green on ${platform}`, failing: outcome.failing.slice(0, 2) });
    } else if (expected.status === 'red') {
      if (outcome.exit === 0) {
        divergentDrift.push({ contract: entry.contract, platform, detail: `expected red on ${platform} (platform-shaped status artifact) but passed` });
      } else {
        const missing = (expected.failing || []).filter((name) => !outcome.failing.some((line) => line.includes(name)));
        if (missing.length > 0) divergentDrift.push({ contract: entry.contract, platform, detail: `${platform} failing shape drift`, missing });
      }
    } else {
      divergentDrift.push({ contract: entry.contract, platform, detail: 'missing platform expectation' });
    }
  }
  const flakyOutcomes = [];
  for (const entry of FLAKY_REGISTER) {
    const attempts = Number.isInteger(entry.maxAttempts) && entry.maxAttempts >= 1 ? entry.maxAttempts : 1;
    const accepted = entry.accepted?.[platform] || entry.accepted?.linux || [];
    let acceptedOutcome = null;
    const observed = [];
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      const outcome = runContract(entry.contract);
      const record = { attempt, exit: outcome.exit, failing: sortedUnique(outcome.failing) };
      observed.push(record);
      if (accepted.some((candidate) => matchesOutcome(outcome, candidate))) {
        acceptedOutcome = record;
        break;
      }
    }
    flakyOutcomes.push({
      contract: entry.contract,
      platform,
      maxAttempts: attempts,
      accepted: acceptedOutcome !== null,
      observed,
    });
  }
  for (const name of GREEN_UNMAINTAINED_REGISTRY) {
    const outcome = runContract(name);
    if (outcome.exit !== 0) greenToRed.push({ contract: name, platform, failing: outcome.failing.slice(0, 3) });
  }
  const summary = {
    platform,
    executedRed: KNOWN_RED_LEDGER.length,
    executedDivergent: PLATFORM_DIVERGENT.length,
    executedGreen: GREEN_UNMAINTAINED_REGISTRY.length,
    executedFlaky: FLAKY_REGISTER.length,
    flakyOutcomes,
    greenToRed,
    redToGreen,
    shapeDrift,
    divergentDrift,
  };
  console.log(`R24_EXH1_CLASSIFICATION=${JSON.stringify(summary)}`);
  assert.deepEqual(redToGreen, [], `red-to-green flip: ${JSON.stringify(redToGreen)}`);
  assert.deepEqual(greenToRed, [], `green-to-red flip: ${JSON.stringify(greenToRed)}`);
  assert.deepEqual(shapeDrift, [], `ledgered family must be red with named failing tests: ${JSON.stringify(shapeDrift)}`);
  assert.deepEqual(divergentDrift, [], `platform-divergent register drift: ${JSON.stringify(divergentDrift)}`);
  assert.deepEqual(flakyOutcomes.filter((outcome) => outcome.accepted !== true), [], `bounded flaky register drift: ${JSON.stringify(flakyOutcomes)}`);
});
