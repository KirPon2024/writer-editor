import crypto from 'node:crypto';
import zlib from 'node:zlib';
import { TextDecoder } from 'node:util';

export const PARSER_QUARANTINE_SCHEMA_VERSION = 'yalken.parser-quarantine.report.v1';

export const PARSER_QUARANTINE_LIMITS = Object.freeze({
  maxArchiveBytes: 8_388_608,
  maxEntries: 256,
  maxEntryCompressedBytes: 4_194_304,
  maxEntryInflatedBytes: 8_388_608,
  maxTotalInflatedBytes: 16_777_216,
  maxCompressionRatio: 100,
  maxXmlParts: 128,
  maxXmlBytes: 8_388_608,
  maxXmlDepth: 64,
  maxXmlNodes: 50_000,
  maxXmlAttributes: 128,
  maxXmlAttributeBytes: 8_192,
  maxXmlTextBytes: 8_388_608,
  maxPathBytes: 512,
  maxLossRecords: 1_024,
});

const INPUT_KEYS = Object.freeze(['budgets', 'bytes', 'format']);
const FORMATS = new Set(['AUTO', 'OOXML', 'XML', 'ZIP']);
const LIMIT_KEYS = Object.freeze(Object.keys(PARSER_QUARANTINE_LIMITS).sort());
const ZIP_LOCAL = 0x04034b50;
const ZIP_CENTRAL = 0x02014b50;
const ZIP_EOCD = 0x06054b50;
const UTF8 = new TextDecoder('utf-8', { fatal: true });
const CONFUSABLES = new Map(Object.entries({
  '\u0430': 'a', '\u0435': 'e', '\u043e': 'o', '\u0440': 'p', '\u0441': 'c', '\u0445': 'x', '\u0443': 'y', '\u043a': 'k', '\u043c': 'm', '\u0442': 't', '\u0432': 'b', '\u043d': 'h', '\u0456': 'i', '\u0458': 'j', '\u0455': 's', '\u04cf': 'l',
  '\u03b1': 'a', '\u03b2': 'b', '\u03b5': 'e', '\u03b7': 'h', '\u03b9': 'i', '\u03ba': 'k', '\u03bc': 'm', '\u03bd': 'v', '\u03bf': 'o', '\u03c1': 'p', '\u03c4': 't', '\u03c5': 'y', '\u03c7': 'x', '\u03f2': 'c', '\u03f3': 'j',
}));
const ACTIVE_PART = /(?:^|\/)(?:vbaProject\.bin|activeX(?:\/|$)|embeddings(?:\/|$)|oleObject\d*\.bin|customUI(?:\/|$)|macrosheets(?:\/|$))/iu;
const NESTED_ARCHIVE = /\.(?:7z|docm|docx|jar|odt|rar|tar|xlsm|xlsx|zip)$/iu;
const NAME = /^[A-Za-z_][A-Za-z0-9_.:-]*$/u;

function sha256(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}

