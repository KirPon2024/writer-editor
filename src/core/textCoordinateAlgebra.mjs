export const TEXT_COORDINATE_INDEX_SCHEMA_VERSION = 'core.textCoordinateIndex.v1';

export const TEXT_COORDINATE_DOMAIN = Object.freeze({
  UTF16_JS_CODE_UNIT: 'UTF16_JS_CODE_UNIT',
  UNICODE_CODE_POINT: 'UNICODE_CODE_POINT',
  GRAPHEME_CLUSTER: 'GRAPHEME_CLUSTER',
});

export const TEXT_COORDINATE_DOMAINS = Object.freeze([
  TEXT_COORDINATE_DOMAIN.UTF16_JS_CODE_UNIT,
  TEXT_COORDINATE_DOMAIN.UNICODE_CODE_POINT,
  TEXT_COORDINATE_DOMAIN.GRAPHEME_CLUSTER,
]);

const TEXT_COORDINATE_OP = 'core.textCoordinateAlgebra';
const MAX_UTF16_LENGTH = 0xfffffffe;
const INDEX_DATA = new WeakMap();

function freezeDetails(details) {
  return Object.freeze({ ...(details && typeof details === 'object' ? details : {}) });
}

export class TextCoordinateError extends RangeError {
  constructor(code, reason, details = {}) {
    super(reason);
    this.name = 'TextCoordinateError';
    this.code = code;
    this.op = TEXT_COORDINATE_OP;
    this.reason = reason;
    this.details = freezeDetails(details);
  }
}

function fail(code, reason, details) {
  throw new TextCoordinateError(code, reason, details);
}

function requireText(text) {
  if (typeof text !== 'string') {
    fail('E_TEXT_COORDINATE_INVALID', 'TEXT_MUST_BE_STRING', {
      receivedType: text === null ? 'null' : typeof text,
    });
  }
  if (text.length > MAX_UTF16_LENGTH) {
    fail('E_TEXT_COORDINATE_OUT_OF_RANGE', 'TEXT_EXCEEDS_UINT32_UTF16_RANGE', {
      utf16Length: text.length,
      maximumUtf16Length: MAX_UTF16_LENGTH,
    });
  }
  return text;
}

function requireIndex(index) {
  if (!index || typeof index !== 'object' || !INDEX_DATA.has(index)) {
    fail('E_TEXT_COORDINATE_INDEX_INVALID', 'INDEX_NOT_CREATED_BY_COORDINATE_ALGEBRA');
  }
  return INDEX_DATA.get(index);
}

function requireDomain(domain, field) {
  if (!TEXT_COORDINATE_DOMAINS.includes(domain)) {
    fail('E_TEXT_COORDINATE_INVALID', 'OFFSET_DOMAIN_INVALID', {
      field,
      domain: typeof domain === 'string' ? domain : '',
    });
  }
  return domain;
}

function requireSafePosition(position, field) {
  if (!Number.isSafeInteger(position) || position < 0) {
    fail('E_TEXT_COORDINATE_INVALID', 'POSITION_MUST_BE_NON_NEGATIVE_SAFE_INTEGER', {
      field,
      position: Number.isFinite(position) ? position : null,
    });
  }
  return position;
}

function requireExactDataRecord(input, fields, operation) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    fail('E_TEXT_COORDINATE_INVALID', 'INPUT_MUST_BE_PLAIN_DATA_RECORD', { operation });
  }
  const prototype = Object.getPrototypeOf(input);
  if (prototype !== Object.prototype && prototype !== null) {
    fail('E_TEXT_COORDINATE_INVALID', 'INPUT_PROTOTYPE_INVALID', { operation });
  }
  const ownKeys = Reflect.ownKeys(input);
  if (ownKeys.length !== fields.length || ownKeys.some((key) => typeof key !== 'string' || !fields.includes(key))) {
    fail('E_TEXT_COORDINATE_INVALID', 'INPUT_FIELDS_INVALID', { operation });
  }
  const values = {};
  for (const field of fields) {
    const descriptor = Object.getOwnPropertyDescriptor(input, field);
    if (!descriptor || !Object.hasOwn(descriptor, 'value') || descriptor.enumerable !== true) {
      fail('E_TEXT_COORDINATE_INVALID', 'INPUT_FIELD_MUST_BE_ENUMERABLE_DATA_PROPERTY', {
        operation,
        field,
      });
    }
    values[field] = descriptor.value;
  }
  return values;
}

function buildCodePointBoundaries(text) {
  const boundaries = new Uint32Array(text.length + 1);
  let boundaryCount = 1;
  let utf16Offset = 0;
  for (const char of text) {
    utf16Offset += char.length;
    boundaries[boundaryCount] = utf16Offset;
    boundaryCount += 1;
  }
  return boundaries.subarray(0, boundaryCount);
}

