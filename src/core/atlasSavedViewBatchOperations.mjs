import { hashCanonicalValue } from './browser-safe-hash.mjs';

export const ATLAS_SAVED_VIEW_BATCH_APPLY_RECEIPT_SCHEMA_VERSION = 'atlas.savedViewBatchApplyReceipt.v1';
export const ATLAS_SAVED_VIEW_BATCH_PREVIEW_SCHEMA_VERSION = 'atlas.savedViewBatchPreview.v1';
export const ATLAS_SAVED_QUERY_SAVE_COMMAND_ID = 'atlas.savedQuery.save';

const APPLY_OP = 'atlas.savedViewBatch.applyViaCommandKernel';

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function normalizeString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function sortJsonValue(value) {
  if (Array.isArray(value)) return value.map(sortJsonValue);
  if (!isPlainObject(value)) return value;
  const out = {};
  for (const key of Object.keys(value).sort()) {
    const child = value[key];
    if (child !== undefined) out[key] = sortJsonValue(child);
  }
  return out;
}

function typedFailure(code, reason, state, details = {}) {
  const error = { code, op: APPLY_OP, reason };
  if (isPlainObject(details) && Object.keys(details).length > 0) error.details = cloneJson(details);
  return {
    ok: false,
    error,
    state: isPlainObject(state) ? state : null,
    stateHash: hashCanonicalValue(isPlainObject(state) ? state : {}),
    rollbackProof: {
      originalStateReturned: true,
      storageMutation: false,
      networkMutation: false,
      rendererMutation: false,
    },
  };
}

function verifyPreviewHash(preview) {
  const { previewHash, ...base } = preview;
  const actual = hashCanonicalValue(sortJsonValue(base));
  return {
    ok: actual === normalizeString(previewHash),
    actual,
    expected: normalizeString(previewHash),
  };
}

function normalizeRows(preview) {
  return Array.isArray(preview.rows) ? preview.rows.filter(isPlainObject) : [];
}

function validateRows(rows) {
  const seen = new Set();
  for (const row of rows) {
    const savedViewId = normalizeString(row.savedViewId);
    if (!savedViewId || seen.has(savedViewId)) return { ok: false, reason: 'ROW_ID_INVALID', savedViewId };
    seen.add(savedViewId);
    if (normalizeString(row.commandId) !== ATLAS_SAVED_QUERY_SAVE_COMMAND_ID) return { ok: false, reason: 'COMMAND_ID_INVALID', savedViewId };
    const payload = isPlainObject(row.payload) ? row.payload : {};
    if (normalizeString(payload.savedQueryId) !== savedViewId) return { ok: false, reason: 'PAYLOAD_ID_MISMATCH', savedViewId };
    if (!normalizeString(payload.projectId) || !normalizeString(payload.name) || !normalizeString(payload.sourceHash)) {
      return { ok: false, reason: 'PAYLOAD_REQUIRED_FIELD_MISSING', savedViewId };
    }
  }
  return { ok: true };
}

function extractNextState(commandResult, fallbackState) {
  if (isPlainObject(commandResult?.state)) return commandResult.state;
  if (isPlainObject(commandResult?.value?.state)) return commandResult.value.state;
  return fallbackState;
}

