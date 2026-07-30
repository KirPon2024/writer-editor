const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

async function loadModule(relativePath) {
  const fileUrl = pathToFileURL(path.join(process.cwd(), relativePath)).href;
  return import(fileUrl);
}

function candidateById(report, candidateId) {
  return report.candidates.find((candidate) => candidate.candidateId === candidateId);
}

function deepRow(report, languageCode) {
  return report.capabilityRows.find((row) => row.claimLevel === report.levels.DEEP && row.languageCode === languageCode);
}

async function buildProjectFixture() {
  const runtime = await loadModule(path.join('src', 'core', 'runtime.mjs'));
  const projectId = 'atlas-deep-engine-decision-project';
  const created = runtime.applyCoreSequence(runtime.createInitialCoreState(), [
    {
      type: runtime.CORE_COMMAND_IDS.PROJECT_CREATE,
      payload: { projectId, title: 'Atlas Deep decision', sceneId: 'scene-a' },
    },
    {
      type: runtime.CORE_COMMAND_IDS.PROJECT_APPLY_TEXT_EDIT,
      payload: {
        projectId,
        sceneId: 'scene-a',
        text: 'Anna promised Mira she would return.',
      },
    },
  ]);
  assert.equal(created.ok, true);
  return { projectId, state: created.state };
}

test('E07 C06: Deep engine decision records local null adapter and rejects unsafe candidates', async () => {
  const derived = await loadModule(path.join('src', 'derived', 'index.mjs'));
  const report = derived.deriveAtlasDeepEngineDecision();

  assert.equal(report.schemaVersion, derived.ATLAS_DEEP_ENGINE_DECISION_SCHEMA_VERSION);
  assert.equal(report.decisionStatus, derived.ATLAS_DEEP_ENGINE_DECISION_STATUS.UNAVAILABLE_LOCAL_STUB_ONLY);
  assert.equal(report.currentDeepCapability, 'UNAVAILABLE');
  assert.equal(report.summary.candidateCount, 4);
  assert.equal(report.summary.rejectedCandidateCount, 3);
  assert.equal(report.summary.stubOnlyCandidateCount, 1);
  assert.equal(report.summary.certifiedLanguageCount, 0);
  assert.match(report.summary.decisionHash, /^[0-9a-f]{64}$/u);

  const basic = candidateById(report, 'basic-exact-term-v1');
  assert.equal(basic.status, derived.ATLAS_DEEP_ENGINE_CANDIDATE_STATUS.REJECTED);
  assert.equal(basic.corpusMetricsAvailable, false);
  assert.equal(basic.networkRequired, false);

  const remote = candidateById(report, 'remote-language-service');
  assert.equal(remote.status, derived.ATLAS_DEEP_ENGINE_CANDIDATE_STATUS.REJECTED);
  assert.equal(remote.networkRequired, true);

  const plugin = candidateById(report, 'dynamic-plugin-runtime');
  assert.equal(plugin.status, derived.ATLAS_DEEP_ENGINE_CANDIDATE_STATUS.REJECTED);
  assert.equal(plugin.dynamicExecutablePlugin, true);
  assert.equal(plugin.runtimeDownload, true);

  const stub = candidateById(report, 'local-null-deep-adapter-v1');
  assert.equal(stub.status, derived.ATLAS_DEEP_ENGINE_CANDIDATE_STATUS.STUB_ONLY);
  assert.equal(stub.offlineOnly, true);
  assert.equal(stub.networkRequired, false);
});

