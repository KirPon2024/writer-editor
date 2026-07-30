const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

async function loadModule(relativePath) {
  const fileUrl = pathToFileURL(path.join(process.cwd(), relativePath)).href;
  return import(fileUrl);
}

async function buildProjectFixture() {
  const runtime = await loadModule(path.join('src', 'core', 'runtime.mjs'));
  const projectId = 'atlas-language-capability-project';
  const built = runtime.applyCoreSequence(runtime.createInitialCoreState(), [
    {
      type: runtime.CORE_COMMAND_IDS.PROJECT_CREATE,
      payload: { projectId, title: 'Atlas language capability', sceneId: 'scene-a' },
    },
    {
      type: runtime.CORE_COMMAND_IDS.PROJECT_APPLY_TEXT_EDIT,
      payload: { projectId, sceneId: 'scene-a', text: 'Anna встретила Mira. 太郎 met מרים.' },
    },
    {
      type: runtime.CORE_COMMAND_IDS.ATLAS_ENTITY_CREATE,
      payload: { projectId, entityId: 'entity-anna', name: 'Anna', entityKind: 'character' },
    },
  ]);
  assert.equal(built.ok, true);
  return { projectId, state: built.state };
}

function rowBy(report, claimLevel, languageCode) {
  return report.capabilityRows.find((row) => row.claimLevel === claimLevel && row.languageCode === languageCode);
}

test('E07 C01: language capability report exposes truthful exact-only BASIC and unsupported rows', async () => {
  const { projectId, state } = await buildProjectFixture();
  const derived = await loadModule(path.join('src', 'derived', 'index.mjs'));
  const result = derived.deriveAtlasLanguageCapabilityReport({
    coreState: state,
    params: { projectId, languageCodes: ['en', 'ru', 'zh', 'ar', 'zz', 'und'] },
    capabilitySnapshot: { platformId: 'node', capabilities: { atlasLanguageCapabilityReport: true } },
  });

  assert.equal(result.ok, true);
  assert.equal(result.value.schemaVersion, derived.ATLAS_LANGUAGE_CAPABILITY_REPORT_SCHEMA_VERSION);
  assert.equal(result.value.state, 'ready');
  assert.equal(result.value.analyzer.analyzerId, derived.ATLAS_OBSERVATION_ANALYZER_ID);
  assert.equal(result.value.analyzer.currentRuntimeKind, 'BASIC_EXACT_TERM');
  assert.equal(result.value.analyzer.exactOnly, true);
  assert.equal(result.value.analyzer.deepRuntimeAvailable, false);
  assert.equal(result.value.summary.languageCount, 6);
  assert.equal(result.value.summary.rowCount, 12);
  assert.equal(result.value.summary.certifiedExactOnlyCount, 3);
  assert.equal(result.value.summary.unsupportedExactOnlyCount, 3);
  assert.equal(result.value.summary.deepUnavailableCount, 6);
  assert.equal(result.value.summary.falseDeepClaimCount, 0);
  assert.equal(result.value.summary.englishFallbackCount, 0);
  assert.match(result.value.summary.reportHash, /^[0-9a-f]{64}$/u);

  for (const languageCode of ['en', 'ru', 'und']) {
    const row = rowBy(result.value, derived.ATLAS_LANGUAGE_CAPABILITY_LEVEL.BASIC, languageCode);
    assert.equal(row.status, derived.ATLAS_LANGUAGE_CAPABILITY_STATUS.CERTIFIED_EXACT_ONLY);
    assert.equal(row.exactOnly, true);
    assert.equal(row.fuzzyMatching, false);
    assert.equal(row.englishFallback, false);
    assert.equal(row.deepSupported, false);
    assert.ok(row.certifiedCapabilities.includes('exactMentions'));
  }

  for (const languageCode of ['ar', 'zh', 'zz']) {
    const row = rowBy(result.value, derived.ATLAS_LANGUAGE_CAPABILITY_LEVEL.GLOBAL, languageCode);
    assert.equal(row.status, derived.ATLAS_LANGUAGE_CAPABILITY_STATUS.UNSUPPORTED_EXACT_ONLY);
    assert.equal(row.exactOnly, true);
    assert.equal(row.fuzzyMatching, false);
    assert.equal(row.englishFallback, false);
    assert.equal(row.unsupportedLanguageExactOnly, true);
  }

  for (const languageCode of ['ar', 'en', 'ru', 'und', 'zh', 'zz']) {
    const deep = rowBy(result.value, derived.ATLAS_LANGUAGE_CAPABILITY_LEVEL.DEEP, languageCode);
    assert.equal(deep.status, derived.ATLAS_LANGUAGE_CAPABILITY_STATUS.UNAVAILABLE);
    assert.equal(deep.deepSupported, false);
    assert.equal(deep.englishFallback, false);
    assert.equal(deep.corpusMetricsStatus, 'blocked-until-engine-decision-and-corpus-metrics');
  }

  assert.deepEqual(result.value.guards, {
    schemaVersion: derived.ATLAS_LANGUAGE_CAPABILITY_GUARD_SCHEMA_VERSION,
    noSilentEnglishFallback: true,
    unsupportedExactOnly: true,
    noDeepWithoutMetrics: true,
    noAutomaticTruthMutation: true,
    noRuntimeDownload: true,
    noDynamicExecutablePlugin: true,
  });
  assert.equal(result.value.authority.projectTruthMutation, false);
  assert.equal(result.value.authority.manuscriptMutation, false);
  assert.equal(result.value.authority.networkMutation, false);
  assert.equal(result.value.authority.runtimeDownload, false);
});

