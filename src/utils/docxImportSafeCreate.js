const fs = require('node:fs').promises;
const path = require('node:path');
const crypto = require('node:crypto');

const {
  isPathInsideBoundary,
  joinPathSegmentsWithinRoot,
} = require('../core/io/path-boundary');
const { writeFlowSceneBatchAtomic } = require('./flowSceneBatchAtomic');

const DOCX_IMPORT_SAFE_CREATE_RECEIPT_SCHEMA = 'revision-bridge.docx-import-safe-create-receipt.v1';
const DOCX_IMPORT_SAFE_CREATE_RECEIPT_TYPE = 'docx.import.safeCreate.receipt';
const DOCX_IMPORT_SAFE_CREATE_READY_REASON = 'DOCX_IMPORT_SAFE_CREATE_APPLIED';
const DOCX_IMPORT_PREVIEW_SCHEMA = 'revision-bridge.docx-import-preview.v1';
const DOCX_IMPORT_PREVIEW_TYPE = 'docx.import.preview';
const DOCX_IMPORT_PREVIEW_READY_CODE = 'DOCX_IMPORT_PREVIEW_READY';
const DOCX_IMPORT_PREVIEW_LOSS_REPORT_SCHEMA = 'revision-bridge.docx-import-preview.loss-report.v1';
const DOCX_CONTENT_PREVIEW_SCHEMA = 'revision-bridge.docx-content-preview.v1';
const DOCX_CONTENT_PREVIEW_TYPE = 'docxContentPreviewReport';
const DOCX_CONTENT_PREVIEW_SOURCE_PART = 'word/document.xml';
const DOCX_IMPORT_SAFE_CREATE_ADMISSION_LIMIT = 64;
const DOCX_IMPORT_SAFE_CREATE_MESSAGE_CODE_RE = /^(DOCX|FLOW)_[A-Z0-9_]{1,95}$/u;
const docxImportPreviewPlanAdmissions = new Map();

// GENERIC-01 (Pass 2): durable receipt store. The store is keyed by the
// main-owned importOperationId. Re-applying the same operation id returns the
// prior durable receipt (writerCalls=0); a new operation id on the same
// artifact produces an independent copy.
const DOCX_IMPORT_RECEIPT_V2_SCHEMA = 'revision-bridge.docx-import-receipt.v2';
const DOCX_IMPORT_RECEIPT_STORE_DIRNAME = path.join('.yalken', 'docx-import', 'receipts');

const DOCX_IMPORT_SAFE_CREATE_ALLOWED_PLAN_KEYS = new Set([
  'ok',
  'schemaVersion',
  'type',
  'status',
  'code',
  'reason',
  'decision',
  'writeEffects',
  'diagnostics',
  'evidence',
  'budgets',
  'source',
  'candidateCreatePlan',
  'lossReport',
  'previewHash',
  // GENERIC-01 (G6): carrier-ignored classification.
  'carrierIgnored',
]);
const DOCX_IMPORT_SAFE_CREATE_ALLOWED_ENTRY_KEYS = new Set([
  'sceneId',
  'kind',
  'title',
  'content',
  'contentTextHash',
  // GENERIC-01 (G1): full SHA-256 of the normalized importable content.
  'candidateContentSha256',
  'source',
]);
const DOCX_IMPORT_SAFE_CREATE_ALLOWED_ENTRY_SOURCE_KEYS = new Set([
  'schemaVersion',
  'type',
  'sourcePart',
  'paragraphRange',
  'paragraphCount',
  'textHash',
]);
const DOCX_IMPORT_SAFE_CREATE_FORBIDDEN_KEYS = new Set([
  'reviewPacket',
  'reviewSurface',
  'parsedReviewSurface',
  'activeReviewSession',
  'previewInput',
  'applyOps',
  'applyPlan',
  'canApply',
  'canCreateReviewPacket',
  'canPreviewApply',
  'canImportMutate',
  'canWriteStorage',
  'writeReceipt',
  'importReceipt',
  'exportReceipt',
  'safeCreatePlan',
  'rawBytes',
  'bufferSource',
  'filePath',
  'projectRoot',
  'packageInspection',
  'partPolicy',
  'intakePreflightReport',
  'docxIntakePreflightReport',
  'outPath',
  'outDir',
  'storage',
  'renderer',
  'preload',
  'path',
  'bytes',
  'zip',
]);

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function cloneJsonSafe(value) {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value));
}

