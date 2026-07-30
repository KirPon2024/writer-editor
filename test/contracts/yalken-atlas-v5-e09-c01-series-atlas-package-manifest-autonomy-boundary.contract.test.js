const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

async function loadModule(relativePath) {
  const fileUrl = pathToFileURL(path.join(process.cwd(), relativePath)).href;
  return import(fileUrl);
}

function readReceipt(basename) {
  return JSON.parse(fs.readFileSync(path.join(process.cwd(), 'docs', 'OPS', 'STATUS', basename), 'utf8'));
}

function readSource(relativePath) {
  return fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8');
}

async function buildSeriesFixture() {
  const runtime = await loadModule(path.join('src', 'core', 'runtime.mjs'));
  const derived = await loadModule(path.join('src', 'derived', 'index.mjs'));
  const projectId = 'series-current-book';
  const sceneId = 'scene-a';
  const created = runtime.applyCoreSequence(runtime.createInitialCoreState(), [
    {
      type: runtime.CORE_COMMAND_IDS.PROJECT_CREATE,
      payload: { projectId, title: 'Book One', sceneId },
    },
    {
      type: runtime.CORE_COMMAND_IDS.PROJECT_APPLY_TEXT_EDIT,
      payload: {
        projectId,
        sceneId,
        text: 'Mira chooses duty over crown.',
      },
    },
    {
      type: runtime.CORE_COMMAND_IDS.ATLAS_ENTITY_CREATE,
      payload: { projectId, entityId: 'mira', name: 'Mira', entityKind: 'character' },
    },
    {
      type: runtime.CORE_COMMAND_IDS.MANUAL_MAP_CREATE,
      payload: { projectId, mapId: 'series-map', title: 'Series Map' },
    },
  ]);
  assert.equal(created.ok, true);
  return { runtime, derived, projectId, state: created.state };
}

function externalBookRefs(derived) {
  return [
    {
      projectId: 'series-book-two',
      bookId: 'book-two',
      title: 'Book Two',
      sourceHash: derived.hashCanonicalValue({ book: 2 }),
      authorTruthHash: derived.hashCanonicalValue({ atlas: ['mira'] }),
      languageTagsHash: derived.hashCanonicalValue({ languages: ['en', 'ru'] }),
      evidenceIdentityHash: derived.hashCanonicalValue({ evidence: ['mira:scene-b'] }),
      unknownFieldsHash: derived.hashCanonicalValue({ future: true }),
    },
    {
      projectId: 'series-book-three',
      bookId: 'book-three',
      title: 'Book Three',
      sourceHash: derived.hashCanonicalValue({ book: 3 }),
    },
  ];
}

test('E09 C01: series package manifest is pathless, deterministic, and keeps every book autonomous', async () => {
  const { derived, projectId, state } = await buildSeriesFixture();
  const params = {
    projectId,
    seriesId: 'series-yalken',
    title: 'Yalken Series',
    bookRefs: externalBookRefs(derived).reverse(),
  };
  const first = derived.deriveAtlasSeriesPackageManifest({
    coreState: state,
    params,
    capabilitySnapshot: { platformId: 'node', capabilities: { atlasSeriesPackageManifest: true } },
  });
  const second = derived.deriveAtlasSeriesPackageManifest({
    coreState: JSON.parse(JSON.stringify(state)),
    params: JSON.parse(JSON.stringify(params)),
    capabilitySnapshot: { platformId: 'node', capabilities: { atlasSeriesPackageManifest: true } },
  });

  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  assert.equal(first.value.schemaVersion, derived.ATLAS_SERIES_PACKAGE_MANIFEST_SCHEMA_VERSION);
  assert.equal(first.value.meta.packageHash, second.value.meta.packageHash);
  assert.match(first.value.meta.packageHash, /^[0-9a-f]{64}$/u);
  assert.equal(first.value.projectId, projectId);
  assert.equal(first.value.seriesId, 'series-yalken');
  assert.deepEqual(first.value.bookRefs.map((ref) => ref.projectId), [
    'series-current-book',
    'series-book-three',
    'series-book-two',
  ]);
  assert.equal(first.value.summary.bookCount, 3);
  assert.equal(first.value.summary.externalBookRefCount, 2);
  assert.equal(first.value.summary.currentBookIncluded, true);
  assert.equal(first.value.privacy.pathless, true);
  assert.equal(first.value.privacy.containsPrivatePath, false);
  assert.equal(first.value.privacy.embeddedBookContent, false);
  assert.equal(first.value.privacy.containsManuscriptText, false);
  for (const ref of first.value.bookRefs) {
    assert.equal(ref.schemaVersion, derived.ATLAS_SERIES_PACKAGE_BOOK_REF_SCHEMA_VERSION);
    assert.equal(ref.pathless, true);
    assert.equal(ref.containsPrivatePath, false);
    assert.equal(ref.embeddedBookContent, false);
    assert.equal(ref.packageRequiredToOpen, false);
    assert.match(ref.bookRefId, /^series-book:[0-9a-f]{64}$/u);
  }
});

