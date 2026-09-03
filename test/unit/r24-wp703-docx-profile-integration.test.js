'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const f = require('../fixtures/r24-wp703-docx-profile-fixtures.js');
const load = () => import('../../src/core/docx-profile-v1.mjs');

test('WP703 independent locked DOM differential corpus covers all alignment outline mark and Unicode classes', async t => {
  const api = await load(); let cases = 0, fields = 0;
  const oraclePackage = require('@xmldom/xmldom/package.json');
  assert.equal(oraclePackage.version, '0.9.12');
  for (const alignment of ['left', 'center', 'right', 'both']) for (const outlineLevel of [null, 0, 1, 2, 3, 4, 5, 6, 7, 8]) for (let marks = 0; marks < 8; marks += 1) for (const text of ['', ' A & < > "\' \tB\nC ', 'мир Καλημέρα café 日本語 हिन्दी 😀 العربية עברית İ ı 👩‍👩‍👧‍👦']) {
    const document = { paragraphs: [f.paragraph([f.run(text, { bold: !!(marks & 1), italic: !!(marks & 2), underline: !!(marks & 4) })], { alignment, outlineLevel })] };
    const created = api.createDocxProfileEnvelope({ identity: f.identity(), document }); assert.equal(created.ok, true);
    const output = api.serializeDocxProfile({ envelope: created.value, expectedIdentity: f.identity(), sourceBytes: null }); assert.equal(output.ok, true);
    const independent = f.independentDocument(f.extractParts(output.bytes).get('word/document.xml').toString('utf8'));
    assert.deepEqual(independent, document);
    const imported = api.parseDocxProfile({ bytes: output.bytes, identity: f.identity() }); assert.equal(imported.ok, true);
    assert.deepEqual(imported.value.body.payload.document, independent);
    assert.equal(api.verifyDocxTransformTape({ bytes: output.bytes, envelope: imported.value, expectedIdentity: f.identity() }).ok, true);
    cases += 1; fields += output.fieldDenominator;
  }
  assert.equal(cases, 960); assert.equal(fields, 7680);
  t.diagnostic(JSON.stringify({ independentSemanticCases: cases, independentFieldComparisons: fields, oracle: '@xmldom/xmldom@0.9.12', productionParserUsedAsIndependentOracle: false }));
});

test('WP703 equivalent lexical packages transform explicitly and converge deterministically without erasing loss', async () => {
  const api = await load();
  const main = f.sourceXml();
  const variants = [
    f.packageBytes(),
    f.packageBytes({ method: 8 }),
    f.packageBytes({ xml: '<?xml version="1.0" encoding="UTF-8"?>'+main }),
    f.packageBytes({ xml: main.replaceAll('"', "'") }),
    f.packageBytes({ entries: [{ name: 'word/document.xml', data: main }, { name: '_rels/.rels', data: f.rels.replace('rId1', 'office') }, { name: '[Content_Types].xml', data: f.types }] }),
  ];
  let canonicalBytes;
  for (let bytes of variants) {
    assert.deepEqual(f.independentDocument(f.extractParts(bytes).get('word/document.xml').toString()), f.sourceDocument());
    for (let round = 0; round < 3; round += 1) {
      const parsed = api.parseDocxProfile({ bytes, identity: f.identity() }); assert.equal(parsed.ok, true);
      const output = api.serializeDocxProfile({ envelope: parsed.value, expectedIdentity: f.identity(), sourceBytes: bytes }); assert.equal(output.ok, true);
      assert.equal(output.lossLedger.itemDenominator, 1);
      assert.equal(output.lossLedger.items[0].disposition, 'TRANSFORMED_LOSSY');
      assert.deepEqual(f.independentDocument(f.extractParts(output.bytes).get('word/document.xml').toString()), f.sourceDocument());
      canonicalBytes ??= output.bytes;
      assert.deepEqual(output.bytes, canonicalBytes);
      bytes = output.bytes;
    }
  }
});

