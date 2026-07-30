const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

async function loadModule(relativePath) {
  const fileUrl = pathToFileURL(path.join(process.cwd(), relativePath)).href;
  return import(fileUrl);
}

async function buildReattachmentFixture() {
  const runtime = await loadModule(path.join('src', 'core', 'runtime.mjs'));
  const derived = await loadModule(path.join('src', 'derived', 'index.mjs'));
  const projectId = 'atlas-reattach-project';
  const sceneId = 'scene-a';
  const built = runtime.applyCoreSequence(runtime.createInitialCoreState(), [
    {
      type: runtime.CORE_COMMAND_IDS.PROJECT_CREATE,
      payload: { projectId, title: 'Atlas reattach', sceneId },
    },
    {
      type: runtime.CORE_COMMAND_IDS.PROJECT_APPLY_TEXT_EDIT,
      payload: { projectId, sceneId, text: 'Anna arrived.' },
    },
    {
      type: runtime.CORE_COMMAND_IDS.ATLAS_ENTITY_CREATE,
      payload: { projectId, entityId: 'entity-anna', name: 'Anna', entityKind: 'character' },
    },
  ]);
  assert.equal(built.ok, true);
  const aggregate = derived.deriveAtlasObservationAggregate({ coreState: built.state, params: { projectId, languageCode: 'en' } });
  assert.equal(aggregate.ok, true);
  const anna = aggregate.value.observations[0];
  assert.ok(anna);
  const confirmed = runtime.reduceCoreState(built.state, {
    type: runtime.CORE_COMMAND_IDS.ATLAS_MENTION_CONFIRM,
    payload: {
      projectId,
      sceneId,
      entityId: 'entity-anna',
      mentionId: anna.mentionId,
      evidenceAnchor: anna.evidenceAnchor,
      decisionId: 'decision-anna-original',
    },
  });
  assert.equal(confirmed.ok, true);
  const moved = runtime.reduceCoreState(confirmed.state, {
    type: runtime.CORE_COMMAND_IDS.PROJECT_APPLY_TEXT_EDIT,
    payload: { projectId, sceneId, text: 'Before. Anna arrived.' },
  });
  assert.equal(moved.ok, true);
  return { runtime, derived, projectId, sceneId, confirmedState: confirmed.state, movedState: moved.state };
}

test('E04 C05: stale Atlas evidence appears in a deterministic review inbox without automatic mutation', async () => {
  const { derived, projectId, movedState } = await buildReattachmentFixture();
  const first = derived.deriveAtlasEvidenceReattachmentInbox({ coreState: movedState, params: { projectId } });
  const second = derived.deriveAtlasEvidenceReattachmentInbox({ coreState: JSON.parse(JSON.stringify(movedState)), params: { projectId } });

  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  assert.equal(first.value.schemaVersion, derived.ATLAS_EVIDENCE_REATTACHMENT_INBOX_SCHEMA_VERSION);
  assert.equal(first.value.summary.inboxHash, second.value.summary.inboxHash);
  assert.equal(first.meta.outputHash, second.meta.outputHash);
  assert.equal(first.value.summary.sourceRecordCount, 1);
  assert.equal(first.value.summary.reviewRequiredCount, 1);
  assert.equal(first.value.summary.candidateCount, 1);
  assert.equal(first.value.authority.automaticReattachment, false);

  const item = first.value.items[0];
  assert.equal(item.schemaVersion, derived.ATLAS_EVIDENCE_REATTACHMENT_ITEM_SCHEMA_VERSION);
  assert.equal(item.sourceRecordKind, 'decision');
  assert.equal(item.sourceRecordId, 'decision-anna-original');
  assert.equal(item.status, 'REVIEW_REQUIRED');
  assert.equal(item.currentEvidenceAnchor, null);
  assert.equal(item.staleEvidenceAnchor.startOffset, 0);
  assert.equal(item.staleEvidenceAnchor.quote, 'Anna');

  const candidate = first.value.candidates[0];
  assert.equal(candidate.schemaVersion, derived.ATLAS_EVIDENCE_REATTACHMENT_CANDIDATE_SCHEMA_VERSION);
  assert.equal(candidate.candidateKind, 'sameSceneExactQuote');
  assert.equal(candidate.evidenceAnchor.quote, 'Anna');
  assert.equal(candidate.evidenceAnchor.startOffset, 8);
  assert.equal(movedState.data.projects[projectId].atlas.decisions['decision-anna-original'].evidenceAnchor.startOffset, 0);
  assert.equal(Object.keys(movedState.data.projects[projectId].atlas.evidenceReattachments || {}).length, 0);
});

