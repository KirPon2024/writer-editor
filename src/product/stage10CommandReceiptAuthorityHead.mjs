import {
  COMMAND_KERNEL_RECEIPT_AUTHORITY_KIND,
  COMMAND_KERNEL_RECEIPT_SCHEMA_VERSION,
  createEmptyEventLog,
  hashEventLog,
} from '../collab/index.mjs';
import { hashCanonicalValue } from '../core/browser-safe-hash.mjs';

export const STAGE10_COMMAND_RECEIPT_AUTHORITY_HEAD_SCHEMA = 'yalken.stage10.commandReceiptAuthorityHead.v1';
export const STAGE10_COMMAND_RECEIPT_AUTHORITY_STORE_SCHEMA = 'yalken.stage10.commandReceiptAuthorityStore.v1';
export const STAGE10_COMMAND_RECEIPT_AUTHORITY_REF_SCHEMA = 'yalken.stage10.commandReceiptAuthorityRef.v1';

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

export function receiptRootDigest(receipts = []) {
  return hashCanonicalValue({
    authorityKind: COMMAND_KERNEL_RECEIPT_AUTHORITY_KIND,
    schemaVersion: COMMAND_KERNEL_RECEIPT_SCHEMA_VERSION,
    receipts: Array.isArray(receipts) ? receipts.map((receipt) => cloneJson(receipt)) : [],
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

function createHead({ projectId, generation, receipts, eventLogDigest, previousAuthorityHeadDigest = '' }) {
  const headCore = {
    schemaVersion: STAGE10_COMMAND_RECEIPT_AUTHORITY_HEAD_SCHEMA,
    authorityKind: COMMAND_KERNEL_RECEIPT_AUTHORITY_KIND,
    authorityVersion: 1,
    projectId: normalizeString(projectId),
    authorityGeneration: generation,
    receiptCount: receipts.length,
    receiptRootDigest: receiptRootDigest(receipts),
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
    authorityVersion: 1,
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
    receipts,
    eventLogDigest,
    previousAuthorityHeadDigest: '',
  });
  return deepFreeze({
    schemaVersion: STAGE10_COMMAND_RECEIPT_AUTHORITY_STORE_SCHEMA,
    projectId: normalizeString(projectId),
    authorityKind: COMMAND_KERNEL_RECEIPT_AUTHORITY_KIND,
    authorityVersion: 1,
    currentHead: head,
    headHistory: [createCommandReceiptAuthorityHeadRef(head)],
    receipts,
  });
}

function validateReceipt(receipt, index) {
  if (!isPlainObject(receipt)) {
    return typedError('E_STAGE10_RECEIPT_SCHEMA_INVALID', 'stage10.commandReceiptAuthorityHead', 'COMMAND_KERNEL_RECEIPT_SCHEMA_INVALID', { index });
  }
  if (receipt.schemaVersion !== COMMAND_KERNEL_RECEIPT_SCHEMA_VERSION) {
    return typedError('E_STAGE10_RECEIPT_VERSION_INVALID', 'stage10.commandReceiptAuthorityHead', 'COMMAND_KERNEL_RECEIPT_VERSION_INVALID', { index });
  }
  if (!normalizeString(receipt.operationId) || !normalizeString(receipt.commandId)) {
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

function validateHead(head, { projectId, receipts, eventLogDigest, previousHeadDigest, generation }) {
  if (!isPlainObject(head)) {
    return typedError('E_STAGE10_RECEIPT_AUTHORITY_HEAD_MISSING', 'stage10.commandReceiptAuthorityHead', 'COMMAND_KERNEL_RECEIPT_AUTHORITY_HEAD_MISSING');
  }
  if (
    head.schemaVersion !== STAGE10_COMMAND_RECEIPT_AUTHORITY_HEAD_SCHEMA
    || head.authorityKind !== COMMAND_KERNEL_RECEIPT_AUTHORITY_KIND
    || head.authorityVersion !== 1
  ) {
    return typedError('E_STAGE10_RECEIPT_AUTHORITY_HEAD_VERSION_INVALID', 'stage10.commandReceiptAuthorityHead', 'COMMAND_KERNEL_RECEIPT_AUTHORITY_HEAD_VERSION_INVALID');
  }
  if (normalizeString(head.projectId) !== normalizeString(projectId)) {
    return typedError('E_STAGE10_RECEIPT_AUTHORITY_HEAD_PROJECT_INVALID', 'stage10.commandReceiptAuthorityHead', 'COMMAND_KERNEL_RECEIPT_AUTHORITY_HEAD_PROJECT_MISMATCH');
  }
  if (head.authorityGeneration !== generation || head.receiptCount !== receipts.length) {
    return typedError('E_STAGE10_RECEIPT_AUTHORITY_HEAD_STALE', 'stage10.commandReceiptAuthorityHead', 'COMMAND_KERNEL_RECEIPT_AUTHORITY_HEAD_STALE_OR_ROLLED_BACK');
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
    || store.authorityVersion !== 1
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
  if (requireReceipts && receipts.length === 0) {
    return { ok: false, error: typedError('E_STAGE10_RECEIPT_AUTHORITY_RECEIPT_MISSING', 'stage10.commandReceiptAuthorityHead', 'COMMAND_KERNEL_RECEIPT_AUTHORITY_RECEIPT_MISSING') };
  }
  const eventLogDigest = isPlainObject(eventLog)
    ? hashEventLog(eventLog)
    : normalizeString(store.currentHead?.eventLogDigest);
  const history = Array.isArray(store.headHistory) ? store.headHistory : [];
  if (history.length !== receipts.length + 1) {
    return { ok: false, error: typedError('E_STAGE10_RECEIPT_AUTHORITY_HISTORY_STALE', 'stage10.commandReceiptAuthorityHead', 'COMMAND_KERNEL_RECEIPT_AUTHORITY_HISTORY_STALE_OR_ROLLED_BACK') };
  }
  for (let index = 0; index < history.length; index += 1) {
    if (!isPlainObject(history[index]) || history[index].schemaVersion !== STAGE10_COMMAND_RECEIPT_AUTHORITY_REF_SCHEMA) {
      return { ok: false, error: typedError('E_STAGE10_RECEIPT_AUTHORITY_HISTORY_INVALID', 'stage10.commandReceiptAuthorityHead', 'COMMAND_KERNEL_RECEIPT_AUTHORITY_HISTORY_INVALID', { index }) };
    }
    if (history[index].authorityGeneration !== index) {
      return { ok: false, error: typedError('E_STAGE10_RECEIPT_AUTHORITY_GENERATION_INVALID', 'stage10.commandReceiptAuthorityHead', 'COMMAND_KERNEL_RECEIPT_AUTHORITY_GENERATION_INVALID', { index }) };
    }
    if (index > 0 && normalizeString(history[index].previousAuthorityHeadDigest) !== normalizeString(history[index - 1].authorityHeadDigest)) {
      return { ok: false, error: typedError('E_STAGE10_RECEIPT_AUTHORITY_HISTORY_FORKED', 'stage10.commandReceiptAuthorityHead', 'COMMAND_KERNEL_RECEIPT_AUTHORITY_HISTORY_FORKED', { index }) };
    }
  }
  const previousHeadDigest = receipts.length === 0 ? '' : history[history.length - 2]?.authorityHeadDigest;
  const headError = validateHead(store.currentHead, {
    projectId: expectedProjectId,
    receipts,
    eventLogDigest,
    previousHeadDigest,
    generation: receipts.length,
  });
  if (headError) return { ok: false, error: headError };
  const headRef = createCommandReceiptAuthorityHeadRef(store.currentHead);
  const historyHead = history.at(-1);
  if (hashCanonicalValue(historyHead) !== hashCanonicalValue(headRef)) {
    return { ok: false, error: typedError('E_STAGE10_RECEIPT_AUTHORITY_HEAD_HISTORY_MISMATCH', 'stage10.commandReceiptAuthorityHead', 'COMMAND_KERNEL_RECEIPT_AUTHORITY_HEAD_HISTORY_MISMATCH') };
  }
  if (requireSessionRef && !isPlainObject(sessionRef) && receipts.length > 0) {
    return { ok: false, error: typedError('E_STAGE10_RECEIPT_AUTHORITY_SESSION_HEAD_MISSING', 'stage10.commandReceiptAuthorityHead', 'COMMAND_KERNEL_RECEIPT_AUTHORITY_SESSION_HEAD_MISMATCH') };
  }
  if (isPlainObject(sessionRef) && hashCanonicalValue(sessionRef) !== hashCanonicalValue(headRef)) {
    return { ok: false, error: typedError('E_STAGE10_RECEIPT_AUTHORITY_SESSION_HEAD_MISMATCH', 'stage10.commandReceiptAuthorityHead', 'COMMAND_KERNEL_RECEIPT_AUTHORITY_SESSION_HEAD_MISMATCH') };
  }
  return {
    ok: true,
    store: deepFreeze({
      ...store,
      receipts,
      currentHead: deepFreeze(cloneJson(store.currentHead)),
      headHistory: history.map((ref) => deepFreeze(cloneJson(ref))),
    }),
    headRef,
  };
}

export function appendCommandReceiptAuthorityHead({ store, projectId, eventLog, receipt }) {
  const verified = validateCommandReceiptAuthorityStore(store, { projectId });
  if (!verified.ok) throw verified.error;
  const receipts = [...verified.store.receipts, cloneJson(receipt)];
  const receiptError = validateReceipt(receipts.at(-1), receipts.length - 1);
  if (receiptError) throw receiptError;
  const nextHead = createHead({
    projectId: verified.store.projectId,
    generation: receipts.length,
    receipts,
    eventLogDigest: hashEventLog(eventLog),
    previousAuthorityHeadDigest: verified.store.currentHead.authorityHeadDigest,
  });
  return deepFreeze({
    ...cloneJson(verified.store),
    receipts,
    currentHead: nextHead,
    headHistory: [...verified.store.headHistory.map((ref) => cloneJson(ref)), createCommandReceiptAuthorityHeadRef(nextHead)],
  });
}

export function createCommandKernelReceiptAuthorityPortFromStore(storeInput, options = {}) {
  const verified = validateCommandReceiptAuthorityStore(storeInput, options);
  if (!verified.ok) throw verified.error;
  const store = verified.store;
  return {
    authorityKind: COMMAND_KERNEL_RECEIPT_AUTHORITY_KIND,
    schemaVersion: STAGE10_COMMAND_RECEIPT_AUTHORITY_HEAD_SCHEMA,
    authorityVersion: 1,
    authorityHeadDigest: store.currentHead.authorityHeadDigest,
    receiptRootDigest: store.currentHead.receiptRootDigest,
    getCommandKernelReceipt({ operationId }) {
      const receipt = store.receipts.find((candidate) => candidate.operationId === operationId) || null;
      return receipt ? cloneJson(receipt) : null;
    },
  };
}
