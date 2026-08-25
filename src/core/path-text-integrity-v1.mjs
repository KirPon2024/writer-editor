import path from 'node:path';

import pathCapability from './io/path-capability-v1.cjs';
import { hashCanonicalValue, sha256Hex } from './browser-safe-hash.mjs';
import {
  buildTextCoordinateIndex,
  convertTextCoordinatePosition,
  TEXT_COORDINATE_DOMAIN,
} from './textCoordinateAlgebra.mjs';
import {
  buildTextTransformTape,
  TEXT_TRANSFORM_AFFINITY,
  TEXT_TRANSFORM_POSITION_STATUS,
} from './textTransformAlgebra.mjs';
import {
  buildDeterministicFoldTape,
  mapFoldedOffsetToOriginal,
} from './text-fold-tape-v1.mjs';

const {
  assertAliasSafe,
  resolveWithinCapabilityRoots,
} = pathCapability;

export const PATH_TEXT_INTEGRITY_SCHEMA_VERSION = 'yalken.wp205.pathTextIntegrity.v1';
export const PATH_TEXT_UNDO_SCHEMA_VERSION = 'yalken.wp205.pathTextUndo.v1';
export const PATH_TEXT_UNDO_APPLY_SCHEMA_VERSION = 'yalken.wp205.pathTextUndoApply.v1';

export const PATH_TEXT_COMMANDS = Object.freeze({
  REPLACE_RANGE: 'REPLACE_RANGE',
  SEARCH_REPLACE: 'SEARCH_REPLACE',
  CLIPBOARD_PASTE_TEXT: 'CLIPBOARD_PASTE_TEXT',
});

export const PATH_TEXT_SEARCH_MODES = Object.freeze({
  EXACT: 'EXACT',
  DETERMINISTIC_FOLD: 'DETERMINISTIC_FOLD',
});

const PLAN_FIELDS = Object.freeze([
  'command',
  'documentPath',
  'allowedRoots',
  'sourceText',
  'sourceRevisionId',
  'targetRevisionId',
  'selection',
  'search',
  'replacementText',
  'clipboardPayload',
  'imeState',
  'aliasReadDirFn',
]);

const UNDO_APPLY_FIELDS = Object.freeze([
  'undoEntry',
  'currentText',
]);

const MAX_REVISION_ID_LENGTH = 512;
const MAX_RANGES = 100_000;

function freezeDetails(details) {
  return Object.freeze({ ...(details && typeof details === 'object' ? details : {}) });
}

export class PathTextIntegrityError extends RangeError {
  constructor(code, reason, details = {}) {
    super(reason);
    this.name = 'PathTextIntegrityError';
    this.code = code;
    this.op = 'yalken.wp205.pathTextIntegrity';
    this.reason = reason;
    this.details = freezeDetails(details);
  }
}

function fail(code, reason, details) {
  throw new PathTextIntegrityError(code, reason, details);
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const key of Reflect.ownKeys(value)) {
    deepFreeze(value[key]);
  }
  return Object.freeze(value);
}

function requireExactDataRecord(input, fields, operation) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    fail('E_WP205_INVALID_RECORD', 'INPUT_MUST_BE_PLAIN_DATA_RECORD', { operation });
  }
  const prototype = Object.getPrototypeOf(input);
  if (prototype !== Object.prototype && prototype !== null) {
    fail('E_WP205_INVALID_RECORD', 'INPUT_PROTOTYPE_INVALID', { operation });
  }
  const ownKeys = Reflect.ownKeys(input);
  if (ownKeys.length !== fields.length || ownKeys.some((key) => typeof key !== 'string' || !fields.includes(key))) {
    fail('E_WP205_INVALID_RECORD', 'INPUT_FIELDS_INVALID', { operation });
  }
  const values = {};
  for (const field of fields) {
    const descriptor = Object.getOwnPropertyDescriptor(input, field);
    if (!descriptor || !Object.hasOwn(descriptor, 'value') || descriptor.enumerable !== true) {
      fail('E_WP205_INVALID_RECORD', 'INPUT_FIELD_MUST_BE_ENUMERABLE_DATA_PROPERTY', {
        operation,
        field,
      });
    }
    values[field] = descriptor.value;
  }
  return values;
}

function requireEnum(value, allowed, field) {
  if (!allowed.includes(value)) {
    fail('E_WP205_INVALID_ENUM', 'ENUM_VALUE_INVALID', {
      field,
      value: typeof value === 'string' ? value : '',
    });
  }
  return value;
}