test('E04 C05: explicit reattachment records a no-loss ledger and clears the pending inbox item', async () => {
  const { runtime, derived, projectId, movedState } = await buildReattachmentFixture();
  const inbox = derived.deriveAtlasEvidenceReattachmentInbox({ coreState: movedState, params: { projectId } });
  assert.equal(inbox.ok, true);
  const item = inbox.value.items[0];
  const candidate = inbox.value.candidates[0];

  const reattached = runtime.reduceCoreState(movedState, {
    type: runtime.CORE_COMMAND_IDS.ATLAS_EVIDENCE_REATTACH,
    payload: {
      projectId,
      sourceRecordKind: item.sourceRecordKind,
      sourceRecordId: item.sourceRecordId,
      staleEvidenceAnchor: item.staleEvidenceAnchor,
      newEvidenceAnchor: candidate.evidenceAnchor,
      expectedSourceRecordHash: item.sourceRecordHash,
      reattachmentId: 'reattach-anna-decision',
      reason: 'Author reviewed moved evidence',
    },
  });
  assert.equal(reattached.ok, true);
  const ledger = reattached.state.data.projects[projectId].atlas.evidenceReattachments['reattach-anna-decision'];
  assert.equal(ledger.operationKind, 'evidence.reattach');
  assert.deepEqual(ledger.staleEvidenceAnchor, item.staleEvidenceAnchor);
  assert.deepEqual(ledger.newEvidenceAnchor, candidate.evidenceAnchor);
  assert.equal(reattached.state.data.projects[projectId].atlas.decisions['decision-anna-original'].evidenceAnchor.startOffset, 0);

  const after = derived.deriveAtlasEvidenceReattachmentInbox({ coreState: reattached.state, params: { projectId } });
  assert.equal(after.ok, true);
  assert.equal(after.value.summary.reviewRequiredCount, 0);
  assert.equal(after.value.summary.reattachedCount, 1);
  assert.equal(after.value.summary.candidateCount, 0);
  assert.equal(after.value.items[0].status, 'REATTACHED');
  assert.equal(after.value.items[0].reattachmentId, 'reattach-anna-decision');
  assert.deepEqual(after.value.items[0].currentEvidenceAnchor, candidate.evidenceAnchor);
});

test('E04 C05: reattachment command fails closed on stale source hash or stale new evidence', async () => {
  const { runtime, derived, projectId, sceneId, movedState } = await buildReattachmentFixture();
  const inbox = derived.deriveAtlasEvidenceReattachmentInbox({ coreState: movedState, params: { projectId } });
  const item = inbox.value.items[0];
  const candidate = inbox.value.candidates[0];

  const staleSource = runtime.reduceCoreState(movedState, {
    type: runtime.CORE_COMMAND_IDS.ATLAS_EVIDENCE_REATTACH,
    payload: {
      projectId,
      sourceRecordKind: item.sourceRecordKind,
      sourceRecordId: item.sourceRecordId,
      staleEvidenceAnchor: item.staleEvidenceAnchor,
      newEvidenceAnchor: candidate.evidenceAnchor,
      expectedSourceRecordHash: 'not-current-source-record-hash',
    },
  });
  assert.equal(staleSource.ok, false);
  assert.equal(staleSource.error.code, 'E_ATLAS_SOURCE_RECORD_STALE');
  assert.equal(staleSource.stateHash, runtime.hashCoreState(movedState));

  const movedAgain = runtime.reduceCoreState(movedState, {
    type: runtime.CORE_COMMAND_IDS.PROJECT_APPLY_TEXT_EDIT,
    payload: { projectId, sceneId, text: 'Later Anna arrived.' },
  });
  assert.equal(movedAgain.ok, true);
  const staleNewEvidence = runtime.reduceCoreState(movedAgain.state, {
    type: runtime.CORE_COMMAND_IDS.ATLAS_EVIDENCE_REATTACH,
    payload: {
      projectId,
      sourceRecordKind: item.sourceRecordKind,
      sourceRecordId: item.sourceRecordId,
      staleEvidenceAnchor: item.staleEvidenceAnchor,
      newEvidenceAnchor: candidate.evidenceAnchor,
    },
  });
  assert.equal(staleNewEvidence.ok, false);
  assert.equal(staleNewEvidence.error.code, 'E_ATLAS_EVIDENCE_STALE');
  assert.equal(staleNewEvidence.stateHash, runtime.hashCoreState(movedAgain.state));
});

