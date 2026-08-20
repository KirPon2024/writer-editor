#!/usr/bin/env node
// R2.4 Q0 — supported toolchain law checker.
// Binds the pinned runtime/package/CI profile: engines presence and
// satisfaction, npm-only lockfile policy, single CI Node line across the
// workflow matrix, and pinned action majors. Drift fails closed.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { readJsonBounded, R24Error } from './canonical-json.mjs';

export const TOOLCHAIN_CONTRACT_PATH = path.join('docs', 'OPS', 'R24', 'TOOLCHAIN_CONTRACT_V1.json');

export function parseNodeRange(range) {
  const match = String(range || '').match(/^>=(\d+)\.(\d+)\.(\d+)\s+<(\d+)\.(\d+)\.(\d+)$/);
  if (!match) throw new R24Error('E_TOOLCHAIN_RANGE_SHAPE', String(range));
  return {
    min: match.slice(1, 4).map(Number),
    maxExclusive: match.slice(4, 7).map(Number),
  };
}

const cmp3 = (a, b) => {
  for (let i = 0; i < 3; i += 1) {
    if (a[i] !== b[i]) return a[i] < b[i] ? -1 : 1;
  }
  return 0;
};

export function nodeSatisfies(version, range) {
  const v = String(version || '').replace(/^v/, '').split('.').map((x) => Number(x));
  if (v.length < 3 || v.some((x) => !Number.isInteger(x))) throw new R24Error('E_TOOLCHAIN_VERSION_SHAPE', String(version));
  const { min, maxExclusive } = parseNodeRange(range);
  return cmp3(v, min) >= 0 && cmp3(v, maxExclusive) < 0;
}

export function checkToolchain(rootDir, { currentNodeVersion = process.version } = {}) {
  const failures = [];
  const contract = readJsonBounded(path.join(rootDir, TOOLCHAIN_CONTRACT_PATH));
  if (contract.schemaVersion !== 'yalken.toolchain-contract.v1') throw new R24Error('E_TOOLCHAIN_CONTRACT_SCHEMA');

  const pkg = readJsonBounded(path.join(rootDir, 'package.json'));
  if (!pkg.engines || typeof pkg.engines !== 'object') {
    failures.push('E_TOOLCHAIN_ENGINES_MISSING');
  } else {
    if (pkg.engines.node !== contract.node.enginesRange) {
      failures.push(`E_TOOLCHAIN_ENGINES_DRIFT:${String(pkg.engines.node)}`);
    }
    if (pkg.engines.npm !== contract.npm.enginesRange) {
      failures.push(`E_TOOLCHAIN_NPM_ENGINES_DRIFT:${String(pkg.engines.npm)}`);
    }
  }
  if (pkg.packageManager !== undefined && !String(pkg.packageManager).startsWith('npm@')) {
    failures.push(`E_TOOLCHAIN_PACKAGE_MANAGER_NOT_NPM:${String(pkg.packageManager)}`);
  }
  if (!nodeSatisfies(currentNodeVersion, contract.node.enginesRange)) {
    failures.push(`E_TOOLCHAIN_NODE_UNSUPPORTED:${currentNodeVersion}`);
  }

  const lockfilePath = path.join(rootDir, 'package-lock.json');
  if (!fs.existsSync(lockfilePath)) {
    failures.push('E_TOOLCHAIN_LOCKFILE_MISSING');
  } else {
    const lock = readJsonBounded(lockfilePath, { maxBytes: 16 * 1024 * 1024 });
    if (lock.lockfileVersion !== contract.npm.lockfileVersion) {
      failures.push(`E_TOOLCHAIN_LOCKFILE_VERSION:${String(lock.lockfileVersion)}`);
    }
  }
  const tracked = spawnSync('git', ['-C', rootDir, 'ls-files'], { encoding: 'utf8' });
  if (tracked.status !== 0) throw new R24Error('E_GIT', String(tracked.stderr || '').trim());
  const trackedSet = tracked.stdout.split('\n');
  for (const forbidden of contract.npm.forbiddenLockfiles) {
    if (trackedSet.includes(forbidden)) failures.push(`E_TOOLCHAIN_FORBIDDEN_LOCKFILE:${forbidden}`);
  }

  const workflowDir = path.join(rootDir, '.github', 'workflows');
  const workflowFiles = fs.existsSync(workflowDir)
    ? fs.readdirSync(workflowDir).filter((f) => /\.ya?ml$/.test(f)).sort()
    : [];
  for (const file of workflowFiles) {
    const text = fs.readFileSync(path.join(workflowDir, file), 'utf8');
    const versionMatches = [...text.matchAll(/node-version:\s*["']?([0-9a-z.\-x]+)["']?/g)].map((m) => m[1]);
    for (const version of versionMatches) {
      if (version !== contract.workflows.singleNodeVersion) {
        failures.push(`E_TOOLCHAIN_CI_NODE_INCOHERENT:${file}:${version}`);
      }
    }
    const uses = [...text.matchAll(/uses:\s*([A-Za-z0-9_\-./]+)@([A-Za-z0-9.\-]+)/g)].map((m) => `${m[1]}@${m[2]}`);
    for (const use of uses) {
      const [action, pin] = use.split('@');
      const expected = contract.workflows.allowedActionPins[action];
      if (expected === undefined) failures.push(`E_TOOLCHAIN_ACTION_UNREGISTERED:${file}:${use}`);
      else if (expected !== pin) failures.push(`E_TOOLCHAIN_ACTION_PIN_DRIFT:${file}:${use}`);
    }
  }
  return { ok: failures.length === 0, failures, workflowCount: workflowFiles.length };
}

export function main(argv = process.argv.slice(2)) {
  const rootDir = path.resolve(argv[0] || process.cwd());
  const result = checkToolchain(rootDir);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (!result.ok) process.exitCode = 1;
  return result;
}

const invokedAsScript = process.argv[1] && path.resolve(process.argv[1]).endsWith('toolchain.mjs');
if (invokedAsScript) main();
