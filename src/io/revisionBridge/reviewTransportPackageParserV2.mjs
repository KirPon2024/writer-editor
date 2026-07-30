import {
  RTK_RETURNED_REVIEW_ANALYSIS_V2_SCHEMA,
  RTK_REVIEW_IR_V2_SCHEMA,
  RTK_V6_BUDGETS,
  stableJson,
} from './reviewTransportCore.mjs';

export const RTK_REVIEW_TRANSPORT_PACKAGE_PARSER_V2_PROFILE =
  'yalken.rtk.package-aware-review-ir-parser.v2.b02';
export const RTK_REVIEW_TRANSPORT_PACKAGE_PARSER_V2_BUILD =
  'bounded-namespace-package-scanner-no-regex-b02';

const W_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const REL_NS = 'http://schemas.openxmlformats.org/package/2006/relationships';
const CONTENT_TYPES_NS = 'http://schemas.openxmlformats.org/package/2006/content-types';
const W15_NS = 'http://schemas.microsoft.com/office/word/2012/wordml';
const W16CID_NS = 'http://schemas.microsoft.com/office/word/2016/wordml/cid';

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

function normalizeBudgets(input = {}) {
  return {
    ...RTK_V6_BUDGETS,
    ...Object.fromEntries(Object.entries(input).filter(([, value]) => (
      Number.isSafeInteger(value) && value > 0
    ))),
  };
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

function splitQName(qName) {
  const text = rawString(qName);
  const colon = text.indexOf(':');
  if (colon < 0) return { prefix: '', localName: text };
  return {
    prefix: text.slice(0, colon),
    localName: text.slice(colon + 1),
  };
}

function decodeEntities(text) {
  return rawString(text)
    .split('&lt;').join('<')
    .split('&gt;').join('>')
    .split('&amp;').join('&')
    .split('&quot;').join('"')
    .split('&apos;').join("'");
}

function parseRawAttributes(attrText, budgets, cryptoPort, partName) {
  const attributes = [];
  const diagnostics = [];
  let cursor = 0;
  while (cursor < attrText.length) {
    while (cursor < attrText.length && attrText[cursor].trim() === '') cursor += 1;
    if (cursor >= attrText.length || attrText[cursor] === '/') break;
    const name = readName(attrText, cursor);
    if (!name.value) break;
    cursor = name.next;
    while (cursor < attrText.length && attrText[cursor].trim() === '') cursor += 1;
    if (attrText[cursor] !== '=') break;
    cursor += 1;
    while (cursor < attrText.length && attrText[cursor].trim() === '') cursor += 1;
    const quote = attrText[cursor];
    if (quote !== '"' && quote !== "'") break;
    cursor += 1;
    const start = cursor;
    while (cursor < attrText.length && attrText[cursor] !== quote) cursor += 1;
    const value = decodeEntities(attrText.slice(start, cursor));
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

function rawTagLocalName(raw) {
  const nameStart = raw.startsWith('/') ? 1 : 0;
  return splitQName(readName(raw, nameStart).value).localName;
}

function parseXmlPart(partName, xml, budgets, cryptoPort) {
  const text = rawString(xml);
  const tokens = [];
  const diagnostics = [];
  const stack = [];
  let cursor = 0;
  while (cursor < text.length) {
    const open = text.indexOf('<', cursor);
    if (open < 0) break;
    const specialSkip = skipSpecialXml(text, open);
    if (specialSkip < 0) {
      diagnostics.push(reason('RTK_XML_MALFORMED_BLOCKED', partName, 'XML special block is not closed.'));
      break;
    }
    if (specialSkip > 0) {
      cursor = specialSkip;
      continue;
    }
    const close = text.indexOf('>', open + 1);
    if (close < 0) {
      diagnostics.push(reason('RTK_XML_MALFORMED_BLOCKED', partName, 'XML tag is not closed.'));
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
    const close = text.indexOf('>', open + 1);
    if (close < 0) break;
    const local = rawTagLocalName(text.slice(open + 1, close).trim());
    if (local === 'tab') output += '\t';
    if (local === 'br' || local === 'cr') output += '\n';
    cursor = close + 1;
  }
  return decodeEntities(output);
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

function evaluateZipInventory(inventory = {}, parts = {}, cryptoPort) {
  const reasons = [];
  const entries = Array.isArray(inventory.entries) ? inventory.entries.filter(isPlainObject) : [];
  if (entries.length > RTK_V6_BUDGETS.maxZipEntries) {
    reasons.push(reason('RTK_BUDGET_EXCEEDED', 'zip.entries', 'ZIP entry count exceeds V6 budget.'));
  }
  if (Number(inventory.fakeEocdCount || 0) > 0 || Number(inventory.eocdCount || 1) > 1) {
    reasons.push(reason('RTK_ZIP_FAKE_EOCD', 'zip.eocd', 'Fake or duplicate EOCD marker is blocked.'));
  }
  const ranges = [];
  for (const entry of entries) {
    const partName = rawString(entry.name);
    const centralCrc = Number.isSafeInteger(entry.centralCrc32) ? entry.centralCrc32 : entry.crc32;
    const localCrc = Number.isSafeInteger(entry.localCrc32) ? entry.localCrc32 : centralCrc;
    if (Number.isSafeInteger(centralCrc) && Number.isSafeInteger(localCrc) && centralCrc !== localCrc) {
      reasons.push(reason('RTK_ZIP_LOCAL_CENTRAL_MISMATCH', `zip.${partName}.crc32`, 'ZIP local and central metadata disagree.', { partName }));
    }
    if (cryptoPort.crc32 && Object.hasOwn(parts, partName) && Number.isSafeInteger(centralCrc)) {
      const actual = cryptoPort.crc32(parts[partName]);
      if (actual !== centralCrc) {
        reasons.push(reason('RTK_ZIP_CRC_MISMATCH', `zip.${partName}.crc32`, 'Admitted part CRC does not match package metadata.', {
          partName,
          expected: centralCrc,
          actual,
        }));
      }
    }
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

function parseTextRevisions(documentXml, documentScan, cryptoPort) {
  const revisions = [];
  for (const token of documentScan.tokens) {
    if (!isWordToken(token, 'ins') && !isWordToken(token, 'del')) continue;
    const operation = token.localName === 'ins' ? 'insert' : 'delete';
    const text = tokenText(documentXml, token);
    revisions.push({
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
    });
  }
  const ordered = revisions.slice().sort((left, right) => (
    left.sourceXmlProvenance.openStart - right.sourceXmlProvenance.openStart
  ));
  for (let index = 0; index < ordered.length - 1; index += 1) {
    const left = ordered[index];
    const right = ordered[index + 1];
    const distance = right.sourceXmlProvenance.openStart - left.sourceXmlProvenance.closeEnd;
    if (left.operation === 'delete' && right.operation === 'insert' && distance >= 0 && distance < 256) {
      const groupId = cryptoPort.sha256Text(stableJson({
        left: left.nativeRevisionId,
        right: right.nativeRevisionId,
        deleted: left.textDigest,
        inserted: right.textDigest,
      }));
      left.replacementGroupId = groupId;
      right.replacementGroupId = groupId;
    }
  }
  return ordered;
}

function parseMoveRevisions(documentXml, documentScan, cryptoPort) {
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
    moves.push(item);
  }
  return moves;
}

function childTokensWithin(documentScan, parent) {
  return documentScan.tokens.filter((token) => (
    token.openStart >= parent.openEnd && token.closeEnd <= parent.closeStart
  ));
}

function parsePropertyRevisions(documentXml, documentScan) {
  const revisions = [];
  for (const token of documentScan.tokens) {
    if (!['rPrChange', 'pPrChange', 'numPrChange'].includes(token.localName)) continue;
    revisions.push({
      kind: 'PropertyRevision',
      propertyKind: token.localName,
      nativeRevisionId: attr(token, 'id'),
      author: attr(token, 'author'),
      date: attr(token, 'date'),
      sourceXmlProvenance: provenance(token),
      rawTextExcerpt: tokenText(documentXml, token).slice(0, 96),
      classification: 'MANUAL_REVIEW',
      reasonCode: 'RTK_BLOCKED_STRUCTURAL',
    });
  }
  return revisions;
}

function parseStructureChanges(documentScan) {
  const changes = [];
  for (const token of documentScan.tokens) {
    if (['pPrChange', 'tbl', 'sectPr', 'footnoteReference', 'endnoteReference'].includes(token.localName)) {
      changes.push({
        kind: 'StructureChange',
        structureKind: token.localName,
        sourceXmlProvenance: provenance(token),
        classification: 'STRUCTURAL_BLOCKED',
        reasonCode: 'RTK_BLOCKED_STRUCTURAL',
      });
    }
    if (token.localName === 'moveFrom' || token.localName === 'moveTo') {
      changes.push({
        kind: 'StructureChange',
        structureKind: 'moveRevision',
        sourceXmlProvenance: provenance(token),
        classification: 'STRUCTURAL_BLOCKED',
        reasonCode: 'RTK_BLOCKED_MOVE_REVISION',
      });
    }
  }
  return changes;
}

function firstChildValue(children, localName, attrName = 'val') {
  const found = children.find((token) => token.localName === localName);
  return found ? attr(found, attrName) : '';
}

function parseFormattingDeltas(documentXml, documentScan) {
  const deltas = [];
  for (const token of documentScan.tokens) {
    if (token.localName !== 'rPr' && token.localName !== 'pPr' && token.localName !== 'hyperlink') continue;
    const children = childTokensWithin(documentScan, token);
    if (token.localName === 'hyperlink') {
      deltas.push({
        kind: 'FormattingDelta',
        formatKind: 'hyperlink',
        values: {
          relationshipId: attr(token, 'id', 'http://schemas.openxmlformats.org/officeDocument/2006/relationships') || attr(token, 'id'),
          anchor: attr(token, 'anchor'),
          text: tokenText(documentXml, token),
        },
        sourceXmlProvenance: provenance(token),
        classification: 'MANUAL_REVIEW',
      });
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
    deltas.push({
      kind: 'FormattingDelta',
      formatKind: token.localName,
      values,
      sourceXmlProvenance: provenance(token),
      classification: 'MANUAL_REVIEW',
    });
  }
  return deltas;
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

function parseCommentThreads(documentXml, documentScan, scans, cryptoPort) {
  const anchors = commentAnchorMap(documentXml, documentScan);
  const metadata = collectModernCommentMetadata(scans);
  const reasons = [...scans.comments.diagnostics, ...scans.commentsExtended.diagnostics, ...scans.commentsIds.diagnostics, ...scans.commentsExtensible.diagnostics, ...scans.people.diagnostics];
  const records = [];
  const seenIds = new Set();
  let ordinal = 0;
  for (const token of scans.comments.tokens.filter((item) => item.localName === 'comment')) {
    const rawId = attr(token, 'id') || String(ordinal);
    const paraId = attr(token, 'paraId') || rawId;
    const meta = metadata.metadataByParaId.get(paraId) || metadata.metadataByParaId.get(rawId) || {};
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
      doneResolvedReopenedState: record.done ? 'resolved' : 'active-or-reopened',
      authorPersonIdentity: {
        author: record.author,
        initials: record.initials,
        people: metadata.people,
      },
      date: record.date,
      anchorStart: record.anchor.anchorStart ?? null,
      anchorEnd: record.anchor.anchorEnd ?? null,
      quotedAnchorText: record.anchor.quotedAnchorText || '',
      relatedRevision: '',
      body: record.body,
      bodyExcerpt: record.body.slice(0, 160),
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
    threads.push(thread);
    reasons.push(reason(code, `comments.${record.rawId}`, 'Comment lane was parsed before text classification and kept independent.', {
      threadId: thread.threadId,
    }));
  }
  return { commentThreads: threads, reasons };
}

function collectUnsupportedElements(documentScan) {
  const unsupported = [];
  for (const token of documentScan.tokens) {
    if (!DOCUMENT_UNSUPPORTED_ELEMENTS.includes(token.localName)) continue;
    unsupported.push({
      kind: 'unsupported-element',
      partName: token.partName,
      elementName: token.localName,
      relationshipId: attr(token, 'id'),
      typedDiagnostic: token.localName === 'AlternateContent'
        ? 'RTK_MCE_ALTERNATE_CONTENT_MANUAL'
        : 'RTK_STRUCTURAL_OR_FORMAT_ELEMENT_MANUAL',
      preservationPolicy: 'preserve-evidence-and-report-loss',
      sourceXmlProvenance: provenance(token),
    });
  }
  return unsupported;
}

function sourceModeFor(input, documentXml, textRevisions, moveRevisions, propertyRevisions) {
  const hasRevisions = textRevisions.length > 0 || moveRevisions.length > 0 || propertyRevisions.length > 0;
  const hasUntrackedDrift = input.untrackedDrift === true
    || (
      rawString(input.baselineFinalText)
      && rawString(input.finalText || stripTagsToText(documentXml)) !== rawString(input.baselineFinalText)
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
    'RTK_ZIP_LOCAL_CENTRAL_MISMATCH',
    'RTK_ZIP_REGION_OVERLAP',
    'RTK_ZIP_FAKE_EOCD',
  ].includes(item.code));
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
  const budgets = normalizeBudgets(input.budgets);
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
      reasons: initialReasons,
    };
  }

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
  reasons.push(...evaluateZipInventory(input.zipInventory, parts, cryptoPort));
  const relationships = parseRelationshipParts(parts, budgets, cryptoPort);
  const contentTypes = parseContentTypes(parts['[Content_Types].xml'], budgets, cryptoPort);
  reasons.push(...relationships.reasons, ...contentTypes.reasons);

  const documentXml = rawString(parts['word/document.xml']);
  const documentScan = parseXmlPart('word/document.xml', documentXml, budgets, cryptoPort);
  reasons.push(...documentScan.diagnostics);
  const scans = {
    comments: {
      xml: rawString(parts['word/comments.xml']),
      ...parseXmlPart('word/comments.xml', rawString(parts['word/comments.xml']), budgets, cryptoPort),
    },
    commentsExtended: {
      xml: rawString(parts['word/commentsExtended.xml']),
      ...parseXmlPart('word/commentsExtended.xml', rawString(parts['word/commentsExtended.xml']), budgets, cryptoPort),
    },
    commentsIds: {
      xml: rawString(parts['word/commentsIds.xml']),
      ...parseXmlPart('word/commentsIds.xml', rawString(parts['word/commentsIds.xml']), budgets, cryptoPort),
    },
    commentsExtensible: {
      xml: rawString(parts['word/commentsExtensible.xml']),
      ...parseXmlPart('word/commentsExtensible.xml', rawString(parts['word/commentsExtensible.xml']), budgets, cryptoPort),
    },
    people: {
      xml: rawString(parts['word/people.xml']),
      ...parseXmlPart('word/people.xml', rawString(parts['word/people.xml']), budgets, cryptoPort),
    },
  };

  const opaqueUnsupported = [
    ...collectOpaqueUnsupportedParts(partNames),
    ...collectUnsupportedElements(documentScan),
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
        opaqueUnsupported,
      },
      reviewIr: emptyReviewIr(reasons),
      reasons,
    };
  }

  const textRevisions = parseTextRevisions(documentXml, documentScan, cryptoPort);
  const moveRevisions = parseMoveRevisions(documentXml, documentScan, cryptoPort);
  const propertyRevisions = parsePropertyRevisions(documentXml, documentScan);
  const structureChanges = parseStructureChanges(documentScan);
  const formattingDeltas = parseFormattingDeltas(documentXml, documentScan);
  const comments = parseCommentThreads(documentXml, documentScan, scans, cryptoPort);
  reasons.push(...comments.reasons);
  if (moveRevisions.length > 0) {
    reasons.push(reason('RTK_BLOCKED_MOVE_REVISION', 'moveRevisions', 'Move revisions remain non-EXACT structural evidence.'));
  }
  if (propertyRevisions.length > 0 || structureChanges.length > 0) {
    reasons.push(reason('RTK_BLOCKED_STRUCTURAL', 'structureChanges', 'Structure and property changes require manual review.'));
  }
  const sourceMode = sourceModeFor(input, documentXml, textRevisions, moveRevisions, propertyRevisions);
  if (sourceMode === 'CLEAN') reasons.push(reason('RTK_MANUAL_CLEAN_RETURN', 'sourceMode', 'CLEAN return remains manual review in B02.'));
  if (sourceMode === 'MIXED') reasons.push(reason('RTK_MANUAL_MIXED_RETURN', 'sourceMode', 'MIXED return remains manual review in B02.'));

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
      replyDigests: thread.replies.map((reply) => reply.bodyDigest),
      bodyDigest: cryptoPort.sha256Json({ commentId: thread.commentId, body: thread.body }),
    })),
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
    reviewIr,
    parserProfile,
    supportedSemanticDigest,
    parserProfileDigest,
    analysisDigest,
    cacheKey: cryptoPort.sha256Json({
      returnedArtifactSha256: rawString(input.returnedArtifactSha256),
      parserProfileDigest,
      manifestDigest: rawString(input.manifestDigest),
    }),
    reasons: [
      reason('RTK_NO_WRITE_ANALYSIS_READY', 'reviewIr', 'Package-aware ReviewIRV2 parser produced immutable analysis without write authority.'),
      ...reasons,
    ],
  };
}
