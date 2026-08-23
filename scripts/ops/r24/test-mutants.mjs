#!/usr/bin/env node
// R2.4 E0 — implementation mutation suite over the r24 runtime modules.
// Every mutant is a single semantic sabotage applied to a private copy of
// the module tree; the full E0 suite then runs against that copy. A mutant
// that no test kills is a survivor and fails this gate. Score must be 1.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { sha256hex } from './canonical-json.mjs';

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));
const TESTS_DIR = path.join(MODULE_DIR, 'tests');

export const MUTANTS = Object.freeze([
  {
    id: 'mc-digest-binding-removed',
    file: 'mission-contract.mjs',
    find: 'if (receipt.approvedDigest !== digest) {',
    replace: 'if (false) {',
  },
  {
    id: 'mc-schema-validation-skipped',
    file: 'mission-contract.mjs',
    find: "  assertValidJson(contract, schema, 'E_MISSION_CONTRACT_SCHEMA');",
    replace: '  void schema;',
  },
  {
    id: 'ps-cas-conflict-ignored',
    file: 'plan-state.mjs',
    find: 'if (state.revision !== expectedRevision) {',
    replace: 'if (false) {',
  },
  {
    id: 'ps-transition-law-bypassed',
    file: 'plan-state.mjs',
    find: "if (!allowed.includes(to)) throw new R24Error('E_ILLEGAL_TRANSITION', `${from} -> ${to}`);",
    replace: "if (false) throw new R24Error('E_ILLEGAL_TRANSITION', `${from} -> ${to}`);",
  },
  {
    id: 'ps-terminal-guard-removed',
    file: 'plan-state.mjs',
    find: "if (allowed.length === 0) throw new R24Error('E_TERMINAL_STATE_HAS_NO_OUTGOING', from);",
    replace: "if (false) throw new R24Error('E_TERMINAL_STATE_HAS_NO_OUTGOING', from);",
  },
  {
    id: 'ps-contour-direct-write-allowed',
    file: 'plan-state.mjs',
    find: 'if (afterTransitionControlDigest !== beforeTransitionControlDigest && _contourMutationToken !== CONTOUR_MUTATION_TOKEN) {',
    replace: 'if (false) {',
  },
  {
    id: 'ps-replay-final-state-ignored',
    file: 'plan-state.mjs',
    find: 'if (reconstructed[record.contourId] !== record.to) {',
    replace: 'if (false) {',
  },
  {
    id: 'ps-transition-lease-ignored',
    file: 'plan-state.mjs',
    find: "if (!lease) throw new R24Error('E_TRANSITION_LEASE_REQUIRED', contourId);",
    replace: "if (false) throw new R24Error('E_TRANSITION_LEASE_REQUIRED', contourId);",
  },
  {
    id: 'ps-duplicate-not-suppressed',
    file: 'plan-state.mjs',
    find: '    if (prior) {',
    replace: '    if (false) {',
  },
  {
    id: 'lease-stale-fence-accepted',
    file: 'lease.mjs',
    find: 'if (!Number.isInteger(fencingToken) || fencingToken !== lease.fencingToken) {',
    replace: 'if (false) {',
  },
  {
    id: 'lease-blind-takeover-allowed',
    file: 'lease.mjs',
    find: "if (!reconcile || reconcile.leaseState !== 'EXPIRED' || !reconcile.lease || reconcile.lease.contourId !== contourId) {",
    replace: 'if (false) {',
  },
  {
    id: 'lease-fencing-not-monotonic',
    file: 'lease.mjs',
    find: 'draft.fencingCounter += 1;\n      const lease = {\n        contourId,\n        writerId,\n        missionId,\n        leaseRevision: (existing ? existing.leaseRevision : 0) + 1,',
    replace: 'const lease = {\n        contourId,\n        writerId,\n        missionId,\n        leaseRevision: (existing ? existing.leaseRevision : 0) + 1,',
  },
  {
    id: 'sched-guard-not-preempting',
    file: 'scheduler.mjs',
    find: "if (guard && guard.state !== 'CURRENT') {",
    replace: 'if (false) {',
  },
  {
    id: 'sched-approval-ignored',
    file: 'scheduler.mjs',
    find: '  if (!mission.approved) {',
    replace: '  if (false) {',
  },
  {
    id: 'sched-dependency-ignored',
    file: 'scheduler.mjs',
    find: 'return node.dependsOn.every((dep) => {',
    replace: 'return true || node.dependsOn.every((dep) => {',
  },
  {
    id: 'sched-state-binding-ignored',
    file: 'scheduler.mjs',
    find: "if (mission.contourStatesDigest !== canonicalDigest(contourStates || {})) throw new R24Error('E_SCHEDULER_STATE_BINDING_STALE');",
    replace: "if (false) throw new R24Error('E_SCHEDULER_STATE_BINDING_STALE');",
  },
  {
    id: 'tr-skip-law-removed',
    file: 'terminal-receipt.mjs',
    find: "if (skipped > 0 && REQUIRED_WHEN_PASS.includes(stamp.test.evidenceClass)) throw new R24Error('E_SKIPPED_REQUIRED_EVIDENCE', `${skipped} skipped in ${stamp.test.evidenceClass}`);",
    replace: "if (false) throw new R24Error('E_SKIPPED_REQUIRED_EVIDENCE', `${skipped} skipped in ${stamp.test.evidenceClass}`);",
  },
  {
    id: 'rt-skip-ignored',
    file: 'runner-truth.mjs',
    find: 'if (tapPresent && failOnSkip && (tap.skipped ?? 0) > 0) failures.push(`E_SKIPPED_EVIDENCE:${tap.skipped}`);',
    replace: 'if (false) failures.push(`E_SKIPPED_EVIDENCE:${tap.skipped}`);',
  },
  {
    id: 'rt-zero-executed-ignored',
    file: 'runner-truth.mjs',
    find: "if (tapPresent && executed === 0) failures.push('E_ZERO_DENOMINATOR');",
    replace: "if (false) failures.push('E_ZERO_DENOMINATOR');",
  },
  {
    id: 'env-unregistered-ignored',
    file: 'env-flag-registry.mjs',
    find: 'if (!registered.has(name)) failures.push(`E_ENV_FLAG_UNREGISTERED:${name}`);',
    replace: 'if (false && !registered.has(name)) failures.push(`E_ENV_FLAG_UNREGISTERED:${name}`);',
  },
  {
    id: 'claim-without-evidence-allowed',
    file: 'docs-claim-lint.mjs',
    find: 'if (resolved.size === 0) failures.push(`E_CLAIM_WITHOUT_EVIDENCE:${path.relative(rootDir, file)}`);',
    replace: 'if (false) failures.push(`E_CLAIM_WITHOUT_EVIDENCE:${path.relative(rootDir, file)}`);',
  },
  {
    id: 'claim-binding-digest-ignored',
    file: 'docs-claim-lint.mjs',
    find: 'if (actual !== binding.sha256) {\n      failures.push(`E_CLAIM_BINDING_DIGEST_MISMATCH:${relativePath}`);\n      continue;\n    }',
    replace: 'if (false) {\n      failures.push(`E_CLAIM_BINDING_DIGEST_MISMATCH:${relativePath}`);\n      continue;\n    }',
  },
  {
    id: 'claim-binding-schema-skipped',
    file: 'docs-claim-lint.mjs',
    find: 'const binding = buildClaimBinding(artifact);',
    replace: 'const binding = artifact;',
  },
  {
    id: 'canon-key-order-nondeterministic',
    file: 'canonical-json.mjs',
    find: 'Object.keys(value).sort().map((k)',
    replace: 'Object.keys(value).map((k)',
  },
  {
    id: 'tc-engines-drift-ignored',
    file: 'toolchain.mjs',
    find: 'if (pkg.engines.node !== contract.node.enginesRange) {',
    replace: 'if (false) {',
  },
  {
    id: 'tc-ci-node-incoherent-ignored',
    file: 'toolchain.mjs',
    find: 'if (version !== contract.workflows.singleNodeVersion) {',
    replace: 'if (false) {',
  },
  {
    id: 'tc-unregistered-action-ignored',
    file: 'toolchain.mjs',
    find: 'if (expected === undefined) failures.push(`E_TOOLCHAIN_ACTION_UNREGISTERED:${file}:${use}`);',
    replace: 'if (false) failures.push(`E_TOOLCHAIN_ACTION_UNREGISTERED:${file}:${use}`);',
  },
  {
    id: 'ro-tree-change-ignored',
    file: 'test-readonly-guard.mjs',
    find: 'if (before !== after) {',
    replace: 'if (false) {',
  },
  {
    id: 'ro-unregistered-temp-ignored',
    file: 'test-readonly-guard.mjs',
    find: 'if (!registered.has(literal)) failures.push(`E_TEMP_PATH_UNREGISTERED:${literal}`);',
    replace: 'if (false) failures.push(`E_TEMP_PATH_UNREGISTERED:${literal}`);',
  },
  {
    id: 'sb-digest-drift-ignored',
    file: 'source-binding.mjs',
    find: 'if (sha256hex(content) !== entry.sha256) failures.push(`E_SOURCE_BINDING_DIGEST_DRIFT:${rel}`);',
    replace: 'if (false) failures.push(`E_SOURCE_BINDING_DIGEST_DRIFT:${rel}`);',
  },
  {
    id: 'sb-extra-ignored',
    file: 'source-binding.mjs',
    find: 'if (!declared.has(rel)) failures.push(`E_SOURCE_BINDING_EXTRA:${rel}`);',
    replace: 'if (false) failures.push(`E_SOURCE_BINDING_EXTRA:${rel}`);',
  },
]);