test('E07 C01: language capability report normalizes codes and fails closed for missing project or disabled capability', async () => {
  const { projectId, state } = await buildProjectFixture();
  const derived = await loadModule(path.join('src', 'derived', 'index.mjs'));
  const normalized = derived.deriveAtlasLanguageCapabilityReport({
    coreState: state,
    params: { projectId, languageCodes: ['EN', 'en', 'pt_BR', '', 'ZH-Hant'] },
  });
  assert.equal(normalized.ok, true);
  assert.deepEqual(
    normalized.value.capabilityRows
      .filter((row) => row.claimLevel !== derived.ATLAS_LANGUAGE_CAPABILITY_LEVEL.DEEP)
      .map((row) => row.languageCode),
    ['en', 'und', 'pt-br', 'zh-hant'],
  );
  assert.equal(rowBy(normalized.value, derived.ATLAS_LANGUAGE_CAPABILITY_LEVEL.GLOBAL, 'pt-br').status, derived.ATLAS_LANGUAGE_CAPABILITY_STATUS.UNSUPPORTED_EXACT_ONLY);
  assert.equal(rowBy(normalized.value, derived.ATLAS_LANGUAGE_CAPABILITY_LEVEL.GLOBAL, 'zh-hant').englishFallback, false);

  const missingProjectId = derived.deriveAtlasLanguageCapabilityReport({ coreState: state, params: {} });
  assert.equal(missingProjectId.ok, false);
  assert.equal(missingProjectId.error.code, 'E_ATLAS_PROJECT_ID_REQUIRED');

  const missingProject = derived.deriveAtlasLanguageCapabilityReport({ coreState: state, params: { projectId: 'missing-project' } });
  assert.equal(missingProject.ok, false);
  assert.equal(missingProject.error.code, 'E_ATLAS_PROJECT_NOT_FOUND');

  const disabled = derived.deriveAtlasLanguageCapabilityReport({
    coreState: state,
    params: { projectId },
    capabilitySnapshot: { capabilities: { atlasLanguageCapabilityReport: false } },
  });
  assert.equal(disabled.ok, false);
  assert.equal(disabled.error.code, 'E_CAPABILITY_DISABLED_FOR_COMMAND');
  assert.equal(disabled.error.details.capabilityId, 'atlas.languageCapabilityReport');
});

test('E07 C01: language capability symbols export through derived barrels', async () => {
  const derived = await loadModule(path.join('src', 'derived', 'index.mjs'));
  const atlas = await loadModule(path.join('src', 'derived', 'atlas', 'index.mjs'));

  assert.equal(derived.ATLAS_LANGUAGE_CAPABILITY_REPORT_SCHEMA_VERSION, 'derived.atlas.languageCapabilityReport.v1');
  assert.equal(derived.ATLAS_LANGUAGE_CAPABILITY_ROW_SCHEMA_VERSION, 'derived.atlas.languageCapabilityRow.v1');
  assert.equal(derived.ATLAS_LANGUAGE_CAPABILITY_GUARD_SCHEMA_VERSION, 'derived.atlas.languageCapabilityGuard.v1');
  assert.equal(derived.ATLAS_LANGUAGE_CAPABILITY_REPORT_VIEW_ID, 'derived.atlas.languageCapabilityReport.v1');
  assert.equal(derived.ATLAS_LANGUAGE_CAPABILITY_LEVEL.DEEP, 'DEEP');
  assert.equal(atlas.ATLAS_LANGUAGE_CAPABILITY_STATUS.UNSUPPORTED_EXACT_ONLY, 'UNSUPPORTED_EXACT_ONLY');
  assert.equal(typeof atlas.deriveAtlasLanguageCapabilityReport, 'function');
  assert.equal(typeof derived.sortAtlasLanguageCapabilityRows, 'function');
});

test('E07 C01: language capability report sources keep side-effect boundaries closed', () => {
  const sources = [
    'src/derived/atlas/deriveAtlasLanguageCapabilityReport.mjs',
    'src/derived/atlas/atlasLanguageCapabilityTypes.mjs',
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
  ];
  for (const [basename, source] of sources) {
    for (const pattern of forbiddenPatterns) {
      assert.doesNotMatch(source, pattern, `${basename} matched ${pattern.source}`);
    }
  }
});
