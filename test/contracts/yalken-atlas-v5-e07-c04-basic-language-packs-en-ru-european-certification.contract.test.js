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
    'basic-language-pack-certification-corpus.json',
  ), 'utf8'));
}

function rowByLanguage(report, languageCode) {
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
  const projectId = 'atlas-basic-language-pack-project';
  const created = runtime.applyCoreSequence(runtime.createInitialCoreState(), [
    {
      type: runtime.CORE_COMMAND_IDS.PROJECT_CREATE,
      payload: { projectId, title: 'Atlas language packs', sceneId: 'scene-a' },
    },
    {
      type: runtime.CORE_COMMAND_IDS.PROJECT_APPLY_TEXT_EDIT,
      payload: {
        projectId,
        sceneId: 'scene-a',
        text: 'Dr. Bell met Мария and Élodie. Семён stayed with Müller.',
      },
    },
  ]);
  assert.equal(created.ok, true);
  return { projectId, state: created.state };
}

test('E07 C04: BASIC language pack certification proves EN RU and bounded European exact-only metrics', async () => {
  const corpus = loadCorpus();
  const derived = await loadModule(path.join('src', 'derived', 'index.mjs'));
  const report = derived.deriveAtlasBasicLanguagePackCertification({ corpus });

  assert.equal(report.schemaVersion, derived.ATLAS_BASIC_LANGUAGE_PACK_CERTIFICATION_SCHEMA_VERSION);
  assert.equal(report.contract.schemaVersion, derived.ATLAS_BASIC_LANGUAGE_PACK_CONTRACT_SCHEMA_VERSION);
  assert.equal(report.contract.analyzerId, derived.ATLAS_OBSERVATION_ANALYZER_ID);
  assert.equal(report.contract.exactOnly, true);
  assert.equal(report.contract.fuzzyMatching, false);
  assert.equal(report.contract.segmentationEngine, false);
  assert.equal(report.contract.englishFallback, false);
  assert.equal(report.contract.deepSupported, false);
  assert.equal(report.contract.runtimeDownload, false);
  assert.equal(report.contract.dynamicExecutablePlugin, false);
  assert.equal(report.summary.threshold.precision, 1);
  assert.equal(report.summary.threshold.recall, 1);
  assert.equal(report.summary.threshold.f1, 1);
  assert.deepEqual(report.summary.certifiedLanguageCodes, ['de', 'en', 'es', 'fr', 'pl', 'ru', 'und']);

  for (const languageCode of ['en', 'ru', 'de', 'es', 'fr', 'pl', 'und']) {
    const row = rowByLanguage(report, languageCode);
    assert.equal(row.status, derived.ATLAS_BASIC_LANGUAGE_PACK_STATUS.CERTIFIED_EXACT_ONLY);
    assert.equal(row.precision, 1);
    assert.equal(row.recall, 1);
    assert.equal(row.f1, 1);
    assert.equal(row.englishFallback, false);
    assert.equal(row.deepSupported, false);
  }

  for (const languageCode of ['it', 'pt-br', 'zh-hant']) {
    const row = rowByLanguage(report, languageCode);
    assert.equal(row.status, derived.ATLAS_BASIC_LANGUAGE_PACK_STATUS.UNSUPPORTED_EXACT_ONLY);
    assert.equal(row.acceptedForCertification, false);
    assert.equal(row.englishFallback, false);
  }

  assert.ok(rowByLanguage(report, 'en').claims.includes(derived.ATLAS_BASIC_LANGUAGE_PACK_CLAIM.CONTRACTION_LITERAL));
  assert.ok(rowByLanguage(report, 'en').claims.includes(derived.ATLAS_BASIC_LANGUAGE_PACK_CLAIM.POSSESSIVE_LITERAL));
  assert.ok(rowByLanguage(report, 'ru').claims.includes(derived.ATLAS_BASIC_LANGUAGE_PACK_CLAIM.DIACRITIC_PRESERVING));
  assert.match(report.summary.certificationHash, /^[0-9a-f]{64}$/u);
});

