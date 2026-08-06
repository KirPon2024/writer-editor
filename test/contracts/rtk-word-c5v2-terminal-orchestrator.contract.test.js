const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { pathToFileURL } = require('node:url');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const ORCH_PATH = path.join(REPO_ROOT, 'scripts', 'ops', 'rtk-word-c5v2-terminal-orchestrator.mjs');
const CANARY_PATH = path.join(REPO_ROOT, 'scripts', 'ops', 'rtk-word-c5v2-physical-canary.mjs');
const LEDGER_ENGINE_PATH = path.join(REPO_ROOT, 'scripts', 'ops', 'rtk-word-c5v2-ledger-engine.mjs');
const TEST_TMP_REAL = fs.realpathSync.native(os.tmpdir());
const C5V2_CONTRACT_TEMP_PREFIXES = Object.freeze(['c5v2-']);

async function loadOrchestrator() {
  return import(ORCH_PATH);
}

async function loadCanary() {
  return import(CANARY_PATH);
}

async function loadLedgerEngine() {
  return import(LEDGER_ENGINE_PATH);
}

function directChildOf(parent, child) {
  return path.dirname(child) === parent;
}

function formatLeaseResidue(residue) {
  return residue.map((item) => `${item.path}:${item.reason}:${item.bytes}`).join(',');
}

function byteSizeNoFollow(root) {
  let total = 0;
  const stack = [root];
  while (stack.length > 0) {
    const current = stack.pop();
    let stat;
    try {
      stat = fs.lstatSync(current);
    } catch (error) {
      if (error && error.code === 'ENOENT') continue;
      throw error;
    }
    total += stat.size;
    if (stat.isDirectory() && !stat.isSymbolicLink()) {
      for (const entry of fs.readdirSync(current)) stack.push(path.join(current, entry));
    }
  }
  return total;
}

function removeNoFollow(root) {
  let stat;
  try {
    stat = fs.lstatSync(root);
  } catch (error) {
    if (error && error.code === 'ENOENT') return;
    throw error;
  }
  if (stat.isDirectory() && !stat.isSymbolicLink()) {
    for (const entry of fs.readdirSync(root)) removeNoFollow(path.join(root, entry));
    fs.rmdirSync(root);
    return;
  }
  fs.unlinkSync(root);
}

function createTempLeaseRegistry({
  tmpRoot = os.tmpdir(),
  allowedPrefixes = C5V2_CONTRACT_TEMP_PREFIXES,
  beforeRemove = null,
} = {}) {
  const tmpReal = fs.realpathSync.native(tmpRoot);
  const leases = new Map();

  const assertLeaseRoot = (root, { requireExists = true } = {}) => {
    const resolved = path.resolve(root);
    if (!directChildOf(tmpReal, resolved)) {
      throw new Error(`TEMP_LEASE_ROOT_NOT_DIRECT_CHILD:${resolved}`);
    }
    const base = path.basename(resolved);
    if (!allowedPrefixes.some((prefix) => base.startsWith(prefix))) {
      throw new Error(`TEMP_LEASE_ROOT_PREFIX_REJECTED:${resolved}`);
    }
    let stat = null;
    try {
      stat = fs.lstatSync(resolved);
    } catch (error) {
      if (error && error.code === 'ENOENT' && !requireExists) return resolved;
      throw error;
    }
    if (!stat.isDirectory() || stat.isSymbolicLink()) {
      throw new Error(`TEMP_LEASE_ROOT_TYPE_REJECTED:${resolved}`);
    }
    const real = fs.realpathSync.native(resolved);
    if (real !== resolved || !directChildOf(tmpReal, real)) {
      throw new Error(`TEMP_LEASE_ROOT_CANONICAL_REJECTED:${resolved}:${real}`);
    }
    return resolved;
  };

  return {
    mkdtemp(prefix) {
      if (!allowedPrefixes.some((allowed) => prefix.startsWith(allowed))) {
        throw new Error(`TEMP_LEASE_PREFIX_REJECTED:${prefix}`);
      }
      const root = fs.mkdtempSync(path.join(tmpReal, prefix));
      const leaseRoot = assertLeaseRoot(root);
      leases.set(leaseRoot, { root: leaseRoot, createdAtMs: Date.now(), prefix });
      return leaseRoot;
    },
    registerExistingRoot(root) {
      const leaseRoot = assertLeaseRoot(root);
      leases.set(leaseRoot, { root: leaseRoot, createdAtMs: Date.now(), prefix: path.basename(leaseRoot) });
      return leaseRoot;
    },
    has(root) {
      return leases.has(path.resolve(root));
    },
    count() {
      return leases.size;
    },
    snapshot() {
      return [...leases.keys()].sort();
    },
    cleanupAll() {
      const residue = [];
      for (const leaseRoot of [...leases.keys()].sort().reverse()) {
        try {
          assertLeaseRoot(leaseRoot, { requireExists: false });
          if (fs.existsSync(leaseRoot)) {
            if (beforeRemove) beforeRemove(leaseRoot);
            removeNoFollow(leaseRoot);
          }
          leases.delete(leaseRoot);
        } catch (error) {
          residue.push({
            path: leaseRoot,
            reason: error && error.message ? error.message : String(error),
            bytes: fs.existsSync(leaseRoot) ? byteSizeNoFollow(leaseRoot) : 0,
          });
        }
      }
      if (residue.length > 0) {
        throw new Error(`TEMP_LEASE_CLEANUP_FAILED:${formatLeaseResidue(residue)}`);
      }
      return { ok: true, cleaned: true };
    },
  };
}

const tempLeases = createTempLeaseRegistry();

test.after(() => {
  tempLeases.cleanupAll();
  assert.equal(tempLeases.count(), 0, `C5V2_TEMP_LEASES_UNCLEANED:${JSON.stringify(tempLeases.snapshot())}`);
});

function tmpDir(prefix) {
  return tempLeases.mkdtemp(prefix);
}

function leaseTest(name, options, fn) {
  if (typeof options === 'function') {
    fn = options;
    options = undefined;
  }
  return test(name, options, async (t) => {
    try {
      return await fn(t);
    } finally {
      t.after(() => {
        tempLeases.cleanupAll();
        assert.equal(tempLeases.count(), 0, `C5V2_TEMP_LEASES_UNCLEANED:${JSON.stringify(tempLeases.snapshot())}`);
      });
    }
  });
}

function sha256File(filePath) {
  return 'sha256:' + crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function sha256Text(value) {
  return 'sha256:' + crypto.createHash('sha256').update(String(value), 'utf8').digest('hex');
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function digestOf(value) {
  return sha256Text(stableJson(value));
}

const CRC32_TABLE = Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) {
    value = (value & 1) ? (0xedb88320 ^ (value >>> 1)) : (value >>> 1);
  }
  return value >>> 0;
});

