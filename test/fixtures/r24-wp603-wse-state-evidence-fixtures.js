'use strict';
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const ROOT = path.resolve(__dirname, '../..');
const importRepo = (relative) => import(pathToFileURL(path.join(ROOT, relative)).href);
const clone = (value) => JSON.parse(JSON.stringify(value));

function anchor(sceneId, factId, quote, sceneText, hash) {
  const startOffset = sceneText.indexOf(quote);
  return {
    schemaVersion: 'atlas.evidenceAnchor.v1',
    anchorId: 'anchor-' + factId,
    projectId: 'wp603-project',
    sceneId,
    entityId: factId.includes('mira') ? 'entity-mira' : 'entity-anna',
    startOffset,
    endOffset: startOffset + quote.length,
    quote,
    quoteHash: hash(quote),
    sceneTextHash: hash(sceneText),
  };
}

async function fixture() {
  const api = await importRepo('src/core/wse-state-evidence-v1.mjs');
  const hashApi = await importRepo('src/core/browser-safe-hash.mjs');
  const hash = hashApi.hashCanonicalValue;
  const sceneA = 'Anna is at the gate. Anna promised Mira she would return.';
  const sceneB = 'Mira knows the key is below the clock.';
  const facts = [
    { id: 'location-anna', projectId: 'wp603-project', ledgerKind: 'location', sceneId: 'scene-a', subjectEntityId: 'entity-anna', relatedEntityIds: [], factLabel: 'Anna location', factValue: 'gate', promiseState: '', evidenceState: 'current', source: 'author', sourceHash: hash('location-anna'), evidenceAnchor: anchor('scene-a', 'location-anna', 'Anna is at the gate', sceneA, hash) },
    { id: 'promise-anna', projectId: 'wp603-project', ledgerKind: 'promise', sceneId: 'scene-a', subjectEntityId: 'entity-anna', relatedEntityIds: ['entity-mira'], factLabel: 'Return promise', factValue: 'return', promiseState: 'open', evidenceState: 'current', source: 'author', sourceHash: hash('promise-anna'), evidenceAnchor: anchor('scene-a', 'promise-anna', 'promised Mira she would return', sceneA, hash) },
    { id: 'knowledge-mira', projectId: 'wp603-project', ledgerKind: 'knowledge', sceneId: 'scene-b', subjectEntityId: 'entity-mira', relatedEntityIds: ['entity-key'], factLabel: 'Key location', factValue: 'below the clock', promiseState: '', evidenceState: 'current', source: 'author', sourceHash: hash('knowledge-mira'), evidenceAnchor: anchor('scene-b', 'knowledge-mira', 'Mira knows the key is below the clock', sceneB, hash) },
    { id: 'object-key', projectId: 'wp603-project', ledgerKind: 'object', sceneId: 'scene-b', subjectEntityId: 'entity-key', relatedEntityIds: ['entity-mira'], factLabel: 'Key owner', factValue: 'Mira', promiseState: '', evidenceState: 'staleOrMissing', source: 'author', sourceHash: hash('object-key'), evidenceAnchor: { ...anchor('scene-b', 'object-key', 'key is below the clock', sceneB, hash), sceneTextHash: hash('changed') } },
  ];
  const continuityRows = [{ id: 'finding-promise', rowKind: 'finding', findingKind: 'PROMISE_OPEN', severity: 'warning', summary: 'Anna still owes Mira a return.', sceneIds: ['scene-a'], evidenceRows: [{ ...facts[1].evidenceAnchor, factId: facts[1].id, ledgerKind: 'promise', evidenceState: 'current' }] }];
  return { api, hash, facts, continuityRows, projectId: 'wp603-project', sceneA, sceneB };
}

module.exports = { ROOT, clone, fixture, importRepo };
