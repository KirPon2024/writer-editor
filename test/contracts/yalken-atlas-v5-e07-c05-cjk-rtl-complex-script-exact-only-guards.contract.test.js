const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

async function loadModule(relativePath) {
  const fileUrl = pathToFileURL(path.join(process.cwd(), relativePath)).href;
  return import(fileUrl);
}

function loadCorpus() {
  return JSON.parse(fs.readFileSync(path.join(
    process.cwd(),
    'test',
    'fixtures',
    'atlas',
    'language',
    'complex-script-exact-only-guard-corpus.json',
  ), 'utf8'));
}

function languageRow(report, languageCode) {
  return report.languageRows.find((row) => row.languageCode === languageCode);
}

function metricByCase(report, caseId) {
  return report.caseMetrics.find((metric) => metric.caseId === caseId);
}

function capabilityRow(report, claimLevel, languageCode) {
  return report.capabilityRows.find((row) => row.claimLevel === claimLevel && row.languageCode === languageCode);
}

async function buildProjectFixture() {
  const runtime = await loadModule(path.join('src', 'core', 'runtime.mjs'));
  const projectId = 'atlas-complex-script-guard-project';
  const created = runtime.applyCoreSequence(runtime.createInitialCoreState(), [
    {
      type: runtime.CORE_COMMAND_IDS.PROJECT_CREATE,
      payload: { projectId, title: 'Atlas complex scripts', sceneId: 'scene-a' },
    },
    {
      type: runtime.CORE_COMMAND_IDS.PROJECT_APPLY_TEXT_EDIT,
      payload: {
        projectId,
        sceneId: 'scene-a',
        text: '阿明見到小林。 מרים אמרה: דניאל חזר. Café met Café.',
      },
    },
  ]);
  assert.equal(created.ok, true);
  return { projectId, state: created.state };
}

test('E07 C05: complex-script guard certifies exact-only evidence preservation without segmentation or Deep claims', async () => {
  const derived = await loadModule(path.join('src', 'derived', 'index.mjs'));
  const report = derived.deriveAtlasComplexScriptExactOnlyGuards({ corpus: loadCorpus() });

  assert.equal(report.schemaVersion, derived.ATLAS_COMPLEX_SCRIPT_EXACT_ONLY_GUARD_SCHEMA_VERSION);
  assert.equal(report.analyzerId, derived.ATLAS_OBSERVATION_ANALYZER_ID);
  assert.equal(report.summary.caseCount, 9);
  assert.equal(report.summary.passedCaseCount, 9);
  assert.deepEqual(report.summary.guardedLanguageCodes, ['ar', 'he', 'hi', 'ja', 'ko', 'ta', 'und-combining', 'zh-hans', 'zh-hant']);
  assert.equal(report.summary.threshold.precision, 1);
  assert.equal(report.summary.threshold.recall, 1);
  assert.equal(report.summary.threshold.f1, 1);
  assert.equal(report.guards.originalUnicodePreserved, true);
  assert.equal(report.guards.noSegmentationClaim, true);
  assert.equal(report.guards.noMorphologyClaim, true);
  assert.equal(report.guards.noSilentEnglishFallback, true);
  assert.equal(report.guards.noDeepClaim, true);
  assert.equal(report.guards.noRuntimeDownload, true);

  for (const languageCode of report.summary.guardedLanguageCodes) {
    const row = languageRow(report, languageCode);
    assert.equal(row.status, derived.ATLAS_COMPLEX_SCRIPT_GUARD_STATUS.GUARDED_EXACT_ONLY);
    assert.equal(row.precision, 1);
    assert.equal(row.recall, 1);
    assert.equal(row.f1, 1);
    assert.equal(row.segmentationCertified, false);
    assert.equal(row.morphologyCertified, false);
    assert.equal(row.deepSupported, false);
    assert.equal(row.englishFallback, false);
  }
  assert.match(report.summary.guardHash, /^[0-9a-f]{64}$/u);
});

