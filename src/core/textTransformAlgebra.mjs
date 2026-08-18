import { hashCanonicalValue, sha256Hex } from './browser-safe-hash.mjs';
import { TEXT_COORDINATE_DOMAIN } from './textCoordinateAlgebra.mjs';

export const TEXT_TRANSFORM_TAPE_SCHEMA_VERSION = 'core.textTransformTape.v1';
export const TEXT_TRANSFORM_ROUTE_SCHEMA_VERSION = 'core.textTransformRoute.v1';
export const TEXT_TRANSFORM_POSITION_RESULT_SCHEMA_VERSION = 'core.textTransformPositionMapResult.v1';
export const TEXT_TRANSFORM_RANGE_RESULT_SCHEMA_VERSION = 'core.textTransformRangeMapResult.v1';
export const TEXT_TRANSFORM_ALGORITHM_ID = 'core.textTransformAlgebra';
export const TEXT_TRANSFORM_ALGORITHM_VERSION = 1;

export const TEXT_TRANSFORM_DIRECTION = Object.freeze({
  FORWARD: 'FORWARD',
  INVERSE: 'INVERSE',
});

export const TEXT_TRANSFORM_AFFINITY = Object.freeze({
  BEFORE: 'BEFORE',
  AFTER: 'AFTER',
});

export const TEXT_TRANSFORM_POSITION_STATUS = Object.freeze({
  EXACT: 'EXACT',
  UNMAPPABLE: 'UNMAPPABLE',
});

export const TEXT_TRANSFORM_RANGE_STATUS = Object.freeze({
  EXACT: 'EXACT',
  UNMAPPABLE: 'UNMAPPABLE',
});

export const TEXT_TRANSFORM_CONTENT_IMPACT = Object.freeze({
  UNCHANGED: 'UNCHANGED',
  INPUT_CONTENT_REMOVED: 'INPUT_CONTENT_REMOVED',
  OUTPUT_CONTENT_INSERTED: 'OUTPUT_CONTENT_INSERTED',
  INPUT_REMOVED_AND_OUTPUT_INSERTED: 'INPUT_REMOVED_AND_OUTPUT_INSERTED',
  UNKNOWN_UNMAPPABLE_BOUNDARY: 'UNKNOWN_UNMAPPABLE_BOUNDARY',
});

const TEXT_TRANSFORM_OP = 'core.textTransformAlgebra';
const TEXT_TRANSFORM_COORDINATE_DOMAIN = TEXT_COORDINATE_DOMAIN.UTF16_JS_CODE_UNIT;
const TEXT_TRANSFORM_BOUNDARY_POLICY = 'UNICODE_CODE_POINT_BOUNDARIES';
const TEXT_TRANSFORM_NORMALIZATION = 'EXACT_NO_NORMALIZATION';
const MAX_UTF16_LENGTH = 0xfffffffe;
const MAX_TRANSFORM_OPERATIONS = 1_000_000;
const MAX_TRANSFORM_ROUTE_TAPES = 100_000;
const MAX_REVISION_ID_LENGTH = 512;
const EMPTY_TEXT_HASH = sha256Hex('');
const TAPE_DATA = new WeakMap();
const ROUTE_DATA = new WeakMap();

function freezeDetails(details) {
  return Object.freeze({ ...(details && typeof details === 'object' ? details : {}) });
}

export class TextTransformError extends RangeError {
  constructor(code, reason, details = {}) {
    super(reason);
    this.name = 'TextTransformError';
    this.code = code;
    this.op = TEXT_TRANSFORM_OP;
    this.reason = reason;
    this.details = freezeDetails(details);
  }
}

function fail(code, reason, details) {
  throw new TextTransformError(code, reason, details);
}

function requireExactDataRecord(input, fields, operation) {
  let prototype;
  let ownKeys;
  try {
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
      fail('E_TEXT_TRANSFORM_INVALID', 'INPUT_MUST_BE_PLAIN_DATA_RECORD', { operation });
    }
    prototype = Object.getPrototypeOf(input);
    ownKeys = Reflect.ownKeys(input);
  } catch (error) {
    if (error instanceof TextTransformError) throw error;
    fail('E_TEXT_TRANSFORM_INVALID', 'INPUT_RECORD_INSPECTION_FAILED', {
      operation,
      causeName: typeof error?.name === 'string' ? error.name : '',
    });
  }
  if (prototype !== Object.prototype && prototype !== null) {
    fail('E_TEXT_TRANSFORM_INVALID', 'INPUT_PROTOTYPE_INVALID', { operation });
  }
  if (ownKeys.length !== fields.length || ownKeys.some((key) => typeof key !== 'string' || !fields.includes(key))) {
    fail('E_TEXT_TRANSFORM_INVALID', 'INPUT_FIELDS_INVALID', { operation });
  }
  const values = {};
  for (const field of fields) {
    let descriptor;
    try {
      descriptor = Object.getOwnPropertyDescriptor(input, field);
    } catch (error) {
      fail('E_TEXT_TRANSFORM_INVALID', 'INPUT_FIELD_INSPECTION_FAILED', {
        operation,
        field,
        causeName: typeof error?.name === 'string' ? error.name : '',
      });
    }
    if (!descriptor || !Object.hasOwn(descriptor, 'value') || descriptor.enumerable !== true) {
      fail('E_TEXT_TRANSFORM_INVALID', 'INPUT_FIELD_MUST_BE_ENUMERABLE_DATA_PROPERTY', {
        operation,
        field,
      });
    }
    values[field] = descriptor.value;
  }
  return values;
}

