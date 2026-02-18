const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const EDITOR_PATH = path.join(process.cwd(), 'src/renderer/editor.js');

function readEditorSource() {
  return fs.readFileSync(EDITOR_PATH, 'utf8');
}

function extractBlockFrom(source, anchor) {
  const startIndex = source.indexOf(anchor);
  assert.ok(startIndex >= 0, `anchor not found: ${anchor}`);
  const braceStart = source.indexOf('{', startIndex);
  assert.ok(braceStart >= 0, `block start not found for anchor: ${anchor}`);
  let depth = 0;
  for (let i = braceStart; i < source.length; i += 1) {
    const ch = source[i];
    if (ch === '{') depth += 1;
    if (ch === '}') {
      depth -= 1;
      if (depth === 0) {
        return source.slice(braceStart + 1, i);
      }
    }
  }
  throw new Error(`unclosed block for anchor: ${anchor}`);
}

test('editor hot-path: input handler avoids direct full rerender calls', () => {
  const source = readEditorSource();
  const inputBody = extractBlockFrom(source, "editor.addEventListener('input', () =>");

  assert.match(inputBody, /scheduleIncrementalInputDomSync\(\);/);
  assert.match(inputBody, /syncPlainTextBufferFromEditorDom\(\);/);
  assert.match(inputBody, /scheduleDeferredHotpathRender\(\{\s*includePagination:\s*false/s);
  assert.match(inputBody, /scheduleDeferredPaginationRefresh\(\);/);

  assert.doesNotMatch(inputBody, /setPlainText\s*\(/);
  assert.doesNotMatch(inputBody, /renderStyledView\s*\(/);
  assert.doesNotMatch(inputBody, /paginateNodes\s*\(/);
  assert.doesNotMatch(inputBody, /editor\.innerHTML\s*=/);
});

test('editor hot-path: coalescing and deferred pagination are wired', () => {
  const source = readEditorSource();

  assert.match(source, /const HOTPATH_RENDER_DEBOUNCE_MS = 32;/);
  assert.match(source, /const HOTPATH_FULL_RENDER_MIN_INTERVAL_MS = 280;/);
  assert.match(source, /const HOTPATH_PAGINATION_IDLE_DELAY_MS = 220;/);

  const incrementalSyncBody = extractBlockFrom(source, 'function scheduleIncrementalInputDomSync()');
  assert.match(incrementalSyncBody, /requestAnimationFrame/);

  const deferredPaginationBody = extractBlockFrom(source, 'function scheduleDeferredPaginationRefresh()');
  assert.match(deferredPaginationBody, /requestIdleCallback/);
  assert.match(deferredPaginationBody, /scheduleDeferredHotpathRender\(\{\s*includePagination:\s*true/s);
});

test('editor hot-path: pagination path uses batched overflow checks', () => {
  const source = readEditorSource();
  const paginateBody = extractBlockFrom(source, 'function paginateNodes(nodes)');

  assert.match(paginateBody, /PAGINATION_MEASURE_BATCH_SIZE/);
  assert.match(paginateBody, /flushOverflowIfNeeded/);
  assert.doesNotMatch(paginateBody, /currentContent\.appendChild\(node\)\s*;\s*const limit = currentContent\.clientHeight/s);
});