function requireString(value, field) {
  if (typeof value !== 'string') {
    fail('E_WP205_TEXT_SHAPE', 'TEXT_MUST_BE_STRING', {
      field,
      receivedType: value === null ? 'null' : typeof value,
    });
  }
  return value;
}

function requireWellFormedText(value, field) {
  const text = requireString(value, field);
  try {
    buildTextTransformTape({
      sourceText: text,
      targetText: text,
      sourceRevisionId: `wp205-validate-source-${field}`,
      targetRevisionId: `wp205-validate-target-${field}`,
      operations: [],
    });
  } catch (error) {
    if (error && typeof error.code === 'string') {
      fail('E_WP205_UNICODE_INVALID', 'TEXT_MUST_BE_WELL_FORMED_UNICODE', {
        field,
        sourceCode: error.code,
        sourceReason: typeof error.reason === 'string' ? error.reason : '',
      });
    }
    throw error;
  }
  return text;
}

function requireRevisionId(value, field) {
  if (
    typeof value !== 'string'
    || value.length === 0
    || value.length > MAX_REVISION_ID_LENGTH
    || value.trim() !== value
  ) {
    fail('E_WP205_REVISION_ID', 'REVISION_ID_MUST_BE_CANONICAL_NONEMPTY_STRING', {
      field,
      receivedType: value === null ? 'null' : typeof value,
      length: typeof value === 'string' ? value.length : null,
    });
  }
  return value;
}

function requireSafePosition(value, field) {
  if (!Number.isSafeInteger(value) || value < 0) {
    fail('E_WP205_POSITION', 'POSITION_MUST_BE_NON_NEGATIVE_SAFE_INTEGER', {
      field,
      position: Number.isFinite(value) ? value : null,
    });
  }
  return value;
}

function requireAllowedRoots(value) {
  if (!Array.isArray(value) || value.length === 0) {
    fail('E_WP205_ALLOWED_ROOTS', 'ALLOWED_ROOTS_MUST_BE_NONEMPTY_ARRAY');
  }
  const roots = value.map((root, index) => {
    if (typeof root !== 'string' || root.trim() === '') {
      fail('E_WP205_ALLOWED_ROOTS', 'ALLOWED_ROOT_MUST_BE_NONEMPTY_STRING', { index });
    }
    return root;
  });
  if (new Set(roots).size !== roots.length) {
    fail('E_WP205_ALLOWED_ROOTS', 'ALLOWED_ROOTS_MUST_BE_UNIQUE');
  }
  return roots;
}

function requireImeState(value) {
  const ime = requireExactDataRecord(value, ['active', 'generation'], 'imeState');
  if (typeof ime.active !== 'boolean') {
    fail('E_WP205_IME_STATE', 'IME_ACTIVE_MUST_BE_BOOLEAN');
  }
  const generation = requireSafePosition(ime.generation, 'imeState.generation');
  if (ime.active) {
    fail('E_WP205_IME_COMPOSITION_ACTIVE', 'TEXT_MUTATION_REFUSED_DURING_ACTIVE_IME_COMPOSITION', {
      generation,
    });
  }
  return Object.freeze({
    active: ime.active,
    generation,
  });
}

function requireSelection(value, sourceText) {
  const selection = requireExactDataRecord(value, ['start', 'end'], 'selection');
  const start = requireSafePosition(selection.start, 'selection.start');
  const end = requireSafePosition(selection.end, 'selection.end');
  if (end < start) {
    fail('E_WP205_SELECTION_RANGE', 'SELECTION_END_BEFORE_START', { start, end });
  }
  if (end > sourceText.length) {
    fail('E_WP205_SELECTION_RANGE', 'SELECTION_OUTSIDE_SOURCE_TEXT', {
      start,
      end,
      sourceUtf16Length: sourceText.length,
    });
  }
  const coordinateIndex = buildTextCoordinateIndex(sourceText);
  assertGraphemeBoundary(sourceText, start, 'selection.start', coordinateIndex);
  assertGraphemeBoundary(sourceText, end, 'selection.end', coordinateIndex);
  return Object.freeze({ start, end });
}

