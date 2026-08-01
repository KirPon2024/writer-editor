const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { pathToFileURL } = require('node:url');

async function loadModule(relativePath) {
  const fileUrl = pathToFileURL(path.join(process.cwd(), relativePath)).href;
  return import(fileUrl);
}

test('R3 C04: runner proves multilingual routing, lossless author quarantine, stale worker stress, and no silent partial search cap', () => {
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'yalken-r3-c04-'));
  const run = spawnSync(process.execPath, [
    'scripts/ops/yalken-atlas-v5-r3-c04-multilingual-worker-stress.mjs',
    '--out',
    outDir,
  ], {
    cwd: process.cwd(),
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  assert.equal(run.status, 0, `R3 C04 runner failed:\n${run.stdout}\n${run.stderr}`);
  const summary = JSON.parse(run.stdout);
  assert.equal(summary.status, 'PASS_R3_C04_MULTILINGUAL_WORKER_STRESS');
  assert.deepEqual(summary.failures, []);
  const report = JSON.parse(fs.readFileSync(summary.reportPath, 'utf8'));
  assert.equal(report.pass, true);
  assert.equal(report.futureSchemaQuarantine.quarantined, true);
  assert.equal(report.futureSchemaQuarantine.futureEntityPreserved, true);
  assert.equal(report.knownSchemaUnknownFields.preserved, true);
  assert.equal(report.splitGraphemeRejections.languageTagRejected, true);
  assert.equal(report.splitGraphemeRejections.evidenceRejected, true);
  assert.equal(report.multilingualRouting.allSegmentsMatched, true);
  assert.equal(report.multilingualRouting.allExpectedLanguages, true);
  assert.equal(report.multilingualRouting.exactOnlyNoFallback, true);
  assert.equal(report.workerStress.run50k.executionMode, 'worker-thread');
  assert.equal(report.workerStress.run50k.plannedEdges > 0, true);
  assert.equal(report.workerStress.staleIdentityRejected, true);
  assert.equal(report.workerStress.staleRevisionRejected, true);
  assert.equal(report.workerStress.accepted50kPointerOnly, true);
  assert.equal(report.searchProjection.candidateSliceRemoved, true);
});

test('R3 C04: Core rejects split-grapheme language tag ranges and evidence anchors', async () => {
  const runtime = await loadModule(path.join('src', 'core', 'runtime.mjs'));
  const derived = await loadModule(path.join('src', 'derived', 'index.mjs'));
  const projectId = 'r3-c04-split-grapheme-contract';
  const sceneId = 'scene-r3-c04';
  const text = 'Unicode 👩‍💻 anchor';
  const built = runtime.applyCoreSequence(runtime.createInitialCoreState(), [
    { type: runtime.CORE_COMMAND_IDS.PROJECT_CREATE, payload: { projectId, title: 'split grapheme', sceneId } },
    { type: runtime.CORE_COMMAND_IDS.PROJECT_APPLY_TEXT_EDIT, payload: { projectId, sceneId, text } },
    { type: runtime.CORE_COMMAND_IDS.ATLAS_ENTITY_CREATE, payload: { projectId, entityId: 'entity-emoji', name: '👩‍💻', entityKind: 'symbol' } },
  ]);
  assert.equal(built.ok, true);
  const start = text.indexOf('👩‍💻');
  const splitLanguage = runtime.reduceCoreState(built.state, {
    type: runtime.CORE_COMMAND_IDS.ATLAS_LANGUAGE_TAG_SET,
    payload: {
      projectId,
      scopeKind: 'range',
      sceneId,
      tagId: 'split-language',
      languageCode: 'und',
      startOffset: start + 1,
      endOffset: start + '👩‍💻'.length,
    },
  });
  assert.equal(splitLanguage.ok, false);
  assert.equal(splitLanguage.error.code, 'E_ATLAS_LANGUAGE_TAG_RANGE_GRAPHEME_SPLIT');

  const quote = text.slice(start + 1, start + '👩‍💻'.length);
  const splitEvidence = runtime.reduceCoreState(built.state, {
    type: runtime.CORE_COMMAND_IDS.ATLAS_MENTION_CONFIRM,
    payload: {
      projectId,
      sceneId,
      entityId: 'entity-emoji',
      mentionId: 'split-evidence',
      decisionId: 'split-evidence-decision',
      evidenceAnchor: {
        schemaVersion: 'atlas.evidenceAnchor.v1',
        anchorId: 'split-evidence-anchor',
        projectId,
        sceneId,
        entityId: 'entity-emoji',
        startOffset: start + 1,
        endOffset: start + '👩‍💻'.length,
        quote,
        quoteHash: derived.hashCanonicalValue(quote),
        sceneTextHash: derived.hashCanonicalValue(text),
      },
    },
  });
  assert.equal(splitEvidence.ok, false);
  assert.equal(splitEvidence.error.code, 'E_ATLAS_EVIDENCE_GRAPHEME_SPLIT');
});

