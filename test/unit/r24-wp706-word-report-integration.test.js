'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { ROOT, baseInput, read } = require('../fixtures/r24-wp706-word-report-fixtures.js');

const MODULE = path.join(ROOT, 'scripts/ops/r24/word-report-wp706.mjs');
const load = () => import(`${pathToFileURL(MODULE).href}?v=${Date.now()}-${Math.random()}`);

test('WP706 repository integration binds the current committed C1 and V2 carriers without invoking Word', async () => {
  const c = await load();
  const input = c.repositoryInput(ROOT);
  input.repoState.dirty = false;
  input.expectedHeadSha = input.repoState.headSha;
  input.expectedOriginMainSha = input.repoState.originMainSha;
  const result = c.compileWordReport(input);
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.report.physicalSource.physicalHeadSha, '8504d5fa8db9af9456cc6a6d0ec8b1aa8ad4d81a');
  assert.equal(result.report.harnessQualification.receiptContractValid, true);
  assert.equal(result.report.harnessQualification.matrixBindingValid, true);
  assert.equal(result.report.authority.userDocumentsRead, 0);
  assert.equal(result.report.authority.userDocumentsMutated, 0);
});

test('WP706 integration rejects C1 matrix laundering and false route completion', async () => {
  const c = await load();
  const matrix = read('docs/OPS/RTK/YALKEN_INTEROP_CHAIN_MATRIX_V1.json');
  matrix.routeDenominator.find(row => row.routeId === 'C1').routeVerdict = 'PASS';
  assert.equal(c.compileWordReport(baseInput(c, { c1Matrix: matrix })).code, 'E_R24_WP706_C1_MATRIX_INVALID');
  const receipt = read('docs/OPS/RTK/YALKEN_INTEROP_C1_WORD_FULLBOOK_ROUTE_RECEIPT_V1.json');
  receipt.route.routeVerdict = 'PASS';
  assert.equal(c.compileWordReport(baseInput(c, { c1Receipt: receipt })).code, 'E_R24_WP706_C1_RECEIPT_INVALID');
});

test('WP706 integration rejects predecessor and scientific-claim drift', async () => {
  const c = await load();
  const predecessor = read('docs/OPS/R24/CORRECTIVE/V2_EFFECTIVE_STATE_V1.json');
  predecessor.wordProfileVerdict = 'PASS';
  assert.equal(c.compileWordReport(baseInput(c, { v2EffectiveState: predecessor })).code, 'E_R24_WP706_V2_PREDECESSOR_STATE');
  const contracts = read('docs/OPS/EVIDENCE/YALKEN_SCIENTIFIC_ASSURANCE_PROGRAM_R1/SCIENTIFIC_CONTRACTS.json');
  contracts.claims.find(row => row.claimId === 'CLM_WORD_ROUNDTRIP').currentVerdict = 'PASS';
  assert.equal(c.compileWordReport(baseInput(c, { scientificContracts: contracts })).code, 'E_R24_WP706_WORD_CONTRACT_BLOCKED_REQUIRED');
});