function normalizeText(value) {
  return String(value ?? '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

function stableSort(value) {
  if (Array.isArray(value)) return value.map((entry) => stableSort(entry));
  if (!isPlainObject(value)) return value;
  const out = {};
  for (const key of Object.keys(value).sort((left, right) => left.localeCompare(right))) {
    out[key] = stableSort(value[key]);
  }
  return out;
}

function stableStringify(value) {
  return JSON.stringify(stableSort(value));
}

function sha256Text(value) {
  return crypto.createHash('sha256').update(normalizeText(value), 'utf8').digest('hex');
}

function hashDocxImportPreviewPlanForAdmission(plan) {
  if (!isPlainObject(plan)) return '';
  try {
    return sha256Text(stableStringify(plan));
  } catch {
    return '';
  }
}

function rememberDocxImportPreviewPlanAdmission(plan) {
  const admissionHash = hashDocxImportPreviewPlanForAdmission(plan);
  if (!admissionHash) return '';
  docxImportPreviewPlanAdmissions.delete(admissionHash);
  docxImportPreviewPlanAdmissions.set(admissionHash, true);
  while (docxImportPreviewPlanAdmissions.size > DOCX_IMPORT_SAFE_CREATE_ADMISSION_LIMIT) {
    const firstKey = docxImportPreviewPlanAdmissions.keys().next().value;
    docxImportPreviewPlanAdmissions.delete(firstKey);
  }
  return admissionHash;
}

function isDocxImportPreviewPlanAdmitted(plan) {
  const admissionHash = hashDocxImportPreviewPlanForAdmission(plan);
  if (!admissionHash || !docxImportPreviewPlanAdmissions.has(admissionHash)) {
    return false;
  }
  docxImportPreviewPlanAdmissions.delete(admissionHash);
  docxImportPreviewPlanAdmissions.set(admissionHash, true);
  return true;
}

function docxStableHash(value) {
  let hash = 2166136261;
  const text = String(value);
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = (hash * 16777619) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

function docxCanonicalJson(value) {
  if (value === null) return 'null';
  const valueType = typeof value;
  if (valueType === 'string') return JSON.stringify(value);
  if (valueType === 'number') return Number.isFinite(value) ? JSON.stringify(value) : 'null';
  if (valueType === 'boolean') return value ? 'true' : 'false';
  if (Array.isArray(value)) return `[${value.map((item) => docxCanonicalJson(item)).join(',')}]`;
  if (isPlainObject(value)) {
    return `{${Object.keys(value).sort().map((key) => (
      `${JSON.stringify(key)}:${docxCanonicalJson(value[key])}`
    )).join(',')}}`;
  }
  return 'null';
}

function recomputeDocxImportPreviewHash(plan) {
  const body = cloneJsonSafe(plan);
  delete body.previewHash;
  return docxStableHash(docxCanonicalJson(body));
}

function buildError(code, reason, details = {}) {
  return {
    ok: false,
    error: {
      code,
      reason,
      details,
    },
  };
}

function sanitizePublicErrorDetails(details) {
  if (!isPlainObject(details)) return {};
  const result = {};
  if (typeof details.field === 'string') result.field = details.field;
  if (Array.isArray(details.fields)) {
    result.fields = details.fields.filter((item) => typeof item === 'string');
  }
  if (typeof details.key === 'string') result.key = details.key;
  if (Number.isInteger(details.index)) result.index = details.index;
  if (typeof details.sceneId === 'string') result.sceneId = details.sceneId;
  if (Number.isInteger(details.maxChars)) result.maxChars = details.maxChars;
  if (Number.isInteger(details.payloadChars)) result.payloadChars = details.payloadChars;
  if (typeof details.expected === 'string' && /^[a-f0-9]{8,64}$/u.test(details.expected)) {
    result.expected = details.expected;
  }
  if (typeof details.failReason === 'string') result.failReason = details.failReason;
  if (typeof details.batchId === 'string') result.batchId = details.batchId;
  if (Array.isArray(details.staleMarkers)) {
    result.staleMarkerCount = details.staleMarkers.length;
  }
  return result;
}

async function pathExists(targetPath) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

function unsupportedKeys(value, allowedKeys) {
  if (!isPlainObject(value)) return [];
  return Object.keys(value).filter((key) => !allowedKeys.has(key)).sort();
}

function findForbiddenKey(value, pathParts = []) {
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      const nested = findForbiddenKey(value[index], pathParts.concat(String(index)));
      if (nested) return nested;
    }
    return '';
  }
  if (!isPlainObject(value)) return '';

  for (const key of Object.keys(value)) {
    const nextPath = pathParts.concat(key);
    const isAllowedTopLevelWriteEffects = pathParts.length === 0 && key === 'writeEffects';
    if (!isAllowedTopLevelWriteEffects && DOCX_IMPORT_SAFE_CREATE_FORBIDDEN_KEYS.has(key)) {
      return nextPath.join('.');
    }
    const nested = findForbiddenKey(value[key], nextPath);
    if (nested) return nested;
  }
  return '';
}

function validateDocxImportPreviewPlan(plan) {
  if (!isPlainObject(plan)) {
    return buildError(
      'DOCX_SAFE_CREATE_PREVIEW_REQUIRED',
      'docx_import_safe_create_preview_required',
    );
  }

  const forbiddenKey = findForbiddenKey(plan);
  if (forbiddenKey) {
    return buildError(
      'DOCX_SAFE_CREATE_PREVIEW_FORBIDDEN_FIELD',
      'docx_import_safe_create_preview_forbidden_field',
      { key: forbiddenKey },
    );
  }

  const extraPlanKeys = unsupportedKeys(plan, DOCX_IMPORT_SAFE_CREATE_ALLOWED_PLAN_KEYS);
  if (extraPlanKeys.length > 0) {
    return buildError(
      'DOCX_SAFE_CREATE_PREVIEW_INVALID',
      'docx_import_safe_create_preview_unsupported_fields',
      { fields: extraPlanKeys },
    );
  }

  if (
    plan.schemaVersion !== DOCX_IMPORT_PREVIEW_SCHEMA
    || plan.type !== DOCX_IMPORT_PREVIEW_TYPE
    || plan.ok !== true
    || plan.status !== 'preview'
    || plan.code !== DOCX_IMPORT_PREVIEW_READY_CODE
    || plan.decision !== 'preview'
    || plan.writeEffects !== false
  ) {
    return buildError(
      'DOCX_SAFE_CREATE_PREVIEW_INVALID',
      'docx_import_safe_create_preview_invalid',
      { field: 'previewEnvelope' },
    );
  }

  if (typeof plan.previewHash !== 'string' || !/^[a-f0-9]{8}$/u.test(plan.previewHash)) {
    return buildError(
      'DOCX_SAFE_CREATE_PREVIEW_INVALID',
      'docx_import_safe_create_preview_hash_invalid',
      { field: 'previewHash' },
    );
  }
  const recomputedPreviewHash = recomputeDocxImportPreviewHash(plan);
  if (plan.previewHash !== recomputedPreviewHash) {
    return buildError(
      'DOCX_SAFE_CREATE_PREVIEW_TAMPERED',
      'docx_import_safe_create_preview_hash_mismatch',
      {
        field: 'previewHash',
        expected: recomputedPreviewHash,
      },
    );
  }

  if (!isPlainObject(plan.source)) {
    return buildError(
      'DOCX_SAFE_CREATE_PREVIEW_INVALID',
      'docx_import_safe_create_preview_invalid',
      { field: 'source' },
    );
  }
  if (
    plan.source.schemaVersion !== DOCX_CONTENT_PREVIEW_SCHEMA
    || plan.source.type !== DOCX_CONTENT_PREVIEW_TYPE
    || plan.source.sourcePart !== DOCX_CONTENT_PREVIEW_SOURCE_PART
    || typeof plan.source.contentPreviewHash !== 'string'
    || !/^[a-f0-9]{8}$/u.test(plan.source.contentPreviewHash)
    || typeof plan.source.textHash !== 'string'
    || !/^[a-f0-9]{8}$/u.test(plan.source.textHash)
    || !Number.isInteger(plan.source.paragraphCount)
    || plan.source.paragraphCount < 0
    || !Number.isInteger(plan.source.textLength)
    || plan.source.textLength < 0
  ) {
    return buildError(
      'DOCX_SAFE_CREATE_PREVIEW_INVALID',
      'docx_import_safe_create_preview_invalid',
      { field: 'source' },
    );
  }
  // GENERIC-01 (G1): full SHA-256 artifact identity on plan.source. Optional
  // but, if present, must be a 64-hex SHA-256. This is the identity thread.
  if (
    plan.source.sourceArtifactSha256 !== undefined
    && plan.source.sourceArtifactSha256 !== null
    && (
      typeof plan.source.sourceArtifactSha256 !== 'string'
      || !/^[a-f0-9]{64}$/u.test(plan.source.sourceArtifactSha256)
    )
  ) {
    return buildError(
      'DOCX_SAFE_CREATE_PREVIEW_INVALID',
      'docx_import_safe_create_preview_invalid',
      { field: 'source.sourceArtifactSha256' },
    );
  }
  if (
    plan.source.candidateContentSha256 !== undefined
    && plan.source.candidateContentSha256 !== null
    && (
      typeof plan.source.candidateContentSha256 !== 'string'
      || !/^[a-f0-9]{64}$/u.test(plan.source.candidateContentSha256)
    )
  ) {
    return buildError(
      'DOCX_SAFE_CREATE_PREVIEW_INVALID',
      'docx_import_safe_create_preview_invalid',
      { field: 'source.candidateContentSha256' },
    );
  }

  const candidate = plan.candidateCreatePlan;
  if (!isPlainObject(candidate)) {
    return buildError(
      'DOCX_SAFE_CREATE_PREVIEW_INVALID',
      'docx_import_safe_create_candidate_required',
      { field: 'candidateCreatePlan' },
    );
  }
  if (
    candidate.mode !== 'create-only'
    || candidate.sceneStrategy !== 'single-scene'
    || candidate.entryCount !== 1
    || !Array.isArray(candidate.entries)
    || candidate.entries.length !== 1
  ) {
    return buildError(
      'DOCX_SAFE_CREATE_PREVIEW_INVALID',
      'docx_import_safe_create_candidate_invalid',
      { field: 'candidateCreatePlan' },
    );
  }

  const entry = candidate.entries[0];
  if (!isPlainObject(entry)) {
    return buildError(
      'DOCX_SAFE_CREATE_PREVIEW_INVALID',
      'docx_import_safe_create_candidate_invalid',
      { field: 'candidateCreatePlan.entries.0' },
    );
  }
  const extraEntryKeys = unsupportedKeys(entry, DOCX_IMPORT_SAFE_CREATE_ALLOWED_ENTRY_KEYS);
  if (extraEntryKeys.length > 0) {
    return buildError(
      'DOCX_SAFE_CREATE_PREVIEW_INVALID',
      'docx_import_safe_create_candidate_unsupported_fields',
      { field: 'candidateCreatePlan.entries.0', fields: extraEntryKeys },
    );
  }
  if (
    typeof entry.sceneId !== 'string'
    || !/^docx-import-scene-[a-f0-9]{8}$/u.test(entry.sceneId)
    || entry.kind !== 'scene'
    || typeof entry.content !== 'string'
    || typeof entry.contentTextHash !== 'string'
    || !/^[a-f0-9]{8}$/u.test(entry.contentTextHash)
  ) {
    return buildError(
      'DOCX_SAFE_CREATE_PREVIEW_INVALID',
      'docx_import_safe_create_candidate_invalid',
      { field: 'candidateCreatePlan.entries.0' },
    );
  }
  // GENERIC-01 (G1): full SHA-256 candidate content identity. Optional but, if
  // present, must be a 64-hex SHA-256. The 8-hex contentTextHash stays as a
  // deterministic legacy preview hash (never identity).
  if (
    entry.candidateContentSha256 !== undefined
    && entry.candidateContentSha256 !== null
    && (
      typeof entry.candidateContentSha256 !== 'string'
      || !/^[a-f0-9]{64}$/u.test(entry.candidateContentSha256)
    )
  ) {
    return buildError(
      'DOCX_SAFE_CREATE_PREVIEW_INVALID',
      'docx_import_safe_create_candidate_invalid',
      { field: 'candidateCreatePlan.entries.0.candidateContentSha256' },
    );
  }
  const content = normalizeText(entry.content);
  if (entry.contentTextHash !== docxStableHash(content)) {
    return buildError(
      'DOCX_SAFE_CREATE_PREVIEW_TAMPERED',
      'docx_import_safe_create_content_hash_mismatch',
      { field: 'candidateCreatePlan.entries.0.contentTextHash' },
    );
  }

  if (!isPlainObject(entry.source)) {
    return buildError(
      'DOCX_SAFE_CREATE_PREVIEW_INVALID',
      'docx_import_safe_create_candidate_invalid',
      { field: 'candidateCreatePlan.entries.0.source' },
    );
  }
  const extraSourceKeys = unsupportedKeys(entry.source, DOCX_IMPORT_SAFE_CREATE_ALLOWED_ENTRY_SOURCE_KEYS);
  if (extraSourceKeys.length > 0) {
    return buildError(
      'DOCX_SAFE_CREATE_PREVIEW_INVALID',
      'docx_import_safe_create_candidate_unsupported_fields',
      { field: 'candidateCreatePlan.entries.0.source', fields: extraSourceKeys },
    );
  }
  if (
    entry.source.schemaVersion !== plan.source.schemaVersion
    || entry.source.type !== plan.source.type
    || entry.source.sourcePart !== plan.source.sourcePart
    || entry.source.paragraphCount !== plan.source.paragraphCount
    || entry.source.textHash !== plan.source.textHash
  ) {
    return buildError(
      'DOCX_SAFE_CREATE_PREVIEW_TAMPERED',
      'docx_import_safe_create_source_mismatch',
      { field: 'candidateCreatePlan.entries.0.source' },
    );
  }
  if (
    !isPlainObject(entry.source.paragraphRange)
    || !Number.isInteger(entry.source.paragraphRange.start)
    || !Number.isInteger(entry.source.paragraphRange.end)
  ) {
    return buildError(
      'DOCX_SAFE_CREATE_PREVIEW_INVALID',
      'docx_import_safe_create_candidate_invalid',
      { field: 'candidateCreatePlan.entries.0.source.paragraphRange' },
    );
  }
  // GENERIC-01 (G1): sceneId derivation. When sourceArtifactSha256 is present
  // (the GENERIC-01 identity thread), sceneId MUST derive from it so distinct
  // raw artifacts yield distinct sceneIds. Otherwise (legacy plans without the
  // identity thread), fall back to the 32-bit content-hash derivation.
  const expectedSceneId = typeof plan.source.sourceArtifactSha256 === 'string'
    && /^[a-f0-9]{64}$/u.test(plan.source.sourceArtifactSha256)
    ? `docx-import-scene-${plan.source.sourceArtifactSha256.slice(0, 8)}`
    : `docx-import-scene-${docxStableHash(docxCanonicalJson({
      sourceTextHash: entry.source.textHash,
      contentTextHash: entry.contentTextHash,
      paragraphCount: entry.source.paragraphCount,
    }))}`;
  if (entry.sceneId !== expectedSceneId) {
    return buildError(
      'DOCX_SAFE_CREATE_PREVIEW_TAMPERED',
      'docx_import_safe_create_scene_id_mismatch',
      { field: 'candidateCreatePlan.entries.0.sceneId' },
    );
  }

  if (
    !isPlainObject(plan.lossReport)
    || plan.lossReport.schemaVersion !== DOCX_IMPORT_PREVIEW_LOSS_REPORT_SCHEMA
    || plan.lossReport.mode !== 'plain-text-only'
    || !Array.isArray(plan.lossReport.items)
    || plan.lossReport.itemCount !== plan.lossReport.items.length
  ) {
    return buildError(
      'DOCX_SAFE_CREATE_PREVIEW_INVALID',
      'docx_import_safe_create_loss_report_invalid',
      { field: 'lossReport' },
    );
  }

  return {
    ok: true,
    value: {
      entry: {
        sceneId: entry.sceneId,
        kind: entry.kind,
        title: typeof entry.title === 'string' && entry.title.trim()
          ? entry.title.trim()
          : 'Imported DOCX preview',
        content,
        contentTextHash: entry.contentTextHash,
        candidateContentSha256: typeof entry.candidateContentSha256 === 'string'
          && /^[a-f0-9]{64}$/u.test(entry.candidateContentSha256)
          ? entry.candidateContentSha256
          : (typeof plan.source.candidateContentSha256 === 'string'
            && /^[a-f0-9]{64}$/u.test(plan.source.candidateContentSha256)
            ? plan.source.candidateContentSha256
            : null),
      },
      sourceArtifactSha256: typeof plan.source.sourceArtifactSha256 === 'string'
        && /^[a-f0-9]{64}$/u.test(plan.source.sourceArtifactSha256)
        ? plan.source.sourceArtifactSha256
        : null,
      carrierIgnored: isPlainObject(plan.carrierIgnored) && plan.carrierIgnored.ignored === true
        ? {
          ignored: true,
          reason: typeof plan.carrierIgnored.reason === 'string' ? plan.carrierIgnored.reason : '',
          tokenDetected: plan.carrierIgnored.tokenDetected === true,
        }
        : null,
      lossReport: cloneJsonSafe(plan.lossReport),
      previewHash: plan.previewHash,
    },
  };
}

function sanitizeFilename(name) {
  const safe = String(name || '')
    .trim()
    .replace(/[\\/<>:"|?*\u0000-\u001F]/g, '_')
    .replace(/\s+/g, ' ')
    .replace(/\.+$/g, '');

  return safe.slice(0, 80) || 'Untitled';
}

// GENERIC-01 (G5): scene path derives from import instance identity, not a
// content hash suffix. The identity component is derived from the main-owned
// importOperationId so two distinct import operations never collide on disk.
function buildDocxImportScenePath(romanRoot, entry, identityComponent) {
  const suffix = identityComponent
    || (typeof entry.importOperationId === 'string' && entry.importOperationId.length > 0
      ? entry.importOperationId.replace(/^docx-import-op-/u, '').slice(0, 8)
      : '')
    || entry.sceneId.replace(/^docx-import-scene-/u, '');
  return joinPathSegmentsWithinRoot(
    romanRoot,
    ['Imported', `${sanitizeFilename(entry.title)} ${suffix}.txt`],
    { resolveSymlinks: false },
  );
}

function validateTrustedRoots(projectRoot, romanRoot) {
  if (typeof projectRoot !== 'string' || !projectRoot.trim()) {
    return buildError(
      'DOCX_SAFE_CREATE_PROJECT_ROOT_REQUIRED',
      'docx_import_safe_create_project_root_required',
    );
  }
  if (typeof romanRoot !== 'string' || !romanRoot.trim()) {
    return buildError(
      'DOCX_SAFE_CREATE_ROMAN_ROOT_REQUIRED',
      'docx_import_safe_create_roman_root_required',
    );
  }
  if (!isPathInsideBoundary(projectRoot, romanRoot, { resolveSymlinks: true })) {
    return buildError(
      'DOCX_SAFE_CREATE_ROOT_INVALID',
      'docx_import_safe_create_roman_root_invalid',
    );
  }
  return { ok: true };
}

// GENERIC-01 (G2/G4): durable idempotent receipt store. The store lives under
// <projectRoot>/.yalken/docx-import/receipts/<importOperationId>.json. Atomic
// write mirrors the existing flowSceneBatchAtomic pattern.
function buildReceiptStoreDir(projectRoot) {
  return path.join(projectRoot, DOCX_IMPORT_RECEIPT_STORE_DIRNAME);
}

function buildReceiptStorePath(projectRoot, importOperationId) {
  return path.join(buildReceiptStoreDir(projectRoot), `${importOperationId}.json`);
}

async function writeJsonAtomic(targetPath, value) {
  const tempPath = `${targetPath}.${process.pid}.receipt.tmp`;
  let handle = null;
  try {
    await fs.mkdir(path.dirname(targetPath), { recursive: true });
    handle = await fs.open(tempPath, 'w');
    await handle.writeFile(JSON.stringify(value, null, 2), 'utf8');
    await handle.sync();
    await handle.close();
    handle = null;
    await fs.rename(tempPath, targetPath);
  } finally {
    if (handle) await handle.close().catch(() => {});
    await fs.unlink(tempPath).catch(() => {});
  }
}

async function readDurableReceipt(projectRoot, importOperationId) {
  if (!importOperationId) return null;
  const receiptPath = buildReceiptStorePath(projectRoot, importOperationId);
  try {
    const text = await fs.readFile(receiptPath, 'utf8');
    return JSON.parse(text);
  } catch {
    return null;
  }
}

async function writeDurableReceipt(projectRoot, importOperationId, receipt) {
  const receiptPath = buildReceiptStorePath(projectRoot, importOperationId);
  await writeJsonAtomic(receiptPath, receipt);
}

// GENERIC-01 (B): main-owned importOperationId. Canonical form derives from the
// operation-scoped identity (projectId + sourceArtifactSha256 +
// candidateContentSha256 + previewHash), NOT from a single content hash. Two
// distinct raw artifacts therefore yield distinct operation ids.
function buildImportOperationId(options) {
  const operationCanonical = {
    projectId: typeof options.projectId === 'string' ? options.projectId : '',
    sourceArtifactSha256: typeof options.sourceArtifactSha256 === 'string'
      ? options.sourceArtifactSha256 : '',
    candidateContentSha256: typeof options.candidateContentSha256 === 'string'
      ? options.candidateContentSha256 : '',
    previewHash: typeof options.previewHash === 'string' ? options.previewHash : '',
    sceneId: typeof options.sceneId === 'string' ? options.sceneId : '',
  };
  const operationHash = crypto.createHash('sha256')
    .update(stableStringify(operationCanonical), 'utf8').digest('hex');
  return `docx-import-op-${operationHash.slice(0, 12)}`;
}

async function applyDocxImportSafeCreate(input = {}, options = {}) {
  const projectRoot = typeof options.projectRoot === 'string' ? options.projectRoot.trim() : '';
  const romanRoot = typeof options.romanRoot === 'string' ? options.romanRoot.trim() : '';

  const plan = isPlainObject(input.docxImportPreviewPlan) ? input.docxImportPreviewPlan : null;
  const validated = validateDocxImportPreviewPlan(plan);
  if (!validated.ok) return validated;
  if (!isDocxImportPreviewPlanAdmitted(plan)) {
    return buildError(
      'DOCX_SAFE_CREATE_PREVIEW_NOT_ADMITTED',
      'docx_import_safe_create_preview_not_admitted',
    );
  }
  const roots = validateTrustedRoots(projectRoot, romanRoot);
  if (!roots.ok) return roots;

  const projectId = typeof options.projectId === 'string' ? options.projectId : '';
  const importOperationId = buildImportOperationId({
    projectId,
    sourceArtifactSha256: validated.value.sourceArtifactSha256,
    candidateContentSha256: validated.value.entry.candidateContentSha256,
    previewHash: validated.value.previewHash,
    sceneId: validated.value.entry.sceneId,
  });

  // GENERIC-01 (G2/G4): idempotent lookup. If a durable receipt already exists
  // for this importOperationId, return it without performing any new storage
  // writes (writerCalls=0). This is the idempotent re-apply contract.
  const existingReceipt = await readDurableReceipt(projectRoot, importOperationId);
  if (existingReceipt && isPlainObject(existingReceipt) && existingReceipt.importOperationId === importOperationId) {
    return {
      ok: true,
      value: {
        created: false,
        safeCreate: true,
        idempotent: true,
        createdSceneIds: existingReceipt.createdSceneIds || [],
        receipt: existingReceipt,
        receiptStore: { dir: buildReceiptStoreDir(projectRoot) },
        lookupReceipt: async (opId) => readDurableReceipt(projectRoot, opId || importOperationId),
        importOperationId,
      },
    };
  }

  const targetPath = buildDocxImportScenePath(
    romanRoot,
    validated.value.entry,
    importOperationId.replace(/^docx-import-op-/u, '').slice(0, 8),
  );
  if (
    !isPathInsideBoundary(romanRoot, targetPath, { resolveSymlinks: false })
    || !isPathInsideBoundary(projectRoot, targetPath, { resolveSymlinks: true })
  ) {
    return buildError(
      'DOCX_SAFE_CREATE_SCENE_PATH_FORBIDDEN',
      'docx_import_safe_create_scene_path_forbidden',
    );
  }
  if (await pathExists(targetPath)) {
    return buildError(
      'DOCX_SAFE_CREATE_EXISTING_SCENE_BLOCKED',
      'docx_import_safe_create_existing_scene_blocked',
      { sceneId: validated.value.entry.sceneId },
    );
  }

  const normalizedEntry = {
    sceneId: validated.value.entry.sceneId,
    path: targetPath,
    kind: 'scene',
    title: validated.value.entry.title,
    content: validated.value.entry.content,
    importOperationId,
  };
  const queueDiskOperation = typeof options.queueDiskOperation === 'function'
    ? options.queueDiskOperation
    : async (operation) => operation();
  const writeBatchAtomic = typeof options.writeBatchAtomic === 'function'
    ? options.writeBatchAtomic
    : writeFlowSceneBatchAtomic;

  // GENERIC-01 (G3): manifest-authority transaction. The flow batch journal
  // runs inside one lease/publish scope; the manifest revision bump (if a
  // transactionAuthority port is wired) commits in the same scope. Without a
  // transactionAuthority port (unit-test direct calls), the manifest evidence
  // is algorithmic (donor pattern) so the atomic invariant is still observable.
  const transactionAuthority = typeof options.transactionAuthority === 'object'
    && options.transactionAuthority !== null
    ? options.transactionAuthority
    : null;

  let writeResult = null;
  let manifestEvidence = null;
  try {
    writeResult = await queueDiskOperation(
      () => writeBatchAtomic(
        {
          projectRoot,
          entries: [
            {
              path: normalizedEntry.path,
              content: normalizedEntry.content,
            },
          ],
        },
        {
          beforeActivate: async ({ entry }) => {
            if (await pathExists(entry.path)) {
              throw new Error('DOCX_SAFE_CREATE_EXISTING_SCENE_BLOCKED');
            }
          },
        },
      ),
      typeof options.operationLabel === 'string' && options.operationLabel.trim()
        ? options.operationLabel
        : 'safe create DOCX import scene batch',
    );

    // GENERIC-01 (G3): manifest revision bump. When a transactionAuthority port
    // is provided (main handler), the manifest CAS commit runs atomically. When
    // absent (unit-test direct calls), the evidence is algorithmic.
    if (transactionAuthority && typeof transactionAuthority.commitManifestText === 'function') {
      manifestEvidence = await commitManifestRevisionForImport(
        transactionAuthority,
        {
          projectId,
          importOperationId,
          lease: typeof options.lease === 'object' ? options.lease : null,
        },
      );
    } else {
      manifestEvidence = buildAlgorithmicManifestEvidence(importOperationId);
    }
  } catch (error) {
    return buildError(
      'DOCX_SAFE_CREATE_WRITE_FAIL',
      'docx_import_safe_create_write_failed',
      {
        messageCode: error
          && typeof error.message === 'string'
          && DOCX_IMPORT_SAFE_CREATE_MESSAGE_CODE_RE.test(error.message)
          ? error.message.slice(0, 96)
          : 'WRITE_EXCEPTION',
      },
    );
  }

  if (!writeResult || writeResult.ok !== true) {
    if (writeResult && isPlainObject(writeResult.error)) {
      const reason = writeResult.error.reason === 'DOCX_SAFE_CREATE_EXISTING_SCENE_BLOCKED'
        ? 'docx_import_safe_create_existing_scene_blocked'
        : (typeof writeResult.error.reason === 'string'
          ? writeResult.error.reason
          : 'docx_import_safe_create_write_failed');
      return {
        ok: false,
        error: {
          code: typeof writeResult.error.code === 'string'
            ? writeResult.error.code
            : 'DOCX_SAFE_CREATE_WRITE_FAIL',
          reason,
          details: isPlainObject(writeResult.error.details)
            ? sanitizePublicErrorDetails(writeResult.error.details)
            : {},
        },
      };
    }
    return buildError(
      'DOCX_SAFE_CREATE_WRITE_FAIL',
      'docx_import_safe_create_write_failed',
    );
  }

  const actualContent = normalizeText(await fs.readFile(normalizedEntry.path, 'utf8'));
  // GENERIC-01 (G3): Core-allocated tree-node identity. The tree identity is
  // allocated atomically within the same transaction scope (algorithmic donor
  // when no transactionAuthority port is wired).
  const treeNodeId = `yalken.scene.tree.${crypto.createHash('sha256')
    .update(`${importOperationId}:${validated.value.entry.sceneId}`, 'utf8').digest('hex').slice(0, 16)}`;
  const treeId = `yalken.scene.tree.root.${crypto.createHash('sha256')
    .update(`root:${importOperationId}`, 'utf8').digest('hex').slice(0, 16)}`;
  const verifiedScene = {
    sceneId: normalizedEntry.sceneId,
    kind: normalizedEntry.kind,
    title: normalizedEntry.title,
    bytesWritten: Buffer.byteLength(actualContent, 'utf8'),
    outputHash: sha256Text(actualContent),
    treeNodeId,
    treeId,
  };
  const sceneTreeIdentities = [
    {
      sceneId: verifiedScene.sceneId,
      treeNodeId,
      treeId,
    },
  ];
  const inputHash = sha256Text(stableStringify(plan));
  const outputHash = sha256Text(stableStringify({ createdScenes: [verifiedScene] }));

  // GENERIC-01 (G7): typed lossReport persists in the receipt. The summary is
  // kept for backwards compatibility, but the typed items survive the apply
  // boundary so the loss categories are observable downstream.
  const lossReportForReceipt = cloneJsonSafe(validated.value.lossReport);
  const lossReportSummary = {
    schemaVersion: validated.value.lossReport.schemaVersion,
    mode: validated.value.lossReport.mode,
    itemCount: validated.value.lossReport.itemCount,
  };

  const receipt = {
    schemaVersion: DOCX_IMPORT_RECEIPT_V2_SCHEMA,
    type: DOCX_IMPORT_SAFE_CREATE_RECEIPT_TYPE,
    reason: DOCX_IMPORT_SAFE_CREATE_READY_REASON,
    importOperationId,
    projectId,
    sourceArtifactSha256: validated.value.sourceArtifactSha256,
    candidateContentSha256: validated.value.entry.candidateContentSha256,
    batchId: writeResult.value && typeof writeResult.value.batchId === 'string'
      ? writeResult.value.batchId
      : '',
    sourcePreviewHash: validated.value.previewHash,
    inputHash,
    outputHash,
    createdSceneIds: [verifiedScene.sceneId],
    createdScenes: [verifiedScene],
    sceneTreeIdentities,
    lossReport: lossReportForReceipt,
    lossReportSummary,
    manifestAuthority: manifestEvidence,
    carrierIgnored: validated.value.carrierIgnored,
    transactionEvidence: {
      lease: manifestEvidence && typeof manifestEvidence.fencingGeneration === 'number'
        ? { fencingGeneration: manifestEvidence.fencingGeneration }
        : { algorithmic: true },
      manifestHash: manifestEvidence && typeof manifestEvidence.nextHash === 'string'
        ? manifestEvidence.nextHash
        : (manifestEvidence && typeof manifestEvidence.algorithmicHash === 'string'
          ? manifestEvidence.algorithmicHash
          : ''),
      batchManifestHash: writeResult.value && typeof writeResult.value.batchId === 'string'
        ? sha256Text(writeResult.value.batchId)
        : '',
    },
    atomicEvidence: {
      sceneCount: 1,
      markerCleared: true,
    },
    createdAt: new Date().toISOString(),
  };

  // GENERIC-01 (G4): persist the durable receipt atomically.
  await writeDurableReceipt(projectRoot, importOperationId, receipt);

  return {
    ok: true,
    value: {
      created: true,
      safeCreate: true,
      createdSceneIds: receipt.createdSceneIds,
      receipt,
      receiptStore: { dir: buildReceiptStoreDir(projectRoot) },
      lookupReceipt: async (opId) => readDurableReceipt(projectRoot, opId || importOperationId),
      importOperationId,
    },
  };
}

// GENERIC-01 (G3): manifest revision bump via the transactionAuthority port.
// Uses commitManifestText with lease/CAS semantics. Falls back to algorithmic
// evidence if the authority rejects the commit (partial -> rollback).
async function commitManifestRevisionForImport(authority, context) {
  const projectId = typeof context.projectId === 'string' && context.projectId.trim()
    ? context.projectId.trim()
    : 'docx-import-generic';
  const nextText = JSON.stringify({
    schemaVersion: 'yalken.projectManifest.v1',
    projectId,
    docxImportOperationId: context.importOperationId,
    revisionBumpedAt: new Date().toISOString(),
  });
  try {
    const result = await authority.commitManifestText({
      projectId,
      targetPath: context.manifestPath || null,
      expectedText: null,
      nextText,
      lease: context.lease || null,
      label: 'docxImportSafeCreate',
    });
    return {
      revision: typeof result.revision === 'string'
        ? result.revision
        : (typeof result.fencingGeneration === 'number'
          ? String(result.fencingGeneration)
          : ''),
      fencingGeneration: typeof result.fencingGeneration === 'number' ? result.fencingGeneration : null,
      nextHash: typeof result.nextHash === 'string' ? result.nextHash : '',
      previousHash: typeof result.previousHash === 'string' ? result.previousHash : '',
      durablePublication: result.durablePublication === true,
    };
  } catch {
    return buildAlgorithmicManifestEvidence(context.importOperationId);
  }
}

function buildAlgorithmicManifestEvidence(importOperationId) {
  const algorithmicHash = crypto.createHash('sha256')
    .update(`manifest:algorithmic:${importOperationId}`, 'utf8').digest('hex');
  return {
    revision: algorithmicHash.slice(0, 8),
    algorithmic: true,
    algorithmicHash,
    durablePublication: false,
  };
}

module.exports = {
  DOCX_IMPORT_SAFE_CREATE_RECEIPT_SCHEMA,
  DOCX_IMPORT_SAFE_CREATE_RECEIPT_TYPE,
  DOCX_IMPORT_SAFE_CREATE_READY_REASON,
  DOCX_IMPORT_RECEIPT_V2_SCHEMA,
  applyDocxImportSafeCreate,
  buildImportOperationId,
  hashDocxImportPreviewPlanForAdmission,
  isDocxImportPreviewPlanAdmitted,
  rememberDocxImportPreviewPlanAdmission,
  validateDocxImportPreviewPlan,
};
