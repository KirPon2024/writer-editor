'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { pathToFileURL } = require('node:url');
const { fixture: historyFixture } = require('../fixtures/r24-wp803-descriptive-history-fixtures.js');
const { seedPulseClaimDirectory } = require('../fixtures/r24-wp806-pulse-claim-fixtures.js');

const claimPath = path.resolve(__dirname, '../../src/core/pulse-claim-v1.mjs');
const presentationPath = path.resolve(__dirname, '../../src/renderer/pulseHistoryPresentationModel.mjs');
const originalPromises = new Map([
  [claimPath, import(pathToFileURL(claimPath).href)],
  [presentationPath, import(pathToFileURL(presentationPath).href)],
]);

const directory = t => {
  const value = fs.mkdtempSync(path.join(os.tmpdir(), 'yalken-wp806-mutant-'));
  t.after(() => fs.rmSync(value, { recursive: true, force: true }));
  return value;
};
async function loadMutant(filePath, from, to, name) {
  const source = fs.readFileSync(filePath, 'utf8');
  assert.equal(source.split(from).length - 1, 1, `exactly one mutation site required: ${name}`);
  const mutated = source.replace(from, to).replace(/from '(\.\.\/|\.\/)([^']+)'/gu, (_, prefix, relative) =>
    `from ${JSON.stringify(pathToFileURL(path.resolve(path.dirname(filePath), prefix + relative)).href)}`);
  return import(`data:text/javascript;base64,${Buffer.from(mutated).toString('base64')}#${encodeURIComponent(name)}`);
}

const mutations = [
  {
    name: 'opt-out read boundary bypassed', file: claimPath,
    from: "if (privacyStatus(privacyState) === 'OPTED_OUT') {", to: 'if (false) {',
    oracle: async (module, t) => assert.equal((await module.readPulseClaimProjection(path.join(directory(t), 'missing'))).state, 'optedOut'),
  },
  {
    name: 'current history guard removed', file: claimPath,
    from: 'const history = assertPulseDescriptiveHistoryCurrent(historyProjection, currentIdentity);', to: 'const history = historyProjection;',
    oracle: async (module, t) => {
      const { input } = await historyFixture(t);
      const historyModule = await import('../../src/core/descriptive-history-v1.mjs');
      const historyProjection = structuredClone(historyModule.buildPulseDescriptiveHistory(input));
      historyProjection.rows[0].added.value += 1;
      assert.throws(() => module.buildPulseClaim({ historyProjection, currentIdentity: input.currentIdentity, privacyState: { collectionStatus: 'OPTED_IN' } }), /E_WP803_PROJECTION_TAMPER/u);
    },
  },
  {
    name: 'visible row bound removed', file: claimPath,
    from: 'const rows = history.rows.slice(0, limit).map((row) => ({', to: 'const rows = history.rows.map((row) => ({',
    oracle: async (module, t) => { const root = directory(t); await seedPulseClaimDirectory(root); assert.equal((await module.readPulseClaimProjection(root, { rowLimit: 1 })).rows.length, 1); },
  },
  {
    name: 'true denominator replaced by visible count', file: claimPath,
    from: 'totalRows: history.rows.length,', to: 'totalRows: rows.length,',
    oracle: async (module, t) => { const root = directory(t); await seedPulseClaimDirectory(root); assert.equal((await module.readPulseClaimProjection(root, { rowLimit: 1 })).summary.totalRows, 2); },
  },
  {
    name: 'descriptive claim changed to productivity claim', file: claimPath,
    from: "{ id: 'DESCRIPTIVE_ONLY', status: 'PASS', reason: 'NO_PRODUCTIVITY_OR_EFFORT_SCORE' },", to: "{ id: 'DESCRIPTIVE_ONLY', status: 'PASS', reason: 'PRODUCTIVITY_SCORE' },",
    oracle: async (module, t) => { const root = directory(t); await seedPulseClaimDirectory(root); assert.equal((await module.readPulseClaimProjection(root)).claims[0].reason, 'NO_PRODUCTIVITY_OR_EFFORT_SCORE'); },
  },
  {
    name: 'read-only authority removed', file: claimPath,
    from: 'readOnly: true,', to: 'readOnly: false,',
    oracle: async (module, t) => { const root = directory(t); await seedPulseClaimDirectory(root); assert.equal((await module.readPulseClaimProjection(root)).authority.readOnly, true); },
  },
  {
    name: 'storage mutation authority enabled', file: claimPath,
    from: 'storageMutation: false,', to: 'storageMutation: true,',
    oracle: async (module, t) => { const root = directory(t); await seedPulseClaimDirectory(root); assert.equal((await module.readPulseClaimProjection(root)).authority.storageMutation, false); },
  },
  {
    name: 'projection deep freeze removed', file: claimPath,
    from: 'Object.freeze(value);', to: 'void value;',
    oracle: async (module, t) => { const root = directory(t); await seedPulseClaimDirectory(root); assert.equal(Object.isFrozen((await module.readPulseClaimProjection(root)).rows[0].added), true); },
  },
  {
    name: 'missing value displayed as zero', file: presentationPath,
    from: "if (source.status !== 'RECORDED') {\n    return { status: 'NOT_RECORDED', value: null, displayValue: 'Not recorded', provenance: '' };\n  }",
    to: "if (source.status !== 'RECORDED') {\n    return { status: 'NOT_RECORDED', value: null, displayValue: '0', provenance: '' };\n  }",
    oracle: async module => assert.equal(module.normalizePulseHistoryPresentation({ state: 'ready', rows: [{ sceneEdits: { status: 'NOT_RECORDED', value: null } }], summary: {} }).rows[0].metrics.find(row => row.id === 'sceneEdits').displayValue, 'Not recorded'),
  },
  {
    name: 'recorded provenance hidden', file: presentationPath,
    from: "provenance: typeof source.provenance === 'string' ? source.provenance : '',", to: "provenance: '',",
    oracle: async module => assert.equal(module.normalizePulseHistoryPresentation({ state: 'ready', rows: [{ added: { status: 'RECORDED', value: 0, provenance: 'LEDGER_AGGREGATE' } }], summary: {} }).rows[0].metrics.find(row => row.id === 'added').provenance, 'LEDGER_AGGREGATE'),
  },
];

for (const mutation of mutations) test(`WP806 kills implementation mutant: ${mutation.name}`, async t => {
  await mutation.oracle(await originalPromises.get(mutation.file), t);
  const mutant = await loadMutant(mutation.file, mutation.from, mutation.to, mutation.name);
  await assert.rejects(() => mutation.oracle(mutant, t), 'real source mutant must be killed by behavioral oracle');
});
