'use strict';

// R2.4 WP-101 implementation mutation suite for the capability-bound
// registration law, plus wiring mutants over the live policy.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const MODULE_PATH = path.join(__dirname, '..', '..', 'src', 'core', 'ipc-caller-identity-v1.cjs');
const MAIN_PATH = path.join(__dirname, '..', '..', 'src', 'main.js');
const { scanAdmissionWiring } = require('./r24-wp101-ipc-admission.test.js');

const MODULE_MUTANTS = [
  {
    id: 'unbound-channel-allowed',
    find: "    if (!capabilityClassOf(channel)) throw new IpcCallerIdentityError('E_IPC_CHANNEL_CAPABILITY_UNBOUND', String(channel));",
    replace: "    if (!capabilityClassOf(channel)) return;",
  },
  {
    id: 'unknown-class-accepted',
    find: "    if (!IPC_CHANNEL_CAPABILITY_CLASSES.includes(capabilityClass)) {\n      throw new IpcCallerIdentityError('E_IPC_CAPABILITY_CLASS_UNKNOWN', `${key}:${String(capabilityClass)}`);\n    }",
    replace: '    if (false) {\n      throw new IpcCallerIdentityError(\'E_IPC_CAPABILITY_CLASS_UNKNOWN\', `${key}:${String(capabilityClass)}`);\n    }',
  },
  {
    id: 'empty-map-accepted',
    find: "  if (map.size === 0) throw new IpcCallerIdentityError('E_IPC_CAPABILITY_MAP_EMPTY');",
    replace: '  if (false) { throw new IpcCallerIdentityError(\'E_IPC_CAPABILITY_MAP_EMPTY\'); }',
  },
];

function moduleOracle(module) {
  const { createCapabilityBoundRegistration, IpcCallerIdentityError } = module;
  const fake = { handle() {}, on() {} };
  const bound = createCapabilityBoundRegistration(fake, { 'file:open': 'fs.read' });
  assert.throws(() => bound.handle('ui:create-node', () => {}), (e) => e instanceof IpcCallerIdentityError && e.code === 'E_IPC_CHANNEL_CAPABILITY_UNBOUND');
  assert.throws(() => createCapabilityBoundRegistration(fake, { 'file:open': 'fs.everything' }), (e) => e.code === 'E_IPC_CAPABILITY_CLASS_UNKNOWN');
  assert.throws(() => createCapabilityBoundRegistration(fake, {}), (e) => e.code === 'E_IPC_CAPABILITY_MAP_EMPTY');
  assert.equal(bound.capabilityClassOf('file:open'), 'fs.read');
}

const WIRING_MUTANTS = [
  {
    id: 'live-caller-binding-removed',
    mutate: (source) => source.replace('  resolveLiveCaller: () => {', '  resolveLiveCaller_DISABLED: () => {'),
  },
  {
    id: 'M12-generic-webcontents-enumeration-restored',
    mutate: (source) => source.replace(
      '    const shell = mainWindow.webContents;',
      '    const shell = webContents.getAllWebContents().find((candidate) => candidate && !candidate.isDestroyed());',
    ),
  },
  {
    id: 'capability-wrap-removed',
    mutate: (source) => source.replace(
      'const { handle: guardedHandle, on: guardedOn } = createCapabilityBoundRegistration(GUARDED_IPC_REGISTRATION, IPC_CHANNEL_CAPABILITY_CLASS);',
      'const { handle: guardedHandle, on: guardedOn } = GUARDED_IPC_REGISTRATION;',
    ),
  },
  {
    id: 'mutation-channel-unbound',
    mutate: (source) => source.replace("  'ui:create-node': 'project.mutation',\n", ''),
  },
];

test('WP-101 module mutants: every mutation of the binding law is killed', () => {
  const source = fs.readFileSync(MODULE_PATH, 'utf8');
  moduleOracle(require(MODULE_PATH));
  const results = [];
  for (const mutant of MODULE_MUTANTS) {
    const occurrences = source.split(mutant.find).length - 1;
    assert.equal(occurrences, 1, `mutant anchor must be unique: ${mutant.id}`);
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'r24-wp101-mutant-'));
    const target = path.join(dir, 'ipc-caller-identity-v1.cjs');
    fs.writeFileSync(target, source.replace(mutant.find, mutant.replace));
    let killed = false;
    let detail = '';
    try {
      moduleOracle(require(target));
      detail = 'survived';
    } catch (error) {
      killed = true;
      detail = error.code || error.message;
    }
    results.push({ id: mutant.id, killed, detail });
    fs.rmSync(dir, { recursive: true, force: true });
  }
  const survived = results.filter((r) => !r.killed);
  assert.equal(survived.length, 0, JSON.stringify(survived));
});

test('WP-101 wiring mutants: every policy-weakening mutation is flagged by the admission scan', () => {
  const mainSource = fs.readFileSync(MAIN_PATH, 'utf8');
  const baseline = scanAdmissionWiring(mainSource);
  assert.deepEqual(baseline.violations, [], 'baseline wiring must be clean before mutation');
  const results = [];
  for (const mutant of WIRING_MUTANTS) {
    const mutated = mutant.mutate(mainSource);
    assert.notEqual(mutated, mainSource, `mutant must change the source: ${mutant.id}`);
    const verdict = scanAdmissionWiring(mutated);
    results.push({ id: mutant.id, killed: verdict.violations.length > 0, detail: JSON.stringify(verdict.violations.map((v) => v.detail)) });
  }
  const survived = results.filter((r) => !r.killed);
  console.log(`R24_WP101_MUTATION_RECEIPT=${JSON.stringify({ moduleMutants: MODULE_MUTANTS.length, wiringMutants: WIRING_MUTANTS.length, killed: MODULE_MUTANTS.length + results.length - survived.length, survived: survived.map((s) => s.id), score: (MODULE_MUTANTS.length + WIRING_MUTANTS.length - survived.length) / (MODULE_MUTANTS.length + WIRING_MUTANTS.length) })}`);
  assert.deepEqual(survived, []);
});
