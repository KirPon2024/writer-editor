import {
  COMMAND_KERNEL_RECEIPT_AUTHORITY_KIND,
  COMMAND_KERNEL_RECEIPT_SCHEMA_VERSION,
  createEmptyEventLog,
  hashEventLog,
} from '../collab/index.mjs';
import { hashCanonicalValue } from '../core/browser-safe-hash.mjs';

export const STAGE10_COMMAND_RECEIPT_AUTHORITY_HEAD_SCHEMA = 'yalken.stage10.commandReceiptAuthorityHead.v2';
export const STAGE10_COMMAND_RECEIPT_AUTHORITY_STORE_SCHEMA = 'yalken.stage10.commandReceiptAuthorityStore.v2';
export const STAGE10_COMMAND_RECEIPT_AUTHORITY_REF_SCHEMA = 'yalken.stage10.commandReceiptAuthorityRef.v2';
const VERIFIED_AUTHORITY_STORES = new WeakSet();

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const item of Object.values(value)) deepFreeze(item);
  return value;
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizeString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function typedError(code, op, reason, details) {
  const error = { code, op, reason };
  if (isPlainObject(details)) error.details = cloneJson(details);
  return error;
}

function sha256Text(value) {
  return /^[a-f0-9]{64}$/i.test(normalizeString(value));
}

function stableIdentity(value) {
  const normalized = normalizeString(value);
  return /^[a-z0-9][a-z0-9._:-]{0,159}$/iu.test(normalized) ? normalized : '';
}

export function receiptRootDigest(receipts = []) {
  const normalized = Array.isArray(receipts) ? receipts.map((receipt) => cloneJson(receipt)) : [];
  let rootDigest = hashCanonicalValue({
    authorityKind: COMMAND_KERNEL_RECEIPT_AUTHORITY_KIND,
    schemaVersion: COMMAND_KERNEL_RECEIPT_SCHEMA_VERSION,
    receiptCount: 0,
  });
  for (let index = 0; index < normalized.length; index += 1) {
    rootDigest = hashCanonicalValue({
      previousReceiptRootDigest: rootDigest,
      receiptIndex: index,
      receiptDigest: hashCanonicalValue(normalized[index]),
    });
  }
  return rootDigest;
}

function appendReceiptRootDigest(previousRootDigest, receipt, receiptIndex) {
  return hashCanonicalValue({
    previousReceiptRootDigest: normalizeString(previousRootDigest),
    receiptIndex,
    receiptDigest: hashCanonicalValue(receipt),
  });
}

export function authorityHeadDigest(headCore) {
  return hashCanonicalValue({
    schemaVersion: headCore.schemaVersion,
    authorityKind: headCore.authorityKind,
    authorityVersion: headCore.authorityVersion,
    projectId: headCore.projectId,
    authorityGeneration: headCore.authorityGeneration,
    receiptCount: headCore.receiptCount,
    receiptRootDigest: headCore.receiptRootDigest,
    eventLogDigest: headCore.eventLogDigest,
    previousAuthorityHeadDigest: normalizeString(headCore.previousAuthorityHeadDigest),
  });
}

function createHead({ projectId, generation, receiptCount, receiptRoot, eventLogDigest, previousAuthorityHeadDigest = '' }) {
  const headCore = {
    schemaVersion: STAGE10_COMMAND_RECEIPT_AUTHORITY_HEAD_SCHEMA,
    authorityKind: COMMAND_KERNEL_RECEIPT_AUTHORITY_KIND,
    authorityVersion: 2,
    projectId: normalizeString(projectId),
    authorityGeneration: generation,
    receiptCount,
    receiptRootDigest: receiptRoot,
    eventLogDigest: normalizeString(eventLogDigest),
    previousAuthorityHeadDigest: normalizeString(previousAuthorityHeadDigest),
  };
  return deepFreeze({
    ...headCore,
    authorityHeadDigest: authorityHeadDigest(headCore),
  });
}

