'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '..', '..');

function writeDorianFixture(root) {
  fs.mkdirSync(root, { recursive: true });
  for (let sceneIndex = 0; sceneIndex < 21; sceneIndex += 1) {
    const paragraphs = Array.from({ length: 48 }, (_, paragraphIndex) => (
      `Dorian fixture scene ${sceneIndex + 1}, paragraph ${paragraphIndex + 1}, preserves a distinct public-domain-style observation about the portrait, the window, the garden, and the changing evening light marker D${sceneIndex + 1}P${paragraphIndex + 1}.`
    ));
    const file = sceneIndex === 0
      ? 'dorian-00-preface.txt'
      : `dorian-${String(sceneIndex).padStart(2, '0')}-chapter-${sceneIndex}.txt`;
    fs.writeFileSync(path.join(root, file), `${paragraphs.join('\n\n')}\n`, 'utf8');
  }
}

test('C5V2 portfolio generator builds five deterministic 21-scene full-manuscript corpora', async () => {
  const portfolio = await import(path.join(REPO_ROOT, 'scripts', 'ops', 'rtk-word-c5v2-portfolio-corpus.mjs'));
  const envelope = await import(path.join(REPO_ROOT, 'src', 'renderer', 'documentContentEnvelope.mjs'));
  const canary = await import(path.join(REPO_ROOT, 'scripts', 'ops', 'rtk-word-c5v2-physical-canary.mjs'));
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'yalken-c5v2-portfolio-build-'));
  const dorianRoot = path.join(tempRoot, 'dorian');
  writeDorianFixture(dorianRoot);

  assert.deepEqual(portfolio.C5V2_PORTFOLIO_CORPUS_IDS, [
    'dense-prose',
    'dialogue-heavy',
    'nested-structure',
    'near-supported-limit',
    'multilingual-coherent-24',
  ]);

  const corpora = new Map(portfolio.C5V2_PORTFOLIO_CORPUS_IDS.map((corpusId) => [
    corpusId,
    portfolio.buildC5V2PortfolioCorpus(corpusId, { dorianRoot }),
  ]));
  for (const [corpusId, corpus] of corpora) {
    assert.equal(corpus.schemaVersion, portfolio.C5V2_PORTFOLIO_CORPUS_SCHEMA);
    assert.equal(corpus.corpusId, corpusId);
    assert.equal(corpus.sceneCount, 21);
    assert.equal(corpus.scenes.length, 21);
    assert.equal(corpus.syntheticTailAuthority, false);
    assert.equal(corpus.expectedWordCount > 0, true);
    assert.deepEqual(corpus.scenes.map((scene) => scene.ordinal), Array.from({ length: 21 }, (_, index) => index + 1));
    assert.equal(new Set(corpus.scenes.map((scene) => scene.rawSourceSha256)).size, 21);
  }

  const dense = corpora.get('dense-prose');
  assert.equal(dense.scenes.every((scene) => scene.source?.transformation === 'paragraph-reflow-only-no-synthetic-tail'), true);
  assert.equal(dense.characteristics.includes('no-synthetic-tail'), true);

  const dialogue = corpora.get('dialogue-heavy');
  assert.equal(dialogue.scenes.every((scene) => scene.rawContent.includes('“') && scene.rawContent.includes('replied')), true);

  const nested = corpora.get('nested-structure');
  assert.equal(nested.scenes.every((scene) => scene.observableEnvelopeVersion === 2), true);
  for (const scene of nested.scenes) {
    const parsed = envelope.parseObservablePayload(scene.rawContent);
    assert.equal(parsed.issue, null);
    const headingLevels = new Set(parsed.doc.content.filter((node) => node.type === 'heading').map((node) => node.attrs.level));
    assert.deepEqual([...headingLevels].sort(), [1, 2, 3]);
    assert.equal(parsed.hasMetaBlock, true);
    assert.equal(parsed.cards.length, 1);
  }
  const nestedProductScenes = nested.scenes.map((scene, index) => {
    const authority = canary.readProductSceneAuthority(scene.rawContent);
    return {
      sceneId: `nested-${String(index + 1).padStart(2, '0')}`,
      title: scene.title,
      text: authority.text,
      paragraphs: authority.paragraphs,
      sourceSha256: authority.textSha256,
    };
  });
  const nestedLedger = canary.buildCanaryLedger(nestedProductScenes, { weightedSceneAllocation: true });
  assert.equal(nestedLedger.operationCount, 200);
  assert.equal(nestedLedger.operations.filter((operation) => operation.family === 'structural').length, 10);

  const nearLimit = corpora.get('near-supported-limit');
  assert.equal(nearLimit.expectedWordCount, 100_000);
  assert.equal(nearLimit.scenes.reduce((sum, scene) => sum + scene.wordCount, 0), 100_000);

  const multilingual = corpora.get('multilingual-coherent-24');
  const multilingualRaw = multilingual.scenes.map((scene) => scene.rawContent).join('\n');
  assert.equal(multilingual.languageTags.length, 24);
  assert.equal(new Set(multilingual.languageTags).size, 24);
  assert.match(multilingualRaw, /café/u);
  assert.match(multilingualRaw, /cafe\u0301/u);
  assert.match(multilingualRaw, /👩‍💻/u);
  assert.match(multilingualRaw, /العربية/u);
  assert.match(multilingualRaw, /עברית/u);
  assert.match(multilingualRaw, /中文/u);
  assert.match(multilingualRaw, /हिन्दी/u);
  assert.match(multilingualRaw, /ไทย/u);

  const repeated = portfolio.buildC5V2PortfolioCorpus('multilingual-coherent-24', { dorianRoot });
  assert.deepEqual(repeated, multilingual);
});