function requireDenseDataArray(value, field, maximumLength) {
  let prototype;
  let ownKeys;
  try {
    if (!Array.isArray(value)) {
      fail('E_TEXT_TRANSFORM_INVALID', 'FIELD_MUST_BE_ARRAY', { field });
    }
    prototype = Object.getPrototypeOf(value);
    ownKeys = Reflect.ownKeys(value);
  } catch (error) {
    if (error instanceof TextTransformError) throw error;
    fail('E_TEXT_TRANSFORM_INVALID', 'ARRAY_INSPECTION_FAILED', {
      field,
      causeName: typeof error?.name === 'string' ? error.name : '',
    });
  }
  if (prototype !== Array.prototype) {
    fail('E_TEXT_TRANSFORM_INVALID', 'ARRAY_PROTOTYPE_INVALID', { field });
  }
  let lengthDescriptor;
  try {
    lengthDescriptor = Object.getOwnPropertyDescriptor(value, 'length');
  } catch (error) {
    fail('E_TEXT_TRANSFORM_INVALID', 'ARRAY_LENGTH_INSPECTION_FAILED', {
      field,
      causeName: typeof error?.name === 'string' ? error.name : '',
    });
  }
  const length = lengthDescriptor?.value;
  if (!Number.isSafeInteger(length) || length < 0 || length > maximumLength) {
    fail('E_TEXT_TRANSFORM_OUT_OF_RANGE', 'ARRAY_LENGTH_OUT_OF_RANGE', {
      field,
      length: Number.isFinite(length) ? length : null,
      maximumLength,
    });
  }
  const expectedKeys = new Set(['length']);
  const rows = new Array(length);
  for (let index = 0; index < length; index += 1) {
    const key = String(index);
    expectedKeys.add(key);
    let descriptor;
    try {
      descriptor = Object.getOwnPropertyDescriptor(value, key);
    } catch (error) {
      fail('E_TEXT_TRANSFORM_INVALID', 'ARRAY_ITEM_INSPECTION_FAILED', {
        field,
        index,
        causeName: typeof error?.name === 'string' ? error.name : '',
      });
    }
    if (!descriptor || !Object.hasOwn(descriptor, 'value') || descriptor.enumerable !== true) {
      fail('E_TEXT_TRANSFORM_INVALID', 'ARRAY_ITEM_MUST_BE_ENUMERABLE_DATA_PROPERTY', {
        field,
        index,
      });
    }
    rows[index] = descriptor.value;
  }
  if (ownKeys.length !== expectedKeys.size || ownKeys.some((key) => typeof key !== 'string' || !expectedKeys.has(key))) {
    fail('E_TEXT_TRANSFORM_INVALID', 'ARRAY_FIELDS_INVALID', { field });
  }
  return rows;
}

function firstUnpairedSurrogateOffset(text) {
  for (let index = 0; index < text.length; index += 1) {
    const codeUnit = text.charCodeAt(index);
    if (codeUnit >= 0xd800 && codeUnit <= 0xdbff) {
      const next = text.charCodeAt(index + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) return index;
      index += 1;
    } else if (codeUnit >= 0xdc00 && codeUnit <= 0xdfff) {
      return index;
    }
  }
  return -1;
}

function requireText(value, field) {
  if (typeof value !== 'string') {
    fail('E_TEXT_TRANSFORM_INVALID', 'TEXT_MUST_BE_STRING', {
      field,
      receivedType: value === null ? 'null' : typeof value,
    });
  }
  if (value.length > MAX_UTF16_LENGTH) {
    fail('E_TEXT_TRANSFORM_OUT_OF_RANGE', 'TEXT_EXCEEDS_UINT32_UTF16_RANGE', {
      field,
      utf16Length: value.length,
      maximumUtf16Length: MAX_UTF16_LENGTH,
    });
  }
  const invalidOffset = firstUnpairedSurrogateOffset(value);
  if (invalidOffset >= 0) {
    fail('E_TEXT_TRANSFORM_UNICODE_INVALID', 'TEXT_MUST_BE_WELL_FORMED_UNICODE', {
      field,
      utf16Offset: invalidOffset,
    });
  }
  return value;
}

function requireRevisionId(value, field) {
  if (
    typeof value !== 'string'
    || value.length === 0
    || value.length > MAX_REVISION_ID_LENGTH
    || value.trim() !== value
  ) {
    fail('E_TEXT_TRANSFORM_INVALID', 'REVISION_ID_MUST_BE_CANONICAL_NONEMPTY_STRING', {
      field,
      receivedType: value === null ? 'null' : typeof value,
      length: typeof value === 'string' ? value.length : null,
    });
  }
  return value;
}

