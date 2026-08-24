// R2.4 WP-200_DURABLE_SAVE - bind dirty-state acknowledgement to the exact
// durable receipt returned for the captured editor generation and bytes.
'use strict';

const crypto = require('node:crypto');

const { decideAutosaveAck } = require('./autosave-generation-v1.cjs');
const { classifySaveAck } = require('./dirty-admission-v1.cjs');
const { SAVE_PHASES } = require('./save-coordinator-v1.cjs');
const { COMMIT_PHASES } = require('./project-commit-v1.cjs');

class SaveReceiptAckError extends Error {
  constructor(code, detail = '') {
    super(detail ? code + ': ' + detail : code);
    this.code = code;
  }
}

const DURABLE_SAVE_PHASE_CHAIN = Object.freeze([
  SAVE_PHASES.ADMIT,
  SAVE_PHASES.TEMP_WRITE,
  SAVE_PHASES.TEMP_FSYNC,
  SAVE_PHASES.ATOMIC_PUBLISH,
  SAVE_PHASES.PARENT_FSYNC,
  SAVE_PHASES.READBACK,
  SAVE_PHASES.ACK,
]);

const PROJECT_COMMIT_PHASE_CHAIN = Object.freeze([
  COMMIT_PHASES.ADMIT,
  COMMIT_PHASES.PREPARE,
  COMMIT_PHASES.MANIFEST_PERSIST,
  COMMIT_PHASES.SCENE_PUBLISH,
  COMMIT_PHASES.MARKER,
  COMMIT_PHASES.ACK,
]);

const sha256hex = (content) => crypto.createHash('sha256').update(content).digest('hex');

function phaseChainEquals(actual, expected) {
  return Array.isArray(actual)
    && actual.length === expected.length
    && actual.every((phase, index) => phase === expected[index]);
}

function identifyReceiptKind(receipt) {
  if (phaseChainEquals(receipt.phases, DURABLE_SAVE_PHASE_CHAIN)) return 'DURABLE_SAVE_V1';
  if (phaseChainEquals(receipt.phases, PROJECT_COMMIT_PHASE_CHAIN)) return 'PROJECT_COMMIT_V1';
  throw new SaveReceiptAckError('E_SAVE_RECEIPT_PHASE_CHAIN_INVALID');
}

function validateSaveReceipt({ receipt, capturedContent, capturedGeneration }) {
  if (!receipt || typeof receipt !== 'object' || Array.isArray(receipt)) {
    throw new SaveReceiptAckError('E_SAVE_RECEIPT_REQUIRED');
  }
  if (receipt.success !== true) {
    throw new SaveReceiptAckError('E_SAVE_RECEIPT_SUCCESS_REQUIRED');
  }
  if (!Number.isInteger(capturedGeneration) || capturedGeneration < 0) {
    throw new SaveReceiptAckError('E_SAVE_RECEIPT_GENERATION_INVALID', String(capturedGeneration));
  }
  if (receipt.revision !== capturedGeneration) {
    throw new SaveReceiptAckError(
      'E_SAVE_RECEIPT_REVISION_MISMATCH',
      'receipt=' + String(receipt.revision) + ' captured=' + capturedGeneration,
    );
  }
  if (typeof capturedContent !== 'string' && !Buffer.isBuffer(capturedContent)) {
    throw new SaveReceiptAckError('E_SAVE_RECEIPT_CONTENT_SHAPE');
  }

  const receiptKind = identifyReceiptKind(receipt);
  const expectedDigest = sha256hex(capturedContent);
  const receiptDigest = receiptKind === 'DURABLE_SAVE_V1' ? receipt.digest : receipt.sceneDigest;
  if (receiptDigest !== expectedDigest) {
    throw new SaveReceiptAckError('E_SAVE_RECEIPT_DIGEST_MISMATCH');
  }

  const expectedBytes = Buffer.isBuffer(capturedContent)
    ? capturedContent.length
    : Buffer.byteLength(capturedContent, 'utf8');
  if (receiptKind === 'DURABLE_SAVE_V1' && receipt.bytes !== expectedBytes) {
    throw new SaveReceiptAckError(
      'E_SAVE_RECEIPT_BYTES_MISMATCH',
      'receipt=' + String(receipt.bytes) + ' captured=' + expectedBytes,
    );
  }

  return Object.freeze({
    receiptKind,
    revision: capturedGeneration,
    digest: expectedDigest,
    bytes: expectedBytes,
  });
}

function bindSaveReceiptToAck({
  receipt,
  capturedContent,
  capturedGeneration,
  latestEditGeneration,
}) {
  const validatedReceipt = validateSaveReceipt({ receipt, capturedContent, capturedGeneration });
  const decision = decideAutosaveAck({ capturedGeneration, latestEditGeneration });
  const ack = classifySaveAck({
    writeSucceeded: true,
    ackOutcome: decision.outcome,
    savedGeneration: capturedGeneration,
    latestEditGeneration,
  });
  return Object.freeze({ receipt: validatedReceipt, ack });
}

module.exports = Object.freeze({
  DURABLE_SAVE_PHASE_CHAIN,
  PROJECT_COMMIT_PHASE_CHAIN,
  SaveReceiptAckError,
  bindSaveReceiptToAck,
  validateSaveReceipt,
});
