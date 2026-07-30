const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

async function loadModule(relativePath) {
  const fileUrl = pathToFileURL(path.join(process.cwd(), relativePath)).href;
  return import(fileUrl);
}

async function buildContinuityFindingsFixture() {
  const runtime = await loadModule(path.join('src', 'core', 'runtime.mjs'));
  const derived = await loadModule(path.join('src', 'derived', 'index.mjs'));
  const projectId = 'atlas-continuity-findings-project';
  const sceneAId = 'scene-a';
  const sceneBId = 'scene-b';
  const sceneCId = 'scene-c';
  const created = runtime.applyCoreSequence(runtime.createInitialCoreState(), [
    {
      type: runtime.CORE_COMMAND_IDS.PROJECT_CREATE,
      payload: { projectId, title: 'Atlas continuity findings', sceneId: sceneAId },
    },
    {
      type: runtime.CORE_COMMAND_IDS.PROJECT_APPLY_TEXT_EDIT,
      payload: {
        projectId,
        sceneId: sceneAId,
        text: 'Anna promises Mira she will return, but later she breaks that promise.',
      },
    },
    {
      type: runtime.CORE_COMMAND_IDS.ATLAS_ENTITY_CREATE,
      payload: { projectId, entityId: 'entity-anna', name: 'Anna', entityKind: 'character' },
    },
    {
      type: runtime.CORE_COMMAND_IDS.ATLAS_ENTITY_CREATE,
      payload: { projectId, entityId: 'entity-mira', name: 'Mira', entityKind: 'character' },
    },
    {
      type: runtime.CORE_COMMAND_IDS.ATLAS_ENTITY_CREATE,
      payload: { projectId, entityId: 'entity-key', name: 'Key', entityKind: 'object' },
    },
  ]);
  assert.equal(created.ok, true);
  const state = JSON.parse(JSON.stringify(created.state));
  state.data.projects[projectId].scenes[sceneBId] = {
    id: sceneBId,
    title: 'Key',
    text: 'Mira knows the key is hidden. Mira does not know the key is hidden. The key is with Mira, although another note says the key is locked away.',
  };
  state.data.projects[projectId].scenes[sceneCId] = {
    id: sceneCId,
    title: 'Market',
    text: 'Anna is in the market, but the ledger also says Anna is in the blue room. Mira is missing from the market, then Mira appears at the gate.',
  };
  return { runtime, derived, projectId, sceneAId, sceneBId, sceneCId, state };
}

function evidenceAnchorFor(runtime, state, projectId, sceneId, entityId, quote, anchorId) {
  const text = state.data.projects[projectId].scenes[sceneId].text;
  const startOffset = text.indexOf(quote);
  assert.notEqual(startOffset, -1, quote);
  const endOffset = startOffset + quote.length;
  return {
    schemaVersion: 'atlas.evidenceAnchor.v1',
    anchorId,
    projectId,
    sceneId,
    entityId,
    startOffset,
    endOffset,
    quote,
    quoteHash: runtime.hashCoreState(quote),
    sceneTextHash: runtime.hashCoreState(text),
  };
}

function factCommand(runtime, state, projectId, sceneId, subjectEntityId, ledgerKind, factId, factLabel, factValue, quote, extra = {}) {
  return {
    type: runtime.CORE_COMMAND_IDS.ATLAS_CONTINUITY_FACT_RECORD,
    payload: {
      projectId,
      ledgerKind,
      factId,
      sceneId,
      subjectEntityId,
      factLabel,
      factValue,
      evidenceAnchor: evidenceAnchorFor(runtime, state, projectId, sceneId, subjectEntityId, quote, `anchor-${factId}`),
      ...extra,
    },
  };
}

function nodeCapabilitySnapshot() {
  return {
    platformId: 'node',
    capabilities: {
      atlasContinuityFactLedgers: true,
      atlasContinuityFindings: true,
    },
  };
}