function requireSearch(value) {
  const search = requireExactDataRecord(value, ['query', 'matchCase', 'maxReplacements'], 'search');
  const query = requireWellFormedText(search.query, 'search.query');
  if (query.length === 0) {
    fail('E_WP205_SEARCH_QUERY', 'SEARCH_QUERY_MUST_NOT_BE_EMPTY');
  }
  if (typeof search.matchCase !== 'boolean') {
    fail('E_WP205_SEARCH_MODE', 'SEARCH_MATCH_CASE_MUST_BE_BOOLEAN');
  }
  let maxReplacements = null;
  if (search.maxReplacements !== null) {
    maxReplacements = requireSafePosition(search.maxReplacements, 'search.maxReplacements');
    if (maxReplacements === 0) {
      fail('E_WP205_SEARCH_LIMIT', 'MAX_REPLACEMENTS_MUST_BE_POSITIVE_OR_NULL');
    }
  }
  return Object.freeze({
    query,
    matchCase: search.matchCase,
    maxReplacements,
  });
}

function requireClipboardPayload(value) {
  const payload = requireExactDataRecord(value, ['text', 'html'], 'clipboardPayload');
  if (payload.html !== null) {
    fail('E_WP205_CLIPBOARD_HTML_REJECTED', 'CLIPBOARD_HTML_PAYLOAD_HAS_NO_PRODUCT_AUTHORITY');
  }
  const text = requireWellFormedText(payload.text, 'clipboardPayload.text');
  return Object.freeze({
    text,
    plainTextOnly: true,
    htmlAccepted: false,
    systemClipboardMutation: false,
  });
}

function assertGraphemeBoundary(text, utf16Offset, field, coordinateIndex = null) {
  const index = coordinateIndex || buildTextCoordinateIndex(text);
  try {
    convertTextCoordinatePosition({
      index,
      fromDomain: TEXT_COORDINATE_DOMAIN.UTF16_JS_CODE_UNIT,
      toDomain: TEXT_COORDINATE_DOMAIN.GRAPHEME_CLUSTER,
      position: utf16Offset,
    });
  } catch (error) {
    if (error && typeof error.code === 'string') {
      fail('E_WP205_GRAPHEME_BOUNDARY', 'UTF16_OFFSET_MUST_BE_GRAPHEME_BOUNDARY', {
        field,
        utf16Offset,
        sourceCode: error.code,
      });
    }
    throw error;
  }
}

function bindPathCapability(documentPath, allowedRoots, aliasReadDirFn) {
  if (typeof documentPath !== 'string' || documentPath.trim() === '') {
    fail('E_WP205_DOCUMENT_PATH', 'DOCUMENT_PATH_MUST_BE_NONEMPTY_STRING');
  }
  if (!path.isAbsolute(documentPath)) {
    fail('E_WP205_DOCUMENT_PATH', 'DOCUMENT_PATH_MUST_BE_ABSOLUTE');
  }
  if (aliasReadDirFn !== null && typeof aliasReadDirFn !== 'function') {
    fail('E_WP205_ALIAS_PROBE', 'ALIAS_READ_DIR_MUST_BE_FUNCTION_OR_NULL');
  }
  const roots = requireAllowedRoots(allowedRoots);
  const pathVerdict = resolveWithinCapabilityRoots(documentPath, roots, { noFollow: true });
  if (!pathVerdict.ok) {
    fail('E_WP205_PATH_CAPABILITY', 'PATH_NOT_BOUND_TO_ALLOWED_CAPABILITY_ROOT', {
      reason: pathVerdict.reason,
      detail: typeof pathVerdict.detail === 'string' ? pathVerdict.detail : '',
    });
  }
  try {
    assertAliasSafe(documentPath, { readDirFn: aliasReadDirFn });
  } catch (error) {
    if (error && typeof error.code === 'string') {
      fail('E_WP205_PATH_ALIAS', 'PATH_ALIAS_OR_CASE_AMBIGUITY_REFUSED', {
        reason: error.code,
        detail: error.message,
      });
    }
    throw error;
  }
  return Object.freeze({
    canonicalPath: pathVerdict.canonicalPath,
    capabilityRoot: pathVerdict.root,
    noFollow: true,
    aliasSafe: true,
  });
}

function findExactRanges(sourceText, query, maxReplacements) {
  const ranges = [];
  const coordinateIndex = buildTextCoordinateIndex(sourceText);
  let cursor = 0;
  while (ranges.length < (maxReplacements ?? MAX_RANGES)) {
    const index = sourceText.indexOf(query, cursor);
    if (index < 0) break;
    const end = index + query.length;
    assertGraphemeBoundary(sourceText, index, 'search.match.start', coordinateIndex);
    assertGraphemeBoundary(sourceText, end, 'search.match.end', coordinateIndex);
    ranges.push(Object.freeze({ start: index, end }));
    cursor = end;
  }
  return ranges;
}

