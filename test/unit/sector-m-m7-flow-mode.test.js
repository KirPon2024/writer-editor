const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

async function loadFlowModeModule() {
  const root = process.cwd();
  return import(pathToFileURL(path.join(root, 'src', 'renderer', 'commands', 'flowMode.mjs')).href);
}

test('M7 flow mode compose is deterministic and keeps scene markers', async () => {
  const flow = await loadFlowModeModule();
  const scenes = [
    { title: 'One', content: 'Alpha' },
    { title: 'Two', content: 'Beta\nGamma\n' },
  ];
  const out = flow.composeFlowDocument(scenes);

  assert.equal(
    out,
    '---[ SCENE 1: One ]---\nAlpha\n\n---[ SCENE 2: Two ]---\nBeta\nGamma\n',
  );
  assert.equal(flow.composeFlowDocument(scenes), out);
});

test('M7 flow mode save payload validates scene markers and mapping', async () => {
  const flow = await loadFlowModeModule();
  const text = [
    '---[ SCENE 1: One ]---',
    'Alpha',
    '',
    '---[ SCENE 2: Two ]---',
    'Beta',
    '',
  ].join('\n');
  const refs = [
    { path: '/tmp/a.txt', title: 'One', kind: 'scene' },
    { path: '/tmp/b.txt', title: 'Two', kind: 'scene' },
  ];
  const payload = flow.buildFlowSavePayload(text, refs);
  assert.equal(payload.ok, true);
  assert.deepEqual(payload.scenes, [
    { path: '/tmp/a.txt', title: 'One', kind: 'scene', content: 'Alpha' },
    { path: '/tmp/b.txt', title: 'Two', kind: 'scene', content: 'Beta' },
  ]);

  const mismatch = flow.buildFlowSavePayload('---[ SCENE 1: One ]---\nOnly one', refs);
  assert.equal(mismatch.ok, false);
  assert.equal(mismatch.error.code, 'M7_FLOW_MARKER_COUNT_MISMATCH');
});

test('M7 flow mode boundary helpers move caret between scenes only at boundaries', async () => {
  const flow = await loadFlowModeModule();
  const text = [
    '---[ SCENE 1: One ]---',
    'A',
    '',
    '---[ SCENE 2: Two ]---',
    'B',
    '',
  ].join('\n');

  const next = flow.nextSceneCaretAtBoundary(text, text.indexOf('---[ SCENE 2: Two ]---') - 1);
  assert.ok(Number.isInteger(next));
  assert.equal(text.slice(next, next + 1), 'B');

  const prev = flow.previousSceneCaretAtBoundary(text, text.indexOf('B'));
  assert.ok(Number.isInteger(prev));
  const secondSceneMarker = text.indexOf('---[ SCENE 2: Two ]---');
  assert.equal(prev < secondSceneMarker, true);
  assert.equal(prev > text.indexOf('A'), true);
});