export function createCommandReceiptAuthorityHeadRef(head) {
  if (!isPlainObject(head)) return null;
  return deepFreeze({
    schemaVersion: STAGE10_COMMAND_RECEIPT_AUTHORITY_REF_SCHEMA,
    authorityKind: COMMAND_KERNEL_RECEIPT_AUTHORITY_KIND,
    authorityVersion: 2,
    projectId: normalizeString(head.projectId),
    authorityGeneration: head.authorityGeneration,
    receiptCount: head.receiptCount,
    receiptRootDigest: normalizeString(head.receiptRootDigest),
    eventLogDigest: normalizeString(head.eventLogDigest),
    previousAuthorityHeadDigest: normalizeString(head.previousAuthorityHeadDigest),
    authorityHeadDigest: normalizeString(head.authorityHeadDigest),
  });
}

export function createInitialCommandReceiptAuthorityStore({ projectId, eventLog }) {
  const receipts = [];
  const eventLogDigest = hashEventLog(isPlainObject(eventLog) ? eventLog : createEmptyEventLog());
  const head = createHead({
    projectId,
    generation: 0,
    receiptCount: 0,
    receiptRoot: receiptRootDigest(receipts),
    eventLogDigest,
    previousAuthorityHeadDigest: '',
  });
  const store = deepFreeze({
    schemaVersion: STAGE10_COMMAND_RECEIPT_AUTHORITY_STORE_SCHEMA,
    projectId: normalizeString(projectId),
    authorityKind: COMMAND_KERNEL_RECEIPT_AUTHORITY_KIND,
    authorityVersion: 2,
    currentHead: head,
    compaction: deepFreeze({
      schemaVersion: 'yalken.stage10.commandReceiptAuthorityCompaction.v1',
      headHistoryStored: false,
      rootAlgorithm: 'sha256-receipt-chain-v1',
      retainedReceiptCount: receipts.length,
    }),
    receipts,
  });
  VERIFIED_AUTHORITY_STORES.add(store);
  return store;
}

function validateReceipt(receipt, index) {
  if (!isPlainObject(receipt)) {
    return typedError('E_STAGE10_RECEIPT_SCHEMA_INVALID', 'stage10.commandReceiptAuthorityHead', 'COMMAND_KERNEL_RECEIPT_SCHEMA_INVALID', { index });
  }
  if (receipt.schemaVersion !== COMMAND_KERNEL_RECEIPT_SCHEMA_VERSION) {
    return typedError('E_STAGE10_RECEIPT_VERSION_INVALID', 'stage10.commandReceiptAuthorityHead', 'COMMAND_KERNEL_RECEIPT_VERSION_INVALID', { index });
  }
  if (!stableIdentity(receipt.receiptId) || !stableIdentity(receipt.operationId) || !normalizeString(receipt.commandId)) {
    return typedError('E_STAGE10_RECEIPT_BINDING_INVALID', 'stage10.commandReceiptAuthorityHead', 'COMMAND_KERNEL_RECEIPT_OPERATION_BINDING_INVALID', { index });
  }
  if (receipt.capabilityRevalidated !== true) {
    return typedError('E_STAGE10_RECEIPT_CAPABILITY_INVALID', 'stage10.commandReceiptAuthorityHead', 'COMMAND_KERNEL_RECEIPT_CAPABILITY_REVALIDATION_REQUIRED', { index });
  }
  if (!sha256Text(receipt.preStateHash) || !sha256Text(receipt.postStateHash)) {
    return typedError('E_STAGE10_RECEIPT_STATE_HASH_INVALID', 'stage10.commandReceiptAuthorityHead', 'COMMAND_KERNEL_RECEIPT_STATE_HASH_INVALID', { index });
  }
  if (Number.isInteger(receipt.domainEventCount) && receipt.domainEventCount > 0 && !sha256Text(receipt.domainEventDigest)) {
    return typedError('E_STAGE10_RECEIPT_EVENT_DIGEST_INVALID', 'stage10.commandReceiptAuthorityHead', 'COMMAND_KERNEL_RECEIPT_EVENT_DIGEST_REQUIRED', { index });
  }
  if (Array.isArray(receipt.domainEvents) || Array.isArray(receipt.details?.domainEvents)) {
    return typedError('E_STAGE10_RECEIPT_FACTS_DUPLICATED', 'stage10.commandReceiptAuthorityHead', 'COMMAND_KERNEL_RECEIPT_FACTS_MUST_NOT_DUPLICATE_EVENT_LOG', { index });
  }
  return null;
}

