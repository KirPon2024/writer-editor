const assert = require('node:assert/strict');
const test = require('node:test');
const { makeWp605Input, makeVerifiedWp605Input } = require('../fixtures/r24-wp605-wse-revision-time-object-fixtures.js');

const mutants = [
  ['stale revision', { currentSourceRevision: 'revision-late' }, /E_WP605_STALE_IDENTITY/u],
  ['stale generation', { currentGeneration: 8 }, /E_WP605_STALE_IDENTITY/u],
  ['cross-project baseline', { previousSnapshot: { projectId: 'other', revisionId: 'r', facts: [] } }, /E_WP605_PROJECT_IDENTITY/u],
  ['time verification envelope malformed', { timeKnowledgeInput: { projection: {}, verification: { status: 'FAIL' } } }, /E_WP605_UNKNOWN_OR_MISSING_FIELD/u],
  ['custody cross-project', { objectCustodyEvents: [{ eventId: 'e', projectId: 'other', objectId: 'o', fromEntityId: '', toEntityId: 'x', storyOrdinal: 1 }] }, /E_WP605_PROJECT_IDENTITY/u],
  ['retcon unknown kind', { retconProposal: { proposalId: 'p', operations: [{ kind: 'APPLY', factId: 'x' }] } }, /E_WP605_RETCON_KIND/u],
  ['retcon missing remove target', { retconProposal: { proposalId: 'p', operations: [{ kind: 'REMOVE', factId: 'missing' }] } }, /E_WP605_RETCON_TARGET_MISSING/u],
  ['retcon duplicate target', { retconProposal: { proposalId: 'p', operations: [{ kind: 'REMOVE', factId: 'fact-location-key' }, { kind: 'REMOVE', factId: 'fact-location-key' }] } }, /E_WP605_RETCON_DUPLICATE_TARGET/u],
  ['unknown input authority', { writeProject: true }, /E_WP605_UNKNOWN_INPUT_KEY/u],
];

test('WP605 rejects all registered stale, authority and semantic mutants', async () => {
  const { buildWseRevisionTimeObject } = await import('../../src/core/wse-revision-time-object-v1.mjs');
  for (const [name, overrides, expected] of mutants) {
    const input = await makeVerifiedWp605Input(overrides);
    assert.throws(() => buildWseRevisionTimeObject(input), expected, name);
  }
  const tamperedTime = await makeVerifiedWp605Input();
  tamperedTime.timeKnowledgeInput = JSON.parse(JSON.stringify(tamperedTime.timeKnowledgeInput));
  tamperedTime.timeKnowledgeInput.timeKnowledgeProjection.cells[0].epistemicState = 'DISBELIEVED';
  assert.throws(() => buildWseRevisionTimeObject(tamperedTime), /E_WP605_TIME_VERIFICATION/u);
  const accessor = makeWp605Input();
  Object.defineProperty(accessor, 'writeProject', { enumerable: true, get() { return true; } });
  assert.throws(() => buildWseRevisionTimeObject(accessor), /E_WP605_INPUT_ACCESSOR/u);
  const symbol = makeWp605Input();
  symbol[Symbol('authority')] = true;
  assert.throws(() => buildWseRevisionTimeObject(symbol), /E_WP605_INPUT_SYMBOL/u);
});

test('WP605 marks a broken custody chain unknown instead of guessing a holder', async () => {
  const { buildWseRevisionTimeObject } = await import('../../src/core/wse-revision-time-object-v1.mjs');
  const input = await makeVerifiedWp605Input();
  input.objectCustodyEvents = input.objectCustodyEvents.map((event, index) => index === 1 ? { ...event, fromEntityId: 'character-other' } : event);
  const value = buildWseRevisionTimeObject(input);
  assert.equal(value.views.objectCustody.rows[0].status, 'UNKNOWN');
  assert.equal(value.views.objectCustody.rows[0].currentHolderEntityId, '');
  assert.equal(value.views.objectCustody.rows[0].reason, 'CUSTODY_CHAIN_GAP_OR_CONFLICT');
});