const listTestFiles = (dir, out = []) => {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) listTestFiles(full, out);
    else if (entry.isFile() && entry.name.endsWith('.test.mjs')) out.push(full);
  }
  return out.sort();
};

function runSuite(root) {
  const files = listTestFiles(path.join(root, 'tests'));
  const result = spawnSync(process.execPath, ['--test', ...files], {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    cwd: root,
  });
  return { status: typeof result.status === 'number' ? result.status : 1, tail: `${result.stdout || ''}${result.stderr || ''}`.slice(-2000) };
}

function applyMutant(mutant) {
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'r24-mutant-'));
  fs.cpSync(MODULE_DIR, work, { recursive: true, filter: (src) => !src.includes(`${path.sep}.git`) });
  const target = path.join(work, mutant.file);
  const source = fs.readFileSync(target, 'utf8');
  const occurrences = source.split(mutant.find).length - 1;
  if (occurrences !== 1) {
    return { error: `E_MUTANT_ANCHOR_${occurrences === 0 ? 'MISSING' : 'AMBIGUOUS'}`, work };
  }
  fs.writeFileSync(target, source.replace(mutant.find, mutant.replace));
  return { work, digest: sha256hex(fs.readFileSync(target)) };
}

export function main() {
  const started = Date.now();
  const baseline = runSuite(MODULE_DIR);
  if (baseline.status !== 0) {
    process.stderr.write(`E_MUTANT_BASELINE_RED: unmutated suite must pass first\n${baseline.tail}\n`);
    process.exit(1);
  }
  const results = [];
  for (const mutant of MUTANTS) {
    const applied = applyMutant(mutant);
    if (applied.error) {
      results.push({ id: mutant.id, killed: false, error: applied.error });
      continue;
    }
    const run = runSuite(applied.work);
    results.push({ id: mutant.id, killed: run.status !== 0, digest: applied.digest });
    fs.rmSync(applied.work, { recursive: true, force: true });
  }
  const killed = results.filter((r) => r.killed).length;
  const survived = results.filter((r) => !r.killed);
  const receipt = {
    schemaVersion: 'yalken.r24-mutation-receipt.v1',
    total: results.length,
    killed,
    survived: survived.map((s) => s.id),
    score: results.length === 0 ? 0 : killed / results.length,
    baseline: 'PASS',
    durationMs: Date.now() - started,
  };
  process.stdout.write(`R24_MUTATION_RECEIPT=${JSON.stringify(receipt)}\n`);
  if (survived.length > 0 || results.length === 0) {
    process.stderr.write(`E_MUTANT_SURVIVOR:${survived.map((s) => s.id).join(',')}\n`);
    process.exit(1);
  }
  return receipt;
}

const invokedAsScript = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedAsScript) main();