test('E07 C06: offline resource manifest and adapter stub are non-executable and reversible', async () => {
  const derived = await loadModule(path.join('src', 'derived', 'index.mjs'));
  const report = derived.deriveAtlasDeepEngineDecision();

  assert.equal(report.resourceManifest.schemaVersion, derived.ATLAS_DEEP_ENGINE_RESOURCE_MANIFEST_SCHEMA_VERSION);
  assert.equal(report.resourceManifest.resourceKind, 'null-offline-fixture');
  assert.equal(report.resourceManifest.byteLength, 0);
  assert.equal(report.resourceManifest.executable, false);
  assert.equal(report.resourceManifest.modelWeights, false);
  assert.equal(report.resourceManifest.offlineOnly, true);
  assert.equal(report.resourceManifest.networkRequired, false);
  assert.match(report.resourceManifest.resourceHash, /^[0-9a-f]{64}$/u);

  assert.equal(report.hashPacket.schemaVersion, derived.ATLAS_DEEP_ENGINE_HASH_PACKET_SCHEMA_VERSION);
  assert.equal(report.hashPacket.resourceHash, report.resourceManifest.resourceHash);
  assert.equal(report.hashPacket.signatureKind, 'deterministic-hash-packet-not-release-signature');
  assert.equal(report.hashPacket.signatureVerified, false);
  assert.equal(report.hashPacket.releaseTrust, false);
  assert.match(report.hashPacket.signature, /^[0-9a-f]{64}$/u);

  assert.equal(report.adapterStub.schemaVersion, derived.ATLAS_DEEP_ENGINE_ADAPTER_STUB_SCHEMA_VERSION);
  assert.equal(report.adapterStub.canAnalyze, false);
  assert.equal(report.adapterStub.certified, false);
  assert.equal(report.adapterStub.experimental, false);
  assert.equal(report.adapterStub.networkRequired, false);
  assert.equal(report.adapterStub.runtimeDownload, false);
  assert.equal(report.adapterStub.dynamicExecutablePlugin, false);
  assert.equal(report.adapterStub.projectTruthMutation, false);
  assert.equal(report.adapterStub.manuscriptMutation, false);

  assert.equal(report.rollback.targetStatus, derived.ATLAS_DEEP_ENGINE_DECISION_STATUS.UNAVAILABLE_LOCAL_STUB_ONLY);
  assert.equal(report.rollback.reversible, true);
  assert.equal(report.rollback.removeRuntimeResource, false);
  assert.equal(report.rollback.fallbackAnalyzer, 'BASIC_EXACT_TERM_V1');
});

test('E07 C06: capability report carries Deep decision while Deep rows stay unavailable', async () => {
  const { projectId, state } = await buildProjectFixture();
  const derived = await loadModule(path.join('src', 'derived', 'index.mjs'));
  const result = derived.deriveAtlasLanguageCapabilityReport({
    coreState: state,
    params: { projectId, languageCodes: ['en', 'ru', 'ar'] },
    capabilitySnapshot: { platformId: 'node', capabilities: { atlasLanguageCapabilityReport: true } },
  });

  assert.equal(result.ok, true);
  const value = {
    ...result.value,
    levels: derived.ATLAS_LANGUAGE_CAPABILITY_LEVEL,
  };
  assert.equal(value.deepEngineDecision.schemaVersion, derived.ATLAS_DEEP_ENGINE_DECISION_SCHEMA_VERSION);
  assert.equal(value.deepEngineDecision.currentDeepCapability, 'UNAVAILABLE');
  assert.equal(value.deepEngineDecision.guards.noSilentBasicToDeepPromotion, true);
  assert.equal(value.summary.falseDeepClaimCount, 0);
  assert.equal(value.summary.englishFallbackCount, 0);

  for (const languageCode of ['ar', 'en', 'ru']) {
    const row = deepRow(value, languageCode);
    assert.equal(row.status, derived.ATLAS_LANGUAGE_CAPABILITY_STATUS.UNAVAILABLE);
    assert.equal(row.deepSupported, false);
    assert.equal(row.englishFallback, false);
    assert.equal(row.corpusMetricsStatus, 'blocked-until-engine-decision-and-corpus-metrics');
  }
});

