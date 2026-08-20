import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { checkToolchain, nodeSatisfies, parseNodeRange } from '../../toolchain.mjs';

const RANGE = '>=20.19.0 <21.0.0';

test('nodeSatisfies bounds the pinned line exactly', () => {
  assert.equal(nodeSatisfies('v20.19.0', RANGE), true);
  assert.equal(nodeSatisfies('20.19.5', RANGE), true);
  assert.equal(nodeSatisfies('20.20.0', RANGE), true);
  assert.equal(nodeSatisfies('20.18.9', RANGE), false);
  assert.equal(nodeSatisfies('21.0.0', RANGE), false);
  assert.equal(nodeSatisfies('18.20.8', RANGE), false);
  assert.throws(() => parseNodeRange('node20'), (e) => e.code === 'E_TOOLCHAIN_RANGE_SHAPE');
  assert.throws(() => nodeSatisfies('vX', RANGE), (e) => e.code === 'E_TOOLCHAIN_VERSION_SHAPE');
});

const git = (repo, args) => {
  const r = spawnSync('git', ['-C', repo, ...args], { encoding: 'utf8' });
  assert.equal(r.status, 0, `git ${args.join(' ')}: ${r.stderr}`);
  return r.stdout.trim();
};

function makeTree({ pkg = {}, workflows = {}, lockfile = { lockfileVersion: 3 }, contract = null } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'r24-q0-tc-'));
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({
    name: 'fixture',
    engines: { node: RANGE, npm: '>=10.0.0 <11.0.0' },
    ...pkg,
  }));
  if (lockfile) fs.writeFileSync(path.join(dir, 'package-lock.json'), JSON.stringify(lockfile));
  const wfDir = path.join(dir, '.github', 'workflows');
  fs.mkdirSync(wfDir, { recursive: true });
  for (const [name, text] of Object.entries(workflows)) fs.writeFileSync(path.join(wfDir, name), text);
  const contractDoc = contract || {
    schemaVersion: 'yalken.toolchain-contract.v1',
    node: { enginesRange: RANGE },
    npm: { enginesRange: '>=10.0.0 <11.0.0', lockfileVersion: 3, forbiddenLockfiles: ['pnpm-lock.yaml', 'yarn.lock'] },
    workflows: { singleNodeVersion: '20.19.x', allowedActionPins: { 'actions/checkout': 'v4', 'actions/setup-node': 'v4' } },
  };
  const cDir = path.join(dir, 'docs', 'OPS', 'R24');
  fs.mkdirSync(cDir, { recursive: true });
  fs.writeFileSync(path.join(cDir, 'TOOLCHAIN_CONTRACT_V1.json'), JSON.stringify(contractDoc));
  git(dir, ['init', '-q']);
  git(dir, ['add', '-A']);
  git(dir, ['-c', 'user.email=t@i.invalid', '-c', 'user.name=t', 'commit', '-qm', 'init']);
  return dir;
}

const wf = (version) => `name: t\non: [push]\njobs:\n  j:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v4\n      - uses: actions/setup-node@v4\n        with:\n          node-version: "${version}"\n`;

test('coherent synthetic tree passes', () => {
  const dir = makeTree({ workflows: { 'a.yml': wf('20.19.x') } });
  const result = checkToolchain(dir, { currentNodeVersion: 'v20.19.3' });
  assert.equal(result.ok, true, JSON.stringify(result.failures));
});

test('missing engines, unsupported runtime and lockfile drift fail closed', () => {
  const dir = makeTree({ workflows: { 'a.yml': wf('20.19.x') } });
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'fixture' }));
  git(dir, ['add', '-A']);
  git(dir, ['-c', 'user.email=t@i.invalid', '-c', 'user.name=t', 'commit', '-qm', 'drop-engines']);
  let result = checkToolchain(dir, { currentNodeVersion: 'v20.19.3' });
  assert.ok(result.failures.includes('E_TOOLCHAIN_ENGINES_MISSING'));
  result = checkToolchain(dir, { currentNodeVersion: 'v18.20.8' });
  assert.ok(result.failures.some((f) => f.startsWith('E_TOOLCHAIN_NODE_UNSUPPORTED')));
  const dir2 = makeTree({ lockfile: { lockfileVersion: 2 }, workflows: { 'a.yml': wf('20.19.x') } });
  result = checkToolchain(dir2, { currentNodeVersion: 'v20.19.3' });
  assert.ok(result.failures.some((f) => f.startsWith('E_TOOLCHAIN_LOCKFILE_VERSION')));
});

test('engines range drift from contract fails closed', () => {
  const dir = makeTree({ pkg: { engines: { node: '>=18.0.0', npm: '>=10.0.0 <11.0.0' } }, workflows: { 'a.yml': wf('20.19.x') } });
  const result = checkToolchain(dir, { currentNodeVersion: 'v20.19.3' });
  assert.equal(result.ok, false);
  assert.ok(result.failures.some((f) => f.startsWith('E_TOOLCHAIN_ENGINES_DRIFT')));
});

test('workflow matrix incoherence and unregistered actions fail closed', () => {
  const dir = makeTree({ workflows: { 'a.yml': wf('18') } });
  let result = checkToolchain(dir, { currentNodeVersion: 'v20.19.3' });
  assert.ok(result.failures.some((f) => f.startsWith('E_TOOLCHAIN_CI_NODE_INCOHERENT:a.yml:18')));
  const dir2 = makeTree({ workflows: { 'b.yml': 'name: t\non: [push]\njobs:\n  j:\n    steps:\n      - uses: actions/unknown-action@v9\n' } });
  result = checkToolchain(dir2, { currentNodeVersion: 'v20.19.3' });
  assert.ok(result.failures.some((f) => f.startsWith('E_TOOLCHAIN_ACTION_UNREGISTERED:b.yml:actions/unknown-action@v9')));
});

test('forbidden tracked lockfile fails closed', () => {
  const dir = makeTree({ workflows: { 'a.yml': wf('20.19.x') } });
  fs.writeFileSync(path.join(dir, 'pnpm-lock.yaml'), 'lockfileVersion: 9\n');
  git(dir, ['add', '-A']);
  git(dir, ['-c', 'user.email=t@i.invalid', '-c', 'user.name=t', 'commit', '-qm', 'add-pnpm']);
  const result = checkToolchain(dir, { currentNodeVersion: 'v20.19.3' });
  assert.ok(result.failures.includes('E_TOOLCHAIN_FORBIDDEN_LOCKFILE:pnpm-lock.yaml'));
});