test('E07 C04: fixture cases cover punctuation quotes names contractions possessives patronymics and e-yo preservation', async () => {
  const derived = await loadModule(path.join('src', 'derived', 'index.mjs'));
  const report = derived.deriveAtlasBasicLanguagePackCertification({ corpus: loadCorpus() });

  const englishNames = metricByCase(report, 'en-punctuation-quotes-names');
  assert.equal(englishNames.pass, true);
  assert.deepEqual(englishNames.dimensions, ['names', 'punctuation', 'quotes']);
  assert.equal(englishNames.observedMentionCount, 3);
  assert.equal(englishNames.falsePositiveCount, 0);
  assert.equal(englishNames.observed.filter((item) => item.termId === 'mira').length, 2);

  const englishContractions = metricByCase(report, 'en-contractions-possessives');
  assert.equal(englishContractions.pass, true);
  assert.deepEqual(englishContractions.dimensions, ['contractions', 'possessives']);
  assert.equal(englishContractions.observed.some((item) => item.matchedText === "Anna's"), true);
  assert.equal(englishContractions.observed.some((item) => item.matchedText === "can't"), true);

  const russianNames = metricByCase(report, 'ru-patronymic-surname-quotes');
  assert.equal(russianNames.pass, true);
  assert.deepEqual(russianNames.dimensions, ['patronymic', 'punctuation', 'quotes', 'surname']);
  assert.equal(russianNames.observed.some((item) => item.matchedText === 'Мария Ивановна Соколова'), true);

  const russianYo = metricByCase(report, 'ru-e-yo-preservation');
  assert.equal(russianYo.pass, true);
  assert.deepEqual(russianYo.dimensions, ['e-yo-preservation']);
  assert.equal(russianYo.observed.filter((item) => item.matchedText === 'Семён').length, 2);
  assert.equal(russianYo.observed.some((item) => item.matchedText === 'Семен'), false);
});

test('E07 C04: language capability report binds certification rows without English fallback or Deep claims', async () => {
  const { projectId, state } = await buildProjectFixture();
  const derived = await loadModule(path.join('src', 'derived', 'index.mjs'));
  const result = derived.deriveAtlasLanguageCapabilityReport({
    coreState: state,
    params: {
      projectId,
      languageCodes: ['en', 'ru', 'de', 'fr', 'pt_BR', 'zh-Hant', 'ar'],
      basicLanguagePackCorpus: loadCorpus(),
    },
    capabilitySnapshot: { platformId: 'node', capabilities: { atlasLanguageCapabilityReport: true } },
  });

  assert.equal(result.ok, true);
  assert.equal(result.value.basicLanguagePackCertification.schemaVersion, derived.ATLAS_BASIC_LANGUAGE_PACK_CERTIFICATION_SCHEMA_VERSION);
  assert.equal(result.value.summary.languageCount, 7);
  assert.equal(result.value.summary.certifiedExactOnlyCount, 4);
  assert.equal(result.value.summary.unsupportedExactOnlyCount, 3);
  assert.equal(result.value.summary.deepUnavailableCount, 7);
  assert.equal(result.value.summary.englishFallbackCount, 0);
  assert.equal(result.value.summary.falseDeepClaimCount, 0);

  for (const languageCode of ['de', 'en', 'fr', 'ru']) {
    const row = capabilityRow(result.value, derived.ATLAS_LANGUAGE_CAPABILITY_LEVEL.BASIC, languageCode);
    assert.equal(row.status, derived.ATLAS_LANGUAGE_CAPABILITY_STATUS.CERTIFIED_EXACT_ONLY);
    assert.equal(row.corpusMetricsStatus, 'certified-by-e07-c04-basic-fixtures');
    assert.equal(row.corpusMetrics.precision, 1);
    assert.equal(row.corpusMetrics.recall, 1);
    assert.equal(row.corpusMetrics.f1, 1);
    assert.equal(row.englishFallback, false);
    assert.equal(row.deepSupported, false);
    assert.ok(row.languagePackClaims.length > 0);
  }

  for (const languageCode of ['ar', 'pt-br', 'zh-hant']) {
    const row = capabilityRow(result.value, derived.ATLAS_LANGUAGE_CAPABILITY_LEVEL.GLOBAL, languageCode);
    assert.equal(row.status, derived.ATLAS_LANGUAGE_CAPABILITY_STATUS.UNSUPPORTED_EXACT_ONLY);
    assert.equal(row.corpusMetricsStatus, 'unsupported-or-not-certified-by-e07-c04-basic-fixtures');
    assert.equal(row.englishFallback, false);
    assert.equal(row.unsupportedLanguageExactOnly, true);
  }

  for (const languageCode of ['ar', 'de', 'en', 'fr', 'pt-br', 'ru', 'zh-hant']) {
    const deep = capabilityRow(result.value, derived.ATLAS_LANGUAGE_CAPABILITY_LEVEL.DEEP, languageCode);
    assert.equal(deep.status, derived.ATLAS_LANGUAGE_CAPABILITY_STATUS.UNAVAILABLE);
    assert.equal(deep.deepSupported, false);
    assert.equal(deep.englishFallback, false);
  }
});