function requireSafePosition(value, field) {
  if (!Number.isSafeInteger(value) || value < 0) {
    fail('E_TEXT_TRANSFORM_INVALID', 'POSITION_MUST_BE_NON_NEGATIVE_SAFE_INTEGER', {
      field,
      position: Number.isFinite(value) ? value : null,
    });
  }
  return value;
}

function requireEnum(value, allowed, field) {
  if (!allowed.includes(value)) {
    fail('E_TEXT_TRANSFORM_INVALID', 'ENUM_VALUE_INVALID', {
      field,
      value: typeof value === 'string' ? value : '',
    });
  }
  return value;
}

function isCodePointBoundary(text, offset) {
  if (offset <= 0 || offset >= text.length) return true;
  const previous = text.charCodeAt(offset - 1);
  const current = text.charCodeAt(offset);
  return !(
    previous >= 0xd800
    && previous <= 0xdbff
    && current >= 0xdc00
    && current <= 0xdfff
  );
}

function requireTape(tape) {
  if (!tape || typeof tape !== 'object' || !TAPE_DATA.has(tape)) {
    fail('E_TEXT_TRANSFORM_DESCRIPTOR_INVALID', 'TAPE_NOT_CREATED_BY_TRANSFORM_ALGEBRA');
  }
  return TAPE_DATA.get(tape);
}

function requireTransform(transform) {
  if (transform && typeof transform === 'object') {
    if (TAPE_DATA.has(transform)) return TAPE_DATA.get(transform);
    if (ROUTE_DATA.has(transform)) return ROUTE_DATA.get(transform);
  }
  fail('E_TEXT_TRANSFORM_DESCRIPTOR_INVALID', 'TRANSFORM_NOT_CREATED_BY_TRANSFORM_ALGEBRA');
}

function operationHash(text) {
  return text.length === 0 ? EMPTY_TEXT_HASH : sha256Hex(text);
}