function buildGraphemeBoundaries(text) {
  if (typeof Intl !== 'object' || typeof Intl.Segmenter !== 'function') {
    fail('E_TEXT_COORDINATE_SEGMENTER_UNAVAILABLE', 'INTL_SEGMENTER_GRAPHEME_UNAVAILABLE');
  }
  let segments;
  try {
    segments = new Intl.Segmenter('und', { granularity: 'grapheme' }).segment(text);
  } catch (error) {
    fail('E_TEXT_COORDINATE_SEGMENTER_UNAVAILABLE', 'INTL_SEGMENTER_GRAPHEME_UNAVAILABLE', {
      causeName: typeof error?.name === 'string' ? error.name : '',
    });
  }
  const boundaries = new Uint32Array(text.length + 1);
  let boundaryCount = 1;
  let segmentCount = 0;
  let previous = 0;
  try {
    for (const segment of segments) {
      const boundary = segment?.index;
      segmentCount += 1;
      if (!Number.isSafeInteger(boundary) || boundary < 0 || boundary > text.length) {
        fail('E_TEXT_COORDINATE_INVALID', 'SEGMENTER_RETURNED_INVALID_BOUNDARY', { boundary });
      }
      if (segmentCount === 1 && boundary !== 0) {
        fail('E_TEXT_COORDINATE_INVALID', 'SEGMENTER_FIRST_BOUNDARY_MUST_BE_ZERO', { boundary });
      }
      if (boundary === 0) {
        if (segmentCount > 1) {
          fail('E_TEXT_COORDINATE_INVALID', 'SEGMENTER_BOUNDARIES_NOT_STRICTLY_ORDERED', {
            boundary,
            previous,
          });
        }
        continue;
      }
      if (boundary <= previous) {
        fail('E_TEXT_COORDINATE_INVALID', 'SEGMENTER_BOUNDARIES_NOT_STRICTLY_ORDERED', {
          boundary,
          previous,
        });
      }
      boundaries[boundaryCount] = boundary;
      boundaryCount += 1;
      previous = boundary;
    }
  } catch (error) {
    if (error instanceof TextCoordinateError) throw error;
    fail('E_TEXT_COORDINATE_INVALID', 'SEGMENTER_ITERATION_FAILED', {
      causeName: typeof error?.name === 'string' ? error.name : '',
    });
  }
  if (text.length > 0 && segmentCount === 0) {
    fail('E_TEXT_COORDINATE_INVALID', 'SEGMENTER_RETURNED_EMPTY_RESULT');
  }
  if (boundaries[boundaryCount - 1] !== text.length) {
    boundaries[boundaryCount] = text.length;
    boundaryCount += 1;
  }
  return boundaries.subarray(0, boundaryCount);
}

function boundariesFor(data, domain) {
  if (domain === TEXT_COORDINATE_DOMAIN.UNICODE_CODE_POINT) return data.codePointBoundaries;
  if (domain === TEXT_COORDINATE_DOMAIN.GRAPHEME_CLUSTER) return data.graphemeBoundaries;
  return null;
}

function domainLength(data, domain) {
  if (domain === TEXT_COORDINATE_DOMAIN.UTF16_JS_CODE_UNIT) return data.text.length;
  return boundariesFor(data, domain).length - 1;
}

function binarySearchExact(boundaries, target) {
  let low = 0;
  let high = boundaries.length - 1;
  while (low <= high) {
    const middle = low + Math.floor((high - low) / 2);
    const value = boundaries[middle];
    if (value === target) return middle;
    if (value < target) low = middle + 1;
    else high = middle - 1;
  }
  return -1;
}

function toUtf16Offset(data, domain, position) {
  const maximum = domainLength(data, domain);
  if (position > maximum) {
    fail('E_TEXT_COORDINATE_OUT_OF_RANGE', 'POSITION_OUT_OF_DOMAIN_RANGE', {
      domain,
      position,
      maximum,
    });
  }
  if (domain === TEXT_COORDINATE_DOMAIN.UTF16_JS_CODE_UNIT) return position;
  return boundariesFor(data, domain)[position];
}

function fromUtf16Offset(data, domain, utf16Offset) {
  if (domain === TEXT_COORDINATE_DOMAIN.UTF16_JS_CODE_UNIT) return utf16Offset;
  const converted = binarySearchExact(boundariesFor(data, domain), utf16Offset);
  if (converted < 0) {
    fail('E_TEXT_COORDINATE_NOT_BOUNDARY', 'UTF16_OFFSET_IS_NOT_TARGET_DOMAIN_BOUNDARY', {
      domain,
      utf16Offset,
    });
  }
  return converted;
}

