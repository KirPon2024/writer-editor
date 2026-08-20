#!/usr/bin/env node
// R2.4 Q0 — lane entrypoint. Runs the Q0 hygiene suites under runner-truth
// law, the live toolchain/temp-path/env-flag registry gates, a read-only
// verification proof, and the implementation mutation suite. Fail closed.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runTruthful } from './runner-truth.mjs';
import { checkToolchain } from './toolchain.mjs';
import { checkTempPathRegistry, assertReadOnlyRun } from './test-readonly-guard.mjs';
import { checkEnvFlagRegistry } from './env-flag-registry.mjs';
import { lintDocsClaims } from './docs-claim-lint.mjs';

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(MODULE_DIR, '..', '..', '..');

const listQ0TestFiles = () => fs.readdirSync(path.join(MODULE_DIR, 'tests', 'q0'))
  .filter((name) => name.endsWith('.test.mjs'))
  .sort()
  .map((name) => path.join('scripts', 'ops', 'r24', 'tests', 'q0', name));

export function main() {
  const failures = [];
  const files = listQ0TestFiles();
  if (files.length === 0) {
    process.stderr.write('E_ZERO_DENOMINATOR: no Q0 test files found\n');
    process.exit(1);
  }

  const suite = runTruthful({
    runId: 'R24-Q0-SUITE',
    cmd: process.execPath,
    args: ['--test', ...files],
    cwd: REPO_ROOT,
    requireTap: true,
    failOnSkip: true,
  });
  if (suite.receipt.verdict !== 'PASS') {
    process.stdout.write(suite.stdout);
    process.stderr.write(suite.stderr);
    failures.push(...suite.receipt.failures.map((f) => `SUITE:${f}`));
  }
  process.stdout.write(`R24_Q0_SUITE_TAP=${JSON.stringify(suite.receipt.tap)}\n`);

  const toolchain = checkToolchain(REPO_ROOT);
  process.stdout.write(`R24_TOOLCHAIN=${JSON.stringify({ ok: toolchain.ok, workflowCount: toolchain.workflowCount })}\n`);
  if (!toolchain.ok) failures.push(...toolchain.failures.map((f) => `TOOLCHAIN:${f}`));

  const tempPaths = checkTempPathRegistry(REPO_ROOT);
  process.stdout.write(`R24_TEMP_PATHS=${JSON.stringify({ ok: tempPaths.ok, foundCount: tempPaths.foundCount, registeredCount: tempPaths.registeredCount })}\n`);
  if (!tempPaths.ok) failures.push(...tempPaths.failures.map((f) => `TEMP:${f}`));

  const env = checkEnvFlagRegistry(REPO_ROOT);
  process.stdout.write(`R24_ENV_FLAG_REGISTRY=${JSON.stringify({ ok: env.ok, foundCount: env.foundCount, registeredCount: env.registeredCount })}\n`);
  if (!env.ok) failures.push(...env.failures.map((f) => `ENV:${f}`));

  const claims = lintDocsClaims(REPO_ROOT);
  process.stdout.write(`R24_DOCS_CLAIM_LINT=${JSON.stringify({ ok: claims.ok, filesWithClaims: claims.filesWithClaims, stampCount: claims.stampCount })}\n`);
  if (!claims.ok) failures.push(...claims.failures.map((f) => `CLAIMS:${f}`));

  const readonly = assertReadOnlyRun(REPO_ROOT, {
    runId: 'R24-Q0-READONLY-PROOF',
    cmd: process.execPath,
    args: ['--test', path.join('scripts', 'ops', 'ops-synth-negative.test.cjs')],
  });
  process.stdout.write(`R24_READONLY_PROOF=${JSON.stringify({ verdict: readonly.receipt.verdict, treeChanged: readonly.receipt.treeChanged })}\n`);
  if (readonly.receipt.verdict !== 'PASS') failures.push('READONLY:E_VERIFICATION_NOT_READ_ONLY');

  const mutants = runTruthful({
    runId: 'R24-Q0-MUTANTS',
    cmd: process.execPath,
    args: [path.join('scripts', 'ops', 'r24', 'test-mutants.mjs')],
    cwd: REPO_ROOT,
    requireTap: false,
    failOnSkip: false,
  });
  if (mutants.receipt.verdict !== 'PASS') {
    process.stdout.write(mutants.stdout);
    process.stderr.write(mutants.stderr);
    failures.push(...mutants.receipt.failures.map((f) => `MUTANTS:${f}`));
  }
  const mutantReceiptLine = mutants.stdout.split('\n').find((line) => line.startsWith('R24_MUTATION_RECEIPT='));
  if (!mutantReceiptLine) failures.push('MUTANTS:E_MUTATION_RECEIPT_MISSING');
  else process.stdout.write(`${mutantReceiptLine}\n`);

  const summary = {
    schemaVersion: 'yalken.r24-q0-lane-receipt.v1',
    suite: suite.receipt.verdict,
    toolchain: toolchain.ok ? 'PASS' : 'FAIL',
    tempPaths: tempPaths.ok ? 'PASS' : 'FAIL',
    envRegistry: env.ok ? 'PASS' : 'FAIL',
    docsClaimLint: claims.ok ? 'PASS' : 'FAIL',
    readonlyProof: readonly.receipt.verdict,
    mutants: mutants.receipt.verdict,
    failures,
    verdict: failures.length === 0 ? 'PASS' : 'FAIL',
  };
  process.stdout.write(`R24_Q0_LANE_RECEIPT=${JSON.stringify(summary)}\n`);
  process.exitCode = failures.length === 0 ? 0 : 1;
  return summary;
}

const invokedAsScript = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedAsScript) main();
