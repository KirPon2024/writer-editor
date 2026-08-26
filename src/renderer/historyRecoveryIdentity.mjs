function normalizeIdentity(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeSequence(value) {
  return Number.isSafeInteger(value) && value >= 0 ? value : -1;
}

export function createSceneHistoryIntentBinding(input = {}) {
  return Object.freeze({
    projectId: normalizeIdentity(input.projectId),
    nodeId: normalizeIdentity(input.nodeId),
    snapshotId: normalizeIdentity(input.snapshotId),
    sequence: normalizeSequence(input.sequence),
  });
}

export function assessSceneHistoryIntentBinding(binding = {}, current = {}) {
  const expected = createSceneHistoryIntentBinding(binding);
  const actual = createSceneHistoryIntentBinding(current);
  if (!expected.projectId || !expected.nodeId || !expected.snapshotId || expected.sequence < 0) {
    return { ok: false, reason: 'HISTORY_INTENT_BINDING_INVALID' };
  }
  if (expected.projectId !== actual.projectId) {
    return { ok: false, reason: 'HISTORY_INTENT_PROJECT_DRIFT' };
  }
  if (expected.nodeId !== actual.nodeId) {
    return { ok: false, reason: 'HISTORY_INTENT_NODE_DRIFT' };
  }
  if (expected.snapshotId !== actual.snapshotId) {
    return { ok: false, reason: 'HISTORY_INTENT_SNAPSHOT_DRIFT' };
  }
  if (expected.sequence !== actual.sequence) {
    return { ok: false, reason: 'HISTORY_INTENT_GENERATION_DRIFT' };
  }
  return { ok: true, reason: '' };
}

export function createSceneHistoryRestoreReceiptBinding(receipt = {}) {
  const binding = {
    receiptId: normalizeIdentity(receipt.receiptId),
    projectId: normalizeIdentity(receipt.projectId),
    nodeId: normalizeIdentity(receipt.nodeId),
  };
  if (!binding.receiptId || !binding.projectId || !binding.nodeId) return null;
  return Object.freeze(binding);
}

export function canPresentSceneHistoryUndo(binding, projection = {}) {
  if (!binding) return false;
  return binding.projectId === normalizeIdentity(projection.projectId)
    && binding.nodeId === normalizeIdentity(projection.nodeId);
}
