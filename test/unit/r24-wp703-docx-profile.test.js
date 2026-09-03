'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const f = require('../fixtures/r24-wp703-docx-profile-fixtures.js');
const load = () => import('../../src/core/docx-profile-v1.mjs');
const rejected = (result, code) => { assert.equal(result.ok, false); assert.equal(result.semanticProjectionPublished, false); assert.equal(Object.hasOwn(result, 'value'), false); if (code) assert.equal(result.error.code, code); };

test('WP703 immutable DOCUMENT IR preserves the complete bounded semantic field denominator', async () => {
  const api = await load(), document = f.document();
  const created = api.createDocxProfileEnvelope({ identity: f.identity(), document });
  assert.equal(created.ok, true);
  assert(Object.isFrozen(created.value.body.payload.document.paragraphs[0].runs[0]));
  assert.deepEqual(created.value.body.payload.document, document);
  assert.equal(created.value.body.payload.fieldDenominator, 26);
  const output = api.serializeDocxProfile({ envelope: created.value, expectedIdentity: f.identity(), sourceBytes: null });
  assert.equal(output.ok, true, JSON.stringify(output));
  assert.deepEqual(f.independentDocument(f.extractParts(output.bytes).get('word/document.xml').toString()), document);
  const parsed = api.parseDocxProfile({ bytes: output.bytes, identity: f.identity() });
  assert.equal(parsed.ok, true);
  assert.deepEqual(parsed.value.body.payload.document, document);
  assert.equal(parsed.value.body.payload.lossLedger.itemDenominator, 1);
  assert.equal(output.productMutationAuthority, false); assert.equal(output.providerAuthority, false);
  assert.equal(output.sha256, f.hash(output.bytes));
});

test('WP703 source entities Unicode empty atoms and XML-to-run UTF16 tape replay exactly', async () => {
  const api = await load();
  for (const method of [0, 8]) {
    const bytes = f.packageBytes({ method });
    const parsed = api.parseDocxProfile({ bytes, identity: f.identity() });
    assert.equal(parsed.ok, true, JSON.stringify(parsed));
    assert.deepEqual(parsed.value.body.payload.document, f.sourceDocument());
    assert.deepEqual(f.independentDocument(f.sourceXml()), f.sourceDocument());
    const tape = parsed.value.body.payload.transformTape;
    assert.equal(tape.rowDenominator, 5);
    for (const row of tape.rows) { assert(row.sourceFrom <= row.sourceTo); assert(row.targetFrom <= row.targetTo); }
    const empty = tape.rows.at(-1); assert.equal(empty.sourceFrom, empty.sourceTo); assert.equal(empty.targetFrom, empty.targetTo);
    assert.equal(api.verifyDocxTransformTape({ bytes, envelope: parsed.value, expectedIdentity: f.identity() }).ok, true);
    const output = api.serializeDocxProfile({ envelope: parsed.value, expectedIdentity: f.identity(), sourceBytes: bytes });
    assert.equal(output.ok, true, JSON.stringify(output));
    assert.deepEqual(output.lossLedger, parsed.value.body.payload.lossLedger);
    assert.deepEqual(f.independentDocument(f.extractParts(output.bytes).get('word/document.xml').toString()), f.sourceDocument());
  }
});

test('WP703 own-data boundaries never invoke accessors or proxy traps', async () => {
  const api = await load(); let calls = 0;
  const accessor = { identity: f.identity(), document: f.document() };
  Object.defineProperty(accessor, 'document', { enumerable: true, get() { calls += 1; return f.document(); } });
  rejected(api.createDocxProfileEnvelope(accessor), 'E_DOCX_ACCESSOR');
  const proxy = new Proxy({}, { getPrototypeOf() { calls += 1; return Object.prototype; }, ownKeys() { calls += 1; return []; } });
  rejected(api.createDocxProfileEnvelope(proxy), 'E_DOCX_OBJECT_SHAPE');
  const nested = f.document(); nested.paragraphs = new Proxy([], { get() { calls += 1; return 0; } });
  rejected(api.createDocxProfileEnvelope({ identity: f.identity(), document: nested }));
  assert.equal(calls, 0);
  for (const change of [d => { d.extra = true; }, d => { d[Symbol('x')] = 1; }, d => { delete d.paragraphs[0]; }, d => { d.paragraphs.extra = true; }, d => { d.paragraphs[0].runs[0].bold = 'true'; }, d => { d.paragraphs[0].alignment = 'justify'; }, d => { d.paragraphs[0].outlineLevel = 9; }]) {
    const document = f.document(); change(document); rejected(api.createDocxProfileEnvelope({ identity: f.identity(), document }));
  }
  const bytes = f.packageBytes(); Object.defineProperty(bytes, 'byteLength', { get() { calls += 1; return 1; } });
  rejected(api.parseDocxProfile({ bytes, identity: f.identity() }), 'E_DOCX_BYTE_PROPERTIES');
  rejected(api.parseDocxProfile({ bytes: new Proxy(f.packageBytes(), {}), identity: f.identity() }), 'E_DOCX_INPUT_BYTES');
  rejected(api.parseDocxProfile({ bytes: new Uint8Array(new SharedArrayBuffer(32)), identity: f.identity() }), 'E_DOCX_MUTABLE_BACKING');
  rejected(api.parseDocxProfile({ bytes: new Uint8Array(new ArrayBuffer(32, { maxByteLength: 64 })), identity: f.identity() }), 'E_DOCX_MUTABLE_BACKING');
  assert.equal(calls, 0);
});

