#!/usr/bin/env node
// R2.4 E0 — lane entrypoint. Runs the E0 unit/contract/integration suites
// under the runner-truth law, then the implementation mutation suite, then
// the env-flag registry and docs-claim lint gates. Fail closed: any law
// violation, survivor mutant or registry drift exits nonzero.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runTruthful } from './runner-truth.mjs';
import { checkEnvFlagRegistry } from './env-flag-registry.mjs';
import { lintDocsClaims } from './docs-claim-lint.mjs';

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(MODULE_DIR, '..', '..', '..');

const listTestFiles = () => fs.readdirSync(path.join(MODULE_DIR, 'tests'))
  .filter((name) => name.endsWith('.test.mjs'))
  .sort()
  .map((name) => path.join('scripts', 'ops', 'r24', 'tests', name));

export function main() {
  const failures = [];
  const files = listTestFiles();
  if (files.length === 0) {
    process.stderr.write('E_ZERO_DENOMINATOR: no E0 test files found\n');
    process.exit(1);
  }

  const suite = runTruthful({
    runId: 'R24-E0-SUITE',
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
  process.stdout.write(`R24_E0_SUITE_TAP=${JSON.stringify(suite.receipt.tap)}\n`);

  const mutants = runTruthful({
    runId: 'R24-E0-MUTANTS',
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
  if (!mutantReceiptLine) {
    failures.push('MUTANTS:E_MUTATION_RECEIPT_MISSING');
  } else {
    process.stdout.write(`${mutantReceiptLine}\n`);
  }

  const env = checkEnvFlagRegistry(REPO_ROOT);
  process.stdout.write(`R24_ENV_FLAG_REGISTRY=${JSON.stringify({ ok: env.ok, foundCount: env.foundCount, registeredCount: env.registeredCount })}\n`);
  if (!env.ok) failures.push(...env.failures.map((f) => `ENV:${f}`));

  const claims = lintDocsClaims(REPO_ROOT);
  process.stdout.write(`R24_DOCS_CLAIM_LINT=${JSON.stringify({ ok: claims.ok, filesWithClaims: claims.filesWithClaims, stampCount: claims.stampCount })}\n`);
  if (!claims.ok) failures.push(...claims.failures.map((f) => `CLAIMS:${f}`));

  const summary = {
    schemaVersion: 'yalken.r24-e0-lane-receipt.v1',
    suite: suite.receipt.verdict,
    mutants: mutants.receipt.verdict,
    envRegistry: env.ok ? 'PASS' : 'FAIL',
    docsClaimLint: claims.ok ? 'PASS' : 'FAIL',
    failures,
    verdict: failures.length === 0 ? 'PASS' : 'FAIL',
  };
  process.stdout.write(`R24_E0_LANE_RECEIPT=${JSON.stringify(summary)}\n`);
  process.exitCode = failures.length === 0 ? 0 : 1;
  return summary;
}

const invokedAsScript = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedAsScript) main();
