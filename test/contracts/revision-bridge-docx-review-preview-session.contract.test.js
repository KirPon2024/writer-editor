const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { deflateRawSync } = require('node:zlib');
const { pathToFileURL } = require('node:url');

const ROOT = path.resolve(__dirname, '..', '..');
const MODULE_PATH = path.join(ROOT, 'src', 'io', 'revisionBridge', 'index.mjs');
const SECTION_START = '// RB_10B_DOCX_REVIEW_PREVIEW_SESSION_CANDIDATE_START';
const SECTION_END = '// RB_10B_DOCX_REVIEW_PREVIEW_SESSION_CANDIDATE_END';

async function loadBridge() {
  return import(pathToFileURL(MODULE_PATH).href);
}

function readBridgeSource() {
  return fs.readFileSync(MODULE_PATH, 'utf8');
}

function extractMarkedSection(text, startMarker, endMarker) {
  const start = text.indexOf(startMarker);
  const end = text.indexOf(endMarker);
  assert.notEqual(start, -1, `missing marker: ${startMarker}`);
  assert.notEqual(end, -1, `missing marker: ${endMarker}`);
  assert.ok(end > start, `marker order invalid: ${startMarker}`);
  return text.slice(start, end + endMarker.length);
}

function asciiBytes(value) {
  return Buffer.from(value, 'ascii');
}

function utf8Bytes(value) {
  return Buffer.from(value, 'utf8');
}

function normalizeEntry(entry) {
  const body = Buffer.isBuffer(entry.body)
    ? entry.body
    : utf8Bytes(typeof entry.body === 'string' ? entry.body : '');
  const method = entry.method ?? 0;
  const compressedBody = method === 8 ? deflateRawSync(body) : body;
  return {
    name: entry.name,
    method,
    body,
    compressedBody,
    byteSize: entry.byteSize ?? body.length,
    compressedSize: entry.compressedSize ?? compressedBody.length,
  };
}

function localRecord(entry, offset) {
  const normalized = normalizeEntry(entry);
  const name = asciiBytes(normalized.name);
  const header = Buffer.alloc(30 + name.length);
  header.writeUInt32LE(0x04034b50, 0);
  header.writeUInt16LE(20, 4);
  header.writeUInt16LE(entry.flags ?? 0, 6);
  header.writeUInt16LE(normalized.method, 8);
  header.writeUInt32LE(0, 14);
  header.writeUInt32LE(normalized.compressedSize, 18);
  header.writeUInt32LE(normalized.byteSize, 22);
  header.writeUInt16LE(name.length, 26);
  name.copy(header, 30);
  return {
    ...normalized,
    offset,
    bytes: Buffer.concat([header, normalized.compressedBody]),
  };
}

function centralRecord(entry) {
  const name = asciiBytes(entry.name);
  const header = Buffer.alloc(46 + name.length);
  header.writeUInt32LE(0x02014b50, 0);
  header.writeUInt16LE(20, 4);
  header.writeUInt16LE(20, 6);
  header.writeUInt16LE(entry.flags ?? 0, 8);
  header.writeUInt16LE(entry.method, 10);
  header.writeUInt32LE(0, 16);
  header.writeUInt32LE(entry.compressedSize, 20);
  header.writeUInt32LE(entry.byteSize, 24);
  header.writeUInt16LE(name.length, 28);
  header.writeUInt16LE(0, 30);
  header.writeUInt16LE(0, 32);
  header.writeUInt16LE(0, 34);
  header.writeUInt32LE(entry.offset, 42);
  name.copy(header, 46);
  return header;
}

function zipFixture(entries) {
  const locals = [];
  let offset = 0;
  for (const entry of entries) {
    const local = localRecord(entry, offset);
    locals.push(local);
    offset += local.bytes.length;
  }
  const central = Buffer.concat(locals.map((entry) => centralRecord(entry)));
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(locals.length, 8);
  end.writeUInt16LE(locals.length, 10);
  end.writeUInt32LE(central.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);
  return Buffer.concat([Buffer.concat(locals.map((entry) => entry.bytes)), central, end]);
}

function documentXml(body) {
  return `<w:document><w:body>${body}</w:body></w:document>`;
}