function mapFoldedBoundary(foldTape, offset, affinity, field) {
  const mapped = mapFoldedOffsetToOriginal(foldTape, offset, affinity);
  if (mapped.status !== TEXT_TRANSFORM_POSITION_STATUS.EXACT) {
    fail('E_WP205_SEARCH_UNMAPPABLE_FOLD_RANGE', 'FOLDED_SEARCH_BOUNDARY_IS_UNMAPPABLE', {
      field,
      foldedOffset: offset,
      reason: mapped.reason,
    });
  }
  return mapped.position;
}

function findFoldedRanges(sourceText, query, sourceRevisionId, maxReplacements) {
  const coordinateIndex = buildTextCoordinateIndex(sourceText);
  const sourceFold = buildDeterministicFoldTape(sourceText, {
    sourceRevisionId: `${sourceRevisionId}:wp205-search-source`,
    targetRevisionId: `${sourceRevisionId}:wp205-search-folded`,
  });
  const queryFold = buildDeterministicFoldTape(query, {
    sourceRevisionId: `${sourceRevisionId}:wp205-query-source`,
    targetRevisionId: `${sourceRevisionId}:wp205-query-folded`,
  });
  const needle = queryFold.foldedText;
  const ranges = [];
  let cursor = 0;
  while (ranges.length < (maxReplacements ?? MAX_RANGES)) {
    const foldedStart = sourceFold.foldedText.indexOf(needle, cursor);
    if (foldedStart < 0) break;
    const foldedEnd = foldedStart + needle.length;
    const start = mapFoldedBoundary(sourceFold, foldedStart, TEXT_TRANSFORM_AFFINITY.BEFORE, 'search.folded.start');
    const end = mapFoldedBoundary(sourceFold, foldedEnd, TEXT_TRANSFORM_AFFINITY.AFTER, 'search.folded.end');
    assertGraphemeBoundary(sourceText, start, 'search.match.start', coordinateIndex);
    assertGraphemeBoundary(sourceText, end, 'search.match.end', coordinateIndex);
    ranges.push(Object.freeze({ start, end }));
    cursor = foldedEnd;
  }
  return {
    ranges,
    foldedQueryHash: sha256Hex(needle),
  };
}

export function projectSearchRanges(input) {
  const values = requireExactDataRecord(
    input,
    ['sourceText', 'sourceRevisionId', 'search'],
    'projectSearchRanges',
  );
  const sourceText = requireWellFormedText(values.sourceText, 'sourceText');
  const sourceRevisionId = requireRevisionId(values.sourceRevisionId, 'sourceRevisionId');
  const search = requireSearch(values.search);
  const result = search.matchCase
    ? {
      ranges: findExactRanges(sourceText, search.query, search.maxReplacements),
      foldedQueryHash: null,
    }
    : findFoldedRanges(sourceText, search.query, sourceRevisionId, search.maxReplacements);
  return deepFreeze({
    schemaVersion: `${PATH_TEXT_INTEGRITY_SCHEMA_VERSION}.searchProjection`,
    searchMode: search.matchCase ? PATH_TEXT_SEARCH_MODES.EXACT : PATH_TEXT_SEARCH_MODES.DETERMINISTIC_FOLD,
    queryHash: sha256Hex(search.query),
    foldedQueryHash: result.foldedQueryHash,
    matchCount: result.ranges.length,
    ranges: result.ranges,
  });
}

function coalesceReplacementOperations(sourceText, ranges, insertedText) {
  const ordered = ranges.map((range, index) => ({ ...range, index })).sort((a, b) => a.start - b.start);
  const operations = [];
  let current = null;
  for (const range of ordered) {
    if (range.start < 0 || range.end < range.start || range.end > sourceText.length) {
      fail('E_WP205_RANGE_SHAPE', 'RANGE_OUTSIDE_SOURCE_TEXT', {
        start: range.start,
        end: range.end,
      });
    }
    if (current && range.start < current.sourceEnd) {
      fail('E_WP205_RANGE_OVERLAP', 'REPLACEMENT_RANGES_MUST_NOT_OVERLAP', {
        previousEnd: current.sourceEnd,
        start: range.start,
      });
    }
    if (sourceText.slice(range.start, range.end) === insertedText) {
      continue;
    }
    if (current && range.start === current.sourceEnd) {
      current.sourceEnd = range.end;
      current.insertedText += insertedText;
      continue;
    }
    if (current) operations.push(current);
    current = {
      sourceStart: range.start,
      sourceEnd: range.end,
      insertedText,
    };
  }
  if (current) operations.push(current);
  return operations.map((operation) => Object.freeze({ ...operation }));
}