test('WP703 physical local-file readback binds exact input and output bytes without Word or provider authority', async () => {
  const api = await load();
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'yalken-wp703-physical-'));
  const original = path.join(directory, 'synthetic-source.docx');
  const exported = path.join(directory, 'synthetic-export.docx');
  try {
    const source = f.packageBytes({ method: 8 }); fs.writeFileSync(original, source, { flag: 'wx' });
    const physicalInput = fs.readFileSync(original);
    const parsed = api.parseDocxProfile({ bytes: physicalInput, identity: f.identity() }); assert.equal(parsed.ok, true);
    assert.equal(parsed.value.body.payload.source.archiveSha256, f.hash(physicalInput));
    const output = api.serializeDocxProfile({ envelope: parsed.value, expectedIdentity: f.identity(), sourceBytes: physicalInput }); assert.equal(output.ok, true);
    fs.writeFileSync(exported, output.bytes, { flag: 'wx' });
    const physicalOutput = fs.readFileSync(exported);
    assert.equal(f.hash(physicalOutput), output.sha256);
    assert.deepEqual(f.independentDocument(f.extractParts(physicalOutput).get('word/document.xml').toString()), f.sourceDocument());
    assert.deepEqual(fs.readFileSync(original), source);
    assert.equal(output.sourceUnchanged, true); assert.equal(output.providerAuthority, false); assert.equal(output.productMutationAuthority, false);
    assert.equal(api.verifyDocxTransformTape({ bytes: physicalInput, envelope: parsed.value, expectedIdentity: f.identity() }).ok, true);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test('WP703 composes with WP700 canonical IR and rejects a WP702 format envelope as a DOCX claim', async () => {
  const api = await load(), ir = await import('../../src/core/interchange-ir-v1.mjs');
  const parsed = api.parseDocxProfile({ bytes: f.packageBytes(), identity: f.identity() }); assert.equal(parsed.ok, true);
  const reloaded = ir.parseInterchangeIrEnvelope(parsed.bytes); assert.equal(reloaded.ok, true); assert.deepEqual(reloaded.value, parsed.value);
  const text = await import('../../src/core/text-formats-v1.mjs');
  const textEnvelope = text.parseTextFormat({ bytes: Buffer.from('bounded'), identity: f.identity(), profileId: 'TXT_UTF8_NFC_V1' }); assert.equal(textEnvelope.ok, true);
  const refused = api.serializeDocxProfile({ envelope: textEnvelope.value, expectedIdentity: f.identity(), sourceBytes: null });
  assert.equal(refused.ok, false); assert.equal(refused.semanticProjectionPublished, false);
});

test('WP703 pure export surface has no product filesystem process renderer or network writer', async () => {
  const api = await load();
  assert.deepEqual(Object.keys(api).sort(), ['DOCX_PROFILE_ID', 'DOCX_PROFILE_LIMITS', 'DOCX_PROFILE_SCHEMA_VERSION', 'createDocxProfileEnvelope', 'parseDocxProfile', 'serializeDocxProfile', 'verifyDocxTransformTape']);
  const source = fs.readFileSync(path.join(__dirname, '../../src/core/docx-profile-v1.mjs'), 'utf8');
  for (const forbidden of ['node:fs', 'fetch(', 'http.request', 'https.request', 'child_process', 'electron', 'projectStore', 'commandKernel', '@xmldom']) assert.equal(source.includes(forbidden), false, forbidden);
  const created = api.createDocxProfileEnvelope({ identity: f.identity(), document: f.document() });
  const a = api.serializeDocxProfile({ envelope: created.value, expectedIdentity: f.identity(), sourceBytes: null });
  const b = api.serializeDocxProfile({ envelope: created.value, expectedIdentity: f.identity(), sourceBytes: null });
  assert.equal(a.ok, true); assert.equal(b.ok, true); assert.deepEqual(a.bytes, b.bytes);
  a.bytes.fill(0); assert.notDeepEqual(a.bytes, b.bytes); assert.equal(b.sha256, f.hash(b.bytes));
  assert.deepEqual(created.value.body.payload.document, f.document());
});

test('WP703 bounded large-document throughput and memory have nonzero measured samples', async t => {
  const api = await load();
  const text = 'word '.repeat(204)+'tail';
  assert.equal(text.length, 1024);
  const document = { paragraphs: Array.from({ length: 96 }, (_, index) => f.paragraph([f.run(text), f.run(text, { bold: true })], { alignment: index % 2 ? 'center' : 'left' })) };
  const samples = [];
  for (let sample = 0; sample < 6; sample += 1) {
    const start = performance.now();
    const created = api.createDocxProfileEnvelope({ identity: f.identity(), document }); assert.equal(created.ok, true);
    const output = api.serializeDocxProfile({ envelope: created.value, expectedIdentity: f.identity(), sourceBytes: null }); assert.equal(output.ok, true);
    const parsed = api.parseDocxProfile({ bytes: output.bytes, identity: f.identity() }); assert.equal(parsed.ok, true);
    assert.deepEqual(f.independentDocument(f.extractParts(output.bytes).get('word/document.xml').toString()), document);
    const elapsed = performance.now() - start;
    assert(elapsed < 10_000, `bounded roundtrip exceeded 10s: ${elapsed}`);
    if (sample > 0) samples.push(elapsed);
  }
  samples.sort((a, b) => a - b);
  assert.equal(samples.length, 5);
  const maxRssKiB = process.resourceUsage().maxRSS;
  assert(maxRssKiB > 0 && maxRssKiB < 524_288);
  t.diagnostic(JSON.stringify({ workload: { paragraphs: 96, runs: 192, textBytes: 196608, semanticFields: 1057 }, warmupSamples: 1, measuredSamples: 5, p50Ms: samples[2], p95Ms: samples[4], maxMs: samples[4], maxRssKiB, maxRoundtripMs: 10000, maxRssBudgetKiB: 524288, cancellation: 'NOT_APPLICABLE_SYNCHRONOUS_PURE_QUERY_NO_JOB_OR_PUBLICATION_PHASE' }));
});
