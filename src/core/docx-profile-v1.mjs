import crypto from 'node:crypto';
import { types as nodeTypes } from 'node:util';
import { createInterchangeIrEnvelope, validateInterchangeIrEnvelope } from './interchange-ir-v1.mjs';
import { inspectParserQuarantine } from './parser-quarantine-v1.mjs';
import zipBuilder from '../export/docx/docxMinBuilder.js';

export const DOCX_PROFILE_ID = 'DOCX_SEMANTIC_BOUNDED_V1';
export const DOCX_PROFILE_SCHEMA_VERSION = 'yalken.docx-semantic-profile.v1';
export const DOCX_PROFILE_LIMITS = Object.freeze({ maxArchiveBytes: 1_048_576, maxParagraphs: 512, maxRuns: 1024, maxTextBytes: 262_144, maxTapeRows: 4096 });
const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const R = 'http://schemas.openxmlformats.org/package/2006/relationships';
const CT = 'http://schemas.openxmlformats.org/package/2006/content-types';
const OFFICE = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument';
const MAIN = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml';
const PARTS = ['[Content_Types].xml', '_rels/.rels', 'word/document.xml'];
const ID_KEYS = ['entityId', 'generation', 'projectId', 'sourceRevision'];
const LEXICAL_LOSS = Object.freeze({ disposition: 'TRANSFORMED_LOSSY', code: 'PACKAGE_LEXICAL_BYTES_NOT_PRESERVED', scope: 'ZIP_AND_XML_LEXICAL_ONLY' });
const typedArrayPrototype = Object.getPrototypeOf(Uint8Array.prototype);
const typedArrayGetters = Object.fromEntries(['buffer', 'byteOffset', 'byteLength'].map(k => [k, Object.getOwnPropertyDescriptor(typedArrayPrototype, k).get]));
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const canonical = value => Array.isArray(value) ? `[${value.map(canonical).join(',')}]` : value && typeof value === 'object' ? `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${canonical(value[k])}`).join(',')}}` : JSON.stringify(value);
const digest = value => hash(Buffer.from(canonical(value)));
const reject = code => { throw new Error(code); };
function freeze(value) {
  if (!value || typeof value !== 'object' || ArrayBuffer.isView(value)) return value;
  for (const child of Object.values(value)) freeze(child);
  return Object.freeze(value);
}
function attempt(fn) {
  try { return fn(); } catch (error) {
    if (!/^E_DOCX_[A-Z_]+$/u.test(error.message)) throw error;
    return freeze({ ok: false, status: 'REJECTED', error: { code: error.message }, semanticProjectionPublished: false });
  }
}
function exact(value, keys) {
  if (!value || nodeTypes.isProxy(value) || Object.getPrototypeOf(value) !== Object.prototype) reject('E_DOCX_OBJECT_SHAPE');
  const actual = Reflect.ownKeys(value);
  if (actual.some(k => typeof k !== 'string') || canonical(actual.sort()) !== canonical([...keys].sort())) reject('E_DOCX_OBJECT_KEYS');
  for (const k of actual) {
    const d = Object.getOwnPropertyDescriptor(value, k);
    if (!d || !Object.hasOwn(d, 'value') || !d.enumerable) reject('E_DOCX_ACCESSOR');
  }
}
function array(value, limit) {
  if (nodeTypes.isProxy(value) || !Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype || value.length > limit) reject('E_DOCX_ARRAY_BUDGET');
  const keys = Reflect.ownKeys(value);
  if (keys.length !== value.length + 1 || keys.some(k => typeof k !== 'string' || (k !== 'length' && !/^(?:0|[1-9][0-9]*)$/u.test(k)))) reject('E_DOCX_ARRAY_SHAPE');
  for (let i = 0; i < value.length; i += 1) {
    const d = Object.getOwnPropertyDescriptor(value, String(i));
    if (!d || !Object.hasOwn(d, 'value') || !d.enumerable) reject('E_DOCX_ARRAY_ACCESSOR');
  }
  return value;
}
function cleanJson(value, depth = 0, budget = { nodes: 0, textBytes: 0 }) {
  if (++budget.nodes > 10_000 || depth > 32) reject('E_DOCX_JSON_BUDGET');
  if (nodeTypes.isProxy(value)) reject('E_DOCX_JSON_TYPE');
  if (typeof value === 'string') {
    budget.textBytes += Buffer.byteLength(value);
    if (budget.textBytes > DOCX_PROFILE_LIMITS.maxArchiveBytes) reject('E_DOCX_JSON_BUDGET');
  }
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return value;
  if (typeof value === 'number' && Number.isFinite(value) && !Object.is(value, -0)) return value;
  if (Array.isArray(value)) return array(value, 10_000).map(v => cleanJson(v, depth + 1, budget));
  if (!value || Object.getPrototypeOf(value) !== Object.prototype) reject('E_DOCX_JSON_TYPE');
  const keys = Reflect.ownKeys(value);
  if (keys.some(k => typeof k !== 'string' || ['__proto__', 'constructor', 'prototype'].includes(k))) reject('E_DOCX_JSON_KEY');
  exact(value, keys);
  return Object.fromEntries(keys.map(k => [k, cleanJson(value[k], depth + 1, budget)]));
}
function xmlText(value) {
  if (typeof value !== 'string' || value !== value.normalize('NFC') || value.includes('\r')) reject('E_DOCX_TEXT_NORMALIZATION');
  for (const ch of value) {
    const n = ch.codePointAt(0);
    if (!(n === 9 || n === 10 || (n >= 32 && n <= 0xd7ff) || (n >= 0xe000 && n <= 0xfffd) || (n >= 0x10000 && n <= 0x10ffff))) reject('E_DOCX_XML_CHARACTER');
  }
  return value;
}
function identity(value) {
  exact(value, ID_KEYS);
  const result = Object.fromEntries(ID_KEYS.map(k => [k, value[k]]));
  const probe = createInterchangeIrEnvelope({ familyId: 'DOCUMENT', identity: result, payload: {} });
  if (!probe.ok) reject('E_DOCX_IDENTITY');
  return result;
}
function documentModel(value) {
  exact(value, ['paragraphs']);
  let runs = 0, textBytes = 0;
  const paragraphs = array(value.paragraphs, DOCX_PROFILE_LIMITS.maxParagraphs).map(p => {
    exact(p, ['alignment', 'outlineLevel', 'runs']);
    if (!['left', 'center', 'right', 'both'].includes(p.alignment)) reject('E_DOCX_ALIGNMENT');
    if (p.outlineLevel !== null && (!Number.isInteger(p.outlineLevel) || p.outlineLevel < 0 || p.outlineLevel > 8)) reject('E_DOCX_OUTLINE');
    const result = array(p.runs, DOCX_PROFILE_LIMITS.maxRuns).map(r => {
      if (++runs > DOCX_PROFILE_LIMITS.maxRuns) reject('E_DOCX_RUN_BUDGET');
      exact(r, ['bold', 'italic', 'text', 'underline']);
      for (const k of ['bold', 'italic', 'underline']) if (typeof r[k] !== 'boolean') reject('E_DOCX_MARK');
      if (typeof r.text !== 'string') reject('E_DOCX_TEXT_NORMALIZATION');
      textBytes += Buffer.byteLength(r.text);
      if (textBytes > DOCX_PROFILE_LIMITS.maxTextBytes) reject('E_DOCX_TEXT_BUDGET');
      xmlText(r.text);
      return { text: r.text, bold: r.bold, italic: r.italic, underline: r.underline };
    });
    return { alignment: p.alignment, outlineLevel: p.outlineLevel, runs: result };
  });
  return { paragraphs };
}
function boundaryBytes(value) {
  if (!value || nodeTypes.isProxy(value) || ![Buffer.prototype, Uint8Array.prototype].includes(Object.getPrototypeOf(value))) reject('E_DOCX_INPUT_BYTES');
  let buffer, offset, length;
  try {
    buffer = typedArrayGetters.buffer.call(value);
    offset = typedArrayGetters.byteOffset.call(value);
    length = typedArrayGetters.byteLength.call(value);
  } catch { reject('E_DOCX_INPUT_BYTES'); }
  if (nodeTypes.isSharedArrayBuffer(buffer) || Object.getOwnPropertyDescriptor(ArrayBuffer.prototype, 'resizable')?.get.call(buffer)) reject('E_DOCX_MUTABLE_BACKING');
  if (length === 0 || length > DOCX_PROFILE_LIMITS.maxArchiveBytes) reject('E_DOCX_ARCHIVE_BUDGET');
  for (const key of Reflect.ownKeys(value)) if (typeof key !== 'string' || !/^(?:0|[1-9][0-9]*)$/u.test(key)) reject('E_DOCX_BYTE_PROPERTIES');
  return Buffer.from(new Uint8Array(buffer, offset, length));
}
function unescapeXml(raw) {
  const named = { amp: '&', apos: "'", gt: '>', lt: '<', quot: '"' };
  const decoded = raw.replace(/&([^;]+);/gu, (_, entity) => {
    if (Object.hasOwn(named, entity)) return named[entity];
    if (!/^#(?:[0-9]+|x[0-9a-fA-F]+)$/u.test(entity)) reject('E_DOCX_ENTITY');
    const number = entity.startsWith('#x') ? parseInt(entity.slice(2), 16) : Number(entity.slice(1));
    if (!Number.isSafeInteger(number) || number < 0 || number > 0x10ffff) reject('E_DOCX_ENTITY');
    return String.fromCodePoint(number);
  });
  if (raw.replace(/&[^;]+;/gu, '').includes('&')) reject('E_DOCX_ENTITY');
  return xmlText(decoded);
}
function tree(xml) {
  if (xml.includes('\r')) reject('E_DOCX_LINE_ENDING_UNSUPPORTED');
  const root = { children: [] }, stack = [root];
  let cursor = 0;
  while (cursor < xml.length) {
    const open = xml.indexOf('<', cursor);
    const endText = open < 0 ? xml.length : open;
    if (endText > cursor) stack.at(-1).children.push({ text: xml.slice(cursor, endText), from: cursor, to: endText });
    if (open < 0) break;
    if (xml.startsWith('<?xml ', open)) {
      if (open !== 0) reject('E_DOCX_XML_DECLARATION');
      const end = xml.indexOf('?>', open); if (end < 0) reject('E_DOCX_XML_DECLARATION'); cursor = end + 2; continue;
    }
    if (xml.startsWith('<!', open) || xml.startsWith('<?', open)) reject('E_DOCX_XML_UNSUPPORTED');
    let end = open + 1, quote = null;
    for (; end < xml.length; end += 1) {
      const ch = xml[end];
      if (quote) { if (ch === quote) quote = null; }
      else if (ch === '"' || ch === "'") quote = ch;
      else if (ch === '>') break;
    }
    if (end === xml.length) reject('E_DOCX_XML_TRUNCATED');
    let raw = xml.slice(open + 1, end).trim();
    if (raw.startsWith('/')) {
      const node = stack.pop(); if (stack.length === 0 || node.name !== raw.slice(1).trim()) reject('E_DOCX_XML_CLOSURE');
      node.closeStart = open; node.end = end + 1; cursor = end + 1; continue;
    }
    const selfClosing = raw.endsWith('/'); if (selfClosing) raw = raw.slice(0, -1).trimEnd();
    const match = /^([A-Za-z_][A-Za-z0-9_.:-]*)([\s\S]*)$/u.exec(raw); if (!match) reject('E_DOCX_XML_NAME');
    const attrs = {}, expression = /\s+([A-Za-z_][A-Za-z0-9_.:-]*)\s*=\s*("[^"]*"|'[^']*')/gy;
    let position = 0;
    while (position < match[2].length) {
      if (match[2].slice(position).trim() === '') break;
      expression.lastIndex = position; const attribute = expression.exec(match[2]);
      if (!attribute || Object.hasOwn(attrs, attribute[1]) || ['__proto__', 'constructor', 'prototype'].includes(attribute[1])) reject('E_DOCX_XML_ATTRIBUTE');
      if (attribute[2].includes('<')) reject('E_DOCX_XML_ATTRIBUTE');
      attrs[attribute[1]] = unescapeXml(attribute[2].slice(1, -1)); position = expression.lastIndex;
    }
    const node = { name: match[1], attrs, children: [], start: open, openEnd: end + 1, closeStart: end + 1, end: end + 1 };
    stack.at(-1).children.push(node); if (!selfClosing) stack.push(node); cursor = end + 1;
  }
  if (stack.length !== 1) reject('E_DOCX_XML_CLOSURE');
  const elements = children(root); if (elements.length !== 1) reject('E_DOCX_XML_ROOT'); return elements[0];
}
function children(node) {
  if (node.children.some(c => !c.name && c.text.trim() !== '')) reject('E_DOCX_UNEXPECTED_TEXT');
  return node.children.filter(c => c.name);
}
function element(node, name, attrs) {
  if (!node || node.name !== name) reject('E_DOCX_ELEMENT_UNSUPPORTED');
  exact(node.attrs, Object.keys(attrs));
  for (const [key, value] of Object.entries(attrs)) if (value !== null && node.attrs[key] !== value) reject('E_DOCX_ATTRIBUTE_UNSUPPORTED');
}
function empty(node) { if (children(node).length) reject('E_DOCX_ELEMENT_CONTENT'); }
function packagePolicy(parts) {
  const types = tree(parts.get('[Content_Types].xml').validatedText); element(types, 'Types', { xmlns: CT });
  const expected = [
    ['Default', { Extension: 'rels', ContentType: 'application/vnd.openxmlformats-package.relationships+xml' }],
    ['Default', { Extension: 'xml', ContentType: 'application/xml' }],
    ['Override', { PartName: '/word/document.xml', ContentType: MAIN }],
  ];
  const declarations = children(types);
  if (declarations.length !== 3) reject('E_DOCX_CONTENT_TYPE_DENOMINATOR');
  const seen = new Set();
  for (const node of declarations) {
    const index = expected.findIndex(([name, attrs]) => name === node.name && canonical(attrs) === canonical(node.attrs));
    if (index < 0 || seen.has(index)) reject('E_DOCX_CONTENT_TYPE'); seen.add(index); empty(node);
  }
  const rels = tree(parts.get('_rels/.rels').validatedText); element(rels, 'Relationships', { xmlns: R });
  const links = children(rels); if (links.length !== 1) reject('E_DOCX_RELATIONSHIP_DENOMINATOR');
  element(links[0], 'Relationship', { Id: null, Type: OFFICE, Target: 'word/document.xml' });
  if (!/^[A-Za-z_][A-Za-z0-9_.-]*$/u.test(links[0].attrs.Id)) reject('E_DOCX_RELATIONSHIP_ID'); empty(links[0]);
}
function readDocument(xml, partSha256) {
  const root = tree(xml); element(root, 'w:document', { 'xmlns:w': W });
  const roots = children(root); if (roots.length !== 1) reject('E_DOCX_BODY_DENOMINATOR');
  const body = roots[0]; element(body, 'w:body', {});
  const bodyChildren = children(body), paragraphs = [], rows = [];
  if (bodyChildren.at(-1)?.name === 'w:sectPr') { const section = bodyChildren.pop(); element(section, 'w:sectPr', {}); empty(section); }
  for (const node of bodyChildren) {
    element(node, 'w:p', {}); const p = { alignment: 'left', outlineLevel: null, runs: [] }, nodes = children(node);
    if (nodes[0]?.name === 'w:pPr') {
      const properties = nodes.shift(); element(properties, 'w:pPr', {}); const seen = new Set();
      for (const property of children(properties)) {
        if (!['w:jc', 'w:outlineLvl'].includes(property.name) || seen.has(property.name)) reject('E_DOCX_PARAGRAPH_PROPERTY');
        seen.add(property.name); element(property, property.name, { 'w:val': null }); empty(property);
        if (property.name === 'w:jc') p.alignment = property.attrs['w:val'];
        else { if (!/^[0-8]$/u.test(property.attrs['w:val'])) reject('E_DOCX_OUTLINE'); p.outlineLevel = Number(property.attrs['w:val']); }
      }
    }
    for (const run of nodes) {
      element(run, 'w:r', {}); const r = { text: '', bold: false, italic: false, underline: false }, atoms = children(run);
      if (atoms[0]?.name === 'w:rPr') {
        const properties = atoms.shift(); element(properties, 'w:rPr', {}); const seen = new Set();
        for (const property of children(properties)) {
          const key = { 'w:b': 'bold', 'w:i': 'italic', 'w:u': 'underline' }[property.name];
          if (!key || seen.has(key)) reject('E_DOCX_RUN_PROPERTY'); seen.add(key);
          const expected = Object.hasOwn(property.attrs, 'w:val') ? { 'w:val': null } : {};
          element(property, property.name, expected); empty(property);
          const value = property.attrs['w:val'] ?? (key === 'underline' ? 'single' : '1');
          const yes = key === 'underline' ? ['single'] : ['1', 'true', 'on'];
          const no = key === 'underline' ? ['none'] : ['0', 'false', 'off'];
          if (!yes.includes(value) && !no.includes(value)) reject('E_DOCX_MARK_VALUE'); r[key] = yes.includes(value);
        }
      }
      for (const atom of atoms) {
        let text, from, to;
        if (atom.name === 'w:t') {
          element(atom, 'w:t', Object.hasOwn(atom.attrs, 'xml:space') ? { 'xml:space': 'preserve' } : {});
          if (atom.children.some(c => c.name)) reject('E_DOCX_TEXT_ELEMENT');
          text = unescapeXml(atom.children.map(c => c.text).join(''));
          if (!Object.hasOwn(atom.attrs, 'xml:space') && text.trim() !== text) reject('E_DOCX_SPACE_POLICY');
          from = atom.openEnd; to = atom.closeStart;
        } else {
          if (!['w:tab', 'w:br'].includes(atom.name)) reject('E_DOCX_RUN_ATOM'); element(atom, atom.name, {}); empty(atom);
          text = atom.name === 'w:tab' ? '\t' : '\n'; from = atom.start; to = atom.end;
        }
        if (rows.length >= DOCX_PROFILE_LIMITS.maxTapeRows) reject('E_DOCX_TAPE_BUDGET');
        rows.push({ paragraphIndex: paragraphs.length, runIndex: p.runs.length, sourcePartSha256: partSha256, sourceFrom: from, sourceTo: to, targetFrom: r.text.length, targetTo: r.text.length + text.length, decodedSha256: hash(Buffer.from(text)), atom: atom.name });
        r.text += text;
      }
      p.runs.push(r);
    }
    paragraphs.push(p);
  }
  return { document: documentModel({ paragraphs }), tape: { sourceCoordinate: 'XML_UTF16', targetCoordinate: 'RUN_TEXT_UTF16', mappingLaw: 'EXACT_ATOM_REPARSE_NOT_LINEAR_OFFSET_AUTHORITY', rowDenominator: rows.length, rows } };
}
function fields(document) {
  return 1 + document.paragraphs.reduce((count, p) => count + 3 + p.runs.length * 4, 0);
}
function envelope(id, document, source, tape, items) {
  const result = createInterchangeIrEnvelope({ familyId: 'DOCUMENT', identity: id, payload: { formatSchemaVersion: DOCX_PROFILE_SCHEMA_VERSION, profileId: DOCX_PROFILE_ID, document, source, transformTape: tape, fieldDenominator: fields(document), semanticSha256: digest(document), lossLedger: { itemDenominator: items.length, items } } });
  if (!result.ok) reject('E_DOCX_IR_BOUNDARY');
  return freeze({ ...result, status: 'ADMITTED', profileId: DOCX_PROFILE_ID, semanticProjectionPublished: true });
}
export function createDocxProfileEnvelope(input = {}) {
  return attempt(() => {
    exact(input, ['document', 'identity']);
    return envelope(identity(input.identity), documentModel(input.document), null, null, []);
  });
}
export function parseDocxProfile(input = {}) {
  return attempt(() => {
    exact(input, ['bytes', 'identity']); const id = identity(input.identity), bytes = boundaryBytes(input.bytes);
    const quarantine = inspectParserQuarantine({ bytes, format: 'OOXML', budgets: { maxArchiveBytes: DOCX_PROFILE_LIMITS.maxArchiveBytes } });
    if (!quarantine.ok) return freeze({ ok: false, status: quarantine.status, error: { code: 'E_DOCX_QUARANTINE', cause: quarantine.error.code }, semanticProjectionPublished: false });
    const parts = new Map(quarantine.value.parts.map(part => [part.name, part]));
    if (canonical([...parts.keys()].sort()) !== canonical([...PARTS].sort())) {
      const items = [...parts.values()].filter(part => !PARTS.includes(part.name)).map(part => ({ disposition: 'UNSUPPORTED', code: 'UNDECLARED_PART', partSha256: part.sha256 }));
      for (const name of PARTS) if (!parts.has(name)) items.push({ disposition: 'UNSUPPORTED', code: 'MISSING_REQUIRED_PART', expectedPartNameSha256: hash(Buffer.from(name)) });
      return freeze({ ok: false, status: 'UNSUPPORTED', error: { code: 'E_DOCX_PART_SET' }, partDenominator: parts.size, lossLedger: { itemDenominator: items.length, items }, semanticProjectionPublished: false });
    }
    packagePolicy(parts); const main = parts.get('word/document.xml');
    const parsed = readDocument(main.validatedText, main.sha256);
    return envelope(id, parsed.document, { archiveSha256: hash(bytes), documentPartSha256: main.sha256 }, parsed.tape, [LEXICAL_LOSS]);
  });
}
function checkedEnvelope(value, expectedIdentity) {
  const clone = cleanJson(value), checked = validateInterchangeIrEnvelope(clone);
  if (!checked.ok || checked.value.body.familyId !== 'DOCUMENT') reject('E_DOCX_IR_ENVELOPE');
  if (canonical(checked.value.body.identity) !== canonical(identity(expectedIdentity))) reject('E_DOCX_STALE_IDENTITY');
  const payload = checked.value.body.payload;
  exact(payload, ['document', 'fieldDenominator', 'formatSchemaVersion', 'lossLedger', 'profileId', 'semanticSha256', 'source', 'transformTape']);
  if (payload.formatSchemaVersion !== DOCX_PROFILE_SCHEMA_VERSION || payload.profileId !== DOCX_PROFILE_ID) reject('E_DOCX_PROFILE');
  const document = documentModel(payload.document);
  if (payload.semanticSha256 !== digest(document) || payload.fieldDenominator !== fields(document)) reject('E_DOCX_SEMANTIC_BINDING');
  exact(payload.lossLedger, ['itemDenominator', 'items']);
  if (payload.lossLedger.itemDenominator !== array(payload.lossLedger.items, 4096).length) reject('E_DOCX_LOSS_DENOMINATOR');
  if (payload.source === null) {
    if (payload.transformTape !== null || payload.lossLedger.items.length !== 0) reject('E_DOCX_NEW_DOCUMENT_LINEAGE');
  } else {
    exact(payload.source, ['archiveSha256', 'documentPartSha256']);
    if (Object.values(payload.source).some(v => typeof v !== 'string' || !/^[0-9a-f]{64}$/u.test(v))) reject('E_DOCX_SOURCE_DIGEST');
    if (canonical(payload.lossLedger.items) !== canonical([LEXICAL_LOSS])) reject('E_DOCX_LOSS_MONOTONICITY');
    const tape = payload.transformTape;
    exact(tape, ['mappingLaw', 'rowDenominator', 'rows', 'sourceCoordinate', 'targetCoordinate']);
    if (tape.sourceCoordinate !== 'XML_UTF16' || tape.targetCoordinate !== 'RUN_TEXT_UTF16' || tape.mappingLaw !== 'EXACT_ATOM_REPARSE_NOT_LINEAR_OFFSET_AUTHORITY') reject('E_DOCX_TAPE_COORDINATE');
    if (tape.rowDenominator !== array(tape.rows, DOCX_PROFILE_LIMITS.maxTapeRows).length) reject('E_DOCX_TAPE_DENOMINATOR');
    const coverage = document.paragraphs.map(p => p.runs.map(() => 0));
    let previousSourceEnd = 0, previousParagraph = -1, previousRun = -1;
    for (const row of tape.rows) {
      exact(row, ['atom', 'decodedSha256', 'paragraphIndex', 'runIndex', 'sourceFrom', 'sourcePartSha256', 'sourceTo', 'targetFrom', 'targetTo']);
      for (const key of ['paragraphIndex', 'runIndex', 'sourceFrom', 'sourceTo', 'targetFrom', 'targetTo']) if (!Number.isSafeInteger(row[key]) || row[key] < 0) reject('E_DOCX_TAPE_OFFSET');
      const run = document.paragraphs[row.paragraphIndex]?.runs[row.runIndex];
      if (!run || row.paragraphIndex < previousParagraph || (row.paragraphIndex === previousParagraph && row.runIndex < previousRun)) reject('E_DOCX_TAPE_ORDER');
      if (row.sourcePartSha256 !== payload.source.documentPartSha256 || row.sourceFrom < previousSourceEnd || row.sourceTo < row.sourceFrom || row.sourceTo > 8_388_608) reject('E_DOCX_TAPE_SOURCE');
      if (row.targetFrom !== coverage[row.paragraphIndex][row.runIndex] || row.targetTo < row.targetFrom || row.targetTo > run.text.length) reject('E_DOCX_TAPE_TARGET');
      const decoded = run.text.slice(row.targetFrom, row.targetTo);
      if (row.decodedSha256 !== hash(Buffer.from(decoded)) || !['w:t', 'w:tab', 'w:br'].includes(row.atom) || (row.atom === 'w:tab' && decoded !== '\t') || (row.atom === 'w:br' && decoded !== '\n')) reject('E_DOCX_TAPE_ATOM');
      coverage[row.paragraphIndex][row.runIndex] = row.targetTo;
      previousSourceEnd = row.sourceTo; previousParagraph = row.paragraphIndex; previousRun = row.runIndex;
    }
    for (const [pi, p] of document.paragraphs.entries()) for (const [ri, r] of p.runs.entries()) if (coverage[pi][ri] !== r.text.length) reject('E_DOCX_TAPE_COVERAGE');
  }
  return { document, payload };
}
const escape = text => text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&apos;');
function utf8StoredZip(entries) {
  const bytes = zipBuilder.buildStoredZip(entries); let cursor = 0;
  while (bytes.readUInt32LE(cursor) === 0x04034b50) {
    bytes.writeUInt16LE(0x0800, cursor + 6); cursor += 30 + bytes.readUInt16LE(cursor + 26) + bytes.readUInt16LE(cursor + 28) + bytes.readUInt32LE(cursor + 18);
  }
  while (bytes.readUInt32LE(cursor) === 0x02014b50) {
    bytes.writeUInt16LE(0x0800, cursor + 8); cursor += 46 + bytes.readUInt16LE(cursor + 28) + bytes.readUInt16LE(cursor + 30) + bytes.readUInt16LE(cursor + 32);
  }
  if (bytes.readUInt32LE(cursor) !== 0x06054b50) reject('E_DOCX_ZIP_BUILDER'); return bytes;
}
export function serializeDocxProfile(input = {}) {
  return attempt(() => {
    exact(input, ['envelope', 'expectedIdentity', 'sourceBytes']); const { document, payload } = checkedEnvelope(input.envelope, input.expectedIdentity);
    if (payload.source === null) {
      if (input.sourceBytes !== null) reject('E_DOCX_UNDECLARED_SOURCE');
    } else {
      const sourceProof = verifyDocxTransformTape({ bytes: input.sourceBytes, envelope: input.envelope, expectedIdentity: input.expectedIdentity });
      if (!sourceProof.ok) reject('E_DOCX_SOURCE_REVALIDATION');
    }
    const paragraphs = document.paragraphs.map(p => {
      const properties = `<w:pPr><w:jc w:val="${p.alignment}"/>${p.outlineLevel === null ? '' : `<w:outlineLvl w:val="${p.outlineLevel}"/>`}</w:pPr>`;
      const runs = p.runs.map(r => {
        const marks = `<w:rPr>${r.bold ? '<w:b/>' : ''}${r.italic ? '<w:i/>' : ''}${r.underline ? '<w:u w:val="single"/>' : ''}</w:rPr>`;
        const atoms = r.text.split(/([\t\n])/u).map(t => t === '\t' ? '<w:tab/>' : t === '\n' ? '<w:br/>' : `<w:t xml:space="preserve">${escape(t)}</w:t>`).join('');
        return `<w:r>${marks}${atoms}</w:r>`;
      }).join(''); return `<w:p>${properties}${runs}</w:p>`;
    }).join('');
    const types = `<Types xmlns="${CT}"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="${MAIN}"/></Types>`;
    const rels = `<Relationships xmlns="${R}"><Relationship Id="rId1" Type="${OFFICE}" Target="word/document.xml"/></Relationships>`;
    const main = `<w:document xmlns:w="${W}"><w:body>${paragraphs}<w:sectPr/></w:body></w:document>`;
    const bytes = utf8StoredZip([{ name: PARTS[0], data: types }, { name: PARTS[1], data: rels }, { name: PARTS[2], data: main }]);
    if (bytes.length > DOCX_PROFILE_LIMITS.maxArchiveBytes) reject('E_DOCX_OUTPUT_BUDGET');
    const replay = parseDocxProfile({ bytes, identity: input.expectedIdentity });
    if (!replay.ok || replay.value.body.payload.semanticSha256 !== digest(document)) reject('E_DOCX_SERIALIZE_READBACK');
    return freeze({ ok: true, status: 'SERIALIZED', profileId: DOCX_PROFILE_ID, bytes, byteLength: bytes.length, sha256: hash(bytes), semanticSha256: digest(document), fieldDenominator: fields(document), lossLedger: payload.lossLedger, sourceUnchanged: true, productMutationAuthority: false, providerAuthority: false });
  });
}
export function verifyDocxTransformTape(input = {}) {
  return attempt(() => {
    exact(input, ['bytes', 'envelope', 'expectedIdentity']); checkedEnvelope(input.envelope, input.expectedIdentity);
    const replay = parseDocxProfile({ bytes: input.bytes, identity: input.expectedIdentity });
    if (!replay.ok || canonical(replay.value) !== canonical(cleanJson(input.envelope))) reject('E_DOCX_TAPE_REPLAY');
    return freeze({ ok: true, status: 'EXACT_SOURCE_TAPE_REPLAY', rowDenominator: replay.value.body.payload.transformTape.rowDenominator, fieldDenominator: replay.value.body.payload.fieldDenominator, sourceSha256: replay.value.body.payload.source.archiveSha256, productMutationAuthority: false });
  });
}