export function buildTextTransformTape(input) {
  const values = requireExactDataRecord(
    input,
    ['sourceText', 'targetText', 'sourceRevisionId', 'targetRevisionId', 'operations'],
    'buildTextTransformTape',
  );
  const sourceText = requireText(values.sourceText, 'sourceText');
  const targetText = requireText(values.targetText, 'targetText');
  const sourceRevisionId = requireRevisionId(values.sourceRevisionId, 'sourceRevisionId');
  const targetRevisionId = requireRevisionId(values.targetRevisionId, 'targetRevisionId');
  if (sourceRevisionId === targetRevisionId) {
    fail('E_TEXT_TRANSFORM_INVALID', 'SOURCE_AND_TARGET_REVISIONS_MUST_DIFFER', {
      sourceRevisionId,
    });
  }
  const operationInputs = requireDenseDataArray(
    values.operations,
    'operations',
    MAX_TRANSFORM_OPERATIONS,
  );

  const sourceTextHash = sha256Hex(sourceText);
  const targetTextHash = sha256Hex(targetText);
  const operations = [];
  const pieces = [];
  let sourceCursor = 0;
  let previousSourceEnd = -1;
  let cumulativeDelta = 0;
  let calculatedTargetLength = sourceText.length;

  for (let operationIndex = 0; operationIndex < operationInputs.length; operationIndex += 1) {
    const operationValues = requireExactDataRecord(
      operationInputs[operationIndex],
      ['sourceStart', 'sourceEnd', 'insertedText'],
      `buildTextTransformTape.operations[${operationIndex}]`,
    );
    const sourceStart = requireSafePosition(operationValues.sourceStart, 'sourceStart');
    const sourceEnd = requireSafePosition(operationValues.sourceEnd, 'sourceEnd');
    const insertedText = requireText(operationValues.insertedText, 'insertedText');
    if (sourceEnd < sourceStart) {
      fail('E_TEXT_TRANSFORM_OPERATION_INVALID', 'OPERATION_END_BEFORE_START', {
        operationIndex,
        sourceStart,
        sourceEnd,
      });
    }
    if (sourceEnd > sourceText.length) {
      fail('E_TEXT_TRANSFORM_OUT_OF_RANGE', 'OPERATION_OUTSIDE_SOURCE_TEXT', {
        operationIndex,
        sourceStart,
        sourceEnd,
        sourceUtf16Length: sourceText.length,
      });
    }
    if (!isCodePointBoundary(sourceText, sourceStart) || !isCodePointBoundary(sourceText, sourceEnd)) {
      fail('E_TEXT_TRANSFORM_OPERATION_INVALID', 'OPERATION_SPLITS_UNICODE_CODE_POINT', {
        operationIndex,
        sourceStart,
        sourceEnd,
      });
    }
    if (operationIndex > 0 && sourceStart <= previousSourceEnd) {
      fail('E_TEXT_TRANSFORM_OPERATION_ORDER', 'OPERATIONS_MUST_BE_ORDERED_NON_TOUCHING_AND_NON_OVERLAPPING', {
        operationIndex,
        previousSourceEnd,
        sourceStart,
      });
    }

    const deletedText = sourceText.slice(sourceStart, sourceEnd);
    if (deletedText === insertedText) {
      fail('E_TEXT_TRANSFORM_OPERATION_INVALID', 'NOOP_OPERATION_FORBIDDEN', {
        operationIndex,
        sourceStart,
        sourceEnd,
      });
    }
    const deletedUtf16Length = sourceEnd - sourceStart;
    const insertedUtf16Length = insertedText.length;
    calculatedTargetLength += insertedUtf16Length - deletedUtf16Length;
    if (
      !Number.isSafeInteger(calculatedTargetLength)
      || calculatedTargetLength < 0
      || calculatedTargetLength > MAX_UTF16_LENGTH
    ) {
      fail('E_TEXT_TRANSFORM_OUT_OF_RANGE', 'CALCULATED_TARGET_LENGTH_OUT_OF_RANGE', {
        operationIndex,
        calculatedTargetLength: Number.isFinite(calculatedTargetLength) ? calculatedTargetLength : null,
      });
    }

    const targetStart = sourceStart + cumulativeDelta;
    const targetEnd = targetStart + insertedUtf16Length;
    const kind = deletedUtf16Length === 0
      ? 'INSERT'
      : insertedUtf16Length === 0
        ? 'DELETE'
        : 'REPLACE';
    const descriptor = Object.freeze({
      operationIndex,
      kind,
      sourceStart,
      sourceEnd,
      sourceUtf16Length: deletedUtf16Length,
      targetStart,
      targetEnd,
      targetUtf16Length: insertedUtf16Length,
      deletedTextHash: operationHash(deletedText),
      insertedTextHash: operationHash(insertedText),
    });
    operations.push(descriptor);
    pieces.push(sourceText.slice(sourceCursor, sourceStart), insertedText);
    sourceCursor = sourceEnd;
    previousSourceEnd = sourceEnd;
    cumulativeDelta += insertedUtf16Length - deletedUtf16Length;
  }

  if (calculatedTargetLength !== targetText.length) {
    fail('E_TEXT_TRANSFORM_TARGET_MISMATCH', 'CALCULATED_TARGET_LENGTH_MISMATCH', {
      calculatedTargetLength,
      targetUtf16Length: targetText.length,
      sourceTextHash,
      targetTextHash,
    });
  }
  pieces.push(sourceText.slice(sourceCursor));
  const replayedTarget = pieces.join('');
  if (replayedTarget !== targetText) {
    fail('E_TEXT_TRANSFORM_TARGET_MISMATCH', 'OPERATIONS_DO_NOT_REPLAY_TO_TARGET_TEXT', {
      sourceTextHash,
      targetTextHash,
      replayedTargetHash: sha256Hex(replayedTarget),
    });
  }

  const frozenOperations = Object.freeze(operations);
  const body = Object.freeze({
    schemaVersion: TEXT_TRANSFORM_TAPE_SCHEMA_VERSION,
    algorithmId: TEXT_TRANSFORM_ALGORITHM_ID,
    algorithmVersion: TEXT_TRANSFORM_ALGORITHM_VERSION,
    coordinateDomain: TEXT_TRANSFORM_COORDINATE_DOMAIN,
    boundaryPolicy: TEXT_TRANSFORM_BOUNDARY_POLICY,
    textNormalization: TEXT_TRANSFORM_NORMALIZATION,
    sourceRevisionId,
    targetRevisionId,
    sourceTextHash,
    targetTextHash,
    sourceUtf16Length: sourceText.length,
    targetUtf16Length: targetText.length,
    operationCount: frozenOperations.length,
    operations: frozenOperations,
  });
  const descriptor = Object.freeze({
    ...body,
    tapeId: `text-transform-tape:${hashCanonicalValue(body)}`,
  });
  TAPE_DATA.set(descriptor, {
    kind: 'TAPE',
    descriptor,
    operations: frozenOperations,
    tapes: null,
  });
  return descriptor;
}