test('E04 C05: reattachment command is admitted only through Command Kernel capability revalidation', async () => {
  const { runtime, derived, projectId, movedState } = await buildReattachmentFixture();
  const registryModule = await loadModule(path.join('src', 'renderer', 'commands', 'registry.mjs'));
  const runnerModule = await loadModule(path.join('src', 'renderer', 'commands', 'runCommand.mjs'));
  const capabilityPolicy = await loadModule(path.join('src', 'renderer', 'commands', 'capabilityPolicy.mjs'));
  const localCapability = await loadModule(path.join('src', 'renderer', 'commands', 'localCapabilityProvider.mjs'));
  const inbox = derived.deriveAtlasEvidenceReattachmentInbox({ coreState: movedState, params: { projectId } });
  const item = inbox.value.items[0];
  const candidate = inbox.value.candidates[0];
  const payload = {
    projectId,
    sourceRecordKind: item.sourceRecordKind,
    sourceRecordId: item.sourceRecordId,
    staleEvidenceAnchor: item.staleEvidenceAnchor,
    newEvidenceAnchor: candidate.evidenceAnchor,
  };

  assert.equal(capabilityPolicy.CAPABILITY_BINDING[runtime.CORE_COMMAND_IDS.ATLAS_EVIDENCE_REATTACH], 'cap.atlas.evidence.reattach');
  assert.equal(localCapability.resolveCommandEntitlement(runtime.CORE_COMMAND_IDS.ATLAS_EVIDENCE_REATTACH, { entitlementTier: 'free' }).available, true);

  const registry = registryModule.createCommandRegistry();
  registry.registerCommand(runtime.CORE_COMMAND_IDS.ATLAS_EVIDENCE_REATTACH, (input) => {
    return runtime.reduceCoreState(input.state, {
      type: runtime.CORE_COMMAND_IDS.ATLAS_EVIDENCE_REATTACH,
      payload: input.payload,
    });
  });
  const webRunner = runnerModule.createCommandRunner(registry, { capability: { defaultPlatformId: 'web' } });
  const denied = await webRunner(runtime.CORE_COMMAND_IDS.ATLAS_EVIDENCE_REATTACH, { state: movedState, payload });
  assert.equal(denied.ok, false);
  assert.equal(denied.error.code, 'E_CAPABILITY_DISABLED_FOR_COMMAND');

  const nodeRunner = runnerModule.createCommandRunner(registry, { capability: { defaultPlatformId: 'node', entitlementTier: 'free' } });
  const admitted = await nodeRunner(runtime.CORE_COMMAND_IDS.ATLAS_EVIDENCE_REATTACH, { state: movedState, payload });
  assert.equal(admitted.ok, true);
});

test('E04 C05: evidence reattachment inbox fails closed and adds no storage, network, UI, or bypass routes', async () => {
  const { derived, movedState } = await buildReattachmentFixture();
  const missingProjectId = derived.deriveAtlasEvidenceReattachmentInbox({ coreState: movedState, params: {} });
  assert.equal(missingProjectId.ok, false);
  assert.equal(missingProjectId.error.code, 'E_ATLAS_PROJECT_ID_REQUIRED');

  const disabled = derived.deriveAtlasEvidenceReattachmentInbox({
    coreState: movedState,
    params: { projectId: 'atlas-reattach-project' },
    capabilitySnapshot: { capabilities: { atlasEvidenceReattachmentInbox: false } },
  });
  assert.equal(disabled.ok, false);
  assert.equal(disabled.error.code, 'E_CAPABILITY_DISABLED_FOR_COMMAND');
  assert.equal(disabled.error.details.capabilityId, 'atlas.evidenceReattachmentInbox');

  const sources = [
    path.join(process.cwd(), 'src', 'core', 'runtime.mjs'),
    path.join(process.cwd(), 'src', 'derived', 'atlas', 'deriveAtlasEvidenceReattachmentInbox.mjs'),
  ].map((filePath) => [path.basename(filePath), fs.readFileSync(filePath, 'utf8')]);
  const forbiddenPatterns = [
    /from\s+['"]node:fs['"]/u,
    /from\s+['"]node:child_process['"]/u,
    /from\s+['"]node:http['"]/u,
    /from\s+['"]node:https['"]/u,
    /from\s+['"]node:net['"]/u,
    /from\s+['"]electron['"]/u,
    /\bwriteFile(?:Sync)?\s*\(/u,
    /\bappendFile(?:Sync)?\s*\(/u,
    /\bmkdir(?:Sync)?\s*\(/u,
    /\brename(?:Sync)?\s*\(/u,
    /\bunlink(?:Sync)?\s*\(/u,
    /\brm(?:Sync)?\s*\(/u,
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
