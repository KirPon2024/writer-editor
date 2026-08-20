import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkToolchain } from '../../toolchain.mjs';
import { checkTempPathRegistry, assertReadOnlyRun } from '../../test-readonly-guard.mjs';
import { checkEnvFlagRegistry } from '../../env-flag-registry.mjs';
import { verifySourceBinding } from '../../source-binding.mjs';
import { sha256hex } from '../../canonical-json.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..', '..');

test('Q0 integration: live repo satisfies the toolchain contract', () => {
  const result = checkToolchain(REPO_ROOT, { currentNodeVersion: 'v20.19.0' });
  assert.equal(result.ok, true, JSON.stringify(result.failures));
  assert.ok(result.workflowCount >= 5);
});

test('Q0 integration: temp path registry matches live scripts reality', () => {
  const result = checkTempPathRegistry(REPO_ROOT);
  assert.equal(result.ok, true, JSON.stringify(result.failures));
});

test('Q0 integration: env flag registry still matches live scripts reality', () => {
  const result = checkEnvFlagRegistry(REPO_ROOT);
  assert.equal(result.ok, true, JSON.stringify(result.failures));
});

test('Q0 integration: Q0 test lane leaves the worktree byte-identical', () => {
  const { receipt } = assertReadOnlyRun(REPO_ROOT, {
    runId: 'Q0-SELF-READONLY-PROOF',
    cmd: process.execPath,
    args: ['--test', path.join('scripts', 'ops', 'r24', 'tests', 'q0', 'source-binding.test.mjs')],
  });
  assert.equal(receipt.treeChanged, false, JSON.stringify(receipt.delta || []));
  assert.equal(receipt.exitCode, 0);
});

test('Q0 integration: closed-world source binding over the r24 module tree', () => {
  const moduleDir = path.join(REPO_ROOT, 'scripts', 'ops', 'r24');
  const files = [];
  const walk = (d) => {
    for (const item of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, item.name);
      if (item.isDirectory()) walk(full);
      else if (item.isFile()) files.push(path.relative(REPO_ROOT, full).split(path.sep).join('/'));
    }
  };
  walk(moduleDir);
  assert.ok(files.length >= 20);
  const manifest = {
    schemaVersion: 'yalken.source-binding.v1',
    files: files.sort().map((rel) => ({ path: rel, sha256: sha256hex(fs.readFileSync(path.join(REPO_ROOT, rel))) })),
    closedDirectories: ['scripts/ops/r24'],
  };
  // The manifest lives outside the repo: a verification artifact never
  // writes into the tree it measures.
  const manifestPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'r24-q0-sbm-')), 'manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify(manifest));
  const result = verifySourceBinding(REPO_ROOT, manifestPath);
  assert.equal(result.ok, true, JSON.stringify(result.failures.slice(0, 3)));
  assert.equal(result.declaredCount, files.length);
});