function applyOperations(sourceText, operations) {
  const pieces = [];
  let cursor = 0;
  for (const operation of operations) {
    pieces.push(sourceText.slice(cursor, operation.sourceStart), operation.insertedText);
    cursor = operation.sourceEnd;
  }
  pieces.push(sourceText.slice(cursor));
  return pieces.join('');
}

function buildUndoEntry({ command, sourceText, targetText, sourceRevisionId, targetRevisionId, operationId }) {
  const body = {
    schemaVersion: PATH_TEXT_UNDO_SCHEMA_VERSION,
    command,
    operationId,
    memoryOnly: true,
    automaticApply: false,
    sourceRevisionId,
    targetRevisionId,
    restoreText: sourceText,
    restoresSourceHash: sha256Hex(sourceText),
    requiresTargetHash: sha256Hex(targetText),
  };
  return deepFreeze({
    ...body,
    undoEntryDigest: hashCanonicalValue(body),
  });
}

function operationIdFor(body) {
  return `wp205-path-text:${hashCanonicalValue(body)}`;
}

export function planPathTextOperation(input) {
  const values = requireExactDataRecord(input, PLAN_FIELDS, 'planPathTextOperation');
  const command = requireEnum(values.command, Object.values(PATH_TEXT_COMMANDS), 'command');
  const sourceText = requireWellFormedText(values.sourceText, 'sourceText');
  const sourceRevisionId = requireRevisionId(values.sourceRevisionId, 'sourceRevisionId');
  const targetRevisionId = requireRevisionId(values.targetRevisionId, 'targetRevisionId');
  if (sourceRevisionId === targetRevisionId) {
    fail('E_WP205_REVISION_ID', 'SOURCE_AND_TARGET_REVISIONS_MUST_DIFFER', { sourceRevisionId });
  }
  const ime = requireImeState(values.imeState);
  const pathBinding = bindPathCapability(values.documentPath, values.allowedRoots, values.aliasReadDirFn);

  let ranges;
  let insertedText;
  let searchReceipt = null;
  let clipboardReceipt = null;
  if (command === PATH_TEXT_COMMANDS.REPLACE_RANGE) {
    ranges = [requireSelection(values.selection, sourceText)];
    insertedText = requireWellFormedText(values.replacementText, 'replacementText');
  } else if (command === PATH_TEXT_COMMANDS.SEARCH_REPLACE) {
    insertedText = requireWellFormedText(values.replacementText, 'replacementText');
    searchReceipt = projectSearchRanges({
      sourceText,
      sourceRevisionId,
      search: values.search,
    });
    ranges = searchReceipt.ranges;
  } else {
    ranges = [requireSelection(values.selection, sourceText)];
    clipboardReceipt = requireClipboardPayload(values.clipboardPayload);
    insertedText = clipboardReceipt.text;
  }

  const operations = coalesceReplacementOperations(sourceText, ranges, insertedText);
  const targetText = applyOperations(sourceText, operations);
  const transformTape = buildTextTransformTape({
    sourceText,
    targetText,
    sourceRevisionId,
    targetRevisionId,
    operations,
  });
  const operationBody = {
    command,
    canonicalPath: pathBinding.canonicalPath,
    sourceRevisionId,
    targetRevisionId,
    sourceTextHash: sha256Hex(sourceText),
    targetTextHash: sha256Hex(targetText),
    operationCount: operations.length,
    searchMatchCount: searchReceipt ? searchReceipt.matchCount : null,
    imeGeneration: ime.generation,
  };
  const operationId = operationIdFor(operationBody);
  const undoEntry = buildUndoEntry({
    command,
    sourceText,
    targetText,
    sourceRevisionId,
    targetRevisionId,
    operationId,
  });
  const body = {
    schemaVersion: PATH_TEXT_INTEGRITY_SCHEMA_VERSION,
    contourId: 'WP-205_PATH_AND_TEXT',
    command,
    operationId,
    sourceRevisionId,
    targetRevisionId,
    path: pathBinding,
    text: {
      sourceTextHash: sha256Hex(sourceText),
      targetTextHash: sha256Hex(targetText),
      sourceUtf16Length: sourceText.length,
      targetUtf16Length: targetText.length,
      normalization: 'EXACT_NO_NORMALIZATION',
      boundaryPolicy: 'UNICODE_GRAPHEME_BOUNDARIES',
      operationCount: operations.length,
      operations,
      transformTape,
    },
    search: searchReceipt,
    clipboard: clipboardReceipt,
    ime: {
      compositionActive: ime.active,
      generation: ime.generation,
    },
    undo: undoEntry,
    authority: {
      rendererBypass: false,
      liveFileWrite: false,
      systemClipboardMutation: false,
      automaticUndoApply: false,
      userDocumentMutation: false,
    },
    targetText,
  };
  return deepFreeze({
    ...body,
    receiptDigest: hashCanonicalValue(body),
  });
}