function crc32Buffer(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = CRC32_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function xmlEscape(value) {
  return String(value)
    .replace(/&/gu, '&amp;')
    .replace(/</gu, '&lt;')
    .replace(/>/gu, '&gt;')
    .replace(/"/gu, '&quot;')
    .replace(/'/gu, '&apos;');
}

function writeStoredZip(filePath, entries) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;
  for (const entry of entries) {
    const name = Buffer.from(entry.name, 'utf8');
    const content = Buffer.isBuffer(entry.content) ? entry.content : Buffer.from(String(entry.content), 'utf8');
    const crc = crc32Buffer(content);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(0, 8);
    local.writeUInt16LE(0, 10);
    local.writeUInt16LE(0, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(content.length, 18);
    local.writeUInt32LE(content.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    localParts.push(local, name, content);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt16LE(0, 12);
    central.writeUInt16LE(0, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(content.length, 20);
    central.writeUInt32LE(content.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(offset, 42);
    centralParts.push(central, name);
    offset += local.length + name.length + content.length;
  }
  const centralDirectory = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);
  fs.writeFileSync(filePath, Buffer.concat([...localParts, centralDirectory, end]));
}

function runTextXml(text, { bold = false, italic = false } = {}) {
  const runProps = `${bold ? '<w:b/>' : ''}${italic ? '<w:i/>' : ''}`;
  return `<w:r>${runProps ? `<w:rPr>${runProps}</w:rPr>` : ''}<w:t>${xmlEscape(text)}</w:t></w:r>`;
}

function paragraphXml(text, { bold = false, italic = false, headingLevel = 0, commentId = '' } = {}) {
  const pPr = headingLevel > 0
    ? `<w:pPr><w:pStyle w:val="Heading${headingLevel}"/><w:outlineLvl w:val="${headingLevel - 1}"/></w:pPr>`
    : '';
  const commentStart = commentId ? `<w:commentRangeStart w:id="${commentId}"/>` : '';
  const commentEnd = commentId ? `<w:commentRangeEnd w:id="${commentId}"/>` : '';
  return `<w:p>${pPr}${commentStart}${runTextXml(text, { bold, italic })}${commentEnd}</w:p>`;
}

function writeDocxPackage(filePath, {
  paragraphs = [],
  revisionOperations = [],
  rootCommentOperations = [],
} = {}) {
  const documentParagraphs = paragraphs.map((paragraph) => paragraphXml(
    paragraph.text,
    {
      bold: paragraph.bold === true,
      italic: paragraph.italic === true,
      headingLevel: Number(paragraph.headingLevel || 0),
    },
  ));
  const revisionParagraphs = revisionOperations.map((operation) => {
    const inserted = operation.family === 'tracked_delete'
      ? ''
      : `<w:ins>${runTextXml(operation.replacementText || '')}</w:ins>`;
    const deleted = operation.family === 'tracked_insert'
      ? ''
      : `<w:del><w:r><w:delText>${xmlEscape(operation.quote || '')}</w:delText></w:r></w:del>`;
    return `<w:p>${inserted}${deleted}</w:p>`;
  });
  const commentParagraphs = rootCommentOperations.map((operation, index) => paragraphXml(
    operation.quote || operation.id,
    { commentId: String(index + 1) },
  ));
  const commentsXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<w:comments xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
    + rootCommentOperations.map((operation, index) => (
      `<w:comment w:id="${index + 1}">${paragraphXml(`C5V2 root ${operation.id}`)}</w:comment>`
    )).join('')
    + '</w:comments>';
  writeStoredZip(filePath, [
    {
      name: '[Content_Types].xml',
      content: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
        + '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
        + '<Default Extension="xml" ContentType="application/xml"/>'
        + '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>'
        + '<Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/>'
        + '<Override PartName="/word/comments.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.comments+xml"/>'
        + '</Types>',
    },
    {
      name: '_rels/.rels',
      content: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>'
        + '</Relationships>',
    },
    {
      name: 'word/document.xml',
      content: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        + '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
        + `<w:body>${documentParagraphs.join('')}${revisionParagraphs.join('')}${commentParagraphs.join('')}<w:sectPr/></w:body>`
        + '</w:document>',
    },
    {
      name: 'word/comments.xml',
      content: commentsXml,
    },
    {
      name: 'word/settings.xml',
      content: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        + '<w:settings xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
        + '<w:compat><w:compatSetting w:name="compatibilityMode" w:uri="http://schemas.microsoft.com/office/word" w:val="15"/></w:compat>'
        + '</w:settings>',
    },
  ]);
}

function writeMinimalDocx(filePath, text) {
  writeDocxPackage(filePath, { paragraphs: [{ text }] });
}

function writeNativeLifecycleSnapshotDocx(filePath, operation) {
  const rootId = String(operation.targetRootOperationId || '').replace(/^.*?(\d+)$/u, '$1') || '1';
  const rootParaId = `ROOT_${rootId}`;
  const replyParaId = `REPLY_${String(operation.id || '').replace(/[^A-Za-z0-9]/gu, '_')}`;
  const requestedState = operation.requestedState === 'reopened' ? 'reopen' : operation.requestedState;
  const rootComment = `<w:comment w:id="${xmlEscape(rootId)}"><w:p w14:paraId="${xmlEscape(rootParaId)}"><w:r><w:t>${xmlEscape(`C5V2 root ${operation.targetRootOperationId}`)}</w:t></w:r></w:p></w:comment>`;
  const replyComment = `<w:comment w:id="${xmlEscape(`${rootId}8`)}" w:parentId="${xmlEscape(rootId)}"><w:p w14:paraId="${xmlEscape(replyParaId)}"><w:r><w:t>${xmlEscape(`C5V2 reply ${operation.id}`)}</w:t></w:r></w:p></w:comment>`;
  const commentsXml = requestedState === 'delete'
    ? '<w:comments xmlns:w="w" xmlns:w14="w14"/>'
    : `<w:comments xmlns:w="w" xmlns:w14="w14">${rootComment}${operation.family === 'reply_attempt' ? replyComment : ''}</w:comments>`;
  const done = requestedState === 'resolve' ? '1' : '0';
  const commentsExtendedXml = requestedState === 'delete'
    ? '<w15:commentsEx xmlns:w15="w15"/>'
    : '<w15:commentsEx xmlns:w15="w15">'
      + `<w15:commentEx w15:paraId="${xmlEscape(rootParaId)}" w15:done="${done}"/>`
      + (operation.family === 'reply_attempt'
        ? `<w15:commentEx w15:paraId="${xmlEscape(replyParaId)}" w15:paraIdParent="${xmlEscape(rootParaId)}" w15:done="0"/>`
        : '')
      + '</w15:commentsEx>';
  writeStoredZip(filePath, [
    {
      name: '[Content_Types].xml',
      content: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
        + '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
        + '<Default Extension="xml" ContentType="application/xml"/>'
        + '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>'
        + '<Override PartName="/word/comments.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.comments+xml"/>'
        + '</Types>',
    },
    {
      name: '_rels/.rels',
      content: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>'
        + '</Relationships>',
    },
    {
      name: 'word/document.xml',
      content: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        + '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>native lifecycle snapshot</w:t></w:r></w:p><w:sectPr/></w:body></w:document>',
    },
    { name: 'word/comments.xml', content: commentsXml },
    { name: 'word/commentsExtended.xml', content: commentsExtendedXml },
  ]);
}

function productParagraphsForTest(text) {
  return String(text || '')
    .split(/\n{2,}/u)
    .map((paragraph) => paragraph.replace(/\s+/gu, ' ').trim())
    .filter(Boolean);
}

function graphemePartsForTest(value) {
  if (typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function') {
    const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
    return Array.from(segmenter.segment(String(value || '')), (part) => part.segment);
  }
  return Array.from(String(value || ''));
}

function markedTextNodeForTest(text, marks = []) {
  return {
    type: 'text',
    text,
    ...(marks.length > 0 ? { marks: marks.map((type) => ({ type })) } : {}),
  };
}

function docV2PayloadFromBlocks(blocks) {
  const doc = {
    type: 'doc',
    content: blocks.map((block) => {
      const content = Array.isArray(block.nodes)
        ? block.nodes
        : [markedTextNodeForTest(block.text, block.marks || [])];
      return {
        type: block.headingLevel > 0 ? 'heading' : 'paragraph',
        ...(block.headingLevel > 0 ? { attrs: { level: block.headingLevel } } : {}),
        content,
      };
    }),
  };
  const serialized = JSON.stringify(doc, null, 2);
  return `[doc-v2 length=${serialized.length}]\n${serialized}`;
}

function physicalOperationForTest(operation, fallbackParagraphOrdinal = 0) {
  const anchor = operation.anchor || operation.masterAnchor || {};
  const selectedText = String(anchor.selectedText || operation.quote || operation.id || '');
  const contextBefore = String(anchor.contextBefore || 'before ');
  const contextAfter = String(anchor.contextAfter || ' after');
  const semanticKind = String(operation.semanticIntent?.kind || '');
  const family = operation.family === 'tracked_text_edit'
    ? `tracked_${['insert', 'replace', 'delete'].includes(semanticKind) ? semanticKind : 'insert'}`
    : operation.family === 'reply'
      ? 'reply_attempt'
      : operation.family === 'comment_state'
        ? 'state_attempt'
        : operation.family;
  return {
    id: operation.id,
    formalFamily: operation.family,
    family,
    sceneId: operation.sceneId,
    band: anchor.positionalThird || 'middle',
    expectedOutcome: operation.expectedOutcome,
    semanticIntent: {
      ...(operation.semanticIntent || {}),
      ...(operation.family === 'tracked_text_edit' && operation.semanticIntent?.replacementText
        ? { replacementText: operation.semanticIntent.replacementText }
        : {}),
    },
    replacementText: operation.semanticIntent?.replacementText || operation.replacementText || `${operation.id}-replacement`,
    formattingKind: operation.semanticIntent?.kind || operation.formattingKind || 'bold',
    headingLevel: operation.semanticIntent?.headingLevel || operation.headingLevel || 2,
    masterAnchor: {
      ...anchor,
      sceneId: operation.sceneId,
      paragraphOrdinal: Number.isInteger(anchor.paragraphOrdinal) ? anchor.paragraphOrdinal : fallbackParagraphOrdinal,
      graphemeStart: Number.isInteger(anchor.graphemeStart) ? anchor.graphemeStart : contextBefore.length,
      graphemeEnd: Number.isInteger(anchor.graphemeEnd) ? anchor.graphemeEnd : contextBefore.length + selectedText.length,
      selectedText,
    },
    quote: selectedText,
    locatorQuote: `${contextBefore}${selectedText}${contextAfter}`,
    locatorSelectionStart: contextBefore.length,
    ...(operation.targetRootOperationId ? { targetRootOperationId: operation.targetRootOperationId } : {}),
    ...(family === 'reply_attempt' || family === 'state_attempt'
      ? { requestedState: family === 'reply_attempt' ? 'reply' : (operation.semanticIntent?.kind || 'resolve') }
      : {}),
  };
}

function buildSyntheticBaselineScenes(operations) {
  const byScene = new Map();
  for (const operation of operations) {
    if (operation.family === 'negative_probe') continue;
    if (!byScene.has(operation.sceneId)) byScene.set(operation.sceneId, []);
    const paragraph = `${operation.anchor?.contextBefore || 'before '}${operation.anchor?.selectedText || operation.id}${operation.anchor?.contextAfter || ' after'}`;
    byScene.get(operation.sceneId).push(paragraph);
  }
  return [...byScene.entries()].map(([sceneId, paragraphs]) => ({
    sceneId,
    file: `${sceneId}.txt`,
    title: sceneId,
    text: paragraphs.join('\n\n'),
    paragraphs,
  }));
}

function baselineScenesForTest(ledger, explicitScenes = null) {
  if (Array.isArray(explicitScenes) && explicitScenes.length > 0) {
    return explicitScenes.map((scene) => ({
      ...scene,
      paragraphs: Array.isArray(scene.paragraphs) ? scene.paragraphs : productParagraphsForTest(scene.text),
      rawContent: scene.rawContent || scene.text || '',
    }));
  }
  return buildSyntheticBaselineScenes(ledger.operations || []);
}

function buildExpectedParagraphsForTest(baselineScene, operations) {
  const paragraphs = (baselineScene.paragraphs || []).slice();
  const byParagraph = new Map();
  for (const operation of operations.filter((item) => (
    ['tracked_replace', 'tracked_insert', 'tracked_delete'].includes(item.family)
    && item.expectedOutcome === 'EXACT'
  ))) {
    const ordinal = operation.masterAnchor?.paragraphOrdinal;
    if (!Number.isInteger(ordinal) || typeof paragraphs[ordinal] !== 'string') continue;
    if (!byParagraph.has(ordinal)) byParagraph.set(ordinal, []);
    byParagraph.get(ordinal).push(operation);
  }
  for (const [ordinal, paragraphOperations] of byParagraph.entries()) {
    const parts = graphemePartsForTest(paragraphs[ordinal]);
    for (const operation of paragraphOperations.slice().sort((left, right) => (
      right.masterAnchor.graphemeStart - left.masterAnchor.graphemeStart
    ))) {
      const start = operation.masterAnchor.graphemeStart;
      const end = operation.masterAnchor.graphemeEnd;
      const replacement = operation.family === 'tracked_delete'
        ? ''
        : operation.family === 'tracked_insert'
          ? `${operation.replacementText} ${operation.quote}`
          : operation.replacementText;
      parts.splice(start, end - start, ...graphemePartsForTest(replacement));
    }
    paragraphs[ordinal] = parts.join('').trim();
  }
  return paragraphs;
}

function exactLedgerBindingForTest(operations) {
  const exactOperations = operations.filter((operation) => (
    ['tracked_replace', 'tracked_insert', 'tracked_delete'].includes(operation.family)
    && operation.expectedOutcome === 'EXACT'
  ));
  const exactApplyTextChangeIdsByScene = {};
  const exactOperationBindings = [];
  for (const operation of exactOperations) {
    if (!exactApplyTextChangeIdsByScene[operation.sceneId]) exactApplyTextChangeIdsByScene[operation.sceneId] = [];
    exactApplyTextChangeIdsByScene[operation.sceneId].push(operation.id);
    exactOperationBindings.push({ operationId: operation.id, sceneId: operation.sceneId, changeId: operation.id });
  }
  return {
    ok: true,
    expectedOperationCount: exactOperations.length,
    matchedOperationCount: exactOperations.length,
    matchedChangeCount: exactOperations.length,
    excludedCandidateCount: 0,
    exactApplyTextChangeIdsByScene,
    exactOperationBindings,
    unmatchedExpectedOperationIds: [],
    duplicateExpectedSignatureOperationIds: [],
    duplicateCandidateBindingIds: [],
    missingDiagnosticCandidateIds: [],
  };
}

function nativeLifecycleVerificationForTest(operations) {
  const lifecycle = operations.filter((operation) => ['reply_attempt', 'state_attempt'].includes(operation.family));
  if (lifecycle.length === 0) return { ok: true, notApplicable: true, results: [], verifiedCount: 0, blockedCount: 0 };
  const results = lifecycle.map((operation) => ({
    operationId: operation.id,
    status: 'SAFE_APPLY',
    reason: operation.family === 'reply_attempt'
      ? 'NATIVE_REPLY_PARENT_VERIFIED_AFTER_REOPEN'
      : `NATIVE_STATE_${String(operation.requestedState || 'resolve').toUpperCase()}_VERIFIED_AFTER_REOPEN`,
  }));
  return { ok: true, notApplicable: false, results, verifiedCount: results.length, blockedCount: 0 };
}

function nativeLifecycleCoverageForTest(operations, nativeLifecycleVerification) {
  const lifecycle = operations.filter((operation) => ['reply_attempt', 'state_attempt'].includes(operation.family));
  const expectedOperationIds = lifecycle.map((operation) => String(operation.id || operation.operationId || ''));
  const typedLimitCount = lifecycle.filter((operation) => operation.physicalAction === 'typed-limit').length;
  const results = Array.isArray(nativeLifecycleVerification?.results) ? nativeLifecycleVerification.results : [];
  const resultIds = results.map((result) => String(result?.operationId || ''));
  const resultIdSet = new Set(resultIds);
  const duplicateResultIds = resultIds.length !== resultIdSet.size;
  const missingOperationIds = expectedOperationIds.filter((operationId) => !resultIdSet.has(operationId));
  const extraResultIds = resultIds.filter((operationId) => operationId && !expectedOperationIds.includes(operationId));
  const verifiedResultCount = results.filter((result) => result?.status === 'SAFE_APPLY').length;
  const blockedResultCount = results.filter((result) => result?.status !== 'SAFE_APPLY').length;
  const notApplicable = lifecycle.length === 0;
  const ok = notApplicable
    ? nativeLifecycleVerification?.ok === true && results.length === 0
    : nativeLifecycleVerification?.ok === true
      && typedLimitCount === 0
      && duplicateResultIds === false
      && missingOperationIds.length === 0
      && extraResultIds.length === 0
      && Number(nativeLifecycleVerification.verifiedCount) === lifecycle.length
      && Number(nativeLifecycleVerification.blockedCount) === 0
      && verifiedResultCount === lifecycle.length
      && blockedResultCount === 0;
  return {
    schemaVersion: 'yalken.rtk.word.c5v2.native-lifecycle-coverage.v1',
    ok,
    notApplicable,
    expectedLifecycleCount: lifecycle.length,
    typedLimitCount,
    resultCount: results.length,
    verifiedCount: Number(nativeLifecycleVerification?.verifiedCount || 0),
    blockedCount: Number(nativeLifecycleVerification?.blockedCount || 0),
    verifiedResultCount,
    blockedResultCount,
    duplicateResultIds,
    missingOperationIds,
    extraResultIds,
    expectedOperationIdsDigest: sha256Text(stableJson(expectedOperationIds)),
    resultOperationIdsDigest: sha256Text(stableJson(resultIds)),
  };
}

function canonicalCommentStateForTest(rootOps) {
  const threads = rootOps.map((operation) => ({
    threadId: `thread-${operation.id}`,
    sceneId: operation.sceneId,
    anchor: { selectedText: operation.quote },
    messages: [{ kind: 'root', body: `C5V2 root ${operation.id}` }],
  }));
  const events = rootOps.map((operation, index) => ({
    sequence: index + 1,
    operationId: operation.id,
    kind: 'root_comment_added',
    threadId: `thread-${operation.id}`,
    sceneId: operation.sceneId,
  }));
  return {
    schemaVersion: 'yalken.rtk.word.non-text-return-state.v1',
    projectId: 'test-project',
    revision: events.length,
    threads,
    events,
  };
}

function writeCanonicalOracleProbeForTest(input) {
  const script = `
import fs from 'node:fs';
import {
  applyNativeLifecycleVerification,
  buildOracleProbe,
  parseWordOutput,
  readNativeLifecycleSnapshots,
} from ${JSON.stringify(pathToFileURL(CANARY_PATH).href)};
const input = JSON.parse(fs.readFileSync(0, 'utf8'));
const ledger = JSON.parse(fs.readFileSync(input.ledgerPath, 'utf8'));
const wordOutput = fs.readFileSync(input.wordOutputPath, 'utf8');
const returnApply = JSON.parse(fs.readFileSync(input.returnApplyPath, 'utf8'));
const nativeLifecycle = readNativeLifecycleSnapshots({ ledger, returnedPath: input.returnedDocxPath });
fs.writeFileSync(input.nativeLifecyclePath, JSON.stringify(nativeLifecycle, null, 2) + '\\n', 'utf8');
const wordParsed = applyNativeLifecycleVerification(parseWordOutput(wordOutput), nativeLifecycle);
const oracle = buildOracleProbe({
  ledger,
  wordParsed,
  returnedDocxPath: input.returnedDocxPath,
  wordVisibleReadbackPath: input.wordVisibleReadbackPath,
  baselineArtifactPath: input.baselineArtifactPath,
  yalkenTruthPath: input.yalkenTruthPath,
  returnApply,
});
process.stdout.write(JSON.stringify(oracle));
`;
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', script], {
    input: JSON.stringify(input),
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
  });
  if (result.status !== 0) {
    throw new Error(`CANONICAL_ORACLE_FIXTURE_FAILED:${result.stderr || result.stdout}`);
  }
  return JSON.parse(result.stdout);
}

function operationRequestEffectIdentity(operation = {}) {
  return {
    operationId: operation.id || operation.operationId || '',
    family: operation.family || '',
    sceneId: operation.sceneId || '',
    round: Number.isInteger(operation.round) ? operation.round : null,
    expectedOutcome: operation.expectedOutcome || '',
    semanticIntent: operation.semanticIntent || null,
    anchor: operation.anchor || null,
    targetRootOperationId: operation.targetRootOperationId || '',
  };
}

function operationRequestKey(operation = {}) {
  return sha256Text(stableJson({ role: 'request', ...operationRequestEffectIdentity(operation) }));
}

function operationEffectKey(operation = {}) {
  return sha256Text(stableJson({
    role: 'effect',
    operationId: operation.id || operation.operationId || '',
    family: operation.family || '',
    expectedOutcome: operation.expectedOutcome || '',
    semanticIntent: operation.semanticIntent || null,
  }));
}

function resumeAuthorityDigest(ledger = {}, identity = {}) {
  const operations = Array.isArray(ledger.operations) ? ledger.operations : [];
  return sha256Text(stableJson({
    schemaVersion: 'yalken.rtk.word.c5v2.master-ledger-resume-authority.v1',
    exactHead: identity.exactHead || '',
    campaignId: identity.campaignId || '',
    corpusDigest: identity.corpusDigest || '',
    roundCount: ledger.roundCount || 0,
    sceneCount: ledger.sceneCount || 0,
    ledgerDigest: ledger.ledgerDigest || '',
    operationCount: operations.length,
    counts: ledger.counts || {},
    operationIds: operations.map((operation) => operation.id || operation.operationId || ''),
    requestEffectKeys: operations.map((operation) => ({
      operationId: operation.id || operation.operationId || '',
      requestKey: operation.requestKey || '',
      effectKey: operation.effectKey || '',
    })),
  }));
}

function canonicalScriptHashes() {
  return {
    orchestrator: sha256File(ORCH_PATH),
    physicalCanary: sha256File(CANARY_PATH),
  };
}

function makeCorpusManifestFileForTest(dir = tmpDir('c5v2-corpus-manifest-')) {
  const manifestPath = path.join(dir, 'corpus-manifest.json');
  writeJson(manifestPath, {
    schemaVersion: 'yalken.rtk.word.c5v2.portfolio-corpus.v1',
    corpusId: 'test-corpus',
    sceneCount: 0,
    expectedWordCount: 0,
    scenes: [],
  });
  return fs.realpathSync(manifestPath);
}

function makeLoadableCorpusManifestFileForTest(label, dir = tmpDir(`c5v2-loadable-corpus-${label}-`), sceneCount = 1) {
  fs.mkdirSync(dir, { recursive: true });
  const scenes = [];
  let expectedWordCount = 0;
  for (let index = 0; index < sceneCount; index += 1) {
    const ordinal = index + 1;
    const file = `${label}-scene-${String(ordinal).padStart(2, '0')}.txt`;
    const text = Array.from({ length: 80 }, (_, paragraphIndex) => {
      const paragraphOrdinal = paragraphIndex + 1;
      const tokens = Array.from({ length: 60 }, (_, tokenIndex) => (
        `s${String(ordinal).padStart(2, '0')}p${String(paragraphOrdinal).padStart(2, '0')}w${String(tokenIndex + 1).padStart(2, '0')}`
      ));
      return `${tokens.slice(0, 20).join(' ')}. ${tokens.slice(20, 40).join(' ')}; ${tokens.slice(40).join(' ')}.`;
    }).join('\n\n');
    const scenePath = path.join(dir, file);
    fs.writeFileSync(scenePath, text, 'utf8');
    const visibleTextSha256 = sha256Text(text);
    const rawSourceSha256 = sha256Text(text);
    const wordCount = (text.match(/\b[\p{L}\p{N}][\p{L}\p{N}'’\-]*\b/gu) || []).length;
    expectedWordCount += wordCount;
    scenes.push({
      ordinal,
      file,
      title: `${label} Scene ${String(ordinal).padStart(2, '0')}`,
      rawSourceSha256,
      visibleTextSha256,
      wordCount,
    });
  }
  const manifestPath = path.join(dir, 'corpus-manifest.json');
  writeJson(manifestPath, {
    schemaVersion: 'yalken.rtk.word.c5v2.portfolio-corpus.v1',
    corpusId: `test-corpus-${label}`,
    sceneCount,
    expectedWordCount,
    scenes,
  });
  return fs.realpathSync(manifestPath);
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2) + '\n', 'utf8');
}

function initCleanGitRepo(dir) {
  spawnSync('git', ['init', '-q'], { cwd: dir });
  spawnSync('git', ['config', 'user.email', 'test@example.invalid'], { cwd: dir });
  spawnSync('git', ['config', 'user.name', 'test'], { cwd: dir });
  fs.writeFileSync(path.join(dir, 'seed.txt'), 'seed\n', 'utf8');
  spawnSync('git', ['add', '.'], { cwd: dir });
  spawnSync('git', ['commit', '-q', '-m', 'seed'], { cwd: dir });
  return spawnSync('git', ['rev-parse', 'HEAD'], { cwd: dir, encoding: 'utf8' }).stdout.trim();
}

function validOptions(overrides = {}) {
  const ledger = makeSemanticLedger();
  const artifactRoot = overrides.artifactRoot || tmpDir('c5v2-orch-opt-');
  return {
    expectedSha: 'a'.repeat(40),
    expectedWordVersion: '16.111.2',
    expectedWordBuild: '16.111.26072617',
    expectedCorpusDigest: 'sha256:' + 'b'.repeat(64),
    expectedLedgerDigest: ledger.ledgerDigest,
    expectedOperationIdSetDigest: ledger.operationIdSetDigest,
    campaignProfile: 'C5V2_DORIAN_TERMINAL',
    artifactRoot,
    campaignId: 'test-campaign-001',
    chainId: 'W06',
    resume: false,
    stageTimeoutMs: 5000,
    progressTimeoutMs: 1500,
    killGraceMs: 700,
    campaignRoot: overrides.campaignRoot || path.join(artifactRoot, overrides.campaignId || 'test-campaign-001'),
    ...overrides,
  };
}

const BASE_ARGS = [
  '--expected-sha', 'a'.repeat(40),
  '--expected-word-version', '16.111.2',
  '--expected-word-build', '16.111.26072617',
  '--expected-corpus-digest', 'sha256:' + 'b'.repeat(64),
  '--expected-ledger-digest', makeSemanticLedger().ledgerDigest,
  '--expected-operation-id-set-digest', makeSemanticLedger().operationIdSetDigest,
  '--campaign-profile', 'C5V2_DORIAN_TERMINAL',
  '--artifact-root', '/tmp/c5v2-orch-args',
  '--campaign-id', 'test-campaign-001',
  '--chain-id', 'W06',
];

function withArg(flag, value) {
  return BASE_ARGS.map((arg, index) => (BASE_ARGS[index - 1] === flag ? value : arg));
}

leaseTest('ORCH_TEMP_LEASE_1: lease cleanup is no-follow, exact, idempotent and preserves symlink targets', () => {
  const root = tmpDir('c5v2-orch-lease-root-');
  const outside = path.join(root, 'outside');
  fs.mkdirSync(outside, { recursive: true });
  const outsideFile = path.join(outside, 'keep.txt');
  fs.writeFileSync(outsideFile, 'keep\n', 'utf8');
  const registryRoot = path.join(root, 'leases');
  fs.mkdirSync(registryRoot);
  const registry = createTempLeaseRegistry({ tmpRoot: registryRoot, allowedPrefixes: ['c5v2-fixture-'] });
  const lease = registry.mkdtemp('c5v2-fixture-');
  fs.writeFileSync(path.join(lease, 'owned.txt'), 'owned\n', 'utf8');
  fs.symlinkSync(outsideFile, path.join(lease, 'outside-link'));

  assert.equal(registry.count(), 1);
  assert.equal(registry.cleanupAll().ok, true);
  assert.equal(fs.existsSync(lease), false);
  assert.equal(fs.readFileSync(outsideFile, 'utf8'), 'keep\n');
  assert.equal(registry.cleanupAll().ok, true);
});

leaseTest('ORCH_TEMP_LEASE_2: symlink root, foreign root, T7 path and pre-existing matching prefix are rejected or preserved', () => {
  const root = tmpDir('c5v2-orch-lease-foreign-');
  const registryRoot = path.join(root, 'leases');
  const outside = path.join(root, 'outside');
  fs.mkdirSync(registryRoot);
  fs.mkdirSync(outside);
  const registry = createTempLeaseRegistry({ tmpRoot: registryRoot, allowedPrefixes: ['c5v2-fixture-'] });
  const symlinkRoot = path.join(registryRoot, 'c5v2-fixture-symlink-root');
  fs.symlinkSync(outside, symlinkRoot);
  assert.throws(() => registry.registerExistingRoot(symlinkRoot), /TEMP_LEASE_ROOT_TYPE_REJECTED/u);
  assert.throws(() => registry.registerExistingRoot(outside), /TEMP_LEASE_ROOT_NOT_DIRECT_CHILD|TEMP_LEASE_ROOT_PREFIX_REJECTED/u);
  assert.throws(
    () => registry.registerExistingRoot('/Volumes/T7-Secure/c5v2-fixture-never-delete'),
    /TEMP_LEASE_ROOT_NOT_DIRECT_CHILD/u,
  );

  const preExisting = path.join(registryRoot, 'c5v2-fixture-pre-existing');
  fs.mkdirSync(preExisting);
  const owned = registry.mkdtemp('c5v2-fixture-');
  assert.equal(registry.cleanupAll().ok, true);
  assert.equal(fs.existsSync(owned), false);
  assert.equal(fs.existsSync(preExisting), true);
  removeNoFollow(preExisting);
});

leaseTest('ORCH_TEMP_LEASE_3: cleanup callback failures are not swallowed and residue is reported', () => {
  const root = tmpDir('c5v2-orch-lease-throw-');
  const registryRoot = path.join(root, 'leases');
  fs.mkdirSync(registryRoot);
  const registry = createTempLeaseRegistry({
    tmpRoot: registryRoot,
    allowedPrefixes: ['c5v2-fixture-'],
    beforeRemove() {
      throw new Error('INJECTED_CLEANUP_FAILURE');
    },
  });
  const lease = registry.mkdtemp('c5v2-fixture-');
  fs.writeFileSync(path.join(lease, 'owned.txt'), 'owned\n', 'utf8');
  assert.throws(() => registry.cleanupAll(), /TEMP_LEASE_CLEANUP_FAILED:.*INJECTED_CLEANUP_FAILURE/u);
  assert.equal(fs.existsSync(lease), true);
  removeNoFollow(lease);
});

leaseTest('ORCH_TEMP_LEASE_4: concurrent fixture allocation is unique and cleanup waits for process cleanup marker', () => {
  const root = tmpDir('c5v2-orch-lease-concurrent-');
  const registryRoot = path.join(root, 'leases');
  fs.mkdirSync(registryRoot);
  let processCleanupDone = false;
  const registry = createTempLeaseRegistry({
    tmpRoot: registryRoot,
    allowedPrefixes: ['c5v2-fixture-'],
    beforeRemove() {
      assert.equal(processCleanupDone, true);
    },
  });
  const leases = Array.from({ length: 25 }, () => registry.mkdtemp('c5v2-fixture-'));
  assert.equal(new Set(leases).size, leases.length);
  for (const lease of leases) fs.writeFileSync(path.join(lease, 'owned.txt'), lease, 'utf8');
  processCleanupDone = true;
  assert.equal(registry.cleanupAll().ok, true);
  for (const lease of leases) assert.equal(fs.existsSync(lease), false);
});

leaseTest('ORCH_TEMP_LEASE_5: assertion and timeout style failures still run exact cleanup in finally', async () => {
  const root = tmpDir('c5v2-orch-lease-failure-');
  const registryRoot = path.join(root, 'leases');
  fs.mkdirSync(registryRoot);
  const registry = createTempLeaseRegistry({ tmpRoot: registryRoot, allowedPrefixes: ['c5v2-fixture-'] });
  const assertionLease = registry.mkdtemp('c5v2-fixture-');
  fs.writeFileSync(path.join(assertionLease, 'owned.txt'), 'owned\n', 'utf8');
  let assertionObserved = false;
  try {
    assert.equal('actual', 'expected');
  } catch {
    assertionObserved = true;
  } finally {
    registry.cleanupAll();
  }
  assert.equal(assertionObserved, true);
  assert.equal(fs.existsSync(assertionLease), false);

  const timeoutLease = registry.mkdtemp('c5v2-fixture-');
  await Promise.race([
    new Promise((resolve) => setTimeout(resolve, 1)),
    new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 20)),
  ]).finally(() => registry.cleanupAll());
  assert.equal(fs.existsSync(timeoutLease), false);
});

leaseTest('ORCH_TEST_1: CLI rejects missing required args with exact flag', async () => {
  const orch = await loadOrchestrator();
  assert.throws(() => orch.parseOrchestratorArgs([]), /ORCH_ARG_REQUIRED:--expected-sha/u);
  assert.throws(() => orch.parseOrchestratorArgs(BASE_ARGS.slice(0, 6)), /ORCH_ARG_REQUIRED/u);
});

leaseTest('ORCH_TEST_2: CLI rejects unknown, duplicate and value-missing args', async () => {
  const orch = await loadOrchestrator();
  assert.throws(() => orch.parseOrchestratorArgs([...BASE_ARGS, '--bogus']), /ORCH_UNKNOWN_ARG:--bogus/u);
  assert.throws(() => orch.parseOrchestratorArgs([...BASE_ARGS, '--chain-id', 'W06']), /ORCH_DUPLICATE_ARG:--chain-id/u);
  assert.throws(() => orch.parseOrchestratorArgs(BASE_ARGS.slice(0, -1)), /ORCH_ARG_VALUE_MISSING/u);
});

leaseTest('ORCH_TEST_3: CLI rejects invalid sha, build, timeout, campaign and chain identities', async () => {
  const orch = await loadOrchestrator();
  assert.throws(() => orch.parseOrchestratorArgs(withArg('--expected-sha', 'zz')), /ORCH_ARG_INVALID:--expected-sha/u);
  assert.throws(() => orch.parseOrchestratorArgs(withArg('--expected-word-build', 'x.y')), /ORCH_ARG_INVALID:--expected-word-build/u);
  assert.throws(() => orch.parseOrchestratorArgs([...BASE_ARGS, '--stage-timeout-ms', '-5']), /ORCH_ARG_INVALID:--stage-timeout-ms/u);
  assert.throws(() => orch.parseOrchestratorArgs([...BASE_ARGS, '--stage-timeout-ms', '99999999999999999999']), /ORCH_ARG_INVALID:--stage-timeout-ms/u);
  assert.throws(() => orch.parseOrchestratorArgs(withArg('--campaign-id', '../escape')), /ORCH_CAMPAIGN_ID_INVALID/u);
  assert.throws(() => orch.parseOrchestratorArgs(withArg('--campaign-id', 'has space')), /ORCH_CAMPAIGN_ID_INVALID/u);
  assert.throws(() => orch.parseOrchestratorArgs(withArg('--chain-id', 'REP9')), /ORCH_CHAIN_ID_INVALID/u);
  const parsed = orch.parseOrchestratorArgs(BASE_ARGS);
  assert.equal(parsed.chainId, 'W06');
  assert.equal(parsed.campaignRoot, path.join('/tmp/c5v2-orch-args', 'test-campaign-001'));
});

leaseTest('ORCH_TEST_4: path authority rejects escape, symlink component and collision', async () => {
  const orch = await loadOrchestrator();
  const root = tmpDir('c5v2-orch-path-');
  assert.equal(orch.assertOrchestratorPathAuthority({ artifactRoot: root, campaignRoot: path.join(root, 'camp'), mustBeAbsent: true }).ok, true);
  assert.match(orch.assertOrchestratorPathAuthority({ artifactRoot: root, campaignRoot: path.join(root, '..', 'escape'), mustBeAbsent: true }).code, /ORCH_PATH_ESCAPE/u);
  const outside = tmpDir('c5v2-orch-outside-');
  assert.match(orch.assertOrchestratorPathAuthority({ artifactRoot: root, campaignRoot: outside, mustBeAbsent: true }).code, /ORCH_PATH_ESCAPE/u);
  fs.mkdirSync(path.join(root, 'camp'), { recursive: true });
  assert.match(orch.assertOrchestratorPathAuthority({ artifactRoot: root, campaignRoot: path.join(root, 'camp'), mustBeAbsent: true }).code, /ORCH_CAMPAIGN_ROOT_COLLISION/u);
  const linkParent = path.join(root, 'link-parent');
  fs.symlinkSync(root, linkParent, 'dir');
  assert.match(orch.assertOrchestratorPathAuthority({ artifactRoot: root, campaignRoot: path.join(linkParent, 'camp2'), mustBeAbsent: true }).code, /ORCH_PATH_SYMLINK_COMPONENT/u);
});

leaseTest('ORCH_TEST_5: preflight stops on HEAD mismatch, origin mismatch and dirty tree before spawn', async () => {
  const orch = await loadOrchestrator();
  const dir = tmpDir('c5v2-orch-pre-');
  const head = initCleanGitRepo(dir);
  const options = validOptions({ expectedSha: head });
  spawnSync('git', ['update-ref', 'refs/remotes/origin/main', head], { cwd: dir });
  const stillBad = orch.runOrchestratorPreflight({ options: { ...options, expectedSha: 'b'.repeat(40) }, scope: 'TEST', repoRoot: dir });
  assert.equal(stillBad.ok, false);
  assert.match(stillBad.code, /ORCH_EXPECTED_SHA_MISMATCH/u);
  const originBad = orch.runOrchestratorPreflight({ options, scope: 'TEST', repoRoot: dir });
  assert.equal(originBad.ok, false);
  fs.writeFileSync(path.join(dir, 'dirty.txt'), 'x\n', 'utf8');
  const dirty = orch.runOrchestratorPreflight({ options, scope: 'TEST', repoRoot: dir });
  assert.equal(dirty.ok, false);
  assert.match(dirty.code, /ORCH_CLEAN_TREE_VIOLATION/u);
});

leaseTest('ORCH_TEST_6: preflight detects Word version and build mismatch from plist', async () => {
  const orch = await loadOrchestrator();
  const dir = tmpDir('c5v2-orch-word-');
  const head = initCleanGitRepo(dir);
  spawnSync('git', ['update-ref', 'refs/remotes/origin/main', head], { cwd: dir });
  const plist = `<?xml version="1.0"?><plist><dict><key>CFBundleShortVersionString</key><string>16.111.2</string><key>CFBundleVersion</key><string>16.111.26072617</string></dict></plist>`;
  const plistDir = tmpDir('c5v2-orch-plist-');
  const plistPath = path.join(plistDir, 'Info.plist');
  fs.writeFileSync(plistPath, plist, 'utf8');
  const options = validOptions({ expectedSha: head });
  const buildMismatch = orch.runOrchestratorPreflight({
    options: { ...options, expectedWordBuild: '16.999.99999999' },
    scope: 'TEST',
    repoRoot: dir,
    wordPlistPath: plistPath,
  });
  assert.equal(buildMismatch.ok, false);
  assert.match(buildMismatch.code, /ORCH_WORD_BUILD_MISMATCH/u);
  const versionMismatch = orch.runOrchestratorPreflight({
    options: { ...options, expectedWordVersion: '16.999.9' },
    scope: 'TEST',
    repoRoot: dir,
    wordPlistPath: plistPath,
  });
  assert.equal(versionMismatch.ok, false);
  assert.match(versionMismatch.code, /ORCH_WORD_VERSION_MISMATCH/u);
});

leaseTest('ORCH_TEST_6A: CLI rejects relative artifact roots before path.resolve can grant authority', async () => {
  const orch = await loadOrchestrator();
  assert.throws(
    () => orch.parseOrchestratorArgs(withArg('--artifact-root', 'relative-campaign-root')),
    /ORCH_ARG_INVALID:--artifact-root:not-absolute/u,
  );
});

leaseTest('ORCH_TEST_6B: nested secure-volume preflight verifies mount root and writes nothing', async () => {
  const orch = await loadOrchestrator();
  const repo = tmpDir('c5v2-orch-nested-repo-');
  const head = initCleanGitRepo(repo);
  spawnSync('git', ['update-ref', 'refs/remotes/origin/main', head], { cwd: repo });
  const mount = tmpDir('c5v2-orch-secure-mount-');
  const artifactRoot = path.join(mount, 'campaigns', 'nested', 'artifacts');
  const plistPath = path.join(tmpDir('c5v2-orch-plist-nested-'), 'Info.plist');
  fs.writeFileSync(plistPath, `<?xml version="1.0"?><plist><dict><key>CFBundleShortVersionString</key><string>16.111.3</string><key>CFBundleVersion</key><string>16.111.26080215</string></dict></plist>`, 'utf8');
  const options = validOptions({
    expectedSha: head,
    expectedWordVersion: '16.111.3',
    expectedWordBuild: '16.111.26080215',
    artifactRoot,
    campaignRoot: path.join(artifactRoot, 'campaign-nested'),
  });
  const beforeExists = fs.existsSync(artifactRoot);
  const green = orch.runOrchestratorPreflight({
    options,
    scope: 'PRELAUNCH_TEST',
    repoRoot: repo,
    wordPlistPath: plistPath,
    secureVolumeProbe: () => ({
      ok: true,
      code: 'ORCH_SECURE_VOLUME_VERIFIED',
      mountRoot: mount,
      mountRealpath: fs.realpathSync(mount),
      uuid: 'D1F2E2C1-3210-4A39-A4E0-0AA0AD5110E2',
      apfs: true,
      encrypted: true,
      writable: true,
      availableKb: 99 * 1024 * 1024,
    }),
  });
  assert.equal(green.ok, true, green.code);
  assert.equal(beforeExists, false);
  assert.equal(fs.existsSync(artifactRoot), false);
});

leaseTest('ORCH_TEST_7: atomic lock admits exactly one writer under concurrent acquisition', async () => {
  const orch = await loadOrchestrator();
  const root = tmpDir('c5v2-orch-lockrace-');
  const attempts = await Promise.all([
    Promise.resolve().then(() => orch.acquireOrchestratorLock({ lockRoot: root, campaignId: 'camp-a', chainId: 'W06', expectedSha: 'a'.repeat(40) })),
    Promise.resolve().then(() => orch.acquireOrchestratorLock({ lockRoot: root, campaignId: 'camp-b', chainId: 'W06', expectedSha: 'a'.repeat(40) })),
    Promise.resolve().then(() => orch.acquireOrchestratorLock({ lockRoot: root, campaignId: 'camp-c', chainId: 'W06', expectedSha: 'a'.repeat(40) })),
  ]);
  const winners = attempts.filter((attempt) => attempt.ok === true);
  assert.equal(winners.length, 1);
  const losers = attempts.filter((attempt) => attempt.ok !== true);
  assert.equal(losers.length, 2);
  for (const loser of losers) assert.match(loser.code, /ORCH_LOCK_HELD|ORCH_STALE_LOCK_REQUIRES_EXPLICIT_CLEANUP|ORCH_LOCK_ACQUIRE_FAILED|ORCH_LOCK_AMBIGUOUS/u);
});

leaseTest('ORCH_TEST_8: stale lock is never broken automatically', async () => {
  const orch = await loadOrchestrator();
  const root = tmpDir('c5v2-orch-stale-');
  const first = orch.acquireOrchestratorLock({ lockRoot: root, campaignId: 'camp-a', chainId: 'W06', expectedSha: 'a'.repeat(40) });
  assert.equal(first.ok, true);
  const ownerPath = path.join(root, 'c5v2-word-campaign.lock', 'owner.json');
  const owner = JSON.parse(fs.readFileSync(ownerPath, 'utf8'));
  owner.pid = 99999999;
  fs.writeFileSync(ownerPath, JSON.stringify(owner), 'utf8');
  const second = orch.acquireOrchestratorLock({ lockRoot: root, campaignId: 'camp-b', chainId: 'W06', expectedSha: 'a'.repeat(40) });
  assert.equal(second.ok, false);
  assert.match(second.code, /ORCH_STALE_LOCK_REQUIRES_EXPLICIT_CLEANUP/u);
});

leaseTest('ORCH_TEST_9: wrong ownership token cannot release the lock, right token releases', async () => {
  const orch = await loadOrchestrator();
  const root = tmpDir('c5v2-orch-token-');
  const first = orch.acquireOrchestratorLock({ lockRoot: root, campaignId: 'camp-a', chainId: 'W06', expectedSha: 'a'.repeat(40) });
  assert.equal(first.ok, true);
  const wrong = orch.releaseOrchestratorLock({ lockDir: first.lockDir, ownershipToken: 'wrong-token', campaignId: 'camp-a' });
  assert.equal(wrong.ok, false);
  assert.match(wrong.code, /ORCH_LOCK_RELEASE_TOKEN_MISMATCH/u);
  assert.ok(fs.existsSync(first.lockDir));
  const right = orch.releaseOrchestratorLock({ lockDir: first.lockDir, ownershipToken: first.ownershipToken, campaignId: 'camp-a' });
  assert.equal(right.ok, true);
  assert.equal(right.released, true);
  assert.ok(!fs.existsSync(first.lockDir));
});

function writeSleepChild(dir, name, body) {
  const script = path.join(dir, name);
  fs.writeFileSync(script, body, 'utf8');
  return script;
}

function readPidLog(pidLogPath) {
  if (!fs.existsSync(pidLogPath)) return [];
  return fs.readFileSync(pidLogPath, 'utf8').split(/\r?\n/u).map((line) => Number(line.trim())).filter((pid) => Number.isSafeInteger(pid) && pid > 0);
}

function pidAlive(pid) {
  try { process.kill(pid, 0); return true; } catch { return false; }
}

async function cleanupExactTestPids(pidLogPath) {
  const pids = [...new Set(readPidLog(pidLogPath))];
  for (const pid of pids) {
    try { process.kill(pid, 'SIGTERM'); } catch { /* noop */ }
  }
  await new Promise((resolve) => setTimeout(resolve, 300));
  for (const pid of pids) {
    if (pidAlive(pid)) {
      try { process.kill(pid, 'SIGKILL'); } catch { /* noop */ }
    }
  }
  await new Promise((resolve) => setTimeout(resolve, 300));
  return pids.filter(pidAlive);
}

leaseTest('ORCH_TEST_10: owned stage success, non-zero exit and spawn error classification', async () => {
  const orch = await loadOrchestrator();
  const dir = tmpDir('c5v2-orch-owned-');
  const okChild = writeSleepChild(dir, 'ok.cjs', "process.stdout.write('hi\\n');process.exit(0);");
  const okResult = await orch.runOwnedStageProcess({
    stage: 'POSITIVE', command: process.execPath, args: [okChild], cwd: dir, logDir: path.join(dir, 'logs'),
    heartbeatPath: path.join(dir, 'hb.jsonl'), campaignId: 'c', chainId: 'W06', stageTimeoutMs: 5000, progressTimeoutMs: 3000, killGraceMs: 500,
  });
  assert.equal(okResult.ok, true);
  assert.equal(okResult.exitCode, 0);
  const failChild = writeSleepChild(dir, 'fail.cjs', 'process.exit(9);');
  const failResult = await orch.runOwnedStageProcess({
    stage: 'POSITIVE', command: process.execPath, args: [failChild], cwd: dir, logDir: path.join(dir, 'logs'),
    heartbeatPath: path.join(dir, 'hb.jsonl'), campaignId: 'c', chainId: 'W06', stageTimeoutMs: 5000, progressTimeoutMs: 3000, killGraceMs: 500,
  });
  assert.equal(failResult.ok, false);
  assert.match(failResult.code, /ORCH_CHILD_EXIT_NONZERO:9/u);
  const spawnResult = await orch.runOwnedStageProcess({
    stage: 'POSITIVE', command: '/no/such/binary-exists', args: [], cwd: dir, logDir: path.join(dir, 'logs'),
    heartbeatPath: path.join(dir, 'hb.jsonl'), campaignId: 'c', chainId: 'W06', stageTimeoutMs: 5000, progressTimeoutMs: 3000, killGraceMs: 500,
  });
  assert.equal(spawnResult.ok, false);
  assert.match(spawnResult.code, /ORCH_CHILD_SPAWN_ERROR/u);
});

leaseTest('ORCH_TEST_11: wall timeout sends TERM then escalates to uncaught KILL for the process group', async () => {
  const orch = await loadOrchestrator();
  const dir = tmpDir('c5v2-orch-signals-');
  const signalLog = path.join(dir, 'signals.jsonl');
  const child = writeSleepChild(dir, 'recorder.cjs', `
const fs=require('fs');
const log=${JSON.stringify(signalLog)};
process.on('SIGTERM',()=>{fs.appendFileSync(log,'TERM\\n');});
setInterval(()=>{},500);
`);
  const result = await orch.runOwnedStageProcess({
    stage: 'POSITIVE', command: process.execPath, args: [child], cwd: dir, logDir: path.join(dir, 'logs'),
    heartbeatPath: path.join(dir, 'hb.jsonl'), campaignId: 'c', chainId: 'W06', stageTimeoutMs: 900, progressTimeoutMs: 60000, killGraceMs: 600,
  });
  assert.equal(result.ok, false);
  assert.match(result.code, /ORCH_STAGE_TIMEOUT/u);
  assert.equal(result.signal, 'SIGKILL');
  const signals = fs.existsSync(signalLog) ? fs.readFileSync(signalLog, 'utf8').trim().split('\n').filter(Boolean) : [];
  assert.deepEqual(signals, ['TERM']);
});

leaseTest('ORCH_TEST_12: silent child without heartbeat is killed with progress timeout', async () => {
  const orch = await loadOrchestrator();
  const dir = tmpDir('c5v2-orch-silent-');
  const child = writeSleepChild(dir, 'silent.cjs', "process.stdout.write('boot\\n');setInterval(()=>{},500);");
  const result = await orch.runOwnedStageProcess({
    stage: 'POSITIVE', command: process.execPath, args: [child], cwd: dir, logDir: path.join(dir, 'logs'),
    heartbeatPath: path.join(dir, 'hb.jsonl'), campaignId: 'c', chainId: 'W06', stageTimeoutMs: 60000, progressTimeoutMs: 900, killGraceMs: 500,
  });
  assert.equal(result.ok, false);
  assert.match(result.code, /ORCH_PROGRESS_TIMEOUT/u);
});

leaseTest('ORCH_TEST_13: owned grandchild inside the process group dies with the group; detached fixture cleanup is exact', async (t) => {
  const orch = await loadOrchestrator();
  const dir = tmpDir('c5v2-orch-grand-');
  const grandPath = path.join(dir, 'grand.cjs');
  const detachedPidLog = path.join(dir, 'detached-pids.txt');
  t.after(async () => {
    await cleanupExactTestPids(detachedPidLog);
  });
  writeSleepChild(dir, 'grand.cjs', 'setInterval(()=>{},500);');
  const parent = writeSleepChild(dir, 'parent.cjs', `
const { spawn } = require('child_process');
spawn(process.execPath, [${JSON.stringify(grandPath)}], { stdio: 'ignore' });
setInterval(()=>{},500);
`);
  const result = await orch.runOwnedStageProcess({
    stage: 'POSITIVE', command: process.execPath, args: [parent], cwd: dir, logDir: path.join(dir, 'logs'),
    heartbeatPath: path.join(dir, 'hb.jsonl'), campaignId: 'c', chainId: 'W06', stageTimeoutMs: 900, progressTimeoutMs: 60000, killGraceMs: 600,
  });
  assert.equal(result.ok, false);
  assert.match(result.code, /ORCH_STAGE_TIMEOUT/u);
  assert.deepEqual(result.survivingDescendants, []);
  const escapeeParent = writeSleepChild(dir, 'escapee.cjs', `
const fs = require('fs');
const { spawn } = require('child_process');
const g = spawn(process.execPath, [${JSON.stringify(grandPath)}], { stdio: 'ignore', detached: true });
fs.appendFileSync(${JSON.stringify(detachedPidLog)}, String(g.pid) + '\\n');
g.unref();
setInterval(()=>{},500);
`);
  const quarantine = await orch.runOwnedStageProcess({
    stage: 'POSITIVE', command: process.execPath, args: [escapeeParent], cwd: dir, logDir: path.join(dir, 'logs'),
    heartbeatPath: path.join(dir, 'hb.jsonl'), campaignId: 'c', chainId: 'W06', stageTimeoutMs: 900, progressTimeoutMs: 60000, killGraceMs: 600,
  });
  assert.equal(quarantine.ok, false);
  assert.match(quarantine.code, /ORCH_STAGE_TIMEOUT/u);
  const cleanupSurvivors = await cleanupExactTestPids(detachedPidLog);
  assert.deepEqual(cleanupSurvivors, []);
  assert.deepEqual(quarantine.survivingOwnedPids, []);
});

leaseTest('ORCH_TEST_14: arbitrary stdout is not heartbeat; identity and sequence violations fail', async () => {
  const orch = await loadOrchestrator();
  const dir = tmpDir('c5v2-orch-hb-');
  const heartbeatPath = path.join(dir, 'hb.jsonl');
  const chatty = writeSleepChild(dir, 'chatty.cjs', "setInterval(()=>{process.stdout.write('noise\\n');},100);");
  const silentTimeout = await orch.runOwnedStageProcess({
    stage: 'POSITIVE', command: process.execPath, args: [chatty], cwd: dir, logDir: path.join(dir, 'logs'),
    heartbeatPath, campaignId: 'c', chainId: 'W06', stageTimeoutMs: 60000, progressTimeoutMs: 800, killGraceMs: 400,
  });
  assert.equal(silentTimeout.ok, false);
  assert.match(silentTimeout.code, /ORCH_PROGRESS_TIMEOUT/u);
  const badIdentity = writeSleepChild(dir, 'badid.cjs', `
const fs=require('fs');
fs.appendFileSync(${JSON.stringify(heartbeatPath)}, JSON.stringify({schemaVersion:'yalken.rtk.word.c5v2.orchestrated-heartbeat.v1',campaignId:'WRONG',chainId:'W06',stage:'POSITIVE',sequence:1,phase:'x'})+'\\n');
setInterval(()=>{},500);
`);
  const identityResult = await orch.runOwnedStageProcess({
    stage: 'POSITIVE', command: process.execPath, args: [badIdentity], cwd: dir, logDir: path.join(dir, 'logs'),
    heartbeatPath, campaignId: 'c', chainId: 'W06', stageTimeoutMs: 60000, progressTimeoutMs: 60000, killGraceMs: 400,
  });
  assert.equal(identityResult.ok, false);
  assert.match(identityResult.code, /ORCH_HEARTBEAT_IDENTITY_MISMATCH/u);
  fs.writeFileSync(heartbeatPath, '', 'utf8');
  const badSequence = writeSleepChild(dir, 'badseq.cjs', `
const fs=require('fs');
const hb=${JSON.stringify(heartbeatPath)};
fs.appendFileSync(hb, JSON.stringify({schemaVersion:'yalken.rtk.word.c5v2.orchestrated-heartbeat.v1',campaignId:'c',chainId:'W06',stage:'POSITIVE',sequence:5,phase:'a'})+'\\n');
fs.appendFileSync(hb, JSON.stringify({schemaVersion:'yalken.rtk.word.c5v2.orchestrated-heartbeat.v1',campaignId:'c',chainId:'W06',stage:'POSITIVE',sequence:3,phase:'b'})+'\\n');
setInterval(()=>{},500);
`);
  const sequenceResult = await orch.runOwnedStageProcess({
    stage: 'POSITIVE', command: process.execPath, args: [badSequence], cwd: dir, logDir: path.join(dir, 'logs'),
    heartbeatPath, campaignId: 'c', chainId: 'W06', stageTimeoutMs: 60000, progressTimeoutMs: 60000, killGraceMs: 400,
  });
  assert.equal(sequenceResult.ok, false);
  assert.match(sequenceResult.code, /ORCH_HEARTBEAT_SEQUENCE_NON_MONOTONIC/u);
});

leaseTest('ORCH_TEST_14A: legitimate short-lived descendants are diagnostic after clean exit', async () => {
  const orch = await loadOrchestrator();
  const dir = tmpDir('c5v2-orch-descendant-ok-');
  const worker = writeSleepChild(dir, 'worker.cjs', 'setTimeout(() => process.exit(0), 600);');
  const parent = writeSleepChild(dir, 'parent-ok.cjs', `
const { spawnSync } = require('child_process');
const result = spawnSync(process.execPath, [${JSON.stringify(worker)}], { stdio: 'ignore' });
process.exit(result.status || 0);
`);
  const result = await orch.runOwnedStageProcess({
    stage: 'POSITIVE', command: process.execPath, args: [parent], cwd: dir, logDir: path.join(dir, 'logs'),
    heartbeatPath: path.join(dir, 'hb.jsonl'), campaignId: 'c', chainId: 'W06', stageTimeoutMs: 5000, progressTimeoutMs: 4000, killGraceMs: 500,
  });
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.exitCode, 0);
  assert.deepEqual(result.survivingOwnedPids, []);
});

leaseTest('ORCH_TEST_14B: heartbeat must prove forward progress, not just timer ticks', async () => {
  const orch = await loadOrchestrator();
  const dir = tmpDir('c5v2-orch-hb-progress-');
  const stagnantHeartbeatPath = path.join(dir, 'stagnant.jsonl');
  const stagnant = writeSleepChild(dir, 'stagnant.cjs', `
const fs = require('fs');
const hb = ${JSON.stringify(stagnantHeartbeatPath)};
let sequence = 0;
setInterval(() => {
  sequence += 1;
  fs.appendFileSync(hb, JSON.stringify({
    schemaVersion: 'yalken.rtk.word.c5v2.orchestrated-heartbeat.v1',
    campaignId: 'c',
    chainId: 'W06',
    stage: 'POSITIVE',
    sequence,
    phase: 'word-chunk',
    detail: { completedCount: 0, lastOperationId: 'stagnant' }
  }) + '\\n');
}, 120);
setTimeout(() => process.exit(0), 900);
`);
  const stagnantResult = await orch.runOwnedStageProcess({
    stage: 'POSITIVE', command: process.execPath, args: [stagnant], cwd: dir, logDir: path.join(dir, 'logs'),
    heartbeatPath: stagnantHeartbeatPath, campaignId: 'c', chainId: 'W06', stageTimeoutMs: 5000, progressTimeoutMs: 420, killGraceMs: 400,
  });
  assert.equal(stagnantResult.ok, false);
  assert.match(stagnantResult.code, /ORCH_HEARTBEAT_PROGRESS_NON_MONOTONIC|ORCH_PROGRESS_TIMEOUT/u);

  const movingHeartbeatPath = path.join(dir, 'moving.jsonl');
  const moving = writeSleepChild(dir, 'moving.cjs', `
const fs = require('fs');
const hb = ${JSON.stringify(movingHeartbeatPath)};
let sequence = 0;
let completedCount = 0;
const timer = setInterval(() => {
  sequence += 1;
  completedCount += 1;
  fs.appendFileSync(hb, JSON.stringify({
    schemaVersion: 'yalken.rtk.word.c5v2.orchestrated-heartbeat.v1',
    campaignId: 'c',
    chainId: 'W06',
    stage: 'POSITIVE',
    sequence,
    phase: 'word-chunk',
    detail: { completedCount, lastOperationId: 'op-' + completedCount }
  }) + '\\n');
  if (completedCount === 5) {
    clearInterval(timer);
    process.exit(0);
  }
}, 180);
`);
  const movingResult = await orch.runOwnedStageProcess({
    stage: 'POSITIVE', command: process.execPath, args: [moving], cwd: dir, logDir: path.join(dir, 'logs'),
    heartbeatPath: movingHeartbeatPath, campaignId: 'c', chainId: 'W06', stageTimeoutMs: 5000, progressTimeoutMs: 420, killGraceMs: 400,
  });
  assert.equal(movingResult.ok, true, JSON.stringify(movingResult));
});

leaseTest('ORCH_TEST_14C: simulated PID reuse is never signaled by per-PID cleanup', async () => {
  const orch = await loadOrchestrator();
  assert.equal(typeof orch.signalOwnedPidIfIdentityMatches, 'function');
  const signaled = [];
  const recorded = { pid: 4242, pgid: 4242, startIdentity: 'old-start', executable: '/bin/node' };
  const result = orch.signalOwnedPidIfIdentityMatches({
    pid: 4242,
    expectedIdentity: recorded,
    signal: 'SIGKILL',
    identityProbe: () => ({ pid: 4242, pgid: 4242, startIdentity: 'new-start', executable: '/bin/node' }),
    signalFn: (pid, signal) => signaled.push({ pid, signal }),
  });
  assert.equal(result.ok, false);
  assert.match(result.code, /ORCH_PROCESS_IDENTITY_MISMATCH/u);
  assert.deepEqual(signaled, []);
});

leaseTest('ORCH_TEST_14D: simulated PGID reuse is never signaled by group cleanup', async () => {
  const orch = await loadOrchestrator();
  assert.equal(typeof orch.signalOwnedProcessGroupIfLeaderMatches, 'function');
  const signaled = [];
  const result = orch.signalOwnedProcessGroupIfLeaderMatches({
    pgid: 5151,
    expectedLeaderIdentity: { pid: 5151, pgid: 5151, startIdentity: 'old-group', executable: '/bin/node' },
    signal: 'SIGTERM',
    identityProbe: () => ({ pid: 5151, pgid: 5151, startIdentity: 'new-group', executable: '/bin/node' }),
    signalFn: (target, signal) => signaled.push({ target, signal }),
  });
  assert.equal(result.ok, false);
  assert.match(result.code, /ORCH_PROCESS_GROUP_IDENTITY_MISMATCH/u);
  assert.deepEqual(signaled, []);
});

leaseTest('ORCH_TEST_14E: fast detached unregistered grandchild cannot produce stage success', async (t) => {
  const orch = await loadOrchestrator();
  const dir = tmpDir('c5v2-orch-fast-detach-');
  const pidLog = path.join(dir, 'detached-pids.txt');
  t.after(async () => {
    await cleanupExactTestPids(pidLog);
  });
  const grand = writeSleepChild(dir, 'fast-grand.cjs', 'setInterval(()=>{},500);');
  const parent = writeSleepChild(dir, 'fast-parent.cjs', `
const fs = require('fs');
const { spawn } = require('child_process');
const child = spawn(process.execPath, [${JSON.stringify(grand)}], {
  cwd: ${JSON.stringify(dir)},
  detached: true,
  stdio: 'ignore',
});
fs.appendFileSync(${JSON.stringify(pidLog)}, String(child.pid) + '\\n');
child.unref();
setTimeout(() => process.exit(0), 20);
`);
  const result = await orch.runOwnedStageProcess({
    stage: 'POSITIVE', command: process.execPath, args: [parent], cwd: dir, logDir: path.join(dir, 'logs'),
    heartbeatPath: path.join(dir, 'hb.jsonl'), campaignId: 'c', chainId: 'W06', stageTimeoutMs: 5000, progressTimeoutMs: 4000, killGraceMs: 800,
  });
  assert.equal(result.ok, false, JSON.stringify(result));
  assert.match(result.code, /ORCH_UNREGISTERED_OWNED_PROCESS_DETECTED/u);
  assert.deepEqual(result.survivingOwnedPids, []);
  const survivors = await cleanupExactTestPids(pidLog);
  assert.deepEqual(survivors, []);
});

leaseTest('ORCH_TEST_14G: Linux proc cwd inventory finds contained detached processes without lsof', async () => {
  const orch = await loadOrchestrator();
  assert.equal(typeof orch.listProcessCwdsUnder, 'function');
  const dir = tmpDir('c5v2-orch-proc-cwd-');
  const root = path.join(dir, 'root');
  const inside = path.join(root, 'nested');
  const outside = path.join(dir, 'outside');
  const procRoot = path.join(dir, 'proc');
  fs.mkdirSync(inside, { recursive: true });
  fs.mkdirSync(outside, { recursive: true });
  fs.mkdirSync(procRoot, { recursive: true });
  const writeProc = (pid, cwdTarget, command = 'node') => {
    const pidDir = path.join(procRoot, String(pid));
    fs.mkdirSync(pidDir, { recursive: true });
    fs.symlinkSync(cwdTarget, path.join(pidDir, 'cwd'));
    fs.writeFileSync(path.join(pidDir, 'comm'), `${command}\n`, 'utf8');
  };
  writeProc(1111, inside, 'fixture-node');
  writeProc(2222, outside, 'outside-node');
  writeProc(3333, inside, 'self-node');
  fs.mkdirSync(path.join(procRoot, 'not-a-pid'), { recursive: true });

  const rows = orch.listProcessCwdsUnder(root, { includeLsof: false, procRoot, selfPid: 3333 });
  assert.deepEqual(rows.map((row) => row.pid), [1111]);
  assert.equal(rows[0].command, 'fixture-node');
  assert.equal(rows[0].cwd, fs.realpathSync(inside));
});

leaseTest('ORCH_TEST_14H: cwd inventory waits for delayed proc visibility before allowing success', async () => {
  const orch = await loadOrchestrator();
  assert.equal(typeof orch.waitForProcessCwdsUnder, 'function');
  const dir = tmpDir('c5v2-orch-proc-cwd-wait-');
  const root = path.join(dir, 'root');
  const inside = path.join(root, 'nested');
  const procRoot = path.join(dir, 'proc');
  fs.mkdirSync(inside, { recursive: true });
  fs.mkdirSync(procRoot, { recursive: true });

  setTimeout(() => {
    const pidDir = path.join(procRoot, '4444');
    fs.mkdirSync(pidDir, { recursive: true });
    fs.symlinkSync(inside, path.join(pidDir, 'cwd'));
    fs.writeFileSync(path.join(pidDir, 'comm'), 'delayed-node\n', 'utf8');
  }, 50);

  const rows = await orch.waitForProcessCwdsUnder(root, {
    includeLsof: false,
    procRoot,
    selfPid: 9999,
    timeoutMs: 500,
    intervalMs: 10,
  });
  assert.deepEqual(rows.map((row) => row.pid), [4444]);
  assert.equal(rows[0].command, 'delayed-node');
  assert.equal(rows[0].cwd, fs.realpathSync(inside));
});

leaseTest('ORCH_TEST_14F: leader identity waits through pre-setsid race and timeout cleanup leaves zero survivors', async () => {
  const orch = await loadOrchestrator();
  assert.equal(typeof orch.waitForStableProcessIdentity, 'function');
  const pid = 42424;
  const samples = [
    { pid, pgid: 1, startIdentity: 'stable-start', executable: process.execPath },
    { pid, pgid: 31337, startIdentity: 'stable-start', executable: process.execPath },
    { pid, pgid: pid, startIdentity: 'stable-start', executable: process.execPath },
  ];
  let probeCount = 0;
  const bound = await orch.waitForStableProcessIdentity({
    pid,
    requireGroupLeader: true,
    timeoutMs: 200,
    intervalMs: 1,
    identityProbe: () => samples[Math.min(probeCount++, samples.length - 1)],
    aliveProbe: () => true,
  });
  assert.equal(bound.ok, true);
  assert.equal(bound.observedIdentity.pgid, pid);
  assert.ok(probeCount >= 3);

  const dir = tmpDir('c5v2-orch-stable-identity-timeout-');
  const child = writeSleepChild(dir, 'stable-timeout.cjs', "process.stdout.write('boot\\n');setInterval(()=>{},500);");
  const result = await orch.runOwnedStageProcess({
    stage: 'POSITIVE', command: process.execPath, args: [child], cwd: dir, logDir: path.join(dir, 'logs'),
    heartbeatPath: path.join(dir, 'hb.jsonl'), campaignId: 'c', chainId: 'W06', stageTimeoutMs: 700, progressTimeoutMs: 60000, killGraceMs: 500,
  });
  assert.equal(result.ok, false);
  assert.match(result.code, /ORCH_STAGE_TIMEOUT/u);
  assert.deepEqual(result.survivingOwnedPids, []);
});

function makeStageResultFile({ dir, stage, options, stageData = {}, artifactDefs = {}, finishedAtUtc = null }) {
  const artifacts = {};
  for (const [key, content] of Object.entries(artifactDefs)) {
    const artifactPath = path.join(dir, `${stage.toLowerCase()}-${key}.artifact`);
    fs.mkdirSync(path.dirname(artifactPath), { recursive: true });
    fs.writeFileSync(artifactPath, content, 'utf8');
    artifacts[key] = { path: artifactPath, sha256: sha256File(artifactPath), size: fs.statSync(artifactPath).size };
  }
  const resultPath = path.join(dir, 'ORCHESTRATOR', `${stage.toLowerCase()}-stage-result.json`);
  const counters = stage === 'POSITIVE'
    ? { operationCount: 1960, roundGreen: true }
    : stage === 'NEGATIVE'
      ? { operationCount: 40, rejectedCount: 40, failedCount: 0, green: true }
      : { operationCount: 2000, positiveTotal: 1960, negativeTotal: 40, aggregateGreen: true };
  writeJson(resultPath, {
    schemaVersion: 'yalken.rtk.word.c5v2.orchestrated-stage-result.v1',
    stage,
    status: 'SEALED',
    campaignId: options.campaignId,
    chainId: options.chainId,
    headSha: options.expectedSha,
    originMainSha: options.expectedSha,
    wordVersion: options.expectedWordVersion,
    wordBuild: options.expectedWordBuild,
    startedAtUtc: new Date().toISOString(),
    finishedAtUtc: finishedAtUtc || new Date(Date.now() + 1000).toISOString(),
    sequence: 3,
    stageData,
    artifacts,
    counters,
  });
  return resultPath;
}

leaseTest('ORCH_TEST_15: stage result verifier accepts valid and rejects malformed, identity, hash, missing and stale', async () => {
  const orch = await loadOrchestrator();
  const options = validOptions();
  const dir = options.campaignRoot;
  fs.mkdirSync(dir, { recursive: true });
  const started = Date.now() - 1000;
  const semantic = makeSemanticStageResult({ options, stage: 'POSITIVE' });
  const resultPath = semantic.resultPath;
  const green = orch.validateStageResult({
    stage: 'POSITIVE', resultPath, campaignId: options.campaignId, chainId: options.chainId,
    expectedSha: options.expectedSha, expectedWordVersion: options.expectedWordVersion, expectedWordBuild: options.expectedWordBuild,
    stageStartedAtMs: started, requiredOutputKeys: ['ledger', 'roundGates'], expectedStageRoot: semantic.runRoot,
    expectedCorpusDigest: options.expectedCorpusDigest,
    expectedLedgerDigest: options.expectedLedgerDigest,
    expectedOperationIdSetDigest: options.expectedOperationIdSetDigest,
  });
  assert.equal(green.ok, true);
  fs.writeFileSync(resultPath, '{broken json', 'utf8');
  assert.match(orch.validateStageResult({ stage: 'POSITIVE', resultPath, campaignId: options.campaignId, chainId: options.chainId, expectedSha: options.expectedSha, expectedWordVersion: options.expectedWordVersion, expectedWordBuild: options.expectedWordBuild, stageStartedAtMs: started }).code, /ORCH_STAGE_RESULT_MALFORMED/u);
  const wrongIdentity = makeSemanticStageResult({ options, stage: 'POSITIVE' }).resultPath;
  writeJson(wrongIdentity, { ...JSON.parse(fs.readFileSync(wrongIdentity, 'utf8')), campaignId: 'WRONG' });
  assert.match(orch.validateStageResult({ stage: 'POSITIVE', resultPath: wrongIdentity, campaignId: options.campaignId, chainId: options.chainId, expectedSha: options.expectedSha, expectedWordVersion: options.expectedWordVersion, expectedWordBuild: options.expectedWordBuild, stageStartedAtMs: started }).code, /ORCH_STAGE_RESULT_CAMPAIGN_MISMATCH/u);
  const hashPath = makeSemanticStageResult({ options, stage: 'POSITIVE' }).resultPath;
  const parsed = JSON.parse(fs.readFileSync(hashPath, 'utf8'));
  parsed.artifacts.ledger.sha256 = 'sha256:' + '0'.repeat(64);
  writeJson(hashPath, parsed);
  assert.match(orch.validateStageResult({ stage: 'POSITIVE', resultPath: hashPath, campaignId: options.campaignId, chainId: options.chainId, expectedSha: options.expectedSha, expectedWordVersion: options.expectedWordVersion, expectedWordBuild: options.expectedWordBuild, stageStartedAtMs: started }).code, /ORCH_STAGE_RESULT_HASH_MISMATCH/u);
  const missingPath = makeSemanticStageResult({ options, stage: 'POSITIVE' }).resultPath;
  const missingParsed = JSON.parse(fs.readFileSync(missingPath, 'utf8'));
  fs.rmSync(missingParsed.artifacts.ledger.path);
  assert.match(orch.validateStageResult({ stage: 'POSITIVE', resultPath: missingPath, campaignId: options.campaignId, chainId: options.chainId, expectedSha: options.expectedSha, expectedWordVersion: options.expectedWordVersion, expectedWordBuild: options.expectedWordBuild, stageStartedAtMs: started }).code, /ORCH_STAGE_RESULT_ARTIFACT_MISSING/u);
  const stalePath = makeSemanticStageResult({
    options,
    stage: 'POSITIVE',
    mutate: (body) => ({ ...body, finishedAtUtc: new Date(started - 60000).toISOString() }),
  }).resultPath;
  assert.match(orch.validateStageResult({ stage: 'POSITIVE', resultPath: stalePath, campaignId: options.campaignId, chainId: options.chainId, expectedSha: options.expectedSha, expectedWordVersion: options.expectedWordVersion, expectedWordBuild: options.expectedWordBuild, stageStartedAtMs: started }).code, /ORCH_STAGE_RESULT_STALE/u);
});

function makeSemanticLedger({
  mutateOperation = null,
  duplicateId = false,
  exactHead = 'a'.repeat(40),
  campaignId = 'test-campaign-001',
  corpusDigest = 'sha256:' + 'b'.repeat(64),
} = {}) {
  const counts = {
    tracked_text_edit: 1200,
    root_comment: 300,
    reply: 120,
    comment_state: 100,
    formatting: 180,
    structural: 60,
    negative_probe: 40,
  };
  const operations = [];
  const sceneParagraphCounts = new Map();
  for (const [family, count] of Object.entries(counts)) {
    for (let index = 0; index < count; index += 1) {
      const ordinal = operations.length + 1;
      const sceneOrdinal = (ordinal % 21) + 1;
      const sceneId = `scene-${String(sceneOrdinal).padStart(2, '0')}`;
      const paragraphOrdinal = sceneParagraphCounts.get(sceneId) || 0;
      sceneParagraphCounts.set(sceneId, paragraphOrdinal + 1);
      const selectedText = `${family}-selection-${String(index + 1).padStart(4, '0')}`;
      const contextBefore = 'before ';
      const contextAfter = ' after';
      const expectedOutcome = family === 'negative_probe'
        ? 'REJECT'
        : family === 'tracked_text_edit'
          ? 'MANUAL'
            : ['reply', 'comment_state'].includes(family)
              ? 'SAFE_APPLY'
              : 'SAFE_APPLY';
      const stateKinds = ['resolve', 'reopen', 'delete', 'resolve-reopen'];
      const semanticIntent = {
        kind: family === 'negative_probe'
          ? `negative-fixture-${String(index + 1).padStart(4, '0')}`
          : family === 'tracked_text_edit'
            ? 'insert'
            : family === 'formatting'
              ? (index % 2 === 0 ? 'bold' : 'italic')
              : family === 'structural'
                ? 'headingLevel'
                : family === 'reply'
                  ? 'reply'
                  : family === 'comment_state'
                    ? stateKinds[index % stateKinds.length]
                    : `${family}-fixture`,
      };
      if (family === 'tracked_text_edit') semanticIntent.replacementText = `replacement-${String(index + 1).padStart(4, '0')}`;
      if (family === 'structural') semanticIntent.headingLevel = (index % 3) + 1;
      const base = {
        id: duplicateId && operations.length === 1 ? 'tracked_text_edit-0001' : `${family}-${String(index + 1).padStart(4, '0')}`,
        family,
        sceneId,
        round: family === 'negative_probe' ? 0 : (operations.length % 5) + 1,
        expectedOutcome,
        anchor: family === 'negative_probe' ? null : {
          sceneId,
          paragraphOrdinal,
          paragraphId: `p-${sceneId}-${paragraphOrdinal}`,
          selectedText,
          wordSelectedText: selectedText,
          graphemeStart: contextBefore.length,
          graphemeEnd: contextBefore.length + selectedText.length,
          contextBefore,
          contextAfter,
          baselineHash: sha256Text(`${contextBefore}${selectedText}${contextAfter}`),
        },
        targetRootOperationId: ['reply', 'comment_state'].includes(family)
          ? `root_comment-${String((index % counts.root_comment) + 1).padStart(4, '0')}`
          : '',
        semanticIntent,
      };
      operations.push(typeof mutateOperation === 'function' ? mutateOperation(base, operations.length) : base);
    }
  }
  const boundOperations = operations.map((operation) => ({
    ...operation,
    requestKey: operationRequestKey(operation),
    effectKey: operationEffectKey(operation),
  }));
  const ledgerDigest = sha256Text(JSON.stringify(boundOperations));
  const operationIdSetDigest = sha256Text(JSON.stringify(boundOperations.map((operation) => operation.id || '')));
  const ledger = {
    schemaVersion: 'yalken.rtk.word.c5v2.fullbook-ledger.v1',
    topology: 'one-full-manuscript-project-cumulative-rounds',
    roundCount: 5,
    sceneCount: 21,
    counts,
    sceneProfiles: Array.from({ length: 21 }, (_, index) => ({ sceneId: `scene-${String(index + 1).padStart(2, '0')}` })),
    operations: boundOperations,
    ledgerDigest,
    operationIdSetDigest,
    gates: { ok: true, failures: [] },
  };
  ledger.resumeAuthority = {
    schemaVersion: 'yalken.rtk.word.c5v2.master-ledger-resume-authority.v1',
    exactHead,
    campaignId,
    corpusDigest,
    digest: resumeAuthorityDigest(ledger, { exactHead, campaignId, corpusDigest }),
  };
  return ledger;
}

function ledgerReuseDigestForTest(ledger) {
  const normalized = JSON.parse(JSON.stringify(ledger || {}));
  delete normalized.masterLedgerDigest;
  delete normalized.ledgerDigest;
  return digestOf(normalized);
}

function writePositiveRoundGateEvidence({ options, runRoot, ledger, ledgerDigest, index, scenes = null, forgedMinimalDocx = false }) {
  const roundNumber = index + 1;
  const roundId = `round-${String(roundNumber).padStart(2, '0')}`;
  const roundDir = path.join(runRoot, roundId);
  fs.mkdirSync(roundDir, { recursive: true });
  const positiveOps = ledger.operations.filter((operation) => operation.family !== 'negative_probe');
  const roundOperations = positiveOps.filter((operation) => operation.round === roundNumber);
  const cumulativeOperations = positiveOps.filter((operation) => operation.round <= roundNumber);
  const roundOperationIds = roundOperations.map((operation) => operation.id);
  const cumulativeOperationIds = cumulativeOperations.map((operation) => operation.id);
  const physicalOperations = roundOperations.map((operation, operationIndex) => physicalOperationForTest(operation, operationIndex));
  const familyCounts = physicalOperations.reduce((acc, operation) => {
    acc[operation.family] = (acc[operation.family] || 0) + 1;
    return acc;
  }, {});
  const roundLedger = {
    schemaVersion: 'yalken.rtk.word.c5v2.physical-master-round-ledger.v1',
    topology: 'one-full-manuscript-project-cumulative-rounds',
    roundNumber,
    masterLedgerDigest: ledgerDigest,
    operationCount: physicalOperations.length,
    familyCounts,
    scenes: ledger.sceneProfiles,
    operations: physicalOperations,
  };
  roundLedger.ledgerDigest = ledgerReuseDigestForTest(roundLedger);
  const roundLedgerPath = path.join(roundDir, 'canary-ledger.json');
  writeJson(roundLedgerPath, roundLedger);

  const baselineScenes = baselineScenesForTest(ledger, scenes);
  const baselineSceneById = new Map(baselineScenes.map((scene) => [scene.sceneId, scene]));
  const baselineArtifactPath = path.join(roundDir, 'product-baseline-scenes.json');
  writeJson(baselineArtifactPath, {
    schemaVersion: 'yalken.rtk.word.c5v2.product-baseline-scenes.v1',
    roundId,
    projectRoot: '',
    scenes: baselineScenes.map((scene) => ({
      sceneId: scene.sceneId,
      rawContent: scene.rawContent || scene.text || '',
      rawContentSha256: sha256Text(scene.rawContent || scene.text || ''),
      text: scene.text || '',
      textSha256: sha256Text(scene.text || ''),
      paragraphs: scene.paragraphs || productParagraphsForTest(scene.text),
    })),
  });

  const structuralBySceneParagraph = new Map();
  for (const operation of physicalOperations.filter((item) => item.formalFamily === 'structural')) {
    structuralBySceneParagraph.set(
      `${operation.sceneId}:${operation.masterAnchor?.paragraphOrdinal}`,
      Number(operation.headingLevel || 2),
    );
  }
  const truthSceneReadback = baselineScenes.map((scene) => {
    const sceneOps = physicalOperations.filter((operation) => operation.sceneId === scene.sceneId);
    const expectedParagraphs = buildExpectedParagraphsForTest(scene, sceneOps);
    const blocks = expectedParagraphs.map((text, paragraphOrdinal) => ({
      text,
      headingLevel: structuralBySceneParagraph.get(`${scene.sceneId}:${paragraphOrdinal}`) || 0,
      marks: ['bold', 'italic'],
    }));
    const rawContent = docV2PayloadFromBlocks(blocks);
    return {
      sceneId: scene.sceneId,
      rawContent,
      rawContentSha256: sha256Text(rawContent),
    };
  });
  const rootCommentOps = physicalOperations.filter((operation) => operation.formalFamily === 'root_comment');
  const canonicalState = canonicalCommentStateForTest(rootCommentOps);
  const recoveryState = {
    ...canonicalState,
    revision: Math.max(0, canonicalState.revision - 1),
    events: canonicalState.events.slice(0, Math.max(0, canonicalState.events.length - 1)),
  };
  const canonicalRaw = JSON.stringify(canonicalState);
  const recoveryRaw = JSON.stringify(recoveryState);
  const truthPath = path.join(roundDir, 'yalken-reopened-truth.json');
  writeJson(truthPath, {
    schemaVersion: 'yalken.rtk.word.c5v2.reopened-yalken-truth.v1',
    roundId,
    sourceKind: 'reopened-yalken-project',
    reopenPassCount: 2,
    expectedRootCommentCount: rootCommentOps.length,
    canonicalNonTextState: {
      present: rootCommentOps.length > 0,
      rawContent: canonicalRaw,
      rawContentSha256: sha256Text(canonicalRaw),
      state: canonicalState,
    },
    recoveryNonTextState: {
      present: rootCommentOps.length > 0,
      rawContent: recoveryRaw,
      rawContentSha256: sha256Text(recoveryRaw),
      state: recoveryState,
    },
    passes: [
      { scenes: truthSceneReadback.map((scene) => ({ sceneId: scene.sceneId, ok: true })) },
      { scenes: truthSceneReadback.map((scene) => ({ sceneId: scene.sceneId, ok: true })) },
    ],
    sceneReadback: truthSceneReadback,
  });

  const wordOutputPath = path.join(roundDir, 'word-output.txt');
  const wordLines = ['WORD_STATUS=PASS'];
  for (const operation of physicalOperations) {
    const status = operation.expectedOutcome === 'MANUAL' && !['reply_attempt', 'state_attempt'].includes(operation.family)
      ? 'BLOCKED'
      : operation.expectedOutcome;
    wordLines.push(`OP|${operation.id}|${status}`);
    wordLines.push(`READBACK|${operation.id}|${status}|TEST_NATIVE_READBACK`);
  }
  fs.writeFileSync(wordOutputPath, `${wordLines.join('\n')}\n`, 'utf8');

  const sourceDocxPath = path.join(roundDir, 'c5v2-cumulative-source-fullmanuscript.docx');
  const returnedDocxPath = path.join(roundDir, 'c5v2-cumulative-returned-word-native.docx');
  const sourceParagraphs = baselineScenes.flatMap((scene) => (scene.paragraphs || productParagraphsForTest(scene.text))
    .map((text) => ({ text })));
  const returnedParagraphs = baselineScenes.flatMap((scene) => (scene.paragraphs || productParagraphsForTest(scene.text))
    .map((text, paragraphOrdinal) => ({
      text,
      bold: true,
      italic: true,
      headingLevel: structuralBySceneParagraph.get(`${scene.sceneId}:${paragraphOrdinal}`) || 0,
    })));
  const returnedParagraphTextHasLocator = (operation) => returnedParagraphs
    .filter((paragraph) => String(paragraph.text || '').includes(operation.locatorQuote || operation.quote))
    .length > 0;
  const formattingEvidenceParagraphs = physicalOperations
    .filter((operation) => operation.formalFamily === 'formatting')
    .filter((operation) => !returnedParagraphTextHasLocator(operation))
    .map((operation) => ({
      text: operation.locatorQuote || operation.quote,
      bold: operation.formattingKind !== 'italic',
      italic: operation.formattingKind === 'italic',
    }));
  const structuralEvidenceParagraphs = physicalOperations
    .filter((operation) => operation.formalFamily === 'structural')
    .filter((operation) => !returnedParagraphTextHasLocator(operation))
    .map((operation) => ({
      text: operation.locatorQuote || operation.quote,
      headingLevel: Number(operation.headingLevel || 2),
    }));
  if (forgedMinimalDocx) {
    writeMinimalDocx(sourceDocxPath, `SOURCE ${roundId}\n${roundOperationIds.join('\n')}\n`);
    writeMinimalDocx(returnedDocxPath, `RETURNED ${roundId}\n${roundOperationIds.join('\n')}\n`);
  } else {
    writeDocxPackage(sourceDocxPath, { paragraphs: sourceParagraphs });
    writeDocxPackage(returnedDocxPath, {
      paragraphs: [...returnedParagraphs, ...formattingEvidenceParagraphs, ...structuralEvidenceParagraphs],
      revisionOperations: physicalOperations.filter((operation) => (
        ['tracked_replace', 'tracked_insert', 'tracked_delete'].includes(operation.family)
        && operation.expectedOutcome === 'EXACT'
      )),
      rootCommentOperations: rootCommentOps,
    });
  }
  if (!forgedMinimalDocx) {
    for (const operation of physicalOperations.filter((item) => ['reply_attempt', 'state_attempt'].includes(item.family))) {
      writeNativeLifecycleSnapshotDocx(
        `${returnedDocxPath}.${operation.id.replace(/[^a-z0-9_-]/giu, '_')}.native-readback.docx`,
        operation,
      );
    }
  }
  const wordVisibleReadbackPath = `${returnedDocxPath}.word-visible-readback.txt`;
  fs.writeFileSync(
    wordVisibleReadbackPath,
    physicalOperations
      .filter((operation) => ['tracked_replace', 'tracked_insert'].includes(operation.family) && operation.expectedOutcome === 'EXACT')
      .map((operation) => operation.replacementText)
      .join('\n'),
    'utf8',
  );

  const readyPath = path.join(roundDir, 'c5v2-cumulative-returned-ready.json');
  writeJson(readyPath, {
    schemaVersion: 'yalken.rtk.word.c5v2.returned-ready.v1',
    ready: true,
    roundId,
    returnedSha256: sha256File(returnedDocxPath),
  });

  const exactLedgerBinding = exactLedgerBindingForTest(physicalOperations);
  const exactDiagnostics = physicalOperations.filter((operation) => (
    ['tracked_replace', 'tracked_insert', 'tracked_delete'].includes(operation.family)
    && operation.expectedOutcome === 'EXACT'
  )).map((operation) => ({
    changeId: operation.id,
    targetScope: { id: operation.sceneId },
    matchKind: 'exact',
    quoteSha256: sha256Text(operation.quote),
    replacementSha256: sha256Text(operation.replacementText),
  }));
  const commentThreadDiagnostics = rootCommentOps.map((operation) => ({
    threadId: `thread-${operation.id}`,
    sceneId: operation.sceneId,
    targetScope: { id: operation.sceneId },
    messages: [{ body: `C5V2 root ${operation.id}` }],
  }));
  const commentPlacementDiagnostics = rootCommentOps.map((operation) => ({
    threadId: `thread-${operation.id}`,
    targetScope: { id: operation.sceneId },
    quote: operation.quote,
  }));
  const applyReceipts = rootCommentOps.map((operation) => ({
    operationId: operation.id,
    family: 'root_comment',
    ok: true,
    status: 'applied',
    writerCalled: true,
    recoveryWritten: true,
    canonicalDigest: sha256Text(`canonical:${operation.id}`),
  }));
  for (const operation of physicalOperations.filter((item) => ['reply_attempt', 'state_attempt'].includes(item.family))) {
    applyReceipts.push({
      operationId: operation.id,
      family: operation.family === 'reply_attempt' ? 'reply' : 'comment_state',
      ok: true,
      status: 'applied',
      writerCalled: true,
      recoveryWritten: true,
      canonicalDigest: sha256Text(`canonical:${operation.id}`),
    });
  }
  const replayReceipts = applyReceipts.map((receipt) => ({
    operationId: receipt.operationId,
    family: receipt.family,
    ok: true,
    status: 'replay',
    writerCalled: false,
    canonicalDigest: receipt.canonicalDigest,
  }));
  const returnApply = {
    ok: true,
    exactLedgerBinding,
    lanePlan: { exactLedgerBinding },
    activation: {
      ok: true,
      textChangeScopeDiagnostics: exactDiagnostics,
      commentThreadDiagnostics,
      commentPlacementDiagnostics,
      commentProductPath: {
        ok: true,
        pendingProductApplyLane: false,
        commandBusDispatchOnly: true,
        directPortDispatch: false,
        semanticOracle: {
          triangleGreen: true,
          rootApplied: rootCommentOps.length,
          lifecycleApplied: physicalOperations.filter((item) => ['reply_attempt', 'state_attempt'].includes(item.family)).length,
        },
        applyReceipts,
        replayReceipts,
      },
    },
    yalkenTruthArtifact: { path: truthPath, sha256: sha256File(truthPath) },
  };
  const returnApplyPath = path.join(roundDir, 'product-return-apply.json');
  writeJson(returnApplyPath, returnApply);
  const candidates = exactDiagnostics.map((diagnostic) => ({
    changeId: diagnostic.changeId,
    sceneId: diagnostic.targetScope.id,
    matchKind: diagnostic.matchKind,
    quoteSha256: diagnostic.quoteSha256,
    replacementSha256: diagnostic.replacementSha256,
  }));
  const candidateAuthorityBody = {
    schemaVersion: 'yalken.rtk.word.c5v2.return-apply-candidate-authority.v1',
    roundId,
    source: 'returnApply.activation.textChangeScopeDiagnostics',
    candidateCount: candidates.length,
    candidates,
  };
  const candidateAuthority = { ...candidateAuthorityBody, contentDigest: digestOf(candidateAuthorityBody) };
  const candidateAuthorityPath = path.join(roundDir, 'return-apply-candidate-authority.json');
  writeJson(candidateAuthorityPath, candidateAuthority);
  const candidateTupleDigest = digestOf(candidates.map((candidate) => ({
    changeId: candidate.changeId,
    sceneId: candidate.sceneId,
    matchKind: candidate.matchKind,
    quoteSha256: candidate.quoteSha256,
    replacementSha256: candidate.replacementSha256,
  })));
  const authorityRoot = path.join(runRoot, '..', '.c5v2-main-owned-candidate-authority', `test-${options.campaignId}`);
  const anchorDir = path.join(authorityRoot, 'anchors');
  fs.mkdirSync(anchorDir, { recursive: true, mode: 0o700 });
  fs.chmodSync(authorityRoot, 0o700);
  fs.chmodSync(anchorDir, 0o700);
  const authorityKeyPath = path.join(authorityRoot, 'candidate-authority-anchor.key');
  if (!fs.existsSync(authorityKeyPath)) fs.writeFileSync(authorityKeyPath, `${'1'.repeat(64)}\n`, 'utf8');
  fs.chmodSync(authorityKeyPath, 0o600);
  const anchorBody = {
    schemaVersion: 'yalken.rtk.word.c5v2.return-apply-candidate-authority-anchor.v2',
    campaignId: options.campaignId,
    roundId,
    exactHead: options.expectedSha,
    corpusDigest: options.expectedCorpusDigest,
    ledgerContentDigest: ledgerReuseDigestForTest(roundLedger),
    keyId: sha256Text('1'.repeat(64)),
    candidateAuthoritySha256: sha256File(candidateAuthorityPath),
    candidateAuthorityContentDigest: candidateAuthority.contentDigest,
    candidateTupleDigest,
    candidateCount: candidateAuthority.candidateCount,
  };
  const hmacSha256 = `hmac-sha256:${crypto.createHmac('sha256', Buffer.from('1'.repeat(64), 'hex')).update(stableJson(anchorBody), 'utf8').digest('hex')}`;
  const anchor = { ...anchorBody, hmacSha256, anchorDigest: digestOf({ ...anchorBody, hmacSha256 }) };
  const anchorPath = path.join(anchorDir, `${roundId}.json`);
  writeJson(anchorPath, anchor);
  fs.chmodSync(anchorPath, 0o600);

  const nativeLifecycleVerificationPath = path.join(roundDir, 'native-lifecycle-verification.json');
  writeJson(nativeLifecycleVerificationPath, nativeLifecycleVerificationForTest(physicalOperations));
  const oracle = writeCanonicalOracleProbeForTest({
    ledgerPath: roundLedgerPath,
    wordOutputPath,
    returnedDocxPath,
    wordVisibleReadbackPath,
    baselineArtifactPath,
    yalkenTruthPath: truthPath,
    returnApplyPath,
    nativeLifecyclePath: nativeLifecycleVerificationPath,
  });
  const canonicalNativeLifecycleVerification = JSON.parse(fs.readFileSync(nativeLifecycleVerificationPath, 'utf8'));
  const nativeLifecycleCoverage = nativeLifecycleCoverageForTest(physicalOperations, canonicalNativeLifecycleVerification);
  const oraclePath = path.join(roundDir, 'complete-round-oracle.json');
  writeJson(oraclePath, oracle);

  const reuse = {
    schemaVersion: 'yalken.rtk.word.c5v2.completed-round-reuse-binding.v6',
    roundId,
    exactHead: options.expectedSha,
    canaryScriptSha256: canonicalScriptHashes().physicalCanary,
    operationStatusPolicyVersion: 'test-policy-v1',
    operationStatusPolicyDigest: digestOf({ policy: 'test-policy-v1' }),
    corpusDigest: options.expectedCorpusDigest,
    ledgerContentDigest: ledgerReuseDigestForTest(roundLedger),
    roundLedgerPath,
    roundLedgerSha256: sha256File(roundLedgerPath),
    wordOutputPath,
    wordOutputSha256: sha256File(wordOutputPath),
    wordVisibleReadbackPath,
    wordVisibleReadbackSha256: sha256File(wordVisibleReadbackPath),
    completeRoundOraclePath: oraclePath,
    completeRoundOracleSha256: sha256File(oraclePath),
    returnedReadyPath: readyPath,
    returnedReadySha256: sha256File(readyPath),
    productBaselinePath: baselineArtifactPath,
    productBaselineSha256: sha256File(baselineArtifactPath),
    returnApplyPath,
    returnApplySha256: sha256File(returnApplyPath),
    nativeLifecycleVerificationPath,
    nativeLifecycleVerificationSha256: sha256File(nativeLifecycleVerificationPath),
    sourceDocxPath,
    sourceDocxSha256: sha256File(sourceDocxPath),
    returnedDocxPath,
    returnedDocxSha256: sha256File(returnedDocxPath),
    yalkenTruthPath: truthPath,
    yalkenTruthSha256: sha256File(truthPath),
    returnApplyCandidateAuthorityPath: candidateAuthorityPath,
    returnApplyCandidateAuthoritySha256: sha256File(candidateAuthorityPath),
    returnApplyCandidateAuthorityContentDigest: candidateAuthority.contentDigest,
    returnApplyCandidateAuthorityAnchorPath: anchorPath,
    returnApplyCandidateAuthorityAnchorSha256: sha256File(anchorPath),
    returnApplyCandidateAuthorityAnchorDigest: anchor.anchorDigest,
    returnApplyCandidateAuthorityAnchorKeyId: anchor.keyId,
    returnApplyCandidateAuthorityAnchorLedgerContentDigest: ledgerReuseDigestForTest(roundLedger),
    exactLedgerBinding,
    exactTotal: exactLedgerBinding.matchedChangeCount,
    ok: true,
    failures: [],
  };
  const gate = {
    schemaVersion: 'yalken.rtk.word.c5v2.complete-round-oracle-gate.v2',
    roundId,
    ok: true,
    wordStatus: 'PASS',
    productReturnApplyGreen: true,
    nativeLifecycleVerificationGreen: nativeLifecycleCoverage.ok === true,
    nativeLifecycleCoverage,
    completeRoundOracleGreen: true,
    oracleDigest: oracle.oracleDigest,
    semanticOracleDigest: oracle.semanticOracle?.oracleDigest || '',
    roundOperationIds,
    roundOperationIdsDigest: digestOf(roundOperationIds),
    roundOperationCount: roundOperationIds.length,
    cumulativeOperationIds,
    cumulativeOperationIdsDigest: digestOf(cumulativeOperationIds),
    cumulativeOperationCount: cumulativeOperationIds.length,
    completedRoundReuseBinding: { ...reuse, bindingDigest: digestOf(reuse) },
    failures: [],
  };
  const gatePath = path.join(roundDir, 'complete-round-oracle-gate.json');
  writeJson(gatePath, gate);
  return {
    roundId,
    path: gatePath,
    sha256: sha256File(gatePath),
    roundOperationCount: roundOperationIds.length,
    roundOperationIdsDigest: digestOf(roundOperationIds),
    cumulativeOperationCount: cumulativeOperationIds.length,
    cumulativeOperationIdsDigest: digestOf(cumulativeOperationIds),
  };
}

function makeSemanticStageResult({ options, stage, dir = options.campaignRoot, mutate = null, ledgerOverride = null, scenes = null }) {
  const runRoot = stage === 'NEGATIVE' ? path.join(dir, 'NEGATIVE') : path.join(dir, 'MAIN');
  fs.mkdirSync(runRoot, { recursive: true });
  const artifacts = {};
  let stageData = {};
  let counters = {};
  const ledger = ledgerOverride || makeSemanticLedger({
    exactHead: options.expectedSha,
    campaignId: options.campaignId,
    corpusDigest: options.expectedCorpusDigest,
  });
  const ledgerDigest = ledger.ledgerDigest;
  const operationIdSetDigest = ledger.operationIdSetDigest;
  const negativeProbeIds = ledger.operations.filter((operation) => operation.family === 'negative_probe').map((operation) => operation.id);
  if (stage === 'POSITIVE') {
    const ledgerPath = path.join(runRoot, 'c5v2-master-ledger.json');
    writeJson(ledgerPath, ledger);
    const gates = [];
    for (let index = 0; index < 5; index += 1) {
      gates.push(writePositiveRoundGateEvidence({ options, runRoot, ledger, ledgerDigest, index, scenes }));
    }
    const roundGatesPath = path.join(runRoot, 'orchestrated-round-gates-manifest.json');
    writeJson(roundGatesPath, {
      schemaVersion: 'yalken.rtk.word.c5v2.orchestrated-round-gates-manifest.v1',
      campaignId: options.campaignId,
      chainId: options.chainId,
      runDir: runRoot,
      gates,
    });
    stageData = {
      mainRunDir: runRoot,
      ledgerPath,
      corpusDigest: options.expectedCorpusDigest,
      ledgerDigest,
      operationIdSetDigest,
      roundInventoryDigest: digestOf(gates),
    };
    artifacts.ledger = { path: ledgerPath, sha256: sha256File(ledgerPath), size: fs.statSync(ledgerPath).size };
    artifacts.roundGates = { path: roundGatesPath, sha256: sha256File(roundGatesPath), size: fs.statSync(roundGatesPath).size };
    counters = { operationCount: 2000, positiveOperationCount: 1960, negativeOperationCount: 40, sceneCount: 21, roundGateCount: 5, roundGreen: true };
  } else if (stage === 'NEGATIVE') {
    const evidencePath = path.join(runRoot, 'negative-campaign-evidence.json');
    const checkpointDir = path.join(runRoot, 'negative-checkpoints');
    fs.mkdirSync(checkpointDir, { recursive: true });
    const fullPlanDigest = 'sha256:' + '8'.repeat(64);
    const manifestDigest = 'sha256:' + '9'.repeat(64);
    const campaignBaseline = { digest: 'sha256:' + '7'.repeat(64), sceneCount: 21 };
    const chunk = { probeStart: 1, probeCount: 40 };
    let previousCheckpointDigest = digestOf({
      manifestDigest,
      campaignBaselineDigest: campaignBaseline.digest,
    });
    const negativeProbeOps = ledger.operations.filter((operation) => operation.family === 'negative_probe');
    const results = negativeProbeOps.map((operation, index) => {
      const id = operation.id;
      const checkpointPath = path.join(checkpointDir, `${id}.json`);
      const checkpointBody = {
        schemaVersion: 'yalken.rtk.word.c5v2.negative-probe-result.v1',
        ordinal: index + 1,
        id,
        sceneId: operation.sceneId,
        kind: operation.semanticIntent.kind,
        expectedOutcome: 'REJECT',
        observedOutcome: 'REJECT',
        ok: true,
        requestKey: operation.requestKey,
        effectKey: operation.effectKey,
        typedRejectGreen: true,
        requestConflictGreen: false,
        noWriterGreen: true,
        sceneHashGreen: true,
        networkGreen: true,
        headSha: options.expectedSha,
        masterLedgerDigest: ledgerDigest,
        fullPlanDigest,
        chunk,
        manifestDigest,
        previousCheckpointDigest,
      };
      const checkpointDigest = digestOf(checkpointBody);
      writeJson(checkpointPath, { ...checkpointBody, checkpointDigest });
      previousCheckpointDigest = checkpointDigest;
      return {
        schemaVersion: 'yalken.rtk.word.c5v2.negative-probe-result.v1',
        ordinal: index + 1,
        id,
        sceneId: checkpointBody.sceneId,
        kind: checkpointBody.kind,
        expectedOutcome: 'REJECT',
        observedOutcome: 'REJECT',
        ok: true,
        requestKey: operation.requestKey,
        effectKey: operation.effectKey,
        typedRejectGreen: true,
        requestConflictGreen: false,
        noWriterGreen: true,
        sceneHashGreen: true,
        networkGreen: true,
        checkpointPath,
        checkpointSha256: sha256File(checkpointPath),
        checkpointDigest,
      };
    });
    const evidenceBody = {
      schemaVersion: 'yalken.rtk.word.c5v2.negative-campaign-evidence.v1',
      headSha: options.expectedSha,
      masterLedgerDigest: ledgerDigest,
      fullPlanDigest,
      chunk,
      manifestDigest,
      baselineArtifactSha256: 'sha256:' + '6'.repeat(64),
      baselineReturnApplyOk: true,
      campaignBaseline,
      operationCount: 40,
      completedOperationIds: negativeProbeIds,
      rejectedCount: 40,
      failedCount: 0,
      allSceneHashesStable: true,
      allWriterFlagsFalse: true,
      networkRequests: [],
      results,
      terminalCheckpointDigest: previousCheckpointDigest,
    };
    writeJson(evidencePath, { ...evidenceBody, evidenceDigest: digestOf(evidenceBody) });
    stageData = { evidencePath, mainLedgerDigest: ledgerDigest, evidenceContentDigest: digestOf(evidenceBody) };
    artifacts.evidence = { path: evidencePath, sha256: sha256File(evidencePath), size: fs.statSync(evidencePath).size };
    counters = { operationCount: 40, rejectedCount: 40, failedCount: 0, green: true };
  } else {
    const aggregatePath = path.join(runRoot, 'terminal-operation-aggregate.json');
    writeJson(aggregatePath, {
      schemaVersion: 'yalken.rtk.word.c5v2.terminal-operation-aggregate.v1',
      headSha: options.expectedSha,
      corpusDigest: options.expectedCorpusDigest,
      masterLedgerDigest: ledgerDigest,
      positive: {
        stageSealDigest: options.expectedPositiveSealDigest || '',
        operationCount: 1960,
        reportedCount: 1960,
        familyCount: 1960,
      },
      negative: {
        stageSealDigest: options.expectedNegativeSealDigest || '',
        evidenceSha256: options.expectedNegativeEvidencePath && fs.existsSync(options.expectedNegativeEvidencePath)
          ? sha256File(options.expectedNegativeEvidencePath)
          : '',
        operationCount: 40,
        rejectedCount: 40,
        failedCount: 0,
        familyCount: 40,
        manifestDigest: 'sha256:' + '9'.repeat(64),
        evidenceDigest: options.expectedNegativeEvidenceDigest || '',
      },
      totalOperationCount: 2000,
      exactDistribution: ledger.counts,
      roundInventoryDigest: options.expectedRoundInventoryDigest || '',
      ok: true,
      counts: ledger.counts,
      failures: [],
    });
    const aggregate = JSON.parse(fs.readFileSync(aggregatePath, 'utf8'));
    writeJson(aggregatePath, { ...aggregate, aggregateDigest: digestOf(aggregate) });
    const roundGatesPath = path.join(runRoot, 'orchestrated-round-gates-manifest.json');
    if (!fs.existsSync(roundGatesPath)) {
      const gates = [];
      for (let index = 0; index < 5; index += 1) {
        gates.push(writePositiveRoundGateEvidence({ options, runRoot, ledger, ledgerDigest, index, scenes }));
      }
      writeJson(roundGatesPath, {
        schemaVersion: 'yalken.rtk.word.c5v2.orchestrated-round-gates-manifest.v1',
        campaignId: options.campaignId,
        chainId: options.chainId,
        runDir: runRoot,
        gates,
      });
    }
    stageData = {
      mainRunDir: runRoot,
      negativeEvidencePath: path.join(dir, 'NEGATIVE', 'negative-campaign-evidence.json'),
      aggregatePath,
      aggregateDigest: digestOf(aggregate),
      corpusDigest: options.expectedCorpusDigest,
      positiveStageSealDigest: options.expectedPositiveSealDigest || '',
      negativeStageSealDigest: options.expectedNegativeSealDigest || '',
      preRoundInventory: 'inventory-a',
      postRoundInventory: 'inventory-a',
      roundInventoryDigest: options.expectedRoundInventoryDigest || '',
      roundArtifactsUnchanged: true,
    };
    artifacts.terminalAggregate = { path: aggregatePath, sha256: sha256File(aggregatePath), size: fs.statSync(aggregatePath).size };
    artifacts.roundGates = { path: roundGatesPath, sha256: sha256File(roundGatesPath), size: fs.statSync(roundGatesPath).size };
    counters = { operationCount: 2000, positiveTotal: 1960, negativeTotal: 40, aggregateGreen: true };
  }
  const resultPath = path.join(dir, 'ORCHESTRATOR', `${stage.toLowerCase()}-stage-result.json`);
  const body = {
    schemaVersion: 'yalken.rtk.word.c5v2.orchestrated-stage-result.v1',
    stage,
    status: 'SEALED',
    campaignId: options.campaignId,
    chainId: options.chainId,
    headSha: options.expectedSha,
    originMainSha: options.expectedSha,
    wordVersion: options.expectedWordVersion,
    wordBuild: options.expectedWordBuild,
    startedAtUtc: new Date().toISOString(),
    finishedAtUtc: new Date(Date.now() + 1000).toISOString(),
    sequence: 3,
    stageData,
    artifacts,
    counters,
  };
  const finalBody = typeof mutate === 'function' ? mutate(body, { runRoot, ledgerDigest }) : body;
  writeJson(resultPath, finalBody);
  return { resultPath, runRoot, ledgerDigest };
}

function rewriteRoundGatesToSelfConsistentFabricated({ options, runRoot, roundGatesPath, ledgerDigest }) {
  const gates = [];
  for (let index = 0; index < 5; index += 1) {
    const roundId = `round-${String(index + 1).padStart(2, '0')}`;
    const gatePath = path.join(runRoot, roundId, 'complete-round-oracle-gate.json');
    const reuse = {
      schemaVersion: 'yalken.rtk.word.c5v2.completed-round-reuse-binding.v6',
      roundId,
      exactHead: options.expectedSha,
      canaryScriptSha256: 'sha256:' + String(index + 5).repeat(64).slice(0, 64),
      operationStatusPolicyVersion: 'test-policy-v1',
      operationStatusPolicyDigest: 'sha256:' + String(index + 6).repeat(64).slice(0, 64),
      corpusDigest: options.expectedCorpusDigest,
      ledgerContentDigest: ledgerDigest,
      wordOutputSha256: 'sha256:' + String(index + 7).repeat(64).slice(0, 64),
      completeRoundOracleSha256: 'sha256:' + String(index + 8).repeat(64).slice(0, 64),
      returnedReadySha256: 'sha256:' + String(index + 9).repeat(64).slice(0, 64),
      sourceDocxSha256: 'sha256:' + String(index + 1).repeat(64).slice(0, 64),
      returnedDocxSha256: 'sha256:' + String(index + 2).repeat(64).slice(0, 64),
      yalkenTruthSha256: 'sha256:' + String(index + 3).repeat(64).slice(0, 64),
      returnApplyCandidateAuthoritySha256: 'sha256:' + String(index + 4).repeat(64).slice(0, 64),
      returnApplyCandidateAuthorityContentDigest: 'sha256:' + String(index + 5).repeat(64).slice(0, 64),
      returnApplyCandidateAuthorityAnchorSha256: 'sha256:' + String(index + 6).repeat(64).slice(0, 64),
      returnApplyCandidateAuthorityAnchorDigest: 'sha256:' + String(index + 7).repeat(64).slice(0, 64),
      returnApplyCandidateAuthorityAnchorKeyId: `test-anchor-${roundId}`,
      returnApplyCandidateAuthorityAnchorLedgerContentDigest: ledgerDigest,
      exactLedgerBinding: { ok: true, roundId },
      exactTotal: (index + 1) * 100,
      ok: true,
      failures: [],
    };
    writeJson(gatePath, {
      schemaVersion: 'yalken.rtk.word.c5v2.complete-round-oracle-gate.v2',
      roundId,
      ok: true,
      wordStatus: 'PASS',
      productReturnApplyGreen: true,
      nativeLifecycleVerificationGreen: true,
      completeRoundOracleGreen: true,
      oracleDigest: 'sha256:' + String(index + 1).repeat(64).slice(0, 64),
      semanticOracleDigest: 'sha256:' + String(index + 2).repeat(64).slice(0, 64),
      completedRoundReuseBinding: { ...reuse, bindingDigest: digestOf(reuse) },
      failures: [],
    });
    gates.push({ roundId, path: gatePath, sha256: sha256File(gatePath) });
  }
  writeJson(roundGatesPath, {
    schemaVersion: 'yalken.rtk.word.c5v2.orchestrated-round-gates-manifest.v1',
    campaignId: options.campaignId,
    chainId: options.chainId,
    runDir: runRoot,
    gates,
  });
  return gates;
}

function rewriteRoundGatesToCoherentMinimalDocxForgery({ runRoot, roundGatesPath }) {
  const manifest = JSON.parse(fs.readFileSync(roundGatesPath, 'utf8'));
  const gates = [];
  for (const gate of manifest.gates) {
    const gateJson = JSON.parse(fs.readFileSync(gate.path, 'utf8'));
    const reuse = { ...gateJson.completedRoundReuseBinding };
    delete reuse.bindingDigest;
    const roundLedger = JSON.parse(fs.readFileSync(reuse.roundLedgerPath, 'utf8'));
    const roundOperations = Array.isArray(roundLedger.operations) ? roundLedger.operations : [];
    writeMinimalDocx(reuse.sourceDocxPath, `FORGED SOURCE ${gate.roundId}`);
    writeMinimalDocx(reuse.returnedDocxPath, `FORGED RETURNED ${gate.roundId}`);
    fs.writeFileSync(
      reuse.wordVisibleReadbackPath,
      `${roundOperations.map((operation) => operation.replacementText || operation.id).join('\n')}\n`,
      'utf8',
    );
    const wordLines = ['WORD_STATUS=PASS'];
    for (const operation of roundOperations) {
      const expectedOutcome = operation.expectedOutcome || 'SAFE_APPLY';
      const status = expectedOutcome === 'MANUAL' && !['reply_attempt', 'state_attempt'].includes(operation.family)
        ? 'BLOCKED'
        : expectedOutcome;
      wordLines.push(`OP|${operation.id}|${status}`);
      wordLines.push(`READBACK|${operation.id}|${status}|FORGED_NATIVE_READBACK`);
    }
    fs.writeFileSync(reuse.wordOutputPath, `${wordLines.join('\n')}\n`, 'utf8');
    const sceneIds = [...new Set(roundOperations.map((operation) => operation.sceneId).filter(Boolean))];
    const sceneReadback = sceneIds.map((sceneId) => {
      const rawContent = docV2PayloadFromBlocks([{ text: `FORGED ${gate.roundId} ${sceneId}`, marks: ['bold', 'italic'] }]);
      return { sceneId, rawContent, rawContentSha256: sha256Text(rawContent) };
    });
    const truth = {
      schemaVersion: 'yalken.rtk.word.c5v2.reopened-yalken-truth.v1',
      roundId: gate.roundId,
      sourceKind: 'reopened-yalken-project',
      reopenPassCount: 2,
      expectedRootCommentCount: 0,
      canonicalNonTextState: { present: false },
      recoveryNonTextState: { present: false },
      passes: [
        { scenes: sceneReadback.map((scene) => ({ sceneId: scene.sceneId, ok: true })) },
        { scenes: sceneReadback.map((scene) => ({ sceneId: scene.sceneId, ok: true })) },
      ],
      sceneReadback,
    };
    writeJson(reuse.yalkenTruthPath, truth);
    const returnApply = JSON.parse(fs.readFileSync(reuse.returnApplyPath, 'utf8'));
    returnApply.yalkenTruthArtifact = { path: reuse.yalkenTruthPath, sha256: sha256File(reuse.yalkenTruthPath) };
    writeJson(reuse.returnApplyPath, returnApply);
    const operationResults = roundOperations.map((operation) => {
      const expectedOutcome = operation.expectedOutcome || 'SAFE_APPLY';
      const status = expectedOutcome === 'MANUAL' && !['reply_attempt', 'state_attempt'].includes(operation.family)
        ? 'BLOCKED'
        : expectedOutcome;
      return {
        operationId: operation.id,
        family: operation.formalFamily || operation.family,
        expectedOutcome,
        reportedStatus: status,
        nativeReadbackStatus: status,
        wordGreen: true,
        yalkenGreen: true,
        wordEvidence: { forgedCorrelatedOracle: true },
        yalkenEvidence: { forgedCorrelatedOracle: true },
      };
    });
    const semanticOracle = {
      ok: true,
      sourceKinds: ['forged-ooxml', 'forged-yalken-truth'],
      oracleDigest: digestOf({ roundId: gate.roundId, forged: true, operationIds: operationResults.map((row) => row.operationId) }),
    };
    const oracle = {
      schemaVersion: 'yalken.rtk.word.c5v2.complete-round-oracle.v1',
      ok: true,
      operationCount: operationResults.length,
      wordStatusCount: operationResults.length,
      nativeWordReadbackCount: operationResults.length,
      reopenedYalkenSceneCount: sceneReadback.length,
      nativeWordVisibleReadbackPresent: true,
      duplicateWordStatuses: false,
      duplicateNativeReadbacks: false,
      sourceKinds: ['ledger-intent', 'raw-ooxml', 'word-object-model-reopened', 'reopened-yalken-project'],
      semanticOracle,
      canonicalCommentStateEvidence: { ok: true, expectedRootCommentCount: 0, canonicalRevision: 0, recoveryRevision: 0, failures: [] },
      operationResults,
      oracleDigest: digestOf(operationResults),
    };
    writeJson(reuse.completeRoundOraclePath, oracle);
    const ready = JSON.parse(fs.readFileSync(reuse.returnedReadyPath, 'utf8'));
    ready.returnedSha256 = sha256File(reuse.returnedDocxPath);
    writeJson(reuse.returnedReadyPath, ready);
    reuse.wordOutputSha256 = sha256File(reuse.wordOutputPath);
    reuse.wordVisibleReadbackSha256 = sha256File(reuse.wordVisibleReadbackPath);
    reuse.completeRoundOracleSha256 = sha256File(reuse.completeRoundOraclePath);
    reuse.returnedReadySha256 = sha256File(reuse.returnedReadyPath);
    reuse.returnApplySha256 = sha256File(reuse.returnApplyPath);
    reuse.sourceDocxSha256 = sha256File(reuse.sourceDocxPath);
    reuse.returnedDocxSha256 = sha256File(reuse.returnedDocxPath);
    reuse.yalkenTruthSha256 = sha256File(reuse.yalkenTruthPath);
    gateJson.oracleDigest = oracle.oracleDigest;
    gateJson.semanticOracleDigest = semanticOracle.oracleDigest;
    gateJson.completedRoundReuseBinding = { ...reuse, bindingDigest: digestOf(reuse) };
    writeJson(gate.path, gateJson);
    gate.sha256 = sha256File(gate.path);
    gates.push(gate);
  }
  manifest.gates = gates;
  writeJson(roundGatesPath, manifest);
  return gates;
}

leaseTest('ORCH_TEST_15B: stage result verifier rejects off-root symlink non-regular and false semantic artifacts', async () => {
  const orch = await loadOrchestrator();
  const options = validOptions();
  fs.mkdirSync(options.campaignRoot, { recursive: true });
  const started = Date.now() - 1000;
  const green = makeSemanticStageResult({ options, stage: 'POSITIVE' });
  const baseArgs = {
    stage: 'POSITIVE',
    resultPath: green.resultPath,
    campaignId: options.campaignId,
    chainId: options.chainId,
    expectedSha: options.expectedSha,
    expectedWordVersion: options.expectedWordVersion,
    expectedWordBuild: options.expectedWordBuild,
    stageStartedAtMs: started,
    requiredOutputKeys: ['ledger', 'roundGates'],
    expectedCampaignRoot: options.campaignRoot,
    expectedStageRoot: green.runRoot,
    expectedCorpusDigest: options.expectedCorpusDigest,
    expectedLedgerDigest: options.expectedLedgerDigest,
    expectedOperationIdSetDigest: options.expectedOperationIdSetDigest,
  };
  assert.equal(orch.validateStageResult(baseArgs).ok, true);

  const outside = path.join(tmpDir('c5v2-stage-outside-'), 'outside-ledger.json');
  writeJson(outside, makeSemanticLedger());
  const offRoot = makeSemanticStageResult({ options, stage: 'POSITIVE', mutate: (body) => ({ ...body, artifacts: { ...body.artifacts, ledger: { ...body.artifacts.ledger, path: outside, sha256: sha256File(outside), size: fs.statSync(outside).size } } }) });
  assert.match(orch.validateStageResult({ ...baseArgs, resultPath: offRoot.resultPath }).code, /ORCH_STAGE_RESULT_ARTIFACT_OUTSIDE_ROOT/u);

  const symlinkTarget = path.join(green.runRoot, 'symlink-target.json');
  writeJson(symlinkTarget, makeSemanticLedger());
  const symlinkPath = path.join(green.runRoot, 'symlink-ledger.json');
  fs.symlinkSync(symlinkTarget, symlinkPath);
  const symlinked = makeSemanticStageResult({ options, stage: 'POSITIVE', mutate: (body) => ({ ...body, artifacts: { ...body.artifacts, ledger: { ...body.artifacts.ledger, path: symlinkPath, sha256: sha256File(symlinkTarget), size: fs.statSync(symlinkTarget).size } } }) });
  assert.match(orch.validateStageResult({ ...baseArgs, resultPath: symlinked.resultPath }).code, /ORCH_STAGE_RESULT_ARTIFACT_NOT_REGULAR/u);

  const falseSplit = makeSemanticStageResult({ options, stage: 'AGGREGATE', mutate: (body) => ({ ...body, counters: { ...body.counters, positiveTotal: 2000, negativeTotal: 0 } }) });
  assert.match(orch.validateStageResult({
    ...baseArgs,
    stage: 'AGGREGATE',
    resultPath: falseSplit.resultPath,
    requiredOutputKeys: ['terminalAggregate'],
    expectedStageRoot: falseSplit.runRoot,
    expectedPositiveLedgerDigest: falseSplit.ledgerDigest,
    expectedNegativeEvidenceDigest: sha256Text('negative-evidence'),
  }).code, /ORCH_STAGE_RESULT_AGGREGATE_SPLIT/u);
});

leaseTest('ORCH_TEST_15C: semantic verifier rejects fabricated arbitrary 1960 plus 40 ledger', async () => {
  const orch = await loadOrchestrator();
  const options = validOptions();
  fs.mkdirSync(options.campaignRoot, { recursive: true });
  const fabricatedLedger = makeSemanticLedger({
    mutateOperation: (operation, index) => index < 1960
      ? { ...operation, id: `fabricated-${String(index + 1).padStart(4, '0')}`, family: 'arbitrary_non_negative_family' }
      : operation,
  });
  fabricatedLedger.ledgerDigest = sha256Text(JSON.stringify(fabricatedLedger.operations));
  fabricatedLedger.operationIdSetDigest = sha256Text(JSON.stringify(fabricatedLedger.operations.map((operation) => operation.id || '')));
  const fabricated = makeSemanticStageResult({
    options,
    stage: 'POSITIVE',
    mutate: (body, { runRoot }) => {
      const ledgerPath = path.join(runRoot, 'fabricated-master-ledger.json');
      writeJson(ledgerPath, fabricatedLedger);
      return {
        ...body,
        stageData: {
          ...body.stageData,
          ledgerPath,
          ledgerDigest: fabricatedLedger.ledgerDigest,
          operationIdSetDigest: fabricatedLedger.operationIdSetDigest,
        },
        artifacts: {
          ...body.artifacts,
          ledger: { path: ledgerPath, sha256: sha256File(ledgerPath), size: fs.statSync(ledgerPath).size },
        },
      };
    },
  });
  const result = orch.validateStageResult({
    stage: 'POSITIVE',
    resultPath: fabricated.resultPath,
    campaignId: options.campaignId,
    chainId: options.chainId,
    expectedSha: options.expectedSha,
    expectedWordVersion: options.expectedWordVersion,
    expectedWordBuild: options.expectedWordBuild,
    stageStartedAtMs: Date.now() - 1000,
    requiredOutputKeys: ['ledger', 'roundGates'],
    expectedCampaignRoot: options.campaignRoot,
    expectedStageRoot: fabricated.runRoot,
    expectedCorpusDigest: options.expectedCorpusDigest,
    expectedLedgerDigest: options.expectedLedgerDigest,
    expectedOperationIdSetDigest: options.expectedOperationIdSetDigest,
  });
  assert.equal(result.ok, false);
  assert.match(result.code, /ORCH_STAGE_RESULT_OPERATION_FAMILY_INVALID|ORCH_STAGE_RESULT_LEDGER_DIGEST_EXPECTED_MISMATCH/u);
});

leaseTest('ORCH_TEST_15D: semantic verifier rejects empty negative evidence with fabricated 40 of 40 counters', async () => {
  const orch = await loadOrchestrator();
  const options = validOptions();
  fs.mkdirSync(options.campaignRoot, { recursive: true });
  const positive = makeSemanticStageResult({ options, stage: 'POSITIVE' });
  const ledger = makeSemanticLedger();
  const expectedNegativeProbeIds = ledger.operations.filter((operation) => operation.family === 'negative_probe').map((operation) => operation.id);
  const expectedNegativeProbePlan = ledger.operations.filter((operation) => operation.family === 'negative_probe');
  const negative = makeSemanticStageResult({ options, stage: 'NEGATIVE' });
  const resultBody = JSON.parse(fs.readFileSync(negative.resultPath, 'utf8'));
  const evidencePath = resultBody.artifacts.evidence.path;
  const emptyEvidenceBody = {
    schemaVersion: 'yalken.rtk.word.c5v2.negative-campaign-evidence.v1',
    masterLedgerDigest: options.expectedLedgerDigest,
    operationCount: 40,
    completedOperationIds: [],
    rejectedCount: 40,
    failedCount: 0,
    allSceneHashesStable: true,
    allWriterFlagsFalse: true,
    networkRequests: [],
    results: [],
    terminalCheckpointDigest: 'sha256:' + '0'.repeat(64),
  };
  writeJson(evidencePath, { ...emptyEvidenceBody, evidenceDigest: digestOf(emptyEvidenceBody) });
  resultBody.stageData.evidenceContentDigest = digestOf(emptyEvidenceBody);
  resultBody.artifacts.evidence.sha256 = sha256File(evidencePath);
  resultBody.artifacts.evidence.size = fs.statSync(evidencePath).size;
  writeJson(negative.resultPath, resultBody);
  const result = orch.validateStageResult({
    stage: 'NEGATIVE',
    resultPath: negative.resultPath,
    campaignId: options.campaignId,
    chainId: options.chainId,
    expectedSha: options.expectedSha,
    expectedWordVersion: options.expectedWordVersion,
    expectedWordBuild: options.expectedWordBuild,
    stageStartedAtMs: Date.now() - 1000,
    requiredOutputKeys: ['evidence'],
    expectedCampaignRoot: options.campaignRoot,
    expectedStageRoot: negative.runRoot,
    expectedPositiveLedgerDigest: positive.ledgerDigest,
    expectedNegativeProbeIds,
    expectedNegativeProbePlan,
  });
  assert.equal(result.ok, false);
  assert.match(result.code, /ORCH_STAGE_RESULT_NEGATIVE_ROWS|ORCH_STAGE_RESULT_NEGATIVE_COMPLETED_ID_SET_MISMATCH/u);
});

leaseTest('ORCH_TEST_15E: semantic verifier rejects unbound topology-less positive ledger and fake round gates', async () => {
  const orch = await loadOrchestrator();
  const options = validOptions();
  fs.mkdirSync(options.campaignRoot, { recursive: true });
  const fake = makeSemanticStageResult({
    options,
    stage: 'POSITIVE',
    mutate: (body, { runRoot }) => {
      const ledgerPath = body.artifacts.ledger.path;
      const ledger = JSON.parse(fs.readFileSync(ledgerPath, 'utf8'));
      delete ledger.topology;
      delete ledger.gates;
      delete ledger.resumeAuthority;
      ledger.operations = ledger.operations.map((operation) => {
        const copy = { ...operation };
        delete copy.requestKey;
        delete copy.effectKey;
        return copy;
      });
      ledger.ledgerDigest = sha256Text(JSON.stringify(ledger.operations));
      writeJson(ledgerPath, ledger);
      const gates = [];
      for (let index = 0; index < 5; index += 1) {
        const roundId = `round-${String(index + 1).padStart(2, '0')}`;
        const gatePath = path.join(runRoot, roundId, 'complete-round-oracle-gate.json');
        writeJson(gatePath, {
          schemaVersion: 'yalken.rtk.word.c5v2.complete-round-oracle-gate.v2',
          roundId,
          ok: true,
          productReturnApplyGreen: true,
          nativeLifecycleVerificationGreen: true,
          completeRoundOracleGreen: true,
          oracleDigest: 'sha256:' + String(index + 1).repeat(64).slice(0, 64),
          semanticOracleDigest: 'sha256:' + String(index + 2).repeat(64).slice(0, 64),
          completedRoundReuseBinding: {
            ok: true,
            roundId,
            bindingDigest: 'sha256:' + String(index + 3).repeat(64).slice(0, 64),
            ledgerContentDigest: ledger.ledgerDigest,
          },
        });
        gates.push({ roundId, path: gatePath, sha256: sha256File(gatePath) });
      }
      const roundGatesPath = body.artifacts.roundGates.path;
      writeJson(roundGatesPath, {
        schemaVersion: 'yalken.rtk.word.c5v2.orchestrated-round-gates-manifest.v1',
        campaignId: options.campaignId,
        chainId: options.chainId,
        runDir: runRoot,
        gates,
      });
      return {
        ...body,
        stageData: {
          ...body.stageData,
          ledgerDigest: ledger.ledgerDigest,
          roundInventoryDigest: digestOf(gates),
        },
        artifacts: {
          ...body.artifacts,
          ledger: { path: ledgerPath, sha256: sha256File(ledgerPath), size: fs.statSync(ledgerPath).size },
          roundGates: { path: roundGatesPath, sha256: sha256File(roundGatesPath), size: fs.statSync(roundGatesPath).size },
        },
      };
    },
  });
  const body = JSON.parse(fs.readFileSync(fake.resultPath, 'utf8'));
  const result = orch.validateStageResult({
    stage: 'POSITIVE',
    resultPath: fake.resultPath,
    campaignId: options.campaignId,
    chainId: options.chainId,
    expectedSha: options.expectedSha,
    expectedWordVersion: options.expectedWordVersion,
    expectedWordBuild: options.expectedWordBuild,
    stageStartedAtMs: Date.now() - 1000,
    requiredOutputKeys: ['ledger', 'roundGates'],
    expectedCampaignRoot: options.campaignRoot,
    expectedStageRoot: fake.runRoot,
    expectedCorpusDigest: options.expectedCorpusDigest,
    expectedLedgerDigest: body.stageData.ledgerDigest,
    expectedOperationIdSetDigest: body.stageData.operationIdSetDigest,
  });
  assert.equal(result.ok, false);
  assert.match(result.code, /ORCH_STAGE_RESULT_LEDGER_TOPOLOGY|ORCH_STAGE_RESULT_OPERATION_REQUEST_KEY|ORCH_STAGE_RESULT_LEDGER_RESUME_AUTHORITY|ORCH_STAGE_RESULT_ROUND_GATE_REUSE_BINDING/u);
});

leaseTest('ORCH_TEST_15F: semantic verifier rejects fabricated negative rows wrong genesis terminal and evidence path', async () => {
  const orch = await loadOrchestrator();
  const options = validOptions();
  fs.mkdirSync(options.campaignRoot, { recursive: true });
  const positive = makeSemanticStageResult({ options, stage: 'POSITIVE' });
  const positiveBody = JSON.parse(fs.readFileSync(positive.resultPath, 'utf8'));
  const ledger = JSON.parse(fs.readFileSync(positiveBody.artifacts.ledger.path, 'utf8'));
  const expectedNegativeProbePlan = ledger.operations.filter((operation) => operation.family === 'negative_probe');
  const expectedNegativeProbeIds = expectedNegativeProbePlan.map((operation) => operation.id);
  const negative = makeSemanticStageResult({ options, stage: 'NEGATIVE' });
  const resultBody = JSON.parse(fs.readFileSync(negative.resultPath, 'utf8'));
  const evidencePath = resultBody.artifacts.evidence.path;
  const wrongPath = path.join(negative.runRoot, 'unrelated-evidence.json');
  writeJson(wrongPath, { not: 'the claimed evidence' });
  const checkpointDir = path.join(negative.runRoot, 'fabricated-negative-checkpoints');
  fs.mkdirSync(checkpointDir, { recursive: true });
  const rows = expectedNegativeProbeIds.map((id, index) => {
    const checkpointPath = path.join(checkpointDir, `${id}.json`);
    const checkpoint = {
      schemaVersion: 'yalken.rtk.word.c5v2.negative-probe-result.v1',
      ordinal: index + 1,
      id,
      sceneId: 'scene-01',
      kind: 'fabricated-non-probe-row',
      expectedOutcome: 'REJECT',
      observedOutcome: 'REJECT',
      ok: true,
      requestKey: 'sha256:' + '1'.repeat(64),
      effectKey: 'sha256:' + '2'.repeat(64),
      typedRejectGreen: true,
      requestConflictGreen: false,
      noWriterGreen: true,
      sceneHashGreen: true,
      networkGreen: true,
      headSha: options.expectedSha,
      masterLedgerDigest: positive.ledgerDigest,
      fullPlanDigest: 'sha256:' + '3'.repeat(64),
      chunk: { probeStart: 1, probeCount: 40 },
      manifestDigest: 'sha256:' + '4'.repeat(64),
      previousCheckpointDigest: index === 0 ? 'sha256:' + 'f'.repeat(64) : 'sha256:' + 'e'.repeat(64),
    };
    checkpoint.checkpointDigest = digestOf(checkpoint);
    writeJson(checkpointPath, checkpoint);
    return {
      schemaVersion: checkpoint.schemaVersion,
      ordinal: checkpoint.ordinal,
      id,
      sceneId: checkpoint.sceneId,
      kind: checkpoint.kind,
      expectedOutcome: checkpoint.expectedOutcome,
      observedOutcome: checkpoint.observedOutcome,
      ok: true,
      requestKey: checkpoint.requestKey,
      effectKey: checkpoint.effectKey,
      typedRejectGreen: true,
      requestConflictGreen: false,
      noWriterGreen: true,
      sceneHashGreen: true,
      networkGreen: true,
      checkpointPath,
      checkpointSha256: sha256File(checkpointPath),
      checkpointDigest: checkpoint.checkpointDigest,
    };
  });
  const evidenceBody = {
    schemaVersion: 'yalken.rtk.word.c5v2.negative-campaign-evidence.v1',
    headSha: options.expectedSha,
    masterLedgerDigest: positive.ledgerDigest,
    fullPlanDigest: 'sha256:' + '3'.repeat(64),
    chunk: { probeStart: 1, probeCount: 40 },
    manifestDigest: 'sha256:' + '4'.repeat(64),
    baselineArtifactSha256: 'sha256:' + '5'.repeat(64),
    baselineReturnApplyOk: true,
    campaignBaseline: { digest: 'sha256:' + '6'.repeat(64) },
    operationCount: 40,
    completedOperationIds: expectedNegativeProbeIds,
    rejectedCount: 40,
    failedCount: 0,
    allSceneHashesStable: true,
    allWriterFlagsFalse: true,
    networkRequests: [],
    results: rows,
    terminalCheckpointDigest: 'sha256:' + '0'.repeat(64),
  };
  writeJson(evidencePath, { ...evidenceBody, evidenceDigest: digestOf(evidenceBody) });
  resultBody.stageData.evidencePath = wrongPath;
  resultBody.stageData.mainLedgerDigest = positive.ledgerDigest;
  resultBody.stageData.evidenceContentDigest = digestOf(evidenceBody);
  resultBody.artifacts.evidence.sha256 = sha256File(evidencePath);
  resultBody.artifacts.evidence.size = fs.statSync(evidencePath).size;
  writeJson(negative.resultPath, resultBody);
  const result = orch.validateStageResult({
    stage: 'NEGATIVE',
    resultPath: negative.resultPath,
    campaignId: options.campaignId,
    chainId: options.chainId,
    expectedSha: options.expectedSha,
    expectedWordVersion: options.expectedWordVersion,
    expectedWordBuild: options.expectedWordBuild,
    stageStartedAtMs: Date.now() - 1000,
    requiredOutputKeys: ['evidence'],
    expectedCampaignRoot: options.campaignRoot,
    expectedStageRoot: negative.runRoot,
    expectedPositiveLedgerDigest: positive.ledgerDigest,
    expectedNegativeProbeIds,
    expectedNegativeProbePlan,
  });
  assert.equal(result.ok, false);
  assert.match(result.code, /ORCH_STAGE_RESULT_NEGATIVE_EVIDENCE_PATH_IDENTITY|ORCH_STAGE_RESULT_NEGATIVE_KIND|ORCH_STAGE_RESULT_NEGATIVE_REQUEST_EFFECT|ORCH_STAGE_RESULT_NEGATIVE_CHECKPOINT_CHAIN|ORCH_STAGE_RESULT_NEGATIVE_TERMINAL_CHECKPOINT/u);
});

leaseTest('ORCH_TEST_15G: real canonical ledger engine binds negative round zero and positive rounds one through five', async () => {
  const [orch, canary, ledgerEngine] = await Promise.all([loadOrchestrator(), loadCanary(), loadLedgerEngine()]);
  const options = validOptions();
  fs.mkdirSync(options.campaignRoot, { recursive: true });
  const corpusManifestPath = makeLoadableCorpusManifestFileForTest('canonical-ledger', tmpDir('c5v2-canonical-ledger-corpus-'), 21);
  const corpus = canary.loadCanaryCorpus({ sceneCount: 21, sceneStart: 0, corpusManifestPath });
  const rawLedger = ledgerEngine.buildC5V2Ledger({ scenes: corpus.scenes, roundCount: 5 });
  const ledger = canary.bindC5V2MasterLedgerResumeAuthority(rawLedger, {
    exactHead: options.expectedSha,
    campaignId: options.campaignId,
    corpusDigest: options.expectedCorpusDigest,
  });
  const ledgerOperationIdSetDigest = sha256Text(JSON.stringify(ledger.operations.map((operation) => operation.id || '')));
  ledger.operationIdSetDigest = ledgerOperationIdSetDigest;
  assert.deepEqual([...new Set(ledger.operations.filter((operation) => operation.family === 'negative_probe').map((operation) => operation.round))], [0]);
  assert.deepEqual([...new Set(ledger.operations.filter((operation) => operation.family !== 'negative_probe').map((operation) => operation.round))].sort(), [1, 2, 3, 4, 5]);

  const stageConstructionStartedAtMs = Date.now();
  const semantic = makeSemanticStageResult({
    options,
    stage: 'POSITIVE',
    ledgerOverride: ledger,
    scenes: corpus.scenes,
  });
  const green = orch.validateStageResult({
    stage: 'POSITIVE',
    resultPath: semantic.resultPath,
    campaignId: options.campaignId,
    chainId: options.chainId,
    expectedSha: options.expectedSha,
    expectedWordVersion: options.expectedWordVersion,
    expectedWordBuild: options.expectedWordBuild,
    stageStartedAtMs: stageConstructionStartedAtMs,
    requiredOutputKeys: ['ledger', 'roundGates'],
    expectedCampaignRoot: options.campaignRoot,
    expectedStageRoot: semantic.runRoot,
    expectedCorpusDigest: options.expectedCorpusDigest,
    expectedLedgerDigest: ledger.ledgerDigest,
    expectedOperationIdSetDigest: ledgerOperationIdSetDigest,
  });
  assert.equal(green.ok, true, JSON.stringify(green.failures || green));

  const positiveRoundZero = JSON.parse(fs.readFileSync(semantic.resultPath, 'utf8'));
  const badLedgerPath = positiveRoundZero.artifacts.ledger.path;
  const badLedger = JSON.parse(fs.readFileSync(badLedgerPath, 'utf8'));
  const firstPositive = badLedger.operations.find((operation) => operation.family !== 'negative_probe');
  firstPositive.round = 0;
  firstPositive.requestKey = operationRequestKey(firstPositive);
  firstPositive.effectKey = operationEffectKey(firstPositive);
  badLedger.ledgerDigest = sha256Text(JSON.stringify(badLedger.operations));
  badLedger.resumeAuthority.digest = resumeAuthorityDigest(badLedger, { exactHead: options.expectedSha, campaignId: options.campaignId, corpusDigest: options.expectedCorpusDigest });
  writeJson(badLedgerPath, badLedger);
  positiveRoundZero.stageData.ledgerDigest = badLedger.ledgerDigest;
  positiveRoundZero.artifacts.ledger.sha256 = sha256File(badLedgerPath);
  positiveRoundZero.artifacts.ledger.size = fs.statSync(badLedgerPath).size;
  writeJson(semantic.resultPath, positiveRoundZero);
  const positiveRoundZeroResult = orch.validateStageResult({
    stage: 'POSITIVE',
    resultPath: semantic.resultPath,
    campaignId: options.campaignId,
    chainId: options.chainId,
    expectedSha: options.expectedSha,
    expectedWordVersion: options.expectedWordVersion,
    expectedWordBuild: options.expectedWordBuild,
    stageStartedAtMs: Date.now() - 1000,
    requiredOutputKeys: ['ledger', 'roundGates'],
    expectedCampaignRoot: options.campaignRoot,
    expectedStageRoot: semantic.runRoot,
    expectedCorpusDigest: options.expectedCorpusDigest,
    expectedLedgerDigest: badLedger.ledgerDigest,
    expectedOperationIdSetDigest: ledgerOperationIdSetDigest,
  });
  assert.equal(positiveRoundZeroResult.ok, false);
  assert.match(positiveRoundZeroResult.code, /ORCH_STAGE_RESULT_POSITIVE_ROUND_INVALID/u);

  const mutatedLedger = JSON.parse(JSON.stringify(ledger));
  const firstNegative = mutatedLedger.operations.find((operation) => operation.family === 'negative_probe');
  firstNegative.round = 1;
  firstNegative.requestKey = operationRequestKey(firstNegative);
  firstNegative.effectKey = operationEffectKey(firstNegative);
  mutatedLedger.ledgerDigest = sha256Text(JSON.stringify(mutatedLedger.operations));
  mutatedLedger.resumeAuthority.digest = resumeAuthorityDigest(mutatedLedger, { exactHead: options.expectedSha, campaignId: options.campaignId, corpusDigest: options.expectedCorpusDigest });
  const semanticNegativeRound = makeSemanticStageResult({
    options,
    stage: 'POSITIVE',
    ledgerOverride: mutatedLedger,
    scenes: corpus.scenes,
  });
  const negativeNonzeroResult = orch.validateStageResult({
    stage: 'POSITIVE',
    resultPath: semanticNegativeRound.resultPath,
    campaignId: options.campaignId,
    chainId: options.chainId,
    expectedSha: options.expectedSha,
    expectedWordVersion: options.expectedWordVersion,
    expectedWordBuild: options.expectedWordBuild,
    stageStartedAtMs: Date.now() - 1000,
    requiredOutputKeys: ['ledger', 'roundGates'],
    expectedCampaignRoot: options.campaignRoot,
    expectedStageRoot: semanticNegativeRound.runRoot,
    expectedCorpusDigest: options.expectedCorpusDigest,
    expectedLedgerDigest: JSON.parse(fs.readFileSync(semanticNegativeRound.resultPath, 'utf8')).stageData.ledgerDigest,
    expectedOperationIdSetDigest: ledgerOperationIdSetDigest,
  });
  assert.equal(negativeNonzeroResult.ok, false);
  assert.match(negativeNonzeroResult.code, /ORCH_STAGE_RESULT_NEGATIVE_ROUND_INVALID/u);
});

leaseTest('ORCH_TEST_15H: semantic verifier rejects self-consistent fabricated completed-round gates without evidence artifacts', async () => {
  const orch = await loadOrchestrator();
  const options = validOptions();
  fs.mkdirSync(options.campaignRoot, { recursive: true });
  const semantic = makeSemanticStageResult({
    options,
    stage: 'POSITIVE',
    mutate: (body, { runRoot, ledgerDigest }) => {
      const gates = rewriteRoundGatesToSelfConsistentFabricated({
        options,
        runRoot,
        roundGatesPath: body.artifacts.roundGates.path,
        ledgerDigest,
      });
      return {
        ...body,
        stageData: {
          ...body.stageData,
          roundInventoryDigest: digestOf(gates),
        },
        artifacts: {
          ...body.artifacts,
          roundGates: {
            path: body.artifacts.roundGates.path,
            sha256: sha256File(body.artifacts.roundGates.path),
            size: fs.statSync(body.artifacts.roundGates.path).size,
          },
        },
      };
    },
  });
  const result = orch.validateStageResult({
    stage: 'POSITIVE',
    resultPath: semantic.resultPath,
    campaignId: options.campaignId,
    chainId: options.chainId,
    expectedSha: options.expectedSha,
    expectedWordVersion: options.expectedWordVersion,
    expectedWordBuild: options.expectedWordBuild,
    stageStartedAtMs: Date.now() - 1000,
    requiredOutputKeys: ['ledger', 'roundGates'],
    expectedCampaignRoot: options.campaignRoot,
    expectedStageRoot: semantic.runRoot,
    expectedCorpusDigest: options.expectedCorpusDigest,
    expectedLedgerDigest: semantic.ledgerDigest,
    expectedOperationIdSetDigest: options.expectedOperationIdSetDigest,
  });
  assert.equal(result.ok, false);
  assert.match(result.code, /ORCH_STAGE_RESULT_ROUND_GATE_DEEP_PROOF|ORCH_STAGE_RESULT_ROUND_GATE_ARTIFACT|ORCH_STAGE_RESULT_ROUND_GATE_ROSTER/u);
});

leaseTest('ORCH_TEST_15J: semantic verifier rejects self-consistent non-DOCX round packages', async () => {
  const orch = await loadOrchestrator();
  const options = validOptions();
  fs.mkdirSync(options.campaignRoot, { recursive: true });
  const semantic = makeSemanticStageResult({ options, stage: 'POSITIVE' });
  const resultBody = JSON.parse(fs.readFileSync(semantic.resultPath, 'utf8'));
  const manifestPath = resultBody.artifacts.roundGates.path;
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  for (const gate of manifest.gates) {
    const gateJson = JSON.parse(fs.readFileSync(gate.path, 'utf8'));
    const reuse = { ...gateJson.completedRoundReuseBinding };
    fs.writeFileSync(reuse.sourceDocxPath, `SOURCE ${gate.roundId}\n${gateJson.roundOperationIds.join('\n')}\n`, 'utf8');
    fs.writeFileSync(reuse.returnedDocxPath, `RETURNED ${gate.roundId}\n${gateJson.roundOperationIds.join('\n')}\n`, 'utf8');
    const ready = JSON.parse(fs.readFileSync(reuse.returnedReadyPath, 'utf8'));
    ready.returnedSha256 = sha256File(reuse.returnedDocxPath);
    writeJson(reuse.returnedReadyPath, ready);
    delete reuse.bindingDigest;
    reuse.sourceDocxSha256 = sha256File(reuse.sourceDocxPath);
    reuse.returnedDocxSha256 = sha256File(reuse.returnedDocxPath);
    reuse.returnedReadySha256 = sha256File(reuse.returnedReadyPath);
    gateJson.completedRoundReuseBinding = { ...reuse, bindingDigest: digestOf(reuse) };
    writeJson(gate.path, gateJson);
    gate.sha256 = sha256File(gate.path);
  }
  writeJson(manifestPath, manifest);
  resultBody.stageData.roundInventoryDigest = digestOf(manifest.gates);
  resultBody.artifacts.roundGates.sha256 = sha256File(manifestPath);
  resultBody.artifacts.roundGates.size = fs.statSync(manifestPath).size;
  writeJson(semantic.resultPath, resultBody);
  const result = orch.validateStageResult({
    stage: 'POSITIVE',
    resultPath: semantic.resultPath,
    campaignId: options.campaignId,
    chainId: options.chainId,
    expectedSha: options.expectedSha,
    expectedWordVersion: options.expectedWordVersion,
    expectedWordBuild: options.expectedWordBuild,
    stageStartedAtMs: Date.now() - 1000,
    requiredOutputKeys: ['ledger', 'roundGates'],
    expectedCampaignRoot: options.campaignRoot,
    expectedStageRoot: semantic.runRoot,
    expectedCorpusDigest: options.expectedCorpusDigest,
    expectedLedgerDigest: semantic.ledgerDigest,
    expectedOperationIdSetDigest: options.expectedOperationIdSetDigest,
  });
  assert.equal(result.ok, false);
  assert.match(result.code, /ORCH_STAGE_RESULT_ROUND_GATE_(SOURCE|RETURNED)_DOCX_DOCX_PACKAGE/u);
});

leaseTest('ORCH_TEST_15K: semantic verifier rejects valid minimal DOCX with forged self-rehashed oracle evidence', async () => {
  const orch = await loadOrchestrator();
  const options = validOptions();
  fs.mkdirSync(options.campaignRoot, { recursive: true });
  const semantic = makeSemanticStageResult({ options, stage: 'POSITIVE' });
  const resultBody = JSON.parse(fs.readFileSync(semantic.resultPath, 'utf8'));
  const manifestPath = resultBody.artifacts.roundGates.path;
  const gates = rewriteRoundGatesToCoherentMinimalDocxForgery({
    runRoot: semantic.runRoot,
    roundGatesPath: manifestPath,
  });
  resultBody.stageData.roundInventoryDigest = digestOf(gates);
  resultBody.artifacts.roundGates.sha256 = sha256File(manifestPath);
  resultBody.artifacts.roundGates.size = fs.statSync(manifestPath).size;
  writeJson(semantic.resultPath, resultBody);
  const result = orch.validateStageResult({
    stage: 'POSITIVE',
    resultPath: semantic.resultPath,
    campaignId: options.campaignId,
    chainId: options.chainId,
    expectedSha: options.expectedSha,
    expectedWordVersion: options.expectedWordVersion,
    expectedWordBuild: options.expectedWordBuild,
    stageStartedAtMs: Date.now() - 1000,
    requiredOutputKeys: ['ledger', 'roundGates'],
    expectedCampaignRoot: options.campaignRoot,
    expectedStageRoot: semantic.runRoot,
    expectedCorpusDigest: options.expectedCorpusDigest,
    expectedLedgerDigest: semantic.ledgerDigest,
    expectedOperationIdSetDigest: options.expectedOperationIdSetDigest,
  });
  assert.equal(result.ok, false);
  assert.match(result.code, /ORCH_STAGE_RESULT_ROUND_GATE_ORACLE_RECOMPUTE|ORCH_STAGE_RESULT_ROUND_GATE_ORACLE_ROW/u);
});

leaseTest('ORCH_TEST_15I: deep round oracle rejects single-field artifact path hash roster and cumulative mutations', async () => {
  const orch = await loadOrchestrator();
  const cases = [
    {
      label: 'path',
      regex: /ORCH_STAGE_RESULT_ROUND_GATE_WORD_OUTPUT_OUTSIDE_ROOT/u,
      mutate: ({ gateJson }) => {
        const outsidePath = path.join(tmpDir('c5v2-round-offroot-word-output-'), 'word-output.txt');
        fs.writeFileSync(outsidePath, 'WORD_STATUS=PASS\n', 'utf8');
        gateJson.completedRoundReuseBinding.wordOutputPath = outsidePath;
        gateJson.completedRoundReuseBinding.wordOutputSha256 = sha256File(outsidePath);
      },
    },
    {
      label: 'hash',
      regex: /ORCH_STAGE_RESULT_ROUND_GATE_RETURNED_DOCX_HASH/u,
      mutate: ({ gateJson }) => {
        gateJson.completedRoundReuseBinding.returnedDocxSha256 = 'sha256:' + '0'.repeat(64);
      },
    },
    {
      label: 'artifact-content',
      regex: /ORCH_STAGE_RESULT_ROUND_GATE_ORACLE_ROW/u,
      mutate: ({ gateJson }) => {
        const oraclePath = gateJson.completedRoundReuseBinding.completeRoundOraclePath;
        const oracle = JSON.parse(fs.readFileSync(oraclePath, 'utf8'));
        oracle.operationResults[0].wordGreen = false;
        oracle.oracleDigest = digestOf(oracle.operationResults);
        writeJson(oraclePath, oracle);
        gateJson.oracleDigest = oracle.oracleDigest;
        gateJson.completedRoundReuseBinding.completeRoundOracleSha256 = sha256File(oraclePath);
      },
    },
    {
      label: 'round-roster',
      regex: /ORCH_STAGE_RESULT_ROUND_GATE_ROSTER/u,
      mutate: ({ gate, gateJson }) => {
        gateJson.roundOperationIds = gateJson.roundOperationIds.slice(1);
        gateJson.roundOperationCount = gateJson.roundOperationIds.length;
        gateJson.roundOperationIdsDigest = digestOf(gateJson.roundOperationIds);
        gate.roundOperationCount = gateJson.roundOperationCount;
        gate.roundOperationIdsDigest = gateJson.roundOperationIdsDigest;
      },
    },
    {
      label: 'cumulative-total',
      regex: /ORCH_STAGE_RESULT_ROUND_GATE_CUMULATIVE/u,
      mutate: ({ gate, gateJson }) => {
        gateJson.cumulativeOperationCount += 1;
        gate.cumulativeOperationCount += 1;
      },
    },
  ];
  for (const testCase of cases) {
    const options = validOptions({ campaignId: `deep-proof-${testCase.label}` });
    fs.mkdirSync(options.campaignRoot, { recursive: true });
    const semantic = makeSemanticStageResult({ options, stage: 'POSITIVE' });
    const resultBody = JSON.parse(fs.readFileSync(semantic.resultPath, 'utf8'));
    const manifestPath = resultBody.artifacts.roundGates.path;
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    const gate = manifest.gates[0];
    const gateJson = JSON.parse(fs.readFileSync(gate.path, 'utf8'));
    testCase.mutate({ gate, gateJson, manifest, semantic });
    const reuse = { ...gateJson.completedRoundReuseBinding };
    delete reuse.bindingDigest;
    gateJson.completedRoundReuseBinding = { ...reuse, bindingDigest: digestOf(reuse) };
    writeJson(gate.path, gateJson);
    gate.sha256 = sha256File(gate.path);
    writeJson(manifestPath, manifest);
    resultBody.stageData.roundInventoryDigest = digestOf(manifest.gates);
    resultBody.artifacts.roundGates.sha256 = sha256File(manifestPath);
    resultBody.artifacts.roundGates.size = fs.statSync(manifestPath).size;
    writeJson(semantic.resultPath, resultBody);
    const result = orch.validateStageResult({
      stage: 'POSITIVE',
      resultPath: semantic.resultPath,
      campaignId: options.campaignId,
      chainId: options.chainId,
      expectedSha: options.expectedSha,
      expectedWordVersion: options.expectedWordVersion,
      expectedWordBuild: options.expectedWordBuild,
      stageStartedAtMs: Date.now() - 1000,
      requiredOutputKeys: ['ledger', 'roundGates'],
      expectedCampaignRoot: options.campaignRoot,
      expectedStageRoot: semantic.runRoot,
      expectedCorpusDigest: options.expectedCorpusDigest,
      expectedLedgerDigest: semantic.ledgerDigest,
      expectedOperationIdSetDigest: options.expectedOperationIdSetDigest,
    });
    assert.equal(result.ok, false, testCase.label);
    assert.match(result.code, testCase.regex, testCase.label);
  }
});

function makeStubExecutor({ options, plan = {} }) {
  return async ({ stage }) => {
    if (plan[stage] && plan[stage].fail) return plan[stage].fail;
    if (stage === 'AGGREGATE') {
      const positiveSealPath = path.join(options.campaignRoot, 'ORCHESTRATOR', 'positive-stage-seal.json');
      const negativeSealPath = path.join(options.campaignRoot, 'ORCHESTRATOR', 'negative-stage-seal.json');
      const positiveResultPath = path.join(options.campaignRoot, 'ORCHESTRATOR', 'positive-stage-result.json');
      const negativeResultPath = path.join(options.campaignRoot, 'ORCHESTRATOR', 'negative-stage-result.json');
      const positiveSeal = JSON.parse(fs.readFileSync(positiveSealPath, 'utf8'));
      const negativeSeal = JSON.parse(fs.readFileSync(negativeSealPath, 'utf8'));
      const positiveResult = JSON.parse(fs.readFileSync(positiveResultPath, 'utf8'));
      const negativeResult = JSON.parse(fs.readFileSync(negativeResultPath, 'utf8'));
      makeSemanticStageResult({
        options: {
          ...options,
          expectedPositiveSealDigest: positiveSeal.sealDigest,
          expectedNegativeSealDigest: negativeSeal.sealDigest,
          expectedRoundInventoryDigest: positiveResult.stageData.roundInventoryDigest,
          expectedNegativeEvidenceDigest: negativeResult.stageData.evidenceContentDigest,
          expectedNegativeEvidencePath: negativeResult.stageData.evidencePath,
        },
        stage,
      });
    } else {
      makeSemanticStageResult({ options, stage });
    }
    return { ok: true, code: 'STUB_GREEN', exitCode: 0, signal: null, survivingDescendants: [] };
  };
}

function makePortfolioManifestForTest(orch, portfolioId, root) {
  const ledger = makeSemanticLedger();
  const corpusManifestPath = makeCorpusManifestFileForTest();
  return orch.buildTerminalPortfolioManifest({
    portfolioId,
    artifactRoot: root,
    expectedSha: 'a'.repeat(40),
    expectedWordVersion: '16.111.3',
    expectedWordBuild: '16.111.26080215',
    corpusDigest: 'sha256:' + 'b'.repeat(64),
    corpusManifestPath,
    masterLedgerDigest: ledger.ledgerDigest,
    operationIdSetDigest: ledger.operationIdSetDigest,
    scriptHashes: canonicalScriptHashes(),
    campaignProfile: 'C5V2_DORIAN_TERMINAL',
  });
}

function rehashPortfolioManifest(manifest) {
  const body = JSON.parse(JSON.stringify(manifest));
  delete body.manifestDigest;
  return { ...body, manifestDigest: digestOf(body) };
}

function greenSecureVolumeProbe({ artifactRoot }) {
  return {
    ok: true,
    code: 'ORCH_SECURE_VOLUME_VERIFIED',
    artifactRootCanonical: fs.existsSync(artifactRoot) ? fs.realpathSync(artifactRoot) : path.resolve(artifactRoot),
    mountRoot: '/Volumes/T7-Secure',
    mountRealpath: '/Volumes/T7-Secure',
    uuid: 'D1F2E2C1-3210-4A39-A4E0-0AA0AD5110E2',
    apfs: true,
    encrypted: true,
    writable: true,
    availableKb: 1024 * 1024,
  };
}

async function runSemanticPortfolioChain({ orch, chain, manifest, parentLockApi = null }) {
  const options = validOptions({
    artifactRoot: manifest.artifactRoot,
    campaignId: chain.campaignId,
    chainId: chain.chainId,
    expectedSha: manifest.expectedSha,
    expectedWordVersion: manifest.expectedWordVersion,
    expectedWordBuild: manifest.expectedWordBuild,
    expectedCorpusDigest: manifest.corpusDigest,
    corpusManifestPath: manifest.corpusManifestPath,
    expectedLedgerDigest: manifest.masterLedgerDigest,
    expectedOperationIdSetDigest: manifest.operationIdSetDigest,
    campaignProfile: manifest.campaignProfile,
  });
  options.campaignRoot = chain.campaignRoot;
  const outcome = await orch.runSingleChainOrchestrator({
    options,
    stageExecutor: makeStubExecutor({ options }),
    preflightHook: () => ({ ok: true, code: 'HOOK_GREEN', scriptHashes: manifest.scriptHashes }),
    lockApi: parentLockApi,
  });
  return { ok: outcome.ok, code: outcome.failure?.code || outcome.state, chainSealDigest: outcome.chainSeal?.chainSealDigest || '' };
}

leaseTest('ORCH_TEST_16: full stubbed chain seals all stages in order, releases lock, writes journal and chain seal', async () => {
  const orch = await loadOrchestrator();
  const options = validOptions();
  const outcome = await orch.runSingleChainOrchestrator({
    options,
    stageExecutor: makeStubExecutor({ options }),
    preflightHook: () => ({ ok: true, code: 'HOOK_GREEN', scriptHashes: canonicalScriptHashes() }),
  });
  assert.equal(outcome.ok, true, JSON.stringify(outcome.failure));
  assert.equal(outcome.state, 'CHAIN_SEALED');
  assert.deepEqual(outcome.stageSeals.map((entry) => entry.stage), ['POSITIVE', 'NEGATIVE', 'AGGREGATE']);
  assert.ok(outcome.chainSeal && outcome.chainSeal.chainSealDigest.startsWith('sha256:'));
  assert.ok(fs.existsSync(path.join(options.campaignRoot, 'ORCHESTRATOR', 'chain-seal.json')));
  assert.ok(fs.existsSync(path.join(options.campaignRoot, 'ORCHESTRATOR', 'chain-closeout-prepared.json')));
  assert.ok(fs.existsSync(path.join(options.campaignRoot, 'ORCHESTRATOR', 'chain-lock-release-proof.json')));
  assert.ok(fs.existsSync(path.join(options.campaignRoot, 'ORCHESTRATOR', 'chain-journal.jsonl')));
  const journal = fs.readFileSync(path.join(options.campaignRoot, 'ORCHESTRATOR', 'chain-journal.jsonl'), 'utf8').trim().split('\n').map((line) => JSON.parse(line));
  assert.deepEqual(journal.map((entry) => entry.transition), [
    'PREFLIGHT_GREEN', 'LOCKED', 'POSITIVE_RUNNING', 'POSITIVE_SEALED',
    'NEGATIVE_RUNNING', 'NEGATIVE_SEALED', 'AGGREGATE_RUNNING', 'AGGREGATE_SEALED',
    'CHAIN_CLOSEOUT_PREPARED', 'CHAIN_SEALED',
  ]);
  for (let index = 1; index < journal.length; index += 1) {
    assert.equal(journal[index].previousDigest, journal[index - 1].digest);
  }
  const positiveSeal = JSON.parse(fs.readFileSync(path.join(options.campaignRoot, 'ORCHESTRATOR', 'positive-stage-seal.json'), 'utf8'));
  const negativeSeal = JSON.parse(fs.readFileSync(path.join(options.campaignRoot, 'ORCHESTRATOR', 'negative-stage-seal.json'), 'utf8'));
  assert.equal(negativeSeal.previousSealDigest, positiveSeal.sealDigest);
  assert.ok(!fs.existsSync(path.join(options.artifactRoot, '.orchestrator-locks', 'c5v2-word-campaign.lock')));
});

leaseTest('ORCH_TEST_17: failing POSITIVE never starts NEGATIVE and AGGREGATE; failing NEGATIVE never starts AGGREGATE', async () => {
  const orch = await loadOrchestrator();
  const optionsA = validOptions();
  let executedStagesA = 0;
  const outcomeA = await orch.runSingleChainOrchestrator({
    options: optionsA,
    stageExecutor: async ({ stage }) => {
      executedStagesA += 1;
      if (stage === 'POSITIVE') return { ok: false, code: 'ORCH_CHILD_EXIT_NONZERO:1:none', exitCode: 1, signal: null, survivingDescendants: [] };
      return { ok: true, code: 'STUB', exitCode: 0, signal: null, survivingDescendants: [] };
    },
    preflightHook: () => ({ ok: true, code: 'HOOK_GREEN', scriptHashes: canonicalScriptHashes() }),
  });
  assert.equal(outcomeA.ok, false);
  assert.equal(outcomeA.state, 'FAILED');
  assert.equal(executedStagesA, 1);
  assert.ok(fs.existsSync(path.join(optionsA.campaignRoot, 'FAILURE', 'failure-markers.jsonl')));
  assert.ok(!fs.existsSync(path.join(optionsA.artifactRoot, '.orchestrator-locks', 'c5v2-word-campaign.lock')));
  const optionsB = validOptions();
  let executedStagesB = 0;
  const outcomeB = await orch.runSingleChainOrchestrator({
    options: optionsB,
    stageExecutor: async ({ stage }) => {
      executedStagesB += 1;
      if (stage === 'NEGATIVE') return { ok: false, code: 'ORCH_CHILD_EXIT_NONZERO:2:none', exitCode: 2, signal: null, survivingDescendants: [] };
      makeSemanticStageResult({ options: optionsB, stage });
      return { ok: true, code: 'STUB', exitCode: 0, signal: null, survivingDescendants: [] };
    },
    preflightHook: () => ({ ok: true, code: 'HOOK_GREEN', scriptHashes: canonicalScriptHashes() }),
  });
  assert.equal(outcomeB.ok, false);
  assert.equal(executedStagesB, 2);
  assert.equal(outcomeB.stageSeals.length, 1);
});

leaseTest('ORCH_TEST_18: preflight failure before a stage stops the chain before any spawn for that stage', async () => {
  const orch = await loadOrchestrator();
  const options = validOptions();
  let spawned = 0;
  const outcome = await orch.runSingleChainOrchestrator({
    options,
    stageExecutor: async () => { spawned += 1; return { ok: true, code: 'STUB', exitCode: 0, signal: null, survivingDescendants: [] }; },
    preflightHook: (scope) => (scope === 'BEFORE_POSITIVE'
      ? { ok: false, code: 'ORCH_EXPECTED_SHA_MISMATCH:x:y', scriptHashes: canonicalScriptHashes() }
      : { ok: true, code: 'HOOK_GREEN', scriptHashes: canonicalScriptHashes() }),
  });
  assert.equal(outcome.ok, false);
  assert.equal(spawned, 0);
  assert.match(outcome.failure.code, /ORCH_EXPECTED_SHA_MISMATCH/u);
});

leaseTest('ORCH_TEST_19: quarantined stage result keeps the lock with QUARANTINED marker', async () => {
  const orch = await loadOrchestrator();
  const options = validOptions();
  const outcome = await orch.runSingleChainOrchestrator({
    options,
    stageExecutor: async () => ({ ok: false, code: 'ORCH_OWNED_DESCENDANTS_SURVIVED:4242', quarantined: true, survivingDescendants: [4242], exitCode: null, signal: 'SIGKILL' }),
    preflightHook: () => ({ ok: true, code: 'HOOK_GREEN', scriptHashes: canonicalScriptHashes() }),
  });
  assert.equal(outcome.ok, false);
  assert.equal(outcome.state, 'QUARANTINED');
  const lockDir = path.join(options.artifactRoot, '.orchestrator-locks', 'c5v2-word-campaign.lock');
  assert.ok(fs.existsSync(lockDir));
  assert.ok(fs.existsSync(path.join(lockDir, 'QUARANTINED.json')));
});

leaseTest('ORCH_TEST_19A: actual emitted quarantine codes keep tokenized lock through finally', async () => {
  const orch = await loadOrchestrator();
  const options = validOptions();
  const outcome = await orch.runSingleChainOrchestrator({
    options,
    stageExecutor: async () => ({
      ok: false,
      code: 'ORCH_OWNED_PROCESSES_SURVIVED:4242',
      quarantined: true,
      survivingOwnedPids: [4242],
      survivingDescendants: [4242],
      exitCode: null,
      signal: 'SIGKILL',
    }),
    preflightHook: () => ({ ok: true, code: 'HOOK_GREEN', scriptHashes: canonicalScriptHashes() }),
  });
  assert.equal(outcome.ok, false);
  assert.equal(outcome.state, 'QUARANTINED');
  const lockDir = path.join(options.artifactRoot, '.orchestrator-locks', 'c5v2-word-campaign.lock');
  assert.ok(fs.existsSync(lockDir), JSON.stringify(outcome));
  assert.ok(fs.existsSync(path.join(lockDir, 'owner.json')));
  assert.ok(fs.existsSync(path.join(lockDir, 'QUARANTINED.json')));
});

leaseTest('ORCH_TEST_19B: orchestrator owns control dirs only; canary owns fresh stage dirs', async () => {
  const orch = await loadOrchestrator();
  const options = validOptions();
  const seen = [];
  const outcome = await orch.runSingleChainOrchestrator({
    options,
    stageExecutor: async ({ stage }) => {
      const command = orch.buildOrchestratedStageCommand({
        stage,
        campaignRoot: options.campaignRoot,
        campaignId: options.campaignId,
        chainId: options.chainId,
        options,
        inputs: stage === 'NEGATIVE'
          ? { ledgerPath: path.join(options.campaignRoot, 'MAIN', 'c5v2-master-ledger.json') }
          : stage === 'AGGREGATE'
            ? { mainRunDir: path.join(options.campaignRoot, 'MAIN'), negativeEvidencePath: path.join(options.campaignRoot, 'NEGATIVE', 'negative-campaign-evidence.json') }
            : {},
      });
      seen.push({ stage, stageRoot: command.stageRoot, existedBeforeStage: fs.existsSync(command.stageRoot), args: command.args });
      if (stage === 'POSITIVE') {
        assert.equal(fs.existsSync(path.join(options.campaignRoot, 'MAIN')), false);
        assert.equal(command.args[command.args.indexOf('--artifact-root') + 1], options.campaignRoot);
      }
      if (stage === 'NEGATIVE') {
        assert.equal(fs.existsSync(path.join(options.campaignRoot, 'NEGATIVE')), false);
        assert.equal(command.args[command.args.indexOf('--artifact-root') + 1], options.campaignRoot);
      }
      if (stage === 'AGGREGATE') {
        const positiveSeal = JSON.parse(fs.readFileSync(path.join(options.campaignRoot, 'ORCHESTRATOR', 'positive-stage-seal.json'), 'utf8'));
        const negativeSeal = JSON.parse(fs.readFileSync(path.join(options.campaignRoot, 'ORCHESTRATOR', 'negative-stage-seal.json'), 'utf8'));
        const positiveResult = JSON.parse(fs.readFileSync(path.join(options.campaignRoot, 'ORCHESTRATOR', 'positive-stage-result.json'), 'utf8'));
        const negativeResult = JSON.parse(fs.readFileSync(path.join(options.campaignRoot, 'ORCHESTRATOR', 'negative-stage-result.json'), 'utf8'));
        makeSemanticStageResult({
          options: {
            ...options,
            expectedPositiveSealDigest: positiveSeal.sealDigest,
            expectedNegativeSealDigest: negativeSeal.sealDigest,
            expectedRoundInventoryDigest: positiveResult.stageData.roundInventoryDigest,
            expectedNegativeEvidenceDigest: negativeResult.stageData.evidenceContentDigest,
            expectedNegativeEvidencePath: negativeResult.stageData.evidencePath,
          },
          stage,
        });
      } else {
        makeSemanticStageResult({ options, stage });
      }
      return { ok: true, code: 'STUB_GREEN', exitCode: 0, signal: null, survivingDescendants: [], survivingOwnedPids: [] };
    },
    preflightHook: () => ({ ok: true, code: 'HOOK_GREEN', scriptHashes: canonicalScriptHashes() }),
  });
  assert.equal(outcome.ok, true, JSON.stringify(outcome.failure));
  assert.deepEqual(seen.map((entry) => entry.stage), ['POSITIVE', 'NEGATIVE', 'AGGREGATE']);
});

leaseTest('ORCH_TEST_20: pre-existing campaign root is a collision STOP and stale green directory is ignored', async () => {
  const orch = await loadOrchestrator();
  const options = validOptions();
  fs.mkdirSync(path.join(options.campaignRoot, 'ORCHESTRATOR'), { recursive: true });
  writeJson(path.join(options.campaignRoot, 'ORCHESTRATOR', 'chain-seal.json'), { fake: 'stale-green' });
  const outcome = await orch.runSingleChainOrchestrator({
    options,
    stageExecutor: makeStubExecutor({ options }),
    preflightHook: () => ({ ok: true, code: 'HOOK_GREEN', scriptHashes: canonicalScriptHashes() }),
  });
  assert.equal(outcome.ok, false);
  assert.match(outcome.failure.code, /ORCH_CAMPAIGN_ROOT_COLLISION/u);
  assert.equal(outcome.state, 'FAILED');
});

leaseTest('ORCH_TEST_21: explicit test-only preflight injection writes no chain seal but seals all stages', async () => {
  const orch = await loadOrchestrator();
  const options = validOptions();
  const outcome = await orch.runSingleChainOrchestrator({
    options,
    stageExecutor: makeStubExecutor({ options }),
    testPreflightBypass: true,
  });
  assert.equal(outcome.ok, true);
  assert.equal(outcome.state, 'BYPASSED_NO_CHAIN_SEAL');
  assert.equal(outcome.stageSeals.length, 3);
  assert.ok(!fs.existsSync(path.join(options.campaignRoot, 'ORCHESTRATOR', 'chain-seal.json')));
  assert.equal(outcome.bypassMarker, 'ORCH_TEST_PREFLIGHT_BYPASS_NO_CHAIN_SEAL');
});

function writeFakeRunner(dir) {
  const runnerPath = path.join(dir, 'fake-runner.cjs');
  const script = `
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const args = process.argv.slice(2);
const get = (flag) => { const i = args.indexOf(flag); return i === -1 ? '' : args[i + 1]; };
const stage = get('--orchestrated-stage');
const runDir = get('--run-dir');
const resultPath = get('--stage-result-path');
const heartbeatPath = get('--heartbeat-path');
const campaignId = get('--campaign-id');
const chainId = get('--chain-id');
const sha = (p) => 'sha256:' + crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const writeJson = (p, v) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, JSON.stringify(v, null, 2) + '\\n'); };
fs.appendFileSync(runDir + '.argv.json', JSON.stringify({ stage, argv: args }) + '\\n');
let sequence = 0;
const hb = (phase) => {
  sequence += 1;
  fs.mkdirSync(path.dirname(heartbeatPath), { recursive: true });
  fs.appendFileSync(heartbeatPath, JSON.stringify({
    schemaVersion: 'yalken.rtk.word.c5v2.orchestrated-heartbeat.v1',
    campaignId, chainId, stage, sequence, phase, atUtc: new Date().toISOString(),
    detail: { completedCount: sequence, lastOperationId: phase },
  }) + '\\n');
};
hb('fake-start');
fs.mkdirSync(runDir, { recursive: true });
const result = {
  schemaVersion: 'yalken.rtk.word.c5v2.orchestrated-stage-result.v1',
  stage,
  status: 'SEALED',
  campaignId,
  chainId,
  headSha: get('--expected-sha'),
  originMainSha: get('--expected-sha'),
  wordVersion: get('--expected-word-version'),
  wordBuild: get('--expected-word-build'),
  startedAtUtc: new Date().toISOString(),
  finishedAtUtc: new Date().toISOString(),
  sequence,
  stageData: {},
  artifacts: {},
  counters: {},
};
if (stage === 'POSITIVE') {
  const ledgerPath = path.join(runDir, 'c5v2-master-ledger.json');
  writeJson(ledgerPath, { fake: 'ledger' });
  const gatesPath = path.join(runDir, 'orchestrated-round-gates-manifest.json');
  writeJson(gatesPath, { fake: 'gates' });
  result.stageData = { mainRunDir: runDir, ledgerPath };
  result.artifacts = {
    ledger: { path: ledgerPath, sha256: sha(ledgerPath), size: fs.statSync(ledgerPath).size },
    roundGates: { path: gatesPath, sha256: sha(gatesPath), size: fs.statSync(gatesPath).size },
  };
  result.counters = { operationCount: 1960, roundGreen: true };
} else if (stage === 'NEGATIVE') {
  const evidencePath = path.join(runDir, 'negative-campaign-evidence.json');
  writeJson(evidencePath, { fake: 'evidence', ledger: get('--negative-campaign-ledger') });
  result.stageData = { evidencePath };
  result.artifacts = { evidence: { path: evidencePath, sha256: sha(evidencePath), size: fs.statSync(evidencePath).size } };
  result.counters = { operationCount: 40, rejectedCount: 40, failedCount: 0, green: true };
} else {
  const aggregatePath = path.join(get('--resume-run-dir'), 'terminal-operation-aggregate.json');
  writeJson(aggregatePath, { fake: 'aggregate', evidence: get('--negative-aggregate-evidence') });
  result.stageData = { mainRunDir: get('--resume-run-dir'), negativeEvidencePath: get('--negative-aggregate-evidence') };
  result.artifacts = { terminalAggregate: { path: aggregatePath, sha256: sha(aggregatePath), size: fs.statSync(aggregatePath).size } };
  result.counters = { operationCount: 2000, positiveTotal: 1960, negativeTotal: 40, aggregateGreen: true };
}
hb('fake-finish');
writeJson(resultPath, result);
process.exit(0);
`;
  fs.writeFileSync(runnerPath, script, 'utf8');
  return runnerPath;
}

leaseTest('ORCH_TEST_22: production CLI rejects ambient test bypass and runner replacement before writes', async () => {
  const dir = tmpDir('c5v2-orch-cli-');
  const artifactRoot = path.join(dir, 'artifacts');
  fs.mkdirSync(artifactRoot, { recursive: true });
  const fakeRunner = writeFakeRunner(dir);
  const campaignId = 'cli-chain-test';
  const head = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: REPO_ROOT, encoding: 'utf8' }).stdout.trim();
  const env = {
    ...process.env,
    ORCH_TEST_PREFLIGHT_BYPASS: '1',
    ORCH_CANARY_RUNNER_PATH: fakeRunner,
  };
  const run = spawnSync(process.execPath, [
    ORCH_PATH,
    '--expected-sha', head,
    '--expected-word-version', '16.111.2',
    '--expected-word-build', '16.111.26072617',
    '--artifact-root', artifactRoot,
    '--campaign-id', campaignId,
    '--chain-id', 'W06',
  ], { encoding: 'utf8', timeout: 60000, env });
  assert.equal(run.status, 1);
  assert.match(`${run.stdout}\n${run.stderr}`, /ORCH_PRODUCTION_ENV_BYPASS_REJECTED/u);
  assert.equal(fs.existsSync(path.join(artifactRoot, campaignId)), false);
});