test('E07 C05: CJK fixtures prove exact phrase only and do not imply segmentation', async () => {
  const derived = await loadModule(path.join('src', 'derived', 'index.mjs'));
  const report = derived.deriveAtlasComplexScriptExactOnlyGuards({ corpus: loadCorpus() });

  for (const caseId of [
    'zh-hans-exact-phrase-no-segmentation',
    'zh-hant-exact-phrase-no-segmentation',
    'ja-exact-phrase-no-segmentation',
    'ko-exact-phrase-no-segmentation',
  ]) {
    const metric = metricByCase(report, caseId);
    assert.equal(metric.pass, true);
    assert.equal(metric.scriptClass, derived.ATLAS_COMPLEX_SCRIPT_CLASS.CJK);
    assert.equal(metric.segmentationCertified, false);
    assert.equal(metric.morphologyCertified, false);
    assert.equal(metric.falsePositiveCount, 0);
    assert.equal(metric.falseNegativeCount, 0);
    assert.equal(metric.observedMentionCount, 1);
  }
});

test('E07 C05: RTL Indic and combining fixtures preserve original anchors and offset domains', async () => {
  const derived = await loadModule(path.join('src', 'derived', 'index.mjs'));
  const report = derived.deriveAtlasComplexScriptExactOnlyGuards({ corpus: loadCorpus() });

  for (const caseId of [
    'ar-rtl-exact-phrase-bidi-preserved',
    'he-rtl-exact-phrase-bidi-preserved',
    'hi-complex-grapheme-exact-phrase',
    'ta-complex-grapheme-exact-phrase',
    'und-combining-original-preserved',
  ]) {
    const metric = metricByCase(report, caseId);
    assert.equal(metric.pass, true);
    assert.equal(metric.englishFallback, false);
    assert.equal(metric.deepSupported, false);
    assert.equal(metric.observed.every((item) => item.originalTextPreserved === true), true);
    assert.equal(metric.observed.every((item) => item.adapterOffsetDomain === derived.ATLAS_TEXT_OFFSET_DOMAIN.UTF16_JS_CODE_UNIT), true);
    assert.equal(metric.observed.every((item) => typeof item.quoteHash === 'string' && /^[0-9a-f]{64}$/u.test(item.quoteHash)), true);
  }

  const combining = metricByCase(report, 'und-combining-original-preserved');
  assert.equal(combining.observed.some((item) => item.matchedText === 'Café'), true);
  assert.equal(combining.observed.some((item) => item.matchedText === 'Café'), true);
});

test('E07 C05: language capability report marks complex scripts guarded exact-only but unsupported BASIC and Deep', async () => {
  const { projectId, state } = await buildProjectFixture();
  const derived = await loadModule(path.join('src', 'derived', 'index.mjs'));
  const result = derived.deriveAtlasLanguageCapabilityReport({
    coreState: state,
    params: {
      projectId,
      languageCodes: ['zh-Hans', 'zh-Hant', 'ja', 'ko', 'ar', 'he', 'hi', 'ta', 'en'],
      complexScriptGuardCorpus: loadCorpus(),
    },
    capabilitySnapshot: { platformId: 'node', capabilities: { atlasLanguageCapabilityReport: true } },
  });

  assert.equal(result.ok, true);
  assert.equal(result.value.complexScriptExactOnlyGuards.schemaVersion, derived.ATLAS_COMPLEX_SCRIPT_EXACT_ONLY_GUARD_SCHEMA_VERSION);
  assert.equal(result.value.summary.englishFallbackCount, 0);
  assert.equal(result.value.summary.falseDeepClaimCount, 0);

  for (const languageCode of ['ar', 'he', 'hi', 'ja', 'ko', 'ta', 'zh-hans', 'zh-hant']) {
    const row = capabilityRow(result.value, derived.ATLAS_LANGUAGE_CAPABILITY_LEVEL.GLOBAL, languageCode);
    assert.equal(row.status, derived.ATLAS_LANGUAGE_CAPABILITY_STATUS.UNSUPPORTED_EXACT_ONLY);
    assert.equal(row.corpusMetricsStatus, 'guarded-exact-only-by-e07-c05-complex-script-fixtures');
    assert.equal(row.unsupportedLanguageExactOnly, true);
    assert.equal(row.englishFallback, false);
    assert.equal(row.deepSupported, false);
    assert.equal(row.complexScriptGuard.status, derived.ATLAS_COMPLEX_SCRIPT_GUARD_STATUS.GUARDED_EXACT_ONLY);
    assert.equal(row.complexScriptGuard.segmentationCertified, false);
    assert.equal(row.complexScriptGuard.morphologyCertified, false);
  }

  const english = capabilityRow(result.value, derived.ATLAS_LANGUAGE_CAPABILITY_LEVEL.BASIC, 'en');
  assert.equal(english.status, derived.ATLAS_LANGUAGE_CAPABILITY_STATUS.CERTIFIED_EXACT_ONLY);
  assert.equal(english.complexScriptGuard, null);

  for (const languageCode of ['ar', 'he', 'hi', 'ja', 'ko', 'ta', 'zh-hans', 'zh-hant']) {
    const deep = capabilityRow(result.value, derived.ATLAS_LANGUAGE_CAPABILITY_LEVEL.DEEP, languageCode);
    assert.equal(deep.status, derived.ATLAS_LANGUAGE_CAPABILITY_STATUS.UNAVAILABLE);
    assert.equal(deep.englishFallback, false);
    assert.equal(deep.deepSupported, false);
  }
});

