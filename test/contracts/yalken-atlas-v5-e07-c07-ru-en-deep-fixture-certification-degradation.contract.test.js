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

function rowBy(report, claimLevel, languageCode) {
  return report.capabilityRows.find((row) => row.claimLevel === claimLevel && row.languageCode === languageCode);
}

async function buildProjectFixture() {
  const runtime = await loadModule(path.join('src', 'core', 'runtime.mjs'));
  const projectId = 'atlas-ru-en-deep-fixture-project';
  const built = runtime.applyCoreSequence(runtime.createInitialCoreState(), [
    {
      type: runtime.CORE_COMMAND_IDS.PROJECT_CREATE,
      payload: { projectId, title: 'Atlas RU EN Deep fixture', sceneId: 'scene-a' },
    },
    {
      type: runtime.CORE_COMMAND_IDS.PROJECT_APPLY_TEXT_EDIT,
      payload: {
        projectId,
        sceneId: 'scene-a',
        text: 'Anna told Mira she would return. Мария сказала Софье, что она вернётся.',
      },
    },
  ]);
  assert.equal(built.ok, true);
  return { projectId, state: built.state };
}

test('E07 C07: RU and EN Deep fixture certification has deterministic corpus metrics', async () => {
  const derived = await loadModule(path.join('src', 'derived', 'index.mjs'));
  const certification = derived.deriveAtlasDeepFixtureCertification({ corpus: readFixture() });

  assert.equal(certification.schemaVersion, derived.ATLAS_DEEP_FIXTURE_CERTIFICATION_SCHEMA_VERSION);
  assert.equal(certification.state, 'ready');
  assert.equal(certification.contract.fixtureOnly, true);
  assert.equal(certification.contract.productionRuntimeClaim, false);
  assert.equal(certification.contract.remoteModelRequired, false);
  assert.equal(certification.contract.runtimeDownload, false);
  assert.equal(certification.contract.dynamicExecutablePlugin, false);
  assert.equal(certification.summary.languageCount, 4);
  assert.equal(certification.summary.certifiedDeepCount, 2);
  assert.equal(certification.summary.degradedToExactOnlyCount, 2);
  assert.equal(certification.summary.decertifiedByCorpusCount, 0);
  assert.deepEqual(certification.summary.certifiedLanguageCodes, ['en', 'ru']);
  assert.deepEqual(certification.summary.degradedLanguageCodes, ['ar', 'de']);
  assert.match(certification.summary.certificationHash, /^[0-9a-f]{64}$/u);

  for (const languageCode of ['en', 'ru']) {
    const row = certification.languageRows.find((candidate) => candidate.languageCode === languageCode);
    assert.equal(row.status, derived.ATLAS_DEEP_FIXTURE_STATUS.CERTIFIED_DEEP_FIXTURE);
    assert.equal(row.deepSupported, true);
    assert.equal(row.fixtureOnly, true);
    assert.equal(row.productionRuntimeClaim, false);
    assert.equal(row.caseCount, 1);
    assert.equal(row.passedCaseCount, 1);
    assert.equal(row.precision, 1);
    assert.equal(row.recall, 1);
    assert.equal(row.f1, 1);
    assert.ok(row.claims.includes(derived.ATLAS_DEEP_FIXTURE_CLAIM.NER_FIXTURE));
    assert.ok(row.claims.includes(derived.ATLAS_DEEP_FIXTURE_CLAIM.COREFERENCE_FIXTURE));
  }

  for (const languageCode of ['ar', 'de']) {
    const row = certification.languageRows.find((candidate) => candidate.languageCode === languageCode);
    assert.equal(row.status, derived.ATLAS_DEEP_FIXTURE_STATUS.DEGRADED_TO_EXACT_ONLY);
    assert.equal(row.deepSupported, false);
    assert.deepEqual(row.claims, []);
  }

  assert.equal(certification.guards.fixtureOnly, true);
  assert.equal(certification.guards.noProductionRuntimeClaim, true);
  assert.equal(certification.guards.certifiedOnlyWithMetrics, true);
  assert.equal(certification.authority.projectTruthMutation, false);
  assert.equal(certification.authority.manuscriptMutation, false);
  assert.equal(certification.authority.networkMutation, false);
});