leaseTest('ORCH_TEST_23: controller refuses pre-existing campaign root with collision before spawn', async () => {
  const orch = await loadOrchestrator();
  const options = validOptions({ campaignId: 'cli-collision-test' });
  fs.mkdirSync(options.campaignRoot, { recursive: true });
  let spawned = 0;
  const outcome = await orch.runSingleChainOrchestrator({
    options,
    stageExecutor: async () => { spawned += 1; return { ok: true, code: 'SHOULD_NOT_RUN' }; },
    testPreflightBypass: true,
  });
  assert.equal(outcome.ok, false);
  assert.match(outcome.failure.code, /ORCH_CAMPAIGN_ROOT_COLLISION/u);
  assert.equal(spawned, 0);
});

function snapshotTree(root) {
  if (!fs.existsSync(root)) return [];
  const out = [];
  const stack = [root];
  while (stack.length > 0) {
    const current = stack.pop();
    const stat = fs.lstatSync(current);
    out.push(path.relative(root, current) || '.');
    if (stat.isDirectory() && !stat.isSymbolicLink()) {
      for (const entry of fs.readdirSync(current)) stack.push(path.join(current, entry));
    }
  }
  return out.sort();
}

leaseTest('ORCH_TEST_24: pre-authority failures and resume rejection write nothing', async () => {
  const orch = await loadOrchestrator();
  const root = tmpDir('c5v2-orch-zero-write-');
  const options = validOptions({ artifactRoot: path.join(root, 'artifacts'), campaignId: 'zero-write' });
  options.campaignRoot = path.join(options.artifactRoot, options.campaignId);

  const preflightFailure = await orch.runSingleChainOrchestrator({
    options,
    preflightHook: () => ({ ok: false, code: 'ORCH_SYNTHETIC_PREFLIGHT_FAIL' }),
    stageExecutor: async () => { throw new Error('must not spawn'); },
  });
  assert.equal(preflightFailure.ok, false);
  assert.equal(fs.existsSync(options.artifactRoot), false);

  fs.mkdirSync(options.artifactRoot, { recursive: true });
  const before = snapshotTree(options.artifactRoot);
  const collisionRoot = path.join(options.artifactRoot, options.campaignId);
  fs.mkdirSync(collisionRoot, { recursive: true });
  fs.writeFileSync(path.join(collisionRoot, 'preexisting.txt'), 'keep\n', 'utf8');
  const beforeCollision = snapshotTree(options.artifactRoot);
  const collision = await orch.runSingleChainOrchestrator({
    options,
    testPreflightBypass: true,
    stageExecutor: async () => { throw new Error('must not spawn'); },
  });
  assert.equal(collision.ok, false);
  assert.match(collision.failure.code, /ORCH_CAMPAIGN_ROOT_COLLISION/u);
  assert.deepEqual(snapshotTree(options.artifactRoot), beforeCollision);

  const resumeRoot = path.join(root, 'resume-artifacts');
  const resumeOptions = validOptions({ artifactRoot: resumeRoot, campaignId: 'resume-stop', resume: true });
  resumeOptions.campaignRoot = path.join(resumeRoot, resumeOptions.campaignId);
  const resume = await orch.runSingleChainOrchestrator({
    options: resumeOptions,
    testPreflightBypass: true,
    stageExecutor: async () => { throw new Error('must not spawn'); },
  });
  assert.equal(resume.ok, false);
  assert.match(resume.failure.code, /ORCH_RESUME_REJECTED_UNIMPLEMENTED/u);
  assert.equal(fs.existsSync(resumeRoot), false);
  assert.deepEqual(before, ['.']);

  const lockRoot = path.join(root, 'lock-loser-artifacts');
  fs.mkdirSync(lockRoot, { recursive: true });
  const lockOptions = validOptions({ artifactRoot: lockRoot, campaignId: 'lock-loser' });
  lockOptions.campaignRoot = path.join(lockRoot, lockOptions.campaignId);
  const beforeLock = snapshotTree(lockRoot);
  const lockLoser = await orch.runSingleChainOrchestrator({
    options: lockOptions,
    preflightHook: () => ({ ok: true, code: 'HOOK_GREEN', scriptHashes: canonicalScriptHashes() }),
    stageExecutor: async () => { throw new Error('must not spawn'); },
    lockApi: {
      acquire: () => ({ ok: false, code: 'ORCH_LOCK_HELD:123:other-campaign' }),
      release: () => { throw new Error('release must not be called'); },
    },
  });
  assert.equal(lockLoser.ok, false);
  assert.match(lockLoser.failure.code, /ORCH_LOCK_HELD/u);
  assert.deepEqual(snapshotTree(lockRoot), beforeLock);
});

