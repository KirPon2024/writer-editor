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

test('M2 enforces max input bytes', async () => {
  const { parseMarkdownV1 } = await loadTransform();
  const seed = fixture('large.md');
  const huge = seed.repeat(200);
  assert.throws(
    () => parseMarkdownV1(huge, { limits: { maxInputBytes: 256 } }),
    (err) => err && err.code === 'E_MD_LIMIT_SIZE',
  );
});

test('M2 enforces max depth', async () => {
  const { parseMarkdownV1 } = await loadTransform();
  const deep = fixture('deep.md');
  assert.throws(
    () => parseMarkdownV1(deep, { limits: { maxDepth: 2 } }),
    (err) => err && err.code === 'E_MD_LIMIT_DEPTH',
  );
});

test('M2 enforces max nodes', async () => {
  const { parseMarkdownV1 } = await loadTransform();
  const many = Array.from({ length: 300 }, (_, i) => `- item ${i + 1}`).join('\n');
  assert.throws(
    () => parseMarkdownV1(many, { limits: { maxNodes: 50 } }),
    (err) => err && err.code === 'E_MD_LIMIT_NODES',
  );
});
