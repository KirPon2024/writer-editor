'use strict';
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const zlib = require('node:zlib');
const { DOMParser } = require('@xmldom/xmldom');
const { buildZip } = require('./r24-wp701-parser-quarantine-fixtures.js');
const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const CT = 'http://schemas.openxmlformats.org/package/2006/content-types';
const R = 'http://schemas.openxmlformats.org/package/2006/relationships';
const MAIN = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml';
const OFFICE = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument';
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const clone = value => JSON.parse(JSON.stringify(value));
const identity = (overrides = {}) => ({ entityId: 'scene-wp703-001', generation: 12, projectId: 'project-wp703-001', sourceRevision: 'revision-wp703-001', ...overrides });
const run = (text = '', overrides = {}) => ({ text, bold: false, italic: false, underline: false, ...overrides });
const paragraph = (runs = [], overrides = {}) => ({ alignment: 'left', outlineLevel: null, runs, ...overrides });
const document = () => ({ paragraphs: [paragraph([run(' Hello, мир — Καλημέρα — café — 日本語 — हिन्दी — 😀 & < > "\' '), run('\tsecond\nline', { bold: true, italic: true, underline: true }), run('')], { alignment: 'both', outlineLevel: 8 }), paragraph([run('Last', { italic: true })], { alignment: 'center', outlineLevel: 0 }), paragraph([])] });
const xml = body => `<w:document xmlns:w="${W}"><w:body>${body}<w:sectPr/></w:body></w:document>`;
const types = `<Types xmlns="${CT}"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="${MAIN}"/></Types>`;
const rels = `<Relationships xmlns="${R}"><Relationship Id="rId1" Type="${OFFICE}" Target="word/document.xml"/></Relationships>`;
const sourceXml = () => xml('<w:p><w:pPr><w:jc w:val="right"/><w:outlineLvl w:val="7"/></w:pPr><w:r><w:rPr><w:b w:val="on"/><w:i w:val="false"/><w:u w:val="single"/></w:rPr><w:t xml:space="preserve"> A &amp; B &#x1F600; </w:t><w:tab/><w:t>café</w:t><w:br/><w:t/></w:r><w:r/></w:p>');
const sourceDocument = () => ({ paragraphs: [paragraph([run(' A & B 😀 \tcafé\n', { bold: true, underline: true }), run('')], { alignment: 'right', outlineLevel: 7 })] });
function packageBytes(options = {}) {
  const entries = options.entries ?? [
    { name: '[Content_Types].xml', data: options.types ?? types },
    { name: '_rels/.rels', data: options.rels ?? rels },
    { name: 'word/document.xml', data: options.xml ?? sourceXml(), method: options.method ?? 0 },
    ...(options.extra ?? []),
  ];
  return buildZip(entries, options.zipOptions);
}
// Independent readback: local ZIP traversal + the already-locked third-party DOM
// parser, never the production profile parser, its tree, or its transform tape.
function extractParts(bytes) {
  const parts = new Map();
  let offset = 0;
  while (bytes.readUInt32LE(offset) === 0x04034b50) {
    const method = bytes.readUInt16LE(offset + 8);
    const size = bytes.readUInt32LE(offset + 18);
    const nameLength = bytes.readUInt16LE(offset + 26);
    const extraLength = bytes.readUInt16LE(offset + 28);
    const name = bytes.subarray(offset + 30, offset + 30 + nameLength).toString('utf8');
    const from = offset + 30 + nameLength + extraLength;
    const compressed = bytes.subarray(from, from + size);
    assert.equal(compressed.length, size);
    assert([0, 8].includes(method));
    assert(!parts.has(name));
    parts.set(name, method === 8 ? zlib.inflateRawSync(compressed) : Buffer.from(compressed));
    offset = from + size;
  }
  assert.equal(bytes.readUInt32LE(offset), 0x02014b50);
  return parts;
}
function independentDocument(xmlText) {
  const dom = new DOMParser({ onError: (level, message) => { throw new Error(`${level}:${message}`); } }).parseFromString(xmlText, 'application/xml');
  const direct = (node, localName) => Array.from(node.childNodes).filter(n => n.nodeType === 1 && n.namespaceURI === W && (!localName || n.localName === localName));
  const one = (node, localName) => direct(node, localName)[0];
  const val = node => node?.getAttributeNS(W, 'val') ?? '';
  const body = one(dom.documentElement, 'body');
  assert(body);
  return { paragraphs: direct(body, 'p').map(p => {
    const pp = one(p, 'pPr');
    const alignment = pp ? val(one(pp, 'jc')) || 'left' : 'left';
    const outline = pp ? one(pp, 'outlineLvl') : null;
    const runs = direct(p, 'r').map(r => {
      const rp = one(r, 'rPr');
      const toggle = name => {
        const node = rp ? one(rp, name) : null;
        return !!node && !['0', 'false', 'off', 'none'].includes(val(node));
      };
      const text = direct(r).filter(n => n.localName !== 'rPr').map(n => {
        if (n.localName === 't') return n.textContent;
        if (n.localName === 'tab') return '\t';
        if (n.localName === 'br') return '\n';
        assert.fail(`unexpected atom ${n.localName}`);
      }).join('');
      return run(text, { bold: toggle('b'), italic: toggle('i'), underline: toggle('u') });
    });
    return paragraph(runs, { alignment, outlineLevel: outline ? Number(val(outline)) : null });
  }) };
}
async function reEnvelope(value, mutate) {
  const { createInterchangeIrEnvelope } = await import('../../src/core/interchange-ir-v1.mjs');
  const body = clone(value.body); mutate(body.payload);
  const result = createInterchangeIrEnvelope({ familyId: body.familyId, identity: body.identity, payload: body.payload });
  assert.equal(result.ok, true);
  return result.value;
}
module.exports = { W, CT, R, MAIN, OFFICE, hash, clone, identity, run, paragraph, document, xml, types, rels, sourceXml, sourceDocument, packageBytes, extractParts, independentDocument, reEnvelope };