leaseTest('ORCH_TEST_25: failed lock release prevents green chain seal outcome', async () => {
  const orch = await loadOrchestrator();
  const options = validOptions({ campaignId: 'lock-release-fail' });
  const outcome = await orch.runSingleChainOrchestrator({
    options,
    stageExecutor: makeStubExecutor({ options }),
    preflightHook: () => ({ ok: true, code: 'HOOK_GREEN', scriptHashes: canonicalScriptHashes() }),
    lockApi: {
      acquire: ({ lockRoot }) => {
        fs.mkdirSync(path.join(lockRoot, 'c5v2-word-campaign.lock'), { recursive: true });
        return { ok: true, code: 'ORCH_LOCK_ACQUIRED', lockDir: path.join(lockRoot, 'c5v2-word-campaign.lock'), ownershipToken: 'token' };
      },
      release: () => ({ released: false, code: 'ORCH_LOCK_RELEASE_TOKEN_MISMATCH' }),
    },
  });
  assert.equal(outcome.ok, false);
  assert.equal(outcome.state, 'LOCK_RELEASE_FAILED');
  assert.match(outcome.lockOutcome, /ORCH_LOCK_RELEASE_TOKEN_MISMATCH/u);
  assert.equal(fs.existsSync(path.join(options.campaignRoot, 'ORCHESTRATOR', 'chain-seal.json')), false);
  const journal = fs.readFileSync(path.join(options.campaignRoot, 'ORCHESTRATOR', 'chain-journal.jsonl'), 'utf8').trim().split('\n').map((line) => JSON.parse(line));
  assert.equal(journal.at(-1).transition, 'LOCK_RELEASE_FAILED');
  assert.equal(journal.some((entry) => entry.transition === 'CHAIN_SEALED'), false);
});

