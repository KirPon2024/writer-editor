const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

async function loadModule(relativePath) {
  const fileUrl = pathToFileURL(path.join(process.cwd(), relativePath)).href;
  return import(fileUrl);
}

function readFixture() {
  return JSON.parse(fs.readFileSync(
    path.join(process.cwd(), 'test', 'fixtures', 'atlas', 'language', 'ru-en-deep-fixture-certification-corpus.json'),
    'utf8',
  ));
}

function rowBy(report, languageCode) {
  return report.rollbackRows.find((row) => row.languageCode === languageCode);
}

test('E07 C08: requested RU rollback decertifies only RU and keeps EN certified', async () => {
  const derived = await loadModule(path.join('src', 'derived', 'index.mjs'));
  const report = derived.deriveAtlasLanguageDecertificationRollback({
    deepFixtureCertificationCorpus: readFixture(),
    rollbackLanguages: ['RU'],
  });

  assert.equal(report.schemaVersion, derived.ATLAS_LANGUAGE_DECERTIFICATION_ROLLBACK_SCHEMA_VERSION);
  assert.equal(report.state, 'ready');
  assert.equal(report.deepDecisionStatus, derived.ATLAS_DEEP_ENGINE_DECISION_STATUS.CERTIFIED_OFFLINE);
  assert.deepEqual(report.requestedRollbackLanguages, ['ru']);
  assert.equal(report.summary.languageCount, 4);
  assert.equal(report.summary.activeCertifiedCount, 1);
  assert.equal(report.summary.rolledBackCount, 1);
  assert.equal(report.summary.decertifiedByCorpusCount, 0);
  assert.equal(report.summary.degradedToExactOnlyCount, 2);
  assert.deepEqual(report.summary.activeCertifiedLanguageCodes, ['en']);
  assert.deepEqual(report.summary.rolledBackLanguageCodes, ['ru']);
  assert.match(report.summary.rollbackHash, /^[0-9a-f]{64}$/u);

  const en = rowBy(report, 'en');
  const ru = rowBy(report, 'ru');
  assert.equal(en.status, derived.ATLAS_LANGUAGE_ROLLBACK_STATUS.CERTIFIED_ACTIVE);
  assert.equal(en.action, derived.ATLAS_LANGUAGE_ROLLBACK_ACTION.KEEP_CERTIFIED);
  assert.equal(en.nextClaimLevel, 'DEEP');
  assert.equal(en.resourceRemovalRequired, false);

  assert.equal(ru.status, derived.ATLAS_LANGUAGE_ROLLBACK_STATUS.ROLLED_BACK_TO_EXACT_ONLY);
  assert.equal(ru.action, derived.ATLAS_LANGUAGE_ROLLBACK_ACTION.DECERTIFY_TO_EXACT_ONLY);
  assert.equal(ru.nextClaimLevel, 'BASIC_OR_GLOBAL_EXACT_ONLY');
  assert.equal(ru.rollbackPlan.clearCertifiedLanguageOnly, true);
  assert.equal(ru.rollbackPlan.removeRuntimeResource, false);
  assert.equal(ru.projectTruthMutation, false);
  assert.equal(ru.manuscriptMutation, false);
  assert.equal(ru.englishFallback, false);

  for (const languageCode of ['ar', 'de']) {
    const degraded = rowBy(report, languageCode);
    assert.equal(degraded.status, derived.ATLAS_LANGUAGE_ROLLBACK_STATUS.DEGRADED_TO_EXACT_ONLY);
    assert.equal(degraded.action, derived.ATLAS_LANGUAGE_ROLLBACK_ACTION.KEEP_DEGRADED_EXACT_ONLY);
    assert.equal(degraded.resourceRemovalRequired, false);
  }

  assert.equal(report.guards.rollbackPerLanguageOnly, true);
  assert.equal(report.guards.certifiedLanguagesRemainIndependent, true);
  assert.equal(report.guards.noSharedResourceDeletion, true);
});

test('E07 C08: failing RU corpus decertifies RU without deleting shared resources or EN certification', async () => {
  const derived = await loadModule(path.join('src', 'derived', 'index.mjs'));
  const corpus = readFixture();
  const ruCase = corpus.cases.find((corpusCase) => corpusCase.languageCode === 'ru');
  ruCase.observed = ruCase.observed.filter((signal) => signal.kind !== 'coreference');
  const report = derived.deriveAtlasLanguageDecertificationRollback({
    deepFixtureCertificationCorpus: corpus,
  });

  assert.equal(report.state, 'ready');
  assert.equal(report.summary.activeCertifiedCount, 1);
  assert.equal(report.summary.rolledBackCount, 0);
  assert.equal(report.summary.decertifiedByCorpusCount, 1);
  assert.deepEqual(report.summary.activeCertifiedLanguageCodes, ['en']);
  assert.deepEqual(report.summary.decertifiedLanguageCodes, ['ru']);

  const en = rowBy(report, 'en');
  const ru = rowBy(report, 'ru');
  assert.equal(en.status, derived.ATLAS_LANGUAGE_ROLLBACK_STATUS.CERTIFIED_ACTIVE);
  assert.equal(ru.status, derived.ATLAS_LANGUAGE_ROLLBACK_STATUS.DECERTIFIED_BY_CORPUS);
  assert.equal(ru.action, derived.ATLAS_LANGUAGE_ROLLBACK_ACTION.KEEP_DECERTIFIED_EXACT_ONLY);
  assert.equal(ru.metrics.recall < 1, true);
  assert.equal(ru.rollbackPlan.clearCertifiedLanguageOnly, false);
  assert.equal(report.resourceIsolation.guards.noCrossLanguageDecertification, true);
});

