import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { scanEnvFlags, checkEnvFlagRegistry, REGISTRY_RELATIVE_PATH } from '../env-flag-registry.mjs';

// Fixture sources are concatenated so this test file itself never contains a
// literal env-read pattern; the registry law scans real code, not fixtures.
const envRead = (name) => `const x = process.env.${name};`;

function makeTree({ scripts = {}, registry = null } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'r24-env-'));
  const scriptsDir = path.join(dir, 'scripts');
  fs.mkdirSync(scriptsDir, { recursive: true });
  for (const [name, content] of Object.entries(scripts)) {
    fs.mkdirSync(path.dirname(path.join(scriptsDir, name)), { recursive: true });
    fs.writeFileSync(path.join(scriptsDir, name), content);
  }
  if (registry !== null) {
    const regPath = path.join(dir, REGISTRY_RELATIVE_PATH);
    fs.mkdirSync(path.dirname(regPath), { recursive: true });
    fs.writeFileSync(regPath, JSON.stringify(registry));
  }
  return dir;
}

const bypassEntry = (name) => ({
  name,
  flagClass: 'BYPASS',
  semantics: `${name} semantics`,
  defaultEffect: 'off',
  registeredBy: 'TEST',
});

const emptyRegistry = () => ({ schemaVersion: 'yalken.env-flag-registry.v1', flags: [], census: [] });

test('scanner finds dotted and bracketed env reads', () => {
  const dir = makeTree({
    scripts: {
      'a.mjs': `${envRead('PLAIN_ALPHA')} const y = process.env["PLAIN_BETA"];`,
      'b/nested.cjs': `if (${envRead('PLAIN_GAMMA')} == null) {}`,
    },
  });
  const found = scanEnvFlags(dir);
  assert.ok(found.has('PLAIN_ALPHA'));
  assert.ok(found.has('PLAIN_BETA'));
  assert.ok(found.has('PLAIN_GAMMA'));
});

test('unregistered bypass-class flag fails closed', () => {
  const dir = makeTree({
    scripts: { 'a.mjs': envRead('SOME_SKIP_GATE') },
    registry: emptyRegistry(),
  });
  const result = checkEnvFlagRegistry(dir);
  assert.equal(result.ok, false);
  assert.ok(result.failures.includes('E_ENV_FLAG_UNREGISTERED:SOME_SKIP_GATE'));
});

test('unregistered plain flag fails closed via census law', () => {
  const dir = makeTree({
    scripts: { 'a.mjs': envRead('PLAIN_THETA') },
    registry: emptyRegistry(),
  });
  const result = checkEnvFlagRegistry(dir);
  assert.equal(result.ok, false);
  assert.ok(result.failures.includes('E_ENV_FLAG_UNREGISTERED:PLAIN_THETA'));
});

test('bypass flag in census is misclassified and fails', () => {
  const dir = makeTree({
    scripts: { 'a.mjs': envRead('SOME_SKIP_GATE') },
    registry: { ...emptyRegistry(), census: ['SOME_SKIP_GATE'] },
  });
  const result = checkEnvFlagRegistry(dir);
  assert.equal(result.ok, false);
  assert.ok(result.failures.includes('E_ENV_FLAG_MISCLASSIFIED:SOME_SKIP_GATE'));
});

test('incomplete and stale registry entries fail closed', () => {
  const dir = makeTree({
    scripts: { 'a.mjs': envRead('SOME_SKIP_GATE') },
    registry: {
      schemaVersion: 'yalken.env-flag-registry.v1',
      flags: [
        { name: 'SOME_SKIP_GATE', flagClass: 'BYPASS', semantics: 'x', defaultEffect: '', registeredBy: 'T' },
        { name: 'GHOST_SKIP', flagClass: 'BYPASS', semantics: 'x', defaultEffect: 'y', registeredBy: 'T' },
      ],
      census: [],
    },
  });
  const result = checkEnvFlagRegistry(dir);
  assert.equal(result.ok, false);
  assert.ok(result.failures.some((f) => f.startsWith('E_ENV_FLAG_REGISTRY_INCOMPLETE:0:defaultEffect')));
  assert.ok(result.failures.includes('E_ENV_FLAG_STALE:GHOST_SKIP'));
});

test('fully registered tree passes with census accounting', () => {
  const dir = makeTree({
    scripts: { 'a.mjs': `${envRead('SOME_SKIP_GATE')}\n${envRead('PLAIN_THETA')}` },
    registry: {
      schemaVersion: 'yalken.env-flag-registry.v1',
      flags: [bypassEntry('SOME_SKIP_GATE')],
      census: ['PLAIN_THETA'],
    },
  });
  const result = checkEnvFlagRegistry(dir);
  assert.equal(result.ok, true, JSON.stringify(result.failures));
  assert.equal(result.foundCount, 2);
  assert.equal(result.registeredCount, 1);
  assert.equal(result.censusCount, 1);
});

test('duplicate registry names fail closed', () => {
  const dir = makeTree({
    scripts: { 'a.mjs': envRead('SOME_SKIP_GATE') },
    registry: {
      schemaVersion: 'yalken.env-flag-registry.v1',
      flags: [bypassEntry('SOME_SKIP_GATE'), { ...bypassEntry('SOME_SKIP_GATE') }],
      census: [],
    },
  });
  const result = checkEnvFlagRegistry(dir);
  assert.equal(result.ok, false);
  assert.ok(result.failures.includes('E_ENV_FLAG_REGISTRY_DUPLICATE:SOME_SKIP_GATE'));
});