export function buildTextCoordinateIndex(textValue) {
  const text = requireText(textValue);
  const codePointBoundaries = buildCodePointBoundaries(text);
  const graphemeBoundaries = buildGraphemeBoundaries(text);
  const index = Object.freeze({
    schemaVersion: TEXT_COORDINATE_INDEX_SCHEMA_VERSION,
    offsetDomains: TEXT_COORDINATE_DOMAINS,
    adapterOffsetDomain: TEXT_COORDINATE_DOMAIN.UTF16_JS_CODE_UNIT,
    segmentationProvider: 'Intl.Segmenter',
    segmentationLocale: 'und',
    segmentationGranularity: 'grapheme',
    utf16Length: text.length,
    codePointLength: codePointBoundaries.length - 1,
    graphemeLength: graphemeBoundaries.length - 1,
  });
  INDEX_DATA.set(index, {
    text,
    codePointBoundaries,
    graphemeBoundaries,
  });
  return index;
}

export function assertTextCoordinateIndexMatches(index, textValue) {
  const text = requireText(textValue);
  const data = requireIndex(index);
  if (data.text !== text) {
    fail('E_TEXT_COORDINATE_INDEX_MISMATCH', 'INDEX_SOURCE_TEXT_MISMATCH', {
      indexUtf16Length: data.text.length,
      sourceUtf16Length: text.length,
    });
  }
  return index;
}

export function convertTextCoordinatePosition(input) {
  const values = requireExactDataRecord(
    input,
    ['index', 'fromDomain', 'toDomain', 'position'],
    'convertTextCoordinatePosition',
  );
  const data = requireIndex(values.index);
  const fromDomain = requireDomain(values.fromDomain, 'fromDomain');
  const toDomain = requireDomain(values.toDomain, 'toDomain');
  const position = requireSafePosition(values.position, 'position');
  const utf16Offset = toUtf16Offset(data, fromDomain, position);
  return fromUtf16Offset(data, toDomain, utf16Offset);
}

export function convertTextCoordinateRange(input) {
  const values = requireExactDataRecord(
    input,
    ['index', 'fromDomain', 'toDomain', 'start', 'end'],
    'convertTextCoordinateRange',
  );
  const data = requireIndex(values.index);
  const fromDomain = requireDomain(values.fromDomain, 'fromDomain');
  const toDomain = requireDomain(values.toDomain, 'toDomain');
  const start = requireSafePosition(values.start, 'start');
  const end = requireSafePosition(values.end, 'end');
  if (end < start) {
    fail('E_TEXT_COORDINATE_RANGE_INVALID', 'RANGE_END_BEFORE_START', { start, end });
  }
  const startUtf16 = toUtf16Offset(data, fromDomain, start);
  const endUtf16 = toUtf16Offset(data, fromDomain, end);
  const convertedStart = fromUtf16Offset(data, toDomain, startUtf16);
  const convertedEnd = fromUtf16Offset(data, toDomain, endUtf16);
  return Object.freeze({
    start: convertedStart,
    end: convertedEnd,
    length: convertedEnd - convertedStart,
  });
}

export function* iterateTextCoordinateSegments(index, domainValue) {
  const data = requireIndex(index);
  const domain = requireDomain(domainValue, 'domain');
  if (domain === TEXT_COORDINATE_DOMAIN.UTF16_JS_CODE_UNIT) {
    for (let position = 0; position < data.text.length; position += 1) {
      yield {
        index: position,
        utf16Start: position,
        utf16End: position + 1,
        text: data.text.slice(position, position + 1),
      };
    }
    return;
  }
  if (domain === TEXT_COORDINATE_DOMAIN.UNICODE_CODE_POINT) {
    const boundaries = data.codePointBoundaries;
    for (let position = 0; position < boundaries.length - 1; position += 1) {
      const utf16Start = boundaries[position];
      const utf16End = boundaries[position + 1];
      yield {
        index: position,
        utf16Start,
        utf16End,
        text: data.text.slice(utf16Start, utf16End),
      };
    }
    return;
  }
  const boundaries = data.graphemeBoundaries;
  const codePointBoundaries = data.codePointBoundaries;
  let codePointCursor = 0;
  for (let position = 0; position < boundaries.length - 1; position += 1) {
    const utf16Start = boundaries[position];
    const utf16End = boundaries[position + 1];
    while (codePointBoundaries[codePointCursor] < utf16Start) codePointCursor += 1;
    if (codePointBoundaries[codePointCursor] !== utf16Start) {
      fail('E_TEXT_COORDINATE_NOT_BOUNDARY', 'GRAPHEME_START_IS_NOT_CODE_POINT_BOUNDARY', {
        utf16Offset: utf16Start,
      });
    }
    const codePointStart = codePointCursor;
    while (codePointBoundaries[codePointCursor] < utf16End) codePointCursor += 1;
    if (codePointBoundaries[codePointCursor] !== utf16End) {
      fail('E_TEXT_COORDINATE_NOT_BOUNDARY', 'GRAPHEME_END_IS_NOT_CODE_POINT_BOUNDARY', {
        utf16Offset: utf16End,
      });
    }
    yield {
      index: position,
      utf16Start,
      utf16End,
      codePointStart,
      codePointEnd: codePointCursor,
      text: data.text.slice(utf16Start, utf16End),
    };
  }
}