function duplicateReceiptIdentityError(receipts) {
  const receiptIds = new Set();
  const operationIds = new Set();
  for (let index = 0; index < receipts.length; index += 1) {
    const receiptId = stableIdentity(receipts[index]?.receiptId);
    const operationId = stableIdentity(receipts[index]?.operationId);
    if (receiptIds.has(receiptId)) {
      return typedError(
        'E_STAGE10_RECEIPT_ID_DUPLICATE',
        'stage10.commandReceiptAuthorityHead',
        'COMMAND_KERNEL_RECEIPT_ID_ALREADY_EXISTS',
        { index, receiptId },
      );
    }
    if (operationIds.has(operationId)) {
      return typedError(
        'E_STAGE10_OPERATION_ID_DUPLICATE',
        'stage10.commandReceiptAuthorityHead',
        'COMMAND_KERNEL_OPERATION_ID_ALREADY_EXISTS',
        { index, operationId },
      );
    }
    receiptIds.add(receiptId);
    operationIds.add(operationId);
  }
  return null;
}

export function preflightCommandReceiptIdentity({ store, projectId, eventLog, operationId, receiptId = operationId } = {}) {
  const normalizedOperationId = stableIdentity(operationId);
  const normalizedReceiptId = stableIdentity(receiptId);
  if (!normalizedOperationId || !normalizedReceiptId) {
    return {
      ok: false,
      error: typedError(
        'E_STAGE10_OPERATION_ID_INVALID',
        'stage10.commandReceiptAuthorityHead.preflight',
        'COMMAND_KERNEL_OPERATION_ID_INVALID',
      ),
    };
  }
  let verifiedStore = store;
  if (!VERIFIED_AUTHORITY_STORES.has(verifiedStore)) {
    const verified = validateCommandReceiptAuthorityStore(store, { projectId, eventLog });
    if (!verified.ok) return verified;
    verifiedStore = verified.store;
  } else if (normalizeString(verifiedStore.projectId) !== normalizeString(projectId)) {
    return {
      ok: false,
      error: typedError(
        'E_STAGE10_RECEIPT_AUTHORITY_STORE_PROJECT_INVALID',
        'stage10.commandReceiptAuthorityHead.preflight',
        'COMMAND_KERNEL_RECEIPT_AUTHORITY_STORE_PROJECT_MISMATCH',
      ),
    };
  }
  if (verifiedStore.receipts.some((receipt) => receipt.receiptId === normalizedReceiptId)) {
    return {
      ok: false,
      error: typedError(
        'E_STAGE10_RECEIPT_ID_DUPLICATE',
        'stage10.commandReceiptAuthorityHead.preflight',
        'COMMAND_KERNEL_RECEIPT_ID_ALREADY_EXISTS',
        { receiptId: normalizedReceiptId },
      ),
    };
  }
  if (
    verifiedStore.receipts.some((receipt) => receipt.operationId === normalizedOperationId)
    || (Array.isArray(eventLog?.events) && eventLog.events.some((event) => normalizeString(event?.opId) === normalizedOperationId))
  ) {
    return {
      ok: false,
      error: typedError(
        'E_STAGE10_OPERATION_ID_DUPLICATE',
        'stage10.commandReceiptAuthorityHead.preflight',
        'COMMAND_KERNEL_OPERATION_ID_ALREADY_EXISTS',
        { operationId: normalizedOperationId },
      ),
    };
  }
  return {
    ok: true,
    operationId: normalizedOperationId,
    receiptId: normalizedReceiptId,
  };
}