test('E09 C01: autonomy proof blocks silent source rewrites and all mutation authorities', async () => {
  const { derived, projectId, state } = await buildSeriesFixture();
  const beforeHash = derived.hashCanonicalValue(state);
  const result = derived.deriveAtlasSeriesPackageManifest({
    coreState: state,
    params: { projectId, bookRefs: externalBookRefs(derived) },
    capabilitySnapshot: { platformId: 'node', capabilities: { atlasSeriesPackageManifest: true } },
  });
  const afterHash = derived.hashCanonicalValue(state);

  assert.equal(result.ok, true);
  assert.equal(beforeHash, afterHash);
  assert.equal(result.value.autonomyProof.schemaVersion, derived.ATLAS_SERIES_PACKAGE_AUTONOMY_PROOF_SCHEMA_VERSION);
  assert.equal(result.value.autonomyProof.eachBookOpensWithoutSeriesPackage, true);
  assert.equal(result.value.autonomyProof.pathlessBookReferences, true);
  assert.equal(result.value.autonomyProof.sourceProjectRewrite, false);
  assert.equal(result.value.autonomyProof.silentProjectTruthRewrite, false);
  assert.equal(result.value.autonomyProof.projectTruthMutation, false);
  assert.equal(result.value.autonomyProof.manuscriptMutation, false);
  assert.equal(result.value.autonomyProof.storageMutation, false);
  assert.equal(result.value.autonomyProof.networkMutation, false);
  assert.equal(result.value.autonomyProof.rendererMutation, false);
  assert.equal(result.value.authority.readModelOnly, true);
  assert.equal(result.value.authority.commandAuthority, 'none');
  assert.equal(result.value.authority.sourceProjectRewrite, false);
  assert.equal(result.value.authority.silentProjectTruthRewrite, false);
  assert.equal(result.value.authority.projectTruthMutation, false);
});

test('E09 C01: private paths and embedded content fail closed before manifest output', async () => {
  const { derived, projectId, state } = await buildSeriesFixture();
  const attempts = [
    { projectId: 'bad-path', bookId: 'bad', filePath: '/private/book.yalken' },
    { projectId: 'bad-url', bookId: 'bad', url: 'https://example.invalid/book.yalken' },
    { projectId: 'bad-content', bookId: 'bad', content: 'whole manuscript' },
    { projectId: 'bad-nested', bookId: 'bad', metadata: { base64: 'AAAA' } },
  ];

  for (const ref of attempts) {
    const result = derived.deriveAtlasSeriesPackageManifest({
      coreState: state,
      params: { projectId, bookRefs: [ref] },
      capabilitySnapshot: { platformId: 'node', capabilities: { atlasSeriesPackageManifest: true } },
    });
    assert.equal(result.ok, false);
    assert.equal(result.error.code, 'E_ATLAS_SERIES_PACKAGE_PRIVATE_FIELD');
    assert.equal(result.error.reason, 'PRIVATE_FIELD_DENIED');
  }
});

test('E09 C01: capability disabled and missing project fail closed without fallback package truth', async () => {
  const { derived, projectId, state } = await buildSeriesFixture();
  const disabled = derived.deriveAtlasSeriesPackageManifest({
    coreState: state,
    params: { projectId, bookRefs: externalBookRefs(derived) },
    capabilitySnapshot: { platformId: 'node', capabilities: { atlasSeriesPackageManifest: false } },
  });
  const missing = derived.deriveAtlasSeriesPackageManifest({
    coreState: state,
    params: { projectId: 'missing-project' },
    capabilitySnapshot: { platformId: 'node', capabilities: { atlasSeriesPackageManifest: true } },
  });

  assert.equal(disabled.ok, false);
  assert.equal(disabled.error.reason, 'ATLAS_SERIES_PACKAGE_MANIFEST_DISABLED');
  assert.equal(missing.ok, false);
  assert.equal(missing.error.reason, 'PROJECT_NOT_FOUND');
});