test('E07 C05: failing guard corpus decertifies only that complex script guard row', async () => {
  const derived = await loadModule(path.join('src', 'derived', 'index.mjs'));
  const broken = loadCorpus();
  broken.cases = broken.cases.map((item) => (
    item.caseId === 'zh-hans-exact-phrase-no-segmentation'
      ? {
        ...item,
        expectations: item.expectations.map((expectation) => (
          expectation.termId === 'zh-hans-phrase' ? { ...expectation, count: 2 } : expectation
        )),
      }
      : item
  ));

  const report = derived.deriveAtlasComplexScriptExactOnlyGuards({ corpus: broken });
  assert.equal(languageRow(report, 'zh-hans').status, derived.ATLAS_COMPLEX_SCRIPT_GUARD_STATUS.UNSUPPORTED_EXACT_ONLY);
  assert.equal(languageRow(report, 'zh-hant').status, derived.ATLAS_COMPLEX_SCRIPT_GUARD_STATUS.GUARDED_EXACT_ONLY);
  assert.equal(languageRow(report, 'ar').status, derived.ATLAS_COMPLEX_SCRIPT_GUARD_STATUS.GUARDED_EXACT_ONLY);
  assert.equal(report.authority.projectTruthMutation, false);
  assert.equal(report.authority.manuscriptMutation, false);
});

test('E07 C05: exports are available and complex-script guard sources keep side-effect boundaries closed', async () => {
  const derived = await loadModule(path.join('src', 'derived', 'index.mjs'));
  const atlas = await loadModule(path.join('src', 'derived', 'atlas', 'index.mjs'));

  assert.equal(derived.ATLAS_COMPLEX_SCRIPT_EXACT_ONLY_GUARD_SCHEMA_VERSION, 'derived.atlas.complexScriptExactOnlyGuard.v1');
  assert.equal(derived.ATLAS_COMPLEX_SCRIPT_GUARD_STATUS.GUARDED_EXACT_ONLY, 'GUARDED_EXACT_ONLY');
  assert.equal(derived.ATLAS_COMPLEX_SCRIPT_CLASS.RTL, 'RTL');
  assert.equal(typeof derived.deriveAtlasComplexScriptExactOnlyGuards, 'function');
  assert.equal(typeof atlas.deriveAtlasComplexScriptExactOnlyGuards, 'function');
  assert.equal(typeof derived.getAtlasComplexScriptExactOnlyGuardDefaultCorpus, 'function');

  const sources = [
    'src/derived/atlas/atlasComplexScriptGuardTypes.mjs',
    'src/derived/atlas/deriveAtlasComplexScriptExactOnlyGuards.mjs',
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
    /segmentationCertified:\s*true/u,
    /morphologyCertified:\s*true/u,
    /deepSupported:\s*true/u,
    /englishFallback:\s*true/u,
  ];
  for (const [basename, source] of sources) {
    for (const pattern of forbiddenPatterns) {
      assert.doesNotMatch(source, pattern, `${basename} matched ${pattern.source}`);
    }
  }
});
