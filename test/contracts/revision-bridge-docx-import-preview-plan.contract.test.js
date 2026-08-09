const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const ROOT = path.resolve(__dirname, '..', '..');
const MODULE_PATH = path.join(ROOT, 'src', 'io', 'revisionBridge', 'index.mjs');
const SECTION_START = '// RB_12_DOCX_IMPORT_PREVIEW_PLAN_START';
const SECTION_END = '// RB_12_DOCX_IMPORT_PREVIEW_PLAN_END';

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

function stableHash(value) {
  let hash = 2166136261;
  const text = String(value);
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = (hash * 16777619) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

function normalizeText(value) {
  return String(value ?? '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

function paragraph(order, rawText) {
  const text = normalizeText(rawText);
  return {
    order,
    sourcePart: 'word/document.xml',
    text,
    textHash: stableHash(text),
    charCount: text.length,
  };
}

function contentPreviewReport(paragraphTexts, overrides = {}) {
  const paragraphs = paragraphTexts.map((text, index) => paragraph(index, text));
  const joinedText = paragraphs.map((item) => item.text).join('\n');
  return {
    ok: true,
    schemaVersion: 'revision-bridge.docx-content-preview.v1',
    type: 'docxContentPreviewReport',
    status: 'preview',
    code: 'DOCX_CONTENT_PREVIEW_READY',
    reason: 'DOCX_CONTENT_PREVIEW_READY',
    decision: 'preview',
    diagnostics: overrides.diagnostics || [],
    evidence: [
      {
        kind: 'contentPreview',
        paragraphCount: paragraphs.length,
        textLength: joinedText.length,
        textHash: stableHash(joinedText),
      },
    ],
    budgets: {
      maxParagraphs: 64000,
      maxTextChars: 5000000,
      maxDiagnostics: 200,
    },
    preflightSummary: {
      status: 'accepted',
      decision: 'accept',
      code: 'DOCX_INTAKE_PREFLIGHT_ACCEPTED',
      gatePass: true,
      parserCandidateOnly: true,
    },
    contentPreview: {
      sourcePart: 'word/document.xml',
      paragraphCount: paragraphs.length,
      textLength: joinedText.length,
      textHash: stableHash(joinedText),
      paragraphs,
    },
    parse: {
      attempted: true,
      completed: true,
    },
    ...overrides.reportOverrides,
  };
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
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

function assertDocxImportPreviewShell(result) {
  assert.equal(result.schemaVersion, 'revision-bridge.docx-import-preview.v1');
  assert.equal(result.type, 'docx.import.preview');
  assert.equal(result.writeEffects, false);
  assert.match(result.previewHash, /^[a-f0-9]{8}$/u);
  assert.equal(Object.prototype.hasOwnProperty.call(result, 'safeCreatePlan'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(result, 'writeReceipt'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(result, 'importReceipt'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(result, 'applyOps'), false);
}

test('DOCX import preview plan: exports bounded helper and schema', async () => {
  const bridge = await loadBridge();

  assert.equal(bridge.DOCX_IMPORT_PREVIEW_SCHEMA, 'revision-bridge.docx-import-preview.v1');
  assert.equal(typeof bridge.buildDocxImportPreviewPlanFromContentPreview, 'function');
});

test('DOCX import preview plan: clean content preview becomes deterministic single-scene candidate only', async () => {
  const bridge = await loadBridge();
  const source = contentPreviewReport(['Alpha', 'Bravo']);
  const before = clone(source);
  const first = bridge.buildDocxImportPreviewPlanFromContentPreview(source);
  const second = bridge.buildDocxImportPreviewPlanFromContentPreview(source);

  assert.deepEqual(source, before);
  assert.deepEqual(first, second);
  assertDocxImportPreviewShell(first);
  assert.equal(first.ok, true);
  assert.equal(first.status, 'preview');
  assert.equal(first.decision, 'preview');
  assert.equal(first.code, 'DOCX_IMPORT_PREVIEW_READY');
  assert.equal(first.source.schemaVersion, 'revision-bridge.docx-content-preview.v1');
  assert.equal(first.source.type, 'docxContentPreviewReport');
  assert.equal(first.source.sourcePart, 'word/document.xml');
  assert.equal(first.source.paragraphCount, 2);
  assert.equal(first.candidateCreatePlan.mode, 'create-only');
  assert.equal(first.candidateCreatePlan.sceneStrategy, 'single-scene');
  assert.equal(first.candidateCreatePlan.entryCount, 1);
  assert.equal(first.candidateCreatePlan.entries.length, 1);
  assert.match(first.candidateCreatePlan.entries[0].sceneId, /^docx-import-scene-[a-f0-9]{8}$/u);
  assert.equal(first.candidateCreatePlan.entries[0].kind, 'scene');
  assert.equal(first.candidateCreatePlan.entries[0].content, 'Alpha\n\nBravo');
  assert.match(first.candidateCreatePlan.entries[0].contentTextHash, /^[a-f0-9]{8}$/u);
  assert.deepEqual(first.candidateCreatePlan.entries[0].source.paragraphRange, { start: 0, end: 1 });
  assert.equal(first.lossReport.schemaVersion, 'revision-bridge.docx-import-preview.loss-report.v1');
  assert.equal(first.lossReport.mode, 'plain-text-only');
  assert.equal(
    first.lossReport.items.some((item) => item.code === 'DOCX_IMPORT_PREVIEW_PLAIN_TEXT_ONLY'),
    true,
  );
  assert.equal(first.evidence.some((item) => item.kind === 'candidateCreatePlan'), true);

  // GENERIC-01 (G1 amendment): full SHA-256 candidate content identity. The
  // 8-hex contentTextHash stays as a deterministic legacy preview hash; the
  // 64-hex candidateContentSha256 is the full identity. It is always present
  // (computed from the normalized importable text) even when the source report
  // does not carry an artifact SHA.
  assert.match(
    first.candidateCreatePlan.entries[0].candidateContentSha256,
    /^[a-f0-9]{64}$/u,
  );
  assert.equal(
    first.candidateCreatePlan.entries[0].candidateContentSha256
      !== first.candidateCreatePlan.entries[0].contentTextHash,
    true,
    'candidateContentSha256 (64 hex) must be distinct from contentTextHash (8 hex)',
  );

  // GENERIC-01 (G1 amendment): when the source report carries a full artifact
  // SHA-256, the preview plan threads it into plan.source and derives sceneId
  // from it (distinct artifacts -> distinct sceneIds).
  const withArtifactSha = contentPreviewReport(['Alpha', 'Bravo'], {
    reportOverrides: {
      sourceArtifactSha256: 'a'.repeat(64),
    },
  });
  const planFromArtifact = bridge.buildDocxImportPreviewPlanFromContentPreview(withArtifactSha);
  assert.equal(planFromArtifact.ok, true);
  assert.match(planFromArtifact.source.sourceArtifactSha256, /^[a-f0-9]{64}$/u);
  assert.equal(planFromArtifact.source.sourceArtifactSha256, 'a'.repeat(64));
  assert.equal(
    planFromArtifact.candidateCreatePlan.entries[0].sceneId,
    `docx-import-scene-${'a'.repeat(64).slice(0, 8)}`,
    'sceneId must derive from the full artifact SHA-256',
  );

  // Distinct raw artifacts (same text, different artifact SHA) yield distinct
  // sceneIds — the 32-bit collision defect is fixed.
  const distinctArtifact = contentPreviewReport(['Alpha', 'Bravo'], {
    reportOverrides: {
      sourceArtifactSha256: 'b'.repeat(64),
    },
  });
  const planDistinct = bridge.buildDocxImportPreviewPlanFromContentPreview(distinctArtifact);
  assert.notEqual(
    planFromArtifact.candidateCreatePlan.entries[0].sceneId,
    planDistinct.candidateCreatePlan.entries[0].sceneId,
    'distinct artifact SHA-256 must yield distinct sceneIds',
  );

  // GENERIC-01 (G6 amendment): carrier-ignored classification threads through.
  assert.equal(planFromArtifact.carrierIgnored, null);
  const withCarrier = contentPreviewReport(['Alpha', 'Bravo'], {
    reportOverrides: {
      carrierIgnored: { ignored: true, reason: 'DOCX_IMPORT_CARRIER_IGNORED_GENERIC_ROUTE', tokenDetected: true },
    },
  });
  const planWithCarrier = bridge.buildDocxImportPreviewPlanFromContentPreview(withCarrier);
  assert.equal(planWithCarrier.carrierIgnored.ignored, true);
  assert.equal(planWithCarrier.carrierIgnored.reason, 'DOCX_IMPORT_CARRIER_IGNORED_GENERIC_ROUTE');
});

test('DOCX import preview plan: blocked, malformed, or layer-leaking source reports fail closed', async () => {
  const bridge = await loadBridge();
  const blocked = bridge.buildDocxImportPreviewPlanFromContentPreview({
    ...contentPreviewReport(['Hidden']),
    ok: false,
    status: 'blocked',
    decision: 'blocked',
    code: 'DOCX_CONTENT_PREVIEW_PREFLIGHT_BLOCKED',
    contentPreview: null,
  });
  const malformed = bridge.buildDocxImportPreviewPlanFromContentPreview({
    ...contentPreviewReport(['Hidden']),
    schemaVersion: 'not-docx-content-preview',
  });
  const leaked = bridge.buildDocxImportPreviewPlanFromContentPreview({
    ...contentPreviewReport(['Hidden']),
    writeEffects: true,
  });
  const pathLeak = bridge.buildDocxImportPreviewPlanFromContentPreview(contentPreviewReport(['Hidden'], {
    diagnostics: [
      {
        code: 'DOCX_CONTENT_PREVIEW_UNSUPPORTED_STRUCTURE_DIAGNOSTIC',
        severity: 'warning',
        sourcePart: 'word/document.xml',
        tagName: 'w:tbl',
        path: 'secret.docx',
      },
    ],
  }));
  const storageLeak = bridge.buildDocxImportPreviewPlanFromContentPreview(contentPreviewReport(['Hidden'], {
    diagnostics: [
      {
        code: 'DOCX_CONTENT_PREVIEW_UNSUPPORTED_STRUCTURE_DIAGNOSTIC',
        severity: 'warning',
        sourcePart: 'word/document.xml',
        tagName: 'w:tbl',
        storage: { projectRoot: '/tmp/project' },
      },
    ],
  }));

  for (const result of [blocked, malformed, leaked, pathLeak, storageLeak]) {
    assertDocxImportPreviewShell(result);
    assert.equal(result.ok, false);
    assert.equal(result.status, 'blocked');
    assert.equal(result.decision, 'blocked');
    assert.equal(result.candidateCreatePlan, null);
    assert.equal(result.lossReport, null);
  }
  assert.equal(blocked.code, 'DOCX_IMPORT_PREVIEW_SOURCE_BLOCKED');
  assert.equal(blocked.diagnostics[0].sourceCode, 'DOCX_CONTENT_PREVIEW_PREFLIGHT_BLOCKED');
  assert.equal(malformed.code, 'DOCX_IMPORT_PREVIEW_INPUT_INVALID');
  assert.equal(malformed.diagnostics[0].field, 'schemaVersion');
  assert.equal(leaked.code, 'DOCX_IMPORT_PREVIEW_INPUT_LAYER_LEAK');
  assert.equal(leaked.diagnostics[0].field, 'writeEffects');
  assert.equal(pathLeak.code, 'DOCX_IMPORT_PREVIEW_INPUT_LAYER_LEAK');
  assert.equal(pathLeak.diagnostics[0].field, 'diagnostics.0.path');
  assert.equal(storageLeak.code, 'DOCX_IMPORT_PREVIEW_INPUT_LAYER_LEAK');
  assert.equal(storageLeak.diagnostics[0].field, 'diagnostics.0.storage');
});

test('DOCX import preview plan: tampered paragraph or aggregate hashes never become candidates', async () => {
  const bridge = await loadBridge();
  const badParagraphHash = contentPreviewReport(['Alpha']);
  badParagraphHash.contentPreview.paragraphs[0].textHash = '00000000';
  const badAggregateHash = contentPreviewReport(['Alpha', 'Bravo']);
  badAggregateHash.contentPreview.textHash = '00000000';
  const badCount = contentPreviewReport(['Alpha']);
  badCount.contentPreview.paragraphCount = 2;

  for (const input of [badParagraphHash, badAggregateHash, badCount]) {
    const result = bridge.buildDocxImportPreviewPlanFromContentPreview(input);
    assertDocxImportPreviewShell(result);
    assert.equal(result.ok, false);
    assert.equal(result.code, 'DOCX_IMPORT_PREVIEW_CONTENT_INVALID');
    assert.equal(result.candidateCreatePlan, null);
  }
});

test('DOCX import preview plan: contradictory source lineage never becomes a candidate', async () => {
  const bridge = await loadBridge();
  const blockedPreflight = contentPreviewReport(['Hidden']);
  blockedPreflight.preflightSummary = {
    status: 'blocked',
    decision: 'blocked',
    code: 'DOCX_CONTENT_PREVIEW_PREFLIGHT_BLOCKED',
    gatePass: false,
    parserCandidateOnly: false,
  };
  const incompleteParse = contentPreviewReport(['Hidden']);
  incompleteParse.parse = {
    attempted: true,
    completed: false,
  };
  const missingParse = contentPreviewReport(['Hidden']);
  delete missingParse.parse;

  for (const input of [blockedPreflight, incompleteParse, missingParse]) {
    const result = bridge.buildDocxImportPreviewPlanFromContentPreview(input);
    assertDocxImportPreviewShell(result);
    assert.equal(result.ok, false);
    assert.equal(result.code, 'DOCX_IMPORT_PREVIEW_SOURCE_BLOCKED');
    assert.equal(result.candidateCreatePlan, null);
  }
  assert.equal(
    bridge.buildDocxImportPreviewPlanFromContentPreview(blockedPreflight).diagnostics[0].field,
    'preflightSummary',
  );
  assert.equal(
    bridge.buildDocxImportPreviewPlanFromContentPreview(incompleteParse).diagnostics[0].field,
    'parse',
  );
});

test('DOCX import preview plan: unsupported content preview diagnostics become explicit loss report items', async () => {
  const bridge = await loadBridge();
  const result = bridge.buildDocxImportPreviewPlanFromContentPreview(contentPreviewReport(['Before', 'After'], {
    diagnostics: [
      {
        code: 'DOCX_CONTENT_PREVIEW_UNSUPPORTED_STRUCTURE_DIAGNOSTIC',
        severity: 'warning',
        sourcePart: 'word/document.xml',
        tagName: 'w:tbl',
      },
      {
        code: 'DOCX_CONTENT_PREVIEW_UNSUPPORTED_STRUCTURE_DIAGNOSTIC',
        severity: 'warning',
        sourcePart: 'word/document.xml',
        tagName: 'w:ins',
      },
    ],
  }));

  assertDocxImportPreviewShell(result);
  assert.equal(result.ok, true);
  assert.equal(result.candidateCreatePlan.entries[0].content, 'Before\n\nAfter');
  assert.equal(result.lossReport.items.some((item) => (
    item.code === 'DOCX_IMPORT_PREVIEW_TABLE_NOT_IMPORTED'
    && item.category === 'table'
    && item.tagName === 'w:tbl'
  )), true);
  assert.equal(result.lossReport.items.some((item) => (
    item.code === 'DOCX_IMPORT_PREVIEW_REVISIONS_NOT_IMPORTED'
    && item.category === 'revisions'
    && item.tagName === 'w:ins'
  )), true);
});

test('DOCX import preview plan: empty content stays preview-only and explicit', async () => {
  const bridge = await loadBridge();
  const result = bridge.buildDocxImportPreviewPlanFromContentPreview(contentPreviewReport([]));

  assertDocxImportPreviewShell(result);
  assert.equal(result.ok, true);
  assert.equal(result.candidateCreatePlan.entries.length, 1);
  assert.equal(result.candidateCreatePlan.entries[0].content, '');
  assert.deepEqual(result.candidateCreatePlan.entries[0].source.paragraphRange, { start: -1, end: -1 });
  assert.equal(result.lossReport.items.some((item) => (
    item.code === 'DOCX_IMPORT_PREVIEW_EMPTY_CONTENT_DIAGNOSTIC'
    && item.severity === 'warning'
  )), true);
});

test('DOCX import preview plan: result and implementation stay out of UI apply storage and export layers', async () => {
  const bridge = await loadBridge();
  const result = bridge.buildDocxImportPreviewPlanFromContentPreview(contentPreviewReport(['Safe']));
  const resultKeys = collectKeys(result);
  const forbiddenResultKeys = [
    'safeCreatePlan',
    'applyOps',
    'applyPlan',
    'canApply',
    'canImportMutate',
    'canWriteStorage',
    'writeReceipt',
    'importReceipt',
    'exportReceipt',
    'path',
    'filePath',
    'projectRoot',
    'storage',
    'renderer',
    'preload',
    'reviewPacket',
    'reviewSurface',
    'parsedReviewSurface',
  ];

  for (const forbidden of forbiddenResultKeys) {
    assert.equal(resultKeys.some((key) => key === forbidden || key.endsWith(`.${forbidden}`)), false, forbidden);
  }

  const section = extractMarkedSection(readBridgeSource(), SECTION_START, SECTION_END);
  const forbiddenRuntimeMarkers = [
    'fs.',
    'readFile',
    'writeFile',
    'ipc',
    'electron',
    'fetch',
    'http',
    'https',
    'DOMParser',
    'XMLParser',
    'xmldom',
    'fast-xml-parser',
    'sanitizePathFieldsWithinRoot',
    'writeFlowSceneBatchAtomic',
    'applyMarkdownImportSafeCreate',
    'buildDocxMinBuffer',
    'handleReviewSurfaceImportPacketCommandSurface',
    'exactTextMinSafeWrite',
  ];

  for (const marker of forbiddenRuntimeMarkers) {
    assert.equal(section.includes(marker), false, `${marker} must stay out of import preview plan contour`);
  }
});
