'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const f = require('../fixtures/r24-wp703-docx-profile-fixtures.js');
const SOURCE = path.join(__dirname, '../../src/core/docx-profile-v1.mjs');
const source = fs.readFileSync(SOURCE, 'utf8');
const parse = (api, options) => api.parseDocxProfile({ bytes: f.packageBytes(options), identity: f.identity() });
const noProjection = result => { assert.equal(result.ok, false); assert.equal(result.semanticProjectionPublished, false); };
const model = result => { assert.equal(result.ok, true); return result.value.body.payload; };
const mutations = [
  ['namespace-value', "for (const [key, value] of Object.entries(attrs)) if (value !== null && node.attrs[key] !== value) reject('E_DOCX_ATTRIBUTE_UNSUPPORTED');", '', async api => noProjection(parse(api, { xml: f.sourceXml().replace(f.W, 'urn:spoof') }))],
  ['closed-part-set', "if (canonical([...parts.keys()].sort()) !== canonical([...PARTS].sort())) {", 'if (false) {', async api => noProjection(parse(api, { extra: [{ name: 'word/styles.xml', data: '<styles/>' }] }))],
  ['content-type', "if (index < 0 || seen.has(index)) reject('E_DOCX_CONTENT_TYPE');", '', async api => noProjection(parse(api, { types: f.types.replace(f.MAIN, 'application/xml') }))],
  ['relationship-target', "element(links[0], 'Relationship', { Id: null, Type: OFFICE, Target: 'word/document.xml' });", "element(links[0], 'Relationship', { Id: null, Type: OFFICE, Target: null });", async api => noProjection(parse(api, { rels: f.rels.replace('Target="word/document.xml"', 'Target="other.xml"') }))],
  ['mark-semantics', 'r[key] = yes.includes(value);', 'r[key] = !yes.includes(value);', async api => assert.deepEqual(model(parse(api)).document, f.sourceDocument())],
  ['paragraph-alignment', "p.alignment = property.attrs['w:val'];", "p.alignment = 'left';", async api => assert.equal(model(parse(api)).document.paragraphs[0].alignment, 'right')],
  ['outline-level', "p.outlineLevel = Number(property.attrs['w:val']);", "p.outlineLevel = Number(property.attrs['w:val']) + 1;", async api => assert.equal(model(parse(api)).document.paragraphs[0].outlineLevel, 7)],
  ['entity-decoding', "amp: '&'", "amp: 'X'", async api => assert.deepEqual(model(parse(api)).document, f.sourceDocument())],
  ['utf16-target', 'targetTo: r.text.length + text.length', 'targetTo: r.text.length + [...text].length', async api => assert.equal(model(parse(api)).transformTape.rows[0].targetTo, ' A & B 😀 '.length)],
  ['source-span', 'from = atom.openEnd; to = atom.closeStart;', 'from = atom.openEnd + 1; to = atom.closeStart;', async api => { const row = model(parse(api)).transformTape.rows[0]; assert.equal(f.sourceXml().slice(row.sourceFrom, row.sourceTo), ' A &amp; B &#x1F600; '); }],
  ['field-denominator', 'return 1 + document.paragraphs.reduce', 'return 2 + document.paragraphs.reduce', async api => assert.equal(model(parse(api)).fieldDenominator, 12)],
  ['loss-erasure', 'parsed.tape, [LEXICAL_LOSS]);', 'parsed.tape, []);', async api => assert.equal(model(parse(api)).lossLedger.itemDenominator, 1)],
  ['source-revalidation', "if (!sourceProof.ok) reject('E_DOCX_SOURCE_REVALIDATION');", '', async api => { const imported = parse(api); assert.equal(imported.ok, true); noProjection(api.serializeDocxProfile({ envelope: imported.value, expectedIdentity: f.identity(), sourceBytes: f.packageBytes({ xml: f.sourceXml().replace('café', 'CAFE') }) })); }],
  ['identity-revalidation', "if (canonical(checked.value.body.identity) !== canonical(identity(expectedIdentity))) reject('E_DOCX_STALE_IDENTITY');", '', async api => { const created = api.createDocxProfileEnvelope({ identity: f.identity(), document: f.document() }); assert.equal(created.ok, true); noProjection(api.serializeDocxProfile({ envelope: created.value, expectedIdentity: f.identity({ generation: 13 }), sourceBytes: null })); }],
  ['accessor-before-read', "if (!d || !Object.hasOwn(d, 'value') || !d.enumerable) reject('E_DOCX_ACCESSOR');", '', async api => { let calls = 0; const input = { identity: f.identity(), get document() { calls += 1; return f.document(); } }; const result = api.createDocxProfileEnvelope(input); assert.equal(calls, 0); noProjection(result); }],
  ['proxy-before-reflection', "if (!value || nodeTypes.isProxy(value) || Object.getPrototypeOf(value) !== Object.prototype) reject('E_DOCX_OBJECT_SHAPE');", "if (!value || Object.getPrototypeOf(value) !== Object.prototype) reject('E_DOCX_OBJECT_SHAPE');", async api => { let calls = 0; const input = new Proxy({}, { getPrototypeOf() { calls += 1; return Object.prototype; } }); const result = api.createDocxProfileEnvelope(input); assert.equal(calls, 0); noProjection(result); }],
  ['shared-backing', "if (nodeTypes.isSharedArrayBuffer(buffer) || Object.getOwnPropertyDescriptor(ArrayBuffer.prototype, 'resizable')?.get.call(buffer)) reject('E_DOCX_MUTABLE_BACKING');", '', async api => { const source = f.packageBytes(), shared = new Uint8Array(new SharedArrayBuffer(source.length)); shared.set(source); noProjection(api.parseDocxProfile({ bytes: shared, identity: f.identity() })); }],
  ['zip-utf8-contract', 'bytes.writeUInt16LE(0x0800, cursor + 6);', 'bytes.writeUInt16LE(0, cursor + 6);', async api => { const created = api.createDocxProfileEnvelope({ identity: f.identity(), document: f.document() }); assert.equal(created.ok, true); const output = api.serializeDocxProfile({ envelope: created.value, expectedIdentity: f.identity(), sourceBytes: null }); assert.equal(output.ok, true); assert.deepEqual(f.independentDocument(f.extractParts(output.bytes).get('word/document.xml').toString()), f.document()); }],
];

test('WP703 real implementation mutants are killed by executed behavioral oracles, never import failures', async t => {
  const original = await import(pathToFileURL(SOURCE).href);
  let killed = 0;
  for (const [id, before, after, oracle] of mutations) {
    await oracle(original);
    assert.equal(source.split(before).length - 1, 1, `${id}: unique mutation anchor`);
    const mutant = source.replace(before, after).replace(/from '(\.{1,2}\/[^']+)'/g, (_, relative) => `from '${pathToFileURL(path.resolve(path.dirname(SOURCE), relative)).href}'`);
    const api = await import(`data:text/javascript;base64,${Buffer.from(mutant).toString('base64')}#${id}`);
    await assert.rejects(() => oracle(api), { name: 'AssertionError' }, `${id}: behavioral assertion must kill mutant`);
    killed += 1;
  }
  assert.equal(mutations.length, 18); assert.equal(killed, 18);
  assert.equal(fs.readFileSync(SOURCE, 'utf8'), source);
  t.diagnostic(JSON.stringify({ implementationMutants: mutations.length, killed, survivors: 0, productionSourceMutations: 0, importOrHarnessFailuresCountedAsKills: 0 }));
});
