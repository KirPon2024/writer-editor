const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

async function loadModule(relativePath) {
  const fileUrl = pathToFileURL(path.join(process.cwd(), relativePath)).href;
  return import(fileUrl);
}

function loadUnicodeCorpus() {
  return JSON.parse(fs.readFileSync(path.join(process.cwd(), 'test', 'fixtures', 'atlas', 'language', 'unicode-edge-corpus.json'), 'utf8'));
}

async function buildUnicodeProjectFixture() {
  const runtime = await loadModule(path.join('src', 'core', 'runtime.mjs'));
  const projectId = 'atlas-unicode-anchor-project';
  const sceneId = 'scene-unicode';
  const text = 'Café meets Anna\r\nAnna uses 👩‍💻 tools near אבג‏.';
  const built = runtime.applyCoreSequence(runtime.createInitialCoreState(), [
    {
      type: runtime.CORE_COMMAND_IDS.PROJECT_CREATE,
      payload: { projectId, title: 'Atlas unicode anchors', sceneId },
    },
    {
      type: runtime.CORE_COMMAND_IDS.PROJECT_APPLY_TEXT_EDIT,
      payload: { projectId, sceneId, text },
    },
    {
      type: runtime.CORE_COMMAND_IDS.ATLAS_ENTITY_CREATE,
      payload: { projectId, entityId: 'entity-cafe', name: 'Café', entityKind: 'place' },
    },
    {
      type: runtime.CORE_COMMAND_IDS.ATLAS_ENTITY_CREATE,
      payload: { projectId, entityId: 'entity-dev', name: '👩‍💻', entityKind: 'symbol' },
    },
    {
      type: runtime.CORE_COMMAND_IDS.ATLAS_ENTITY_CREATE,
      payload: { projectId, entityId: 'entity-bidi', name: 'אבג‏', entityKind: 'term' },
    },
  ]);
  assert.equal(built.ok, true);
  return { projectId, sceneId, text, state: built.state };
}

test('E07 C02: text offset map preserves original Unicode while exposing UTF16 code point and grapheme domains', async () => {
  const derived = await loadModule(path.join('src', 'derived', 'index.mjs'));
  const corpus = loadUnicodeCorpus();

  assert.equal(corpus.schemaVersion, 'test.fixture.atlas.language.unicodeEdgeCorpus.v1');
  for (const entry of corpus.cases) {
    const offsetMap = derived.buildAtlasTextOffsetMap(entry.text);
    const startOffset = entry.text.indexOf(entry.target);
    assert.notEqual(startOffset, -1, entry.caseId);
    const packet = derived.buildAtlasTextAnchorPacket({
      projectId: 'project-unicode',
      sceneId: entry.caseId,
      entityId: `entity-${entry.caseId}`,
      termId: `term-${entry.caseId}`,
      startOffset,
      endOffset: startOffset + entry.target.length,
      sceneText: entry.text,
    });

    assert.equal(offsetMap.schemaVersion, derived.ATLAS_TEXT_OFFSET_MAP_SCHEMA_VERSION);
    assert.deepEqual(offsetMap.offsetDomains, [
      derived.ATLAS_TEXT_OFFSET_DOMAIN.UTF16_JS_CODE_UNIT,
      derived.ATLAS_TEXT_OFFSET_DOMAIN.UNICODE_CODE_POINT,
      derived.ATLAS_TEXT_OFFSET_DOMAIN.GRAPHEME_CLUSTER,
    ]);
    assert.equal(offsetMap.adapterOffsetDomain, derived.ATLAS_TEXT_OFFSET_DOMAIN.UTF16_JS_CODE_UNIT);
    assert.equal(offsetMap.normalizationMap.schemaVersion, derived.ATLAS_TEXT_NORMALIZATION_MAP_SCHEMA_VERSION);
    assert.equal(offsetMap.normalizationMap.destructiveNormalizationApplied, false);
    assert.equal(packet.schemaVersion, derived.ATLAS_TEXT_ANCHOR_PACKET_SCHEMA_VERSION);
    assert.equal(packet.evidenceAnchor.quote, entry.target);
    assert.equal(packet.evidenceAnchor.adapterOffsetDomain, derived.ATLAS_TEXT_OFFSET_DOMAIN.UTF16_JS_CODE_UNIT);
    assert.equal(packet.originalQuotePreserved, true);
    assert.equal(packet.destructiveNormalizationApplied, false);
    assert.match(packet.evidenceAnchor.quoteHash, /^[0-9a-f]{64}$/u);
    assert.match(packet.evidenceAnchor.sceneTextHash, /^[0-9a-f]{64}$/u);
    assert.equal(packet.evidenceAnchor.normalizationMap.originalTextHash, offsetMap.normalizationMap.originalTextHash);

    if (entry.expectedChangedByNfc === true) {
      assert.equal(offsetMap.normalizationMap.changedByNfc, true);
    }
    if (Number.isFinite(entry.expectedGraphemeLength)) {
      assert.equal(packet.evidenceAnchor.graphemeRange.length, entry.expectedGraphemeLength);
    }
    if (Number.isFinite(entry.expectedCrlfCount)) {
      assert.equal(offsetMap.crlfCount, entry.expectedCrlfCount);
    }
  }
});

