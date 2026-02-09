const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

async function loadTransform() {
  const modPath = pathToFileURL(path.join(process.cwd(), 'src', 'export', 'markdown', 'v1', 'index.mjs')).href;
  return import(modPath);
}

function fixture(name) {
  return fs.readFileSync(path.join(process.cwd(), 'test', 'fixtures', 'sector-m', 'm2', name), 'utf8');
}

test('M2 roundtrip is deterministic and stable', async () => {
  const { parseMarkdownV1, serializeMarkdownV1 } = await loadTransform();
  const source = fixture('simple.md');
  const expected = fixture('simple.expected.md');

  const scene = parseMarkdownV1(source);
  const md1 = serializeMarkdownV1(scene);
  assert.equal(md1, expected);

  const md2 = serializeMarkdownV1(parseMarkdownV1(md1));
  assert.equal(md2, md1);
});

test('M2 list canonicalization and loss-report proof', async () => {
  const { parseMarkdownV1, serializeMarkdownV1 } = await loadTransform();
  const listSource = fixture('lists.md');
  const listScene = parseMarkdownV1(listSource);
  const listMd = serializeMarkdownV1(listScene);
  assert.match(listMd, /^1\. first\n2\. second\n3\. third/m);

  const lossSource = fixture('lossy.md');
  const expected = JSON.parse(fixture('loss.expected.json'));
  const lossScene = parseMarkdownV1(lossSource);
  assert.equal(lossScene.lossReport.count, expected.roundtripLossCount);
  assert.ok(lossScene.lossReport.items.every((item) => typeof item.kind === 'string' && item.kind.length > 0));
});
