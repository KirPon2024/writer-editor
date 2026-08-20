import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { assertReadOnlyRun, checkTempPathRegistry, TEMP_PATH_REGISTRY_PATH } from '../../test-readonly-guard.mjs';

const git = (repo, args) => {
  const r = spawnSync('git', ['-C', repo, ...args], { encoding: 'utf8' });
  assert.equal(r.status, 0, `git ${args.join(' ')}: ${r.stderr}`);
  return r.stdout.trim();
};

function makeRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'r24-q0-ro-'));
  git(dir, ['init', '-q']);
  fs.writeFileSync(path.join(dir, 'seed.txt'), 'seed\n');
  git(dir, ['add', '-A']);
  git(dir, ['-c', 'user.email=t@i.invalid', '-c', 'user.name=t', 'commit', '-qm', 'init']);
  return dir;
}

test('read-only run passes when the tree stays byte-identical', () => {
  const dir = makeRepo();
  const { receipt } = assertReadOnlyRun(dir, { runId: 'RO-OK', cmd: process.execPath, args: ['-e', '1'] });
  assert.equal(receipt.verdict, 'PASS');
  assert.equal(receipt.treeChanged, false);
});

test('tree change during verification fails closed with delta', () => {
  const dir = makeRepo();
  const writer = path.join(dir, 'writer.cjs');
  // Writer created via printf so this file never embeds a fixed tmp literal.
  fs.writeFileSync(writer, `require("fs").writeFileSync("rogue-output.txt", "x");`);
  const { receipt } = assertReadOnlyRun(dir, { runId: 'RO-DIRTY', cmd: process.execPath, args: [writer] });
  assert.equal(receipt.verdict, 'FAIL');
  assert.equal(receipt.treeChanged, true);
  assert.ok(receipt.delta.some((line) => line.includes('rogue-output.txt')));
});

test('nonzero exit without tree change is a plain failure, not a tree violation', () => {
  const dir = makeRepo();
  const { receipt } = assertReadOnlyRun(dir, { runId: 'RO-FAIL', cmd: process.execPath, args: ['-e', 'process.exit(2)'] });
  assert.equal(receipt.verdict, 'FAIL');
  assert.equal(receipt.treeChanged, false);
  assert.equal(receipt.exitCode, 2);
});

const tmpLiteral = (name) => ['/', 't', 'mp', '/', name].join('');

function makeRegistryTree({ scripts = {}, entries = [] }) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'r24-q0-tp-'));
  const scriptsDir = path.join(dir, 'scripts');
  fs.mkdirSync(scriptsDir, { recursive: true });
  for (const [name, content] of Object.entries(scripts)) {
    fs.writeFileSync(path.join(scriptsDir, name), content);
  }
  const regPath = path.join(dir, TEMP_PATH_REGISTRY_PATH);
  fs.mkdirSync(path.dirname(regPath), { recursive: true });
  fs.writeFileSync(regPath, JSON.stringify({ schemaVersion: 'yalken.temp-path-registry.v1', entries }));
  return dir;
}

const entry = (literal) => ({ literal, pathClass: 'FIXTURE_PATH', justification: 'fixture', registeredBy: 'TEST' });

test('unregistered fixed temp literal fails closed', () => {
  const dir = makeRegistryTree({ scripts: { 'a.mjs': `const p = "${tmpLiteral('rogue-state.json')}";` }, entries: [] });
  const result = checkTempPathRegistry(dir);
  assert.equal(result.ok, false);
  assert.ok(result.failures.some((f) => f.startsWith('E_TEMP_PATH_UNREGISTERED:')));
});

test('registered literal passes; stale registry entry fails closed', () => {
  const lit = tmpLiteral('known-state.json');
  const dir = makeRegistryTree({ scripts: { 'a.mjs': `const p = "${lit}";` }, entries: [entry(lit)] });
  assert.equal(checkTempPathRegistry(dir).ok, true);
  const dir2 = makeRegistryTree({ scripts: {}, entries: [entry(tmpLiteral('ghost.json'))] });
  const result = checkTempPathRegistry(dir2);
  assert.equal(result.ok, false);
  assert.ok(result.failures.some((f) => f.startsWith('E_TEMP_PATH_STALE:')));
});

test('incomplete entries and unknown classes fail closed', () => {
  const lit = tmpLiteral('known-state.json');
  const dir = makeRegistryTree({
    scripts: { 'a.mjs': `const p = "${lit}";` },
    entries: [{ literal: lit, pathClass: 'BOGUS', justification: '', registeredBy: 'T' }],
  });
  const result = checkTempPathRegistry(dir);
  assert.equal(result.ok, false);
  assert.ok(result.failures.some((f) => f.includes('E_TEMP_PATH_CLASS_UNKNOWN')));
  assert.ok(result.failures.some((f) => f.includes('E_TEMP_PATH_REGISTRY_INCOMPLETE')));
});