test('E06 C05: continuity findings derive evidence-backed promise disappearance and contradiction packets without mutation', async () => {
  const { runtime, derived, projectId, sceneAId, sceneBId, sceneCId, state } = await buildContinuityFindingsFixture();
  const beforeHash = runtime.hashCoreState(state);
  const recorded = runtime.applyCoreSequence(state, [
    factCommand(runtime, state, projectId, sceneAId, 'entity-anna', 'promise', 'promise-open', 'Return promise', 'Anna promises Mira she will return', 'promises Mira she will return', { promiseState: 'open', relatedEntityIds: ['entity-mira'] }),
    factCommand(runtime, state, projectId, sceneAId, 'entity-anna', 'promise', 'promise-broken', 'Return promise', 'Anna promises Mira she will return', 'breaks that promise', { promiseState: 'broken', relatedEntityIds: ['entity-mira'] }),
    factCommand(runtime, state, projectId, sceneBId, 'entity-mira', 'knowledge', 'knowledge-knows', 'Mira key knowledge', 'knows key location', 'Mira knows the key is hidden', { relatedEntityIds: ['entity-key'] }),
    factCommand(runtime, state, projectId, sceneBId, 'entity-mira', 'knowledge', 'knowledge-not-knows', 'Mira key knowledge', 'does not know key location', 'Mira does not know the key is hidden', { relatedEntityIds: ['entity-key'] }),
    factCommand(runtime, state, projectId, sceneBId, 'entity-key', 'object', 'object-with-mira', 'Key state', 'with Mira', 'key is with Mira', { relatedEntityIds: ['entity-mira'] }),
    factCommand(runtime, state, projectId, sceneBId, 'entity-key', 'object', 'object-locked', 'Key state', 'locked away', 'key is locked away'),
    factCommand(runtime, state, projectId, sceneCId, 'entity-anna', 'location', 'location-market', 'Anna location', 'market', 'Anna is in the market'),
    factCommand(runtime, state, projectId, sceneCId, 'entity-anna', 'location', 'location-blue-room', 'Anna location', 'blue room', 'Anna is in the blue room'),
    factCommand(runtime, state, projectId, sceneCId, 'entity-mira', 'location', 'location-mira-missing', 'Mira location', 'missing', 'Mira is missing from the market'),
    factCommand(runtime, state, projectId, sceneCId, 'entity-mira', 'location', 'location-mira-gate', 'Mira location', 'gate', 'Mira appears at the gate'),
  ]);
  assert.equal(recorded.ok, true);
  const result = derived.deriveAtlasContinuityFindings({
    coreState: recorded.state,
    params: { projectId },
    capabilitySnapshot: nodeCapabilitySnapshot(),
  });
  assert.equal(result.ok, true);
  assert.equal(result.value.schemaVersion, derived.ATLAS_CONTINUITY_FINDINGS_SCHEMA_VERSION);
  assert.equal(result.value.authority.projectTruthMutation, false);
  assert.equal(result.value.authority.manuscriptMutation, false);
  assert.equal(result.value.authority.storageMutation, false);
  assert.equal(result.value.authority.networkMutation, false);
  assert.equal(result.value.authority.automaticCorrection, false);
  assert.equal(result.value.state, 'ready');
  const kinds = result.value.findings.map((item) => item.findingKind).sort();
  assert.ok(kinds.includes('PROMISE_BROKEN'));
  assert.ok(kinds.includes('KNOWLEDGE_CONTRADICTION'));
  assert.ok(kinds.includes('OBJECT_CONTRADICTION'));
  assert.ok(kinds.includes('LOCATION_CONTRADICTION'));
  assert.ok(kinds.includes('DISAPPEARANCE_RESOLVED_OR_CONFLICTING'));
  assert.equal(result.value.summary.findingCount, 5);
  assert.equal(result.value.summary.warningCount, 5);
  assert.match(result.value.summary.sourceHash, /^[0-9a-f]{64}$/u);
  assert.equal(result.value.generationProof.schemaVersion, derived.ATLAS_CONTINUITY_FINDINGS_GENERATION_PROOF_SCHEMA_VERSION);
  assert.equal(result.value.generationProof.matchesCurrentRevision, true);
  assert.equal(result.value.evidence.guarantees.evidenceFirst, true);
  assert.equal(result.value.evidence.guarantees.automaticCorrection, false);
  assert.equal(runtime.hashCoreState(state), beforeHash);
  assert.equal(recorded.state.data.projects[projectId].scenes[sceneAId].text, state.data.projects[projectId].scenes[sceneAId].text);
});