test('E07 C07: capability report certifies RU EN Deep fixture rows and degrades unsupported languages', async () => {
  const { projectId, state } = await buildProjectFixture();
  const derived = await loadModule(path.join('src', 'derived', 'index.mjs'));
  const result = derived.deriveAtlasLanguageCapabilityReport({
    coreState: state,
    params: {
      projectId,
      languageCodes: ['en', 'ru', 'ar', 'de'],
      deepFixtureCertificationCorpus: readFixture(),
    },
    capabilitySnapshot: { platformId: 'node', capabilities: { atlasLanguageCapabilityReport: true } },
  });

  assert.equal(result.ok, true);
  assert.equal(result.value.state, 'ready');
  assert.equal(result.value.analyzer.currentRuntimeKind, 'BASIC_EXACT_TERM + LOCAL_DEEP_FIXTURE');
  assert.equal(result.value.analyzer.deepRuntimeAvailable, true);
  assert.equal(result.value.summary.certifiedDeepCount, 2);
  assert.equal(result.value.summary.degradedDeepCount, 2);
  assert.equal(result.value.summary.deepUnavailableCount, 2);
  assert.equal(result.value.summary.falseDeepClaimCount, 0);
  assert.equal(result.value.deepEngineDecision.currentDeepCapability, 'CERTIFIED_OFFLINE');
  assert.deepEqual(result.value.deepEngineDecision.certifiedLanguages, ['en', 'ru']);

  for (const languageCode of ['en', 'ru']) {
    const deep = rowBy(result.value, derived.ATLAS_LANGUAGE_CAPABILITY_LEVEL.DEEP, languageCode);
    assert.equal(deep.status, derived.ATLAS_LANGUAGE_CAPABILITY_STATUS.CERTIFIED_DEEP_FIXTURE);
    assert.equal(deep.deepSupported, true);
    assert.equal(deep.englishFallback, false);
    assert.equal(deep.corpusMetricsStatus, 'certified-by-e07-c07-ru-en-deep-fixtures');
    assert.equal(deep.corpusMetrics.precision, 1);
    assert.equal(deep.deepFixtureCertification.fixtureOnly, true);
    assert.equal(deep.deepFixtureCertification.productionRuntimeClaim, false);
    assert.ok(deep.certifiedCapabilities.includes('eventExtraction'));
  }

  for (const languageCode of ['ar', 'de']) {
    const deep = rowBy(result.value, derived.ATLAS_LANGUAGE_CAPABILITY_LEVEL.DEEP, languageCode);
    assert.equal(deep.status, derived.ATLAS_LANGUAGE_CAPABILITY_STATUS.UNAVAILABLE);
    assert.equal(deep.deepSupported, false);
    assert.equal(deep.englishFallback, false);
    assert.equal(deep.corpusMetricsStatus, 'degraded-to-basic-or-global-exact-only-by-e07-c07');
    assert.equal(deep.deepFixtureCertification.fixtureOnly, true);
    assert.equal(deep.downgradeTarget, 'BASIC_OR_GLOBAL_EXACT_ONLY');
  }

  assert.equal(result.value.guards.noDeepWithoutMetrics, true);
  assert.equal(result.value.guards.noRuntimeDownload, true);
  assert.equal(result.value.guards.noDynamicExecutablePlugin, true);
});

test('E07 C07: failing RU fixture decertifies RU without mutating EN or promoting fallback', async () => {
  const derived = await loadModule(path.join('src', 'derived', 'index.mjs'));
  const corpus = readFixture();
  const ruCase = corpus.cases.find((corpusCase) => corpusCase.languageCode === 'ru');
  ruCase.observed = ruCase.observed.filter((signal) => signal.kind !== 'coreference');
  const certification = derived.deriveAtlasDeepFixtureCertification({ corpus });

  assert.equal(certification.state, 'degraded');
  assert.deepEqual(certification.summary.certifiedLanguageCodes, ['en']);
  assert.deepEqual(certification.summary.decertifiedLanguageCodes, ['ru']);

  const en = certification.languageRows.find((row) => row.languageCode === 'en');
  const ru = certification.languageRows.find((row) => row.languageCode === 'ru');
  assert.equal(en.status, derived.ATLAS_DEEP_FIXTURE_STATUS.CERTIFIED_DEEP_FIXTURE);
  assert.equal(en.precision, 1);
  assert.equal(en.recall, 1);
  assert.equal(ru.status, derived.ATLAS_DEEP_FIXTURE_STATUS.DECERTIFIED_BY_CORPUS);
  assert.equal(ru.deepSupported, false);
  assert.equal(ru.recall < 1, true);
  assert.equal(ru.englishFallback, false);
});

test('E07 C07: exports are present and sources keep local fixture boundaries closed', async () => {
  const derived = await loadModule(path.join('src', 'derived', 'index.mjs'));
  const atlas = await loadModule(path.join('src', 'derived', 'atlas', 'index.mjs'));

  assert.equal(derived.ATLAS_DEEP_FIXTURE_CERTIFICATION_SCHEMA_VERSION, 'derived.atlas.deepFixtureCertification.v1');
  assert.equal(derived.ATLAS_LANGUAGE_CAPABILITY_STATUS.CERTIFIED_DEEP_FIXTURE, 'CERTIFIED_DEEP_FIXTURE');
  assert.equal(atlas.ATLAS_DEEP_FIXTURE_STATUS.DEGRADED_TO_EXACT_ONLY, 'DEGRADED_TO_EXACT_ONLY');
  assert.equal(typeof derived.deriveAtlasDeepFixtureCertification, 'function');
  assert.equal(typeof derived.getAtlasRuEnDeepFixtureDefaultCorpus, 'function');
  assert.equal(typeof atlas.sortAtlasDeepFixtureRows, 'function');

  const sources = [
    'src/derived/atlas/atlasDeepFixtureCertificationTypes.mjs',
    'src/derived/atlas/deriveAtlasDeepFixtureCertification.mjs',
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
    /productionRuntimeClaim:\s*true/u,
    /releaseReadinessClaim:\s*true/u,
    /projectTruthMutation:\s*true/u,
    /manuscriptMutation:\s*true/u,
    /networkMutation:\s*true/u,
    /runtimeDownload:\s*true/u,
    /dynamicExecutablePlugin:\s*true/u,
  ];
  for (const [basename, source] of sources) {
    for (const pattern of forbiddenPatterns) {
      assert.doesNotMatch(source, pattern, `${basename} matched ${pattern.source}`);
    }
  }
});
