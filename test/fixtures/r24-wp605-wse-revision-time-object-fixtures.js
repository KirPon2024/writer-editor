const anchor = (id, sceneId, quote) => ({
  anchorId: id,
  sceneId,
  startOffset: 0,
  endOffset: quote.length,
  quote,
  quoteHash: `quote:${id}`,
  sceneTextHash: `scene:${sceneId}`,
  evidenceState: 'current',
});

const WP605_PROJECT_ID = 'project-wp605-fixture';

const previousFacts = Object.freeze([
  Object.freeze({
    id: 'fact-location-key', projectId: WP605_PROJECT_ID, ledgerKind: 'location', sceneId: 'scene-1',
    subjectEntityId: 'object-key', relatedEntityIds: ['character-ava'], factLabel: 'Location', factValue: 'desk',
    promiseState: '', evidenceState: 'current', evidenceAnchor: anchor('anchor-key-desk', 'scene-1', 'The key waited on the desk.'), sourceHash: 'fact-key-v1',
  }),
  Object.freeze({
    id: 'fact-promise-door', projectId: WP605_PROJECT_ID, ledgerKind: 'promise', sceneId: 'scene-1',
    subjectEntityId: 'promise-door', relatedEntityIds: [], factLabel: 'Door', factValue: 'locked',
    promiseState: 'SETUP', evidenceState: 'current', evidenceAnchor: anchor('anchor-door', 'scene-1', 'The door was locked.'), sourceHash: 'fact-door-v1',
  }),
]);

const currentFacts = Object.freeze([
  Object.freeze({ ...previousFacts[0], sceneId: 'scene-2', factValue: 'Ava', evidenceAnchor: anchor('anchor-key-ava', 'scene-2', 'Ava pocketed the key.'), sourceHash: 'fact-key-v2' }),
  previousFacts[1],
  Object.freeze({
    id: 'fact-knowledge-map', projectId: WP605_PROJECT_ID, ledgerKind: 'knowledge', sceneId: 'scene-2',
    subjectEntityId: 'character-ava', relatedEntityIds: ['object-map'], factLabel: 'Map', factValue: 'decoded',
    promiseState: '', evidenceState: 'current', evidenceAnchor: anchor('anchor-map', 'scene-2', 'Ava decoded the map.'), sourceHash: 'fact-map-v1',
  }),
]);

const crypto = require('node:crypto');
const digest = (value) => `sha256:${crypto.createHash('sha256').update(String(value)).digest('hex')}`;