function paragraphXml(text) {
  return `<w:p><w:r><w:t>${text}</w:t></w:r></w:p>`;
}

function commentsXml(body) {
  return `<w:comments>${body}</w:comments>`;
}

function cleanDocxZip(body = '<w:p/>', extraEntries = []) {
  return zipFixture([
    {
      name: 'word/document.xml',
      method: 8,
      body: documentXml(body),
    },
    ...extraEntries,
  ]);
}

function docxWithCommentAndBody(body, commentBody = 'Resolve this comment.') {
  return cleanDocxZip(body, [
    {
      name: 'word/comments.xml',
      method: 8,
      body: commentsXml([
        '<w:comment w:id="0" w:author="reviewer" w:date="2026-04-24T08:00:00.000Z">',
        '<w:p><w:r><w:t>',
        commentBody,
        '</w:t></w:r></w:p>',
        '</w:comment>',
      ].join('')),
    },
  ]);
}

function docxWithAnchoredComment(extraBody = '') {
  return docxWithCommentAndBody([
    '<w:p>',
    '<w:commentRangeStart w:id="0"/>',
    '<w:r><w:t>Anchored text</w:t></w:r>',
    '<w:commentRangeEnd w:id="0"/>',
    '<w:r><w:commentReference w:id="0"/></w:r>',
    '</w:p>',
    extraBody,
  ].join(''));
}

function collectKeys(value, pathParts = []) {
  if (Array.isArray(value)) {
    return value.flatMap((item, index) => collectKeys(item, pathParts.concat(String(index))));
  }
  if (!value || typeof value !== 'object') return [];
  return Object.keys(value).flatMap((key) => (
    [pathParts.concat(key).join('.')].concat(collectKeys(value[key], pathParts.concat(key)))
  ));
}

function assertNoStorageOrApplyAuthority(value) {
  const keys = collectKeys(value);
  for (const forbidden of [
    'applyOps',
    'applyPlan',
    'receipt',
    'recovery',
    'writeReceipt',
    'importReceipt',
    'exportReceipt',
  ]) {
    assert.equal(keys.some((key) => key === forbidden || key.endsWith(`.${forbidden}`)), false, forbidden);
  }
}

const TARGET_SCOPE = Object.freeze({
  type: 'scene',
  id: 'roman/imported/scene-1.txt',
});

test('DOCX review preview session candidate: exports schema and builder', async () => {
  const bridge = await loadBridge();

  assert.equal(
    bridge.DOCX_REVIEW_PREVIEW_SESSION_CANDIDATE_SCHEMA,
    'revision-bridge.docx-review-preview-session-candidate.v1',
  );
  assert.equal(typeof bridge.buildDocxReviewPreviewSessionCandidateFromZipBytes, 'function');
});

test('DOCX review preview session candidate: comments become review packet without apply authority', async () => {
  const bridge = await loadBridge();
  const input = docxWithAnchoredComment();
  const before = Buffer.from(input);

  const result = bridge.buildDocxReviewPreviewSessionCandidateFromZipBytes(input, {
    targetScope: TARGET_SCOPE,
    createdAt: '2026-04-24T08:00:00.000Z',
  });
  const second = bridge.buildDocxReviewPreviewSessionCandidateFromZipBytes(input, {
    targetScope: TARGET_SCOPE,
    createdAt: '2026-04-24T08:00:00.000Z',
  });

  assert.deepEqual(result, second);
  assert.equal(input.equals(before), true);
  assert.equal(result.ok, true);
  assert.equal(result.status, 'ready');
  assert.equal(result.code, 'DOCX_REVIEW_PREVIEW_SESSION_CANDIDATE_READY');
  assert.equal(result.canOpenReviewSession, true);
  assert.equal(result.canCreateReviewPacket, true);
  assert.equal(result.canAutoApply, false);
  assert.equal(result.canImportMutate, false);
  assert.equal(result.canWriteStorage, false);
  assert.equal(result.reviewPacket.commentThreads.length, 1);
  assert.equal(result.reviewPacket.commentThreads[0].messages[0].body, 'Resolve this comment.');
  assert.equal(result.reviewPacket.commentPlacements.length, 1);
  assert.equal(result.reviewPacket.commentThreads[0].commentId, '0');
  assert.equal(result.reviewPacket.commentPlacements[0].sourceCommentId, '0');
  assert.equal(result.reviewPacket.commentPlacements[0].quote, 'Anchored text');
  assert.deepEqual(result.reviewPacket.textChanges, []);
  assert.deepEqual(result.reviewPacket.structuralChanges, []);
  assert.equal(result.reviewPacket.commentPlacements[0].targetScope.id, TARGET_SCOPE.id);
  assert.equal(result.sourceViewState.viewMode, 'docx-review-preview');
  assertNoStorageOrApplyAuthority(result);
});

