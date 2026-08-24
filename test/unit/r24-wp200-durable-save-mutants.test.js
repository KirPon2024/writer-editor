'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const Module = require('node:module');
const path = require('node:path');

const MODULE_PATH = path.join(__dirname, '..', '..', 'src', 'core', 'save-receipt-ack-v1.cjs');
const sha256hex = (content) => crypto.createHash('sha256').update(content).digest('hex');

const MUTANTS = [
  { id: 'failed-receipt-accepted', find: '  if (receipt.success !== true) {', replace: '  if (false) {' },
  { id: 'revision-binding-removed', find: '  if (receipt.revision !== capturedGeneration) {', replace: '  if (false) {' },
  { id: 'phase-chain-fallback-accepted', find: "  throw new SaveReceiptAckError('E_SAVE_RECEIPT_PHASE_CHAIN_INVALID');", replace: "  return 'DURABLE_SAVE_V1';" },
  { id: 'digest-binding-removed', find: '  if (receiptDigest !== expectedDigest) {', replace: '  if (false) {' },
  { id: 'byte-binding-removed', find: "  if (receiptKind === 'DURABLE_SAVE_V1' && receipt.bytes !== expectedBytes) {", replace: '  if (false) {' },
  { id: 'write-success-denied', find: '    writeSucceeded: true,', replace: '    writeSucceeded: false,' },
];

function loadMutated(source) {
  const loaded = new Module(MODULE_PATH);
  loaded.filename = MODULE_PATH;
  loaded.paths = Module._nodeModulePaths(path.dirname(MODULE_PATH));
  loaded._compile(source, MODULE_PATH);
  return loaded.exports;
}

function oracle(module) {
  const content = 'mutant oracle';
  const valid = {
    success: true,
    phases: [...module.DURABLE_SAVE_PHASE_CHAIN],
    revision: 6,
    digest: sha256hex(content),
    bytes: Buffer.byteLength(content, 'utf8'),
  };
  const bind = (receipt) => module.bindSaveReceiptToAck({
    receipt,
    capturedContent: content,
    capturedGeneration: 6,
    latestEditGeneration: 6,
  });
  assert.equal(bind(valid).ack.kind, 'SAVED');
  assert.throws(() => bind({ ...valid, success: false }));
  assert.throws(() => bind({ ...valid, revision: 5 }));
  assert.throws(() => bind({ ...valid, phases: valid.phases.slice(0, -1) }));
  assert.throws(() => bind({ ...valid, digest: 'f'.repeat(64) }));
  assert.throws(() => bind({ ...valid, bytes: valid.bytes + 1 }));
}

test('WP200 receipt binding kills every named implementation mutant', () => {
  const source = fs.readFileSync(MODULE_PATH, 'utf8');
  const results = [];
  for (const mutant of MUTANTS) {
    assert.equal(source.split(mutant.find).length - 1, 1, `unique mutant anchor: ${mutant.id}`);
    let killed = false;
    let detail = '';
    try {
      oracle(loadMutated(source.replace(mutant.find, mutant.replace)));
      detail = 'survived';
    } catch (error) {
      killed = true;
      detail = error.code || error.message;
    }
    results.push({ id: mutant.id, killed, detail });
  }
  const survived = results.filter((result) => !result.killed);
  console.log('R24_WP200_MUTATION_RECEIPT=' + JSON.stringify({
    total: results.length,
    killed: results.length - survived.length,
    survived: survived.map((result) => result.id),
  }));
  assert.ok(results.length > 0, 'zero mutant denominator forbidden');
  assert.deepEqual(survived, []);
});
