'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const MODEL_PATH = path.join(REPO_ROOT, 'scripts', 'ops', 'black-box-synthetic-independent-restore-drill-v1-model.mjs');
const PHYSICAL_PATH = path.join(REPO_ROOT, 'scripts', 'ops', 'black-box-synthetic-independent-restore-drill-v1-physical.mjs');

async function loadModel() {
  return import(pathToFileURL(MODEL_PATH).href);
}

test('F3 synthetic independent restore drill v1 has a closed model/oracle harness', async () => {
  const model = await loadModel();
  assert.equal(typeof model.runBlackBoxSyntheticIndependentRestoreDrillV1Model, 'function');
  const result = model.runBlackBoxSyntheticIndependentRestoreDrillV1Model();
  assert.equal(result.ok, true);
  assert.deepEqual(result.summary, {
    finiteCases: 36,
    hostileCases: 18,
    semanticMutants: 12,
    mutationSurvivors: 0,
  });
  assert.equal(result.failures.length, 0);
  assert.equal(result.survivingMutants.length, 0);
});

test('F3 synthetic independent restore drill v1 physical harness is disposable and user-document forbidden', async () => {
  const script = await fs.readFile(PHYSICAL_PATH, 'utf8');
  assert.match(script, /F3_BLACK_BOX_SYNTHETIC_INDEPENDENT_RESTORE_DRILL_V1/u);
  assert.match(script, /userDocumentsTouched: false/u);
  assert.match(script, /liveProjectOverwrite: false/u);
  assert.doesNotMatch(script, /\/Users\/|Documents\/|Desktop\//u);
  assert.doesNotMatch(script, /rm\s+-rf|reset\s+--hard|git\s+clean/u);
});