test('R3 C04: production mention index carries author language policy for multilingual exact matches', async () => {
  const runtime = await loadModule(path.join('src', 'core', 'runtime.mjs'));
  const derived = await loadModule(path.join('src', 'derived', 'index.mjs'));
  const projectId = 'r3-c04-language-route-contract';
  const sceneId = 'scene-r3-c04';
  const text = 'Анна and 東京';
  const annaStart = text.indexOf('Анна');
  const tokyoStart = text.indexOf('東京');
  const built = runtime.applyCoreSequence(runtime.createInitialCoreState(), [
    { type: runtime.CORE_COMMAND_IDS.PROJECT_CREATE, payload: { projectId, title: 'language routes', sceneId } },
    { type: runtime.CORE_COMMAND_IDS.PROJECT_APPLY_TEXT_EDIT, payload: { projectId, sceneId, text } },
    { type: runtime.CORE_COMMAND_IDS.ATLAS_ENTITY_CREATE, payload: { projectId, entityId: 'entity-anna', name: 'Анна', entityKind: 'character' } },
    { type: runtime.CORE_COMMAND_IDS.ATLAS_ENTITY_CREATE, payload: { projectId, entityId: 'entity-tokyo', name: '東京', entityKind: 'place' } },
    { type: runtime.CORE_COMMAND_IDS.ATLAS_LANGUAGE_TAG_SET, payload: { projectId, scopeKind: 'range', sceneId, tagId: 'ru-range', languageCode: 'ru', startOffset: annaStart, endOffset: annaStart + 'Анна'.length } },
    { type: runtime.CORE_COMMAND_IDS.ATLAS_LANGUAGE_TAG_SET, payload: { projectId, scopeKind: 'range', sceneId, tagId: 'cjk-range', languageCode: 'zh-hans', startOffset: tokyoStart, endOffset: tokyoStart + '東京'.length } },
  ]);
  assert.equal(built.ok, true);
  const mentions = derived.deriveAtlasMentionIndex({
    coreState: built.state,
    params: { projectId },
    capabilitySnapshot: { platformId: 'node', capabilities: { atlasMentionIndex: true } },
  });
  assert.equal(mentions.ok, true);
  const byEntity = new Map(mentions.value.mentions.map((mention) => [mention.entityId, mention]));
  assert.equal(byEntity.get('entity-anna').languageCode, 'ru');
  assert.equal(byEntity.get('entity-tokyo').languageCode, 'zh-hans');
  assert.equal(byEntity.get('entity-tokyo').languageRoute.exactOnly, true);
  assert.equal(byEntity.get('entity-tokyo').languageRoute.englishFallback, false);
});

test('R3 C04: runtime source no longer contains silent project search candidate slice', () => {
  const mainSource = fs.readFileSync(path.join(process.cwd(), 'src', 'main.js'), 'utf8');
  assert.doesNotMatch(mainSource, /candidateNodes\.slice\(\s*0\s*,\s*500\s*\)/u);
  const runtimeSource = fs.readFileSync(path.join(process.cwd(), 'src', 'core', 'runtime.mjs'), 'utf8');
  assert.match(runtimeSource, /atlas\.authorUnsupportedQuarantine\.v1/u);
  assert.match(runtimeSource, /E_ATLAS_LANGUAGE_TAG_RANGE_GRAPHEME_SPLIT/u);
  assert.match(runtimeSource, /E_ATLAS_EVIDENCE_GRAPHEME_SPLIT/u);
});