export function buildTextTransformRoute(input) {
  const values = requireExactDataRecord(input, ['tapes'], 'buildTextTransformRoute');
  const tapeDescriptors = requireDenseDataArray(values.tapes, 'tapes', MAX_TRANSFORM_ROUTE_TAPES);
  if (tapeDescriptors.length === 0) {
    fail('E_TEXT_TRANSFORM_INVALID', 'ROUTE_REQUIRES_AT_LEAST_ONE_TAPE');
  }
  const tapes = tapeDescriptors.map((tape) => requireTape(tape));
  const seenRevisions = new Set([tapes[0].descriptor.sourceRevisionId]);
  for (let index = 0; index < tapes.length; index += 1) {
    const current = tapes[index].descriptor;
    if (seenRevisions.has(current.targetRevisionId)) {
      fail('E_TEXT_TRANSFORM_ROUTE_DISCONTINUITY', 'ROUTE_REVISION_CYCLE_OR_DUPLICATE', {
        tapeIndex: index,
        revisionId: current.targetRevisionId,
      });
    }
    seenRevisions.add(current.targetRevisionId);
    if (index === 0) continue;
    const previous = tapes[index - 1].descriptor;
    const mismatches = [];
    if (previous.targetRevisionId !== current.sourceRevisionId) mismatches.push('REVISION_ID');
    if (previous.targetTextHash !== current.sourceTextHash) mismatches.push('TEXT_HASH');
    if (previous.targetUtf16Length !== current.sourceUtf16Length) mismatches.push('UTF16_LENGTH');
    if (previous.coordinateDomain !== current.coordinateDomain) mismatches.push('COORDINATE_DOMAIN');
    if (previous.algorithmId !== current.algorithmId || previous.algorithmVersion !== current.algorithmVersion) {
      mismatches.push('ALGORITHM');
    }
    if (mismatches.length > 0) {
      fail('E_TEXT_TRANSFORM_ROUTE_DISCONTINUITY', 'ROUTE_TAPES_ARE_NOT_EXACTLY_ADJACENT', {
        tapeIndex: index,
        mismatches: mismatches.join(','),
      });
    }
  }

  const first = tapes[0].descriptor;
  const last = tapes[tapes.length - 1].descriptor;
  const tapeIds = Object.freeze(tapes.map((tape) => tape.descriptor.tapeId));
  const body = Object.freeze({
    schemaVersion: TEXT_TRANSFORM_ROUTE_SCHEMA_VERSION,
    algorithmId: TEXT_TRANSFORM_ALGORITHM_ID,
    algorithmVersion: TEXT_TRANSFORM_ALGORITHM_VERSION,
    coordinateDomain: TEXT_TRANSFORM_COORDINATE_DOMAIN,
    boundaryPolicy: TEXT_TRANSFORM_BOUNDARY_POLICY,
    textNormalization: TEXT_TRANSFORM_NORMALIZATION,
    sourceRevisionId: first.sourceRevisionId,
    targetRevisionId: last.targetRevisionId,
    sourceTextHash: first.sourceTextHash,
    targetTextHash: last.targetTextHash,
    sourceUtf16Length: first.sourceUtf16Length,
    targetUtf16Length: last.targetUtf16Length,
    tapeCount: tapes.length,
    tapeIds,
  });
  const descriptor = Object.freeze({
    ...body,
    routeId: `text-transform-route:${hashCanonicalValue(body)}`,
  });
  ROUTE_DATA.set(descriptor, {
    kind: 'ROUTE',
    descriptor,
    operations: null,
    tapes: Object.freeze(tapes),
  });
  return descriptor;
}

function inputMetadata(transformData, direction) {
  const descriptor = transformData.descriptor;
  if (direction === TEXT_TRANSFORM_DIRECTION.FORWARD) {
    return {
      revisionId: descriptor.sourceRevisionId,
      textHash: descriptor.sourceTextHash,
      utf16Length: descriptor.sourceUtf16Length,
    };
  }
  return {
    revisionId: descriptor.targetRevisionId,
    textHash: descriptor.targetTextHash,
    utf16Length: descriptor.targetUtf16Length,
  };
}

function outputMetadata(transformData, direction) {
  const descriptor = transformData.descriptor;
  if (direction === TEXT_TRANSFORM_DIRECTION.FORWARD) {
    return {
      revisionId: descriptor.targetRevisionId,
      textHash: descriptor.targetTextHash,
      utf16Length: descriptor.targetUtf16Length,
    };
  }
  return {
    revisionId: descriptor.sourceRevisionId,
    textHash: descriptor.sourceTextHash,
    utf16Length: descriptor.sourceUtf16Length,
  };
}

function transformId(transformData) {
  return transformData.kind === 'TAPE'
    ? transformData.descriptor.tapeId
    : transformData.descriptor.routeId;
}

function traversalSteps(transformData, direction) {
  const tapes = transformData.kind === 'TAPE' ? [transformData] : transformData.tapes;
  const steps = tapes.map((tape, tapeIndex) => ({ tape, tapeIndex }));
  return direction === TEXT_TRANSFORM_DIRECTION.FORWARD ? steps : steps.reverse();
}