test('DOCX review preview session candidate: structurally complex tracked changes stay manual-only', async () => {
  const bridge = await loadBridge();
  const result = bridge.buildDocxReviewPreviewSessionCandidateFromZipBytes(cleanDocxZip([
    paragraphXml('Before'),
    '<w:ins><w:p><w:r><w:t>Inserted</w:t></w:r></w:p></w:ins>',
    '<w:del><w:p><w:r><w:t>Deleted</w:t></w:r></w:p></w:del>',
  ].join('')), {
    targetScope: TARGET_SCOPE,
    createdAt: '2026-04-24T08:00:00.000Z',
  });

  assert.equal(result.ok, true);
  assert.equal(result.status, 'ready');
  assert.equal(result.code, 'DOCX_REVIEW_PREVIEW_SESSION_CANDIDATE_READY');
  assert.equal(result.canOpenReviewSession, true);
  assert.equal(result.canCreateReviewPacket, true);
  assert.equal(result.reviewPacket.commentThreads.length, 0);
  assert.equal(result.reviewPacket.commentPlacements.length, 0);
  assert.deepEqual(result.reviewPacket.textChanges, []);
  assert.equal(result.reviewPacket.structuralChanges.length, 2);
  assert.equal(result.reviewPacket.structuralChanges.every((item) => item.kind.includes('complex')), true);
  assert.equal(result.reviewPacket.diagnosticItems.length, 4);
  assert.equal(result.sourceViewState.viewMode, 'docx-review-preview');
  assert.equal(result.summary.trackedChangesDiagnosticOnly, true);
  assert.equal(result.summary.trackedTextCandidateCount, 0);
  assert.equal(result.summary.structuralChangeCount, 2);
  assert.equal(result.summary.diagnosticItemCount, 4);
  assert.ok(result.diagnostics.some((item) => (
    item.diagnosticId === 'docx-review-tracked-insertCount'
    && item.message.includes('manual-only candidates')
  )));
  assertNoStorageOrApplyAuthority(result);
});

test('DOCX review preview session candidate: adjacent delete and insert become one zero-write text candidate', async () => {
  const bridge = await loadBridge();
  const result = bridge.buildDocxReviewPreviewSessionCandidateFromZipBytes(cleanDocxZip([
    '<w:p>',
    '<w:r><w:t>Alpha </w:t></w:r>',
    '<w:del w:id="1" w:author="reviewer"><w:r><w:delText>beta</w:delText></w:r></w:del>',
    '<w:ins w:id="2" w:author="reviewer"><w:r><w:t>delta</w:t></w:r></w:ins>',
    '<w:r><w:t> gamma.</w:t></w:r>',
    '</w:p>',
  ].join('')), {
    targetScope: TARGET_SCOPE,
    createdAt: '2026-04-24T08:00:00.000Z',
  });

  assert.equal(result.ok, true);
  assert.equal(result.status, 'ready');
  assert.equal(result.canOpenReviewSession, true);
  assert.equal(result.canAutoApply, false);
  assert.equal(result.canImportMutate, false);
  assert.equal(result.canWriteStorage, false);
  assert.equal(result.reviewPacket.textChanges.length, 1);
  assert.equal(result.reviewPacket.textChanges[0].targetScope.id, TARGET_SCOPE.id);
  assert.equal(result.reviewPacket.textChanges[0].match.kind, 'manual');
  assert.equal(result.reviewPacket.textChanges[0].match.quote, 'beta');
  assert.equal(result.reviewPacket.textChanges[0].replacementText, 'delta');
  assert.deepEqual(result.reviewPacket.structuralChanges, []);
  assert.equal(result.summary.trackedChangesDiagnosticOnly, false);
  assert.equal(result.summary.trackedTextCandidateCount, 1);
  assertNoStorageOrApplyAuthority(result);
});