test('E07 C02: mention evidence anchors carry offset-domain and normalization proof without changing anchor identity inputs', async () => {
  const { projectId, sceneId, text, state } = await buildUnicodeProjectFixture();
  const derived = await loadModule(path.join('src', 'derived', 'index.mjs'));
  const result = derived.deriveAtlasMentionIndex({ coreState: state, params: { projectId } });

  assert.equal(result.ok, true);
  const byQuote = new Map(result.value.mentions.map((mention) => [mention.evidenceAnchor.quote, mention]));
  for (const quote of ['Café', '👩‍💻', 'אבג‏']) {
    assert.equal(byQuote.has(quote), true, quote);
    const mention = byQuote.get(quote);
    const anchor = mention.evidenceAnchor;
    assert.equal(anchor.sceneId, sceneId);
    assert.equal(anchor.quote, quote);
    assert.equal(anchor.adapterOffsetDomain, derived.ATLAS_TEXT_OFFSET_DOMAIN.UTF16_JS_CODE_UNIT);
    assert.deepEqual(anchor.canonicalOffsetDomains, [
      derived.ATLAS_TEXT_OFFSET_DOMAIN.UTF16_JS_CODE_UNIT,
      derived.ATLAS_TEXT_OFFSET_DOMAIN.UNICODE_CODE_POINT,
      derived.ATLAS_TEXT_OFFSET_DOMAIN.GRAPHEME_CLUSTER,
    ]);
    assert.equal(anchor.normalizationMap.originalUtf16Length, text.length);
    assert.equal(anchor.normalizationMap.destructiveNormalizationApplied, false);
    assert.equal(anchor.prefixSelector, text.slice(Math.max(0, anchor.startOffset - 24), anchor.startOffset));
    assert.equal(anchor.suffixSelector, text.slice(anchor.endOffset, Math.min(text.length, anchor.endOffset + 24)));
    assert.equal(text.slice(anchor.startOffset, anchor.endOffset), quote);
  }
  assert.equal(byQuote.get('Café').evidenceAnchor.normalizationMap.changedByNfc, true);
  assert.equal(byQuote.get('👩‍💻').evidenceAnchor.graphemeRange.length, 1);
});

test('E07 C02: Unicode anchor helpers export through derived barrels', async () => {
  const derived = await loadModule(path.join('src', 'derived', 'index.mjs'));
  const atlas = await loadModule(path.join('src', 'derived', 'atlas', 'index.mjs'));

  assert.equal(derived.ATLAS_TEXT_OFFSET_MAP_SCHEMA_VERSION, 'derived.atlas.textOffsetMap.v1');
  assert.equal(derived.ATLAS_TEXT_ANCHOR_PACKET_SCHEMA_VERSION, 'derived.atlas.textAnchorPacket.v1');
  assert.equal(derived.ATLAS_TEXT_NORMALIZATION_MAP_SCHEMA_VERSION, 'derived.atlas.textNormalizationMap.v1');
  assert.equal(derived.ATLAS_TEXT_OFFSET_DOMAIN.UTF16_JS_CODE_UNIT, 'UTF16_JS_CODE_UNIT');
  assert.equal(typeof atlas.buildAtlasTextOffsetMap, 'function');
  assert.equal(typeof atlas.buildAtlasTextAnchorPacket, 'function');
});

test('E07 C02: Unicode anchor sources keep side-effect boundaries closed', () => {
  const sources = [
    'src/derived/atlas/atlasTextAnchorTypes.mjs',
    'src/derived/atlas/atlasTextAnchorNormalization.mjs',
    'src/derived/atlas/deriveAtlasMentionIndex.mjs',
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