function mapPositionThroughTape(tapeData, direction, position, affinity) {
  const operations = tapeData.operations;
  if (direction === TEXT_TRANSFORM_DIRECTION.FORWARD) {
    let cumulativeDelta = 0;
    for (const operation of operations) {
      if (position < operation.sourceStart) {
        return {
          status: TEXT_TRANSFORM_POSITION_STATUS.EXACT,
          position: position + cumulativeDelta,
        };
      }
      if (operation.sourceStart === operation.sourceEnd && position === operation.sourceStart) {
        return {
          status: TEXT_TRANSFORM_POSITION_STATUS.EXACT,
          position: affinity === TEXT_TRANSFORM_AFFINITY.BEFORE
            ? operation.targetStart
            : operation.targetEnd,
        };
      }
      if (position === operation.sourceStart) {
        return { status: TEXT_TRANSFORM_POSITION_STATUS.EXACT, position: operation.targetStart };
      }
      if (position > operation.sourceStart && position < operation.sourceEnd) {
        return {
          status: TEXT_TRANSFORM_POSITION_STATUS.UNMAPPABLE,
          reason: 'POSITION_INSIDE_REMOVED_SOURCE_RANGE',
          operationIndex: operation.operationIndex,
        };
      }
      if (position === operation.sourceEnd) {
        return { status: TEXT_TRANSFORM_POSITION_STATUS.EXACT, position: operation.targetEnd };
      }
      cumulativeDelta = operation.targetEnd - operation.sourceEnd;
    }
    return {
      status: TEXT_TRANSFORM_POSITION_STATUS.EXACT,
      position: position + cumulativeDelta,
    };
  }

  let cumulativeDelta = 0;
  for (const operation of operations) {
    if (position < operation.targetStart) {
      return {
        status: TEXT_TRANSFORM_POSITION_STATUS.EXACT,
        position: position + cumulativeDelta,
      };
    }
    if (operation.targetStart === operation.targetEnd && position === operation.targetStart) {
      return {
        status: TEXT_TRANSFORM_POSITION_STATUS.EXACT,
        position: affinity === TEXT_TRANSFORM_AFFINITY.BEFORE
          ? operation.sourceStart
          : operation.sourceEnd,
      };
    }
    if (position === operation.targetStart) {
      return { status: TEXT_TRANSFORM_POSITION_STATUS.EXACT, position: operation.sourceStart };
    }
    if (position > operation.targetStart && position < operation.targetEnd) {
      return {
        status: TEXT_TRANSFORM_POSITION_STATUS.UNMAPPABLE,
        reason: 'POSITION_INSIDE_INSERTED_TARGET_RANGE',
        operationIndex: operation.operationIndex,
      };
    }
    if (position === operation.targetEnd) {
      return { status: TEXT_TRANSFORM_POSITION_STATUS.EXACT, position: operation.sourceEnd };
    }
    cumulativeDelta = operation.sourceEnd - operation.targetEnd;
  }
  return {
    status: TEXT_TRANSFORM_POSITION_STATUS.EXACT,
    position: position + cumulativeDelta,
  };
}

function mapAcrossSteps(steps, direction, position, affinity) {
  let currentPosition = position;
  for (const step of steps) {
    const result = mapPositionThroughTape(step.tape, direction, currentPosition, affinity);
    if (result.status !== TEXT_TRANSFORM_POSITION_STATUS.EXACT) {
      return {
        ...result,
        failedTapeIndex: step.tapeIndex,
      };
    }
    currentPosition = result.position;
  }
  return {
    status: TEXT_TRANSFORM_POSITION_STATUS.EXACT,
    position: currentPosition,
  };
}

function validateMapContext(transformData, direction, inputRevisionId) {
  const expectedInput = inputMetadata(transformData, direction);
  if (inputRevisionId !== expectedInput.revisionId) {
    fail('E_TEXT_TRANSFORM_REVISION_MISMATCH', 'INPUT_REVISION_DOES_NOT_MATCH_TRANSFORM_DIRECTION', {
      direction,
      expectedInputRevisionId: expectedInput.revisionId,
      actualInputRevisionId: inputRevisionId,
    });
  }
  return expectedInput;
}

export function mapTextTransformPosition(input) {
  const values = requireExactDataRecord(
    input,
    ['transform', 'direction', 'inputRevisionId', 'position', 'affinity'],
    'mapTextTransformPosition',
  );
  const transformData = requireTransform(values.transform);
  const direction = requireEnum(
    values.direction,
    Object.values(TEXT_TRANSFORM_DIRECTION),
    'direction',
  );
  const affinity = requireEnum(
    values.affinity,
    Object.values(TEXT_TRANSFORM_AFFINITY),
    'affinity',
  );
  const inputRevisionId = requireRevisionId(values.inputRevisionId, 'inputRevisionId');
  const expectedInput = validateMapContext(transformData, direction, inputRevisionId);
  const expectedOutput = outputMetadata(transformData, direction);
  const position = requireSafePosition(values.position, 'position');
  if (position > expectedInput.utf16Length) {
    fail('E_TEXT_TRANSFORM_OUT_OF_RANGE', 'POSITION_OUTSIDE_INPUT_TEXT', {
      position,
      inputUtf16Length: expectedInput.utf16Length,
    });
  }
  const steps = traversalSteps(transformData, direction);
  const mapped = mapAcrossSteps(steps, direction, position, affinity);
  const common = {
    schemaVersion: TEXT_TRANSFORM_POSITION_RESULT_SCHEMA_VERSION,
    transformKind: transformData.kind,
    transformId: transformId(transformData),
    direction,
    affinity,
    inputRevisionId,
    inputTextHash: expectedInput.textHash,
    inputPosition: position,
    requestedOutputRevisionId: expectedOutput.revisionId,
    requestedOutputTextHash: expectedOutput.textHash,
    traversedTapeCount: steps.length,
  };
  if (mapped.status !== TEXT_TRANSFORM_POSITION_STATUS.EXACT) {
    return Object.freeze({
      ...common,
      status: TEXT_TRANSFORM_POSITION_STATUS.UNMAPPABLE,
      reason: mapped.reason,
      failedTapeIndex: mapped.failedTapeIndex,
      failedOperationIndex: mapped.operationIndex,
    });
  }
  if (mapped.position < 0 || mapped.position > expectedOutput.utf16Length) {
    fail('E_TEXT_TRANSFORM_INVALID', 'MAPPED_POSITION_INTERNAL_INVARIANT_FAILED', {
      mappedPosition: mapped.position,
      outputUtf16Length: expectedOutput.utf16Length,
    });
  }
  return Object.freeze({
    ...common,
    status: TEXT_TRANSFORM_POSITION_STATUS.EXACT,
    outputRevisionId: expectedOutput.revisionId,
    outputTextHash: expectedOutput.textHash,
    outputPosition: mapped.position,
  });
}