function requireUndoEntry(value) {
  const undo = requireExactDataRecord(
    value,
    [
      'schemaVersion',
      'command',
      'operationId',
      'memoryOnly',
      'automaticApply',
      'sourceRevisionId',
      'targetRevisionId',
      'restoreText',
      'restoresSourceHash',
      'requiresTargetHash',
      'undoEntryDigest',
    ],
    'undoEntry',
  );
  if (undo.schemaVersion !== PATH_TEXT_UNDO_SCHEMA_VERSION) {
    fail('E_WP205_UNDO_ENTRY', 'UNDO_ENTRY_SCHEMA_INVALID');
  }
  if (undo.memoryOnly !== true || undo.automaticApply !== false) {
    fail('E_WP205_UNDO_ENTRY', 'UNDO_ENTRY_AUTHORITY_INVALID');
  }
  const command = requireEnum(undo.command, Object.values(PATH_TEXT_COMMANDS), 'undoEntry.command');
  const sourceRevisionId = requireRevisionId(undo.sourceRevisionId, 'undoEntry.sourceRevisionId');
  const targetRevisionId = requireRevisionId(undo.targetRevisionId, 'undoEntry.targetRevisionId');
  const restoreText = requireWellFormedText(undo.restoreText, 'undoEntry.restoreText');
  const expectedBody = {
    schemaVersion: undo.schemaVersion,
    command,
    operationId: requireString(undo.operationId, 'undoEntry.operationId'),
    memoryOnly: undo.memoryOnly,
    automaticApply: undo.automaticApply,
    sourceRevisionId,
    targetRevisionId,
    restoreText,
    restoresSourceHash: requireString(undo.restoresSourceHash, 'undoEntry.restoresSourceHash'),
    requiresTargetHash: requireString(undo.requiresTargetHash, 'undoEntry.requiresTargetHash'),
  };
  if (sha256Hex(restoreText) !== expectedBody.restoresSourceHash) {
    fail('E_WP205_UNDO_ENTRY_DIGEST', 'UNDO_RESTORE_TEXT_HASH_MISMATCH');
  }
  if (hashCanonicalValue(expectedBody) !== undo.undoEntryDigest) {
    fail('E_WP205_UNDO_ENTRY_DIGEST', 'UNDO_ENTRY_DIGEST_MISMATCH');
  }
  return deepFreeze(expectedBody);
}

export function applyUndoEntry(input) {
  const values = requireExactDataRecord(input, UNDO_APPLY_FIELDS, 'applyUndoEntry');
  const undoEntry = requireUndoEntry(values.undoEntry);
  const currentText = requireWellFormedText(values.currentText, 'currentText');
  const currentHash = sha256Hex(currentText);
  if (currentHash !== undoEntry.requiresTargetHash) {
    fail('E_WP205_UNDO_TARGET_DRIFT', 'UNDO_TARGET_HASH_MISMATCH', {
      expectedTargetHash: undoEntry.requiresTargetHash,
      actualTargetHash: currentHash,
    });
  }
  const restoredText = undoEntry.restoreText;
  const body = {
    schemaVersion: PATH_TEXT_UNDO_APPLY_SCHEMA_VERSION,
    operationId: undoEntry.operationId,
    sourceRevisionId: undoEntry.targetRevisionId,
    targetRevisionId: undoEntry.sourceRevisionId,
    consumedTargetHash: currentHash,
    restoredTextHash: sha256Hex(restoredText),
    automaticApply: false,
    restoredText,
  };
  return deepFreeze({
    ...body,
    receiptDigest: hashCanonicalValue(body),
  });
}