test('DOCX review preview session candidate: full manuscript paragraph signals route tracked text to scenes', async () => {
  const bridge = await loadBridge();
  const result = bridge.buildDocxReviewPreviewSessionCandidateFromZipBytes(cleanDocxZip([
    '<w:p w14:paraId="aaaabbbb" w14:textId="11112222">',
    '<w:r><w:t>Alpha </w:t></w:r>',
    '<w:del w:id="1"><w:r><w:delText>first phrase</w:delText></w:r></w:del>',
    '<w:ins w:id="2"><w:r><w:t>first replacement</w:t></w:r></w:ins>',
    '</w:p>',
    '<w:p w14:paraId="ccccdddd" w14:textId="33334444">',
    '<w:r><w:t>Beta </w:t></w:r>',
    '<w:del w:id="3"><w:r><w:delText>second phrase</w:delText></w:r></w:del>',
    '<w:ins w:id="4"><w:r><w:t>second replacement</w:t></w:r></w:ins>',
    '</w:p>',
  ].join('')), {
    targetScope: { type: 'scene', id: 'roman/currently-open.txt' },
    fullManuscriptExportMap: {
      scenes: [
        {
          sceneId: 'roman/chapter-01.txt',
          blocks: [
            {
              wordSignals: [
                { kind: 'w14ParaIdTextId', value: { paraId: 'aaaabbbb', textId: '11112222' } },
              ],
            },
          ],
        },
        {
          sceneId: 'roman/chapter-02.txt',
          blocks: [
            {
              wordSignals: [
                { kind: 'w14ParaIdTextId', value: { paraId: 'ccccdddd', textId: '33334444' } },
              ],
            },
          ],
        },
      ],
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.status, 'ready');
  assert.deepEqual(result.reviewPacket.textChanges.map((change) => change.targetScope), [
    { type: 'scene', id: 'roman/chapter-01.txt' },
    { type: 'scene', id: 'roman/chapter-02.txt' },
  ]);
  assert.deepEqual(result.reviewPacket.textChanges.map((change) => change.match.quote), [
    'first phrase',
    'second phrase',
  ]);
  assert.deepEqual(result.reviewPacket.textChanges.map((change) => change.match.kind), [
    'exact',
    'exact',
  ]);
  assertNoStorageOrApplyAuthority(result);
});

test('DOCX review preview session candidate: authenticated paragraph signals route comments to scenes without quote heuristics', async () => {
  const bridge = await loadBridge();
  const bytes = docxWithCommentAndBody([
    '<w:p w14:paraId="aaaabbbb" w14:textId="11112222">',
    '<w:commentRangeStart w:id="0"/>',
    '<w:r><w:t>Physical comment anchor</w:t></w:r>',
    '<w:commentRangeEnd w:id="0"/>',
    '<w:r><w:commentReference w:id="0"/></w:r>',
    '</w:p>',
  ].join(''), 'Physical root body');
  const exportMap = {
    scenes: [{
      sceneId: 'roman/chapter-01.txt',
      blocks: [{
        wordSignals: [{ kind: 'w14ParaIdTextId', value: { paraId: 'aaaabbbb', textId: '11112222' } }],
      }],
    }],
  };
  const result = bridge.buildDocxReviewPreviewSessionCandidateFromZipBytes(bytes, {
    targetScope: { type: 'scene', id: 'roman/currently-open.txt' },
    fullManuscriptExportMap: exportMap,
  });
  assert.equal(result.ok, true);
  assert.equal(result.reviewPacket.commentPlacements.length, 1);
  assert.deepEqual(result.reviewPacket.commentPlacements[0].targetScope, {
    type: 'scene', id: 'roman/chapter-01.txt',
  });
  assert.equal(
    result.reviewPacket.commentPlacements[0].sceneAuthority.authority,
    'authenticated-full-manuscript-export-map-paragraph-signal',
  );
  assert.equal(result.reviewPacket.commentPlacements[0].quote, 'Physical comment anchor');

  const unresolved = bridge.buildDocxReviewPreviewSessionCandidateFromZipBytes(bytes, {
    targetScope: { type: 'scene', id: 'roman/currently-open.txt' },
    fullManuscriptExportMap: { scenes: [] },
  });
  assert.equal(unresolved.reviewPacket.commentPlacements.length, 0);
  assert.equal(unresolved.diagnostics.some((item) => (
    item.diagnosticId === 'docx-review-comment-scene-authority-0'
  )), true);
});

test('DOCX review preview session candidate: full manuscript retained-quote insert lane stays manual', async () => {
  const bridge = await loadBridge();
  const result = bridge.buildDocxReviewPreviewSessionCandidateFromZipBytes(cleanDocxZip([
    '<w:p w14:paraId="aaaabbbb" w14:textId="11112222">',
    '<w:r><w:t>Alpha </w:t></w:r>',
    '<w:del w:id="1"><w:r><w:delText>stable quote</w:delText></w:r></w:del>',
    '<w:ins w:id="2"><w:r><w:t>inserted prefix stable quote</w:t></w:r></w:ins>',
    '</w:p>',
  ].join('')), {
    targetScope: { type: 'scene', id: 'roman/currently-open.txt' },
    fullManuscriptExportMap: {
      scenes: [
        {
          sceneId: 'roman/chapter-01.txt',
          blocks: [
            {
              wordSignals: [
                { kind: 'w14ParaIdTextId', value: { paraId: 'aaaabbbb', textId: '11112222' } },
              ],
            },
          ],
        },
      ],
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.status, 'ready');
  assert.equal(result.reviewPacket.textChanges.length, 1);
  assert.deepEqual(result.reviewPacket.textChanges[0].targetScope, { type: 'scene', id: 'roman/chapter-01.txt' });
  assert.equal(result.reviewPacket.textChanges[0].match.quote, 'stable quote');
  assert.equal(result.reviewPacket.textChanges[0].replacementText, 'inserted prefix stable quote');
  assert.equal(result.reviewPacket.textChanges[0].match.kind, 'manual');
  assert.equal(result.reviewPacket.textChanges[0].sourceAuthority, undefined);
  assertNoStorageOrApplyAuthority(result);
});

test('DOCX review preview session candidate: full manuscript bookmark signals route Word-rewritten paragraphs', async () => {
  const bridge = await loadBridge();
  const result = bridge.buildDocxReviewPreviewSessionCandidateFromZipBytes(cleanDocxZip([
    '<w:p w14:paraId="wordmade01" w14:textId="wordmade02">',
    '<w:bookmarkStart w:id="7" w:name="YRTK_0002_scene_02_block_0001_abcdef1234"/>',
    '<w:r><w:t>Beta </w:t></w:r>',
    '<w:del w:id="3"><w:r><w:delText>second phrase</w:delText></w:r></w:del>',
    '<w:ins w:id="4"><w:r><w:t>second replacement</w:t></w:r></w:ins>',
    '<w:bookmarkEnd w:id="7"/>',
    '</w:p>',
  ].join('')), {
    targetScope: { type: 'scene', id: 'roman/currently-open.txt' },
    fullManuscriptExportMap: {
      scenes: [
        {
          sceneId: 'roman/chapter-01.txt',
          blocks: [
            {
              blockId: 'scene-01-block-0001-deadbeef00000000',
              wordSignals: [
                { kind: 'w14ParaIdTextId', value: { paraId: 'deadbeef', textId: '11112222' } },
              ],
            },
          ],
        },
        {
          sceneId: 'roman/chapter-02.txt',
          blocks: [
            {
              blockId: 'scene-02-block-0001-abcdef1234567890',
              wordSignals: [
                { kind: 'w14ParaIdTextId', value: { paraId: 'abcdef12', textId: '33334444' } },
              ],
            },
          ],
        },
      ],
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.status, 'ready');
  assert.equal(result.reviewPacket.textChanges.length, 1);
  assert.deepEqual(result.reviewPacket.textChanges[0].targetScope, { type: 'scene', id: 'roman/chapter-02.txt' });
  assert.equal(result.reviewPacket.textChanges[0].match.kind, 'exact');
  assert.equal(result.reviewPacket.textChanges[0].sourceAuthority, 'full-manuscript-export-map-paragraph-signal');
  assertNoStorageOrApplyAuthority(result);
});

test('DOCX review preview session candidate: full manuscript comment accepts Word-split open bookmark authority', async () => {
  const bridge = await loadBridge();
  const result = bridge.buildDocxReviewPreviewSessionCandidateFromZipBytes(docxWithCommentAndBody([
    '<w:p w14:paraId="wordmade01" w14:textId="wordmade02">',
    '<w:bookmarkStart w:id="7" w:name="YRTK_0001_scene_01_block_0001_abcdef1234"/>',
    '</w:p>',
    '<w:p w14:paraId="wordmade03" w14:textId="wordmade04">',
    '<w:r><w:t>Alpha </w:t></w:r>',
    '<w:commentRangeStart w:id="0"/>',
    '<w:r><w:t>comment anchor</w:t></w:r>',
    '<w:commentRangeEnd w:id="0"/>',
    '<w:r><w:commentReference w:id="0"/></w:r>',
    '<w:r><w:t> omega</w:t></w:r>',
    '<w:bookmarkEnd w:id="7"/>',
    '</w:p>',
  ].join(''), 'Root body'), {
    targetScope: { type: 'scene', id: 'roman/currently-open.txt' },
    fullManuscriptExportMap: {
      scenes: [
        {
          sceneId: 'roman/chapter-01.txt',
          blocks: [
            {
              blockId: 'scene-01-block-0001-abcdef1234567890',
              wordSignals: [
                { kind: 'w14ParaIdTextId', value: { paraId: 'deadbeef', textId: '11112222' } },
              ],
            },
          ],
        },
      ],
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.status, 'ready');
  assert.equal(result.reviewPacket.commentPlacements.length, 1);
  assert.deepEqual(result.reviewPacket.commentPlacements[0].targetScope, { type: 'scene', id: 'roman/chapter-01.txt' });
  assert.equal(result.reviewPacket.commentPlacements[0].sceneAuthority.bookmarkNames.includes('YRTK_0001_scene_01_block_0001_abcdef1234'), true);
  assertNoStorageOrApplyAuthority(result);
});

test('DOCX review preview session candidate: full manuscript unresolved paragraphs cannot fall back to exact open scene', async () => {
  const bridge = await loadBridge();
  const result = bridge.buildDocxReviewPreviewSessionCandidateFromZipBytes(cleanDocxZip([
    '<w:p w14:paraId="wordmade01" w14:textId="wordmade02">',
    '<w:r><w:t>Alpha </w:t></w:r>',
    '<w:del w:id="1"><w:r><w:delText>first phrase</w:delText></w:r></w:del>',
    '<w:ins w:id="2"><w:r><w:t>first replacement</w:t></w:r></w:ins>',
    '</w:p>',
  ].join('')), {
    targetScope: { type: 'scene', id: 'roman/currently-open.txt' },
    fullManuscriptExportMap: {
      scenes: [
        {
          sceneId: 'roman/chapter-01.txt',
          blocks: [
            {
              wordSignals: [
                { kind: 'w14ParaIdTextId', value: { paraId: 'aaaabbbb', textId: '11112222' } },
              ],
            },
          ],
        },
      ],
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.status, 'ready');
  assert.equal(result.reviewPacket.textChanges.length, 1);
  assert.deepEqual(result.reviewPacket.textChanges[0].targetScope, { type: 'scene', id: 'roman/currently-open.txt' });
  assert.equal(result.reviewPacket.textChanges[0].match.kind, 'manual');
  assert.equal(result.reviewPacket.textChanges[0].sourceAuthority, undefined);
  assertNoStorageOrApplyAuthority(result);
});

test('DOCX review preview session candidate: standalone insert and delete remain distinct manual candidates', async () => {
  const bridge = await loadBridge();
  const result = bridge.buildDocxReviewPreviewSessionCandidateFromZipBytes(cleanDocxZip([
    '<w:p><w:ins w:id="3"><w:r><w:t>Inserted</w:t></w:r></w:ins></w:p>',
    '<w:p><w:del w:id="4"><w:r><w:delText>Deleted</w:delText></w:r></w:del></w:p>',
  ].join('')), {
    targetScope: TARGET_SCOPE,
  });

  assert.equal(result.status, 'ready');
  assert.equal(result.reviewPacket.textChanges.length, 2);
  assert.deepEqual(
    result.reviewPacket.textChanges.map((change) => ({
      matchKind: change.match.kind,
      quote: change.match.quote,
      replacementText: change.replacementText,
    })),
    [
      { matchKind: 'manual', quote: '', replacementText: 'Inserted' },
      { matchKind: 'manual', quote: 'Deleted', replacementText: '' },
    ],
  );
  assert.equal(result.canAutoApply, false);
  assertNoStorageOrApplyAuthority(result);
});

test('DOCX review preview session candidate: separated delete and insert do not collapse into replacement', async () => {
  const bridge = await loadBridge();
  const result = bridge.buildDocxReviewPreviewSessionCandidateFromZipBytes(cleanDocxZip([
    '<w:p>',
    '<w:del w:id="5"><w:r><w:delText>Old</w:delText></w:r></w:del>',
    '<w:r><w:t> bridge </w:t></w:r>',
    '<w:ins w:id="6"><w:r><w:t>New</w:t></w:r></w:ins>',
    '</w:p>',
  ].join('')), {
    targetScope: TARGET_SCOPE,
  });

  assert.equal(result.status, 'ready');
  assert.equal(result.reviewPacket.textChanges.length, 2);
  assert.equal(result.reviewPacket.textChanges[0].match.quote, 'Old');
  assert.equal(result.reviewPacket.textChanges[0].replacementText, '');
  assert.equal(result.reviewPacket.textChanges[1].match.quote, '');
  assert.equal(result.reviewPacket.textChanges[1].replacementText, 'New');
  assertNoStorageOrApplyAuthority(result);
});

test('DOCX review preview session candidate: table revisions stay structural and malformed XML blocks', async () => {
  const bridge = await loadBridge();
  const table = bridge.buildDocxReviewPreviewSessionCandidateFromZipBytes(cleanDocxZip([
    '<w:tbl><w:tr><w:tc><w:p>',
    '<w:ins w:id="table-1"><w:r><w:t>Table insertion</w:t></w:r></w:ins>',
    '</w:p></w:tc></w:tr></w:tbl>',
  ].join('')), {
    targetScope: TARGET_SCOPE,
  });
  const malformed = bridge.buildDocxReviewPreviewSessionCandidateFromZipBytes(cleanDocxZip(
    '<w:p><w:ins w:id="broken"><w:r><w:t>Broken</w:del></w:r></w:ins></w:p>',
  ), {
    targetScope: TARGET_SCOPE,
  });

  assert.equal(table.status, 'ready');
  assert.deepEqual(table.reviewPacket.textChanges, []);
  assert.equal(table.reviewPacket.structuralChanges.length, 1);
  assert.match(table.reviewPacket.structuralChanges[0].kind, /complex/u);
  assert.equal(table.summary.trackedTextCandidateCount, 0);
  assertNoStorageOrApplyAuthority(table);

  assert.equal(malformed.ok, false);
  assert.equal(malformed.status, 'blocked');
  assert.equal(malformed.reason, 'DOCX_REVIEW_TRACKED_CHANGE_XML_MALFORMED');
  assert.equal(malformed.reviewPacket, null);
  assert.equal(malformed.canOpenReviewSession, false);
  assertNoStorageOrApplyAuthority(malformed);
});

test('DOCX review preview session candidate: structural candidates are bounded and uniquely identified', async () => {
  const bridge = await loadBridge();
  const complexRevisions = Array.from({ length: 105 }, (_, index) => (
    `<w:ins><w:p><w:r><w:t>Complex ${index}</w:t></w:r></w:p></w:ins>`
  )).join('');
  const result = bridge.buildDocxReviewPreviewSessionCandidateFromZipBytes(cleanDocxZip(complexRevisions), {
    targetScope: TARGET_SCOPE,
  });

  assert.equal(result.status, 'ready');
  assert.equal(result.reviewPacket.structuralChanges.length, 100);
  assert.equal(new Set(result.reviewPacket.structuralChanges.map((item) => item.structuralChangeId)).size, 100);
  assert.equal(result.budgets.maxTrackedStructuralCandidates, 100);
  assert.ok(result.reviewPacket.diagnosticItems.some((item) => (
    item.message.includes('structural candidates exceed the bounded review budget')
  )));
  assertNoStorageOrApplyAuthority(result);
});

test('DOCX review preview session candidate: comments plus complex revisions stay out of textChanges', async () => {
  const bridge = await loadBridge();
  const result = bridge.buildDocxReviewPreviewSessionCandidateFromZipBytes(docxWithAnchoredComment(
    '<w:ins><w:p><w:r><w:t>Inserted</w:t></w:r></w:p></w:ins>',
  ), {
    targetScope: TARGET_SCOPE,
    createdAt: '2026-04-24T08:00:00.000Z',
  });

  assert.equal(result.ok, true);
  assert.equal(result.status, 'ready');
  assert.equal(result.reviewPacket.commentThreads.length, 1);
  assert.deepEqual(result.reviewPacket.textChanges, []);
  assert.equal(result.reviewPacket.structuralChanges.length, 1);
  assert.ok(result.reviewPacket.diagnosticItems.some((item) => (
    item.diagnosticId === 'docx-review-tracked-insertCount'
  )));
});

test('DOCX review preview session candidate: clean and malformed inputs do not create review packets', async () => {
  const bridge = await loadBridge();
  const clean = bridge.buildDocxReviewPreviewSessionCandidateFromZipBytes(cleanDocxZip(paragraphXml('Clean')), {
    targetScope: TARGET_SCOPE,
  });
  const malformed = bridge.buildDocxReviewPreviewSessionCandidateFromZipBytes('review.docx', {
    targetScope: TARGET_SCOPE,
  });

  assert.equal(clean.ok, true);
  assert.equal(clean.status, 'diagnostics');
  assert.equal(clean.reviewPacket, null);
  assert.equal(clean.summary.diagnosticItemCount, 0);
  assert.equal(clean.canOpenReviewSession, false);
  assert.equal(malformed.ok, false);
  assert.equal(malformed.status, 'blocked');
  assert.equal(malformed.reviewPacket, null);
  assert.equal(malformed.canOpenReviewSession, false);
});

test('DOCX review preview session candidate: ready packet feeds Stage01 with blocked apply plan', async () => {
  const bridge = await loadBridge();
  const candidate = bridge.buildDocxReviewPreviewSessionCandidateFromZipBytes(docxWithAnchoredComment(), {
    targetScope: TARGET_SCOPE,
    createdAt: '2026-04-24T08:00:00.000Z',
  });

  const preview = bridge.buildStage01FixedCorePreview({
    projectId: 'project-1',
    sessionId: 'docx-preview-session-1',
    baselineHash: 'baseline-1',
    currentBaselineHash: 'baseline-1',
    reviewPacket: candidate.reviewPacket,
    sourceViewState: candidate.sourceViewState,
  });

  assert.equal(preview.ok, true);
  assert.equal(preview.status, 'preview');
  assert.equal(preview.preview.blockedApplyPlan.canApply, false);
  assert.deepEqual(preview.preview.blockedApplyPlan.applyOps, []);
  assert.equal(preview.preview.shadowPreview.session.reviewGraph.commentThreads.length, 1);
  assert.deepEqual(preview.preview.shadowPreview.session.reviewGraph.textChanges, []);
});

test('DOCX review preview session candidate: section has no disk, command, or export authority', () => {
  const source = extractMarkedSection(readBridgeSource(), SECTION_START, SECTION_END);
  for (const forbidden of [
    'writeFileAtomic',
    'queueDiskOperation',
    'handleReviewSurfaceImportPacketCommandSurface',
    'applyDocxImportSafeCreate',
    'buildDocxMinBuffer',
    'fs.',
    'ipcMain',
  ]) {
    assert.equal(source.includes(forbidden), false, forbidden);
  }
});
