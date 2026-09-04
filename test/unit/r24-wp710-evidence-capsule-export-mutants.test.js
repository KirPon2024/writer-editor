'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const f = require('../fixtures/r24-wp710-evidence-capsule-export-fixtures.js');
const load = () => import('../../src/core/evidence-capsule-export-v1.mjs');

test('WP710 rejects every registered forbidden-field secret authority and structural input mutant', async t => {
  const api = await load();
  let invoked = 0;
  const accessor = f.request(); Object.defineProperty(accessor, 'records', { enumerable: true, get() { invoked++; return []; } });
  const proxy = new Proxy(f.request(), { getPrototypeOf() { invoked++; throw new Error('trap'); } });
  const hidden = f.request(); Object.defineProperty(hidden, 'hidden', { value: true });
  const cases = [
    ['unknown input field', { ...f.request(), writePath: 'out.json' }],
    ['duplicate profile', f.request({ requestedProfiles: ['ATLAS', 'ATLAS'] })],
    ['unknown profile', f.request({ requestedProfiles: ['SECRETS'] })],
    ['unrequested record', f.request({ requestedProfiles: ['ATLAS'], records: [f.record('WSE', 'wse-1')] })],
    ['duplicate record', f.request({ records: [f.record('ATLAS', 'atlas-1'), f.record('ATLAS', 'atlas-1')] })],
    ['duplicate anchor', f.request({ records: [f.record('ATLAS', 'atlas-1', { anchorIds: ['anchor-1', 'anchor-1'] })] })],
    ['secret capsule', f.request({ capsuleId: 'owner-token-value' })],
    ['secret anchor', f.request({ records: [f.record('ATLAS', 'atlas-1', { anchorIds: ['private-key'] })] })],
    ['source content field', f.request({ records: [{ ...f.record('ATLAS', 'atlas-1'), quote: 'manuscript text' }] })],
    ['path authority field', f.request({ records: [{ ...f.record('ATLAS', 'atlas-1'), path: 'artifact.json' }] })],
    ['bad digest', f.request({ records: [f.record('ATLAS', 'atlas-1', { evidenceDigest: 'not-a-digest' })] })],
    ['accessor', accessor], ['proxy', proxy], ['hidden', hidden],
  ];
  for (const [name, input] of cases) {
    const denied = api.createEvidenceCapsuleExport(input);
    assert.equal(denied.ok, false, name);
    assert.equal(denied.artifactPublished, false, name);
    assert.equal(denied.productMutationAuthority, false, name);
  }
  assert.equal(invoked, 0);
  t.diagnostic(JSON.stringify({ hostileInputDenominator: cases.length, rejected: cases.length }));
});

test('WP710 parser rejects independently rehashed semantic overclaims and byte tampering', async t => {
  const api = await load(), ir = await import('../../src/core/interchange-ir-v1.mjs');
  const made = api.createEvidenceCapsuleExport(f.request());
  const mutations = [
    (payload) => { payload.policy.productMutationAuthority = true; },
    (payload) => { payload.policy.providerAuthority = true; },
    (payload) => { payload.policy.sourceContentIncluded = true; },
    (payload) => { payload.policy.secretMaterialIncluded = true; },
    (payload) => { payload.counts.recordDenominator += 1; },
    (payload) => { payload.profiles[0].recordDenominator += 1; },
    (payload) => { payload.profiles[0].status = 'UNAVAILABLE'; },
    (payload) => { payload.profiles[0].evidenceDigestSetSha256 = '0'.repeat(64); },
    (payload) => { payload.records[0].generation += 1; },
    (payload) => { payload.records[0].anchorIds.reverse(); },
  ];
  for (const mutate of mutations) {
    const payload = structuredClone(made.envelope.body.payload); mutate(payload);
    const rebuilt = ir.createInterchangeIrEnvelope({ familyId: 'EVIDENCE', identity: f.identity(), payload });
    assert.equal(rebuilt.ok, true);
    assert.equal(api.parseEvidenceCapsuleExport({ bytes: rebuilt.bytes, expectedIdentity: f.identity() }).ok, false);
  }
  const tampered = Buffer.from(made.bytes); tampered[tampered.length - 2] ^= 1;
  assert.equal(api.parseEvidenceCapsuleExport({ bytes: tampered, expectedIdentity: f.identity() }).ok, false);
  assert.equal(api.parseEvidenceCapsuleExport({ bytes: made.bytes, expectedIdentity: f.identity({ generation: 8 }) }).ok, false);
  t.diagnostic(JSON.stringify({ semanticAndByteMutantDenominator: mutations.length + 2, rejected: mutations.length + 2 }));
});
