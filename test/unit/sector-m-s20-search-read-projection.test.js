const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

async function loadProvider() {
  return import(pathToFileUrl(path.join(ROOT, 'src', 'derived', 'projectSearchReadModel.mjs')));
}

function pathToFileUrl(filePath) {
  return `file://${filePath}`;
}

function extractFunctionBlock(source, signature) {
  const start = source.indexOf(signature);
  assert.ok(start > -1, `missing function signature: ${signature}`);
  const bodyStart = source.indexOf('{', start + signature.length);
  assert.ok(bodyStart > start, `missing function body: ${signature}`);
  let depth = 0;
  for (let index = bodyStart; index < source.length; index += 1) {
    const char = source[index];
    if (char === '{') depth += 1;
    if (char === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(start, index + 1);
    }
  }
  assert.fail(`unterminated function body: ${signature}`);
}

test('S20 search provider: builds pathless stable read results from documents notes and annotations', async () => {
  const provider = await loadProvider();
  const first = provider.buildProjectSearchReadModel({
    projectId: 'project-test',
    options: { query: 'station', scope: 'project', limit: 10 },
    sources: [
      {
        type: 'document',
        sourceId: 'scene-1',
        nodeId: 'tree-node-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        kind: 'scene',
        title: 'Вокзал',
        text: 'The old station kept breathing under the roof.',
        contentHash: 'hash-scene',
      },
      {
        type: 'note',
        sourceId: 'note-1',
        noteId: 'note-1',
        title: 'Заметка',
        text: 'Remember the station clock.',
        contentHash: 'hash-note',
      },
      {
        type: 'annotation',
        sourceId: 'annotation-1',
        annotationId: 'comment-1',
        title: 'Комментарий',
        text: 'The station image repeats twice.',
        contentHash: 'hash-annotation',
      },
    ],
  });
  const second = provider.buildProjectSearchReadModel({
    projectId: 'project-test',
    options: { query: 'station', scope: 'project', limit: 10 },
    sources: [
      {
        type: 'document',
        sourceId: 'scene-1',
        nodeId: 'tree-node-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        kind: 'scene',
        title: 'Вокзал',
        text: 'The old station kept breathing under the roof.',
        contentHash: 'hash-scene',
      },
    ],
  });

  assert.equal(first.ok, true);
  assert.equal(first.schemaVersion, 'project-search-read-model.v1');
  assert.equal(first.state, 'ready');
  assert.equal(first.results.length, 3);
  assert.equal(first.results[0].id, second.results[0].id);
  assert.equal(first.results[0].source.nodeId, 'tree-node-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
  assert.equal(first.results[1].source.noteId, 'note-1');
  assert.equal(first.results[2].source.annotationId, 'comment-1');
  assert.ok(first.results[0].preview.text.includes('station'));
  assert.equal(JSON.stringify(first).includes('filePath'), false);
  assert.equal(JSON.stringify(first).includes('projectRoot'), false);
});

test('S20 search provider: honors case and whole-word options without writing truth', async () => {
  const provider = await loadProvider();
  const source = {
    type: 'document',
    sourceId: 'scene-1',
    nodeId: 'tree-node-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    kind: 'scene',
    title: 'Текст',
    text: 'cat cathedral Cat cat',
    contentHash: 'hash',
  };

  const insensitive = provider.buildProjectSearchReadModel({
    projectId: 'project-test',
    options: { query: 'cat', wholeWord: true },
    sources: [source],
  });
  const sensitive = provider.buildProjectSearchReadModel({
    projectId: 'project-test',
    options: { query: 'cat', caseSensitive: true, wholeWord: true },
    sources: [source],
  });

  assert.equal(insensitive.results.length, 3);
  assert.equal(sensitive.results.length, 2);
  assert.equal(insensitive.results.some((result) => result.preview.matchText === 'cathedral'), false);
});

test('S20 search provider: supports cancelled rebuild state', async () => {
  const provider = await loadProvider();
  const model = provider.buildProjectSearchReadModel({
    projectId: 'project-test',
    options: { query: 'alpha' },
    signal: { aborted: true },
    sources: [{ type: 'document', sourceId: 'scene-1', text: 'alpha' }],
  });

  assert.equal(model.state, 'cancelled');
  assert.equal(model.cancelled, true);
  assert.equal(model.stale, true);
  assert.deepEqual(model.results, []);
});

test('S20 search provider: large bounded probe remains deterministic and limited', async () => {
  const provider = await loadProvider();
  const sources = Array.from({ length: 240 }, (_, index) => ({
    type: 'document',
    sourceId: `scene-${index}`,
    nodeId: `tree-node-${String(index).padStart(32, 'a').slice(0, 32)}`,
    kind: 'scene',
    title: `Scene ${index}`,
    text: index % 2 === 0 ? 'alpha beta gamma' : 'beta gamma',
    contentHash: `hash-${index}`,
  }));
  const started = Date.now();
  const model = provider.buildProjectSearchReadModel({
    projectId: 'project-test',
    options: { query: 'alpha', limit: 40 },
    sources,
  });
  const elapsedMs = Date.now() - started;

  assert.equal(model.results.length, 40);
  assert.equal(model.truncated, true);
  assert.equal(elapsedMs < 300, true);
});

test('S20 search UI: workspace, query bridge, source jump and pathless renderer are wired', () => {
  const html = read('src/renderer/index.html');
  const editor = read('src/renderer/editor.js');
  const styles = read('src/renderer/styles.css');

  assert.ok(html.includes('data-project-search-workspace'));
  assert.ok(html.includes('data-project-search-scope'));
  assert.ok(html.includes('data-project-search-results'));
  assert.ok(editor.includes('const PROJECT_SEARCH_QUERY_ID = WORKSPACE_QUERY_IDS.PROJECT_SEARCH;'));
  assert.ok(editor.includes('if (!WORKSPACE_QUERY_ID_SET.has(queryId)) {'));
  assert.ok(editor.includes('invokeWorkspaceQueryBridge(PROJECT_SEARCH_QUERY_ID'));
  assert.ok(editor.includes('pendingProjectSearchJump'));
  assert.ok(editor.includes('setSelectionRange(jump.from, jump.to);'));
  assert.ok(editor.includes('openDocumentNode({'));
  assert.ok(styles.includes('.main-content--search'));
  assert.ok(styles.includes('.project-search-workspace__body'));

  const start = editor.indexOf('function normalizeProjectSearchReadModel');
  const end = editor.indexOf('function applyLeftTab', start);
  assert.ok(start > -1 && end > start);
  const searchBlock = editor.slice(start, end);
  for (const forbidden of ['writeFile', 'readFile', 'projectRoot', 'filePath', 'notes.craftsman.json']) {
    assert.equal(searchBlock.includes(forbidden), false, `renderer search UI must stay pathless: ${forbidden}`);
  }
});

test('S20 search bridge: main exposes read-only query and no write path in search handler', () => {
  const main = read('src/main.js');

  assert.ok(main.includes('const PROJECT_SEARCH_QUERY_ID = WORKSPACE_QUERY_IDS.PROJECT_SEARCH;'));
  assert.ok(main.includes('[PROJECT_SEARCH_QUERY_ID, handleWorkspaceProjectSearchQuery]'));
  assert.ok(main.includes('async function handleWorkspaceProjectSearchQuery(payload = {})'));
  assert.ok(main.includes('async function buildProjectTreeRootsWithIdentitiesReadOnly()'));
  assert.ok(main.includes('buildProjectSearchReadModel({'));

  const handler = extractFunctionBlock(main, 'async function handleWorkspaceProjectSearchQuery(payload = {})');
  assert.ok(handler.includes('buildProjectTreeRootsWithIdentitiesReadOnly()'));
  assert.equal(handler.includes('buildProjectTreeRootsWithIdentities()'), false);
  assert.equal(handler.includes('writeFileAtomic'), false);
  assert.equal(handler.includes('queueDiskOperation'), false);
  assert.equal(handler.includes('createNotesRecoverySnapshot'), false);
});