test('E06 C05: continuity findings expose unknown and insufficient-evidence outcomes without inventing findings', async () => {
  const { runtime, derived, projectId, sceneAId, sceneCId, state } = await buildContinuityFindingsFixture();
  const recorded = runtime.applyCoreSequence(state, [
    factCommand(runtime, state, projectId, sceneAId, 'entity-anna', 'promise', 'promise-open-only', 'Return promise', 'Anna promises Mira she will return', 'promises Mira she will return', { promiseState: 'open', relatedEntityIds: ['entity-mira'] }),
    factCommand(runtime, state, projectId, sceneCId, 'entity-anna', 'location', 'location-market-only', 'Anna location', 'market', 'Anna is in the market'),
  ]);
  assert.equal(recorded.ok, true);
  const result = derived.deriveAtlasContinuityFindings({
    coreState: recorded.state,
    params: { projectId },
    capabilitySnapshot: nodeCapabilitySnapshot(),
  });
  assert.equal(result.ok, true);
  assert.equal(result.value.state, 'insufficientEvidence');
  assert.equal(result.value.findings.length, 0);
  assert.equal(result.value.summary.unknownOutcomeCount, 1);
  assert.equal(result.value.summary.insufficientEvidenceOutcomeCount, 1);
  assert.ok(result.value.outcomes.some((item) => item.outcomeKind === 'PROMISE_OUTCOME_UNKNOWN'));
  assert.ok(result.value.outcomes.some((item) => item.outcomeKind === 'DISAPPEARANCE_INSUFFICIENT_EVIDENCE'));
});

test('E06 C05: continuity findings are deterministic and fail closed on disabled capability', async () => {
  const { runtime, derived, projectId, sceneAId, state } = await buildContinuityFindingsFixture();
  const recorded = runtime.applyCoreSequence(state, [
    factCommand(runtime, state, projectId, sceneAId, 'entity-anna', 'promise', 'promise-open-only', 'Return promise', 'Anna promises Mira she will return', 'promises Mira she will return', { promiseState: 'open' }),
  ]);
  assert.equal(recorded.ok, true);
  const first = derived.deriveAtlasContinuityFindings({
    coreState: recorded.state,
    params: { projectId },
    capabilitySnapshot: nodeCapabilitySnapshot(),
  });
  const second = derived.deriveAtlasContinuityFindings({
    coreState: JSON.parse(JSON.stringify(recorded.state)),
    params: { projectId },
    capabilitySnapshot: nodeCapabilitySnapshot(),
  });
  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  assert.equal(first.meta.outputHash, second.meta.outputHash);
  assert.equal(first.value.summary.generationKey, second.value.summary.generationKey);

  const disabled = derived.deriveAtlasContinuityFindings({
    coreState: recorded.state,
    params: { projectId },
    capabilitySnapshot: { capabilities: { atlasContinuityFindings: false } },
  });
  assert.equal(disabled.ok, false);
  assert.equal(disabled.error.code, 'E_CAPABILITY_DISABLED_FOR_COMMAND');
});

test('E06 C05: continuity finding derived sources keep side effects closed', () => {
  const sources = [
    'src/derived/atlas/deriveAtlasContinuityFindings.mjs',
    'src/derived/atlas/atlasContinuityFindingsTypes.mjs',
  ].map((relativePath) => [path.basename(relativePath), fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8')]);
  const forbiddenPatterns = [
    /from\s+['"]node:fs['"]/u,
    /from\s+['"]node:child_process['"]/u,
    /from\s+['"]node:http['"]/u,
    /from\s+['"]node:https['"]/u,
    /from\s+['"]electron['"]/u,
    /\bwriteFile(?:Sync)?\s*\(/u,
    /\bappendFile(?:Sync)?\s*\(/u,
    /\blocalStorage\b/u,
    /\bsessionStorage\b/u,
    /\bindexedDB\b/u,
    /\bquerySelector\b/u,
    /\bdispatchEvent\b/u,
  ];
  for (const [basename, source] of sources) {
    for (const pattern of forbiddenPatterns) {
      assert.doesNotMatch(source, pattern, `${basename} matched ${pattern.source}`);
    }
  }
});