async function makeVerifiedTimeKnowledgeInput() {
  const [{ createAtlasBookSnapshot }, { compileAtlasTimeKnowledge }] = await Promise.all([
    import('../../src/core/atlas-book-snapshot-v1.mjs'),
    import('../../src/core/atlas-time-knowledge-v1.mjs'),
  ]);
  const snapshot = createAtlasBookSnapshot({
    projectId: WP605_PROJECT_ID,
    projectRevisionId: digest('wp605-project-revision'),
    manifestRevision: digest('wp605-manifest-revision'),
    sceneOrder: ['scene-1', 'scene-2'],
    sceneRevisionsById: { 'scene-1': digest('wp605-scene-1'), 'scene-2': digest('wp605-scene-2') },
    dependenciesBySceneId: { 'scene-1': [], 'scene-2': [] },
  });
  const currentSnapshotIdentity = {
    projectId: snapshot.projectId,
    projectRevisionId: snapshot.projectRevisionId,
    manifestRevision: snapshot.manifestRevision,
    orderDigest: snapshot.orderDigest,
    dependencyDigest: snapshot.dependencyDigest,
  };
  const scope = { projectId: snapshot.projectId, projectRevisionId: snapshot.projectRevisionId };
  const evidenceAnchors = [
    { anchorId: 'anchor-door', anchorLineageId: 'lineage-door', sceneId: 'scene-1', sceneRevision: snapshot.sceneRevisionsById['scene-1'], startOffset: 0, endOffset: 20 },
    { anchorId: 'anchor-map', anchorLineageId: 'lineage-map', sceneId: 'scene-2', sceneRevision: snapshot.sceneRevisionsById['scene-2'], startOffset: 0, endOffset: 20 },
  ];
  const cells = [
    { cellId: 'cell-map', propositionId: 'prop-map-decoded', perspectiveEntityId: 'character-ava', epistemicState: 'KNOWN', modality: 'ASSERTED', evidenceAnchorIds: ['anchor-map'], tripleTime: { storyTime: { certainty: 'EXACT', ordinal: 20 }, narrativeTime: { certainty: 'EXACT', ordinal: 1 }, knowledgeTime: { certainty: 'EXACT', ordinal: 20 } }, scope: { kind: 'SCENE', ...scope, sceneId: 'scene-2', sceneRevision: snapshot.sceneRevisionsById['scene-2'] } },
    { cellId: 'cell-door', propositionId: 'prop-door-locked', perspectiveEntityId: 'character-ava', epistemicState: 'KNOWN', modality: 'ASSERTED', evidenceAnchorIds: ['anchor-door'], tripleTime: { storyTime: { certainty: 'EXACT', ordinal: 10 }, narrativeTime: { certainty: 'EXACT', ordinal: 0 }, knowledgeTime: { certainty: 'APPROXIMATE', ordinal: 11 } }, scope: { kind: 'SCENE', ...scope, sceneId: 'scene-1', sceneRevision: snapshot.sceneRevisionsById['scene-1'] } },
  ];
  const timeKnowledgeProjection = compileAtlasTimeKnowledge({ snapshot, currentSnapshotIdentity, evidenceAnchors, cells });
  return { snapshot, currentSnapshotIdentity, timeKnowledgeProjection };
}

const objectCustodyEvents = Object.freeze([
  Object.freeze({ eventId: 'custody-key-1', projectId: WP605_PROJECT_ID, objectId: 'object-key', fromEntityId: '', toEntityId: 'character-ben', sceneId: 'scene-1', storyOrdinal: 10, evidenceAnchor: anchor('anchor-key-ben', 'scene-1', 'Ben held the key.') }),
  Object.freeze({ eventId: 'custody-key-2', projectId: WP605_PROJECT_ID, objectId: 'object-key', fromEntityId: 'character-ben', toEntityId: 'character-ava', sceneId: 'scene-2', storyOrdinal: 20, evidenceAnchor: anchor('anchor-key-ava', 'scene-2', 'Ava pocketed the key.') }),
]);

const retconProposal = Object.freeze({
  proposalId: 'retcon-map-hidden',
  operations: Object.freeze([
    Object.freeze({ kind: 'REMOVE', factId: 'fact-knowledge-map' }),
    Object.freeze({ kind: 'REPLACE', factId: 'fact-location-key', fact: Object.freeze({ ...currentFacts[0], factValue: 'Ben', evidenceAnchor: anchor('anchor-key-ben', 'scene-1', 'Ben held the key.') }) }),
  ]),
});

function makeWp605Input(overrides = {}) {
  return {
    projectId: WP605_PROJECT_ID,
    sourceRevision: 'revision-current',
    currentSourceRevision: 'revision-current',
    generation: 7,
    currentGeneration: 7,
    currentFacts,
    previousSnapshot: { projectId: WP605_PROJECT_ID, revisionId: 'revision-previous', facts: previousFacts },
    retconProposal,
    timeKnowledgeInput: null,
    objectCustodyEvents,
    rowLimit: 32,
    ...overrides,
  };
}

async function makeVerifiedWp605Input(overrides = {}) {
  return makeWp605Input({ timeKnowledgeInput: await makeVerifiedTimeKnowledgeInput(), ...overrides });
}

module.exports = { WP605_PROJECT_ID, previousFacts, currentFacts, objectCustodyEvents, retconProposal, makeWp605Input, makeVerifiedTimeKnowledgeInput, makeVerifiedWp605Input };
