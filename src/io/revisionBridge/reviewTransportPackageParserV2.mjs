import {
  RTK_RETURNED_REVIEW_ANALYSIS_V2_SCHEMA,
  RTK_REVIEW_IR_V2_SCHEMA,
  RTK_V6_BUDGETS,
  stableJson,
} from './reviewTransportCore.mjs';

import {
  crc32,
  resolveEffectiveBudgets,
  effectiveBudgetDigest,
  evaluateZipCrcEvidence,
  RTK_ZIP_PROFILE_DEFAULTS_V6,
  RTK_ZIP_CEILING_DECLARED,
} from './reviewTransportZipEvidenceV1.mjs';

export const RTK_REVIEW_TRANSPORT_PACKAGE_PARSER_V2_PROFILE =
  'yalken.rtk.package-aware-review-ir-parser.v2.b02';
export const RTK_REVIEW_TRANSPORT_PACKAGE_PARSER_V2_BUILD =
  'bounded-namespace-package-scanner-quote-aware-entities-budgets-c3';
export const RTK_REVIEW_TRANSPORT_AUTHORITY_CARRIER_V2_SCHEMA =
  'yalken.rtk.review-transport-authority-carrier.v2';
export const RTK_REVIEW_TRANSPORT_AUTHORITY_CUSTOM_PROPERTY_NAMES = Object.freeze([
  'YRTK_C01_AUTH',
]);

const W_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const REL_NS = 'http://schemas.openxmlformats.org/package/2006/relationships';
const CONTENT_TYPES_NS = 'http://schemas.openxmlformats.org/package/2006/content-types';
const W15_NS = 'http://schemas.microsoft.com/office/word/2012/wordml';
const W16CID_NS = 'http://schemas.microsoft.com/office/word/2016/wordml/cid';
const SIGNED_SHA256_RE = /^sha256:[a-f0-9]{64}$/u;
const HMAC_RE = /^hmac-sha256:[a-f0-9]{64}$/u;

const REQUIRED_PARTS = Object.freeze(['word/document.xml']);
const CORE_PARTS = Object.freeze([
  '[Content_Types].xml',
  '_rels/.rels',
  'word/_rels/document.xml.rels',
  'word/document.xml',
  'word/comments.xml',
  'word/commentsExtended.xml',
  'word/commentsExtensible.xml',
  'word/commentsIds.xml',
  'word/people.xml',
  'docProps/custom.xml',
]);
const KNOWN_ADVISORY_PARTS = Object.freeze([
  'word/styles.xml',
  'word/numbering.xml',
  'word/settings.xml',
  'word/fontTable.xml',
  'word/webSettings.xml',
  'docProps/core.xml',
  'docProps/app.xml',
]);
const ACTIVE_RELATIONSHIP_MARKERS = Object.freeze([
  'vbaProject',
  'oleObject',
  'activeX',
  'attachedTemplate',
]);
const ACTIVE_CONTENT_TYPE_MARKERS = Object.freeze([
  'vbaProject',
  'oleObject',
  'activeX',
]);
const DOCUMENT_UNSUPPORTED_ELEMENTS = Object.freeze([
  'altChunk',
  'AlternateContent',
  'object',
  'drawing',
  'pict',
  'tbl',
  'sectPr',
  'footnoteReference',
  'endnoteReference',
  'fldSimple',
  'instrText',
]);

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function rawString(value) {
  return typeof value === 'string' ? value : String(value ?? '');
}

function cloneJsonSafe(value) {
  return JSON.parse(JSON.stringify(value));
}

function reason(code, field, message, details = {}) {
  return { code, field, message, ...details };
}

// Resolve the effective budget object via the shared min-clamp resolver
// (F-11/P1-02). profileDefaults are the V6 values; ceilings are the declared
// product max (50k for counts, 64 MiB worker output). Caller requests above a
// ceiling are clamped and recorded — never silently widened.
function normalizeBudgets(input = {}) {
  const { effective, clampedFields } = resolveEffectiveBudgets({
    requested: input,
    profileDefaults: RTK_ZIP_PROFILE_DEFAULTS_V6,
    ceiling: RTK_ZIP_CEILING_DECLARED,
  });
  return effective;
}

function resolveBudgetsWithClamps(input = {}) {
  return resolveEffectiveBudgets({
    requested: input,
    profileDefaults: RTK_ZIP_PROFILE_DEFAULTS_V6,
    ceiling: RTK_ZIP_CEILING_DECLARED,
  });
}

function resolveCryptoPort(port) {
  const missing = [];
  for (const key of ['sha256Text', 'sha256Json', 'byteLength']) {
    if (typeof port?.[key] !== 'function') missing.push(key);
  }
  return {
    ok: missing.length === 0,
    missing,
    sha256Text: port?.sha256Text?.bind(port),
    sha256Json: port?.sha256Json?.bind(port),
    byteLength: port?.byteLength?.bind(port),
    hmacSha256Json: typeof port?.hmacSha256Json === 'function' ? port.hmacSha256Json.bind(port) : null,
    crc32: typeof port?.crc32 === 'function' ? port.crc32.bind(port) : null,
  };
}

function charIsName(value) {
  const code = value.charCodeAt(0);
  return (code >= 65 && code <= 90)
    || (code >= 97 && code <= 122)
    || (code >= 48 && code <= 57)
    || value === '_' || value === '-' || value === '.' || value === ':';
}

function readName(text, cursor) {
  let index = cursor;
  while (index < text.length && charIsName(text[index])) index += 1;
  return { value: text.slice(cursor, index), next: index };
}

function isValidXmlCharCode(codePoint) {
  return codePoint === 0x9
    || codePoint === 0xa
    || codePoint === 0xd
    || (codePoint >= 0x20 && codePoint <= 0xd7ff)
    || (codePoint >= 0xe000 && codePoint <= 0xfffd)
    || (codePoint >= 0x10000 && codePoint <= 0x10ffff);
}

function splitQName(qName) {
  const text = rawString(qName);
  const colon = text.indexOf(':');
  if (colon < 0) return { prefix: '', localName: text };
  return {
    prefix: text.slice(0, colon),
    localName: text.slice(colon + 1),
  };
}

function decodeEntityBody(entityBody) {
  if (entityBody === 'lt') return { ok: true, value: '<' };
  if (entityBody === 'gt') return { ok: true, value: '>' };
  if (entityBody === 'amp') return { ok: true, value: '&' };
  if (entityBody === 'quot') return { ok: true, value: '"' };
  if (entityBody === 'apos') return { ok: true, value: "'" };
  if (entityBody.startsWith('#x') || entityBody.startsWith('#X')) {
    const hex = entityBody.slice(2);
    if (!hex || ![...hex].every((char) => /[0-9a-fA-F]/u.test(char))) {
      return { ok: false, value: '' };
    }
    const codePoint = Number.parseInt(hex, 16);
    if (!Number.isSafeInteger(codePoint) || !isValidXmlCharCode(codePoint)) return { ok: false, value: '' };
    return { ok: true, value: String.fromCodePoint(codePoint) };
  }
  if (entityBody.startsWith('#')) {
    const decimal = entityBody.slice(1);
    if (!decimal || ![...decimal].every((char) => char >= '0' && char <= '9')) {
      return { ok: false, value: '' };
    }
    const codePoint = Number.parseInt(decimal, 10);
    if (!Number.isSafeInteger(codePoint) || !isValidXmlCharCode(codePoint)) return { ok: false, value: '' };
    return { ok: true, value: String.fromCodePoint(codePoint) };
  }
  return { ok: false, value: '' };
}

function decodeEntities(text, diagnostics = null, field = 'xml.text') {
  const source = rawString(text);
  let output = '';
  let cursor = 0;
  while (cursor < source.length) {
    const amp = source.indexOf('&', cursor);
    if (amp < 0) {
      output += source.slice(cursor);
      break;
    }
    output += source.slice(cursor, amp);
    const semi = source.indexOf(';', amp + 1);
    if (semi < 0) {
      diagnostics?.push(reason('RTK_XML_MALFORMED_BLOCKED', field, 'XML entity reference is not terminated.'));
      output += source.slice(amp);
      break;
    }
    const body = source.slice(amp + 1, semi);
    const decoded = decodeEntityBody(body);
    if (!decoded.ok) {
      diagnostics?.push(reason('RTK_XML_MALFORMED_BLOCKED', field, 'XML entity reference is invalid or unsupported.', {
        entity: `&${body};`,
      }));
      output += source.slice(amp, semi + 1);
    } else {
      output += decoded.value;
    }
    cursor = semi + 1;
  }
  return output;
}

function createParserBudgetState(budgets, cryptoPort) {
  return {
    budgets,
    cryptoPort,
    blocks: 0,
    revisions: 0,
    comments: 0,
    candidates: 0,
    workerOutputBytes: 0,
    exceededCodes: new Set(),
  };
}

function budgetExceededReason(field, message, details = {}) {
  return reason('RTK_BUDGET_EXCEEDED', field, message, details);
}

function recordBudgetExceeded(state, diagnostics, key, field, message, details = {}) {
  const token = `${key}:${field}`;
  if (!state.exceededCodes.has(token)) {
    diagnostics.push(budgetExceededReason(field, message, details));
    state.exceededCodes.add(token);
  }
}

function admitBudgetCount(state, diagnostics, key, limit, field, message) {
  state[key] += 1;
  if (state[key] > limit) {
    recordBudgetExceeded(state, diagnostics, key, field, message, {
      actual: state[key],
      limit,
    });
    return false;
  }
  return true;
}

function admitWorkerOutput(state, diagnostics, field, value) {
  const bytes = state.cryptoPort.byteLength(stableJson(value));
  if (state.workerOutputBytes + bytes > state.budgets.maxWorkerOutputBytes) {
    recordBudgetExceeded(
      state,
      diagnostics,
      'workerOutputBytes',
      field,
      'Parser worker output budget exceeded before semantic accumulation.',
      {
        actual: state.workerOutputBytes + bytes,
        limit: state.budgets.maxWorkerOutputBytes,
      },
    );
    return false;
  }
  state.workerOutputBytes += bytes;
  return true;
}

function parseRawAttributes(attrText, budgets, cryptoPort, partName) {
  const attributes = [];
  const diagnostics = [];
  let cursor = 0;
  while (cursor < attrText.length) {
    while (cursor < attrText.length && attrText[cursor].trim() === '') cursor += 1;
    if (cursor >= attrText.length || attrText[cursor] === '/') break;
    const name = readName(attrText, cursor);
    if (!name.value) {
      diagnostics.push(reason('RTK_XML_MALFORMED_BLOCKED', `${partName}.attributes`, 'XML attribute name is malformed.'));
      break;
    }
    cursor = name.next;
    while (cursor < attrText.length && attrText[cursor].trim() === '') cursor += 1;
    if (attrText[cursor] !== '=') {
      diagnostics.push(reason('RTK_XML_MALFORMED_BLOCKED', `${partName}.attributes.${name.value}`, 'XML attribute is missing equals sign.'));
      break;
    }
    cursor += 1;
    while (cursor < attrText.length && attrText[cursor].trim() === '') cursor += 1;
    const quote = attrText[cursor];
    if (quote !== '"' && quote !== "'") {
      diagnostics.push(reason('RTK_XML_MALFORMED_BLOCKED', `${partName}.attributes.${name.value}`, 'XML attribute value must be quoted.'));
      break;
    }
    cursor += 1;
    const start = cursor;
    while (cursor < attrText.length && attrText[cursor] !== quote) cursor += 1;
    if (cursor >= attrText.length) {
      diagnostics.push(reason('RTK_XML_MALFORMED_BLOCKED', `${partName}.attributes.${name.value}`, 'XML attribute quote is not closed.'));
      break;
    }
    const value = decodeEntities(attrText.slice(start, cursor), diagnostics, `${partName}.attributes.${name.value}`);
    cursor += 1;
    if (attributes.length >= budgets.maxAttributes) {
      diagnostics.push(reason('RTK_BUDGET_EXCEEDED', `${partName}.attributes`, 'XML attribute budget exceeded.'));
      continue;
    }
    if (cryptoPort.byteLength(value) > budgets.maxAttributeBytes) {
      diagnostics.push(reason(
        'RTK_BUDGET_EXCEEDED',
        `${partName}.attributes.${name.value}`,
        'XML attribute byte budget exceeded.',
      ));
      continue;
    }
    const split = splitQName(name.value);
    attributes.push({
      qName: name.value,
      prefix: split.prefix,
      localName: split.localName,
      value,
    });
  }
  return { attributes, diagnostics };
}