test('E07 C08: resource isolation keeps local fixture resources non-executable and shared-read-only', async () => {
  const derived = await loadModule(path.join('src', 'derived', 'index.mjs'));
  const report = derived.deriveAtlasLanguageDecertificationRollback({
    deepFixtureCertificationCorpus: readFixture(),
    rollbackLanguages: ['ru'],
  });

  assert.equal(report.resourceIsolation.schemaVersion, derived.ATLAS_LANGUAGE_RESOURCE_ISOLATION_SCHEMA_VERSION);
  assert.equal(report.resourceIsolation.guards.noSharedResourceDeletion, true);
  assert.equal(report.resourceIsolation.guards.noExecutableResource, true);
  assert.equal(report.resourceIsolation.guards.noModelWeights, true);
  assert.equal(report.resourceIsolation.guards.noNetworkResource, true);
  assert.equal(report.resourceIsolation.guards.noRuntimeDownload, true);
  assert.match(report.resourceIsolation.isolationHash, /^[0-9a-f]{64}$/u);

  for (const resource of report.resourceIsolation.resources) {
    assert.equal(resource.executable, false);
    assert.equal(resource.modelWeights, false);
    assert.equal(resource.sharedReadOnly, true);
    assert.equal(resource.removalRequired, false);
  }
  for (const scope of report.resourceIsolation.languageScopes) {
    assert.equal(scope.isolated, true);
    assert.equal(scope.sharedResourceDeletionAllowed, false);
  }
});

test('E07 C08: default unavailable Deep path has no language rollback rows and remains reversible', async () => {
  const derived = await loadModule(path.join('src', 'derived', 'index.mjs'));
  const report = derived.deriveAtlasLanguageDecertificationRollback();

  assert.equal(report.state, 'ready');
  assert.equal(report.deepDecisionStatus, derived.ATLAS_DEEP_ENGINE_DECISION_STATUS.UNAVAILABLE_LOCAL_STUB_ONLY);
  assert.equal(report.summary.languageCount, 0);
  assert.equal(report.summary.rolledBackCount, 0);
  assert.deepEqual(report.rollbackRows, []);
  assert.equal(report.resourceIsolation.guards.noSharedResourceDeletion, true);
  assert.equal(report.authority.projectTruthMutation, false);
  assert.equal(report.authority.manuscriptMutation, false);
  assert.equal(report.authority.storageMutation, false);
});

test('E07 C08: exports are present and rollback sources keep side-effect boundaries closed', async () => {
  const derived = await loadModule(path.join('src', 'derived', 'index.mjs'));
  const atlas = await loadModule(path.join('src', 'derived', 'atlas', 'index.mjs'));

  assert.equal(derived.ATLAS_LANGUAGE_DECERTIFICATION_ROLLBACK_SCHEMA_VERSION, 'derived.atlas.languageDecertificationRollback.v1');
  assert.equal(derived.ATLAS_LANGUAGE_RESOURCE_ISOLATION_SCHEMA_VERSION, 'derived.atlas.languageResourceIsolation.v1');
  assert.equal(derived.ATLAS_LANGUAGE_ROLLBACK_STATUS.ROLLED_BACK_TO_EXACT_ONLY, 'ROLLED_BACK_TO_EXACT_ONLY');
  assert.equal(atlas.ATLAS_LANGUAGE_ROLLBACK_ACTION.DECERTIFY_TO_EXACT_ONLY, 'DECERTIFY_TO_EXACT_ONLY');
  assert.equal(typeof derived.deriveAtlasLanguageDecertificationRollback, 'function');
  assert.equal(typeof atlas.sortAtlasLanguageRollbackRows, 'function');

  const sources = [
    'src/derived/atlas/atlasLanguageRollbackTypes.mjs',
    'src/derived/atlas/deriveAtlasLanguageDecertificationRollback.mjs',
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
    /productionRuntimeClaim:\s*true/u,
    /releaseReadinessClaim:\s*true/u,
    /projectTruthMutation:\s*true/u,
    /manuscriptMutation:\s*true/u,
    /storageMutation:\s*true/u,
    /networkMutation:\s*true/u,
    /runtimeDownload:\s*true/u,
    /dynamicExecutablePlugin:\s*true/u,
    /removalRequired:\s*true/u,
  ];
  for (const [basename, source] of sources) {
    for (const pattern of forbiddenPatterns) {
      assert.doesNotMatch(source, pattern, `${basename} matched ${pattern.source}`);
    }
  }
});