function validateHead(head, { projectId, receipts, eventLogDigest, previousHeadDigest, generation }) {
  if (!isPlainObject(head)) {
    return typedError('E_STAGE10_RECEIPT_AUTHORITY_HEAD_MISSING', 'stage10.commandReceiptAuthorityHead', 'COMMAND_KERNEL_RECEIPT_AUTHORITY_HEAD_MISSING');
  }
  if (
    head.schemaVersion !== STAGE10_COMMAND_RECEIPT_AUTHORITY_HEAD_SCHEMA
    || head.authorityKind !== COMMAND_KERNEL_RECEIPT_AUTHORITY_KIND
    || head.authorityVersion !== 2
  ) {
    return typedError('E_STAGE10_RECEIPT_AUTHORITY_HEAD_VERSION_INVALID', 'stage10.commandReceiptAuthorityHead', 'COMMAND_KERNEL_RECEIPT_AUTHORITY_HEAD_VERSION_INVALID');
  }
  if (normalizeString(head.projectId) !== normalizeString(projectId)) {
    return typedError('E_STAGE10_RECEIPT_AUTHORITY_HEAD_PROJECT_INVALID', 'stage10.commandReceiptAuthorityHead', 'COMMAND_KERNEL_RECEIPT_AUTHORITY_HEAD_PROJECT_MISMATCH');
  }
  if (head.authorityGeneration !== generation || head.receiptCount !== receipts.length) {
    return typedError('E_STAGE10_RECEIPT_AUTHORITY_HEAD_STALE', 'stage10.commandReceiptAuthorityHead', 'COMMAND_KERNEL_RECEIPT_AUTHORITY_HEAD_STALE_OR_ROLLED_BACK');
  }
  if (
    (generation === 0 && normalizeString(head.previousAuthorityHeadDigest))
    || (generation > 0 && !sha256Text(head.previousAuthorityHeadDigest))
  ) {
    return typedError('E_STAGE10_RECEIPT_AUTHORITY_HEAD_FORKED', 'stage10.commandReceiptAuthorityHead', 'COMMAND_KERNEL_RECEIPT_AUTHORITY_HEAD_PREVIOUS_DIGEST_FORKED');
  }
  if (normalizeString(head.previousAuthorityHeadDigest) !== normalizeString(previousHeadDigest)) {
    return typedError('E_STAGE10_RECEIPT_AUTHORITY_HEAD_FORKED', 'stage10.commandReceiptAuthorityHead', 'COMMAND_KERNEL_RECEIPT_AUTHORITY_HEAD_PREVIOUS_DIGEST_FORKED');
  }
  if (normalizeString(head.receiptRootDigest) !== receiptRootDigest(receipts)) {
    return typedError('E_STAGE10_RECEIPT_AUTHORITY_ROOT_MISMATCH', 'stage10.commandReceiptAuthorityHead', 'COMMAND_KERNEL_RECEIPT_AUTHORITY_ROOT_MISMATCH');
  }
  if (normalizeString(head.eventLogDigest) !== normalizeString(eventLogDigest)) {
    return typedError('E_STAGE10_RECEIPT_AUTHORITY_EVENT_LOG_MISMATCH', 'stage10.commandReceiptAuthorityHead', 'COMMAND_KERNEL_RECEIPT_AUTHORITY_EVENT_LOG_DIGEST_MISMATCH');
  }
  const expectedDigest = authorityHeadDigest(head);
  if (normalizeString(head.authorityHeadDigest) !== expectedDigest) {
    return typedError('E_STAGE10_RECEIPT_AUTHORITY_HEAD_DIGEST_INVALID', 'stage10.commandReceiptAuthorityHead', 'COMMAND_KERNEL_RECEIPT_AUTHORITY_HEAD_DIGEST_INVALID');
  }
  return null;
}