leaseTest('ORCH_TEST_26: production CLI rejects resume before writes', async () => {
  const dir = tmpDir('c5v2-orch-resume-cli-');
  const artifactRoot = path.join(dir, 'artifacts');
  const head = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: REPO_ROOT, encoding: 'utf8' }).stdout.trim();
  const run = spawnSync(process.execPath, [
    ORCH_PATH,
    '--expected-sha', head,
    '--expected-word-version', '16.111.3',
    '--expected-word-build', '16.111.26080215',
    '--expected-corpus-digest', 'sha256:' + 'b'.repeat(64),
    '--expected-ledger-digest', makeSemanticLedger().ledgerDigest,
    '--expected-operation-id-set-digest', makeSemanticLedger().operationIdSetDigest,
    '--campaign-profile', 'C5V2_DORIAN_TERMINAL',
    '--artifact-root', artifactRoot,
    '--campaign-id', 'resume-cli',
    '--chain-id', 'W06',
    '--resume',
  ], { encoding: 'utf8', timeout: 60000 });
  assert.equal(run.status, 1);
  assert.match(run.stdout, /ORCH_RESUME_REJECTED_UNIMPLEMENTED/u);
  assert.equal(fs.existsSync(artifactRoot), false);
});

leaseTest('CANARY_PROTOCOL_1: orchestrated args validation rejects unknown, duplicate, missing and invalid stage', async () => {
  const canary = await loadCanary();
  const root = '/tmp/c5v2-canary-proto';
  const base = {
    orchestratedStage: 'POSITIVE',
    artifactRoot: root,
    explicitRunDir: path.join(root, 'run'),
    stageResultPath: path.join(root, 'ORCHESTRATOR', 'result.json'),
    heartbeatPath: path.join(root, 'ORCHESTRATOR', 'hb.jsonl'),
    campaignId: 'camp',
    chainId: 'W06',
    expectedSha: 'a'.repeat(40),
    expectedWordVersion: '16.111.2',
    expectedWordBuild: '16.111.26072617',
    expectedCorpusDigest: 'sha256:' + 'c'.repeat(64),
  };
  assert.equal(canary.validateC5V2OrchestratedArgs(base, ['--orchestrated-stage', 'POSITIVE']).ok, true);
  assert.match(canary.validateC5V2OrchestratedArgs(base, ['--bogus']).code, /ORCH_CANARY_UNKNOWN_ARG/u);
  assert.match(canary.validateC5V2OrchestratedArgs(base, ['--run-dir', '--run-dir']).code, /ORCH_CANARY_DUPLICATE_ARG/u);
  assert.match(canary.validateC5V2OrchestratedArgs({ ...base, orchestratedStage: 'SIDEWAYS' }, []).code, /ORCH_CANARY_STAGE_INVALID/u);
  assert.match(canary.validateC5V2OrchestratedArgs({ ...base, stageResultPath: '' }, []).code, /ORCH_CANARY_ARG_REQUIRED:--stage-result-path/u);
  assert.match(canary.validateC5V2OrchestratedArgs({ ...base, chainId: 'REP9' }, []).code, /ORCH_CANARY_CHAIN_ID_INVALID/u);
  assert.match(canary.validateC5V2OrchestratedArgs({ ...base, campaignId: '../bad' }, []).code, /ORCH_CANARY_CAMPAIGN_ID_INVALID/u);
  assert.match(canary.validateC5V2OrchestratedArgs({ ...base, orchestratedStage: 'NEGATIVE', negativeCampaignLedgerPath: '' }, []).code, /ORCH_CANARY_ARG_REQUIRED:--negative-campaign-ledger/u);
  assert.match(canary.validateC5V2OrchestratedArgs({ ...base, orchestratedStage: 'AGGREGATE', resumeRunDir: '', negativeAggregateEvidencePath: '' }, []).code, /ORCH_CANARY_ARG_REQUIRED/u);
  assert.match(canary.validateC5V2OrchestratedArgs({
    ...base,
    stageResultPath: '/private/tmp/c5v2-canary-offroot/result.json',
  }, []).code, /ORCH_CANARY_PATH_OUTSIDE_ARTIFACT_ROOT|ORCH_CANARY_PATH_OUTSIDE_ORCHESTRATOR_ROOT/u);
  assert.match(canary.validateC5V2OrchestratedArgs({
    ...base,
    heartbeatPath: '/private/tmp/c5v2-canary-offroot/hb.jsonl',
  }, []).code, /ORCH_CANARY_PATH_OUTSIDE_ARTIFACT_ROOT|ORCH_CANARY_PATH_OUTSIDE_ORCHESTRATOR_ROOT/u);
  assert.equal(canary.validateC5V2OrchestratedArgs({ orchestratedStage: '' }, []).ok, true);
});