test('E09 C01: receipt binds manifest scope and handoff to E09 C02', () => {
  const receipt = readReceipt('YALKEN_ATLAS_V5_E09_C01_SERIES_ATLAS_PACKAGE_MANIFEST_AUTONOMY_BOUNDARY_RECEIPT.json');

  assert.equal(receipt.schemaVersion, 1);
  assert.equal(receipt.contourId, 'E09_C01_SERIES_ATLAS_PACKAGE_MANIFEST_AND_AUTONOMY_BOUNDARY');
  assert.equal(receipt.programStage, 'E09_STAGE_09_SERIES_AND_PORTABILITY_CONTOURS');
  assert.equal(receipt.baseSha, 'd32ad052efde4469aaf52f4df19d6a5f611883de');
  assert.equal(receipt.designToolRouter, 'NOT_APPLICABLE');
  assert.equal(receipt.runtimeFacts.seriesPackageManifestExists, true);
  assert.equal(receipt.runtimeFacts.crossBookIdentityApplyExists, false);
  assert.equal(receipt.runtimeFacts.projectTruthMutation, false);
  assert.ok(receipt.implementedBoundary.scopeIn.includes('pathless book reference rows'));
  assert.ok(receipt.implementedBoundary.scopeIn.includes('book autonomy proof'));
  assert.ok(receipt.implementedBoundary.scopeOut.includes('automatic cross-book identity merge'));
  assert.ok(receipt.implementedBoundary.scopeOut.includes('renderer series UI'));
  assert.equal(receipt.nextContour, 'E09_C02_CROSS_BOOK_IDENTITY_AND_VOCABULARY_PORTABILITY');
});

test('E09 C01: series package sources export through barrels and contain no storage network UI or command bypass', async () => {
  const derived = await loadModule(path.join('src', 'derived', 'index.mjs'));
  const atlas = await loadModule(path.join('src', 'derived', 'atlas', 'index.mjs'));

  assert.equal(derived.deriveAtlasSeriesPackageManifest, atlas.deriveAtlasSeriesPackageManifest);
  assert.equal(derived.ATLAS_SERIES_PACKAGE_MANIFEST_SCHEMA_VERSION, 'derived.atlas.seriesPackageManifest.v1');
  assert.equal(derived.ATLAS_SERIES_PACKAGE_MANIFEST_VIEW_ID, 'derived.atlas.seriesPackageManifest.v1');

  const sources = [
    'src/derived/atlas/atlasSeriesPackageTypes.mjs',
    'src/derived/atlas/deriveAtlasSeriesPackageManifest.mjs',
    'src/derived/atlas/index.mjs',
    'src/derived/index.mjs',
  ];
  const forbidden = [
    /from\s+['"]node:fs['"]/u,
    /from\s+['"]node:child_process['"]/u,
    /from\s+['"]node:http['"]/u,
    /from\s+['"]node:https['"]/u,
    /from\s+['"]node:net['"]/u,
    /from\s+['"]electron['"]/u,
    /document\./u,
    /querySelector/u,
    /new\s+Worker\b/u,
    /\bsetTimeout\b/u,
    /\bsetInterval\b/u,
    /\bwriteFile(?:Sync)?\s*\(/u,
    /\bappendFile(?:Sync)?\s*\(/u,
    /\blocalStorage\b/u,
    /\bsessionStorage\b/u,
    /\bindexedDB\b/u,
    /dispatchUiCommand/u,
    /sendCanonicalRuntimeCommand/u,
    /projectTruthMutation:\s*true/u,
    /manuscriptMutation:\s*true/u,
    /storageMutation:\s*true/u,
    /networkMutation:\s*true/u,
    /rendererMutation:\s*true/u,
    /silentProjectTruthRewrite:\s*true/u,
  ];
  for (const relativePath of sources) {
    const source = readSource(relativePath);
    for (const pattern of forbidden) {
      assert.doesNotMatch(source, pattern, `${path.basename(relativePath)} matched ${pattern.source}`);
    }
  }
});