export function validateCommandReceiptAuthorityStore(storeInput, {
  projectId,
  eventLog,
  sessionRef,
  requireReceipts = false,
  requireSessionRef = false,
} = {}) {
  if (!isPlainObject(storeInput)) {
    return { ok: false, error: typedError('E_STAGE10_RECEIPT_AUTHORITY_STORE_MISSING', 'stage10.commandReceiptAuthorityHead', 'COMMAND_KERNEL_RECEIPT_AUTHORITY_STORE_MISSING') };
  }
  const store = cloneJson(storeInput);
  const expectedProjectId = normalizeString(projectId) || normalizeString(store.projectId);
  if (
    store.schemaVersion !== STAGE10_COMMAND_RECEIPT_AUTHORITY_STORE_SCHEMA
    || store.authorityKind !== COMMAND_KERNEL_RECEIPT_AUTHORITY_KIND
    || store.authorityVersion !== 2
  ) {
    return { ok: false, error: typedError('E_STAGE10_RECEIPT_AUTHORITY_STORE_VERSION_INVALID', 'stage10.commandReceiptAuthorityHead', 'COMMAND_KERNEL_RECEIPT_AUTHORITY_STORE_VERSION_INVALID') };
  }
  if (normalizeString(store.projectId) !== expectedProjectId) {
    return { ok: false, error: typedError('E_STAGE10_RECEIPT_AUTHORITY_STORE_PROJECT_INVALID', 'stage10.commandReceiptAuthorityHead', 'COMMAND_KERNEL_RECEIPT_AUTHORITY_STORE_PROJECT_MISMATCH') };
  }
  const receipts = Array.isArray(store.receipts) ? store.receipts.map((receipt) => cloneJson(receipt)) : null;
  if (!receipts) {
    return { ok: false, error: typedError('E_STAGE10_RECEIPT_AUTHORITY_RECEIPTS_INVALID', 'stage10.commandReceiptAuthorityHead', 'COMMAND_KERNEL_RECEIPT_AUTHORITY_RECEIPTS_INVALID') };
  }
  for (let index = 0; index < receipts.length; index += 1) {
    const receiptError = validateReceipt(receipts[index], index);
    if (receiptError) return { ok: false, error: receiptError };
  }
  const duplicateError = duplicateReceiptIdentityError(receipts);
  if (duplicateError) return { ok: false, error: duplicateError };
  if (requireReceipts && receipts.length === 0) {
    return { ok: false, error: typedError('E_STAGE10_RECEIPT_AUTHORITY_RECEIPT_MISSING', 'stage10.commandReceiptAuthorityHead', 'COMMAND_KERNEL_RECEIPT_AUTHORITY_RECEIPT_MISSING') };
  }
  const eventLogDigest = isPlainObject(eventLog)
    ? hashEventLog(eventLog)
    : normalizeString(store.currentHead?.eventLogDigest);
  if (
    !isPlainObject(store.compaction)
    || store.compaction.schemaVersion !== 'yalken.stage10.commandReceiptAuthorityCompaction.v1'
    || store.compaction.headHistoryStored !== false
    || store.compaction.rootAlgorithm !== 'sha256-receipt-chain-v1'
    || store.compaction.retainedReceiptCount !== receipts.length
    || Object.prototype.hasOwnProperty.call(store, 'headHistory')
  ) {
    return { ok: false, error: typedError('E_STAGE10_RECEIPT_AUTHORITY_COMPACTION_INVALID', 'stage10.commandReceiptAuthorityHead', 'COMMAND_KERNEL_RECEIPT_AUTHORITY_COMPACTION_INVALID') };
  }
  const previousHeadDigest = normalizeString(store.currentHead?.previousAuthorityHeadDigest);
  if (receipts.length === 0 && previousHeadDigest) {
    return { ok: false, error: typedError('E_STAGE10_RECEIPT_AUTHORITY_HEAD_FORKED', 'stage10.commandReceiptAuthorityHead', 'COMMAND_KERNEL_RECEIPT_AUTHORITY_HEAD_PREVIOUS_DIGEST_FORKED') };
  }
  const headError = validateHead(store.currentHead, {
    projectId: expectedProjectId,
    receipts,
    eventLogDigest,
    previousHeadDigest,
    generation: receipts.length,
  });
  if (headError) return { ok: false, error: headError };
  const headRef = createCommandReceiptAuthorityHeadRef(store.currentHead);
  if (requireSessionRef && !isPlainObject(sessionRef) && receipts.length > 0) {
    return { ok: false, error: typedError('E_STAGE10_RECEIPT_AUTHORITY_SESSION_HEAD_MISSING', 'stage10.commandReceiptAuthorityHead', 'COMMAND_KERNEL_RECEIPT_AUTHORITY_SESSION_HEAD_MISMATCH') };
  }
  if (isPlainObject(sessionRef) && hashCanonicalValue(sessionRef) !== hashCanonicalValue(headRef)) {
    return { ok: false, error: typedError('E_STAGE10_RECEIPT_AUTHORITY_SESSION_HEAD_MISMATCH', 'stage10.commandReceiptAuthorityHead', 'COMMAND_KERNEL_RECEIPT_AUTHORITY_SESSION_HEAD_MISMATCH') };
  }
  const verifiedStore = deepFreeze({
    ...store,
    receipts,
    currentHead: deepFreeze(cloneJson(store.currentHead)),
    compaction: deepFreeze(cloneJson(store.compaction)),
  });
  VERIFIED_AUTHORITY_STORES.add(verifiedStore);
  return {
    ok: true,
    store: verifiedStore,
    headRef,
  };
}