leaseTest('CANARY_PROTOCOL_2: orchestrated run identity uses exact directory without timestamp and rejects collision and escape', async () => {
  const canary = await loadCanary();
  const root = tmpDir('c5v2-canary-runid-');
  const identity = canary.resolveC5V2RunIdentity({
    artifactRoot: root,
    runPrefix: 'c5v2-test',
    explicitRunDir: path.join(root, 'exact-stage-dir'),
    diskInfoText: '',
  });
  assert.equal(identity.runId, 'exact-stage-dir');
  assert.equal(identity.runDir, path.join(fs.realpathSync(root), 'exact-stage-dir'));
  assert.equal(identity.orchestratedExplicit, true);
  assert.ok(fs.existsSync(identity.runDir));
  assert.throws(() => canary.resolveC5V2RunIdentity({
    artifactRoot: root,
    runPrefix: 'c5v2-test',
    explicitRunDir: path.join(root, 'exact-stage-dir'),
    diskInfoText: '',
  }), /ORCH_CANARY_RUN_DIR_COLLISION/u);
  assert.throws(() => canary.resolveC5V2RunIdentity({
    artifactRoot: root,
    runPrefix: 'c5v2-test',
    explicitRunDir: path.join(root, '..', 'escape-dir'),
    diskInfoText: '',
  }), /ORCH_CANARY_RUN_DIR_OUTSIDE_ARTIFACT_ROOT/u);
  const legacy = canary.resolveC5V2RunIdentity({ artifactRoot: root, runPrefix: 'c5v2-legacy', diskInfoText: '' });
  assert.notEqual(identity.runId, legacy.runId);
  assert.match(legacy.runId, /^c5v2-legacy-\d{8}T\d{6}Z$/u);
});

