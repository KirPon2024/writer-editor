'use strict';
const crypto = require('node:crypto');

const identity = (overrides = {}) => ({
  entityId: 'synthetic-session-710',
  generation: 7,
  projectId: 'synthetic-project-710',
  sourceRevision: 'synthetic-revision-710',
  ...overrides,
});
const digest = (value) => crypto.createHash('sha256').update(String(value)).digest('hex');
const record = (profileId, evidenceId, overrides = {}) => ({
  anchorIds: [`anchor-${evidenceId}-b`, `anchor-${evidenceId}-a`],
  evidenceDigest: digest(`${profileId}:${evidenceId}`),
  evidenceId,
  evidenceKind: `${profileId.toLowerCase()}-evidence`,
  generation: 7,
  profileId,
  projectId: 'synthetic-project-710',
  sourceRevision: 'synthetic-revision-710',
  status: 'CURRENT',
  ...overrides,
});
const request = (overrides = {}) => ({
  capsuleId: 'synthetic-capsule-710',
  currentIdentity: identity(),
  expectedIdentity: identity(),
  records: [record('WSE', 'wse-2'), record('ATLAS', 'atlas-1'), record('WSE', 'wse-1')],
  requestedProfiles: ['WSE', 'PULSE', 'ATLAS'],
  ...overrides,
});
const clone = (value) => structuredClone(value);

module.exports = { clone, digest, identity, record, request };