export function appendCommandReceiptAuthorityHead({ store, projectId, eventLog, receipt }) {
  let verifiedStore = store;
  if (!VERIFIED_AUTHORITY_STORES.has(verifiedStore)) {
    const verified = validateCommandReceiptAuthorityStore(store, { projectId });
    if (!verified.ok) throw verified.error;
    verifiedStore = verified.store;
  }
  if (normalizeString(verifiedStore.projectId) !== normalizeString(projectId)) {
    throw typedError('E_STAGE10_RECEIPT_AUTHORITY_STORE_PROJECT_INVALID', 'stage10.commandReceiptAuthorityHead', 'COMMAND_KERNEL_RECEIPT_AUTHORITY_STORE_PROJECT_MISMATCH');
  }
  const receiptIdentity = preflightCommandReceiptIdentity({
    store: verifiedStore,
    projectId,
    operationId: receipt?.operationId,
    receiptId: receipt?.receiptId,
  });
  if (!receiptIdentity.ok) throw receiptIdentity.error;
  const receipts = [...verifiedStore.receipts, cloneJson(receipt)];
  const receiptError = validateReceipt(receipts.at(-1), receipts.length - 1);
  if (receiptError) throw receiptError;
  const nextHead = createHead({
    projectId: verifiedStore.projectId,
    generation: receipts.length,
    receiptCount: receipts.length,
    receiptRoot: appendReceiptRootDigest(
      verifiedStore.currentHead.receiptRootDigest,
      receipts.at(-1),
      receipts.length - 1,
    ),
    eventLogDigest: hashEventLog(eventLog),
    previousAuthorityHeadDigest: verifiedStore.currentHead.authorityHeadDigest,
  });
  const nextStore = deepFreeze({
    ...cloneJson(verifiedStore),
    receipts,
    currentHead: nextHead,
    compaction: deepFreeze({
      ...cloneJson(verifiedStore.compaction),
      retainedReceiptCount: receipts.length,
    }),
  });
  VERIFIED_AUTHORITY_STORES.add(nextStore);
  return nextStore;
}

export function createCommandKernelReceiptAuthorityPortFromStore(storeInput, options = {}) {
  const verified = validateCommandReceiptAuthorityStore(storeInput, options);
  if (!verified.ok) throw verified.error;
  const store = verified.store;
  return {
    authorityKind: COMMAND_KERNEL_RECEIPT_AUTHORITY_KIND,
    schemaVersion: STAGE10_COMMAND_RECEIPT_AUTHORITY_HEAD_SCHEMA,
    authorityVersion: 2,
    authorityHeadDigest: store.currentHead.authorityHeadDigest,
    receiptRootDigest: store.currentHead.receiptRootDigest,
    getCommandKernelReceipt({ operationId }) {
      const receipt = store.receipts.find((candidate) => candidate.operationId === operationId) || null;
      return receipt ? cloneJson(receipt) : null;
    },
  };
}
