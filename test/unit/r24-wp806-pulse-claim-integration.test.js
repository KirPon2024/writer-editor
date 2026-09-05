'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const test = require('node:test');
const { pathToFileURL } = require('node:url');
const claimPromise = import('../../src/core/pulse-claim-v1.mjs');
const presentationPromise = import('../../src/renderer/pulseHistoryPresentationModel.mjs');
const { directoryBytes, seedPulseClaimDirectory } = require('../fixtures/r24-wp806-pulse-claim-fixtures.js');

const directory = t => {
  const value = fs.mkdtempSync(path.join(os.tmpdir(), 'yalken-wp806-integration-'));
  t.after(() => fs.rmSync(value, { recursive: true, force: true }));
  return value;
};

test('WP806 reads local history without changing any persisted byte', async t => {
  const root = directory(t);
  await seedPulseClaimDirectory(root);
  const before = directoryBytes(root);
  const { readPulseClaimProjection } = await claimPromise;
  const projection = await readPulseClaimProjection(root);
  const after = directoryBytes(root);
  assert.equal(projection.rows.length, 2);
  assert.deepEqual(Object.keys(after), Object.keys(before));
  for (const [basename, bytes] of Object.entries(before)) assert(after[basename].equals(bytes), basename);
});

test('WP806 reopens the aggregate history in a fresh exact runtime process', async t => {
  const root = directory(t);
  await seedPulseClaimDirectory(root);
  const moduleUrl = pathToFileURL(path.resolve('src/core/pulse-claim-v1.mjs')).href;
  const script = `import {readPulseClaimProjection} from ${JSON.stringify(moduleUrl)}; process.stdout.write(JSON.stringify(await readPulseClaimProjection(process.argv[1])));`;
  const reopened = JSON.parse(execFileSync(process.execPath, ['--input-type=module', '--eval', script, root], { encoding: 'utf8' }));
  assert.equal(reopened.state, 'degraded');
  assert.equal(reopened.summary.totalRows, 2);
  assert.equal(reopened.rows[0].added.value, 0);
  assert.equal(reopened.rows[0].declaredTasks.status, 'NOT_RECORDED');
});

test('WP806 presentation preserves zero, missing, provenance and denominators', async t => {
  const root = directory(t);
  await seedPulseClaimDirectory(root);
  const { readPulseClaimProjection } = await claimPromise;
  const { normalizePulseHistoryPresentation } = await presentationPromise;
  const presentation = normalizePulseHistoryPresentation(await readPulseClaimProjection(root));
  assert.equal(presentation.statusText, '2 of 2 revisions shown · 5 complete · 0 partial · 2 not recorded');
  const added = presentation.rows[0].metrics.find(row => row.id === 'added');
  const missing = presentation.rows[0].metrics.find(row => row.id === 'sceneEdits');
  assert.deepEqual({ displayValue: added.displayValue, provenance: added.provenance }, { displayValue: '0', provenance: 'LEDGER_AGGREGATE' });
  assert.deepEqual({ displayValue: missing.displayValue, provenance: missing.provenance }, { displayValue: 'Not recorded', provenance: '' });
});

test('WP806 presents opt-out without consuming fabricated history rows', async () => {
  const { normalizePulseHistoryPresentation } = await presentationPromise;
  const presentation = normalizePulseHistoryPresentation({ state: 'optedOut', privacy: { collectionStatus: 'OPTED_OUT', aggregateOnly: true }, rows: [{ sequence: 99 }] });
  assert.equal(presentation.state, 'optedOut');
  assert.equal(presentation.statusText, 'Writing history is off. Local history remains unread.');
  assert.equal(presentation.privacyStatus, 'OPTED_OUT');
});

test('WP806 main bridge owns the fixed Pulse directory and renderer receives no path authority', () => {
  const main = fs.readFileSync(path.resolve('src/main.js'), 'utf8');
  const renderer = fs.readFileSync(path.resolve('src/renderer/editor.js'), 'utf8');
  assert.match(main, /readPulseClaimProjection\(path\.join\(app\.getPath\('userData'\), 'pulse'\)\)/u);
  assert.doesNotMatch(main.slice(main.indexOf('async function handleWorkspaceAtlasContinuityLedgerSurfaceQuery'), main.indexOf('async function handleWorkspaceAtlasReportsSavedQueriesQuery')), /safePayload\.(?:path|directory|root)/u);
  assert.match(renderer, /setAttribute\('role', 'list'\)/u);
  assert.match(renderer, /setAttribute\('role', 'listitem'\)/u);
  assert.match(renderer, /appendPulseHistory\(atlasContinuityLedgerHost, state\.pulseClaim\)/u);
});

test('WP806 read-only readers reject a symlink directory before reading history', async t => {
  const root = directory(t);
  const target = path.join(root, 'target');
  const link = path.join(root, 'link');
  await seedPulseClaimDirectory(target);
  fs.symlinkSync(target, link, 'dir');
  const { readPulseClaimProjection } = await claimPromise;
  await assert.rejects(() => readPulseClaimProjection(link), error => error.code === 'E_WP806_PRIVACY_DIRECTORY');
});