test('C5V2 portfolio writer and canary loader preserve raw rich scenes and validate complete manifest authority', async () => {
  const portfolio = await import(path.join(REPO_ROOT, 'scripts', 'ops', 'rtk-word-c5v2-portfolio-corpus.mjs'));
  const canary = await import(path.join(REPO_ROOT, 'scripts', 'ops', 'rtk-word-c5v2-physical-canary.mjs'));
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'yalken-c5v2-portfolio-write-'));
  const dorianRoot = path.join(tempRoot, 'dorian');
  const outputRoot = path.join(tempRoot, 'corpora');
  writeDorianFixture(dorianRoot);

  assert.equal(canary.shouldRunC5V2CumulativeController({ roundCount: 1 }), false);
  assert.equal(canary.shouldRunC5V2CumulativeController({ roundCount: 2 }), true);
  assert.equal(canary.shouldRunC5V2CumulativeController({
    roundCount: 1,
    corpusManifestPath: path.join(outputRoot, 'corpus-manifest.json'),
  }), true);

  const results = portfolio.writeC5V2PortfolioCorpora({ root: outputRoot, dorianRoot });
  assert.equal(results.length, 5);
  assert.equal(results.every((result) => result.corpusRoot.startsWith(`${outputRoot}${path.sep}`)), true);
  assert.equal(results.find((result) => result.corpusId === 'near-supported-limit').wordCount, 100_000);

  for (const result of results) {
    const loaded = canary.loadCanaryCorpus({
      corpusManifestPath: result.manifestPath,
      sceneCount: 21,
    });
    assert.equal(loaded.scenes.length, 21);
    assert.equal(loaded.provenance.corpusId, result.corpusId);
    assert.equal(loaded.provenance.manifestSha256, result.manifestSha256);
    assert.equal(loaded.provenance.syntheticTailAuthority, false);
    assert.equal(loaded.scenes.every((scene) => scene.rawSourceSha256 && scene.cleanedSourceSha256), true);
  }

  const nestedResult = results.find((result) => result.corpusId === 'nested-structure');
  const nestedLoaded = canary.loadCanaryCorpus({ corpusManifestPath: nestedResult.manifestPath, sceneCount: 21 });
  assert.equal(nestedLoaded.scenes.every((scene) => scene.observableEnvelopeVersion === 2), true);
  assert.equal(nestedLoaded.scenes.every((scene) => scene.rawContent.includes('[doc-v2 ')), true);

  const dialogueResult = results.find((result) => result.corpusId === 'dialogue-heavy');
  const dialogueManifest = JSON.parse(fs.readFileSync(dialogueResult.manifestPath, 'utf8'));
  const lastScenePath = path.resolve(path.dirname(dialogueResult.manifestPath), dialogueManifest.scenes.at(-1).contentPath);
  fs.appendFileSync(lastScenePath, '\nTampered outside the selected subset.\n', 'utf8');
  assert.throws(() => canary.loadCanaryCorpus({
    corpusManifestPath: dialogueResult.manifestPath,
    sceneCount: 1,
  }), /C5V2_PORTFOLIO_CORPUS_SCENE_HASH_MISMATCH/u);
});

test('C5V2 portfolio loader rejects malformed counts, semantic hashes, duplicates and path escape', async () => {
  const portfolio = await import(path.join(REPO_ROOT, 'scripts', 'ops', 'rtk-word-c5v2-portfolio-corpus.mjs'));
  const canary = await import(path.join(REPO_ROOT, 'scripts', 'ops', 'rtk-word-c5v2-physical-canary.mjs'));

  function malformedManifest(mutate) {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'yalken-c5v2-portfolio-negative-'));
    const result = portfolio.writeC5V2PortfolioCorpus({ corpusId: 'dialogue-heavy', root: tempRoot });
    const manifest = JSON.parse(fs.readFileSync(result.manifestPath, 'utf8'));
    mutate(manifest);
    fs.writeFileSync(result.manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
    return result.manifestPath;
  }

  assert.throws(() => canary.loadCanaryCorpus({
    corpusManifestPath: malformedManifest((manifest) => { manifest.sceneCount -= 1; }),
  }), /C5V2_PORTFOLIO_CORPUS_MANIFEST_SCENE_COUNT_MISMATCH/u);

  assert.throws(() => canary.loadCanaryCorpus({
    corpusManifestPath: malformedManifest((manifest) => { manifest.expectedWordCount += 1; }),
  }), /C5V2_PORTFOLIO_CORPUS_WORD_COUNT_MISMATCH/u);

  assert.throws(() => canary.loadCanaryCorpus({
    corpusManifestPath: malformedManifest((manifest) => { manifest.scenes[0].visibleTextSha256 = 'sha256:wrong'; }),
  }), /C5V2_PORTFOLIO_CORPUS_VISIBLE_TEXT_HASH_MISMATCH/u);

  assert.throws(() => canary.loadCanaryCorpus({
    corpusManifestPath: malformedManifest((manifest) => { manifest.scenes[1].file = manifest.scenes[0].file; }),
  }), /C5V2_PORTFOLIO_CORPUS_SCENE_FILE_DUPLICATE/u);

  assert.throws(() => canary.loadCanaryCorpus({
    corpusManifestPath: malformedManifest((manifest) => { manifest.scenes[0].contentPath = '../outside.txt'; }),
  }), /C5V2_PORTFOLIO_CORPUS_SCENE_PATH_OUTSIDE_ROOT/u);

  assert.throws(() => canary.loadCanaryCorpus({
    corpusManifestPath: malformedManifest((manifest) => { manifest.syntheticTailAuthority = true; }),
  }), /C5V2_PORTFOLIO_CORPUS_SYNTHETIC_TAIL_AUTHORITY_FORBIDDEN/u);
});