leaseTest('CANARY_PROTOCOL_3: Word plist reader accepts plutil raw keys and rejects defaults OpenStep as XML', async () => {
  const canary = await loadCanary();
  assert.equal(typeof canary.readC5V2WordPlistVersionAndBuild, 'function');
  const plistPath = path.join(tmpDir('c5v2-canary-plist-'), 'Info.plist');
  fs.writeFileSync(plistPath, '<plist><dict></dict></plist>', 'utf8');
  const openStep = `{
    BuildMachineOSBuild = 25A5279m;
    CFBundleShortVersionString = "16.111.3";
    CFBundleVersion = "16.111.26080215";
  }`;
  const rejected = canary.readC5V2WordPlistVersionAndBuild({
    wordPlistPath: plistPath,
    execFileSyncImpl: () => { throw new Error('plutil unavailable'); },
    fallbackText: openStep,
  });
  assert.equal(rejected.ok, false);
  assert.match(rejected.code, /WORD_PLIST_XML_FALLBACK_MALFORMED/u);

  let calls = 0;
  const green = canary.readC5V2WordPlistVersionAndBuild({
    wordPlistPath: plistPath,
    execFileSyncImpl: (_binary, args) => {
      calls += 1;
      return args.includes('CFBundleShortVersionString') ? '16.111.3\n' : '16.111.26080215\n';
    },
  });
  assert.equal(green.ok, true);
  assert.equal(green.wordVersion, '16.111.3');
  assert.equal(green.wordBuild, '16.111.26080215');
  assert.equal(calls, 2);
});