export async function applyAtlasSavedViewBatchViaCommandKernel(input = {}) {
  const originalState = isPlainObject(input.state) ? input.state : {};
  const preview = isPlainObject(input.preview) ? sortJsonValue(cloneJson(input.preview)) : null;
  const expectedPreviewHash = normalizeString(input.previewHash);
  const commandRunner = input.commandRunner;
  if (!preview) {
    return typedFailure('E_ATLAS_SAVED_VIEW_BATCH_PREVIEW_REQUIRED', 'PREVIEW_REQUIRED', originalState);
  }
  if (preview.schemaVersion !== ATLAS_SAVED_VIEW_BATCH_PREVIEW_SCHEMA_VERSION) {
    return typedFailure('E_ATLAS_SAVED_VIEW_BATCH_PREVIEW_SCHEMA_INVALID', 'PREVIEW_SCHEMA_INVALID', originalState, {
      schemaVersion: normalizeString(preview.schemaVersion),
    });
  }
  const hashCheck = verifyPreviewHash(preview);
  if (!hashCheck.ok || (expectedPreviewHash && expectedPreviewHash !== hashCheck.expected)) {
    return typedFailure('E_ATLAS_SAVED_VIEW_BATCH_PREVIEW_HASH_MISMATCH', 'PREVIEW_HASH_MISMATCH', originalState, {
      expectedPreviewHash: expectedPreviewHash || hashCheck.expected,
      actualPreviewHash: hashCheck.actual,
    });
  }
  if (input.authorConfirmed !== true) {
    return typedFailure('E_ATLAS_SAVED_VIEW_BATCH_AUTHOR_CONFIRMATION_REQUIRED', 'AUTHOR_CONFIRMATION_REQUIRED', originalState, {
      previewHash: hashCheck.expected,
    });
  }
  if (typeof commandRunner !== 'function') {
    return typedFailure('E_ATLAS_SAVED_VIEW_BATCH_COMMAND_RUNNER_REQUIRED', 'COMMAND_RUNNER_REQUIRED', originalState);
  }
  if (preview.authority?.commandAuthority !== 'CommandKernel' || preview.authority?.automaticApply !== false) {
    return typedFailure('E_ATLAS_SAVED_VIEW_BATCH_COMMAND_AUTHORITY_INVALID', 'COMMAND_AUTHORITY_INVALID', originalState, {
      previewHash: hashCheck.expected,
    });
  }
  if (preview.canApply !== true || Number(preview.blockingCollisionCount || 0) > 0) {
    return typedFailure('E_ATLAS_SAVED_VIEW_BATCH_COLLISION_BLOCKED', 'COLLISION_BLOCKED', originalState, {
      previewHash: hashCheck.expected,
      blockingCollisionCount: Number(preview.blockingCollisionCount || 0),
    });
  }
  const rows = normalizeRows(preview);
  const rowValidation = validateRows(rows);
  if (!rowValidation.ok) {
    return typedFailure('E_ATLAS_SAVED_VIEW_BATCH_ROW_INVALID', rowValidation.reason, originalState, {
      previewHash: hashCheck.expected,
      savedViewId: normalizeString(rowValidation.savedViewId),
    });
  }

  const originalStateHash = hashCanonicalValue(originalState);
  let workingState = cloneJson(originalState);
  const appliedRows = [];
  for (const row of rows) {
    const result = await commandRunner(row.commandId, {
      state: workingState,
      payload: cloneJson(row.payload),
      previewHash: hashCheck.expected,
      batchId: preview.batchId,
    });
    if (!result || result.ok !== true) {
      const reason = normalizeString(result?.error?.reason) || 'COMMAND_FAILED';
      return typedFailure('E_ATLAS_SAVED_VIEW_BATCH_COMMAND_FAILED', reason, originalState, {
        previewHash: hashCheck.expected,
        savedViewId: normalizeString(row.savedViewId),
        commandId: normalizeString(row.commandId),
        commandErrorCode: normalizeString(result?.error?.code),
      });
    }
    workingState = extractNextState(result, workingState);
    appliedRows.push({
      savedViewId: normalizeString(row.savedViewId),
      commandId: normalizeString(row.commandId),
      sourceHash: normalizeString(row.payload?.sourceHash),
    });
  }
  const finalStateHash = hashCanonicalValue(workingState);
  const receiptBase = sortJsonValue({
    schemaVersion: ATLAS_SAVED_VIEW_BATCH_APPLY_RECEIPT_SCHEMA_VERSION,
    batchId: normalizeString(preview.batchId),
    projectId: normalizeString(preview.projectId),
    previewHash: hashCheck.expected,
    applied: true,
    appliedRowCount: appliedRows.length,
    appliedRows,
    commandAuthority: 'CommandKernel',
    commandIds: [...new Set(appliedRows.map((row) => row.commandId))].sort(),
    capabilityRevalidatedByCommandKernel: true,
    rollbackProof: {
      originalStateHash,
      finalStateHash,
      rollbackAvailableFromOriginalState: true,
      storageMutation: false,
      networkMutation: false,
      rendererMutation: false,
    },
    reopenProof: {
      reopenedStateHash: hashCanonicalValue(cloneJson(workingState)),
      savedViewIds: appliedRows.map((row) => row.savedViewId).sort(),
      authorTruthLocation: 'project.atlas.savedQueries',
    },
    projectTruthMutation: appliedRows.length > 0,
    manuscriptMutation: false,
    storageMutation: false,
    networkMutation: false,
    rendererMutation: false,
  });
  return {
    ok: true,
    state: workingState,
    receipt: sortJsonValue({
      ...receiptBase,
      receiptHash: hashCanonicalValue(receiptBase),
    }),
  };
}
