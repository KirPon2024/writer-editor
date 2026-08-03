const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

async function loadHarness() {
  return import(pathToFileURL(path.join(
    process.cwd(),
    'scripts',
    'ops',
    'rtk-word-c5v2-dorian-atlas-cycles.mjs',
  )).href);
}

function scene(sceneId, text, rawContentSha256 = `sha256:raw-${sceneId}`) {
  return {
    sceneId,
    text,
    rawContentSha256,
    textSha256: `sha256:text-${sceneId}-${text.length}`,
  };
}

test('C5V2 Dorian Atlas cycles require exact raw and visible carryover without revision reset', async () => {
  const harness = await loadHarness();
  const first = [scene('scene-a', 'Alpha one.'), scene('scene-b', 'Beta one.')];
  const second = [scene('scene-a', 'Alpha two.'), scene('scene-b', 'Beta one.')];
  const third = [scene('scene-a', 'Alpha two.'), scene('scene-b', 'Beta three.')];
  const verified = harness.verifyC5V2CycleCarryover([
    { roundId: 'round-01', baselineScenes: first, reopenedScenes: second },
    { roundId: 'round-02', baselineScenes: second, reopenedScenes: third },
    { roundId: 'round-03', baselineScenes: third, reopenedScenes: third },
  ]);

  assert.equal(verified.ok, true);
  assert.equal(verified.carryovers.length, 2);
  assert.equal(verified.carryovers.every((row) => row.exact), true);
  assert.equal(verified.carryovers[0].fromSceneSetDigest, verified.carryovers[0].toSceneSetDigest);

  const tampered = second.map((row) => ({ ...row }));
  tampered[0].rawContentSha256 = 'sha256:tampered';
  const rejected = harness.verifyC5V2CycleCarryover([
    { roundId: 'round-01', baselineScenes: first, reopenedScenes: second },
    { roundId: 'round-02', baselineScenes: tampered, reopenedScenes: third },
    { roundId: 'round-03', baselineScenes: third, reopenedScenes: third },
  ]);
  assert.equal(rejected.ok, false);
  assert.equal(rejected.carryovers[0].exact, false);
});

test('C5V2 Dorian Atlas cycles reject cross-head physical campaign evidence before certification acceptance', async () => {
  const harness = await loadHarness();
  const expectedHeadSha = 'babb9764a51bdc5b1344ee8aed44108e066ac820';
  const stalePhysicalHeadSha = 'c19d5467a51bdc5b1344ee8aed44108e066ac820';
  const campaignResult = {
    headSha: stalePhysicalHeadSha,
    roundCount: 5,
    sceneCount: 21,
    electronResult: { ok: true },
    vetoStatus: {
      wordSaturated: false,
      activeBindingFailed: false,
    },
    totals: {
      attempted: 1960,
      reported: 1960,
      productApplyGreen: 5,
    },
  };

  assert.throws(
    () => harness.validateC5V2DorianAtlasPhysicalCampaignBinding(campaignResult, { expectedHeadSha }),
    /C5V2_DORIAN_ATLAS_PHYSICAL_HEAD_MISMATCH/u,
  );

  assert.deepEqual(
    harness.validateC5V2DorianAtlasPhysicalCampaignBinding({ ...campaignResult, headSha: expectedHeadSha }, { expectedHeadSha }),
    {
      ok: true,
      physicalCampaignHeadSha: expectedHeadSha,
      exactHeadPhysicalCampaign: true,
    },
  );
});

test('C5V2 Dorian Atlas cycles select one natural unique grapheme-safe anchor without normalization', async () => {
  const harness = await loadHarness();
  const scenes = [
    {
      sceneId: 'scene-unicode',
      text: 'Cafe\u0301 kept the old mirror beside 👩‍💻 tools. A singular violet promise crossed the quiet gallery.',
    },
    {
      sceneId: 'scene-rtl-cjk',
      text: 'שלום עולם remained visible. 東京の夜 carried another entirely different manuscript phrase.',
    },
  ];
  const selected = harness.selectNaturalAtlasAnchor({ scenes, preferredSceneIndex: 0 });
  const source = scenes.find((row) => row.sceneId === selected.sceneId).text;

  assert.equal(source.slice(selected.startOffset, selected.endOffset), selected.quote);
  assert.equal(scenes.map((row) => row.text.toLocaleLowerCase('und')).join('\n').split(selected.quote.toLocaleLowerCase('und')).length - 1, 1);
  assert.equal(selected.naturalSource, true);
  assert.equal(selected.syntheticTail, false);
  assert.equal(selected.destructiveNormalizationApplied, false);
  assert.ok(selected.graphemeEnd > selected.graphemeStart);

  const second = harness.selectNaturalAtlasAnchor({
    scenes,
    preferredSceneIndex: 0,
    usedQuotes: [selected.quote],
  });
  assert.notEqual(second.quote.toLocaleLowerCase('und'), selected.quote.toLocaleLowerCase('und'));
});

test('C5V2 Dorian Atlas cyclic harness is offline, fsynced, product-routed, and Atlas-source read-only', () => {
  const source = fs.readFileSync(path.join(
    process.cwd(),
    'scripts',
    'ops',
    'rtk-word-c5v2-dorian-atlas-cycles.mjs',
  ), 'utf8');

  assert.match(source, /createStage10ProductRuntime/u);
  assert.match(source, /reopenStage10ProductRuntime/u);
  assert.match(source, /createStage10MainPersistenceAdapter/u);
  assert.match(source, /dispatchVisibleCommand/u);
  assert.match(source, /buildAtlasGraphPackage/u);
  assert.match(source, /validateAtlasGraphPackageRepeatImport/u);
  assert.match(source, /deriveManualMapGraph/u);
  assert.match(source, /fs\.fsyncSync/u);
  assert.match(source, /previousCheckpointSha256/u);
  assert.match(source, /completedOperationIds/u);
  assert.match(source, /requestEffectKeys/u);
  assert.doesNotMatch(source, /\bfetch\s*\(/u);
  assert.doesNotMatch(source, /from\s+['"]node:https?['"]/u);
  assert.doesNotMatch(source, /execFileSync\([^\n]*rm\b/u);
});