function reportDigest(value) {
  const bytes = Buffer.from(`${canonical(value)}\n`, 'utf8');
  return { bytes, sha256: sha256(bytes) };
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  if (ArrayBuffer.isView(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function exactPlainObject(value, keys) {
  if (!value || Object.getPrototypeOf(value) !== Object.prototype) return false;
  const actual = Reflect.ownKeys(value);
  return actual.every((key) => typeof key === 'string')
    && actual.every((key) => {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      return descriptor && Object.hasOwn(descriptor, 'value') && descriptor.enumerable === true;
    })
    && JSON.stringify(actual.sort()) === JSON.stringify([...keys].sort());
}

function failure(code, phase, detail = '') {
  return deepFreeze({ ok: false, status: 'REJECTED', error: { code, detail, phase } });
}

function quarantined(code, base, ledger) {
  const report = {
    ...base,
    disposition: 'QUARANTINED',
    lossLedger: ledger,
    semanticProjectionPublished: false,
  };
  const digest = reportDigest(report);
  return deepFreeze({ ok: false, status: 'QUARANTINED', error: { code, detail: '', phase: 'OOXML_POLICY' }, report, bytes: digest.bytes, sha256: digest.sha256 });
}

function budgets(input) {
  if (input === undefined) input = {};
  if (!input || Object.getPrototypeOf(input) !== Object.prototype) return failure('E_PQ_BUDGET_SHAPE', 'INPUT');
  const keys = Reflect.ownKeys(input);
  if (keys.some((key) => typeof key !== 'string' || !LIMIT_KEYS.includes(key))) return failure('E_PQ_BUDGET_FIELD', 'INPUT');
  const effective = {};
  const clamps = [];
  for (const key of LIMIT_KEYS) {
    const requested = input[key] ?? PARSER_QUARANTINE_LIMITS[key];
    if (!Number.isSafeInteger(requested) || requested <= 0) return failure('E_PQ_BUDGET_VALUE', 'INPUT', key);
    effective[key] = Math.min(requested, PARSER_QUARANTINE_LIMITS[key]);
    if (requested > PARSER_QUARANTINE_LIMITS[key]) clamps.push({ key, requested, effective: effective[key] });
  }
  return { ok: true, value: { ceiling: { ...PARSER_QUARANTINE_LIMITS }, effective, clamps } };
}

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function decodeUtf8(bytes, code, phase) {
  try {
    return { ok: true, value: UTF8.decode(bytes) };
  } catch {
    return failure(code, phase);
  }
}

function confusableSkeleton(value) {
  return [...value.normalize('NFKC').toLowerCase()].map((character) => CONFUSABLES.get(character) ?? character).join('');
}

function validatePath(value, limits) {
  if (!value || value !== value.normalize('NFC')) return failure('E_PQ_PATH_NOT_NFC', 'ARCHIVE_PATH');
  if (Buffer.byteLength(value, 'utf8') > limits.maxPathBytes) return failure('E_PQ_PATH_BUDGET', 'ARCHIVE_PATH');
  if (value.includes('\\') || value.startsWith('/') || /^[A-Za-z]:/u.test(value) || /[\u0000-\u001f\u007f]/u.test(value)) return failure('E_PQ_PATH_NOT_POSIX_RELATIVE', 'ARCHIVE_PATH');
  const parts = value.split('/');
  if (parts.some((part) => !part || part === '.' || part === '..')) return failure('E_PQ_PATH_TRAVERSAL', 'ARCHIVE_PATH');
  return { ok: true };
}

function rejectAmbiguousPaths(paths) {
  for (const [code, transform] of [
    ['E_PQ_PATH_CASEFOLD_COLLISION', (value) => value.toLowerCase()],
    ['E_PQ_PATH_CONFUSABLE_COLLISION', confusableSkeleton],
  ]) {
    const seen = new Map();
    for (const value of paths) {
      const key = transform(value);
      if (seen.has(key) && seen.get(key) !== value) return failure(code, 'ARCHIVE_PATH');
      seen.set(key, value);
    }
  }
  return { ok: true };
}

function findEocd(bytes) {
  const offsets = [];
  for (let offset = 0; offset <= bytes.length - 4; offset += 1) if (bytes.readUInt32LE(offset) === ZIP_EOCD) offsets.push(offset);
  if (offsets.length !== 1) return failure(offsets.length === 0 ? 'E_PQ_ZIP_EOCD_MISSING' : 'E_PQ_ZIP_EOCD_AMBIGUOUS', 'ARCHIVE_STRUCTURE');
  return { ok: true, offset: offsets[0] };
}

function inflateEntry(compressed, method, limit) {
  if (method === 0) return { ok: true, value: Buffer.from(compressed) };
  try {
    return { ok: true, value: zlib.inflateRawSync(compressed, { maxOutputLength: limit }) };
  } catch {
    return failure('E_PQ_ZIP_INFLATE', 'ARCHIVE_PAYLOAD');
  }
}

function parseZip(bytes, limits) {
  if (bytes.length > limits.maxArchiveBytes) return failure('E_PQ_ARCHIVE_BYTE_BUDGET', 'ARCHIVE_STRUCTURE');
  const found = findEocd(bytes);
  if (!found.ok) return found;
  const eocd = found.offset;
  if (eocd + 22 > bytes.length) return failure('E_PQ_ZIP_EOCD_TRUNCATED', 'ARCHIVE_STRUCTURE');
  const disk = bytes.readUInt16LE(eocd + 4);
  const centralDisk = bytes.readUInt16LE(eocd + 6);
  const diskEntries = bytes.readUInt16LE(eocd + 8);
  const entryCount = bytes.readUInt16LE(eocd + 10);
  const centralSize = bytes.readUInt32LE(eocd + 12);
  const centralOffset = bytes.readUInt32LE(eocd + 16);
  const commentLength = bytes.readUInt16LE(eocd + 20);
  if (eocd + 22 + commentLength !== bytes.length) return failure('E_PQ_ZIP_TRAILING_BYTES', 'ARCHIVE_STRUCTURE');
  if (disk !== 0 || centralDisk !== 0 || diskEntries !== entryCount) return failure('E_PQ_ZIP_MULTIDISK', 'ARCHIVE_STRUCTURE');
  if (entryCount === 0 || entryCount > limits.maxEntries) return failure('E_PQ_ARCHIVE_ENTRY_BUDGET', 'ARCHIVE_STRUCTURE');
  if (entryCount === 0xffff || centralSize === 0xffffffff || centralOffset === 0xffffffff) return failure('E_PQ_ZIP64_UNSUPPORTED', 'ARCHIVE_STRUCTURE');
  if (centralOffset + centralSize !== eocd) return failure('E_PQ_ZIP_CENTRAL_RANGE', 'ARCHIVE_STRUCTURE');
  const entries = [];
  let cursor = centralOffset;
  let totalInflated = 0;
  const ranges = [];
  for (let index = 0; index < entryCount; index += 1) {
    if (cursor + 46 > eocd || bytes.readUInt32LE(cursor) !== ZIP_CENTRAL) return failure('E_PQ_ZIP_CENTRAL_HEADER', 'ARCHIVE_STRUCTURE');
    const flags = bytes.readUInt16LE(cursor + 8);
    const method = bytes.readUInt16LE(cursor + 10);
    const expectedCrc = bytes.readUInt32LE(cursor + 16);
    const compressedSize = bytes.readUInt32LE(cursor + 20);
    const inflatedSize = bytes.readUInt32LE(cursor + 24);
    const nameLength = bytes.readUInt16LE(cursor + 28);
    const extraLength = bytes.readUInt16LE(cursor + 30);
    const entryCommentLength = bytes.readUInt16LE(cursor + 32);
    const diskStart = bytes.readUInt16LE(cursor + 34);
    const externalAttributes = bytes.readUInt32LE(cursor + 38);
    const localOffset = bytes.readUInt32LE(cursor + 42);
    const centralEnd = cursor + 46 + nameLength + extraLength + entryCommentLength;
    if (centralEnd > eocd) return failure('E_PQ_ZIP_CENTRAL_TRUNCATED', 'ARCHIVE_STRUCTURE');
    if ((flags & 0x0001) !== 0) return failure('E_PQ_ZIP_ENCRYPTED', 'ARCHIVE_STRUCTURE');
    if ((flags & 0x0008) !== 0) return failure('E_PQ_ZIP_DATA_DESCRIPTOR', 'ARCHIVE_STRUCTURE');
    if ((flags & 0x0800) === 0) return failure('E_PQ_ZIP_FILENAME_ENCODING', 'ARCHIVE_STRUCTURE');
    if (![0, 8].includes(method)) return failure('E_PQ_ZIP_COMPRESSION_METHOD', 'ARCHIVE_STRUCTURE');
    if (diskStart !== 0) return failure('E_PQ_ZIP_MULTIDISK', 'ARCHIVE_STRUCTURE');
    if (compressedSize > limits.maxEntryCompressedBytes || inflatedSize > limits.maxEntryInflatedBytes) return failure('E_PQ_ARCHIVE_ENTRY_BYTE_BUDGET', 'ARCHIVE_STRUCTURE');
    const nameBytes = bytes.subarray(cursor + 46, cursor + 46 + nameLength);
    const decoded = decodeUtf8(nameBytes, 'E_PQ_ZIP_FILENAME_UTF8', 'ARCHIVE_PATH');
    if (!decoded.ok) return decoded;
    const name = decoded.value;
    const validPath = validatePath(name, limits);
    if (!validPath.ok) return validPath;
    const unixMode = (externalAttributes >>> 16) & 0xf000;
    if (unixMode === 0xa000) return failure('E_PQ_ZIP_SYMLINK', 'ARCHIVE_PATH');
    if (localOffset + 30 > centralOffset || bytes.readUInt32LE(localOffset) !== ZIP_LOCAL) return failure('E_PQ_ZIP_LOCAL_HEADER', 'ARCHIVE_STRUCTURE');
    const localFlags = bytes.readUInt16LE(localOffset + 6);
    const localMethod = bytes.readUInt16LE(localOffset + 8);
    const localCrc = bytes.readUInt32LE(localOffset + 14);
    const localCompressedSize = bytes.readUInt32LE(localOffset + 18);
    const localInflatedSize = bytes.readUInt32LE(localOffset + 22);
    const localNameLength = bytes.readUInt16LE(localOffset + 26);
    const localExtraLength = bytes.readUInt16LE(localOffset + 28);
    const localName = bytes.subarray(localOffset + 30, localOffset + 30 + localNameLength);
    if (localFlags !== flags || localMethod !== method || localCrc !== expectedCrc || localCompressedSize !== compressedSize || localInflatedSize !== inflatedSize || !localName.equals(nameBytes)) return failure('E_PQ_ZIP_LOCAL_CENTRAL_MISMATCH', 'ARCHIVE_STRUCTURE');
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    const dataEnd = dataStart + compressedSize;
    if (dataEnd > centralOffset) return failure('E_PQ_ZIP_LOCAL_RANGE', 'ARCHIVE_STRUCTURE');
    ranges.push([localOffset, dataEnd]);
    const compressed = bytes.subarray(dataStart, dataEnd);
    const inflated = inflateEntry(compressed, method, limits.maxEntryInflatedBytes);
    if (!inflated.ok) return inflated;
    if (inflated.value.length !== inflatedSize) return failure('E_PQ_ZIP_INFLATED_SIZE_MISMATCH', 'ARCHIVE_PAYLOAD');
    if (crc32(inflated.value) !== expectedCrc) return failure('E_PQ_ZIP_CRC_MISMATCH', 'ARCHIVE_PAYLOAD');
    const ratio = compressedSize === 0 ? (inflatedSize === 0 ? 0 : Number.POSITIVE_INFINITY) : inflatedSize / compressedSize;
    if (ratio > limits.maxCompressionRatio) return failure('E_PQ_ARCHIVE_COMPRESSION_RATIO', 'ARCHIVE_PAYLOAD');
    totalInflated += inflatedSize;
    if (totalInflated > limits.maxTotalInflatedBytes) return failure('E_PQ_ARCHIVE_TOTAL_BYTE_BUDGET', 'ARCHIVE_PAYLOAD');
    if (NESTED_ARCHIVE.test(name) || (inflated.value.length >= 4 && [ZIP_LOCAL, ZIP_CENTRAL, ZIP_EOCD].includes(inflated.value.readUInt32LE(0)))) return failure('E_PQ_NESTED_ARCHIVE', 'ARCHIVE_PAYLOAD');
    entries.push({ name, compressedSize, inflatedSize, method, crc32: expectedCrc, bytes: inflated.value, sha256: sha256(inflated.value) });
    cursor = centralEnd;
  }
  if (cursor !== eocd) return failure('E_PQ_ZIP_CENTRAL_DENOMINATOR', 'ARCHIVE_STRUCTURE');
  ranges.sort((left, right) => left[0] - right[0]);
  for (let index = 1; index < ranges.length; index += 1) if (ranges[index][0] < ranges[index - 1][1]) return failure('E_PQ_ZIP_OVERLAPPING_ENTRY', 'ARCHIVE_STRUCTURE');
  const paths = entries.map((entry) => entry.name);
  if (new Set(paths).size !== paths.length) return failure('E_PQ_PATH_DUPLICATE', 'ARCHIVE_PATH');
  const ambiguity = rejectAmbiguousPaths(paths);
  if (!ambiguity.ok) return ambiguity;
  return { ok: true, entries, summary: { centralDirectoryOffset: centralOffset, centralDirectorySize: centralSize, entryCount, totalInflatedBytes: totalInflated } };
}

function validateEntities(value) {
  const without = value.replace(/&(amp|apos|gt|lt|quot|#[0-9]+|#x[0-9a-f]+);/giu, '');
  return !without.includes('&');
}

function scanTagEnd(text, start) {
  let quote = null;
  for (let cursor = start; cursor < text.length; cursor += 1) {
    const character = text[cursor];
    if (quote) {
      if (character === quote) quote = null;
    } else if (character === '"' || character === "'") quote = character;
    else if (character === '>') return cursor;
  }
  return -1;
}

function parseAttributes(source, limits) {
  const attributes = [];
  let cursor = 0;
  while (cursor < source.length) {
    while (/\s/u.test(source[cursor] ?? '')) cursor += 1;
    if (cursor >= source.length) break;
    const nameMatch = /^[A-Za-z_][A-Za-z0-9_.:-]*/u.exec(source.slice(cursor));
    if (!nameMatch) return failure('E_PQ_XML_ATTRIBUTE_SYNTAX', 'XML_STRUCTURE');
    const name = nameMatch[0];
    cursor += name.length;
    while (/\s/u.test(source[cursor] ?? '')) cursor += 1;
    if (source[cursor] !== '=') return failure('E_PQ_XML_ATTRIBUTE_SYNTAX', 'XML_STRUCTURE');
    cursor += 1;
    while (/\s/u.test(source[cursor] ?? '')) cursor += 1;
    const quote = source[cursor];
    if (quote !== '"' && quote !== "'") return failure('E_PQ_XML_ATTRIBUTE_SYNTAX', 'XML_STRUCTURE');
    const end = source.indexOf(quote, cursor + 1);
    if (end < 0) return failure('E_PQ_XML_ATTRIBUTE_SYNTAX', 'XML_STRUCTURE');
    const value = source.slice(cursor + 1, end);
    if (!validateEntities(value)) return failure('E_PQ_XML_ENTITY_REFERENCE', 'XML_STRUCTURE');
    if (Buffer.byteLength(value, 'utf8') > limits.maxXmlAttributeBytes) return failure('E_PQ_XML_ATTRIBUTE_BYTE_BUDGET', 'XML_BUDGET');
    attributes.push({ name, value });
    cursor = end + 1;
  }
  if (attributes.length > limits.maxXmlAttributes) return failure('E_PQ_XML_ATTRIBUTE_COUNT_BUDGET', 'XML_BUDGET');
  if (new Set(attributes.map((attribute) => attribute.name)).size !== attributes.length) return failure('E_PQ_XML_ATTRIBUTE_DUPLICATE', 'XML_STRUCTURE');
  return { ok: true, attributes };
}

function parseXml(bytes, limits) {
  if (bytes.length === 0 || bytes.length > limits.maxXmlBytes) return failure('E_PQ_XML_BYTE_BUDGET', 'XML_BUDGET');
  const decoded = decodeUtf8(bytes, 'E_PQ_XML_UTF8', 'XML_ENCODING');
  if (!decoded.ok) return decoded;
  let text = decoded.value;
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  if (text !== text.normalize('NFC')) return failure('E_PQ_XML_NOT_NFC', 'XML_ENCODING');
  if (/<!\s*(?:DOCTYPE|ENTITY)\b/iu.test(text)) return failure('E_PQ_XML_DTD_OR_ENTITY_DECLARATION', 'XML_STRUCTURE');
  const stack = [];
  let cursor = 0;
  let nodeCount = 0;
  let attributeCount = 0;
  let textBytes = 0;
  let rootCount = 0;
  let declarationSeen = false;
  while (cursor < text.length) {
    const open = text.indexOf('<', cursor);
    const body = text.slice(cursor, open < 0 ? text.length : open);
    if (!validateEntities(body)) return failure('E_PQ_XML_ENTITY_REFERENCE', 'XML_STRUCTURE');
    textBytes += Buffer.byteLength(body, 'utf8');
    if (textBytes > limits.maxXmlTextBytes) return failure('E_PQ_XML_TEXT_BYTE_BUDGET', 'XML_BUDGET');
    if (stack.length === 0 && body.trim() !== '') return failure('E_PQ_XML_TEXT_OUTSIDE_ROOT', 'XML_STRUCTURE');
    if (open < 0) { cursor = text.length; break; }
    if (text.startsWith('<!--', open)) {
      const end = text.indexOf('-->', open + 4);
      if (end < 0 || text.slice(open + 4, end).includes('--')) return failure('E_PQ_XML_COMMENT', 'XML_STRUCTURE');
      cursor = end + 3;
      continue;
    }
    if (text.startsWith('<![CDATA[', open)) {
      if (stack.length === 0) return failure('E_PQ_XML_CDATA_OUTSIDE_ROOT', 'XML_STRUCTURE');
      const end = text.indexOf(']]>', open + 9);
      if (end < 0) return failure('E_PQ_XML_CDATA', 'XML_STRUCTURE');
      textBytes += Buffer.byteLength(text.slice(open + 9, end), 'utf8');
      if (textBytes > limits.maxXmlTextBytes) return failure('E_PQ_XML_TEXT_BYTE_BUDGET', 'XML_BUDGET');
      cursor = end + 3;
      continue;
    }
    if (text.startsWith('<?', open)) {
      const end = text.indexOf('?>', open + 2);
      if (end < 0) return failure('E_PQ_XML_PROCESSING_INSTRUCTION', 'XML_STRUCTURE');
      const instruction = text.slice(open + 2, end);
      if (open !== 0 || declarationSeen || !/^xml\s+version=(?:"1\.0"|'1\.0')(?:\s+encoding=(?:"UTF-8"|'UTF-8'))?\s*$/u.test(instruction)) return failure('E_PQ_XML_PROCESSING_INSTRUCTION', 'XML_STRUCTURE');
      declarationSeen = true;
      cursor = end + 2;
      continue;
    }
    if (text.startsWith('<!', open)) return failure('E_PQ_XML_DECLARATION', 'XML_STRUCTURE');
    const end = scanTagEnd(text, open + 1);
    if (end < 0) return failure('E_PQ_XML_TAG_TRUNCATED', 'XML_STRUCTURE');
    let raw = text.slice(open + 1, end).trim();
    if (raw.startsWith('/')) {
      const name = raw.slice(1).trim();
      if (!NAME.test(name) || stack.pop() !== name) return failure('E_PQ_XML_TAG_MISMATCH', 'XML_STRUCTURE');
      cursor = end + 1;
      continue;
    }
    const selfClosing = raw.endsWith('/');
    if (selfClosing) raw = raw.slice(0, -1).trimEnd();
    const match = /^([A-Za-z_][A-Za-z0-9_.:-]*)([\s\S]*)$/u.exec(raw);
    if (!match) return failure('E_PQ_XML_TAG_SYNTAX', 'XML_STRUCTURE');
    const attributes = parseAttributes(match[2], limits);
    if (!attributes.ok) return attributes;
    attributeCount += attributes.attributes.length;
    nodeCount += 1;
    if (nodeCount > limits.maxXmlNodes) return failure('E_PQ_XML_NODE_BUDGET', 'XML_BUDGET');
    if (stack.length === 0) rootCount += 1;
    if (!selfClosing) {
      stack.push(match[1]);
      if (stack.length > limits.maxXmlDepth) return failure('E_PQ_XML_DEPTH_BUDGET', 'XML_BUDGET');
    }
    cursor = end + 1;
  }
  if (stack.length !== 0 || rootCount !== 1) return failure('E_PQ_XML_ROOT_OR_CLOSURE', 'XML_STRUCTURE');
  return { ok: true, text, summary: { attributeCount, byteLength: bytes.length, depthLimit: limits.maxXmlDepth, nodeCount, sha256: sha256(bytes), textBytes } };
}

function relationshipElements(text, limits) {
  const elements = [];
  let cursor = 0;
  while (cursor < text.length) {
    const open = text.indexOf('<', cursor);
    if (open < 0) break;
    if (text.startsWith('<!--', open)) {
      cursor = text.indexOf('-->', open + 4) + 3;
      continue;
    }
    if (text.startsWith('<![CDATA[', open)) {
      cursor = text.indexOf(']]>', open + 9) + 3;
      continue;
    }
    if (text.startsWith('<?', open)) {
      cursor = text.indexOf('?>', open + 2) + 2;
      continue;
    }
    const end = scanTagEnd(text, open + 1);
    if (end < 0) return failure('E_PQ_XML_TAG_TRUNCATED', 'OOXML_POLICY');
    let raw = text.slice(open + 1, end).trim();
    cursor = end + 1;
    if (raw.startsWith('/')) continue;
    if (raw.endsWith('/')) raw = raw.slice(0, -1).trimEnd();
    const match = /^([A-Za-z_][A-Za-z0-9_.:-]*)([\s\S]*)$/u.exec(raw);
    if (!match || !/(?:^|:)Relationship$/u.test(match[1])) continue;
    const parsed = parseAttributes(match[2], limits);
    if (!parsed.ok) return parsed;
    elements.push(new Map(parsed.attributes.map((attribute) => [attribute.name.replace(/^.*:/u, ''), attribute.value])));
  }
  return { ok: true, elements };
}

function activeLossLedger(entries, xmlByName, limits) {
  const records = [];
  const add = (code, entry, disposition) => {
    if (records.length >= limits.maxLossRecords) return failure('E_PQ_LOSS_LEDGER_BUDGET', 'OOXML_POLICY');
    records.push({ code, disposition, partSha256: entry.sha256 });
    return { ok: true };
  };
  for (const entry of entries) {
    if (ACTIVE_PART.test(entry.name)) {
      const added = add('ACTIVE_BINARY_PART', entry, 'QUARANTINED');
      if (!added.ok) return added;
    }
    if (entry.name.endsWith('.rels')) {
      const xml = xmlByName.get(entry.name)?.text ?? '';
      const relationships = relationshipElements(xml, limits);
      if (!relationships.ok) return relationships;
      for (const attributes of relationships.elements) {
        if ((attributes.get('TargetMode') ?? '').toLowerCase() === 'external') {
          const added = add('EXTERNAL_RELATIONSHIP', entry, 'QUARANTINED');
          if (!added.ok) return added;
        }
        if (/(?:oleObject|package|attachedTemplate)/iu.test(attributes.get('Type') ?? '')) {
          const added = add('ACTIVE_RELATIONSHIP_TYPE', entry, 'QUARANTINED');
          if (!added.ok) return added;
        }
      }
    }
    if (entry.name === '[Content_Types].xml') {
      const xml = xmlByName.get(entry.name)?.text ?? '';
      if (/(?:macroEnabled|vbaProject|activeX|oleObject)/iu.test(xml)) {
        const added = add('ACTIVE_CONTENT_TYPE', entry, 'QUARANTINED');
        if (!added.ok) return added;
      }
    }
  }
  records.sort((left, right) => canonical(left).localeCompare(canonical(right)));
  return { ok: true, records };
}

function admittedReport({ bytes, format, budgetReport, archive, xmlParts, entries }) {
  const parts = entries.map((entry) => {
    const xml = xmlParts.get(entry.name);
    return {
      byteLength: entry.inflatedSize,
      mediaKind: xml ? 'VALIDATED_XML' : 'VALIDATED_BINARY',
      name: entry.name,
      sha256: entry.sha256,
      ...(xml ? { validatedText: xml.text, xml: xml.summary } : {}),
    };
  });
  const report = {
    schemaVersion: PARSER_QUARANTINE_SCHEMA_VERSION,
    disposition: 'ADMITTED',
    format,
    input: { byteLength: bytes.length, sha256: sha256(bytes) },
    budgets: budgetReport,
    archive,
    parts,
    partDenominator: parts.length,
    lossLedger: [],
    lossLedgerDenominator: 0,
    semanticProjectionPublished: true,
  };
  const digest = reportDigest(report);
  return deepFreeze({ ok: true, status: 'ADMITTED', value: report, bytes: digest.bytes, byteLength: digest.bytes.length, sha256: digest.sha256 });
}

export function inspectParserQuarantine(input = {}) {
  if (!exactPlainObject(input, INPUT_KEYS)) return failure('E_PQ_INPUT_SHAPE', 'INPUT');
  if (!FORMATS.has(input.format)) return failure('E_PQ_FORMAT', 'INPUT');
  if (!(Buffer.isBuffer(input.bytes) || input.bytes instanceof Uint8Array)) return failure('E_PQ_INPUT_BYTES', 'INPUT');
  const byteView = Buffer.from(input.bytes);
  const budgetResult = budgets(input.budgets);
  if (!budgetResult.ok) return budgetResult;
  const limits = budgetResult.value.effective;
  let format = input.format;
  if (format === 'AUTO') {
    if (byteView.length >= 4 && byteView.readUInt32LE(0) === ZIP_LOCAL) format = 'ZIP';
    else if (byteView.subarray(0, 64).toString('utf8').replace(/^\uFEFF/u, '').trimStart().startsWith('<')) format = 'XML';
    else return failure('E_PQ_FORMAT_UNRECOGNIZED', 'INPUT');
  }
  if (format === 'XML') {
    const xml = parseXml(byteView, limits);
    if (!xml.ok) return xml;
    const entry = { name: 'document.xml', inflatedSize: byteView.length, sha256: sha256(byteView) };
    return admittedReport({ bytes: byteView, format, budgetReport: budgetResult.value, archive: null, xmlParts: new Map([[entry.name, xml]]), entries: [entry] });
  }
  const archive = parseZip(byteView, limits);
  if (!archive.ok) return archive;
  if (format === 'ZIP' && archive.entries.some((entry) => entry.name === '[Content_Types].xml')) format = 'OOXML';
  const xmlEntries = archive.entries.filter((entry) => entry.name.endsWith('.xml') || entry.name.endsWith('.rels'));
  if (xmlEntries.length > limits.maxXmlParts) return failure('E_PQ_XML_PART_BUDGET', 'XML_BUDGET');
  const xmlParts = new Map();
  for (const entry of xmlEntries) {
    const xml = parseXml(entry.bytes, limits);
    if (!xml.ok) return xml;
    xmlParts.set(entry.name, xml);
  }
  if (format === 'OOXML') {
    const names = new Set(archive.entries.map((entry) => entry.name));
    if (!names.has('[Content_Types].xml') || !names.has('_rels/.rels')) return failure('E_PQ_OOXML_REQUIRED_PART', 'OOXML_POLICY');
    const ledger = activeLossLedger(archive.entries, xmlParts, limits);
    if (!ledger.ok) return ledger;
    if (ledger.records.length > 0) {
      return quarantined('E_PQ_OOXML_ACTIVE_CONTENT', {
        schemaVersion: PARSER_QUARANTINE_SCHEMA_VERSION,
        format,
        input: { byteLength: byteView.length, sha256: sha256(byteView) },
        budgets: budgetResult.value,
        archive: archive.summary,
        partDenominator: archive.entries.length,
        lossLedgerDenominator: ledger.records.length,
      }, ledger.records);
    }
  }
  return admittedReport({ bytes: byteView, format, budgetReport: budgetResult.value, archive: archive.summary, xmlParts, entries: archive.entries });
}

export const PARSER_QUARANTINE_INTERNALS_FOR_TEST = Object.freeze({ crc32, confusableSkeleton });