function bindAttributes(attributes, nsMap) {
  const attrsByLocal = {};
  const attrsByQName = {};
  const attrsByNs = {};
  const bound = attributes.map((attribute) => {
    const namespaceUri = attribute.prefix ? rawString(nsMap[attribute.prefix]) : '';
    const item = { ...attribute, namespaceUri };
    attrsByLocal[item.localName] = item.value;
    attrsByQName[item.qName] = item.value;
    attrsByNs[`${item.namespaceUri}|${item.localName}`] = item.value;
    return item;
  }).sort((left, right) => (
    `${left.namespaceUri}|${left.localName}|${left.qName}`.localeCompare(
      `${right.namespaceUri}|${right.localName}|${right.qName}`,
    )
  ));
  return { attributes: bound, attrsByLocal, attrsByQName, attrsByNs };
}

function applyNamespaceDeclarations(parentMap, attributes) {
  const next = { ...parentMap };
  for (const attribute of attributes) {
    if (attribute.qName === 'xmlns') next[''] = attribute.value;
    if (attribute.prefix === 'xmlns') next[attribute.localName] = attribute.value;
  }
  return next;
}

function skipSpecialXml(text, open) {
  if (text.startsWith('<!--', open)) {
    const close = text.indexOf('-->', open + 4);
    return close < 0 ? -1 : close + 3;
  }
  if (text.startsWith('<![CDATA[', open)) {
    const close = text.indexOf(']]>', open + 9);
    return close < 0 ? -1 : close + 3;
  }
  return 0;
}

function readMarkupDeclarationName(text, open) {
  let cursor = open + 2;
  while (cursor < text.length && text[cursor].trim() === '') cursor += 1;
  const name = readName(text, cursor);
  return name.value.toUpperCase();
}