test('WP703 closes namespaces relationship content-type and part denominators', async () => {
  const api = await load();
  const cases = [
    { xml: f.sourceXml().replace(f.W, 'urn:spoof') },
    { xml: f.sourceXml().replace('<w:p>', '<w:p xmlns:w="urn:spoof">') },
    { xml: f.sourceXml().replace('<w:r>', '<w:r w:unknown="1">') },
    { rels: f.rels.replace('Target="word/document.xml"', 'Target="other.xml"') },
    { rels: f.rels.replace(f.OFFICE, 'urn:spoof') },
    { rels: f.rels.replace('/></Relationships>', '/><Relationship Id="rId2" Type="'+f.OFFICE+'" Target="word/document.xml"/></Relationships>') },
    { types: f.types.replace(f.MAIN, 'application/xml') },
    { types: f.types.replace('<Override ', '<Default Extension="bin" ContentType="application/octet-stream"/><Override ') },
    { extra: [{ name: 'word/styles.xml', data: '<styles/>' }] },
    { entries: [{ name: 'word/document.xml', data: f.sourceXml() }] },
  ];
  for (const options of cases) rejected(api.parseDocxProfile({ bytes: f.packageBytes(options), identity: f.identity() }));
  const extra = api.parseDocxProfile({ bytes: f.packageBytes(cases[8]), identity: f.identity() });
  assert.equal(extra.status, 'UNSUPPORTED'); assert.equal(extra.lossLedger.itemDenominator, 1);
  assert.equal(JSON.stringify(extra).includes('word/styles.xml'), false);
  const missing = api.parseDocxProfile({ bytes: f.packageBytes(cases[9]), identity: f.identity() });
  assert.equal(missing.error.cause, 'E_PQ_OOXML_REQUIRED_PART');
  const missingDocument = api.parseDocxProfile({ bytes: f.packageBytes({ entries: [{ name: '[Content_Types].xml', data: f.types }, { name: '_rels/.rels', data: f.rels }] }), identity: f.identity() });
  rejected(missingDocument, 'E_DOCX_PART_SET');
  assert.equal(missingDocument.lossLedger.itemDenominator, 1);
});

test('WP703 hostile XML ZIP active content and unsupported constructs never publish partial semantics', async () => {
  const api = await load();
  for (const body of ['<w:tbl/>', '<w:p><w:hyperlink/></w:p>', '<w:p><w:r><w:drawing/></w:r></w:p>', '<w:p><w:r><w:rPr><w:color w:val="FF0000"/></w:rPr><w:t>x</w:t></w:r></w:p>', '<w:p><w:r><w:t> bad </w:t></w:r></w:p>', '<w:p><w:r><w:t>&#xD800;</w:t></w:r></w:p>', '<w:p><w:r><w:t><![CDATA[x]]></w:t></w:r></w:p>', '<w:p><w:r><w:t xml:space="preserve<">x</w:t></w:r></w:p>']) {
    rejected(api.parseDocxProfile({ bytes: f.packageBytes({ xml: f.xml(body) }), identity: f.identity() }));
  }
  for (const xml of [f.sourceXml().replace('</w:p>', '</w:wrong>'), f.sourceXml().replace(' A ', ' A\r'), '<!DOCTYPE x [<!ENTITY e SYSTEM "file:///private">]>'+f.sourceXml(), f.sourceXml().replace('café', 'cafe\u0301'), f.sourceXml().replace('café', 'bad\u0000')]) rejected(api.parseDocxProfile({ bytes: f.packageBytes({ xml }), identity: f.identity() }));
  for (const bytes of [Buffer.from('not a ZIP'), f.packageBytes().subarray(0, 40), f.packageBytes({ extra: [{ name: 'word/vbaProject.bin', data: 'synthetic' }] })]) rejected(api.parseDocxProfile({ bytes, identity: f.identity() }));
});

