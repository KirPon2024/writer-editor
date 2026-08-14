import crypto, { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

import {
  prepareBlackBoxImportAsNewRecoveryPlanV1,
} from './blackBoxImportAsNewRecoveryPlanV1.mjs';
import { recoverBlackBoxStrictCapsuleV1 } from './blackBoxStrictCapsuleRecoverV1.mjs';

export const BLACK_BOX_IMPORT_AS_NEW_PROJECT_WRITER_V1_FEATURE_FLAG = 'yalken.blackBox.importAsNewProjectWriter.v1';

export const BLACK_BOX_IMPORT_AS_NEW_PROJECT_WRITER_V1_SCHEMAS = Object.freeze({
  featureFlag: 'yalken.blackBoxImportAsNewProjectWriter.featureFlag.v1',
  receipt: 'yalken.blackBoxImportAsNewProjectWriter.receipt.v1',
  request: 'yalken.blackBoxImportAsNewProjectWriter.request.v1',
  result: 'yalken.blackBoxImportAsNewProjectWriter.result.v1',
  target: 'yalken.blackBoxImportAsNewProjectWriter.target.v1',
});

export const BLACK_BOX_IMPORT_AS_NEW_PROJECT_WRITER_V1_CODES = Object.freeze({
  CORE_PAYLOAD_INVALID: 'YALKEN_BLACK_BOX_IMPORT_AS_NEW_PROJECT_WRITER_CORE_PAYLOAD_INVALID',
  FEATURE_DISABLED: 'YALKEN_BLACK_BOX_IMPORT_AS_NEW_PROJECT_WRITER_FEATURE_DISABLED',
  FIELD_INVALID: 'YALKEN_BLACK_BOX_IMPORT_AS_NEW_PROJECT_WRITER_FIELD_INVALID',
  KEYSET_INVALID: 'YALKEN_BLACK_BOX_IMPORT_AS_NEW_PROJECT_WRITER_KEYSET_INVALID',
  PATH_REJECTED: 'YALKEN_BLACK_BOX_IMPORT_AS_NEW_PROJECT_WRITER_PATH_REJECTED',
  PLAINTEXT_OR_KEY_LEAK: 'YALKEN_BLACK_BOX_IMPORT_AS_NEW_PROJECT_WRITER_PLAINTEXT_OR_KEY_LEAK',
  PROJECT_WRITTEN: 'YALKEN_BLACK_BOX_IMPORT_AS_NEW_PROJECT_WRITER_PROJECT_WRITTEN',
  READBACK_MISMATCH: 'YALKEN_BLACK_BOX_IMPORT_AS_NEW_PROJECT_WRITER_READBACK_MISMATCH',
  SINK_PAYLOAD_MISSING: 'YALKEN_BLACK_BOX_IMPORT_AS_NEW_PROJECT_WRITER_SINK_PAYLOAD_MISSING',
  TARGET_EXISTS: 'YALKEN_BLACK_BOX_IMPORT_AS_NEW_PROJECT_WRITER_TARGET_EXISTS',
  UPSTREAM_NOT_PASS: 'YALKEN_BLACK_BOX_IMPORT_AS_NEW_PROJECT_WRITER_UPSTREAM_NOT_PASS',
  WRITE_FAILED: 'YALKEN_BLACK_BOX_IMPORT_AS_NEW_PROJECT_WRITER_WRITE_FAILED',
});

const REQUEST_KEYS = Object.freeze(['expectations', 'featureFlags', 'recoveryRequest', 'schemaVersion', 'target']);
const TARGET_KEYS = Object.freeze(['parentDirectoryPath', 'platform', 'projectDirectoryName', 'schemaVersion']);
const EXPECTATION_KEYS = Object.freeze([
  'importMode',
  'liveProjectOverwrite',
  'requireCreateOnly',
  'requireNoPlaintextInReceipt',
  'requireP0cSink',
  'requireReadback',
]);
const CORE_ITEM_REQUIRED_KEYS = Object.freeze([
  'bindingKey',
  'byteLength',
  'documentId',
  'kind',
  'ordinal',
  'sourceText',
  'sourceTextDigest',
]);
const IMPORT_AS_NEW = 'IMPORT_AS_NEW_PROJECT_ONLY';
const CORE_GENOME_SCHEMA = 'yalken.blackBoxManualCoreCapsuleKit.coreGenome.v1';
const RECEIPT_RELATIVE_PATH = '.yalken-black-box-import-receipt.json';
const DIGEST_PATTERN = /^sha256:[a-f0-9]{64}$/u;
const SAFE_PROJECT_DIRECTORY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u;
const LEAK_PATTERN = /AGE-SECRET-KEY|bytesBase64|BLACK_BOX_CORE_GENOME_V1|sourceText|Opening line|Second line|A later scene/iu;
const BLOCKING_UPSTREAM_DECISIONS = new Set(['UNKNOWN', 'ABSTAIN', 'CONFLICTING']);

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function deepFreeze(value) {
  if (!isPlainObject(value) && !Array.isArray(value)) return value;
  Object.freeze(value);
  for (const nested of Object.values(value)) {
    if ((isPlainObject(nested) || Array.isArray(nested)) && !Object.isFrozen(nested)) deepFreeze(nested);
  }
  return value;
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map((item) => stableJson(item)).join(',')}]`;
  if (isPlainObject(value)) {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function sha256Buffer(bytes) {
  return `sha256:${crypto.createHash('sha256').update(Buffer.from(bytes)).digest('hex')}`;
}

function sha256Stable(value) {
  return sha256Buffer(Buffer.from(stableJson(value), 'utf8'));
}

function sortedKeys(value) {
  return isPlainObject(value) ? Object.keys(value).sort() : [];
}

function sameKeys(value, keys) {
  const actual = sortedKeys(value);
  return actual.length === keys.length && actual.every((key, index) => key === keys[index]);
}

function validDigest(value) {
  return typeof value === 'string' && DIGEST_PATTERN.test(value);
}

function reason(code, field, expected, actual) {
  const out = { code, field };
  if (expected !== undefined) out.expected = expected;
  if (actual !== undefined) out.actual = actual;
  return Object.freeze(out);
}

function keysetReason(field, actual, expected) {
  return reason(BLACK_BOX_IMPORT_AS_NEW_PROJECT_WRITER_V1_CODES.KEYSET_INVALID, field, expected, sortedKeys(actual));
}

function deny(code, reasons = [reason(code, 'request')], details = {}) {
  return deepFreeze({
    schemaVersion: BLACK_BOX_IMPORT_AS_NEW_PROJECT_WRITER_V1_SCHEMAS.result,
    ok: false,
    decision: 'DENY',
    code,
    reasons,
    ...details,
  });
}

function pass(details) {
  return deepFreeze({
    schemaVersion: BLACK_BOX_IMPORT_AS_NEW_PROJECT_WRITER_V1_SCHEMAS.result,
    ok: true,
    decision: 'PASS',
    code: BLACK_BOX_IMPORT_AS_NEW_PROJECT_WRITER_V1_CODES.PROJECT_WRITTEN,
    reasons: [],
    ...details,
  });
}

export function resolveBlackBoxImportAsNewProjectWriterFeatureFlag(featureFlags = {}) {
  const enabled = isPlainObject(featureFlags)
    && featureFlags[BLACK_BOX_IMPORT_AS_NEW_PROJECT_WRITER_V1_FEATURE_FLAG] === true;
  return deepFreeze({
    schemaVersion: BLACK_BOX_IMPORT_AS_NEW_PROJECT_WRITER_V1_SCHEMAS.featureFlag,
    flag: BLACK_BOX_IMPORT_AS_NEW_PROJECT_WRITER_V1_FEATURE_FLAG,
    enabled,
    canWriteNewProject: enabled,
    canOverwriteLiveProject: false,
    commandKernelWired: false,
    productUiWired: false,
    projectLibraryRegistrationWired: false,
  });
}

function validateExpectations(expectations, reasons) {
  if (!isPlainObject(expectations) || !sameKeys(expectations, EXPECTATION_KEYS)) {
    reasons.push(keysetReason('expectations', expectations, EXPECTATION_KEYS));
    return;
  }
  if (expectations.importMode !== IMPORT_AS_NEW
    || expectations.liveProjectOverwrite !== false
    || expectations.requireCreateOnly !== true
    || expectations.requireNoPlaintextInReceipt !== true
    || expectations.requireP0cSink !== true
    || expectations.requireReadback !== true) {
    reasons.push(reason(
      BLACK_BOX_IMPORT_AS_NEW_PROJECT_WRITER_V1_CODES.FIELD_INVALID,
      'expectations',
      {
        importMode: IMPORT_AS_NEW,
        liveProjectOverwrite: false,
        requireCreateOnly: true,
        requireNoPlaintextInReceipt: true,
        requireP0cSink: true,
        requireReadback: true,
      },
    ));
  }
}

function validateTargetShape(target, reasons) {
  if (!isPlainObject(target) || !sameKeys(target, TARGET_KEYS)) {
    reasons.push(keysetReason('target', target, TARGET_KEYS));
    return;
  }
  if (target.schemaVersion !== BLACK_BOX_IMPORT_AS_NEW_PROJECT_WRITER_V1_SCHEMAS.target) {
    reasons.push(reason(BLACK_BOX_IMPORT_AS_NEW_PROJECT_WRITER_V1_CODES.FIELD_INVALID, 'target.schemaVersion'));
  }
  if (target.platform !== process.platform) {
    reasons.push(reason(BLACK_BOX_IMPORT_AS_NEW_PROJECT_WRITER_V1_CODES.FIELD_INVALID, 'target.platform', process.platform, target.platform));
  }
  if (!SAFE_PROJECT_DIRECTORY_PATTERN.test(String(target.projectDirectoryName || ''))) {
    reasons.push(reason(BLACK_BOX_IMPORT_AS_NEW_PROJECT_WRITER_V1_CODES.PATH_REJECTED, 'target.projectDirectoryName'));
  }
  if (typeof target.parentDirectoryPath !== 'string' || !path.isAbsolute(target.parentDirectoryPath)) {
    reasons.push(reason(BLACK_BOX_IMPORT_AS_NEW_PROJECT_WRITER_V1_CODES.PATH_REJECTED, 'target.parentDirectoryPath'));
  }
}

function validateRequest(request) {
  const reasons = [];
  if (!isPlainObject(request)) {
    return {
      ok: false,
      code: BLACK_BOX_IMPORT_AS_NEW_PROJECT_WRITER_V1_CODES.KEYSET_INVALID,
      reasons: [keysetReason('request', request, REQUEST_KEYS)],
    };
  }
  if (!sameKeys(request, REQUEST_KEYS)) reasons.push(keysetReason('request', request, REQUEST_KEYS));
  if (request.schemaVersion !== BLACK_BOX_IMPORT_AS_NEW_PROJECT_WRITER_V1_SCHEMAS.request) {
    reasons.push(reason(BLACK_BOX_IMPORT_AS_NEW_PROJECT_WRITER_V1_CODES.FIELD_INVALID, 'schemaVersion'));
  }
  const feature = resolveBlackBoxImportAsNewProjectWriterFeatureFlag(request.featureFlags);
  if (!feature.enabled) {
    reasons.push(reason(BLACK_BOX_IMPORT_AS_NEW_PROJECT_WRITER_V1_CODES.FEATURE_DISABLED, 'featureFlags'));
  }
  validateTargetShape(request.target, reasons);
  validateExpectations(request.expectations, reasons);
  if (reasons.length > 0) {
    const priority = [
      BLACK_BOX_IMPORT_AS_NEW_PROJECT_WRITER_V1_CODES.KEYSET_INVALID,
      BLACK_BOX_IMPORT_AS_NEW_PROJECT_WRITER_V1_CODES.FEATURE_DISABLED,
      BLACK_BOX_IMPORT_AS_NEW_PROJECT_WRITER_V1_CODES.PATH_REJECTED,
      BLACK_BOX_IMPORT_AS_NEW_PROJECT_WRITER_V1_CODES.FIELD_INVALID,
    ];
    return {
      ok: false,
      code: priority.find((code) => reasons.some((entry) => entry.code === code)) || reasons[0].code,
      reasons,
    };
  }
  return { ok: true };
}

async function resolveTarget(target) {
  const parentDirectoryPath = path.resolve(target.parentDirectoryPath);
  if (parentDirectoryPath === path.parse(parentDirectoryPath).root) {
    return {
      ok: false,
      code: BLACK_BOX_IMPORT_AS_NEW_PROJECT_WRITER_V1_CODES.PATH_REJECTED,
      reasons: [reason(BLACK_BOX_IMPORT_AS_NEW_PROJECT_WRITER_V1_CODES.PATH_REJECTED, 'target.parentDirectoryPath')],
    };
  }
  let parentStat;
  try {
    parentStat = await fs.lstat(parentDirectoryPath);
  } catch {
    return {
      ok: false,
      code: BLACK_BOX_IMPORT_AS_NEW_PROJECT_WRITER_V1_CODES.PATH_REJECTED,
      reasons: [reason(BLACK_BOX_IMPORT_AS_NEW_PROJECT_WRITER_V1_CODES.PATH_REJECTED, 'target.parentDirectoryPath')],
    };
  }
  if (!parentStat.isDirectory() || parentStat.isSymbolicLink()) {
    return {
      ok: false,
      code: BLACK_BOX_IMPORT_AS_NEW_PROJECT_WRITER_V1_CODES.PATH_REJECTED,
      reasons: [reason(BLACK_BOX_IMPORT_AS_NEW_PROJECT_WRITER_V1_CODES.PATH_REJECTED, 'target.parentDirectoryPath')],
    };
  }
  const projectRoot = path.join(parentDirectoryPath, target.projectDirectoryName);
  if (path.dirname(projectRoot) !== parentDirectoryPath) {
    return {
      ok: false,
      code: BLACK_BOX_IMPORT_AS_NEW_PROJECT_WRITER_V1_CODES.PATH_REJECTED,
      reasons: [reason(BLACK_BOX_IMPORT_AS_NEW_PROJECT_WRITER_V1_CODES.PATH_REJECTED, 'target.projectDirectoryName')],
    };
  }
  try {
    const existing = await fs.lstat(projectRoot);
    return {
      ok: false,
      code: BLACK_BOX_IMPORT_AS_NEW_PROJECT_WRITER_V1_CODES.TARGET_EXISTS,
      reasons: [reason(
        BLACK_BOX_IMPORT_AS_NEW_PROJECT_WRITER_V1_CODES.TARGET_EXISTS,
        existing.isSymbolicLink() ? 'target.projectDirectoryName.symlink' : 'target.projectDirectoryName',
      )],
    };
  } catch (error) {
    if (error?.code !== 'ENOENT') {
      return {
        ok: false,
        code: BLACK_BOX_IMPORT_AS_NEW_PROJECT_WRITER_V1_CODES.PATH_REJECTED,
        reasons: [reason(BLACK_BOX_IMPORT_AS_NEW_PROJECT_WRITER_V1_CODES.PATH_REJECTED, 'target.projectDirectoryName')],
      };
    }
  }
  return {
    ok: true,
    parentDirectoryPath,
    projectRoot,
    projectDirectoryName: target.projectDirectoryName,
    stagingRoot: path.join(parentDirectoryPath, `.${target.projectDirectoryName}.${process.pid}.${randomUUID()}.importing`),
  };
}

function decodeCoreGenome(sinkPayload, recoveryPlan) {
  if (!isPlainObject(sinkPayload)
    || sinkPayload.schemaVersion !== 'yalken.blackBoxStrictCapsuleRecover.ephemeralCorePayload.v1'
    || !Buffer.isBuffer(sinkPayload.coreBytes)
    || !isPlainObject(sinkPayload.corePayload)
    || !validDigest(sinkPayload.corePayload.sha256)
    || sinkPayload.corePayload.sha256 !== sha256Buffer(sinkPayload.coreBytes)
    || sinkPayload.corePayload.sha256 !== recoveryPlan?.corePayloadSha256
    || sinkPayload.sourceBindingDigest !== recoveryPlan?.sourceBindingDigest
    || sinkPayload.capsuleManifestDigest !== recoveryPlan?.capsuleManifestDigest
    || sinkPayload.capsuleCiphertextSha256 !== recoveryPlan?.capsuleCiphertextSha256) {
    return {
      ok: false,
      code: BLACK_BOX_IMPORT_AS_NEW_PROJECT_WRITER_V1_CODES.SINK_PAYLOAD_MISSING,
      reasons: [reason(BLACK_BOX_IMPORT_AS_NEW_PROJECT_WRITER_V1_CODES.SINK_PAYLOAD_MISSING, 'recoveredCorePayloadSink')],
    };
  }
  let genome;
  try {
    genome = JSON.parse(sinkPayload.coreBytes.toString('utf8'));
  } catch {
    return {
      ok: false,
      code: BLACK_BOX_IMPORT_AS_NEW_PROJECT_WRITER_V1_CODES.CORE_PAYLOAD_INVALID,
      reasons: [reason(BLACK_BOX_IMPORT_AS_NEW_PROJECT_WRITER_V1_CODES.CORE_PAYLOAD_INVALID, 'coreBytes')],
    };
  }
  return validateCoreGenome(genome, sinkPayload);
}

function safeRelativePathFromBindingKey(bindingKey) {
  if (typeof bindingKey !== 'string' || !bindingKey.startsWith('file:')) return null;
  const relativePath = bindingKey.slice('file:'.length);
  if (!relativePath || relativePath.startsWith('/') || relativePath.includes('\\') || /[\u0000-\u001F]/u.test(relativePath)) return null;
  const segments = relativePath.split('/');
  if (segments.some((segment) => !segment || segment === '.' || segment === '..' || segment.trim() !== segment)) return null;
  return segments.join(path.sep);
}

function validateCoreItem(item, seenPaths) {
  const reasons = [];
  if (!isPlainObject(item)) {
    return { ok: false, reasons: [reason(BLACK_BOX_IMPORT_AS_NEW_PROJECT_WRITER_V1_CODES.CORE_PAYLOAD_INVALID, 'core.items')] };
  }
  for (const key of CORE_ITEM_REQUIRED_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(item, key)) {
      reasons.push(reason(BLACK_BOX_IMPORT_AS_NEW_PROJECT_WRITER_V1_CODES.CORE_PAYLOAD_INVALID, `core.items.${key}`));
    }
  }
  const relativePath = safeRelativePathFromBindingKey(item.bindingKey);
  if (!relativePath) reasons.push(reason(BLACK_BOX_IMPORT_AS_NEW_PROJECT_WRITER_V1_CODES.PATH_REJECTED, 'core.items.bindingKey'));
  if (relativePath && seenPaths.has(relativePath)) {
    reasons.push(reason(BLACK_BOX_IMPORT_AS_NEW_PROJECT_WRITER_V1_CODES.PATH_REJECTED, 'core.items.bindingKey.duplicate'));
  }
  if (relativePath) seenPaths.add(relativePath);
  if (!['PROJECT_MANIFEST', 'SCENE_DOCUMENT', 'NOTE_DOCUMENT', 'HISTORY_DOCUMENT'].includes(item.kind)) {
    reasons.push(reason(BLACK_BOX_IMPORT_AS_NEW_PROJECT_WRITER_V1_CODES.CORE_PAYLOAD_INVALID, 'core.items.kind'));
  }
  if (typeof item.sourceText !== 'string') {
    reasons.push(reason(BLACK_BOX_IMPORT_AS_NEW_PROJECT_WRITER_V1_CODES.CORE_PAYLOAD_INVALID, 'core.items.sourceText'));
  } else {
    const bytes = Buffer.from(item.sourceText, 'utf8');
    if (item.byteLength !== bytes.byteLength || item.sourceTextDigest !== sha256Buffer(bytes)) {
      reasons.push(reason(BLACK_BOX_IMPORT_AS_NEW_PROJECT_WRITER_V1_CODES.CORE_PAYLOAD_INVALID, 'core.items.sourceTextDigest'));
    }
  }
  if (!Number.isSafeInteger(item.ordinal) || item.ordinal < 0) {
    reasons.push(reason(BLACK_BOX_IMPORT_AS_NEW_PROJECT_WRITER_V1_CODES.CORE_PAYLOAD_INVALID, 'core.items.ordinal'));
  }
  return reasons.length > 0
    ? { ok: false, reasons }
    : {
        ok: true,
        entry: {
          kind: item.kind,
          documentId: String(item.documentId || ''),
          bindingKey: item.bindingKey,
          relativePath,
          sourceText: item.sourceText,
          byteLength: Buffer.byteLength(item.sourceText, 'utf8'),
          sha256: item.sourceTextDigest,
          ordinal: item.ordinal,
        },
      };
}

function validateCoreGenome(genome, sinkPayload) {
  const reasons = [];
  if (!isPlainObject(genome)) {
    return {
      ok: false,
      code: BLACK_BOX_IMPORT_AS_NEW_PROJECT_WRITER_V1_CODES.CORE_PAYLOAD_INVALID,
      reasons: [reason(BLACK_BOX_IMPORT_AS_NEW_PROJECT_WRITER_V1_CODES.CORE_PAYLOAD_INVALID, 'core')],
    };
  }
  if (genome.schemaVersion !== CORE_GENOME_SCHEMA) {
    reasons.push(reason(BLACK_BOX_IMPORT_AS_NEW_PROJECT_WRITER_V1_CODES.CORE_PAYLOAD_INVALID, 'core.schemaVersion'));
  }
  if (genome.sourceSetDigest !== sinkPayload.corePayload.sourceSetDigest
    || genome.sourceSetDigest !== sinkPayload.sourceBinding?.sourceSetDigest) {
    reasons.push(reason(BLACK_BOX_IMPORT_AS_NEW_PROJECT_WRITER_V1_CODES.CORE_PAYLOAD_INVALID, 'core.sourceSetDigest'));
  }
  if (!isPlainObject(genome.recovery)
    || genome.recovery.importMode !== IMPORT_AS_NEW
    || genome.recovery.liveProjectOverwrite !== false
    || genome.recovery.quarantineRequired !== true) {
    reasons.push(reason(BLACK_BOX_IMPORT_AS_NEW_PROJECT_WRITER_V1_CODES.CORE_PAYLOAD_INVALID, 'core.recovery'));
  }
  if (!Array.isArray(genome.items) || genome.items.length < 1 || genome.items.length > 500) {
    reasons.push(reason(BLACK_BOX_IMPORT_AS_NEW_PROJECT_WRITER_V1_CODES.CORE_PAYLOAD_INVALID, 'core.items'));
  }
  const seenPaths = new Set();
  const entries = [];
  if (Array.isArray(genome.items)) {
    for (const item of genome.items) {
      const itemResult = validateCoreItem(item, seenPaths);
      if (itemResult.ok) entries.push(itemResult.entry);
      else reasons.push(...itemResult.reasons);
    }
  }
  if (entries.filter((entry) => entry.kind === 'PROJECT_MANIFEST').length !== 1) {
    reasons.push(reason(BLACK_BOX_IMPORT_AS_NEW_PROJECT_WRITER_V1_CODES.CORE_PAYLOAD_INVALID, 'core.items.PROJECT_MANIFEST'));
  }
  if (reasons.some((entry) => entry.code === BLACK_BOX_IMPORT_AS_NEW_PROJECT_WRITER_V1_CODES.PATH_REJECTED)) {
    return { ok: false, code: BLACK_BOX_IMPORT_AS_NEW_PROJECT_WRITER_V1_CODES.PATH_REJECTED, reasons };
  }
  if (reasons.length > 0) {
    return { ok: false, code: BLACK_BOX_IMPORT_AS_NEW_PROJECT_WRITER_V1_CODES.CORE_PAYLOAD_INVALID, reasons };
  }
  return {
    ok: true,
    genome,
    entries: entries.sort((a, b) => a.ordinal - b.ordinal || a.relativePath.localeCompare(b.relativePath)),
  };
}

async function syncFileAndParent(filePath) {
  const fileHandle = await fs.open(filePath, 'r');
  try {
    await fileHandle.sync();
  } finally {
    await fileHandle.close();
  }
  let dirHandle;
  try {
    dirHandle = await fs.open(path.dirname(filePath), 'r');
    await dirHandle.sync();
  } catch (error) {
    if (!['EINVAL', 'EPERM', 'EISDIR'].includes(error?.code)) throw error;
  } finally {
    await dirHandle?.close().catch(() => undefined);
  }
}

async function syncDirectory(directoryPath) {
  let dirHandle;
  try {
    dirHandle = await fs.open(directoryPath, 'r');
    await dirHandle.sync();
  } catch (error) {
    if (!['EINVAL', 'EPERM', 'EISDIR'].includes(error?.code)) throw error;
  } finally {
    await dirHandle?.close().catch(() => undefined);
  }
}

async function writeFileCreateOnly(filePath, text) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const handle = await fs.open(filePath, 'wx', 0o600);
  try {
    await handle.writeFile(text, 'utf8');
    await handle.sync();
  } finally {
    await handle.close();
  }
  const readback = await fs.readFile(filePath, 'utf8');
  if (readback !== text) {
    throw Object.assign(new Error('READBACK_MISMATCH'), { code: BLACK_BOX_IMPORT_AS_NEW_PROJECT_WRITER_V1_CODES.READBACK_MISMATCH });
  }
  await syncFileAndParent(filePath);
}

function sanitizedFileEntries(entries) {
  return entries.map((entry) => ({
    kind: entry.kind,
    documentId: entry.documentId,
    bindingKey: entry.bindingKey,
    relativePath: entry.relativePath.replaceAll(path.sep, '/'),
    byteLength: entry.byteLength,
    sha256: entry.sha256,
  }));
}

function buildReceipt({ request, target, recoveryPlan, sinkPayload, entries, receiptSha256 = '' }) {
  const coreFiles = sanitizedFileEntries(entries);
  return {
    schemaVersion: BLACK_BOX_IMPORT_AS_NEW_PROJECT_WRITER_V1_SCHEMAS.receipt,
    code: BLACK_BOX_IMPORT_AS_NEW_PROJECT_WRITER_V1_CODES.PROJECT_WRITTEN,
    importMode: IMPORT_AS_NEW,
    projectDirectoryName: target.projectDirectoryName,
    fileCount: coreFiles.length + 1,
    sourceBindingDigest: recoveryPlan.sourceBindingDigest,
    sourceSetDigest: sinkPayload.corePayload.sourceSetDigest,
    providerPinDigest: recoveryPlan.providerPinDigest,
    capsuleManifestDigest: recoveryPlan.capsuleManifestDigest,
    capsuleCiphertextSha256: recoveryPlan.capsuleCiphertextSha256,
    corePayloadSha256: sinkPayload.corePayload.sha256,
    receiptSha256,
    files: coreFiles,
    claims: {
      p0cRecoverExecuted: 'PASS',
      p0cSinkDelivered: 'PASS',
      createOnlyNewProject: 'PASS',
      importAsNewProjectOnly: 'PASS',
      liveProjectOverwrite: 'DENIED',
      readbackVerified: 'PASS',
      noPlaintextOrKeyMaterialInReceipt: 'PASS',
      productRuntimeWiring: 'NOT_CLAIMED',
      commandKernelWiring: 'NOT_CLAIMED',
      productUiWiring: 'NOT_CLAIMED',
      projectLibraryRegistration: 'NOT_CLAIMED',
      ownerKeyRecoveryDrill: 'NOT_CLAIMED',
      disasterReady: 'NOT_CLAIMED',
    },
    limitations: {
      userDocuments: 'FORBIDDEN_IN_THIS_CONTOUR',
      liveProjectOverwrite: 'DENIED',
      projectLibraryRegistration: 'NOT_CLAIMED',
      exactByteFinalCompleteDonor: 'NOT_CLAIMED',
      physicalPowerLossProof: 'NOT_CLAIMED',
      productRuntimeWiring: 'NOT_CLAIMED',
      requestFeatureEnabled: request.featureFlags[BLACK_BOX_IMPORT_AS_NEW_PROJECT_WRITER_V1_FEATURE_FLAG] === true,
    },
  };
}

async function writeRecoveredProject({ target, sinkPayload, recoveryPlan, entries, request }) {
  await fs.mkdir(target.stagingRoot, { recursive: false, mode: 0o700 });
  await syncDirectory(target.parentDirectoryPath);
  try {
    for (const entry of entries) {
      await writeFileCreateOnly(path.join(target.stagingRoot, entry.relativePath), entry.sourceText);
    }
    const preliminaryReceipt = buildReceipt({ request, target, recoveryPlan, sinkPayload, entries });
    if (LEAK_PATTERN.test(JSON.stringify(preliminaryReceipt))) {
      return {
        ok: false,
        code: BLACK_BOX_IMPORT_AS_NEW_PROJECT_WRITER_V1_CODES.PLAINTEXT_OR_KEY_LEAK,
        reasons: [reason(BLACK_BOX_IMPORT_AS_NEW_PROJECT_WRITER_V1_CODES.PLAINTEXT_OR_KEY_LEAK, 'receipt')],
      };
    }
    const receiptText = `${JSON.stringify(preliminaryReceipt, null, 2)}\n`;
    const receiptSha256 = sha256Buffer(Buffer.from(receiptText, 'utf8'));
    const finalReceipt = buildReceipt({ request, target, recoveryPlan, sinkPayload, entries, receiptSha256 });
    const finalReceiptText = `${JSON.stringify(finalReceipt, null, 2)}\n`;
    if (LEAK_PATTERN.test(finalReceiptText)) {
      return {
        ok: false,
        code: BLACK_BOX_IMPORT_AS_NEW_PROJECT_WRITER_V1_CODES.PLAINTEXT_OR_KEY_LEAK,
        reasons: [reason(BLACK_BOX_IMPORT_AS_NEW_PROJECT_WRITER_V1_CODES.PLAINTEXT_OR_KEY_LEAK, 'receipt')],
      };
    }
    await writeFileCreateOnly(path.join(target.stagingRoot, RECEIPT_RELATIVE_PATH), finalReceiptText);
    await fs.rename(target.stagingRoot, target.projectRoot);
    await syncDirectory(target.parentDirectoryPath);
    for (const entry of entries) {
      const readback = await fs.readFile(path.join(target.projectRoot, entry.relativePath), 'utf8');
      if (sha256Buffer(Buffer.from(readback, 'utf8')) !== entry.sha256) {
        return {
          ok: false,
          code: BLACK_BOX_IMPORT_AS_NEW_PROJECT_WRITER_V1_CODES.READBACK_MISMATCH,
          reasons: [reason(BLACK_BOX_IMPORT_AS_NEW_PROJECT_WRITER_V1_CODES.READBACK_MISMATCH, entry.relativePath)],
        };
      }
    }
    const receiptReadback = await fs.readFile(path.join(target.projectRoot, RECEIPT_RELATIVE_PATH), 'utf8');
    if (sha256Buffer(Buffer.from(receiptReadback, 'utf8')) !== sha256Buffer(Buffer.from(finalReceiptText, 'utf8'))) {
      return {
        ok: false,
        code: BLACK_BOX_IMPORT_AS_NEW_PROJECT_WRITER_V1_CODES.READBACK_MISMATCH,
        reasons: [reason(BLACK_BOX_IMPORT_AS_NEW_PROJECT_WRITER_V1_CODES.READBACK_MISMATCH, RECEIPT_RELATIVE_PATH)],
      };
    }
    return {
      ok: true,
      project: {
        schemaVersion: 'yalken.blackBoxImportAsNewProjectWriter.project.v1',
        projectDirectoryName: target.projectDirectoryName,
        fileCount: entries.length + 1,
        projectManifestRelativePath: entries.find((entry) => entry.kind === 'PROJECT_MANIFEST')?.relativePath.replaceAll(path.sep, '/') || '',
        sourceBinding: recoveryPlan.sourceBinding,
        sourceBindingDigest: recoveryPlan.sourceBindingDigest,
        sourceSetDigest: sinkPayload.corePayload.sourceSetDigest,
        corePayloadSha256: sinkPayload.corePayload.sha256,
        receiptRelativePath: RECEIPT_RELATIVE_PATH,
        productRuntimeWired: false,
        commandKernelWired: false,
        productUiWired: false,
        projectLibraryRegistered: false,
      },
      receipt: finalReceipt,
    };
  } catch (error) {
    await fs.rm(target.stagingRoot, { recursive: true, force: true }).catch(() => undefined);
    if (error?.code === 'EEXIST') {
      return {
        ok: false,
        code: BLACK_BOX_IMPORT_AS_NEW_PROJECT_WRITER_V1_CODES.TARGET_EXISTS,
        reasons: [reason(BLACK_BOX_IMPORT_AS_NEW_PROJECT_WRITER_V1_CODES.TARGET_EXISTS, 'target')],
      };
    }
    return {
      ok: false,
      code: error?.code === BLACK_BOX_IMPORT_AS_NEW_PROJECT_WRITER_V1_CODES.READBACK_MISMATCH
        ? BLACK_BOX_IMPORT_AS_NEW_PROJECT_WRITER_V1_CODES.READBACK_MISMATCH
        : BLACK_BOX_IMPORT_AS_NEW_PROJECT_WRITER_V1_CODES.WRITE_FAILED,
      reasons: [reason(error?.code || BLACK_BOX_IMPORT_AS_NEW_PROJECT_WRITER_V1_CODES.WRITE_FAILED, 'filesystem')],
    };
  }
}

async function prepareRecoveryPlanWithSink(request, options, sinkHolder) {
  const prepare = typeof options.prepareRecoveryPlan === 'function'
    ? options.prepareRecoveryPlan
    : prepareBlackBoxImportAsNewRecoveryPlanV1;
  const recover = typeof options.recoverStrictCapsule === 'function'
    ? options.recoverStrictCapsule
    : recoverBlackBoxStrictCapsuleV1;
  return prepare(request.recoveryRequest, {
    ageProvider: options.ageProvider,
    recoverStrictCapsule: async (p0cRequest, p0cOptions = {}) => recover(p0cRequest, {
      ...p0cOptions,
      ageProvider: options.ageProvider,
      recoveredCorePayloadSink: async (payload) => {
        sinkHolder.payload = payload;
        return {
          ok: true,
          sinkId: 'black-box-import-as-new-project-writer-v1',
          corePayloadSha256: payload.corePayload?.sha256,
        };
      },
    }),
  });
}

function upstreamDeny(upstream) {
  const code = BLOCKING_UPSTREAM_DECISIONS.has(upstream?.decision)
    ? BLACK_BOX_IMPORT_AS_NEW_PROJECT_WRITER_V1_CODES.UPSTREAM_NOT_PASS
    : BLACK_BOX_IMPORT_AS_NEW_PROJECT_WRITER_V1_CODES.UPSTREAM_NOT_PASS;
  return deny(code, [
    reason(code, 'recoveryPlan', 'PASS', upstream?.code || upstream?.decision),
    ...(Array.isArray(upstream?.reasons) ? upstream.reasons : []),
  ], { upstreamCode: upstream?.code || '' });
}

export async function writeBlackBoxImportAsNewProjectV1(request = {}, options = {}) {
  const validation = validateRequest(request);
  if (!validation.ok) return deny(validation.code, validation.reasons);

  const target = await resolveTarget(request.target);
  if (!target.ok) return deny(target.code, target.reasons);

  const sinkHolder = { payload: null };
  let recoveryResult;
  try {
    recoveryResult = await prepareRecoveryPlanWithSink(request, options, sinkHolder);
  } catch {
    return deny(BLACK_BOX_IMPORT_AS_NEW_PROJECT_WRITER_V1_CODES.UPSTREAM_NOT_PASS, [
      reason(BLACK_BOX_IMPORT_AS_NEW_PROJECT_WRITER_V1_CODES.UPSTREAM_NOT_PASS, 'recoveryPlan'),
    ]);
  }
  if (!isPlainObject(recoveryResult) || recoveryResult.ok !== true || recoveryResult.decision !== 'PASS') {
    return upstreamDeny(recoveryResult);
  }
  const decoded = decodeCoreGenome(sinkHolder.payload, recoveryResult.recoveryPlan);
  if (!decoded.ok) return deny(decoded.code, decoded.reasons, { upstreamCode: recoveryResult.code });

  const written = await writeRecoveredProject({
    target,
    sinkPayload: sinkHolder.payload,
    recoveryPlan: recoveryResult.recoveryPlan,
    entries: decoded.entries,
    request,
  });
  if (!written.ok) return deny(written.code, written.reasons, { upstreamCode: recoveryResult.code });
  const result = {
    project: written.project,
    receipt: written.receipt,
  };
  if (LEAK_PATTERN.test(JSON.stringify(result))) {
    return deny(BLACK_BOX_IMPORT_AS_NEW_PROJECT_WRITER_V1_CODES.PLAINTEXT_OR_KEY_LEAK, [
      reason(BLACK_BOX_IMPORT_AS_NEW_PROJECT_WRITER_V1_CODES.PLAINTEXT_OR_KEY_LEAK, 'result'),
    ]);
  }
  return pass(result);
}

export const BLACK_BOX_IMPORT_AS_NEW_PROJECT_WRITER_V1_INTEGRATION_MANIFEST = Object.freeze({
  schemaVersion: 'FEATURE_INTEGRATION_MANIFEST_V1',
  featureId: 'yalken.blackBox.importAsNewProjectWriter',
  featureVersion: 'v1',
  integrationMode: 'EXISTING_SEAM',
  domainOwner: 'Product Core',
  authoritativeData: 'P0C recovered CORE payload delivered through verified in-process ephemeral sink',
  derivedData: 'Sanitized import-as-new project writer receipt',
  commandIds: [],
  eventTypes: [],
  queryIds: [],
  productProjectionIds: [],
  capabilityIds: [BLACK_BOX_IMPORT_AS_NEW_PROJECT_WRITER_V1_FEATURE_FLAG],
  authorityMap: {
    recoverCorePayload: 'P0C provider/source/capsule revalidation plus ephemeral sink digest binding',
    writeNewProjectDirectory: 'create-only disposable filesystem effect under caller-supplied synthetic target parent',
    liveProjectOverwrite: 'DENIED',
    commandKernelWiring: 'TARGET_ONLY_NOT_RUNTIME_WIRED',
    productUiWiring: 'TARGET_ONLY_NOT_RUNTIME_WIRED',
    projectLibraryRegistration: 'TARGET_ONLY_NOT_RUNTIME_WIRED',
  },
  identityKeys: [
    'projectDirectoryName',
    'sourceBindingDigest',
    'sourceSetDigest',
    'providerPinDigest',
    'capsuleManifestDigest',
    'capsuleCiphertextSha256',
    'corePayloadSha256',
  ],
  revisionPolicy: 'source-revision-bound through P0C; stale/replay/transplant/unknown upstream never aggregate to PASS',
  writePath: 'Isolated create-only new project directory in synthetic target parent; no canonical/live project mutation',
  readPath: 'P0C recovered CORE payload sink, no caller-carried plaintext',
  requiredProductPorts: [
    'BlackBoxStrictCapsuleRecoverP0C',
    'BlackBoxImportAsNewRecoveryPlan',
    'TaskLocalDisposableFilesystemWritePort',
  ],
  requiredDesignOsPorts: ['NOT_APPLICABLE_NO_UI'],
  surfaceManifests: ['NOT_APPLICABLE_NO_UI'],
  stateClasses: ['PROJECT_STATE', 'DERIVED_STATE'],
  rollback: 'Revert this isolated seam, contract/model/physical runner, receipt, ledger and governance entries; synthetic output directories are disposable evidence only.',
});