test('E07 C04: failing or unsupported corpus rows decertify locally without mutating EN RU certified rows', async () => {
  const derived = await loadModule(path.join('src', 'derived', 'index.mjs'));
  const corpus = loadCorpus();
  const broken = JSON.parse(JSON.stringify(corpus));
  broken.cases.push({
    caseId: 'it-failing-proof',
    languageCode: 'it',
    dimensions: ['negative-certification'],
    text: 'Giulia saw Giulietta.',
    terms: [{ termId: 'giulia', value: 'Giulia' }],
    expectations: [{ termId: 'giulia', count: 2 }]
  });
  broken.languages = broken.languages.map((language) => (
    language.languageCode === 'it' ? { ...language, accepted: true, claims: ['exactBoundaryMention'] } : language
  ));

  const report = derived.deriveAtlasBasicLanguagePackCertification({ corpus: broken });
  assert.equal(rowByLanguage(report, 'it').status, derived.ATLAS_BASIC_LANGUAGE_PACK_STATUS.UNSUPPORTED_EXACT_ONLY);
  assert.equal(rowByLanguage(report, 'it').recall, 0.5);
  assert.equal(rowByLanguage(report, 'en').status, derived.ATLAS_BASIC_LANGUAGE_PACK_STATUS.CERTIFIED_EXACT_ONLY);
  assert.equal(rowByLanguage(report, 'ru').status, derived.ATLAS_BASIC_LANGUAGE_PACK_STATUS.CERTIFIED_EXACT_ONLY);
  assert.equal(report.authority.projectTruthMutation, false);
  assert.equal(report.authority.manuscriptMutation, false);
});

test('E07 C04: exports are available and language certification sources keep side-effect boundaries closed', async () => {
  const derived = await loadModule(path.join('src', 'derived', 'index.mjs'));
  const atlas = await loadModule(path.join('src', 'derived', 'atlas', 'index.mjs'));

  assert.equal(derived.ATLAS_BASIC_LANGUAGE_PACK_CONTRACT_SCHEMA_VERSION, 'derived.atlas.basicLanguagePackContract.v1');
  assert.equal(derived.ATLAS_BASIC_LANGUAGE_PACK_CERTIFICATION_SCHEMA_VERSION, 'derived.atlas.basicLanguagePackCertification.v1');
  assert.equal(derived.ATLAS_BASIC_LANGUAGE_PACK_STATUS.CERTIFIED_EXACT_ONLY, 'CERTIFIED_EXACT_ONLY');
  assert.equal(typeof derived.deriveAtlasBasicLanguagePackCertification, 'function');
  assert.equal(typeof atlas.deriveAtlasBasicLanguagePackCertification, 'function');
  assert.equal(typeof derived.getAtlasBasicLanguagePackDefaultCorpus, 'function');

  const sources = [
    'src/derived/atlas/atlasBasicLanguagePackTypes.mjs',
    'src/derived/atlas/deriveAtlasBasicLanguagePackCertification.mjs',
    'src/derived/atlas/deriveAtlasLanguageCapabilityReport.mjs',
    'src/derived/atlas/atlasObservationTypes.mjs',
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
    /DEEP_SUPPORTED/u,
    /englishFallback:\s*true/u,
  ];
  for (const [basename, source] of sources) {
    for (const pattern of forbiddenPatterns) {
      assert.doesNotMatch(source, pattern, `${basename} matched ${pattern.source}`);
    }
  }
});
