'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const f = require('../fixtures/r24-wp710-evidence-capsule-export-fixtures.js');
const load = () => import('../../src/core/evidence-capsule-export-v1.mjs');

test('WP710 caller-owned effect writes closes and reopens one disposable exact artifact', async t => {
  const api = await load(), created = api.createEvidenceCapsuleExport(f.request());
  assert.equal(created.ok, true);
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'yalken-wp710-'));
  const artifact = path.join(directory, 'synthetic-evidence-capsule.json');
  try {
    fs.writeFileSync(artifact, created.bytes, { flag: 'wx' });
    const stat = fs.statSync(artifact);
    assert.equal(stat.size, created.byteLength);
    const reopened = fs.readFileSync(artifact);
    assert.equal(crypto.createHash('sha256').update(reopened).digest('hex'), created.sha256);
    const parsed = api.parseEvidenceCapsuleExport({ bytes: reopened, expectedIdentity: f.identity() });
    assert.equal(parsed.ok, true, JSON.stringify(parsed));
    assert.equal(parsed.payload.counts.recordDenominator, 3);
    assert.equal(parsed.payload.profiles.find((row) => row.profileId === 'PULSE').status, 'UNAVAILABLE');
    t.diagnostic(JSON.stringify({ physicalArtifacts: 1, writes: 1, closes: 1, reopens: 1, exactDigestComparisons: 1, realOwnerDocuments: 0 }));
  } finally {
    fs.rmSync(directory, { recursive: true });
  }
});

test('WP710 bounded corpus exports every admitted profile combination without source content', async t => {
  const api = await load();
  const combinations = [
    ['ATLAS'], ['PULSE'], ['WSE'], ['ATLAS', 'PULSE'], ['ATLAS', 'WSE'], ['PULSE', 'WSE'], ['ATLAS', 'PULSE', 'WSE'],
  ];
  let records = 0;
  for (const profiles of combinations) {
    const selected = profiles.filter((profileId) => profileId !== 'PULSE');
    const source = selected.flatMap((profileId, index) => [
      f.record(profileId, `${profileId.toLowerCase()}-${index}-a`),
      f.record(profileId, `${profileId.toLowerCase()}-${index}-b`, { status: index % 2 ? 'UNKNOWN' : 'CURRENT' }),
    ]);
    const result = api.createEvidenceCapsuleExport(f.request({ requestedProfiles: profiles, records: source }));
    assert.equal(result.ok, true, profiles.join(','));
    const parsed = api.parseEvidenceCapsuleExport({ bytes: result.bytes, expectedIdentity: f.identity() });
    assert.equal(parsed.ok, true);
    assert.equal(parsed.payload.counts.profileDenominator, profiles.length);
    assert.equal(parsed.payload.counts.recordDenominator, source.length);
    assert(!result.bytes.includes(Buffer.from('manuscript')));
    assert(!result.bytes.includes(Buffer.from('password')));
    records += source.length;
  }
  t.diagnostic(JSON.stringify({ profileCombinationDenominator: combinations.length, exportedRecordDenominator: records }));
});
