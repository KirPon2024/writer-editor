'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const claimPromise = import('../../src/core/pulse-claim-v1.mjs');
const historyPromise = import('../../src/core/descriptive-history-v1.mjs');
const { fixture: historyFixture } = require('../fixtures/r24-wp803-descriptive-history-fixtures.js');
const { seedPulseClaimDirectory } = require('../fixtures/r24-wp806-pulse-claim-fixtures.js');

const directory = t => {
  const value = fs.mkdtempSync(path.join(os.tmpdir(), 'yalken-wp806-unit-'));
  t.after(() => fs.rmSync(value, { recursive: true, force: true }));
  return value;
};

test('WP806 leaves an opted-out directory unread and reports the privacy boundary', async t => {
  const root = directory(t);
  const missing = path.join(root, 'missing-pulse');
  const { readPulseClaimProjection } = await claimPromise;
  const projection = await readPulseClaimProjection(missing);
  assert.equal(projection.state, 'optedOut');
  assert.equal(projection.privacy.collectionStatus, 'OPTED_OUT');
  assert.equal(projection.claims[0].reason, 'OPTED_OUT_HISTORY_NOT_READ');
  assert.equal(fs.existsSync(missing), false);
  assert(Object.isFrozen(projection));
});

test('WP806 exposes bounded aggregate revision rows with explicit missing values', async t => {
  const root = directory(t);
  await seedPulseClaimDirectory(root);
  const { readPulseClaimProjection } = await claimPromise;
  const projection = await readPulseClaimProjection(root);
  assert.equal(projection.state, 'degraded');
  assert.equal(projection.summary.totalRows, 2);
  assert.equal(projection.rows[0].added.value, 0);
  assert.equal(projection.rows[0].deleted.value, 0);
  assert.equal(projection.rows[0].net.value, 0);
  assert.equal(projection.rows[0].sceneEdits.status, 'NOT_RECORDED');
  assert.equal(projection.rows[0].sceneEdits.value, null);
  assert.equal(projection.rows[0].declaredTasks.status, 'NOT_RECORDED');
  assert.equal(projection.rows[1].sourceRevisionOrdinal, 12);
});

test('WP806 distinguishes descriptive facts from productivity or effort scores', async t => {
  const root = directory(t);
  await seedPulseClaimDirectory(root);
  const { readPulseClaimProjection } = await claimPromise;
  const projection = await readPulseClaimProjection(root);
  assert.deepEqual(projection.claims.find(row => row.id === 'DESCRIPTIVE_ONLY'), {
    id: 'DESCRIPTIVE_ONLY', status: 'PASS', reason: 'NO_PRODUCTIVITY_OR_EFFORT_SCORE',
  });
  const serialized = JSON.stringify(projection);
  for (const forbidden of ['productivityScore', 'effortScore', 'projectId', 'userId', '/Users/', '/Volumes/']) assert(!serialized.includes(forbidden));
});

test('WP806 enforces the visible row budget and preserves the true denominator', async t => {
  const root = directory(t);
  await seedPulseClaimDirectory(root);
  const { readPulseClaimProjection } = await claimPromise;
  const projection = await readPulseClaimProjection(root, { rowLimit: 1 });
  assert.equal(projection.rows.length, 1);
  assert.deepEqual(projection.summary, { totalRows: 2, visibleRows: 1, omittedRows: 1, recordedFields: 5, partialFields: 0, notRecordedFields: 2 });
  await assert.rejects(() => readPulseClaimProjection(root, { rowLimit: 65 }), error => error.code === 'E_WP806_ROW_LIMIT');
});

test('WP806 rejects stale and tampered descriptive history identities', async t => {
  const { input } = await historyFixture(t);
  const { buildPulseDescriptiveHistory } = await historyPromise;
  const { buildPulseClaim } = await claimPromise;
  const historyProjection = buildPulseDescriptiveHistory(input);
  const privacyState = { collectionStatus: 'OPTED_IN' };
  assert.throws(() => buildPulseClaim({ historyProjection, currentIdentity: { ...input.currentIdentity, generation: 99 }, privacyState }), error => error.code === 'E_WP803_PROJECTION_STALE');
  const tampered = structuredClone(historyProjection);
  tampered.rows[0].added.value += 1;
  assert.throws(() => buildPulseClaim({ historyProjection: tampered, currentIdentity: input.currentIdentity, privacyState }), error => error.code === 'E_WP803_PROJECTION_TAMPER');
});

test('WP806 returns a deeply immutable projection with read-only authority', async t => {
  const root = directory(t);
  await seedPulseClaimDirectory(root);
  const { readPulseClaimProjection } = await claimPromise;
  const projection = await readPulseClaimProjection(root);
  assert(Object.isFrozen(projection.rows));
  assert(Object.isFrozen(projection.rows[0].added));
  assert.deepEqual(projection.authority, {
    readOnly: true, explicitOpenRequired: true, productMutation: false, manuscriptMutation: false,
    storageMutation: false, networkMutation: false, rendererPathAuthority: false,
  });
});
