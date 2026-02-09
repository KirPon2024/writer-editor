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

test('M2 rejects unsafe URI schemes', async () => {
  const { parseMarkdownV1 } = await loadTransform();
  const unsafe = fixture('links_unsafe.md');
  assert.throws(
    () => parseMarkdownV1(unsafe),
    (err) => err && err.code === 'E_MD_SECURITY_URI_SCHEME_DENIED',
  );
});

test('M2 rejects raw HTML', async () => {
  const { parseMarkdownV1 } = await loadTransform();
  const html = fixture('html_raw.md');
  assert.throws(
    () => parseMarkdownV1(html),
    (err) => err && err.code === 'E_MD_SECURITY_RAW_HTML',
  );
});

test('M2 allows safe links without network side effects', async () => {
  const { parseMarkdownV1 } = await loadTransform();
  const safe = fixture('links_safe.md');
  const parsed = parseMarkdownV1(safe);
  assert.equal(parsed.kind, 'scene.v1');
});
