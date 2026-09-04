const crypto = require('node:crypto');

const sha = (value) => crypto.createHash('sha256').update(String(value)).digest('hex');
const PROJECT_ID = 'project-wp607-fixture';
const SOURCE_REVISION = 'revision-wp607-current';
const GENERATION = 11;

function moduleRow(moduleId, overrides = {}) {
  return {
    moduleId,
    projectId: PROJECT_ID,
    sourceRevision: SOURCE_REVISION,
    generation: GENERATION,
    projectionDigest: sha(moduleId),
    state: 'ready',
    inputCount: 8,
    maxViewVisibleCount: 4,
    visibleCount: 12,
    omittedCount: 0,
    ...overrides,
  };
}

function makeWp607Input(overrides = {}) {
  const currentIdentity = { projectId: PROJECT_ID, sourceRevision: SOURCE_REVISION, generation: GENERATION };
  return {
    currentIdentity,
    expectedIdentity: { ...currentIdentity },
    modules: [
      moduleRow('stateEvidence'),
      moduleRow('threadsExplanation'),
      moduleRow('revisionTimeObject'),
      moduleRow('seriesMultiLayer'),
    ],
    rowLimit: 4,
    ...overrides,
  };
}

module.exports = { GENERATION, PROJECT_ID, SOURCE_REVISION, makeWp607Input, moduleRow, sha };
