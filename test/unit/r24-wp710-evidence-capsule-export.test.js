'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const f = require('../fixtures/r24-wp710-evidence-capsule-export-fixtures.js');
const load = () => import('../../src/core/evidence-capsule-export-v1.mjs');

test('WP710 creates deterministic Atlas WSE Pulse evidence metadata with honest availability', async () => {
  const api = await load();
  const original = f.clone(f.request());
  const result = api.createEvidenceCapsuleExport(original);
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.status, 'READY_FOR_CALLER_OWNED_LOCAL_ARTIFACT_EFFECT');
  assert.equal(result.envelope.body.familyId, 'EVIDENCE');
  assert.equal(result.envelope.body.payload.schemaVersion, api.EVIDENCE_CAPSULE_EXPORT_SCHEMA_VERSION);
  assert.deepEqual(result.envelope.body.payload.profiles.map((row) => [row.profileId, row.status, row.recordDenominator]), [
    ['ATLAS', 'AVAILABLE', 1],
    ['PULSE', 'UNAVAILABLE', 0],
    ['WSE', 'AVAILABLE', 2],
  ]);
  assert.deepEqual(result.envelope.body.payload.records.map((row) => `${row.profileId}:${row.evidenceId}`), [
    'ATLAS:atlas-1', 'WSE:wse-1', 'WSE:wse-2',
  ]);
  assert.deepEqual(result.envelope.body.payload.records[0].anchorIds, ['anchor-atlas-1-a', 'anchor-atlas-1-b']);
  assert.deepEqual(f.request(), original);
  const reordered = f.request({ records: [...f.request().records].reverse(), requestedProfiles: ['ATLAS', 'WSE', 'PULSE'] });
  assert.deepEqual(api.createEvidenceCapsuleExport(reordered).bytes, result.bytes);
});

test('WP710 roundtrip binds canonical bytes digest identity and zero authority', async () => {
  const api = await load(), result = api.createEvidenceCapsuleExport(f.request());
  const parsed = api.parseEvidenceCapsuleExport({ bytes: result.bytes, expectedIdentity: f.identity() });
  assert.equal(parsed.ok, true, JSON.stringify(parsed));
  assert.equal(parsed.status, 'VERIFIED_READ_ONLY_EVIDENCE_CAPSULE');
  assert.equal(parsed.sha256, result.sha256);
  assert.equal(parsed.byteLength, result.byteLength);
  assert.deepEqual(parsed.envelope, result.envelope);
  for (const value of [result, parsed, result.envelope.body.payload.policy]) {
    assert.equal(value.productMutationAuthority, false);
    assert.equal(value.providerAuthority, false);
    assert.equal(value.commandAuthority, false);
    assert.equal(value.pathAuthority, false);
  }
  assert.equal(result.artifactPublished, false);
  assert.equal(parsed.artifactPublished, false);
  assert.equal(result.envelope.body.payload.policy.sourceContentIncluded, false);
  assert.equal(result.envelope.body.payload.policy.secretMaterialIncluded, false);
});

test('WP710 rejects stale source and record identities before publishing bytes', async t => {
  const api = await load();
  const cases = [
    ['expected generation', { expectedIdentity: f.identity({ generation: 8 }) }],
    ['expected project', { expectedIdentity: f.identity({ projectId: 'foreign-project' }) }],
    ['expected revision', { expectedIdentity: f.identity({ sourceRevision: 'foreign-revision' }) }],
    ['record generation', { records: [f.record('ATLAS', 'atlas-1', { generation: 8 })] }],
    ['record project', { records: [f.record('ATLAS', 'atlas-1', { projectId: 'foreign-project' })] }],
    ['record revision', { records: [f.record('ATLAS', 'atlas-1', { sourceRevision: 'foreign-revision' })] }],
  ];
  for (const [name, overrides] of cases) {
    const denied = api.createEvidenceCapsuleExport(f.request(overrides));
    assert.equal(denied.ok, false, name);
    assert.equal(denied.artifactPublished, false, name);
  }
  t.diagnostic(JSON.stringify({ staleIdentityDenominator: cases.length, rejected: cases.length }));
});

test('WP710 preserves requested unavailable profiles without inventing evidence', async () => {
  const api = await load();
  const result = api.createEvidenceCapsuleExport(f.request({ records: [], requestedProfiles: ['PULSE'] }));
  assert.equal(result.ok, true);
  assert.deepEqual(result.envelope.body.payload.counts, {
    availableProfileDenominator: 0,
    profileDenominator: 1,
    recordDenominator: 0,
    unavailableProfileDenominator: 1,
  });
  assert.deepEqual(result.envelope.body.payload.profiles[0], {
    evidenceDigestSetSha256: '4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945',
    profileId: 'PULSE',
    recordDenominator: 0,
    status: 'UNAVAILABLE',
  });
});
