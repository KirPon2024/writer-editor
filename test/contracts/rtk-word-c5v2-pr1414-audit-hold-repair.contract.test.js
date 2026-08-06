'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');

const REPO_ROOT = path.resolve(__dirname, '..', '..');

async function loadCanary() {
  return import(path.join(REPO_ROOT, 'scripts', 'ops', 'rtk-word-c5v2-physical-canary.mjs'));
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
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

function runTextXml(text) {
  return `<w:r><w:t>${xmlEscape(text)}</w:t></w:r>`;
}

function paragraphXml(text) {
  return `<w:p>${runTextXml(text)}</w:p>`;
}

function writeDocxPackage(filePath, { paragraphs = [], revisionOperations = [] } = {}) {
  const documentParagraphs = paragraphs.map((text) => paragraphXml(text));
  const revisionParagraphs = revisionOperations.map((operation) => {
    const inserted = operation.family === 'tracked_delete'
      ? ''
      : `<w:ins>${runTextXml(operation.replacementText || '')}</w:ins>`;
    const deleted = operation.family === 'tracked_insert'
      ? ''
      : `<w:del><w:r><w:delText>${xmlEscape(operation.quote || '')}</w:delText></w:r></w:del>`;
    return `<w:p>${inserted}${deleted}</w:p>`;
  });
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
        + `<w:body>${documentParagraphs.join('')}${revisionParagraphs.join('')}<w:sectPr/></w:body>`
        + '</w:document>',
    },
    {
      name: 'word/comments.xml',
      content: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        + '<w:comments xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"/>',
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

function markedTextNodeForTest(text) {
  return { type: 'text', text };
}

function docV2PayloadFromParagraphs(paragraphs) {
  const doc = {
    type: 'doc',
    content: paragraphs.map((text) => ({
      type: 'paragraph',
      content: [markedTextNodeForTest(text)],
    })),
  };
  const serialized = JSON.stringify(doc, null, 2);
  return `[doc-v2 length=${serialized.length}]\n${serialized}`;
}

function graphemePartsForTest(value) {
  if (typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function') {
    const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
    return Array.from(segmenter.segment(String(value || '')), (part) => part.segment);
  }
  return Array.from(String(value || ''));
}

function buildExpectedParagraphsForTest(scene, operations) {
  const paragraphs = scene.paragraphs.slice();
  for (const operation of operations.slice().sort((left, right) => (
    right.masterAnchor.paragraphOrdinal - left.masterAnchor.paragraphOrdinal
      || right.masterAnchor.graphemeStart - left.masterAnchor.graphemeStart
  ))) {
    if (operation.expectedOutcome !== 'EXACT') continue;
    const ordinal = operation.masterAnchor.paragraphOrdinal;
    const parts = graphemePartsForTest(paragraphs[ordinal]);
    const replacement = operation.family === 'tracked_delete'
      ? ''
      : operation.family === 'tracked_insert'
        ? `${operation.replacementText} ${operation.quote}`
        : operation.replacementText;
    parts.splice(
      operation.masterAnchor.graphemeStart,
      operation.masterAnchor.graphemeEnd - operation.masterAnchor.graphemeStart,
      ...graphemePartsForTest(replacement),
    );
    paragraphs[ordinal] = parts.join('').trim();
  }
  return paragraphs;
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

function rewriteBoundGate(canary, fixture, bindingChanges = {}, gateChanges = {}) {
  const gate = JSON.parse(fs.readFileSync(fixture.files.gate, 'utf8'));
  const binding = { ...gate.completedRoundReuseBinding, ...bindingChanges };
  const { bindingDigest: _priorDigest, ...body } = binding;
  binding.bindingDigest = canary.sha256Text(canary.stableCanonicalJson(body));
  const nextGate = { ...gate, ...gateChanges, completedRoundReuseBinding: binding };
  writeJson(fixture.files.gate, nextGate);
  return nextGate;
}

function createBoundCompletedRound(canary, overrides = {}) {
  const roundDir = fs.mkdtempSync(path.join(os.tmpdir(), 'c5v2-pr1414-audit-hold-'));
  const candidateAuthorityRoot = `${roundDir}-main-owned-authority`;
  const inputOperations = Array.isArray(overrides.operations) ? overrides.operations : [{
    id: 'op-exact-001',
    formalFamily: 'tracked_text_edit',
    family: 'tracked_replace',
    expectedOutcome: 'EXACT',
    sceneId: 'roman/chapter-01.txt',
    quote: 'old text',
    replacementText: 'new text',
  }];
  const sceneOrdinalById = new Map();
  const operations = inputOperations.map((operation) => {
    const sceneId = String(operation.sceneId || 'roman/chapter-01.txt');
    const paragraphOrdinal = sceneOrdinalById.get(sceneId) || 0;
    sceneOrdinalById.set(sceneId, paragraphOrdinal + 1);
    const quote = String(operation.quote || operation.id || '');
    const family = operation.family || 'tracked_replace';
    const replacementText = String(operation.replacementText || '');
    return {
      ...operation,
      formalFamily: operation.formalFamily || 'tracked_text_edit',
      family,
      expectedOutcome: operation.expectedOutcome || 'EXACT',
      sceneId,
      quote,
      replacementText,
      semanticIntent: operation.semanticIntent || {
        kind: family === 'tracked_insert' ? 'insert' : family === 'tracked_delete' ? 'delete' : 'replace',
        replacementText,
      },
      masterAnchor: operation.masterAnchor || {
        paragraphOrdinal,
        graphemeStart: 0,
        graphemeEnd: graphemePartsForTest(quote).length,
        selectedText: quote,
      },
    };
  });
  const exactOperations = operations.filter((operation) => (
    ['tracked_replace', 'tracked_insert', 'tracked_delete'].includes(operation.family)
    && operation.expectedOutcome === 'EXACT'
  ));
  const changeIdByOperationId = Object.fromEntries(operations.map((operation, index) => [
    operation.id,
    `change-exact-${String(index + 1).padStart(3, '0')}`,
  ]));
  const sceneIds = [...new Set(operations.map((operation) => operation.sceneId))];
  const ledger = {
    schemaVersion: 'yalken.rtk.word.c5v2.physical-master-round-ledger.v1',
    topology: 'one-full-manuscript-project-cumulative-rounds',
    roundNumber: 1,
    masterLedgerDigest: 'sha256:stored-master-ledger-digest',
    ledgerDigest: 'sha256:stored-round-ledger-digest',
    operationCount: operations.length,
    familyCounts: operations.reduce((counts, operation) => ({
      ...counts,
      [operation.family]: Number(counts[operation.family] || 0) + 1,
    }), {}),
    scenes: sceneIds.map((sceneId) => ({ sceneId })),
    operations,
  };
  const exactLedgerBinding = {
    ok: true,
    expectedOperationCount: exactOperations.length,
    matchedOperationCount: exactOperations.length,
    matchedChangeCount: exactOperations.length,
    excludedCandidateCount: 0,
    exactApplyTextChangeIdsByScene: exactOperations.reduce((byScene, operation) => {
      if (!byScene[operation.sceneId]) byScene[operation.sceneId] = [];
      byScene[operation.sceneId].push(changeIdByOperationId[operation.id]);
      return byScene;
    }, {}),
    exactOperationBindings: exactOperations.map((operation) => ({
      operationId: operation.id,
      sceneId: operation.sceneId,
      changeId: changeIdByOperationId[operation.id],
    })),
    unmatchedExpectedOperationIds: [],
    duplicateExpectedSignatureOperationIds: [],
    duplicateCandidateBindingIds: [],
    missingDiagnosticCandidateIds: [],
  };
  const files = {
    ledger: path.join(roundDir, 'canary-ledger.json'),
    wordOutput: path.join(roundDir, 'word-output.txt'),
    source: path.join(roundDir, 'c5v2-cumulative-source-fullmanuscript.docx'),
    returned: path.join(roundDir, 'c5v2-cumulative-returned-word-native.docx'),
    ready: path.join(roundDir, 'c5v2-cumulative-returned-ready.json'),
    oracle: path.join(roundDir, 'complete-round-oracle.json'),
    gate: path.join(roundDir, 'complete-round-oracle-gate.json'),
    candidateAuthority: path.join(roundDir, 'return-apply-candidate-authority.json'),
    truth: path.join(roundDir, 'yalken-reopened-truth.json'),
    baseline: path.join(roundDir, 'product-baseline-scenes.json'),
    returnApply: path.join(roundDir, 'product-return-apply.json'),
    nativeLifecycle: path.join(roundDir, 'native-lifecycle-verification.json'),
  };
  writeJson(files.ledger, ledger);
  const statusForOperation = (operation) => (
    operation.expectedOutcome === 'MANUAL' ? 'BLOCKED' : operation.expectedOutcome
  );
  fs.writeFileSync(files.wordOutput, [
    'WORD_STATUS=PASS',
    ...operations.map((operation) => `OP|${operation.id}|${statusForOperation(operation)}`),
    ...operations.map((operation) => `READBACK|${operation.id}|${statusForOperation(operation)}|WORD_OBJECT_MODEL_REOPENED`),
    '',
  ].join('\n'), 'utf8');
  const baselineScenes = sceneIds.map((sceneId) => {
    const sceneOperations = operations.filter((operation) => operation.sceneId === sceneId);
    const paragraphs = sceneOperations.map((operation) => `${operation.quote} baseline for ${operation.id}`);
    const rawContent = docV2PayloadFromParagraphs(paragraphs);
    return {
      sceneId,
      rawContent,
      rawContentSha256: canary.sha256Text(rawContent),
      text: paragraphs.join('\n\n'),
      textSha256: canary.sha256Text(paragraphs.join('\n\n')),
      paragraphs,
    };
  });
  writeJson(files.baseline, {
    schemaVersion: 'yalken.rtk.word.c5v2.product-baseline-scenes.v1',
    roundId: 'round-01',
    projectRoot: '',
    scenes: baselineScenes,
  });
  const truthSceneReadback = baselineScenes.map((scene) => {
    const expectedParagraphs = buildExpectedParagraphsForTest(
      scene,
      operations.filter((operation) => operation.sceneId === scene.sceneId),
    );
    const rawContent = docV2PayloadFromParagraphs(expectedParagraphs);
    return { sceneId: scene.sceneId, rawContent, rawContentSha256: canary.sha256Text(rawContent) };
  });
  writeDocxPackage(files.source, {
    paragraphs: baselineScenes.flatMap((scene) => scene.paragraphs),
  });
  writeDocxPackage(files.returned, {
    paragraphs: truthSceneReadback.flatMap((scene) => {
      const parsed = JSON.parse(String(scene.rawContent).replace(/^\[doc-v2 length=\d+\]\n/u, ''));
      return parsed.content.map((block) => block.content.map((node) => node.text || '').join(''));
    }),
    revisionOperations: exactOperations,
  });
  const wordVisibleReadbackPath = `${files.returned}.word-visible-readback.txt`;
  fs.writeFileSync(
    wordVisibleReadbackPath,
    exactOperations
      .filter((operation) => operation.family !== 'tracked_delete')
      .map((operation) => operation.replacementText)
      .join('\n'),
    'utf8',
  );
  writeJson(files.truth, {
    schemaVersion: 'yalken.rtk.word.c5v2.reopened-yalken-truth.v1',
    roundId: 'round-01',
    sourceKind: 'reopened-yalken-project',
    reopenPassCount: 2,
    passes: [1, 2].map((pass) => ({
      pass,
      scenes: sceneIds.map((sceneId) => ({ sceneId, ok: true })),
    })),
    sceneReadback: truthSceneReadback,
    expectedRootCommentCount: 0,
    canonicalNonTextState: { present: false },
    recoveryNonTextState: { present: false },
  });
  const returnedDocxSha256 = canary.sha256File(files.returned);
  writeJson(files.ready, { ready: true, roundId: 'round-01', returnedSha256: returnedDocxSha256 });
  const policy = canary.getC5V2OperationStatusPolicyBinding();
  const context = {
    exactHead: 'head-current',
    canaryScriptSha256: 'sha256:script-current',
    operationStatusPolicyBinding: policy,
    corpusDigest: 'sha256:corpus-current',
    roundId: 'round-01',
    campaignId: 'campaign-current',
    candidateAuthorityRoot,
  };
  canary.initializeC5V2CandidateAuthorityRoot({
    authorityRoot: candidateAuthorityRoot,
    createIfMissing: true,
  });
  const returnApply = {
    ok: true,
    exactLedgerBinding,
    lanePlan: { exactLedgerBinding },
    activation: {
      ok: true,
      textChangeScopeDiagnostics: exactOperations.map((operation) => ({
        changeId: changeIdByOperationId[operation.id],
        targetScope: { id: operation.sceneId },
        matchKind: 'exact',
        quoteSha256: canary.sha256Text(operation.quote),
        replacementSha256: canary.sha256Text(operation.replacementText),
      })),
      commentThreadDiagnostics: [],
      commentPlacementDiagnostics: [],
      commentProductPath: {
        semanticOracle: { lifecycleApplied: 0 },
        applyReceipts: [],
        replayReceipts: [],
      },
    },
    yalkenTruthArtifact: { path: files.truth, sha256: canary.sha256File(files.truth) },
  };
  writeJson(files.returnApply, returnApply);
  const returnApplyCandidateAuthority = canary.buildC5V2ReturnApplyCandidateAuthority({
    roundId: context.roundId,
    returnApply,
  });
  writeJson(files.candidateAuthority, returnApplyCandidateAuthority);
  const returnApplyCandidateAuthorityAnchorValidation = canary.writeC5V2ReturnApplyCandidateAuthorityAnchor({
    authorityRoot: candidateAuthorityRoot,
    campaignId: context.campaignId,
    roundId: context.roundId,
    exactHead: context.exactHead,
    corpusDigest: context.corpusDigest,
    ledger,
    candidateAuthority: returnApplyCandidateAuthority,
    candidateAuthorityPath: files.candidateAuthority,
  });
  assert.equal(returnApplyCandidateAuthorityAnchorValidation.ok, true);
  const nativeLifecycleVerification = nativeLifecycleVerificationForTest(operations);
  writeJson(files.nativeLifecycle, nativeLifecycleVerification);
  const oracle = canary.buildOracleProbe({
    ledger,
    wordParsed: canary.applyNativeLifecycleVerification(
      canary.parseWordOutput(fs.readFileSync(files.wordOutput, 'utf8')),
      nativeLifecycleVerification,
    ),
    returnedDocxPath: files.returned,
    wordVisibleReadbackPath,
    baselineArtifactPath: files.baseline,
    yalkenTruthPath: files.truth,
    returnApply,
  });
  writeJson(files.oracle, oracle);
  const completedRoundReuseBinding = canary.buildC5V2CompletedRoundReuseBinding({
    roundId: overrides.roundId || context.roundId,
    exactHead: overrides.exactHead || context.exactHead,
    canaryScriptSha256: overrides.canaryScriptSha256 || context.canaryScriptSha256,
    operationStatusPolicyVersion: overrides.operationStatusPolicyVersion || policy.version,
    operationStatusPolicyDigest: overrides.operationStatusPolicyDigest || policy.digest,
    corpusDigest: overrides.corpusDigest || context.corpusDigest,
    ledger,
    ledgerContentDigest: canary.resolveC5V2LedgerReuseDigest(ledger),
    roundLedgerPath: files.ledger,
    roundLedgerSha256: canary.sha256File(files.ledger),
    wordOutputPath: files.wordOutput,
    wordOutputSha256: canary.sha256File(files.wordOutput),
    wordVisibleReadbackPath,
    wordVisibleReadbackSha256: canary.sha256File(wordVisibleReadbackPath),
    completeRoundOraclePath: files.oracle,
    completeRoundOracleSha256: canary.sha256File(files.oracle),
    returnedReadyPath: files.ready,
    returnedReadySha256: canary.sha256File(files.ready),
    productBaselinePath: files.baseline,
    productBaselineSha256: canary.sha256File(files.baseline),
    returnApplyPath: files.returnApply,
    returnApplySha256: canary.sha256File(files.returnApply),
    nativeLifecycleVerificationPath: files.nativeLifecycle,
    nativeLifecycleVerificationSha256: canary.sha256File(files.nativeLifecycle),
    sourceDocxPath: files.source,
    sourceDocxSha256: canary.sha256File(files.source),
    returnedDocxPath: files.returned,
    returnedDocxSha256,
    yalkenTruthPath: files.truth,
    yalkenTruthSha256: canary.sha256File(files.truth),
    returnApplyCandidateAuthorityPath: files.candidateAuthority,
    returnApplyCandidateAuthority,
    returnApplyCandidateAuthoritySha256: canary.sha256File(files.candidateAuthority),
    returnApplyCandidateAuthorityAnchor: returnApplyCandidateAuthorityAnchorValidation.anchor,
    returnApplyCandidateAuthorityAnchorArtifact: returnApplyCandidateAuthorityAnchorValidation.anchorArtifact,
    returnApplyCandidateAuthorityAnchorValidation,
    exactLedgerBinding,
  });
  const gate = canary.buildC5V2CompleteRoundOracleGate({
    roundId: overrides.gateRoundId || 'round-01',
    wordParsed: { scalars: { WORD_STATUS: 'PASS' } },
    nativeLifecycleVerification,
    oracleProbe: oracle,
    returnApply,
    completedRoundReuseBinding,
    roundOperationIds: operations.map((operation) => operation.id),
    cumulativeOperationIds: operations.map((operation) => operation.id),
  });
  writeJson(files.gate, gate);
  return {
    roundDir,
    files,
    ledger,
    context,
    policy,
    gate,
    completedRoundReuseBinding,
    exactLedgerBinding,
    returnApplyCandidateAuthority,
    returnApplyCandidateAuthorityAnchorValidation,
  };
}

test('C5V2 v6 rejects synchronized raw-authority and exact-mapping changeId swap after every plain digest is refreshed', async () => {
  const canary = await loadCanary();
  const fixture = createBoundCompletedRound(canary, {
    operations: [{
      id: 'op-exact-001',
      formalFamily: 'tracked_text_edit',
      family: 'tracked_replace',
      expectedOutcome: 'EXACT',
      sceneId: 'roman/chapter-01.txt',
      quote: 'old text one',
      replacementText: 'new text one',
    }, {
      id: 'op-exact-002',
      formalFamily: 'tracked_text_edit',
      family: 'tracked_replace',
      expectedOutcome: 'EXACT',
      sceneId: 'roman/chapter-02.txt',
      quote: 'old text two',
      replacementText: 'new text two',
    }],
  });
  assert.equal(canary.isC5V2ReusableCompletedRound(fixture.roundDir, fixture.context), true);
  assert.equal(canary.deriveC5V2LedgerBoundExactSummary({
    exactLedgerBinding: fixture.exactLedgerBinding,
  }).exactTotal, 2);
  assert.equal(
    path.relative(fixture.roundDir, fixture.returnApplyCandidateAuthorityAnchorValidation.anchorArtifact.path).startsWith('..'),
    true,
  );
  assert.equal(
    fs.lstatSync(path.join(fixture.context.candidateAuthorityRoot, 'candidate-authority-anchor.key')).mode & 0o077,
    0,
  );
  const forgedExactLedgerBinding = {
    ...fixture.exactLedgerBinding,
    exactApplyTextChangeIdsByScene: {
      'roman/chapter-01.txt': ['change-exact-002'],
      'roman/chapter-02.txt': ['change-exact-001'],
    },
    exactOperationBindings: [{
      operationId: 'op-exact-001',
      sceneId: 'roman/chapter-01.txt',
      changeId: 'change-exact-002',
    }, {
      operationId: 'op-exact-002',
      sceneId: 'roman/chapter-02.txt',
      changeId: 'change-exact-001',
    }],
  };
  const forgedAuthority = JSON.parse(fs.readFileSync(fixture.files.candidateAuthority, 'utf8'));
  [forgedAuthority.candidates[0].changeId, forgedAuthority.candidates[1].changeId] = [
    forgedAuthority.candidates[1].changeId,
    forgedAuthority.candidates[0].changeId,
  ];
  const { contentDigest: _priorAuthorityDigest, ...forgedAuthorityBody } = forgedAuthority;
  forgedAuthority.contentDigest = canary.sha256Text(canary.stableCanonicalJson(forgedAuthorityBody));
  writeJson(fixture.files.candidateAuthority, forgedAuthority);
  rewriteBoundGate(canary, fixture, {
    exactLedgerBinding: forgedExactLedgerBinding,
    returnApplyCandidateAuthoritySha256: canary.sha256File(fixture.files.candidateAuthority),
    returnApplyCandidateAuthorityContentDigest: forgedAuthority.contentDigest,
  });

  assert.equal(canary.validateC5V2ExactLedgerBindingAgainstLedger(
    forgedExactLedgerBinding,
    fixture.ledger,
    {
      candidateAuthority: forgedAuthority,
      roundId: fixture.context.roundId,
    },
  ).ok, true, 'the plain self-hashed pair is internally consistent and must be stopped by the external anchor');
  assert.equal(canary.isC5V2ReusableCompletedRound(fixture.roundDir, fixture.context), false);
});

test('C5V2 v6 rejects candidate authority content mutation even when all authority and binding digests are refreshed', async () => {
  const canary = await loadCanary();
  const fixture = createBoundCompletedRound(canary);
  const authority = JSON.parse(fs.readFileSync(fixture.files.candidateAuthority, 'utf8'));
  authority.candidates[0].changeId = 'change-authority-forged';
  const { contentDigest: _priorDigest, ...authorityBody } = authority;
  authority.contentDigest = canary.sha256Text(canary.stableCanonicalJson(authorityBody));
  writeJson(fixture.files.candidateAuthority, authority);
  rewriteBoundGate(canary, fixture, {
    returnApplyCandidateAuthoritySha256: canary.sha256File(fixture.files.candidateAuthority),
    returnApplyCandidateAuthorityContentDigest: authority.contentDigest,
  });

  assert.equal(canary.isC5V2ReusableCompletedRound(fixture.roundDir, fixture.context), false);
});

test('C5V2 v6 rejects candidate authority hash mutation under a refreshed outer binding digest', async () => {
  const canary = await loadCanary();
  const fixture = createBoundCompletedRound(canary);
  rewriteBoundGate(canary, fixture, {
    returnApplyCandidateAuthoritySha256: 'sha256:forged-authority-file-hash',
  });

  assert.equal(canary.isC5V2ReusableCompletedRound(fixture.roundDir, fixture.context), false);
});

test('C5V2 v6 anchor lifecycle fails closed for missing corrupt wrong-key and wrong-campaign authority without recovery', async () => {
  const canary = await loadCanary();

  const missing = createBoundCompletedRound(canary);
  fs.unlinkSync(missing.returnApplyCandidateAuthorityAnchorValidation.anchorArtifact.path);
  assert.equal(canary.isC5V2ReusableCompletedRound(missing.roundDir, missing.context), false);
  assert.equal(canary.isC5V2ReusableCompletedRound(missing.roundDir, missing.context), false);
  assert.equal(fs.existsSync(missing.returnApplyCandidateAuthorityAnchorValidation.anchorArtifact.path), false);

  const corrupt = createBoundCompletedRound(canary);
  const corruptAnchorPath = corrupt.returnApplyCandidateAuthorityAnchorValidation.anchorArtifact.path;
  const corruptAnchor = JSON.parse(fs.readFileSync(corruptAnchorPath, 'utf8'));
  corruptAnchor.candidateTupleDigest = canary.sha256Text('forged-tuples');
  corruptAnchor.anchorDigest = canary.sha256Text(canary.stableCanonicalJson({
    ...corruptAnchor,
    anchorDigest: undefined,
  }));
  writeJson(corruptAnchorPath, corruptAnchor);
  assert.equal(canary.isC5V2ReusableCompletedRound(corrupt.roundDir, corrupt.context), false);

  const wrongKey = createBoundCompletedRound(canary);
  const keyPath = path.join(wrongKey.context.candidateAuthorityRoot, 'candidate-authority-anchor.key');
  fs.writeFileSync(keyPath, `${'f'.repeat(64)}\n`, { encoding: 'utf8', mode: 0o600 });
  fs.chmodSync(keyPath, 0o600);
  assert.equal(canary.isC5V2ReusableCompletedRound(wrongKey.roundDir, wrongKey.context), false);

  const wrongCampaign = createBoundCompletedRound(canary);
  assert.equal(canary.isC5V2ReusableCompletedRound(wrongCampaign.roundDir, {
    ...wrongCampaign.context,
    campaignId: 'campaign-replay-from-other-project',
  }), false);
});

test('C5V2 v6 anchor root rejects symlink redirection and path escape identifiers', async () => {
  const canary = await loadCanary();
  const fixture = createBoundCompletedRound(canary);
  const symlinkRoot = `${fixture.context.candidateAuthorityRoot}-symlink`;
  fs.symlinkSync(fixture.context.candidateAuthorityRoot, symlinkRoot, 'dir');
  assert.equal(canary.isC5V2ReusableCompletedRound(fixture.roundDir, {
    ...fixture.context,
    candidateAuthorityRoot: symlinkRoot,
  }), false);

  const symlinkAnchors = createBoundCompletedRound(canary);
  const anchorsPath = path.join(symlinkAnchors.context.candidateAuthorityRoot, 'anchors');
  const externalAnchorsPath = `${anchorsPath}-external`;
  fs.renameSync(anchorsPath, externalAnchorsPath);
  fs.symlinkSync(externalAnchorsPath, anchorsPath, 'dir');
  assert.equal(canary.isC5V2ReusableCompletedRound(symlinkAnchors.roundDir, symlinkAnchors.context), false);

  const nestedRoot = createBoundCompletedRound(canary);
  const nestedAuthorityRoot = path.join(nestedRoot.roundDir, '..authority-inside-round');
  fs.cpSync(nestedRoot.context.candidateAuthorityRoot, nestedAuthorityRoot, { recursive: true });
  assert.equal(canary.isC5V2ReusableCompletedRound(nestedRoot.roundDir, {
    ...nestedRoot.context,
    candidateAuthorityRoot: nestedAuthorityRoot,
  }), false);

  assert.throws(() => canary.writeC5V2ReturnApplyCandidateAuthorityAnchor({
    authorityRoot: fixture.context.candidateAuthorityRoot,
    campaignId: fixture.context.campaignId,
    roundId: '../round-escape',
    exactHead: fixture.context.exactHead,
    corpusDigest: fixture.context.corpusDigest,
    ledger: fixture.ledger,
    candidateAuthority: fixture.returnApplyCandidateAuthority,
    candidateAuthorityPath: fixture.files.candidateAuthority,
  }), /ROUND_ID_INVALID/u);
});

test('C5V2 physical run identity requires canonical realpath containment and verified T7 volume identity', async () => {
  const canary = await loadCanary();
  const diskInfo = [
    'Volume UUID: D1F2E2C1-3210-4A39-A4E0-0AA0AD5110E2',
    'File System Personality: APFS',
    'FileVault: Yes',
    'Volume Read-Only: No',
  ].join('\n');

  const parent = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'c5v2-run-root-'));
  const artifactRoot = path.join(parent, 'artifact-root');
  const outside = path.join(parent, 'outside-run');
  fs.mkdirSync(artifactRoot);
  fs.mkdirSync(outside);

  const symlinkRun = path.join(artifactRoot, 'symlink-run');
  fs.symlinkSync(outside, symlinkRun, 'dir');
  assert.throws(() => canary.resolveC5V2RunIdentity({
    artifactRoot,
    resumeRunDir: symlinkRun,
    requirePhysicalArtifactRoot: false,
  }), /C5V2_ARTIFACT_PATH_SYMLINK_COMPONENT/u);

  assert.throws(() => canary.resolveC5V2RunIdentity({
    artifactRoot,
    resumeRunDir: path.join(artifactRoot, '..', 'outside-run'),
    requirePhysicalArtifactRoot: false,
  }), /C5V2_RESUME_RUN_DIR_OUTSIDE_ARTIFACT_ROOT/u);

  const fakeT7 = path.join(parent, 'fake-t7');
  const fakeT7ArtifactRoot = path.join(fakeT7, 'storage', 'c5v2');
  fs.mkdirSync(fakeT7ArtifactRoot, { recursive: true });
  assert.equal(canary.verifyC5V2PhysicalArtifactRoot({
    artifactRoot: fakeT7ArtifactRoot,
    mountPath: fakeT7,
    expectedUuid: 'D1F2E2C1-3210-4A39-A4E0-0AA0AD5110E2',
    diskInfoText: diskInfo,
    requireT7: true,
  }).ok, true);

  assert.throws(() => canary.verifyC5V2PhysicalArtifactRoot({
    artifactRoot,
    mountPath: fakeT7,
    expectedUuid: 'D1F2E2C1-3210-4A39-A4E0-0AA0AD5110E2',
    diskInfoText: diskInfo,
    requireT7: true,
  }), /C5V2_ARTIFACT_ROOT_NOT_T7/u);

  assert.throws(() => canary.verifyC5V2PhysicalArtifactRoot({
    artifactRoot: fakeT7ArtifactRoot,
    mountPath: fakeT7,
    expectedUuid: 'D1F2E2C1-3210-4A39-A4E0-0AA0AD5110E2',
    diskInfoText: diskInfo.replace('D1F2E2C1-3210-4A39-A4E0-0AA0AD5110E2', '00000000-0000-0000-0000-000000000000'),
    requireT7: true,
  }), /C5V2_ARTIFACT_ROOT_T7_UUID_MISMATCH/u);

  assert.throws(() => canary.verifyC5V2PhysicalArtifactRoot({
    artifactRoot: fakeT7ArtifactRoot,
    mountPath: fakeT7,
    expectedUuid: 'D1F2E2C1-3210-4A39-A4E0-0AA0AD5110E2',
    diskInfoText: diskInfo.replace('FileVault: Yes', 'FileVault: No'),
    requireT7: true,
  }), /C5V2_ARTIFACT_ROOT_T7_FILEVAULT_REQUIRED/u);
});

test('C5V2 production-shaped reuse rejects recorded EXACT changed to BLOCKED under a rehashed v6 binding', async () => {
  const canary = await loadCanary();
  const fixture = createBoundCompletedRound(canary);
  fs.writeFileSync(
    fixture.files.wordOutput,
    'WORD_STATUS=PASS\nOP|op-exact-001|BLOCKED\nREADBACK|op-exact-001|EXACT|WORD_OBJECT_MODEL_REOPENED\n',
    'utf8',
  );
  rewriteBoundGate(canary, fixture, {
    wordOutputSha256: canary.sha256File(fixture.files.wordOutput),
  });

  assert.equal(canary.isC5V2ReusableCompletedRound(fixture.roundDir, fixture.context), false);
  assert.equal(canary.isC5V2RecordedOperationStatusGreen({
    expectedOutcome: 'EXACT',
    reportedStatus: 'BLOCKED',
    nativeReadbackStatus: 'EXACT',
  }), false);
});

test('C5V2 production-shaped reuse rejects same-count ledger operation id mutation with stored digests unchanged', async () => {
  const canary = await loadCanary();
  const fixture = createBoundCompletedRound(canary);
  const masterLedgerDigest = fixture.ledger.masterLedgerDigest;
  const ledgerDigest = fixture.ledger.ledgerDigest;
  fixture.ledger.operations[0].id = 'op-exact-mutated';
  writeJson(fixture.files.ledger, fixture.ledger);

  assert.equal(fixture.ledger.masterLedgerDigest, masterLedgerDigest);
  assert.equal(fixture.ledger.ledgerDigest, ledgerDigest);
  assert.equal(fixture.ledger.operations.length, 1);
  assert.equal(canary.isC5V2ReusableCompletedRound(fixture.roundDir, fixture.context), false);
});

test('C5V2 production-shaped reuse rejects same-count ledger scene mutation with stored digests unchanged', async () => {
  const canary = await loadCanary();
  const fixture = createBoundCompletedRound(canary);
  const masterLedgerDigest = fixture.ledger.masterLedgerDigest;
  const ledgerDigest = fixture.ledger.ledgerDigest;
  fixture.ledger.operations[0].sceneId = 'roman/chapter-99.txt';
  writeJson(fixture.files.ledger, fixture.ledger);

  assert.equal(fixture.ledger.masterLedgerDigest, masterLedgerDigest);
  assert.equal(fixture.ledger.ledgerDigest, ledgerDigest);
  assert.equal(fixture.ledger.operations.length, 1);
  assert.equal(canary.isC5V2ReusableCompletedRound(fixture.roundDir, fixture.context), false);
});

test('C5V2 v6 keyed anchor rejects same-count operation id and tracked-family mutation after ordinary evidence is refreshed', async () => {
  const canary = await loadCanary();
  const fixture = createBoundCompletedRound(canary, {
    operations: [{
      id: 'op-exact-001',
      formalFamily: 'tracked_text_edit',
      family: 'tracked_replace',
      expectedOutcome: 'EXACT',
      sceneId: 'roman/chapter-01.txt',
      quote: 'old text one',
      replacementText: 'new text one',
      semanticIntent: { kind: 'replace', replacementText: 'new text one' },
    }, {
      id: 'op-exact-002',
      formalFamily: 'tracked_text_edit',
      family: 'tracked_replace',
      expectedOutcome: 'EXACT',
      sceneId: 'roman/chapter-02.txt',
      quote: 'old text two',
      replacementText: 'new text two',
      semanticIntent: { kind: 'replace', replacementText: 'new text two' },
    }],
  });
  assert.equal(canary.isC5V2ReusableCompletedRound(fixture.roundDir, fixture.context), true);
  assert.equal(fixture.completedRoundReuseBinding.exactTotal, 2);

  const anchorPath = fixture.returnApplyCandidateAuthorityAnchorValidation.anchorArtifact.path;
  const oldAnchor = JSON.parse(fs.readFileSync(anchorPath, 'utf8'));
  const priorLedgerContentDigest = canary.resolveC5V2LedgerReuseDigest(fixture.ledger);
  fixture.ledger.operations[0] = {
    ...fixture.ledger.operations[0],
    id: 'op-exact-001-rebound',
    family: 'tracked_insert',
    semanticIntent: { kind: 'insert', replacementText: 'new text one' },
  };
  fixture.ledger.familyCounts = {
    tracked_insert: 1,
    tracked_replace: 1,
  };
  writeJson(fixture.files.ledger, fixture.ledger);
  const refreshedLedgerContentDigest = canary.resolveC5V2LedgerReuseDigest(fixture.ledger);
  assert.notEqual(refreshedLedgerContentDigest, priorLedgerContentDigest);
  assert.equal(fixture.ledger.operationCount, 2);
  assert.equal(fixture.ledger.operations.length, 2);

  fs.writeFileSync(fixture.files.wordOutput, [
    'WORD_STATUS=PASS',
    'OP|op-exact-001-rebound|EXACT',
    'OP|op-exact-002|EXACT',
    'READBACK|op-exact-001-rebound|EXACT|WORD_OBJECT_MODEL_REOPENED',
    'READBACK|op-exact-002|EXACT|WORD_OBJECT_MODEL_REOPENED',
    '',
  ].join('\n'), 'utf8');
  const oracle = JSON.parse(fs.readFileSync(fixture.files.oracle, 'utf8'));
  oracle.operationResults = oracle.operationResults.map((result) => (
    result.operationId === 'op-exact-001'
      ? { ...result, operationId: 'op-exact-001-rebound' }
      : result
  ));
  oracle.oracleDigest = canary.sha256Text(canary.stableCanonicalJson(oracle.operationResults));
  writeJson(fixture.files.oracle, oracle);
  const refreshedExactLedgerBinding = {
    ...fixture.exactLedgerBinding,
    exactOperationBindings: fixture.exactLedgerBinding.exactOperationBindings.map((binding) => (
      binding.operationId === 'op-exact-001'
        ? { ...binding, operationId: 'op-exact-001-rebound' }
        : binding
    )),
  };
  const authority = JSON.parse(fs.readFileSync(fixture.files.candidateAuthority, 'utf8'));
  assert.equal(canary.validateC5V2ExactLedgerBindingAgainstLedger(
    refreshedExactLedgerBinding,
    fixture.ledger,
    {
      candidateAuthority: authority,
      roundId: fixture.context.roundId,
    },
  ).ok, true, 'ordinary ledger and candidate evidence are internally consistent after refresh');
  rewriteBoundGate(canary, fixture, {
    ledgerContentDigest: refreshedLedgerContentDigest,
    wordOutputSha256: canary.sha256File(fixture.files.wordOutput),
    completeRoundOracleSha256: canary.sha256File(fixture.files.oracle),
    exactLedgerBinding: refreshedExactLedgerBinding,
  });

  assert.deepEqual(JSON.parse(fs.readFileSync(anchorPath, 'utf8')), oldAnchor);
  const anchorValidation = canary.validateC5V2ReturnApplyCandidateAuthorityAnchor({
    authorityRoot: fixture.context.candidateAuthorityRoot,
    campaignId: fixture.context.campaignId,
    roundId: fixture.context.roundId,
    exactHead: fixture.context.exactHead,
    corpusDigest: fixture.context.corpusDigest,
    ledger: fixture.ledger,
    candidateAuthority: authority,
    candidateAuthorityPath: fixture.files.candidateAuthority,
  });
  assert.equal(anchorValidation.ok, false);
  assert.equal(
    anchorValidation.failures.includes('C5V2_RETURN_APPLY_CANDIDATE_AUTHORITY_ANCHOR_LEDGER_CONTENT_DIGEST_MISMATCH'),
    true,
  );
  assert.equal(canary.isC5V2ReusableCompletedRound(fixture.roundDir, fixture.context), false);
});

test('C5V2 production-shaped reuse rejects complete oracle ok false under a rehashed v6 binding', async () => {
  const canary = await loadCanary();
  const fixture = createBoundCompletedRound(canary);
  const oracle = JSON.parse(fs.readFileSync(fixture.files.oracle, 'utf8'));
  oracle.ok = false;
  writeJson(fixture.files.oracle, oracle);
  rewriteBoundGate(canary, fixture, {
    completeRoundOracleSha256: canary.sha256File(fixture.files.oracle),
  });

  assert.equal(canary.isC5V2ReusableCompletedRound(fixture.roundDir, fixture.context), false);
});

test('C5V2 production-shaped reuse rejects gate and binding round-99 for current round-01', async () => {
  const canary = await loadCanary();
  const fixture = createBoundCompletedRound(canary);
  rewriteBoundGate(canary, fixture, { roundId: 'round-99' }, { roundId: 'round-99' });

  assert.equal(canary.isC5V2ReusableCompletedRound(fixture.roundDir, fixture.context), false);
});

test('C5V2 completed-round reuse is bound to current head, canary digest, status policy, corpus, and ledger', async () => {
  const canary = await loadCanary();
  const fixture = createBoundCompletedRound(canary);

  assert.equal(canary.isC5V2ReusableCompletedRound(fixture.roundDir, fixture.context), true);
  assert.equal(canary.isC5V2ReusableCompletedRound(fixture.roundDir, {
    ...fixture.context,
    exactHead: 'head-prior',
  }), false);
  assert.equal(canary.isC5V2ReusableCompletedRound(fixture.roundDir, {
    ...fixture.context,
    canaryScriptSha256: 'sha256:script-mismatch',
  }), false);
  assert.equal(canary.isC5V2ReusableCompletedRound(fixture.roundDir, {
    ...fixture.context,
    operationStatusPolicyBinding: { ...fixture.policy, version: `${fixture.policy.version}.stale` },
  }), false);
  assert.equal(canary.isC5V2ReusableCompletedRound(fixture.roundDir, {
    ...fixture.context,
    operationStatusPolicyBinding: { ...fixture.policy, digest: 'sha256:policy-mismatch' },
  }), false);
  assert.equal(canary.isC5V2ReusableCompletedRound(fixture.roundDir, {
    ...fixture.context,
    corpusDigest: 'sha256:corpus-mismatch',
  }), false);

});

test('C5V2 current bound completed round is reusable and carries only ledger-bound exact candidates', async () => {
  const canary = await loadCanary();
  const fixture = createBoundCompletedRound(canary);
  const yalkenTruthArtifact = {
    path: fixture.files.truth,
    sha256: canary.sha256File(fixture.files.truth),
  };
  const reused = canary.buildC5V2CompletedRoundReuseReturnApply({
    gate: fixture.gate,
    expectedReuseBinding: fixture.completedRoundReuseBinding,
    yalkenTruthArtifact,
    returnedDocxSha256: canary.sha256File(fixture.files.returned),
  });

  assert.equal(reused.ok, true);
  assert.equal(reused.resumedCompletedRound, true);
  assert.equal(reused.exactLedgerBinding.ok, true);
  assert.equal(canary.validateC5V2ExactLedgerBindingAgainstLedger(
    fixture.exactLedgerBinding,
    fixture.ledger,
  ).ok, false);
  assert.equal(canary.validateC5V2ExactLedgerBindingAgainstLedger(
    fixture.exactLedgerBinding,
    fixture.ledger,
    {
      candidateAuthority: fixture.returnApplyCandidateAuthority,
      roundId: fixture.context.roundId,
    },
  ).ok, true);
  assert.equal(canary.validateC5V2ExactLedgerBindingAgainstLedger({
    ...fixture.exactLedgerBinding,
    exactOperationBindings: [{
      operationId: 'op-exact-001',
      sceneId: 'roman/chapter-99.txt',
      changeId: 'change-exact-001',
    }],
  }, fixture.ledger, {
    candidateAuthority: fixture.returnApplyCandidateAuthority,
    roundId: fixture.context.roundId,
  }).ok, false);
  assert.equal(canary.validateC5V2ExactLedgerBindingAgainstLedger({
    ...fixture.exactLedgerBinding,
    exactOperationBindings: [{
      operationId: 'op-exact-001',
      sceneId: 'roman/chapter-01.txt',
      changeId: 'change-forged',
    }],
  }, fixture.ledger, {
    candidateAuthority: fixture.returnApplyCandidateAuthority,
    roundId: fixture.context.roundId,
  }).ok, false);
  assert.deepEqual(canary.deriveC5V2LedgerBoundExactSummary(reused), {
    ok: true,
    code: 'C5V2_EXACT_SUMMARY_LEDGER_BOUND',
    exactApplyTextChangeIdsByScene: {
      'roman/chapter-01.txt': ['change-exact-001'],
    },
    exactScenes: 1,
    exactTotal: 1,
  });
});

test('C5V2 activation-only candidates never contribute to exactTotal', async () => {
  const canary = await loadCanary();
  const summary = canary.deriveC5V2LedgerBoundExactSummary({
    ok: true,
    activation: {
      exactApplyTextChangeIdsByScene: {
        'roman/chapter-01.txt': ['raw-activation-only'],
      },
    },
  });

  assert.equal(summary.ok, false);
  assert.equal(summary.code, 'C5V2_EXACT_SUMMARY_LEDGER_BINDING_REQUIRED');
  assert.equal(summary.exactTotal, 0);
  assert.deepEqual(summary.exactApplyTextChangeIdsByScene, {});
});

test('C5V2 fresh status gate and comment lifecycle maturity remain fail-closed and intact', async () => {
  const canary = await loadCanary();
  assert.equal(canary.isC5V2RecordedOperationStatusGreen({
    expectedOutcome: 'EXACT',
    reportedStatus: 'EXACT',
    nativeReadbackStatus: 'EXACT',
  }), true);
  assert.equal(canary.isC5V2RecordedOperationStatusGreen({
    expectedOutcome: 'EXACT',
    reportedStatus: 'EXACT',
    nativeReadbackStatus: 'BLOCKED',
  }), false);
  assert.deepEqual(canary.deriveC5V2CommentLaneMaturity({
    ok: true,
    planSummary: { replyCount: 1, commentStateCount: 1 },
    semanticOracle: { rootApplied: 1, lifecycleApplied: 2, triangleGreen: true },
  }), {
    rootCommentsState: 'CANONICAL_ROOT_COMMENT_APPLY_AND_REPLAY_PROVEN',
    repliesState: 'CANONICAL_REPLY_APPLY_AND_REPLAY_PROVEN',
    commentState: 'CANONICAL_COMMENT_STATE_APPLY_AND_REPLAY_PROVEN',
    commentsRepliesState: 'CANONICAL_PRODUCT_APPLY_AND_REPLAY_PROVEN',
  });
});

test('C5V2 ledger reuse digest is identical for in-memory undefined keys and durable JSON form', async () => {
  const canary = await loadCanary();
  const inMemoryLedger = {
    schemaVersion: 'yalken.rtk.word.c5v2.physical-master-round-ledger.v1',
    operations: [
      { id: 'op-1', family: 'formatting', quote: 'nice', structuralParagraphScope: undefined },
      { id: 'op-2', family: 'tracked_replace', quote: 'old', replacementText: 'new', structuralParagraphScope: undefined },
    ],
  };
  const durableLedger = JSON.parse(JSON.stringify(inMemoryLedger));
  assert.equal('structuralParagraphScope' in durableLedger.operations[0], false);
  assert.equal(
    canary.resolveC5V2LedgerReuseDigest(inMemoryLedger),
    canary.resolveC5V2LedgerReuseDigest(durableLedger),
  );
  assert.notEqual(
    canary.resolveC5V2LedgerReuseDigest(durableLedger),
    canary.resolveC5V2LedgerReuseDigest({
      ...durableLedger,
      operations: [{ id: 'op-3', family: 'formatting', quote: 'nice' }, durableLedger.operations[1]],
    }),
  );
});

test('C5V2 production-shaped completed round with adapter-emitted undefined ledger keys is reusable', async () => {
  const canary = await loadCanary();
  const fixture = createBoundCompletedRound(canary, {
    operations: [{
      id: 'op-exact-001',
      formalFamily: 'tracked_text_edit',
      family: 'tracked_replace',
      expectedOutcome: 'EXACT',
      sceneId: 'roman/chapter-01.txt',
      quote: 'old text',
      replacementText: 'new text',
      structuralParagraphScope: undefined,
    }],
  });
  assert.equal('structuralParagraphScope' in fixture.ledger.operations[0], true);
  assert.equal('structuralParagraphScope' in JSON.parse(fs.readFileSync(fixture.files.ledger, 'utf8')).operations[0], false);
  assert.equal(canary.isC5V2ReusableCompletedRound(fixture.roundDir, fixture.context), true);
});

test('C5V2 completed round reuse accepts MANUAL-expected Word-blocked designed outcome and rejects inconsistent readback', async () => {
  const canary = await loadCanary();
  const fixture = createBoundCompletedRound(canary, {
    operations: [
      {
        id: 'op-exact-001',
        formalFamily: 'tracked_text_edit',
        family: 'tracked_replace',
        expectedOutcome: 'EXACT',
        sceneId: 'roman/chapter-01.txt',
        quote: 'old text',
        replacementText: 'new text',
      },
      {
        id: 'op-manual-001',
        formalFamily: 'tracked_text_edit',
        family: 'tracked_replace',
        expectedOutcome: 'MANUAL',
        sceneId: 'roman/chapter-01.txt',
        quote: 'h',
        replacementText: 'x',
      },
    ],
  });
  const productionExactLedgerBinding = {
    ...fixture.exactLedgerBinding,
    expectedOperationCount: 1,
    matchedOperationCount: 1,
    matchedChangeCount: 1,
    excludedCandidateCount: 0,
    exactApplyTextChangeIdsByScene: { 'roman/chapter-01.txt': ['change-exact-001'] },
    exactOperationBindings: [{
      operationId: 'op-exact-001',
      sceneId: 'roman/chapter-01.txt',
      changeId: 'change-exact-001',
    }],
  };
  const blockedWordOutput = [
    'WORD_STATUS=PASS',
    'OP|op-exact-001|EXACT',
    'OP|op-manual-001|BLOCKED',
    'READBACK|op-exact-001|EXACT|WORD_OBJECT_MODEL_REOPENED',
    'READBACK|op-manual-001|BLOCKED|WORD_OBJECT_MODEL_REOPENED',
    '',
  ].join('\n');
  const blockedOperationResults = [
    {
      operationId: 'op-exact-001',
      family: 'tracked_text_edit',
      expectedOutcome: 'EXACT',
      reportedStatus: 'EXACT',
      nativeReadbackStatus: 'EXACT',
      wordGreen: true,
      yalkenGreen: true,
    },
    {
      operationId: 'op-manual-001',
      family: 'tracked_text_edit',
      expectedOutcome: 'MANUAL',
      reportedStatus: 'BLOCKED',
      nativeReadbackStatus: 'BLOCKED',
      wordGreen: false,
      yalkenGreen: false,
    },
  ];
  const writeBlockedEvidence = (readbackStatus) => {
    fs.writeFileSync(fixture.files.wordOutput, blockedWordOutput.replace(
      'READBACK|op-manual-001|BLOCKED|',
      `READBACK|op-manual-001|${readbackStatus}|`,
    ), 'utf8');
    const results = blockedOperationResults.map((result) => (
      result.operationId === 'op-manual-001' ? { ...result, nativeReadbackStatus: readbackStatus } : result
    ));
    writeJson(fixture.files.oracle, {
      schemaVersion: 'yalken.rtk.word.c5v2.complete-round-oracle.v1',
      ok: true,
      operationCount: 2,
      wordStatusCount: 2,
      nativeWordReadbackCount: 2,
      duplicateWordStatuses: false,
      duplicateNativeReadbacks: false,
      semanticOracle: { ok: true, operationCount: 2, failures: [] },
      operationResults: results,
      oracleDigest: canary.sha256Text(canary.stableCanonicalJson(results)),
    });
    rewriteBoundGate(canary, fixture, {
      ok: true,
      exactLedgerBinding: productionExactLedgerBinding,
      exactTotal: 1,
      wordOutputSha256: canary.sha256File(fixture.files.wordOutput),
      completeRoundOracleSha256: canary.sha256File(fixture.files.oracle),
    }, { ok: true });
  };
  writeBlockedEvidence('BLOCKED');
  assert.equal(canary.isC5V2ReusableCompletedRound(fixture.roundDir, fixture.context), true);
  writeBlockedEvidence('MANUAL');
  assert.equal(canary.isC5V2ReusableCompletedRound(fixture.roundDir, fixture.context), false);
});

test('C5V2 cumulative child source completed-round reuse path never references parent-only sha256File', async () => {
  const canary = await loadCanary();
  const source = canary.createFullManuscriptExportChildSource({
    tempRoot: path.join(os.tmpdir(), 'c5v2-child-source-contract'),
    outPath: path.join(os.tmpdir(), 'c5v2-child-source-contract', 'source.docx'),
    returnedPath: path.join(os.tmpdir(), 'c5v2-child-source-contract', 'returned.docx'),
    returnedReadyPath: path.join(os.tmpdir(), 'c5v2-child-source-contract', 'returned-ready.json'),
    scenes: [{ file: 'roman/chapter-01.txt', text: 'scene text', rawContent: 'scene text' }],
    rounds: [{
      roundIndex: 0,
      roundId: 'round-01',
      outPath: path.join(os.tmpdir(), 'c5v2-child-source-contract', 'source.docx'),
      returnedPath: path.join(os.tmpdir(), 'c5v2-child-source-contract', 'returned.docx'),
      returnedReadyPath: path.join(os.tmpdir(), 'c5v2-child-source-contract', 'returned-ready.json'),
      oracleGatePath: path.join(os.tmpdir(), 'c5v2-child-source-contract', 'complete-round-oracle-gate.json'),
      resumeCompletedRound: true,
      completedRoundReuseBinding: null,
    }],
  });
  assert.match(source, /function sha256ChildFile\(/u);
  assert.match(source, /\? sha256ChildFile\(returnedPath\) : ''/u);
  assert.doesNotMatch(source, /[^a-zA-Z]sha256File\(/u);
  assert.doesNotMatch(source, /[^a-zA-Z]sha256Text\(/u);
  const syntaxPath = path.join(os.tmpdir(), 'c5v2-child-source-contract-syntax.cjs');
  fs.writeFileSync(syntaxPath, source, 'utf8');
  const syntax = spawnSync(process.execPath, ['--check', syntaxPath], { encoding: 'utf8' });
  assert.equal(syntax.status, 0, syntax.stderr);
});

test('C5V2 resume disposition: pristine sealed round REUSE, tampered sealed round STOP, unsealed round INCOMPLETE_LIVE', async () => {
  const canary = await loadCanary();
  assert.equal(typeof canary.resolveC5V2CompletedRoundResumeDisposition, 'function');
  const fixture = createBoundCompletedRound(canary);
  const pristine = canary.resolveC5V2CompletedRoundResumeDisposition(fixture.roundDir, fixture.context);
  assert.equal(pristine.disposition, 'REUSE');

  const tampered = createBoundCompletedRound(canary);
  fs.appendFileSync(tampered.files.wordOutput, 'OP|tampered-extra|EXACT\n', 'utf8');
  const stopped = canary.resolveC5V2CompletedRoundResumeDisposition(tampered.roundDir, tampered.context);
  assert.equal(stopped.disposition, 'STOP');
  assert.match(stopped.reason, /C5V2_COMPLETED_ROUND_SEALED_BUT_INVALID/u);

  const incomplete = createBoundCompletedRound(canary);
  fs.unlinkSync(incomplete.files.gate);
  const live = canary.resolveC5V2CompletedRoundResumeDisposition(incomplete.roundDir, incomplete.context);
  assert.equal(live.disposition, 'INCOMPLETE_LIVE');
});

test('C5V2 explainC5V2ReusableCompletedRound returns exact failure reason for sealed tampered round', async () => {
  const canary = await loadCanary();
  assert.equal(typeof canary.explainC5V2ReusableCompletedRound, 'function');
  const fixture = createBoundCompletedRound(canary);
  const okResult = canary.explainC5V2ReusableCompletedRound(fixture.roundDir, fixture.context);
  assert.equal(okResult.ok, true);
  fs.appendFileSync(fixture.files.wordOutput, 'OP|tampered-extra|EXACT\n', 'utf8');
  const badResult = canary.explainC5V2ReusableCompletedRound(fixture.roundDir, fixture.context);
  assert.equal(badResult.ok, false);
  assert.equal(typeof badResult.code, 'string');
  assert.ok(badResult.code.length > 0);
  assert.equal(canary.isC5V2ReusableCompletedRound(fixture.roundDir, fixture.context), false);
});

test('C5V2 cumulative child source refuses to purge a sealed round for live rerun', async () => {
  const canary = await loadCanary();
  const source = canary.createFullManuscriptExportChildSource({
    tempRoot: path.join(os.tmpdir(), 'c5v2-child-sealed-guard'),
    outPath: path.join(os.tmpdir(), 'c5v2-child-sealed-guard', 'source.docx'),
    returnedPath: path.join(os.tmpdir(), 'c5v2-child-sealed-guard', 'returned.docx'),
    returnedReadyPath: path.join(os.tmpdir(), 'c5v2-child-sealed-guard', 'returned-ready.json'),
    scenes: [{ file: 'roman/chapter-01.txt', text: 'scene text', rawContent: 'scene text' }],
    rounds: [{
      roundIndex: 0,
      roundId: 'round-01',
      outPath: path.join(os.tmpdir(), 'c5v2-child-sealed-guard', 'source.docx'),
      returnedPath: path.join(os.tmpdir(), 'c5v2-child-sealed-guard', 'returned.docx'),
      returnedReadyPath: path.join(os.tmpdir(), 'c5v2-child-sealed-guard', 'returned-ready.json'),
      oracleGatePath: path.join(os.tmpdir(), 'c5v2-child-sealed-guard', 'complete-round-oracle-gate.json'),
      resumeCompletedRound: false,
      completedRoundReuseBinding: null,
    }],
  });
  assert.match(source, /C5V2_SEALED_ROUND_LIVE_RERUN_FORBIDDEN/u);
});