function rangesIntersect(startA, endA, startB, endB) {
  return startA < endA && startB < endB && startA < endB && startB < endA;
}

function impactForStep(tapeData, direction, inputStart, inputEnd, outputStart, outputEnd) {
  let inputContentRemoved = false;
  let outputContentInserted = false;
  for (const operation of tapeData.operations) {
    const inputChangedStart = direction === TEXT_TRANSFORM_DIRECTION.FORWARD
      ? operation.sourceStart
      : operation.targetStart;
    const inputChangedEnd = direction === TEXT_TRANSFORM_DIRECTION.FORWARD
      ? operation.sourceEnd
      : operation.targetEnd;
    const outputChangedStart = direction === TEXT_TRANSFORM_DIRECTION.FORWARD
      ? operation.targetStart
      : operation.sourceStart;
    const outputChangedEnd = direction === TEXT_TRANSFORM_DIRECTION.FORWARD
      ? operation.targetEnd
      : operation.sourceEnd;
    if (rangesIntersect(inputStart, inputEnd, inputChangedStart, inputChangedEnd)) {
      inputContentRemoved = true;
    }
    if (rangesIntersect(outputStart, outputEnd, outputChangedStart, outputChangedEnd)) {
      outputContentInserted = true;
    }
  }
  return { inputContentRemoved, outputContentInserted };
}

function classifyContentImpact(inputContentRemoved, outputContentInserted) {
  if (inputContentRemoved && outputContentInserted) {
    return TEXT_TRANSFORM_CONTENT_IMPACT.INPUT_REMOVED_AND_OUTPUT_INSERTED;
  }
  if (inputContentRemoved) return TEXT_TRANSFORM_CONTENT_IMPACT.INPUT_CONTENT_REMOVED;
  if (outputContentInserted) return TEXT_TRANSFORM_CONTENT_IMPACT.OUTPUT_CONTENT_INSERTED;
  return TEXT_TRANSFORM_CONTENT_IMPACT.UNCHANGED;
}

function boundaryResult(mapped, inputPosition) {
  if (mapped.status === TEXT_TRANSFORM_POSITION_STATUS.EXACT) {
    return Object.freeze({
      status: TEXT_TRANSFORM_POSITION_STATUS.EXACT,
      inputPosition,
      outputPosition: mapped.position,
    });
  }
  return Object.freeze({
    status: TEXT_TRANSFORM_POSITION_STATUS.UNMAPPABLE,
    inputPosition,
    reason: mapped.reason,
    failedTapeIndex: mapped.failedTapeIndex,
    failedOperationIndex: mapped.operationIndex,
  });
}

function unmappableRangeResult(common, reason, startBoundary, endBoundary) {
  return Object.freeze({
    ...common,
    status: TEXT_TRANSFORM_RANGE_STATUS.UNMAPPABLE,
    reason,
    startBoundary,
    endBoundary,
    contentImpact: TEXT_TRANSFORM_CONTENT_IMPACT.UNKNOWN_UNMAPPABLE_BOUNDARY,
    contentPreserved: false,
    touchedTapeIndexes: Object.freeze([]),
  });
}