function findXmlTagClose(text, open, diagnostics = null, partName = 'xml') {
  let quote = '';
  for (let cursor = open + 1; cursor < text.length; cursor += 1) {
    const char = text[cursor];
    if (quote) {
      if (char === quote) quote = '';
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (char === '>') return cursor;
    if (char === '<') {
      diagnostics?.push(reason('RTK_XML_MALFORMED_BLOCKED', partName, 'XML tag contains an unescaped opening bracket.'));
      return -1;
    }
  }
  diagnostics?.push(reason(
    'RTK_XML_MALFORMED_BLOCKED',
    partName,
    quote ? 'XML tag quote is not closed.' : 'XML tag is not closed.',
  ));
  return -1;
}

function rawTagLocalName(raw) {
  const nameStart = raw.startsWith('/') ? 1 : 0;
  return splitQName(readName(raw, nameStart).value).localName;
}

function parseXmlPart(partName, xml, budgets, cryptoPort, budgetState = null) {
  const text = rawString(xml);
  const tokens = [];
  const diagnostics = [];
  const stack = [];
  let cursor = 0;
  let stopForBudget = false;
  while (cursor < text.length) {
    const open = text.indexOf('<', cursor);
    if (open < 0) {
      decodeEntities(text.slice(cursor), diagnostics, `${partName}.text`);
      break;
    }
    decodeEntities(text.slice(cursor, open), diagnostics, `${partName}.text`);
    const specialSkip = skipSpecialXml(text, open);
    if (specialSkip < 0) {
      diagnostics.push(reason('RTK_XML_MALFORMED_BLOCKED', partName, 'XML special block is not closed.'));
      break;
    }
    if (specialSkip > 0) {
      cursor = specialSkip;
      continue;
    }
    const declarationName = readMarkupDeclarationName(text, open);
    if (declarationName === 'DOCTYPE' || declarationName === 'ENTITY') {
      diagnostics.push(reason('RTK_HOSTILE_PACKAGE_BLOCKED', partName, 'DTD or entity declaration is blocked.'));
      const declarationClose = text.indexOf('>', open + 2);
      cursor = declarationClose < 0 ? text.length : declarationClose + 1;
      continue;
    }
    const close = findXmlTagClose(text, open, diagnostics, partName);
    if (close < 0) {
      break;
    }
    const raw = text.slice(open + 1, close).trim();
    cursor = close + 1;
    if (!raw) continue;
    const rawUpper = raw.toUpperCase();
    if (rawUpper.startsWith('!DOCTYPE') || rawUpper.startsWith('!ENTITY')) {
      diagnostics.push(reason('RTK_HOSTILE_PACKAGE_BLOCKED', partName, 'DTD or entity declaration is blocked.'));
      continue;
    }
    if (raw.startsWith('!') || raw.startsWith('?')) continue;

    const closing = raw.startsWith('/');
    const selfClosing = raw.endsWith('/');
    const nameStart = closing ? 1 : 0;
    const parsedName = readName(raw, nameStart);
    if (!parsedName.value) {
      diagnostics.push(reason('RTK_XML_MALFORMED_BLOCKED', partName, 'XML element name is missing.'));
      continue;
    }
    const qName = parsedName.value;
    const split = splitQName(qName);
    if (budgetState && !closing && partName === 'word/document.xml') {
      if (split.localName === 'p') {
        stopForBudget = stopForBudget || !admitBudgetCount(
          budgetState,
          diagnostics,
          'blocks',
          budgets.maxBlocks,
          `${partName}.blocks`,
          'Block budget exceeded while scanning document XML.',
        );
      }
      if (['ins', 'del', 'moveFrom', 'moveTo', 'rPrChange', 'pPrChange', 'numPrChange'].includes(split.localName)) {
        stopForBudget = stopForBudget || !admitBudgetCount(
          budgetState,
          diagnostics,
          'revisions',
          budgets.maxRevisions,
          `${partName}.revisions`,
          'Revision budget exceeded while scanning document XML.',
        );
      }
    }
    if (budgetState && !closing && partName === 'word/comments.xml' && split.localName === 'comment') {
      stopForBudget = stopForBudget || !admitBudgetCount(
        budgetState,
        diagnostics,
        'comments',
        budgets.maxComments,
        `${partName}.comments`,
        'Comment budget exceeded while scanning comments XML.',
      );
    }
    if (stopForBudget) break;
    const parentMap = stack.length > 0 ? stack[stack.length - 1].nsMap : {};
    if (closing) {
      const last = stack.pop();
      if (!last || last.localName !== split.localName) {
        diagnostics.push(reason('RTK_XML_MALFORMED_BLOCKED', partName, 'XML close tag does not match open tag.', {
          elementName: split.localName,
        }));
      } else {
        last.closeStart = open;
        last.closeEnd = close + 1;
        tokens.push(last);
      }
      continue;
    }

    const attrParse = parseRawAttributes(raw.slice(parsedName.next), budgets, cryptoPort, partName);
    diagnostics.push(...attrParse.diagnostics);
    const nsMap = applyNamespaceDeclarations(parentMap, attrParse.attributes);
    const namespaceUri = rawString(nsMap[split.prefix || '']);
    const boundAttrs = bindAttributes(attrParse.attributes, nsMap);
    const token = {
      partName,
      qName,
      localName: split.localName,
      namespaceUri,
      attributes: boundAttrs.attributes,
      attrsByLocal: boundAttrs.attrsByLocal,
      attrsByQName: boundAttrs.attrsByQName,
      attrsByNs: boundAttrs.attrsByNs,
      selfClosing,
      openStart: open,
      openEnd: close + 1,
      closeStart: close,
      closeEnd: close + 1,
      depth: stack.length,
      path: [...stack.map((item) => item.localName), split.localName],
      nsMap,
    };
    if (stack.length + 1 > budgets.maxXmlDepth) {
      diagnostics.push(reason('RTK_BUDGET_EXCEEDED', `${partName}.xmlDepth`, 'XML depth budget exceeded.'));
      break;
    }
    if (selfClosing) tokens.push(token);
    else stack.push(token);
  }
  if (stack.length > 0) {
    diagnostics.push(reason('RTK_XML_MALFORMED_BLOCKED', partName, 'XML has unclosed elements.'));
  }
  return { partName, tokens, diagnostics };
}

function elementBody(xml, token) {
  if (!token || token.selfClosing) return '';
  return rawString(xml).slice(token.openEnd, token.closeStart);
}

function stripTagsToText(xml) {
  const text = rawString(xml);
  let output = '';
  let cursor = 0;
  while (cursor < text.length) {
    const open = text.indexOf('<', cursor);
    if (open < 0) {
      output += text.slice(cursor);
      break;
    }
    output += text.slice(cursor, open);
    const specialSkip = skipSpecialXml(text, open);
    if (specialSkip < 0) break;
    if (specialSkip > 0) {
      cursor = specialSkip;
      continue;
    }
    const close = findXmlTagClose(text, open);
    if (close < 0) break;
    const local = rawTagLocalName(text.slice(open + 1, close).trim());
    if (local === 'tab') output += '\t';
    if (local === 'br' || local === 'cr') output += '\n';
    cursor = close + 1;
  }
  return decodeEntities(output);
}

function normalizeRanges(ranges) {
  return (Array.isArray(ranges) ? ranges : [])
    .filter((range) => (
      Number.isSafeInteger(range?.start)
      && Number.isSafeInteger(range?.end)
      && range.end > range.start
    ))
    .sort((left, right) => left.start - right.start || left.end - right.end);
}

function appendTextOutsideRanges(output, source, start, end, skipRanges) {
  let cursor = start;
  for (const range of skipRanges) {
    if (range.end <= cursor) continue;
    if (range.start >= end) break;
    if (range.start > cursor) output += source.slice(cursor, Math.min(range.start, end));
    cursor = Math.max(cursor, range.end);
    if (cursor >= end) break;
  }
  if (cursor < end) output += source.slice(cursor, end);
  return output;
}

function positionInsideRanges(position, ranges) {
  return ranges.some((range) => position >= range.start && position < range.end);
}

function stripTagsToTextOutsideRanges(xml, ranges) {
  const text = rawString(xml);
  const skipRanges = normalizeRanges(ranges);
  let output = '';
  let cursor = 0;
  while (cursor < text.length) {
    const open = text.indexOf('<', cursor);
    if (open < 0) {
      output = appendTextOutsideRanges(output, text, cursor, text.length, skipRanges);
      break;
    }
    output = appendTextOutsideRanges(output, text, cursor, open, skipRanges);
    const specialSkip = skipSpecialXml(text, open);
    if (specialSkip < 0) break;
    if (specialSkip > 0) {
      cursor = specialSkip;
      continue;
    }
    const close = findXmlTagClose(text, open);
    if (close < 0) break;
    const local = rawTagLocalName(text.slice(open + 1, close).trim());
    if (!positionInsideRanges(open, skipRanges)) {
      if (local === 'tab') output += '\t';
      if (local === 'br' || local === 'cr') output += '\n';
    }
    cursor = close + 1;
  }
  return decodeEntities(output);
}

function trackedRejectedText(documentXml, documentScan) {
  const insertedRanges = documentScan.tokens
    .filter((token) => isWordToken(token, 'ins'))
    .map((token) => ({ start: token.openStart, end: token.closeEnd }));
  return stripTagsToTextOutsideRanges(documentXml, insertedRanges);
}

function wordDocumentText(documentXml, documentScan, options = {}) {
  const insertedRanges = options.skipInsertedRevisions === true
    ? normalizeRanges(documentScan.tokens
      .filter((token) => isWordToken(token, 'ins'))
      .map((token) => ({ start: token.openStart, end: token.closeEnd })))
    : [];
  let output = '';
  const textTokens = documentScan.tokens
    .filter((token) => ['t', 'delText', 'tab', 'br', 'cr'].includes(token.localName))
    .sort((left, right) => left.openStart - right.openStart || left.closeEnd - right.closeEnd);
  for (const token of textTokens) {
    if (positionInsideRanges(token.openStart, insertedRanges)) continue;
    if (token.localName === 'tab') output += '\t';
    else if (token.localName === 'br' || token.localName === 'cr') output += '\n';
    else output += decodeEntities(elementBody(documentXml, token));
  }
  return output;
}

function tokenText(xml, token) {
  return stripTagsToText(elementBody(xml, token)).trim();
}

function attr(token, localName, namespaceUri = '') {
  if (!token) return '';
  if (namespaceUri) return rawString(token.attrsByNs?.[`${namespaceUri}|${localName}`]);
  return rawString(token.attrsByLocal?.[localName]);
}

function normalizePartMap(parts = {}) {
  if (parts instanceof Map) return Object.fromEntries(parts.entries());
  if (Array.isArray(parts)) {
    return Object.fromEntries(parts
      .filter((part) => part && typeof part === 'object' && !Array.isArray(part))
      .map((part) => [rawString(part.name), part.value]));
  }
  return isPlainObject(parts) ? parts : {};
}

function hasPathTraversal(partName) {
  const normalized = rawString(partName).split('\\').join('/');
  if (!normalized || normalized.startsWith('/')) return true;
  const pieces = normalized.split('/');
  return pieces.some((piece) => piece === '..' || piece === '');
}

function normalizePackageParts(parts, budgets, cryptoPort) {
  const admittedParts = {};
  const reasons = [];
  let totalBytes = 0;
  for (const [rawName, rawValue] of Object.entries(normalizePartMap(parts))) {
    const partName = rawString(rawName).split('\\').join('/');
    if (hasPathTraversal(partName)) {
      reasons.push(reason('RTK_HOSTILE_PACKAGE_BLOCKED', `parts.${partName}`, 'Package part path is unsafe.', {
        partName,
      }));
      continue;
    }
    const text = rawString(rawValue);
    const bytes = cryptoPort.byteLength(text);
    totalBytes += bytes;
    if (bytes > budgets.maxInflatedPartBytes) {
      reasons.push(reason('RTK_BUDGET_EXCEEDED', `parts.${partName}`, 'Inflated part exceeds V6 budget.', {
        partName,
        actual: bytes,
        limit: budgets.maxInflatedPartBytes,
      }));
      continue;
    }
    admittedParts[partName] = text;
  }
  if (totalBytes > budgets.maxTotalInflatedBytes) {
    reasons.push(reason('RTK_BUDGET_EXCEEDED', 'parts', 'Total inflated package bytes exceed V6 budget.', {
      actual: totalBytes,
      limit: budgets.maxTotalInflatedBytes,
    }));
  }
  return { admittedParts, reasons, totalBytes };
}

function isKnownAdvisoryPart(partName) {
  if (CORE_PARTS.includes(partName) || KNOWN_ADVISORY_PARTS.includes(partName)) return true;
  if (partName.startsWith('word/header') && partName.endsWith('.xml')) return true;
  if (partName.startsWith('word/footer') && partName.endsWith('.xml')) return true;
  if (partName === 'word/footnotes.xml' || partName === 'word/endnotes.xml') return true;
  if (partName.startsWith('word/theme/') && partName.endsWith('.xml')) return true;
  return partName.endsWith('.rels') && (partName.startsWith('_rels/') || partName.includes('/_rels/'));
}

function collectOpaqueUnsupportedParts(partNames) {
  const unsupported = [];
  for (const partName of partNames) {
    if (!isKnownAdvisoryPart(partName)) {
      unsupported.push({
        kind: 'unknown-part',
        partName,
        elementName: '',
        relationshipId: '',
        typedDiagnostic: 'RTK_OPAQUE_UNSUPPORTED_PART',
        preservationPolicy: 'preserve-evidence-and-report-loss',
        writerAuthorityImpact: 'blocking',
      });
      continue;
    }
    if (!CORE_PARTS.includes(partName) && !partName.endsWith('.rels') && partName !== '[Content_Types].xml') {
      unsupported.push({
        kind: 'known-unsupported-part',
        partName,
        elementName: '',
        relationshipId: '',
        typedDiagnostic: 'RTK_OPAQUE_UNSUPPORTED_KNOWN_PART',
        preservationPolicy: 'inventory-only-manual-review',
        writerAuthorityImpact: 'inventory-only',
      });
    }
    if (partName === 'word/commentsExtensible.xml') {
      unsupported.push({
        kind: 'modern-comment-extensible-inventory',
        partName,
        elementName: 'commentsExtensible',
        relationshipId: '',
        typedDiagnostic: 'RTK_MODERN_COMMENT_EXTENSIBLE_NOT_CERTIFIED',
        preservationPolicy: 'inventory-only-until-physical-semantic-readback',
        writerAuthorityImpact: 'inventory-only',
      });
    }
  }
  return unsupported;
}

function parseRelationshipParts(parts, budgets, cryptoPort) {
  const relationships = [];
  const reasons = [];
  for (const [partName, xml] of Object.entries(parts)) {
    if (!partName.endsWith('.rels')) continue;
    const scan = parseXmlPart(partName, xml, budgets, cryptoPort);
    reasons.push(...scan.diagnostics);
    for (const token of scan.tokens.filter((item) => item.localName === 'Relationship')) {
      const item = {
        partName,
        id: attr(token, 'Id'),
        type: attr(token, 'Type'),
        target: attr(token, 'Target'),
        targetMode: attr(token, 'TargetMode'),
      };
      relationships.push(item);
      if (item.targetMode.toLowerCase() === 'external') {
        reasons.push(reason('RTK_HOSTILE_PACKAGE_BLOCKED', `${partName}.${item.id}`, 'External relationship is blocked.', item));
      }
      if (item.target.includes('..') || item.target.startsWith('/')) {
        reasons.push(reason('RTK_HOSTILE_PACKAGE_BLOCKED', `${partName}.${item.id}`, 'Relationship target path is unsafe.', item));
      }
      if (ACTIVE_RELATIONSHIP_MARKERS.some((marker) => item.type.includes(marker) || item.target.includes(marker))) {
        reasons.push(reason('RTK_HOSTILE_PACKAGE_BLOCKED', `${partName}.${item.id}`, 'Active relationship is blocked.', item));
      }
    }
  }
  return { relationships, reasons };
}

function parseContentTypes(partXml, budgets, cryptoPort) {
  const contentTypes = [];
  const reasons = [];
  if (!rawString(partXml)) return { contentTypes, reasons };
  const scan = parseXmlPart('[Content_Types].xml', partXml, budgets, cryptoPort);
  reasons.push(...scan.diagnostics);
  for (const token of scan.tokens.filter((item) => item.localName === 'Override' || item.localName === 'Default')) {
    const item = {
      elementName: token.localName,
      partName: attr(token, 'PartName'),
      extension: attr(token, 'Extension'),
      contentType: attr(token, 'ContentType'),
    };
    contentTypes.push(item);
    if (ACTIVE_CONTENT_TYPE_MARKERS.some((marker) => item.contentType.includes(marker))) {
      reasons.push(reason('RTK_HOSTILE_PACKAGE_BLOCKED', '[Content_Types].xml', 'Active content type is blocked.', item));
    }
  }
  return { contentTypes, reasons };
}

function evaluateZipInventory(inventory = {}, parts = {}, cryptoPort, maxZipEntries) {
  const reasons = [];
  const entries = Array.isArray(inventory.entries) ? inventory.entries.filter(isPlainObject) : [];
  const effectiveMaxZipEntries = Number.isSafeInteger(maxZipEntries) && maxZipEntries > 0
    ? maxZipEntries
    : RTK_V6_BUDGETS.maxZipEntries;
  if (entries.length > effectiveMaxZipEntries) {
    reasons.push(reason('RTK_BUDGET_EXCEEDED', 'zip.entries', 'ZIP entry count exceeds effective budget.', {
      actual: entries.length,
      limit: effectiveMaxZipEntries,
    }));
  }
  if (Number(inventory.fakeEocdCount || 0) > 0 || Number(inventory.eocdCount || 1) > 1) {
    reasons.push(reason('RTK_ZIP_FAKE_EOCD', 'zip.eocd', 'Fake or duplicate EOCD marker is blocked.'));
  }
  const ranges = [];
  for (const entry of entries) {
    const partName = rawString(entry.name);
    // Shared CRC evidence evaluation: central-vs-local divergence, missing
    // evidence, and actual recompute via the bounded crc32 implementation
    // (NOT the sha-only cryptoPort). Actual recompute is REQUIRED (Z1) and
    // missing evidence is a rejection (Z3), never a silent skip.
    reasons.push(...evaluateZipCrcEvidence(entry, parts, crc32));
    const start = Number(entry.dataStart ?? entry.start);
    const end = Number(entry.dataEnd ?? entry.end);
    for (const previous of ranges) {
      if (
        Number.isFinite(start)
        && Number.isFinite(end)
        && Number.isFinite(previous.start)
        && Number.isFinite(previous.end)
        && Math.max(start, previous.start) < Math.min(end, previous.end)
      ) {
        reasons.push(reason('RTK_ZIP_REGION_OVERLAP', `zip.${partName}.range`, 'ZIP entry byte ranges overlap.', {
          partName,
          overlaps: previous.name,
        }));
      }
    }
    ranges.push({ name: partName, start, end });
  }
  return reasons;
}

function provenance(token) {
  return {
    partName: token.partName,
    elementName: token.localName,
    namespaceUri: token.namespaceUri,
    openStart: token.openStart,
    closeEnd: token.closeEnd,
    attributes: cloneJsonSafe(token.attributes),
  };
}

function isWordToken(token, localName) {
  return token.localName === localName && (!token.namespaceUri || token.namespaceUri === W_NS);
}

function tokenDigest(cryptoPort, payload) {
  return cryptoPort.sha256Json(payload);
}

function normalizeHmac(value) {
  const text = rawString(value).trim().toLowerCase();
  if (HMAC_RE.test(text)) return text;
  if (/^[a-f0-9]{64}$/u.test(text)) return `hmac-sha256:${text}`;
  return '';
}

function base64UrlDecodeText(value) {
  const text = rawString(value);
  if (!text.startsWith('YRTK1.')) {
    return { ok: false, code: 'RTK_AUTHORITY_CARRIER_BAD_PREFIX', value: '' };
  }
  if (typeof globalThis.atob !== 'function' || typeof globalThis.TextDecoder !== 'function') {
    return { ok: false, code: 'RTK_AUTHORITY_CARRIER_DECODE_UNAVAILABLE', value: '' };
  }
  try {
    const encoded = text.slice('YRTK1.'.length).split('-').join('+').split('_').join('/');
    const padded = `${encoded}${'='.repeat((4 - (encoded.length % 4)) % 4)}`;
    const binary = globalThis.atob(padded);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return { ok: true, code: 'RTK_AUTHORITY_CARRIER_DECODED', value: new globalThis.TextDecoder().decode(bytes) };
  } catch {
    return { ok: false, code: 'RTK_AUTHORITY_CARRIER_DECODE_FAILED', value: '' };
  }
}

function customPropertyAuthorityCandidates(parts, budgets, cryptoPort, budgetState) {
  const xml = rawString(parts['docProps/custom.xml']);
  if (!xml) return { candidates: [], reasons: [] };
  const scan = parseXmlPart('docProps/custom.xml', xml, budgets, cryptoPort, budgetState);
  const candidates = [];
  for (const token of scan.tokens.filter((item) => item.localName === 'property')) {
    const propertyName = attr(token, 'name');
    if (!RTK_REVIEW_TRANSPORT_AUTHORITY_CUSTOM_PROPERTY_NAMES.includes(propertyName)) continue;
    const candidate = {
      carrier: 'customDocumentProperty',
      propertyName,
      encoded: tokenText(xml, token),
      sourceXmlProvenance: provenance(token),
    };
    if (
      admitBudgetCount(
        budgetState,
        scan.diagnostics,
        'candidates',
        budgets.maxCandidates,
        'authorityCarrier.candidates',
        'Authority candidate budget exceeded.',
      )
      && admitWorkerOutput(budgetState, scan.diagnostics, 'authorityCarrier.candidates', candidate)
    ) {
      candidates.push(candidate);
    }
  }
  return { candidates, reasons: scan.diagnostics };
}

function isFullManuscriptAuthorityPayload(payload, expected = {}) {
  return rawString(payload?.scope) === 'full-manuscript'
    || rawString(expected?.scope) === 'full-manuscript';
}

function validateAuthorityPayload(payload, expected = {}) {
  const reasons = [];
  const fullManuscript = isFullManuscriptAuthorityPayload(payload, expected);
  const requiredKeys = fullManuscript
    ? ['caseId', 'scope', 'projectId', 'roundId', 'exportId', 'fullBookRawSha256', 'capabilityManifestDigest']
    : ['caseId', 'sceneId', 'sceneRevision', 'blockId', 'roundId', 'exportId'];
  for (const key of requiredKeys) {
    if (!rawString(payload?.[key])) {
      reasons.push(reason('RTK_MANUAL_DEGRADED_LOCATOR', `authorityCarrier.payload.${key}`, 'Authority carrier payload field is required.'));
    }
  }
  if (fullManuscript) {
    if (rawString(payload?.scope) !== 'full-manuscript') {
      reasons.push(reason('RTK_MANUAL_DEGRADED_LOCATOR', 'authorityCarrier.payload.scope', 'Full-manuscript authority carrier scope is required.'));
    }
    if (!SIGNED_SHA256_RE.test(rawString(payload?.fullBookRawSha256))) {
      reasons.push(reason('RTK_MANUAL_DEGRADED_LOCATOR', 'authorityCarrier.payload.fullBookRawSha256', 'Full-manuscript raw hash must be a full lowercase sha256 digest.'));
    }
  } else if (!SIGNED_SHA256_RE.test(rawString(payload?.rawSha256))) {
    reasons.push(reason('RTK_MANUAL_DEGRADED_LOCATOR', 'authorityCarrier.payload.rawSha256', 'Authority carrier raw hash must be a full lowercase sha256 digest.'));
  }
  return reasons;
}

function verifyAuthorityCandidate(candidate, input, cryptoPort, hmacSecret) {
  const reasons = [];
  const decoded = base64UrlDecodeText(candidate.encoded);
  if (!decoded.ok) {
    reasons.push(reason('RTK_MANUAL_DEGRADED_LOCATOR', 'authorityCarrier.encoded', 'Authority carrier could not be decoded.', {
      decodeCode: decoded.code,
    }));
    return {
      ...candidate,
      schemaVersion: RTK_REVIEW_TRANSPORT_AUTHORITY_CARRIER_V2_SCHEMA,
      visibleToAuthor: false,
      exactAuthorityCandidate: true,
      verified: false,
      validSignedLocator: false,
      encodedDigest: cryptoPort.sha256Text(candidate.encoded),
      payloadDigest: '',
      signatureDigest: '',
      payload: null,
      baselineBinding: {},
      reasons,
    };
  }
  let envelope = null;
  try {
    envelope = JSON.parse(decoded.value);
  } catch {
    reasons.push(reason('RTK_MANUAL_DEGRADED_LOCATOR', 'authorityCarrier.envelope', 'Authority carrier JSON is malformed.'));
  }
  const payload = isPlainObject(envelope?.payload) ? envelope.payload : {};
  const expected = isPlainObject(input.expectedAuthority) ? input.expectedAuthority : {};
  const fullManuscript = isFullManuscriptAuthorityPayload(payload, expected);
  reasons.push(...validateAuthorityPayload(payload, expected));
  const expectedPayloadDigest = cryptoPort.sha256Json(payload);
  if (rawString(envelope?.payloadDigest) !== expectedPayloadDigest) {
    reasons.push(reason('RTK_MANUAL_DEGRADED_LOCATOR', 'authorityCarrier.payloadDigest', 'Authority carrier payload digest mismatch.'));
  }
  if (!HMAC_RE.test(rawString(envelope?.signature))) {
    reasons.push(reason('RTK_MANUAL_DEGRADED_LOCATOR', 'authorityCarrier.signature', 'Authority carrier signature must be a full hmac-sha256 digest.'));
  }
  if (envelope?.secretEmbeddedInDocx !== false) {
    reasons.push(reason('RTK_MANUAL_DEGRADED_LOCATOR', 'authorityCarrier.secretEmbeddedInDocx', 'Authority carrier secret must not be embedded.'));
  }
  if (!cryptoPort.hmacSha256Json || !rawString(hmacSecret)) {
    reasons.push(reason('RTK_MANUAL_DEGRADED_LOCATOR', 'authorityCarrier.hmacSecret', 'Local HMAC secret is required for authority carrier verification.'));
  } else {
    const expectedHmac = normalizeHmac(cryptoPort.hmacSha256Json(payload, hmacSecret));
    if (rawString(envelope?.signature) !== expectedHmac) {
      reasons.push(reason('RTK_MANUAL_DEGRADED_LOCATOR', 'authorityCarrier.signature', 'Authority carrier HMAC mismatch.'));
    }
  }
  const expectedKeys = fullManuscript
    ? ['scope', 'fullBookRawSha256', 'roundId', 'exportId', 'capabilityManifestDigest']
    : ['sceneId', 'sceneRevision', 'rawSha256', 'blockId', 'roundId', 'exportId'];
  const baselineBinding = Object.fromEntries(expectedKeys.map((key) => {
    const expectedValue = rawString(expected[key]);
    return [`${key}Matches`, Boolean(expectedValue) && rawString(payload[key]) === expectedValue];
  }));
  for (const key of expectedKeys) {
    const expectedValue = rawString(expected[key]);
    if (expectedValue && rawString(payload[key]) !== expectedValue) {
      const code = key === 'sceneRevision'
        ? 'RTK_BLOCKED_STALE_REVISION'
        : (key === 'rawSha256' ? 'RTK_BLOCKED_STALE_BYTES' : 'RTK_MANUAL_DEGRADED_LOCATOR');
      reasons.push(reason(code, `authorityCarrier.expectedAuthority.${key}`, 'Authority carrier does not match the expected local baseline.', {
        expected: expectedValue,
        actual: rawString(payload[key]),
      }));
    }
  }
  const allExpectedPresent = expectedKeys.every((key) => rawString(expected[key]));
  const allExpectedMatched = allExpectedPresent && Object.values(baselineBinding).every(Boolean);
  const verified = reasons.length === 0;
  return {
    ...candidate,
    schemaVersion: RTK_REVIEW_TRANSPORT_AUTHORITY_CARRIER_V2_SCHEMA,
    visibleToAuthor: false,
    exactAuthorityCandidate: true,
    verified,
    validSignedLocator: verified && allExpectedMatched,
    encodedDigest: cryptoPort.sha256Text(candidate.encoded),
    payloadDigest: expectedPayloadDigest,
    signatureDigest: normalizeHmac(envelope?.signature),
    payload: cloneJsonSafe(payload),
    baselineBinding: {
      ...baselineBinding,
      allExpectedPresent,
      allExpectedMatched,
    },
    reasons,
  };
}

function analyzeAuthorityCarriers(input, parts, budgets, cryptoPort, budgetState) {
  const found = customPropertyAuthorityCandidates(parts, budgets, cryptoPort, budgetState);
  const reasons = [...found.reasons];
  const carriers = found.candidates.map((candidate) => verifyAuthorityCandidate(
    candidate,
    input,
    cryptoPort,
    input.hmacSecret,
  ));
  if (carriers.length > 1) {
    reasons.push(reason('RTK_BLOCKED_AMBIGUOUS_TEXT', 'authorityCarrier', 'Multiple authority carriers are ambiguous and cannot grant exact authority.'));
  }
  for (const carrier of carriers) reasons.push(...carrier.reasons);
  const selected = carriers.length === 1 ? carriers[0] : null;
  const exactAuthority = {
    validSignedLocator: selected?.validSignedLocator === true,
    sceneRevisionUnchanged: selected?.baselineBinding?.sceneRevisionMatches === true
      || selected?.baselineBinding?.fullBookRawSha256Matches === true,
    rawSha256Unchanged: selected?.baselineBinding?.rawSha256Matches === true
      || selected?.baselineBinding?.fullBookRawSha256Matches === true,
    uniqueTarget: false,
    nonOverlapping: false,
    allRelevantXmlSemanticsAccounted: false,
    ambiguousDuplicate: carriers.length > 1,
    crossScene: false,
    structuralTopologyChanged: false,
  };
  return {
    schemaVersion: RTK_REVIEW_TRANSPORT_AUTHORITY_CARRIER_V2_SCHEMA,
    status: selected?.validSignedLocator === true ? 'verified-baseline-bound' : (carriers.length > 0 ? 'present-not-authoritative' : 'missing'),
    selectedCarrier: selected,
    carriers,
    exactAuthority,
    reasons,
  };
}

function parseTextRevisions(documentXml, documentScan, cryptoPort, budgets, budgetState, reasons) {
  const revisions = [];
  for (const token of documentScan.tokens) {
    if (!isWordToken(token, 'ins') && !isWordToken(token, 'del')) continue;
    const operation = token.localName === 'ins' ? 'insert' : 'delete';
    const text = tokenText(documentXml, token);
    const revision = {
      kind: 'TextRevision',
      operation,
      nativeRevisionId: attr(token, 'id'),
      author: attr(token, 'author'),
      date: attr(token, 'date'),
      text,
      textDigest: tokenDigest(cryptoPort, { operation, text }),
      replacementGroupId: '',
      sourceXmlProvenance: provenance(token),
      classification: 'TEXT_MANUAL',
      candidateDisposition: 'MANUAL',
      reasonCode: 'RTK_MANUAL_DEGRADED_LOCATOR',
    };
    if (admitWorkerOutput(budgetState, reasons, 'reviewIr.textRevisions', revision)) {
      revisions.push(revision);
    }
  }
  const ordered = revisions.slice().sort((left, right) => (
    left.sourceXmlProvenance.openStart - right.sourceXmlProvenance.openStart
  ));
  for (let index = 0; index < ordered.length - 1; index += 1) {
    const left = ordered[index];
    const right = ordered[index + 1];
    const distance = right.sourceXmlProvenance.openStart - left.sourceXmlProvenance.closeEnd;
    const adjacentReplacement = (
      ((left.operation === 'delete' && right.operation === 'insert')
        || (left.operation === 'insert' && right.operation === 'delete'))
      && distance >= 0
      && distance < 256
    );
    if (adjacentReplacement) {
      const deleteRevision = left.operation === 'delete' ? left : right;
      const insertRevision = left.operation === 'insert' ? left : right;
      const groupId = cryptoPort.sha256Text(stableJson({
        deleteRevision: deleteRevision.nativeRevisionId,
        insertRevision: insertRevision.nativeRevisionId,
        deleted: deleteRevision.textDigest,
        inserted: insertRevision.textDigest,
      }));
      left.replacementGroupId = groupId;
      right.replacementGroupId = groupId;
    }
  }
  return ordered;
}

function parseMoveRevisions(documentXml, documentScan, cryptoPort, budgetState, reasons) {
  const moves = [];
  const byId = new Map();
  for (const token of documentScan.tokens) {
    if (!isWordToken(token, 'moveFrom') && !isWordToken(token, 'moveTo')) continue;
    const nativeRevisionId = attr(token, 'id') || cryptoPort.sha256Text(stableJson(provenance(token)));
    const entry = byId.get(nativeRevisionId) || {
      kind: 'MoveRevision',
      nativeRevisionId,
      moveFrom: null,
      moveTo: null,
      pairedRanges: [],
      classification: 'STRUCTURAL_BLOCKED',
      reasonCode: 'RTK_BLOCKED_MOVE_REVISION',
    };
    const side = token.localName === 'moveFrom' ? 'moveFrom' : 'moveTo';
    entry[side] = {
      text: tokenText(documentXml, token),
      textDigest: tokenDigest(cryptoPort, { side, text: tokenText(documentXml, token) }),
      sourceXmlProvenance: provenance(token),
    };
    byId.set(nativeRevisionId, entry);
  }
  for (const item of byId.values()) {
    item.pairedRanges = [item.moveFrom, item.moveTo].filter(Boolean).map((side) => side.sourceXmlProvenance);
    if (admitWorkerOutput(budgetState, reasons, 'reviewIr.moveRevisions', item)) {
      moves.push(item);
    }
  }
  return moves;
}

function childTokensWithin(documentScan, parent) {
  return documentScan.tokens.filter((token) => (
    token.openStart >= parent.openEnd && token.closeEnd <= parent.closeStart
  ));
}

function parsePropertyRevisions(documentXml, documentScan, budgetState, reasons) {
  const revisions = [];
  for (const token of documentScan.tokens) {
    if (!['rPrChange', 'pPrChange', 'numPrChange'].includes(token.localName)) continue;
    const revision = {
      kind: 'PropertyRevision',
      propertyKind: token.localName,
      nativeRevisionId: attr(token, 'id'),
      author: attr(token, 'author'),
      date: attr(token, 'date'),
      sourceXmlProvenance: provenance(token),
      rawTextExcerpt: tokenText(documentXml, token).slice(0, 96),
      classification: 'MANUAL_REVIEW',
      reasonCode: 'RTK_BLOCKED_STRUCTURAL',
    };
    if (admitWorkerOutput(budgetState, reasons, 'reviewIr.propertyRevisions', revision)) {
      revisions.push(revision);
    }
  }
  return revisions;
}

function parseStructureChanges(documentScan, budgetState, reasons) {
  const changes = [];
  for (const token of documentScan.tokens) {
    const bodyLevelSectionProperties = token.localName === 'sectPr'
      && token.path.length === 3
      && token.path[0] === 'document'
      && token.path[1] === 'body';
    if (bodyLevelSectionProperties) continue;
    if (['pPrChange', 'tbl', 'sectPr', 'footnoteReference', 'endnoteReference'].includes(token.localName)) {
      const change = {
        kind: 'StructureChange',
        structureKind: token.localName,
        sourceXmlProvenance: provenance(token),
        classification: 'STRUCTURAL_BLOCKED',
        reasonCode: 'RTK_BLOCKED_STRUCTURAL',
        writerAuthorityImpact: 'blocking',
      };
      if (admitWorkerOutput(budgetState, reasons, 'reviewIr.structureChanges', change)) {
        changes.push(change);
      }
    }
    if (token.localName === 'moveFrom' || token.localName === 'moveTo') {
      const change = {
        kind: 'StructureChange',
        structureKind: 'moveRevision',
        sourceXmlProvenance: provenance(token),
        classification: 'STRUCTURAL_BLOCKED',
        reasonCode: 'RTK_BLOCKED_MOVE_REVISION',
        writerAuthorityImpact: 'blocking',
      };
      if (admitWorkerOutput(budgetState, reasons, 'reviewIr.structureChanges', change)) {
        changes.push(change);
      }
    }
  }
  return changes;
}

function firstChildValue(children, localName, attrName = 'val') {
  const found = children.find((token) => token.localName === localName);
  return found ? attr(found, attrName) : '';
}

function textInsideToken(documentXml, documentScan, container) {
  const blockedRanges = documentScan.tokens
    .filter((token) => (
      ['del', 'moveFrom'].includes(token.localName)
      && token.openStart >= container.openEnd
      && token.closeEnd <= container.closeStart
    ))
    .map((token) => ({ start: token.openStart, end: token.closeEnd }));
  let output = '';
  const textTokens = documentScan.tokens
    .filter((token) => (
      ['t', 'tab', 'br', 'cr'].includes(token.localName)
      && token.openStart >= container.openEnd
      && token.closeEnd <= container.closeStart
      && !positionInsideRanges(token.openStart, blockedRanges)
    ))
    .sort((left, right) => left.openStart - right.openStart || left.closeEnd - right.closeEnd);
  for (const token of textTokens) {
    if (token.localName === 'tab') output += '\t';
    else if (token.localName === 'br' || token.localName === 'cr') output += '\n';
    else output += decodeEntities(elementBody(documentXml, token));
  }
  return output;
}

function formattingToggleAction(children, localName) {
  const token = children.find((item) => item.localName === localName);
  if (!token) return null;
  const value = attr(token, 'val').trim().toLowerCase();
  return ['0', 'false', 'off', 'none'].includes(value)
    ? { action: 'remove' }
    : { action: 'set', value: true };
}

function formattingUnderlineAction(children) {
  const token = children.find((item) => item.localName === 'u');
  if (!token) return null;
  const value = attr(token, 'val').trim().toLowerCase();
  if (['0', 'false', 'off', 'none'].includes(value)) return { action: 'remove' };
  if (!value || value === 'single') return { action: 'set', value: true };
  return null;
}

function formattingColorAction(children) {
  const token = children.find((item) => item.localName === 'color');
  if (!token) return null;
  const value = attr(token, 'val').trim();
  if (!value) return null;
  if (['auto', 'none'].includes(value.toLowerCase())) return { action: 'remove' };
  return /^[A-Fa-f0-9]{6}$/u.test(value)
    ? { action: 'set', value: `#${value.toLowerCase()}` }
    : null;
}

const WORD_HIGHLIGHT_COLOR_BY_NAME = Object.freeze({
  black: '#000000',
  blue: '#0000ff',
  cyan: '#00ffff',
  darkblue: '#00008b',
  darkcyan: '#008b8b',
  darkgray: '#a9a9a9',
  darkgreen: '#006400',
  darkmagenta: '#8b008b',
  darkred: '#8b0000',
  darkyellow: '#808000',
  green: '#008000',
  lightgray: '#d3d3d3',
  magenta: '#ff00ff',
  red: '#ff0000',
  white: '#ffffff',
  yellow: '#ffff00',
});

function formattingHighlightAction(children) {
  const token = children.find((item) => item.localName === 'highlight');
  if (!token) return null;
  const value = attr(token, 'val').trim().toLowerCase();
  if (!value || value === 'none') return { action: 'remove' };
  return WORD_HIGHLIGHT_COLOR_BY_NAME[value]
    ? { action: 'set', value: WORD_HIGHLIGHT_COLOR_BY_NAME[value] }
    : null;
}

function formattingShadingAction(children) {
  const token = children.find((item) => item.localName === 'shd');
  if (!token) return null;
  const fill = attr(token, 'fill').trim();
  if (!fill || ['auto', 'none', 'nil'].includes(fill.toLowerCase())) return { action: 'remove' };
  return /^[A-Fa-f0-9]{6}$/u.test(fill)
    ? { action: 'set', value: `#${fill.toLowerCase()}` }
    : null;
}

function formattingFontAction(children) {
  const token = children.find((item) => item.localName === 'rFonts');
  if (!token) return null;
  const values = ['ascii', 'hAnsi', 'eastAsia', 'cs'].map((name) => attr(token, name).trim()).filter(Boolean);
  if (values.length === 0) return null;
  const unique = [...new Set(values)];
  return unique.length === 1 && unique[0].length <= 128
    ? { action: 'set', value: unique[0] }
    : null;
}

function formattingSizeAction(children) {
  const values = ['sz', 'szCs']
    .map((name) => children.find((item) => item.localName === name))
    .filter(Boolean)
    .map((token) => attr(token, 'val').trim())
    .filter(Boolean);
  if (values.length === 0) return null;
  const unique = [...new Set(values)];
  if (unique.length !== 1 || !/^\d{1,4}$/u.test(unique[0])) return null;
  const halfPoints = Number(unique[0]);
  if (!Number.isSafeInteger(halfPoints) || halfPoints < 2 || halfPoints > 3276) return null;
  return { action: 'set', value: `${halfPoints / 2}pt` };
}

function formattingInlineActions(children) {
  const inline = {};
  for (const [key, localName] of [['bold', 'b'], ['italic', 'i'], ['strike', 'strike']]) {
    const action = formattingToggleAction(children, localName);
    if (action) inline[key] = action;
  }
  const underline = formattingUnderlineAction(children);
  if (underline) inline.underline = underline;
  const color = formattingColorAction(children);
  if (color) inline.color = color;
  const highlight = formattingHighlightAction(children);
  if (highlight) inline.highlight = highlight;
  const shading = formattingShadingAction(children);
  if (shading) {
    if (inline.highlight && JSON.stringify(inline.highlight) !== JSON.stringify(shading)) {
      inline.highlightConflict = true;
    } else {
      inline.highlight = shading;
    }
  }
  const fontFamily = formattingFontAction(children);
  if (fontFamily) inline.fontFamily = fontFamily;
  const fontSize = formattingSizeAction(children);
  if (fontSize) inline.fontSize = fontSize;
  return inline;
}

function formattingInlineState(actions) {
  const state = {};
  for (const [key, action] of Object.entries(actions)) {
    if (action?.action === 'set') state[key] = action.value;
  }
  return state;
}

function formattingParagraphState(children) {
  const state = {};
  const alignment = children.find((item) => item.localName === 'jc');
  if (alignment) {
    const value = attr(alignment, 'val').trim().toLowerCase();
    if (['left', 'center', 'right', 'justify'].includes(value)) state.textAlign = value;
  }
  return state;
}

function formattingParagraphActions(children) {
  const state = formattingParagraphState(children);
  return Object.hasOwn(state, 'textAlign')
    ? { textAlign: { action: 'set', value: state.textAlign } }
    : {};
}

function formattingParagraphStructure(children) {
  const outline = children.find((item) => item.localName === 'outlineLvl');
  if (!outline) return { nodeType: 'paragraph' };
  const value = attr(outline, 'val').trim();
  if (!/^\d$/u.test(value)) return null;
  const outlineLevel = Number(value);
  if (!Number.isSafeInteger(outlineLevel) || outlineLevel < 0 || outlineLevel > 5) return null;
  return { nodeType: 'heading', headingLevel: outlineLevel + 1 };
}

function indexFormattingDocumentTokens(tokens) {
  const ordered = [...tokens].sort((left, right) => (
    (left.openStart - right.openStart)
    || (right.closeEnd - left.closeEnd)
  ));
  const stack = [];
  const paragraphs = [];
  for (const token of ordered) {
    while (stack.length > 0) {
      const parent = stack[stack.length - 1];
      if (
        parent.token.openStart < token.openStart
        && parent.token.closeEnd >= token.closeEnd
      ) break;
      stack.pop();
    }
    const parent = stack.length > 0
      ? stack[stack.length - 1]
      : { paragraph: null, run: null };
    if (parent.paragraph) parent.paragraph.tokens.push(token);
    if (parent.run) parent.run.tokens.push(token);

    let paragraph = parent.paragraph;
    let run = parent.run;
    if (token.localName === 'p' && token.namespaceUri === W_NS) {
      paragraph = { token, tokens: [], runs: [] };
      run = null;
      paragraphs.push(paragraph);
    } else if (token.localName === 'r' && token.namespaceUri === W_NS && paragraph) {
      run = { token, tokens: [] };
      paragraph.runs.push(run);
    }
    if (!token.selfClosing) stack.push({ token, paragraph, run });
  }
  return paragraphs;
}

export function extractReviewTransportFormattingRunsV2(documentXml, options = {}) {
  const cryptoPort = resolveCryptoPort(options.cryptoPort);
  if (!cryptoPort.ok) {
    return {
      ok: false,
      code: 'RTK_FORMATTING_SCANNER_CRYPTO_PORT_REQUIRED',
      reasons: [reason('RTK_FORMATTING_SCANNER_CRYPTO_PORT_REQUIRED', 'cryptoPort', 'Formatting scanner requires the bounded parser CryptoPort.', { missing: cryptoPort.missing })],
      paragraphs: [],
    };
  }
  const budgets = normalizeBudgets(options.budgets);
  const budgetState = createParserBudgetState(budgets, cryptoPort);
  const documentScan = parseXmlPart('word/document.xml', documentXml, budgets, cryptoPort, budgetState);
  const reasons = [...documentScan.diagnostics];
  if (blockingReason(reasons)) {
    return { ok: false, code: 'RTK_FORMATTING_SCANNER_XML_BLOCKED', reasons, paragraphs: [] };
  }
  const paragraphs = indexFormattingDocumentTokens(documentScan.tokens);
  const results = [];
  for (const [paragraphIndex, paragraphRecord] of paragraphs.entries()) {
    const paragraph = paragraphRecord.token;
    const paragraphScan = { tokens: paragraphRecord.tokens };
    const paragraphText = textInsideToken(documentXml, paragraphScan, paragraph);
    const trackedRevision = paragraphRecord.tokens.some((token) => (
      ['ins', 'del', 'moveFrom', 'moveTo'].includes(token.localName)
    ));
    const bookmarks = paragraphRecord.tokens
      .filter((token) => (
        token.localName === 'bookmarkStart'
      ))
      .map((token) => attr(token, 'name'))
      .filter(Boolean);
    const paragraphProperties = paragraphRecord.tokens.find((token) => (
      token.localName === 'pPr'
      && token.namespaceUri === W_NS
    ));
    const paragraphPropertyChildren = paragraphProperties
      ? childTokensWithin(paragraphScan, paragraphProperties).filter((token) => token.namespaceUri === W_NS)
      : [];
    const paragraphSemanticNames = [...new Set(paragraphPropertyChildren.map((token) => token.localName))];
    const unsupportedParagraphNames = paragraphSemanticNames.filter((name) => !['jc', 'outlineLvl'].includes(name));
    const paragraphState = formattingParagraphState(paragraphPropertyChildren);
    const paragraphActions = formattingParagraphActions(paragraphPropertyChildren);
    const paragraphStructure = formattingParagraphStructure(paragraphPropertyChildren);
    const paragraphFormattingInvalid = paragraphSemanticNames.includes('jc')
      && !Object.hasOwn(paragraphState, 'textAlign');
    const paragraphStructureInvalid = paragraphSemanticNames.includes('outlineLvl') && paragraphStructure === null;
    let cursor = 0;
    const formattedRuns = [];
    for (const runRecord of paragraphRecord.runs) {
      const run = runRecord.token;
      const runScan = { tokens: runRecord.tokens };
      const text = textInsideToken(documentXml, runScan, run);
      const from = cursor;
      const to = from + text.length;
      cursor = to;
      const properties = runRecord.tokens.find((token) => (
        token.localName === 'rPr'
        && token.namespaceUri === W_NS
      ));
      if (!text) continue;
      const children = properties
        ? childTokensWithin(runScan, properties).filter((token) => token.namespaceUri === W_NS)
        : [];
      const semanticNames = [...new Set(children.map((token) => token.localName))];
      const supportedNames = new Set(['b', 'i', 'u', 'strike', 'color', 'highlight', 'shd', 'rFonts', 'sz', 'szCs']);
      const unsupportedNames = semanticNames.filter((name) => !supportedNames.has(name));
      const inline = formattingInlineActions(children);
      const expectedActionKeys = [
        ...[['b', 'bold'], ['i', 'italic'], ['u', 'underline'], ['strike', 'strike']]
          .filter(([name]) => semanticNames.includes(name))
          .map(([, key]) => key),
        ...(semanticNames.includes('color') ? ['color'] : []),
        ...(semanticNames.includes('highlight') || semanticNames.includes('shd') ? ['highlight'] : []),
        ...(semanticNames.includes('rFonts') ? ['fontFamily'] : []),
        ...(semanticNames.includes('sz') || semanticNames.includes('szCs') ? ['fontSize'] : []),
      ];
      const invalidSupportedValue = expectedActionKeys.some((key) => !Object.hasOwn(inline, key))
        || inline.highlightConflict === true;
      delete inline.highlightConflict;
      formattedRuns.push({
        from,
        to,
        text,
        inline,
        inlineState: formattingInlineState(inline),
        unsupportedNames,
        invalidSupportedValue,
        sourceXmlProvenance: provenance(properties || run),
      });
    }
    results.push({
      paragraphIndex,
      paragraphText,
      trackedRevision,
      paraId: attr(paragraph, 'paraId'),
      textId: attr(paragraph, 'textId'),
      bookmarkNames: bookmarks,
      paragraphState,
      paragraphActions,
      paragraphStructure: paragraphStructure || {},
      unsupportedParagraphNames,
      paragraphFormattingInvalid: paragraphFormattingInvalid || paragraphStructureInvalid,
      formattedRuns,
    });
  }
  return { ok: true, code: 'RTK_FORMATTING_SCANNER_READY', reasons, paragraphs: results };
}

function parseFormattingDeltas(documentXml, documentScan, budgetState, reasons) {
  const deltas = [];
  for (const token of documentScan.tokens) {
    if (token.localName !== 'rPr' && token.localName !== 'pPr' && token.localName !== 'hyperlink') continue;
    const children = childTokensWithin(documentScan, token);
    if (token.localName === 'hyperlink') {
      const delta = {
        kind: 'FormattingDelta',
        formatKind: 'hyperlink',
        values: {
          relationshipId: attr(token, 'id', 'http://schemas.openxmlformats.org/officeDocument/2006/relationships') || attr(token, 'id'),
          anchor: attr(token, 'anchor'),
          text: tokenText(documentXml, token),
        },
        sourceXmlProvenance: provenance(token),
        classification: 'MANUAL_REVIEW',
      };
      if (admitWorkerOutput(budgetState, reasons, 'reviewIr.formattingDeltas', delta)) {
        deltas.push(delta);
      }
      continue;
    }
    const values = token.localName === 'rPr'
      ? {
        bold: children.some((item) => item.localName === 'b'),
        italic: children.some((item) => item.localName === 'i'),
        underline: firstChildValue(children, 'u') || (children.some((item) => item.localName === 'u') ? 'present' : ''),
        strike: children.some((item) => item.localName === 'strike'),
        color: firstChildValue(children, 'color'),
        highlight: firstChildValue(children, 'highlight'),
        font: firstChildValue(children, 'rFonts', 'ascii') || firstChildValue(children, 'rFonts', 'hAnsi'),
        size: firstChildValue(children, 'sz'),
      }
      : {
        paragraphStyle: firstChildValue(children, 'pStyle'),
        alignment: firstChildValue(children, 'jc'),
        indent: children.find((item) => item.localName === 'ind')?.attrsByLocal || {},
        listMetadata: children.some((item) => item.localName === 'numPr')
          ? {
            ilvl: firstChildValue(children, 'ilvl'),
            numId: firstChildValue(children, 'numId'),
          }
          : {},
      };
    const delta = {
      kind: 'FormattingDelta',
      formatKind: token.localName,
      values,
      sourceXmlProvenance: provenance(token),
      classification: 'MANUAL_REVIEW',
    };
    if (admitWorkerOutput(budgetState, reasons, 'reviewIr.formattingDeltas', delta)) {
      deltas.push(delta);
    }
  }
  return deltas;
}

function relatedRevisionForRange(documentScan, start, end) {
  for (const token of documentScan.tokens) {
    if (!['ins', 'del', 'moveFrom', 'moveTo'].includes(token.localName)) continue;
    if (token.openStart <= start && token.closeEnd >= end) {
      return {
        kind: token.localName === 'ins'
          ? 'insert'
          : (token.localName === 'del' ? 'delete' : token.localName),
        nativeRevisionId: attr(token, 'id'),
        sourceXmlProvenance: provenance(token),
      };
    }
  }
  return null;
}

function commentAnchorMap(documentXml, documentScan) {
  const map = new Map();
  for (const token of documentScan.tokens) {
    if (token.localName !== 'commentReference' && token.localName !== 'commentRangeStart') continue;
    const id = attr(token, 'id');
    if (!id || map.has(id)) continue;
    const rangeEnd = documentScan.tokens.find((candidate) => (
      candidate.localName === 'commentRangeEnd'
      && attr(candidate, 'id') === id
      && candidate.openStart >= token.closeEnd
    ));
    const quotedAnchorText = rangeEnd
      ? stripTagsToText(documentXml.slice(token.closeEnd, rangeEnd.openStart)).trim()
      : '';
    map.set(id, {
      anchorStart: token.openStart,
      anchorEnd: rangeEnd ? rangeEnd.closeEnd : token.closeEnd,
      quotedAnchorText,
      anchored: true,
      relatedRevision: relatedRevisionForRange(
        documentScan,
        token.openStart,
        rangeEnd ? rangeEnd.closeEnd : token.closeEnd,
      ),
    });
  }
  return map;
}

function collectModernCommentMetadata(scans) {
  const metadataByParaId = new Map();
  const metadataById = new Map();
  const people = [];
  for (const token of scans.commentsExtended.tokens.filter((item) => item.localName === 'commentEx')) {
    const item = {
      paraId: attr(token, 'paraId'),
      paraIdParent: attr(token, 'paraIdParent'),
      done: attr(token, 'done').toLowerCase() === 'true' || attr(token, 'done') === '1',
      attributes: cloneJsonSafe(token.attributes),
    };
    if (item.paraId) metadataByParaId.set(item.paraId, item);
  }
  for (const token of scans.commentsIds.tokens) {
    if (token.localName !== 'commentId') continue;
    const item = {
      paraId: attr(token, 'paraId'),
      durableId: attr(token, 'durableId') || attr(token, 'durableId', W16CID_NS),
      dateUtc: attr(token, 'dateUtc') || attr(token, 'dateUtc', W16CID_NS),
      attributes: cloneJsonSafe(token.attributes),
    };
    if (item.paraId) metadataByParaId.set(item.paraId, { ...(metadataByParaId.get(item.paraId) || {}), ...item });
    if (item.durableId) metadataById.set(item.durableId, item);
  }
  for (const token of scans.commentsExtensible.tokens) {
    const paraId = attr(token, 'paraId');
    if (!paraId) continue;
    const item = {
      ...(metadataByParaId.get(paraId) || {}),
      paraId,
      durableId: attr(token, 'durableId') || attr(token, 'durableId', W16CID_NS),
      reopened: attr(token, 'reopened') === '1' || attr(token, 'reopened').toLowerCase() === 'true',
      done: attr(token, 'done') === '1' || attr(token, 'done').toLowerCase() === 'true',
      attributes: cloneJsonSafe(token.attributes),
    };
    metadataByParaId.set(paraId, item);
    if (item.durableId) metadataById.set(item.durableId, item);
  }
  for (const token of scans.people.tokens) {
    if (token.localName !== 'person') continue;
    people.push({
      author: attr(token, 'author'),
      providerId: attr(token, 'providerId'),
      userId: attr(token, 'userId'),
      attributes: cloneJsonSafe(token.attributes),
    });
  }
  return { metadataByParaId, metadataById, people };
}

function expectedCommentRecords(input) {
  const list = Array.isArray(input.expectedCommentThreads)
    ? input.expectedCommentThreads
    : (Array.isArray(input.baselineCommentThreads) ? input.baselineCommentThreads : []);
  return list.filter(isPlainObject).map((item) => ({
    commentId: rawString(item.commentId || item.rawId),
    durableId: rawString(item.durableId),
    bodyExcerpt: rawString(item.bodyExcerpt || item.body).slice(0, 160),
    doneResolvedReopenedState: rawString(item.doneResolvedReopenedState || item.state),
  }));
}

function parseCommentThreads(input, documentXml, documentScan, scans, cryptoPort, budgetState) {
  const anchors = commentAnchorMap(documentXml, documentScan);
  const metadata = collectModernCommentMetadata(scans);
  const reasons = [...scans.comments.diagnostics, ...scans.commentsExtended.diagnostics, ...scans.commentsIds.diagnostics, ...scans.commentsExtensible.diagnostics, ...scans.people.diagnostics];
  const expected = expectedCommentRecords(input);
  const expectedByKey = new Map();
  for (const item of expected) {
    for (const key of [item.commentId, item.durableId].filter(Boolean)) expectedByKey.set(key, item);
  }
  const records = [];
  const seenIds = new Set();
  let ordinal = 0;
  for (const token of scans.comments.tokens.filter((item) => item.localName === 'comment')) {
    const rawId = attr(token, 'id') || String(ordinal);
    const paraId = attr(token, 'paraId') || rawId;
    const meta = metadata.metadataByParaId.get(paraId) || metadata.metadataByParaId.get(rawId) || {};
    const expectedRecord = expectedByKey.get(rawId) || expectedByKey.get(rawString(meta.durableId)) || {};
    const duplicate = seenIds.has(rawId);
    seenIds.add(rawId);
    const anchor = anchors.get(rawId) || {};
    const body = tokenText(scans.comments.xml, token);
    const parentKey = attr(token, 'parentId') || rawString(meta.paraIdParent);
    const author = attr(token, 'author');
    const record = {
      rawId,
      paraId,
      parentKey,
      duplicate,
      ordinal,
      body,
      author,
      initials: attr(token, 'initials'),
      date: attr(token, 'date'),
      durableId: rawString(meta.durableId),
      done: meta.done === true,
      reopened: meta.reopened === true
        || (
          meta.done === false
          && rawString(expectedRecord.doneResolvedReopenedState).toLowerCase() === 'resolved'
        ),
      anchor,
      metadata: meta,
      sourceXmlProvenance: provenance(token),
    };
    records.push(record);
    ordinal += 1;
  }
  const byKey = new Map();
  for (const record of records) {
    byKey.set(record.rawId, record);
    byKey.set(record.paraId, record);
    if (record.durableId) byKey.set(record.durableId, record);
  }
  const childrenByParent = new Map();
  for (const record of records) {
    if (!record.parentKey) continue;
    const list = childrenByParent.get(record.parentKey) || [];
    list.push(record);
    childrenByParent.set(record.parentKey, list);
  }
  function directChildren(record) {
    const keyed = new Map();
    for (const key of [record.rawId, record.paraId, record.durableId].filter(Boolean)) {
      for (const child of childrenByParent.get(key) || []) keyed.set(child.rawId, child);
    }
    return [...keyed.values()].sort((left, right) => left.ordinal - right.ordinal);
  }
  function buildReplies(record, seen = new Set()) {
    if (seen.has(record.rawId)) return [];
    seen.add(record.rawId);
    const replies = [];
    for (const reply of directChildren(record)) {
      replies.push({
        itemId: `rtk-comment-reply-${reply.rawId}`,
        rawId: reply.rawId,
        parentRawId: record.rawId,
        body: reply.body,
        bodyDigest: cryptoPort.sha256Json({ rawId: reply.rawId, body: reply.body }),
        author: reply.author,
        initials: reply.initials,
        date: reply.date,
        sourceXmlProvenance: reply.sourceXmlProvenance,
      });
      replies.push(...buildReplies(reply, seen));
    }
    return replies;
  }
  const threads = [];
  for (const record of records) {
    if (record.parentKey && byKey.has(record.parentKey)) continue;
    const replies = buildReplies(record);
    const status = record.duplicate
      ? 'UNSUPPORTED_BLOCKED'
      : (record.done ? 'RESOLVED' : (record.anchor.anchored ? 'ANCHORED' : 'ORPHAN'));
    const doneResolvedReopenedState = record.done
      ? 'resolved'
      : (record.reopened ? 'reopened' : 'active');
    const code = status === 'RESOLVED'
      ? 'RTK_COMMENT_RESOLVED'
      : (status === 'ANCHORED' ? 'RTK_COMMENT_ANCHORED' : (status === 'ORPHAN' ? 'RTK_COMMENT_ORPHAN' : 'RTK_COMMENT_UNSUPPORTED'));
    const thread = {
      kind: 'CommentThread',
      threadId: `rtk-comment-${record.rawId}`,
      commentId: record.rawId,
      durableId: record.durableId,
      parentThreadId: '',
      replies,
      doneResolvedReopenedState,
      authorPersonIdentity: {
        author: record.author,
        initials: record.initials,
        people: metadata.people,
      },
      date: record.date,
      anchorStart: record.anchor.anchorStart ?? null,
      anchorEnd: record.anchor.anchorEnd ?? null,
      quotedAnchorText: record.anchor.quotedAnchorText || '',
      relatedRevision: record.anchor.relatedRevision || null,
      body: record.body,
      bodyExcerpt: record.body.slice(0, 160),
      orderingKey: record.ordinal,
      status,
      placement: {
        outcome: status,
        anchored: record.anchor.anchored === true,
        selectorStack: {
          exactQuote: record.anchor.quotedAnchorText || '',
          prefix: '',
          suffix: '',
          utf16Position: record.anchor.anchorStart ?? null,
        },
      },
      reasonCodes: [code],
      modernMetadata: cloneJsonSafe(record.metadata || {}),
      sourceXmlProvenance: record.sourceXmlProvenance,
    };
    const admitted = admitWorkerOutput(budgetState, reasons, 'reviewIr.commentThreads', thread);
    if (admitted) {
      threads.push(thread);
      // ADMIT-01 (B1): success-shaped per-comment reason is published ONLY for
      // admitted threads. A dropped thread must never carry ANCHORED/ORPHAN/...
      // success reasons while it is absent from reviewIr.commentThreads.
      reasons.push(reason(code, `comments.${record.rawId}`, 'Comment lane was parsed before text classification and kept independent.', {
        threadId: thread.threadId,
      }));
    } else {
      // ADMIT-01 (B1): dropped threads get a typed budget reason instead of a
      // success-shaped outcome, so the comment lane is marked BLOCKED_RESOURCE.
      reasons.push(reason('RTK_BUDGET_EXCEEDED', `comments.${record.rawId}`, 'Comment thread exceeded the parser worker output budget and was dropped from the ReviewIR comment lane.', {
        threadId: thread.threadId,
      }));
    }
  }
  const observedKeys = new Set();
  for (const record of records) {
    for (const key of [record.rawId, record.paraId, record.durableId].filter(Boolean)) observedKeys.add(key);
  }
  for (const missing of expected) {
    if (!missing.commentId && !missing.durableId) continue;
    if (observedKeys.has(missing.commentId) || observedKeys.has(missing.durableId)) continue;
    const key = missing.commentId || missing.durableId;
    const thread = {
      kind: 'CommentThread',
      threadId: `rtk-comment-missing-${key}`,
      commentId: missing.commentId,
      durableId: missing.durableId,
      parentThreadId: '',
      replies: [],
      doneResolvedReopenedState: 'deleted-or-missing',
      authorPersonIdentity: { author: '', initials: '', people: metadata.people },
      date: '',
      anchorStart: null,
      anchorEnd: null,
      quotedAnchorText: '',
      relatedRevision: null,
      body: '',
      bodyExcerpt: missing.bodyExcerpt,
      orderingKey: records.length + threads.length,
      status: 'UNSUPPORTED_BLOCKED',
      placement: {
        outcome: 'UNSUPPORTED_BLOCKED',
        anchored: false,
        selectorStack: {
          exactQuote: '',
          prefix: '',
          suffix: '',
          utf16Position: null,
        },
      },
      reasonCodes: ['RTK_COMMENT_UNSUPPORTED'],
      modernMetadata: {},
      sourceXmlProvenance: null,
    };
    const missingAdmitted = admitWorkerOutput(budgetState, reasons, 'reviewIr.commentThreads', thread);
    if (missingAdmitted) {
      threads.push(thread);
    }
    // RTK_COMMENT_UNSUPPORTED for missing threads is an inventory diagnostic,
    // not a success-shaped per-comment outcome; keep it on both paths so the
    // dropped-vs-missing distinction stays typed and never silently drops.
    reasons.push(reason('RTK_COMMENT_UNSUPPORTED', `comments.${key}`, 'Expected comment thread is missing from the returned package and cannot be silently dropped.', {
      threadId: thread.threadId,
    }));
    if (!missingAdmitted) {
      reasons.push(reason('RTK_BUDGET_EXCEEDED', `comments.${key}`, 'Missing comment thread exceeded the parser worker output budget and was dropped from the ReviewIR comment lane.', {
        threadId: thread.threadId,
      }));
    }
  }
  return { commentThreads: threads, reasons };
}

function buildCommentGraphCapability(input, partNames, commentThreads) {
  const replyCount = commentThreads.reduce((total, thread) => total + thread.replies.length, 0);
  const statusCounts = {};
  for (const thread of commentThreads) {
    statusCounts[thread.status] = (statusCounts[thread.status] || 0) + 1;
  }
  return {
    schemaVersion: 'yalken.rtk.comment-graph-capability.v1',
    status: input.physicalWordReopenVisibility === true
      ? 'SEMANTIC_READBACK_READY_PHYSICAL_VISIBILITY_PROVIDED'
      : 'PARSER_ONLY_NOT_CERTIFIED',
    commentPassAllowed: input.physicalWordReopenVisibility === true
      && commentThreads.length > 0
      && !statusCounts.UNSUPPORTED_BLOCKED,
    noOpSaveCountsAsPass: false,
    physicalWordReopenVisibility: input.physicalWordReopenVisibility === true,
    packageParts: partNames.filter((partName) => partName.startsWith('word/comments') || partName === 'word/people.xml'),
    threadCount: commentThreads.length,
    replyCount,
    durableIdCount: commentThreads.filter((thread) => Boolean(thread.durableId)).length,
    statusCounts,
  };
}

function collectUnsupportedElements(documentScan, budgetState, reasons) {
  const unsupported = [];
  for (const token of documentScan.tokens) {
    if (!DOCUMENT_UNSUPPORTED_ELEMENTS.includes(token.localName)) continue;
    const bodyLevelSectionProperties = token.localName === 'sectPr'
      && token.path.length === 3
      && token.path[0] === 'document'
      && token.path[1] === 'body';
    const item = {
      kind: 'unsupported-element',
      partName: token.partName,
      elementName: token.localName,
      relationshipId: attr(token, 'id'),
      typedDiagnostic: bodyLevelSectionProperties
        ? 'RTK_WORD_BODY_SECTION_PROPERTIES_INVENTORY'
        : (token.localName === 'AlternateContent'
          ? 'RTK_MCE_ALTERNATE_CONTENT_MANUAL'
          : 'RTK_STRUCTURAL_OR_FORMAT_ELEMENT_MANUAL'),
      preservationPolicy: bodyLevelSectionProperties
        ? 'inventory-only-word-section-defaults'
        : 'preserve-evidence-and-report-loss',
      writerAuthorityImpact: bodyLevelSectionProperties ? 'inventory-only' : 'blocking',
      sourceXmlProvenance: provenance(token),
    };
    if (
      admitBudgetCount(
        budgetState,
        reasons,
        'candidates',
        budgetState.budgets.maxCandidates,
        'reviewIr.opaqueUnsupported',
        'Unsupported candidate budget exceeded.',
      )
      && admitWorkerOutput(budgetState, reasons, 'reviewIr.opaqueUnsupported', item)
    ) {
      unsupported.push(item);
    }
  }
  return unsupported;
}

function sourceModeFor(input, documentXml, documentScan, textRevisions, moveRevisions, propertyRevisions) {
  const hasRevisions = textRevisions.length > 0 || moveRevisions.length > 0 || propertyRevisions.length > 0;
  const observedText = hasRevisions
    ? rawString(input.rejectedTrackedText || wordDocumentText(documentXml, documentScan, { skipInsertedRevisions: true }) || trackedRejectedText(documentXml, documentScan))
    : rawString(input.finalText || wordDocumentText(documentXml, documentScan) || stripTagsToText(documentXml));
  const hasUntrackedDrift = input.untrackedDrift === true
    || (
      rawString(input.baselineFinalText)
      && observedText !== rawString(input.baselineFinalText)
    );
  if (hasRevisions && hasUntrackedDrift) return 'MIXED';
  if (hasRevisions) return 'TRACKED';
  return 'CLEAN';
}

function blockingReason(reasons) {
  return reasons.find((item) => [
    'RTK_BUDGET_EXCEEDED',
    'RTK_HOSTILE_PACKAGE_BLOCKED',
    'RTK_XML_MALFORMED_BLOCKED',
    'RTK_ZIP_CRC_MISMATCH',
    'RTK_ZIP_CRC_EVIDENCE_MISSING',
    'RTK_ZIP_LOCAL_CENTRAL_MISMATCH',
    'RTK_ZIP_REGION_OVERLAP',
    'RTK_ZIP_FAKE_EOCD',
  ].includes(item.code));
}

// ADMIT-01 laneCompleteness for V2 ReviewIR. The marker covers both the
// short lane names (text/structure/comments) asserted by abort contracts and
// the V2 IR field names (textRevisions/structureChanges/commentThreads) so the
// additive field is usable by every caller. A lane is BLOCKED_RESOURCE when a
// blocking diagnostic references that lane's field namespace.
const RTK_V2_BLOCKING_CODES = Object.freeze(new Set([
  'RTK_BUDGET_EXCEEDED',
  'RTK_HOSTILE_PACKAGE_BLOCKED',
  'RTK_XML_MALFORMED_BLOCKED',
  'RTK_ZIP_CRC_MISMATCH',
  'RTK_ZIP_CRC_EVIDENCE_MISSING',
  'RTK_ZIP_LOCAL_CENTRAL_MISMATCH',
  'RTK_ZIP_REGION_OVERLAP',
  'RTK_ZIP_FAKE_EOCD',
]));

function v2LaneStatus(reasons, laneFields) {
  for (const item of reasons) {
    if (!RTK_V2_BLOCKING_CODES.has(item.code)) continue;
    const field = rawString(item.field);
    if (laneFields.some((prefix) => field === prefix || field.startsWith(`${prefix}.`) || field.startsWith(prefix))) {
      return 'BLOCKED_RESOURCE';
    }
  }
  return 'COMPLETE';
}

function buildLaneCompletenessV2(reasons) {
  const text = v2LaneStatus(reasons, ['textRevisions', 'reviewIr.textRevisions']);
  const structure = v2LaneStatus(reasons, ['structureChanges', 'reviewIr.structureChanges']);
  const comments = v2LaneStatus(reasons, ['commentThreads', 'reviewIr.commentThreads', 'comments']);
  return {
    text,
    structure,
    comments,
    textRevisions: text,
    structureChanges: structure,
    commentThreads: comments,
  };
}

function emptyReviewIr(diagnostics = []) {
  return {
    schemaVersion: RTK_REVIEW_IR_V2_SCHEMA,
    sourceMode: 'CLEAN',
    textRevisions: [],
    moveRevisions: [],
    propertyRevisions: [],
    structureChanges: [],
    commentThreads: [],
    comments: [],
    formattingDeltas: [],
    opaqueUnsupported: [],
    changes: [],
    diagnostics,
    conservation: {
      immutableDerivedAnalysisOnly: true,
      canWriteManuscript: false,
      canApply: false,
      commentLaneIndependentFromTextLane: true,
      unknownElementsNeverSilentlyDropped: true,
    },
  };
}

export function parseReviewTransportPackageV2(input = {}, ports = {}) {
  const cryptoPort = resolveCryptoPort(ports.cryptoPort);
  const budgetResolution = resolveBudgetsWithClamps(input.budgets);
  const budgets = budgetResolution.effective;
  const budgetClamps = budgetResolution.clampedFields;
  const effectiveBudgetDigestValue = effectiveBudgetDigest(budgets);
  // Effective budget evidence attached to EVERY result path (blocked or ok) so
  // the exact min-clamped budget + digest + clamp record is observable
  // downstream regardless of the parse outcome (F-11/P1-02).
  const budgetEvidence = {
    effectiveBudgets: budgets,
    effectiveBudgetDigest: effectiveBudgetDigestValue,
    budgetClamps,
  };
  const initialReasons = [];
  if (!cryptoPort.ok) {
    initialReasons.push(reason('RTK_HOSTILE_PACKAGE_BLOCKED', 'cryptoPort', 'CryptoPort is required for package analysis digests.', {
      missing: cryptoPort.missing,
    }));
    return {
      ok: false,
      schemaVersion: RTK_RETURNED_REVIEW_ANALYSIS_V2_SCHEMA,
      status: 'blocked',
      code: 'RTK_HOSTILE_PACKAGE_BLOCKED',
      canWriteManuscript: false,
      canApply: false,
      sourceMode: 'CLEAN',
      reviewIr: emptyReviewIr(initialReasons),
      laneCompleteness: buildLaneCompletenessV2(initialReasons),
      reasons: initialReasons,
      ...budgetEvidence,
    };
  }

  const budgetState = createParserBudgetState(budgets, cryptoPort);
  const normalized = normalizePackageParts(input.parts, budgets, cryptoPort);
  const parts = normalized.admittedParts;
  const partNames = Object.keys(parts).sort();
  const reasons = [...normalized.reasons];
  for (const required of REQUIRED_PARTS) {
    if (!Object.hasOwn(parts, required)) {
      reasons.push(reason('RTK_HOSTILE_PACKAGE_BLOCKED', `parts.${required}`, 'Required OOXML part is missing.', {
        partName: required,
      }));
    }
  }
  reasons.push(...evaluateZipInventory(input.zipInventory, parts, cryptoPort, budgets.maxZipEntries));
  const relationships = parseRelationshipParts(parts, budgets, cryptoPort);
  const contentTypes = parseContentTypes(parts['[Content_Types].xml'], budgets, cryptoPort);
  reasons.push(...relationships.reasons, ...contentTypes.reasons);
  const authorityCarrier = analyzeAuthorityCarriers(input, parts, budgets, cryptoPort, budgetState);
  reasons.push(...authorityCarrier.reasons);

  const documentXml = rawString(parts['word/document.xml']);
  const documentScan = parseXmlPart('word/document.xml', documentXml, budgets, cryptoPort, budgetState);
  reasons.push(...documentScan.diagnostics);
  const scans = {
    comments: {
      xml: rawString(parts['word/comments.xml']),
      ...parseXmlPart('word/comments.xml', rawString(parts['word/comments.xml']), budgets, cryptoPort, budgetState),
    },
    commentsExtended: {
      xml: rawString(parts['word/commentsExtended.xml']),
      ...parseXmlPart('word/commentsExtended.xml', rawString(parts['word/commentsExtended.xml']), budgets, cryptoPort, budgetState),
    },
    commentsIds: {
      xml: rawString(parts['word/commentsIds.xml']),
      ...parseXmlPart('word/commentsIds.xml', rawString(parts['word/commentsIds.xml']), budgets, cryptoPort, budgetState),
    },
    commentsExtensible: {
      xml: rawString(parts['word/commentsExtensible.xml']),
      ...parseXmlPart('word/commentsExtensible.xml', rawString(parts['word/commentsExtensible.xml']), budgets, cryptoPort, budgetState),
    },
    people: {
      xml: rawString(parts['word/people.xml']),
      ...parseXmlPart('word/people.xml', rawString(parts['word/people.xml']), budgets, cryptoPort, budgetState),
    },
  };

  const opaqueUnsupported = [
    ...collectOpaqueUnsupportedParts(partNames),
    ...collectUnsupportedElements(documentScan, budgetState, reasons),
  ];
  for (const item of opaqueUnsupported) {
    reasons.push(reason('RTK_COMMENT_UNSUPPORTED', `opaque.${item.partName}.${item.elementName || item.kind}`, 'Unsupported OOXML surface is preserved as typed diagnostics.', {
      typedDiagnostic: item.typedDiagnostic,
      preservationPolicy: item.preservationPolicy,
    }));
  }

  const blocked = blockingReason(reasons);
  if (blocked) {
    return {
      ok: false,
      schemaVersion: RTK_RETURNED_REVIEW_ANALYSIS_V2_SCHEMA,
      status: 'blocked',
      code: blocked.code,
      canWriteManuscript: false,
      canApply: false,
      sourceMode: 'CLEAN',
      packageInventory: {
        partNames,
        relationships: relationships.relationships,
        contentTypes: contentTypes.contentTypes,
        authorityCarriers: authorityCarrier.carriers,
        selectedAuthorityCarrier: authorityCarrier.selectedCarrier,
        opaqueUnsupported,
      },
      authorityCarrier,
      exactAuthority: authorityCarrier.exactAuthority,
      reviewIr: emptyReviewIr(reasons),
      laneCompleteness: buildLaneCompletenessV2(reasons),
      reasons,
      ...budgetEvidence,
    };
  }

  const textRevisions = parseTextRevisions(documentXml, documentScan, cryptoPort, budgets, budgetState, reasons);
  const moveRevisions = parseMoveRevisions(documentXml, documentScan, cryptoPort, budgetState, reasons);
  const propertyRevisions = parsePropertyRevisions(documentXml, documentScan, budgetState, reasons);
  const structureChanges = parseStructureChanges(documentScan, budgetState, reasons);
  const formattingDeltas = parseFormattingDeltas(documentXml, documentScan, budgetState, reasons);
  const comments = parseCommentThreads(input, documentXml, documentScan, scans, cryptoPort, budgetState);
  reasons.push(...comments.reasons);
  const semanticBudgetBlocked = blockingReason(reasons);
  if (semanticBudgetBlocked) {
    return {
      ok: false,
      schemaVersion: RTK_RETURNED_REVIEW_ANALYSIS_V2_SCHEMA,
      status: 'blocked',
      code: semanticBudgetBlocked.code,
      canWriteManuscript: false,
      canApply: false,
      sourceMode: 'CLEAN',
      packageInventory: {
        partNames,
        relationships: relationships.relationships,
        contentTypes: contentTypes.contentTypes,
        authorityCarriers: authorityCarrier.carriers,
        selectedAuthorityCarrier: authorityCarrier.selectedCarrier,
        opaqueUnsupported,
      },
      authorityCarrier,
      exactAuthority: authorityCarrier.exactAuthority,
      reviewIr: emptyReviewIr(reasons),
      laneCompleteness: buildLaneCompletenessV2(reasons),
      reasons,
      ...budgetEvidence,
    };
  }
  if (moveRevisions.length > 0) {
    reasons.push(reason('RTK_BLOCKED_MOVE_REVISION', 'moveRevisions', 'Move revisions remain non-EXACT structural evidence.'));
  }
  if (propertyRevisions.length > 0 || structureChanges.length > 0) {
    reasons.push(reason('RTK_BLOCKED_STRUCTURAL', 'structureChanges', 'Structure and property changes require manual review.'));
  }
  const sourceMode = sourceModeFor(input, documentXml, documentScan, textRevisions, moveRevisions, propertyRevisions);
  if (sourceMode === 'CLEAN') reasons.push(reason('RTK_MANUAL_CLEAN_RETURN', 'sourceMode', 'CLEAN return remains manual review in B02.'));
  if (sourceMode === 'MIXED') reasons.push(reason('RTK_MANUAL_MIXED_RETURN', 'sourceMode', 'MIXED return remains manual review in B02.'));
  const commentGraphCapability = buildCommentGraphCapability(input, partNames, comments.commentThreads);

  const reviewIr = {
    schemaVersion: RTK_REVIEW_IR_V2_SCHEMA,
    sourceMode,
    textRevisions,
    moveRevisions,
    propertyRevisions,
    structureChanges,
    commentThreads: comments.commentThreads,
    comments: comments.commentThreads,
    formattingDeltas,
    opaqueUnsupported,
    authorityCarrier,
    commentGraphCapability,
    changes: textRevisions,
    diagnostics: reasons,
    conservation: {
      immutableDerivedAnalysisOnly: true,
      canWriteManuscript: false,
      canApply: false,
      commentLaneIndependentFromTextLane: true,
      revisionsFormattingStructureSeparateLanes: true,
      unknownElementsNeverSilentlyDropped: true,
      noFuzzyApplyAuthority: true,
    },
  };
  const packageInventory = {
    partNames,
    requiredPartsPresent: REQUIRED_PARTS.every((partName) => Object.hasOwn(parts, partName)),
    commentParts: partNames.filter((partName) => partName.startsWith('word/comments')),
    relationships: relationships.relationships,
    contentTypes: contentTypes.contentTypes,
    authorityCarriers: authorityCarrier.carriers,
    selectedAuthorityCarrier: authorityCarrier.selectedCarrier,
    opaqueUnsupported,
  };
  const parserProfile = {
    schemaVersion: 'yalken.rtk.parser-profile.v2',
    implementationId: RTK_REVIEW_TRANSPORT_PACKAGE_PARSER_V2_BUILD,
    profileId: RTK_REVIEW_TRANSPORT_PACKAGE_PARSER_V2_PROFILE,
    namespaceAware: true,
    packageRelationshipAware: true,
    regexXmlParser: false,
    generalXmlPlatform: false,
    contractVersion: 'ReviewIRV2',
    budgets,
    admittedParts: partNames,
    semanticFeatureFlags: [
      'text-revision-lane',
      'move-revision-lane',
      'property-revision-lane',
      'structure-lane',
      'comment-thread-graph',
      'formatting-delta-lane',
      'opaque-unsupported-lane',
      'hostile-package-gate',
      'custom-document-property-authority-carrier',
    ],
  };
  const semanticProjection = {
    sourceMode,
    packageInventory,
    textRevisions: textRevisions.map((item) => ({
      operation: item.operation,
      nativeRevisionId: item.nativeRevisionId,
      textDigest: item.textDigest,
      replacementGroupId: item.replacementGroupId,
    })),
    moveRevisions: moveRevisions.map((item) => ({
      nativeRevisionId: item.nativeRevisionId,
      hasMoveFrom: Boolean(item.moveFrom),
      hasMoveTo: Boolean(item.moveTo),
    })),
    propertyRevisions: propertyRevisions.map((item) => item.propertyKind),
    structureChanges: structureChanges.map((item) => item.structureKind),
    commentThreads: comments.commentThreads.map((thread) => ({
      commentId: thread.commentId,
      durableId: thread.durableId,
      status: thread.status,
      doneResolvedReopenedState: thread.doneResolvedReopenedState,
      relatedRevision: thread.relatedRevision
        ? {
          kind: thread.relatedRevision.kind,
          nativeRevisionId: thread.relatedRevision.nativeRevisionId,
        }
        : null,
      replyDigests: thread.replies.map((reply) => reply.bodyDigest),
      bodyDigest: cryptoPort.sha256Json({ commentId: thread.commentId, body: thread.body }),
    })),
    commentGraphCapability,
    authorityCarrier: {
      status: authorityCarrier.status,
      selectedCarrier: authorityCarrier.selectedCarrier
        ? {
          carrier: authorityCarrier.selectedCarrier.carrier,
          propertyName: authorityCarrier.selectedCarrier.propertyName,
          verified: authorityCarrier.selectedCarrier.verified,
          validSignedLocator: authorityCarrier.selectedCarrier.validSignedLocator,
          payloadDigest: authorityCarrier.selectedCarrier.payloadDigest,
          signatureDigest: authorityCarrier.selectedCarrier.signatureDigest,
          baselineBinding: authorityCarrier.selectedCarrier.baselineBinding,
        }
        : null,
      exactAuthority: authorityCarrier.exactAuthority,
    },
    formattingDeltas: formattingDeltas.map((delta) => ({
      formatKind: delta.formatKind,
      values: delta.values,
    })),
    opaqueUnsupported: opaqueUnsupported.map((item) => ({
      partName: item.partName,
      elementName: item.elementName,
      typedDiagnostic: item.typedDiagnostic,
    })),
  };
  admitWorkerOutput(budgetState, reasons, 'analysis.semanticProjection', semanticProjection);
  const outputBudgetBlocked = blockingReason(reasons);
  if (outputBudgetBlocked) {
    return {
      ok: false,
      schemaVersion: RTK_RETURNED_REVIEW_ANALYSIS_V2_SCHEMA,
      status: 'blocked',
      code: outputBudgetBlocked.code,
      canWriteManuscript: false,
      canApply: false,
      sourceMode,
      packageInventory,
      commentGraphCapability,
      authorityCarrier,
      exactAuthority: authorityCarrier.exactAuthority,
      reviewIr: emptyReviewIr(reasons),
      parserProfile,
      laneCompleteness: buildLaneCompletenessV2(reasons),
      reasons,
      ...budgetEvidence,
    };
  }
  const supportedSemanticDigest = cryptoPort.sha256Json(semanticProjection);
  const parserProfileDigest = cryptoPort.sha256Json(parserProfile);
  const analysisDigest = cryptoPort.sha256Json({
    schemaVersion: RTK_RETURNED_REVIEW_ANALYSIS_V2_SCHEMA,
    supportedSemanticDigest,
    parserProfileDigest,
    sourceMode,
  });
  return {
    ok: true,
    schemaVersion: RTK_RETURNED_REVIEW_ANALYSIS_V2_SCHEMA,
    status: 'review-ir-ready',
    code: 'RTK_NO_WRITE_ANALYSIS_READY',
    canWriteManuscript: false,
    canApply: false,
    sourceMode,
    packageInventory,
    commentGraphCapability,
    authorityCarrier,
    exactAuthority: authorityCarrier.exactAuthority,
    reviewIr,
    parserProfile,
    laneCompleteness: buildLaneCompletenessV2(reasons),
    supportedSemanticDigest,
    parserProfileDigest,
    analysisDigest,
    cacheKey: cryptoPort.sha256Json({
      returnedArtifactSha256: rawString(input.returnedArtifactSha256),
      parserProfileDigest,
      manifestDigest: rawString(input.manifestDigest),
    }),
    effectiveBudgets: budgets,
    effectiveBudgetDigest: effectiveBudgetDigestValue,
    budgetClamps,
    reasons: [
      reason('RTK_NO_WRITE_ANALYSIS_READY', 'reviewIr', 'Package-aware ReviewIRV2 parser produced immutable analysis without write authority.'),
      ...reasons,
    ],
  };
}
