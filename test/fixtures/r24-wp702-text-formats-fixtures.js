'use strict';

function identity(overrides = {}) {
  return {
    entityId: 'scene-wp702-001',
    generation: 12,
    projectId: 'project-wp702-001',
    sourceRevision: 'revision-wp702-001',
    ...overrides,
  };
}

function parseInput(profileId, text, identityOverrides = {}) {
  return { bytes: Buffer.from(text, 'utf8'), identity: identity(identityOverrides), profileId };
}

const legitimateUnicode = 'Hello, мир — Καλημέρα — café — 日本語 — हिन्दी.\n';
const markdown = '# Title\n\nHello, **bounded** world.\n\n- alpha\n- beta\n';

module.exports = { identity, legitimateUnicode, markdown, parseInput };