test('WP703 source identity tape loss and complete semantic denominator are fail-closed even after rehash', async () => {
  const api = await load(), bytes = f.packageBytes();
  const parsed = api.parseDocxProfile({ bytes, identity: f.identity() }); assert.equal(parsed.ok, true);
  for (const [key, value] of [['projectId', 'other'], ['entityId', 'other'], ['sourceRevision', 'other'], ['generation', 13]]) {
    rejected(api.serializeDocxProfile({ envelope: parsed.value, expectedIdentity: f.identity({ [key]: value }), sourceBytes: bytes }), 'E_DOCX_STALE_IDENTITY');
  }
  for (const mutate of [p => { p.fieldDenominator += 1; }, p => { p.lossLedger.items = []; p.lossLedger.itemDenominator = 0; }, p => { p.lossLedger.items[0].disposition = 'PRESERVED'; }, p => { p.source.archiveSha256 = '0'.repeat(64); }, p => { p.source.extra = true; }, p => { p.transformTape.sourceCoordinate = 'BYTES'; }, p => { p.transformTape.rowDenominator += 1; }, p => { p.transformTape.rows[0].sourceTo = 0; }, p => { p.transformTape.rows[0].targetTo -= 1; }, p => { p.transformTape.rows[0].sourcePartSha256 = '0'.repeat(64); }, p => { p.transformTape.rows[0].decodedSha256 = '0'.repeat(64); }, p => { p.transformTape.rows[0].atom = 'w:tab'; }, p => { p.transformTape.rows = []; p.transformTape.rowDenominator = 0; }]) {
    const forged = await f.reEnvelope(parsed.value, mutate);
    rejected(api.serializeDocxProfile({ envelope: forged, expectedIdentity: f.identity(), sourceBytes: bytes }));
  }
  const changed = f.packageBytes({ xml: f.sourceXml().replace('café', 'CAFE') });
  rejected(api.serializeDocxProfile({ envelope: parsed.value, expectedIdentity: f.identity(), sourceBytes: changed }), 'E_DOCX_SOURCE_REVALIDATION');
  rejected(api.verifyDocxTransformTape({ bytes: changed, envelope: parsed.value, expectedIdentity: f.identity() }), 'E_DOCX_TAPE_REPLAY');
  rejected(api.serializeDocxProfile({ envelope: parsed.value, expectedIdentity: f.identity(), sourceBytes: null }));
  const created = api.createDocxProfileEnvelope({ identity: f.identity(), document: f.document() });
  rejected(api.serializeDocxProfile({ envelope: created.value, expectedIdentity: f.identity(), sourceBytes: bytes }), 'E_DOCX_UNDECLARED_SOURCE');
  const cyclic = f.clone(created.value); cyclic.body.payload.loop = cyclic;
  rejected(api.serializeDocxProfile({ envelope: cyclic, expectedIdentity: f.identity(), sourceBytes: null }), 'E_DOCX_JSON_BUDGET');
});

test('WP703 individual and composed budgets reject overflow without partial output', async () => {
  const api = await load();
  const max = { paragraphs: Array.from({ length: api.DOCX_PROFILE_LIMITS.maxParagraphs }, () => f.paragraph()) };
  const created = api.createDocxProfileEnvelope({ identity: f.identity(), document: max }); assert.equal(created.ok, true);
  assert.equal(api.serializeDocxProfile({ envelope: created.value, expectedIdentity: f.identity(), sourceBytes: null }).ok, true);
  max.paragraphs.push(f.paragraph()); rejected(api.createDocxProfileEnvelope({ identity: f.identity(), document: max }));
  const maximumText = api.createDocxProfileEnvelope({ identity: f.identity(), document: { paragraphs: [f.paragraph([f.run('a'.repeat(api.DOCX_PROFILE_LIMITS.maxTextBytes))])] } });
  assert.equal(maximumText.ok, true);
  assert.equal(api.serializeDocxProfile({ envelope: maximumText.value, expectedIdentity: f.identity(), sourceBytes: null }).ok, true);
  for (const text of ['a'.repeat(api.DOCX_PROFILE_LIMITS.maxTextBytes + 1), '\ud800', 'cafe\u0301', 'a\rb']) rejected(api.createDocxProfileEnvelope({ identity: f.identity(), document: { paragraphs: [f.paragraph([f.run(text)])] } }));
  rejected(api.parseDocxProfile({ bytes: Buffer.alloc(api.DOCX_PROFILE_LIMITS.maxArchiveBytes + 1), identity: f.identity() }), 'E_DOCX_ARCHIVE_BUDGET');
  const tooManyRuns = { paragraphs: [f.paragraph(Array.from({ length: api.DOCX_PROFILE_LIMITS.maxRuns + 1 }, () => f.run('')))] };
  rejected(api.createDocxProfileEnvelope({ identity: f.identity(), document: tooManyRuns }));
  const tooManyAtoms = f.xml('<w:p><w:r>'+ '<w:tab/>'.repeat(api.DOCX_PROFILE_LIMITS.maxTapeRows + 1)+'</w:r></w:p>');
  rejected(api.parseDocxProfile({ bytes: f.packageBytes({ xml: tooManyAtoms, method: 0 }), identity: f.identity() }), 'E_DOCX_TAPE_BUDGET');
  const compressedBomb = api.parseDocxProfile({ bytes: f.packageBytes({ xml: tooManyAtoms, method: 8 }), identity: f.identity() });
  rejected(compressedBomb, 'E_DOCX_QUARANTINE');
  assert.equal(compressedBomb.error.cause, 'E_PQ_ARCHIVE_COMPRESSION_RATIO');
});