test('E07 C06: experimental or certified candidates never pass without explicit local inputs', async () => {
  const derived = await loadModule(path.join('src', 'derived', 'index.mjs'));
  const experimental = derived.deriveAtlasDeepEngineDecision({
    candidates: [
      {
        candidateId: 'local-experimental-parser',
        candidateKind: 'local-fixture',
        status: derived.ATLAS_DEEP_ENGINE_CANDIDATE_STATUS.ACCEPTED_EXPERIMENTAL,
        reason: 'Fixture demonstrates decision downgrade surface only.',
        offlineOnly: true,
        networkRequired: false,
        runtimeDownload: false,
        dynamicExecutablePlugin: false,
        licenseAccepted: true,
        corpusMetricsAvailable: false,
        certifiedLanguages: [],
      },
    ],
  });
  assert.equal(experimental.decisionStatus, derived.ATLAS_DEEP_ENGINE_DECISION_STATUS.EXPERIMENTAL_NOT_CERTIFIED);
  assert.equal(experimental.currentDeepCapability, 'EXPERIMENTAL_NOT_CERTIFIED');
  assert.equal(experimental.summary.certifiedLanguageCount, 0);
  assert.equal(experimental.guards.releaseReadinessClaim, false);

  const certified = derived.deriveAtlasDeepEngineDecision({
    candidates: [
      {
        candidateId: 'local-certified-fixture',
        candidateKind: 'local-fixture',
        status: derived.ATLAS_DEEP_ENGINE_CANDIDATE_STATUS.ACCEPTED_CERTIFIED,
        reason: 'Fixture demonstrates future C07 acceptance shape only.',
        offlineOnly: true,
        networkRequired: false,
        runtimeDownload: false,
        dynamicExecutablePlugin: false,
        licenseAccepted: true,
        corpusMetricsAvailable: true,
        certifiedLanguages: ['en'],
      },
    ],
  });
  assert.equal(certified.decisionStatus, derived.ATLAS_DEEP_ENGINE_DECISION_STATUS.CERTIFIED_OFFLINE);
  assert.equal(certified.currentDeepCapability, 'CERTIFIED_OFFLINE');
  assert.deepEqual(certified.certifiedLanguages, ['en']);
  assert.equal(certified.authority.projectTruthMutation, false);
  assert.equal(certified.authority.manuscriptMutation, false);
});

test('E07 C06: exports are available and Deep decision sources keep side-effect boundaries closed', async () => {
  const derived = await loadModule(path.join('src', 'derived', 'index.mjs'));
  const atlas = await loadModule(path.join('src', 'derived', 'atlas', 'index.mjs'));

  assert.equal(derived.ATLAS_DEEP_ENGINE_DECISION_SCHEMA_VERSION, 'derived.atlas.deepEngineDecision.v1');
  assert.equal(derived.ATLAS_DEEP_ENGINE_DECISION_STATUS.UNAVAILABLE_LOCAL_STUB_ONLY, 'UNAVAILABLE_LOCAL_STUB_ONLY');
  assert.equal(derived.ATLAS_DEEP_ENGINE_CANDIDATE_STATUS.REJECTED, 'REJECTED');
  assert.equal(typeof derived.deriveAtlasDeepEngineDecision, 'function');
  assert.equal(typeof atlas.deriveAtlasDeepEngineDecision, 'function');
  assert.equal(typeof derived.getAtlasDeepEngineDecisionDefaultCandidates, 'function');

  const sources = [
    'src/derived/atlas/atlasDeepEngineDecisionTypes.mjs',
    'src/derived/atlas/deriveAtlasDeepEngineDecision.mjs',
    'src/derived/atlas/deriveAtlasLanguageCapabilityReport.mjs',
  ].map((relativePath) => [path.basename(relativePath), fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8')]);
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
    /\bdocument\./u,
    /fetch\s*\(/u,
    /WebAssembly/u,
    /\bWorker\b/u,
    /\bnew\s+Function\b/u,
    /\bimport\s*\(/u,
    /canAnalyze:\s*true/u,
    /signatureVerified:\s*true/u,
    /releaseReadinessClaim:\s*true/u,
    /projectTruthMutation:\s*true/u,
    /manuscriptMutation:\s*true/u,
  ];
  for (const [basename, source] of sources) {
    for (const pattern of forbiddenPatterns) {
      assert.doesNotMatch(source, pattern, `${basename} matched ${pattern.source}`);
    }
  }
});