export function mapTextTransformRange(input) {
  const values = requireExactDataRecord(
    input,
    [
      'transform',
      'direction',
      'inputRevisionId',
      'start',
      'end',
      'startAffinity',
      'endAffinity',
    ],
    'mapTextTransformRange',
  );
  const transformData = requireTransform(values.transform);
  const direction = requireEnum(
    values.direction,
    Object.values(TEXT_TRANSFORM_DIRECTION),
    'direction',
  );
  const startAffinity = requireEnum(
    values.startAffinity,
    Object.values(TEXT_TRANSFORM_AFFINITY),
    'startAffinity',
  );
  const endAffinity = requireEnum(
    values.endAffinity,
    Object.values(TEXT_TRANSFORM_AFFINITY),
    'endAffinity',
  );
  const inputRevisionId = requireRevisionId(values.inputRevisionId, 'inputRevisionId');
  const expectedInput = validateMapContext(transformData, direction, inputRevisionId);
  const expectedOutput = outputMetadata(transformData, direction);
  const start = requireSafePosition(values.start, 'start');
  const end = requireSafePosition(values.end, 'end');
  if (end < start) {
    fail('E_TEXT_TRANSFORM_RANGE_INVALID', 'RANGE_END_BEFORE_START', { start, end });
  }
  if (end > expectedInput.utf16Length) {
    fail('E_TEXT_TRANSFORM_OUT_OF_RANGE', 'RANGE_OUTSIDE_INPUT_TEXT', {
      start,
      end,
      inputUtf16Length: expectedInput.utf16Length,
    });
  }

  const steps = traversalSteps(transformData, direction);
  const mappedStart = mapAcrossSteps(steps, direction, start, startAffinity);
  const mappedEnd = mapAcrossSteps(steps, direction, end, endAffinity);
  const startBoundary = boundaryResult(mappedStart, start);
  const endBoundary = boundaryResult(mappedEnd, end);
  const common = {
    schemaVersion: TEXT_TRANSFORM_RANGE_RESULT_SCHEMA_VERSION,
    transformKind: transformData.kind,
    transformId: transformId(transformData),
    direction,
    inputRevisionId,
    inputTextHash: expectedInput.textHash,
    requestedOutputRevisionId: expectedOutput.revisionId,
    requestedOutputTextHash: expectedOutput.textHash,
    inputRange: Object.freeze({ start, end, length: end - start }),
    startAffinity,
    endAffinity,
    traversedTapeCount: steps.length,
  };
  if (
    mappedStart.status !== TEXT_TRANSFORM_POSITION_STATUS.EXACT
    || mappedEnd.status !== TEXT_TRANSFORM_POSITION_STATUS.EXACT
  ) {
    const reason = mappedStart.status !== TEXT_TRANSFORM_POSITION_STATUS.EXACT
      && mappedEnd.status !== TEXT_TRANSFORM_POSITION_STATUS.EXACT
      ? 'BOTH_BOUNDARIES_UNMAPPABLE'
      : mappedStart.status !== TEXT_TRANSFORM_POSITION_STATUS.EXACT
        ? 'START_BOUNDARY_UNMAPPABLE'
        : 'END_BOUNDARY_UNMAPPABLE';
    return unmappableRangeResult(common, reason, startBoundary, endBoundary);
  }
  if (mappedStart.position > mappedEnd.position) {
    return unmappableRangeResult(
      common,
      'BOUNDARY_AFFINITIES_INVERT_OUTPUT_RANGE',
      startBoundary,
      endBoundary,
    );
  }

  let currentStart = start;
  let currentEnd = end;
  let inputContentRemoved = false;
  let outputContentInserted = false;
  const touchedTapeIndexes = new Set();
  for (const step of steps) {
    const nextStart = mapPositionThroughTape(step.tape, direction, currentStart, startAffinity);
    const nextEnd = mapPositionThroughTape(step.tape, direction, currentEnd, endAffinity);
    if (
      nextStart.status !== TEXT_TRANSFORM_POSITION_STATUS.EXACT
      || nextEnd.status !== TEXT_TRANSFORM_POSITION_STATUS.EXACT
      || nextStart.position > nextEnd.position
    ) {
      fail('E_TEXT_TRANSFORM_INVALID', 'RANGE_MAPPING_INTERNAL_INVARIANT_FAILED', {
        tapeIndex: step.tapeIndex,
      });
    }
    const impact = impactForStep(
      step.tape,
      direction,
      currentStart,
      currentEnd,
      nextStart.position,
      nextEnd.position,
    );
    if (impact.inputContentRemoved || impact.outputContentInserted) {
      touchedTapeIndexes.add(step.tapeIndex);
    }
    inputContentRemoved ||= impact.inputContentRemoved;
    outputContentInserted ||= impact.outputContentInserted;
    currentStart = nextStart.position;
    currentEnd = nextEnd.position;
  }
  const contentImpact = classifyContentImpact(inputContentRemoved, outputContentInserted);
  return Object.freeze({
    ...common,
    status: TEXT_TRANSFORM_RANGE_STATUS.EXACT,
    outputRevisionId: expectedOutput.revisionId,
    outputTextHash: expectedOutput.textHash,
    outputRange: Object.freeze({
      start: mappedStart.position,
      end: mappedEnd.position,
      length: mappedEnd.position - mappedStart.position,
    }),
    startBoundary,
    endBoundary,
    contentImpact,
    contentPreserved: contentImpact === TEXT_TRANSFORM_CONTENT_IMPACT.UNCHANGED,
    touchedTapeIndexes: Object.freeze([...touchedTapeIndexes].sort((a, b) => a - b)),
  });
}