leaseTest('CANARY_PROTOCOL_4: negative probe heartbeats are emitted only after durable completion', async () => {
  const canary = await loadCanary();
  assert.equal(typeof canary.collectNegativeProbeCompletionHeartbeats, 'function');
  const events = [];
  const emit = (phase, detail) => events.push({ phase, detail });
  const progressEvents = [
    { phase: 'child-progress', step: 'negative-probe-start', detail: { id: 'neg-01' } },
    { phase: 'child-progress', step: 'negative-probe-complete', detail: { id: 'neg-01', checkpointPath: '/tmp/neg-01.json' } },
    { phase: 'child-progress', step: 'negative-probe-start', detail: { id: 'neg-02' } },
  ];
  const state = canary.collectNegativeProbeCompletionHeartbeats({
    progressEvents,
    emitHeartbeat: emit,
  });
  assert.equal(state.completedCount, 1);
  assert.deepEqual(events.map((event) => [event.phase, event.detail.completedCount, event.detail.lastOperationId]), [
    ['negative-probe', 1, 'neg-01'],
  ]);
});

leaseTest('CANARY_PROTOCOL_5: positive chunk heartbeat uses stage-global ordinal across round boundary', async () => {
  const canary = await loadCanary();
  assert.equal(typeof canary.createPositiveStageProgressTracker, 'function');
  const tracker = canary.createPositiveStageProgressTracker();
  const emitted = [];
  tracker.recordRoundChunk({
    roundIndex: 0,
    roundId: 'round-01',
    completedCount: 2,
    completedOperationIds: ['op-001', 'op-002'],
    emitHeartbeat: (detail) => emitted.push(detail),
  });
  tracker.finishRound({ roundIndex: 0, operationCount: 2 });
  tracker.recordRoundChunk({
    roundIndex: 1,
    roundId: 'round-02',
    completedCount: 1,
    completedOperationIds: ['op-003'],
    emitHeartbeat: (detail) => emitted.push(detail),
  });
  assert.deepEqual(emitted.map((event) => [event.completedCount, event.lastOperationId]), [
    [2, 'op-002'],
    [3, 'op-003'],
  ]);
});

leaseTest('ORCH_PORTFOLIO_1: dry-run portfolio binds W06 REP1 REP2 REP3 order, identity, resume and fail-fast', async () => {
  const orch = await loadOrchestrator();
  assert.equal(typeof orch.buildTerminalPortfolioManifest, 'function');
  assert.equal(typeof orch.runTerminalPortfolio, 'function');
  const makeManifest = (portfolioId, root) => {
    const ledger = makeSemanticLedger();
    const corpusManifestPath = makeCorpusManifestFileForTest();
    return orch.buildTerminalPortfolioManifest({
      portfolioId,
      artifactRoot: root,
      expectedSha: 'a'.repeat(40),
      expectedWordVersion: '16.111.3',
      expectedWordBuild: '16.111.26080215',
      corpusDigest: 'sha256:' + 'b'.repeat(64),
      corpusManifestPath,
      masterLedgerDigest: ledger.ledgerDigest,
      operationIdSetDigest: ledger.operationIdSetDigest,
      scriptHashes: canonicalScriptHashes(),
      campaignProfile: 'C5V2_DORIAN_TERMINAL',
    });
  };
  const runStubbedChain = async ({ chain, manifest, parentLockApi = null }) => {
    const options = validOptions({
      artifactRoot: manifest.artifactRoot,
      campaignId: chain.campaignId,
      chainId: chain.chainId,
      expectedSha: manifest.expectedSha,
      expectedWordVersion: manifest.expectedWordVersion,
      expectedWordBuild: manifest.expectedWordBuild,
      expectedCorpusDigest: manifest.corpusDigest,
      corpusManifestPath: manifest.corpusManifestPath,
      expectedLedgerDigest: manifest.masterLedgerDigest,
      expectedOperationIdSetDigest: manifest.operationIdSetDigest,
      campaignProfile: manifest.campaignProfile,
    });
    options.campaignRoot = chain.campaignRoot;
    const outcome = await orch.runSingleChainOrchestrator({
      options,
      stageExecutor: makeStubExecutor({ options }),
      preflightHook: () => ({ ok: true, code: 'HOOK_GREEN', scriptHashes: manifest.scriptHashes }),
      lockApi: parentLockApi,
    });
    return { ok: outcome.ok, code: outcome.failure?.code || outcome.state, chainSealDigest: outcome.chainSeal?.chainSealDigest || '' };
  };

  const root = tmpDir('c5v2-portfolio-');
  const manifest = makeManifest('portfolio-test', root);
  assert.deepEqual(manifest.chains.map((chain) => chain.chainId), ['W06', 'REP1', 'REP2', 'REP3']);
  assert.equal(new Set(manifest.chains.map((chain) => chain.campaignId)).size, 4);
  assert.equal(manifest.chains.every((chain) => chain.campaignRoot.startsWith(manifest.portfolioRoot + path.sep)), true);
  const executed = [];
  const green = await orch.runTerminalPortfolio({
    manifest,
    secureVolumeProbe: greenSecureVolumeProbe,
    chainExecutor: async ({ chain, parentLockApi }) => {
      executed.push(chain.chainId);
      return runStubbedChain({ chain, manifest, parentLockApi });
    },
  });
  assert.equal(green.ok, true, JSON.stringify(green));
  assert.deepEqual(executed, ['W06', 'REP1', 'REP2', 'REP3']);
  assert.equal(green.receipt.repetitionIdentity, 'REPETITION_IDENTITY');

  const failRoot = tmpDir('c5v2-portfolio-fail-');
  const failManifest = makeManifest('portfolio-fail', failRoot);
  executed.length = 0;
  const failFast = await orch.runTerminalPortfolio({
    manifest: failManifest,
    secureVolumeProbe: greenSecureVolumeProbe,
    chainExecutor: async ({ chain, parentLockApi }) => {
      executed.push(chain.chainId);
      return chain.chainId === 'REP1'
        ? { ok: false, code: 'REP1_FAILED' }
        : runStubbedChain({ chain, manifest: failManifest, parentLockApi });
    },
  });
  assert.equal(failFast.ok, false);
  assert.deepEqual(executed, ['W06', 'REP1']);

  const resumeRoot = tmpDir('c5v2-portfolio-resume-');
  const resumeManifest = makeManifest('portfolio-resume', resumeRoot);
  const w06 = resumeManifest.chains[0];
  const w06Seal = await runStubbedChain({ chain: w06, manifest: resumeManifest });
  executed.length = 0;
  const resumed = await orch.runTerminalPortfolio({
    manifest: resumeManifest,
    secureVolumeProbe: greenSecureVolumeProbe,
    resumeSeals: { W06: { chainSealDigest: w06Seal.chainSealDigest } },
    chainExecutor: async ({ chain, parentLockApi }) => {
      executed.push(chain.chainId);
      return runStubbedChain({ chain, manifest: resumeManifest, parentLockApi });
    },
  });
  assert.equal(resumed.ok, true, JSON.stringify(resumed));
  assert.deepEqual(executed, ['REP1', 'REP2', 'REP3']);
});

leaseTest('ORCH_PORTFOLIO_2: portfolio cannot seal from arbitrary digests or mutated manifest identity', async () => {
  const orch = await loadOrchestrator();
  const arbitraryManifest = makePortfolioManifestForTest(orch, 'portfolio-auth-arbitrary', tmpDir('c5v2-portfolio-auth-arbitrary-'));
  const arbitrary = await orch.runTerminalPortfolio({
    manifest: arbitraryManifest,
    secureVolumeProbe: greenSecureVolumeProbe,
    chainExecutor: async ({ chain }) => ({ ok: true, chainSealDigest: 'sha256:' + chain.chainId.toLowerCase().padEnd(64, '0') }),
  });
  assert.equal(arbitrary.ok, false);
  assert.match(arbitrary.code, /ORCH_PORTFOLIO_CHAIN_SEAL_MISSING/u);

  const manifest = makePortfolioManifestForTest(orch, 'portfolio-auth', tmpDir('c5v2-portfolio-auth-'));
  const mutated = { ...manifest, expectedWordBuild: '16.111.99999999' };
  const mutatedResult = await orch.runTerminalPortfolio({
    manifest: mutated,
    secureVolumeProbe: greenSecureVolumeProbe,
    chainExecutor: async () => ({ ok: true, chainSealDigest: 'sha256:' + 'f'.repeat(64) }),
  });
  assert.equal(mutatedResult.ok, false);
  assert.match(mutatedResult.code, /ORCH_PORTFOLIO_MANIFEST_DIGEST_MISMATCH/u);

  const executed = [];
  const green = await orch.runTerminalPortfolio({
    manifest,
    secureVolumeProbe: greenSecureVolumeProbe,
    chainExecutor: async ({ chain, parentLockApi }) => {
      executed.push(chain.chainId);
      return runSemanticPortfolioChain({ orch, chain, manifest, parentLockApi });
    },
  });
  assert.equal(green.ok, true, JSON.stringify(green));
  assert.deepEqual(executed, ['W06', 'REP1', 'REP2', 'REP3']);
  assert.ok(fs.existsSync(green.receiptPath));
  assert.ok(fs.existsSync(green.portfolioSealPath));

  const forgedResume = await orch.runTerminalPortfolio({
    manifest,
    secureVolumeProbe: greenSecureVolumeProbe,
    resumeSeals: { W06: { chainSealDigest: 'sha256:' + '0'.repeat(64) } },
    chainExecutor: async () => ({ ok: true, chainSealDigest: 'sha256:' + '1'.repeat(64) }),
  });
  assert.equal(forgedResume.ok, false);
  assert.match(forgedResume.code, /ORCH_PORTFOLIO_RESUME_SEAL_DIGEST_MISMATCH|ORCH_PORTFOLIO_CHAIN_SEAL_INVALID/u);
});

leaseTest('ORCH_PORTFOLIO_2B: manifest profile and deterministic root formulas reject before writes or executor', async () => {
  const orch = await loadOrchestrator();
  const mutations = [
    {
      label: 'campaignProfile',
      mutate: (manifest) => ({ ...manifest, campaignProfile: '' }),
    },
    {
      label: 'portfolioRoot',
      mutate: (manifest, root) => ({ ...manifest, portfolioRoot: path.join(root, `PORTFOLIO-${manifest.portfolioId}-mutated`) }),
    },
    {
      label: 'campaignId',
      mutate: (manifest) => ({
        ...manifest,
        chains: manifest.chains.map((chain, index) => index === 0 ? { ...chain, campaignId: `${manifest.portfolioId}-w06-mutated-01` } : chain),
      }),
    },
    {
      label: 'campaignRoot',
      mutate: (manifest) => ({
        ...manifest,
        chains: manifest.chains.map((chain, index) => index === 0
          ? { ...chain, campaignRoot: path.join(manifest.portfolioRoot, 'chains', `${chain.campaignId}-mutated`) }
          : chain),
      }),
    },
  ];
  for (const mutation of mutations) {
    const root = tmpDir(`c5v2-portfolio-formula-${mutation.label}-`);
    const manifest = makePortfolioManifestForTest(orch, `portfolio-formula-${mutation.label}`, root);
    const badManifest = rehashPortfolioManifest(mutation.mutate(JSON.parse(JSON.stringify(manifest)), root));
    const before = snapshotTree(root);
    let called = 0;
    const result = await orch.runTerminalPortfolio({
      manifest: badManifest,
      secureVolumeProbe: greenSecureVolumeProbe,
      chainExecutor: async () => {
        called += 1;
        return { ok: false, code: 'PROBE_STOP' };
      },
    });
    assert.equal(result.ok, false, mutation.label);
    assert.match(result.code, /ORCH_PORTFOLIO_CAMPAIGN_PROFILE_INVALID|ORCH_PORTFOLIO_ROOT_FORMULA|ORCH_PORTFOLIO_CAMPAIGN_ID_FORMULA|ORCH_PORTFOLIO_CAMPAIGN_ROOT_FORMULA/u, mutation.label);
    assert.equal(called, 0, mutation.label);
    assert.deepEqual(snapshotTree(root), before, mutation.label);
    assert.equal(fs.existsSync(path.join(root, `PORTFOLIO-${manifest.portfolioId}`)), false, mutation.label);
  }
});

leaseTest('ORCH_PORTFOLIO_3: roots attempts retry collision corrupt journal and lock loser are fail-closed', async () => {
  const orch = await loadOrchestrator();
  const sharedRoot = tmpDir('c5v2-portfolio-roots-');
  const firstManifest = makePortfolioManifestForTest(orch, 'portfolio-root-a', sharedRoot);
  const secondManifest = makePortfolioManifestForTest(orch, 'portfolio-root-b', sharedRoot);
  assert.notEqual(firstManifest.portfolioRoot, secondManifest.portfolioRoot);
  for (const manifest of [firstManifest, secondManifest]) {
    const result = await orch.runTerminalPortfolio({
      manifest,
    secureVolumeProbe: greenSecureVolumeProbe,
      chainExecutor: async ({ chain, parentLockApi }) => runSemanticPortfolioChain({ orch, chain, manifest, parentLockApi }),
    });
    assert.equal(result.ok, true, JSON.stringify(result));
  }

  const failedManifest = makePortfolioManifestForTest(orch, 'portfolio-retry', tmpDir('c5v2-portfolio-retry-'));
  const failed = await orch.runTerminalPortfolio({
    manifest: failedManifest,
    secureVolumeProbe: greenSecureVolumeProbe,
    chainExecutor: async () => ({ ok: false, code: 'CHAIN_FAILED_FOR_RETRY_TEST' }),
  });
  assert.equal(failed.ok, false);
  const retriedFresh = await orch.runTerminalPortfolio({
    manifest: failedManifest,
    secureVolumeProbe: greenSecureVolumeProbe,
    chainExecutor: async () => ({ ok: true, chainSealDigest: 'sha256:' + '1'.repeat(64) }),
  });
  assert.equal(retriedFresh.ok, false);
  assert.match(retriedFresh.code, /ORCH_PORTFOLIO_ROOT_COLLISION/u);

  const corruptJournalPath = path.join(failed.portfolioAttemptRoot, 'ORCHESTRATOR', 'chain-journal.jsonl');
  fs.appendFileSync(corruptJournalPath, '{not-json}\n', 'utf8');
  const corruptResume = await orch.runTerminalPortfolio({
    manifest: failedManifest,
    secureVolumeProbe: greenSecureVolumeProbe,
    resume: true,
    chainExecutor: async () => ({ ok: true, chainSealDigest: 'sha256:' + '2'.repeat(64) }),
  });
  assert.equal(corruptResume.ok, false);
  assert.match(corruptResume.code, /ORCH_PORTFOLIO_RESUME_JOURNAL_INVALID/u);
  assert.equal(fs.existsSync(path.join(failedManifest.portfolioRoot, 'attempt-0002')), false);

  const lockLoserManifest = makePortfolioManifestForTest(orch, 'portfolio-lock-loser', tmpDir('c5v2-portfolio-lock-loser-'));
  const lockLoser = await orch.runTerminalPortfolio({
    manifest: lockLoserManifest,
    secureVolumeProbe: greenSecureVolumeProbe,
    chainExecutor: async () => { throw new Error('must not run while lock is held'); },
    lockApi: {
      acquire: () => ({ ok: false, code: 'ORCH_LOCK_HELD:123:portfolio-root-a' }),
      release: () => { throw new Error('release must not be called'); },
    },
  });
  assert.equal(lockLoser.ok, false);
  assert.match(lockLoser.code, /ORCH_LOCK_HELD/u);
  assert.equal(fs.existsSync(lockLoserManifest.portfolioRoot), false);
});

leaseTest('ORCH_PORTFOLIO_4: forged chain seal and later journal failure cannot satisfy resume', async () => {
  const orch = await loadOrchestrator();
  const manifest = makePortfolioManifestForTest(orch, 'portfolio-forged', tmpDir('c5v2-portfolio-forged-'));
  const chain = manifest.chains[0];
  const orchDir = path.join(chain.campaignRoot, 'ORCHESTRATOR');
  fs.mkdirSync(orchDir, { recursive: true });
  const sealBody = {
    schemaVersion: 'yalken.rtk.word.c5v2.terminal-orchestrator.v2',
    kind: 'CHAIN_SEAL',
    campaignId: chain.campaignId,
    chainId: chain.chainId,
    expectedSha: manifest.expectedSha,
    wordVersion: manifest.expectedWordVersion,
    wordBuild: manifest.expectedWordBuild,
    scriptHashes: manifest.scriptHashes,
    corpusDigest: manifest.corpusDigest,
    masterLedgerDigest: manifest.masterLedgerDigest,
    operationIdSetDigest: manifest.operationIdSetDigest,
    campaignProfile: manifest.campaignProfile,
    stageSeals: [],
    journalTipDigest: 'sha256:genesis',
    sealedAtUtc: new Date().toISOString(),
  };
  const chainSealDigest = digestOf(sealBody);
  writeJson(path.join(orchDir, 'chain-seal.json'), { ...sealBody, chainSealDigest });
  const sealedRecordBody = {
    schemaVersion: 'yalken.rtk.word.c5v2.terminal-orchestrator.v2',
    sequence: 1,
    transition: 'CHAIN_SEALED',
    campaignId: chain.campaignId,
    chainId: chain.chainId,
    expectedSha: manifest.expectedSha,
    atUtc: new Date().toISOString(),
    previousDigest: 'sha256:genesis',
    detail: { chainSealDigest },
  };
  const sealedRecord = { ...sealedRecordBody, digest: digestOf(sealedRecordBody) };
  fs.writeFileSync(path.join(orchDir, 'chain-journal.jsonl'), JSON.stringify(sealedRecord) + '\n', 'utf8');
  const forgedResume = await orch.runTerminalPortfolio({
    manifest,
    secureVolumeProbe: greenSecureVolumeProbe,
    resumeSeals: { W06: { chainSealDigest } },
    chainExecutor: async () => ({ ok: true, chainSealDigest: 'sha256:' + '3'.repeat(64) }),
  });
  assert.equal(forgedResume.ok, false);
  assert.match(forgedResume.code, /ORCH_PORTFOLIO_CHAIN_SEAL_INVALID/u);
  assert.match(forgedResume.code, /ORCH_PORTFOLIO_CHAIN_STAGE_SEALS|ORCH_PORTFOLIO_STAGE_SEAL_MALFORMED/u);

  const validManifest = makePortfolioManifestForTest(orch, 'portfolio-late-failure', tmpDir('c5v2-portfolio-late-failure-'));
  const green = await orch.runTerminalPortfolio({
    manifest: validManifest,
    secureVolumeProbe: greenSecureVolumeProbe,
    chainExecutor: async ({ chain: greenChain, parentLockApi }) => runSemanticPortfolioChain({ orch, chain: greenChain, manifest: validManifest, parentLockApi }),
  });
  assert.equal(green.ok, true, JSON.stringify(green));
  const validChain = validManifest.chains[0];
  const journalPath = path.join(validChain.campaignRoot, 'ORCHESTRATOR', 'chain-journal.jsonl');
  const prior = fs.readFileSync(journalPath, 'utf8').trim().split('\n').map((line) => JSON.parse(line)).at(-1);
  const failureBody = {
    schemaVersion: 'yalken.rtk.word.c5v2.terminal-orchestrator.v2',
    sequence: prior.sequence + 1,
    transition: 'LOCK_RELEASE_FAILED',
    campaignId: validChain.campaignId,
    chainId: validChain.chainId,
    expectedSha: validManifest.expectedSha,
    atUtc: new Date().toISOString(),
    previousDigest: prior.digest,
    detail: { code: 'ORCH_SYNTHETIC_LATE_FAILURE' },
  };
  fs.appendFileSync(journalPath, JSON.stringify({ ...failureBody, digest: digestOf(failureBody) }) + '\n', 'utf8');
  const lateFailureResume = await orch.runTerminalPortfolio({
    manifest: validManifest,
    secureVolumeProbe: greenSecureVolumeProbe,
    resumeSeals: { W06: { chainSealDigest: green.receipt.chainSeals[0].chainSealDigest } },
    chainExecutor: async () => ({ ok: true, chainSealDigest: 'sha256:' + '4'.repeat(64) }),
  });
  assert.equal(lateFailureResume.ok, false);
  assert.match(lateFailureResume.code, /ORCH_PORTFOLIO_CHAIN_JOURNAL_FAILURE_TRANSITION|ORCH_PORTFOLIO_CHAIN_JOURNAL_SEAL_NOT_TERMINAL/u);
});

leaseTest('ORCH_PORTFOLIO_5: production CLI uses canonical script hash schema and explicit injection only', async () => {
  const orch = await loadOrchestrator();
  const ledger = makeSemanticLedger();
  assert.throws(() => orch.buildTerminalPortfolioManifest({
    portfolioId: 'portfolio-bad-hashes',
    artifactRoot: tmpDir('c5v2-portfolio-bad-hashes-'),
    expectedSha: 'a'.repeat(40),
    expectedWordVersion: '16.111.3',
    expectedWordBuild: '16.111.26080215',
    corpusDigest: 'sha256:' + 'b'.repeat(64),
    corpusManifestPath: makeCorpusManifestFileForTest(),
    masterLedgerDigest: ledger.ledgerDigest,
    operationIdSetDigest: ledger.operationIdSetDigest,
    scriptHashes: { orchestrator: canonicalScriptHashes().orchestrator, canary: canonicalScriptHashes().physicalCanary },
    campaignProfile: 'C5V2_DORIAN_TERMINAL',
  }), /ORCH_PORTFOLIO_SCRIPT_HASHES_KEYS/u);

  const manifest = makePortfolioManifestForTest(orch, 'portfolio-cli', tmpDir('c5v2-portfolio-cli-'));
  const manifestPath = path.join(tmpDir('c5v2-portfolio-cli-manifest-'), 'manifest.json');
  writeJson(manifestPath, manifest);
  let capturedOptions = null;
  let capturedManifest = null;
  const writes = { stdout: '', stderr: '' };
  const result = await orch.mainWithDeps({
    argv: ['--portfolio-manifest', manifestPath],
    env: {},
    stdout: { write: (chunk) => { writes.stdout += chunk; } },
    stderr: { write: (chunk) => { writes.stderr += chunk; } },
    runTerminalPortfolio: async ({ manifest: routedManifest, chainExecutor }) => {
      capturedManifest = routedManifest;
      const chainResult = await chainExecutor({
        chain: routedManifest.chains[0],
        parentLockApi: { acquire: () => ({ ok: true }), release: () => ({ released: true }) },
      });
      return { ok: chainResult.ok, code: 'ORCH_PORTFOLIO_CLI_TEST_GREEN' };
    },
    runSingleChainOrchestrator: async ({ options, lockApi }) => {
      capturedOptions = { ...options, lockApiPresent: !!lockApi };
      return { ok: true, code: 'ORCH_SINGLE_CHAIN_CLI_TEST_GREEN' };
    },
  });
  assert.equal(result.exitCode, 0, writes.stderr);
  assert.equal(capturedManifest.scriptHashes.physicalCanary, canonicalScriptHashes().physicalCanary);
  assert.equal(capturedOptions.expectedLedgerDigest, manifest.masterLedgerDigest);
  assert.equal(capturedOptions.expectedOperationIdSetDigest, manifest.operationIdSetDigest);
  assert.equal(capturedOptions.campaignProfile, manifest.campaignProfile);
  assert.equal(capturedOptions.expectedCorpusDigest, manifest.corpusDigest);
  assert.equal(capturedOptions.corpusManifestPath, manifest.corpusManifestPath);
  assert.equal(capturedOptions.lockApiPresent, true);

  let called = false;
  const bypass = await orch.mainWithDeps({
    argv: ['--portfolio-manifest', manifestPath],
    env: { ORCH_CANARY_RUNNER_PATH: '/tmp/fake-runner' },
    stdout: { write: () => {} },
    stderr: { write: (chunk) => { writes.stderr += chunk; } },
    runTerminalPortfolio: async () => { called = true; return { ok: true }; },
  });
  assert.equal(bypass.exitCode, 1);
  assert.equal(called, false);
  assert.match(writes.stderr, /ORCH_PRODUCTION_ENV_BYPASS_REJECTED/u);
});

leaseTest('ORCH_PORTFOLIO_6: production CLI propagates corpus manifest and canary rejects A versus B digest', async () => {
  const [orch, canary] = await Promise.all([loadOrchestrator(), loadCanary()]);
  const corpusAPath = makeLoadableCorpusManifestFileForTest('a');
  const corpusBPath = makeLoadableCorpusManifestFileForTest('b');
  const corpusA = canary.loadCanaryCorpus({ corpusManifestPath: corpusAPath });
  const corpusADigest = canary.buildC5V2CorpusReuseDigest({ provenance: corpusA.provenance, scenes: corpusA.scenes });
  const corpusBMismatch = canary.verifyC5V2ExpectedCorpusDigest({
    corpusManifestPath: corpusBPath,
    expectedCorpusDigest: corpusADigest,
  });
  assert.equal(corpusBMismatch.ok, false);
  assert.match(corpusBMismatch.code, /ORCH_CANARY_CORPUS_DIGEST_MISMATCH/u);

  const ledger = makeSemanticLedger();
  const manifest = orch.buildTerminalPortfolioManifest({
    portfolioId: 'portfolio-corpus-mismatch',
    artifactRoot: tmpDir('c5v2-portfolio-corpus-mismatch-'),
    expectedSha: 'a'.repeat(40),
    expectedWordVersion: '16.111.3',
    expectedWordBuild: '16.111.26080215',
    corpusDigest: corpusADigest,
    corpusManifestPath: corpusBPath,
    masterLedgerDigest: ledger.ledgerDigest,
    operationIdSetDigest: ledger.operationIdSetDigest,
    scriptHashes: canonicalScriptHashes(),
    campaignProfile: 'C5V2_DORIAN_TERMINAL',
  });
  const manifestPath = path.join(tmpDir('c5v2-portfolio-corpus-cli-manifest-'), 'manifest.json');
  writeJson(manifestPath, manifest);
  let capturedOptions = null;
  const writes = { stdout: '', stderr: '' };
  const result = await orch.mainWithDeps({
    argv: ['--portfolio-manifest', manifestPath],
    env: {},
    stdout: { write: (chunk) => { writes.stdout += chunk; } },
    stderr: { write: (chunk) => { writes.stderr += chunk; } },
    runTerminalPortfolio: async ({ manifest: routedManifest, chainExecutor }) => {
      const chainResult = await chainExecutor({
        chain: routedManifest.chains[0],
        parentLockApi: { acquire: () => ({ ok: true }), release: () => ({ released: true }) },
      });
      return { ok: chainResult.ok, code: chainResult.code || 'ORCH_PORTFOLIO_CORPUS_TEST_RESULT' };
    },
    runSingleChainOrchestrator: async ({ options }) => {
      capturedOptions = options;
      const verified = canary.verifyC5V2ExpectedCorpusDigest(options);
      return { ok: verified.ok, code: verified.code };
    },
  });
  assert.equal(result.exitCode, 1);
  assert.equal(capturedOptions.expectedCorpusDigest, corpusADigest);
  assert.equal(capturedOptions.corpusManifestPath, corpusBPath);
  assert.match(result.outcome.code, /ORCH_CANARY_CORPUS_DIGEST_MISMATCH/u);
});
