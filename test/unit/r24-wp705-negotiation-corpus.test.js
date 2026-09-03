'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const f = require('../fixtures/r24-wp705-negotiation-corpus-fixtures.js');
const load = () => import('../../src/core/interchange-negotiation-v1.mjs');

test('WP705 exact four-family schema negotiation never grants payload or mutation authority', async () => {
  const api = await load(), ir = await import('../../src/core/interchange-ir-v1.mjs');
  for (const familyId of ['DOCUMENT', 'EVIDENCE', 'PROJECT', 'REVIEW']) {
    const source = ir.createInterchangeIrEnvelope({ familyId, identity: f.identity(), payload: { unqualified: true } }); assert.equal(source.ok, true);
    const input = { envelope: source.value, expectedIdentity: f.identity(), offers: [f.offer(familyId, 2), f.offer(familyId)] };
    const a = api.negotiateInterchangeSchema(input); assert.equal(a.ok, true); assert.equal(a.receipt.selectedSchemas.familySchemaVersion, ir.INTERCHANGE_IR_FAMILIES[familyId]);
    assert.equal(a.receipt.schemaOnly, true); assert.equal(a.receipt.payloadQualified, false); assert.equal(a.receipt.productMutationAuthority, false); assert.equal(a.receipt.providerAuthority, false); assert.equal(a.receipt.evaluatedOfferDenominator, 2);
    assert.equal(a.receipt.sourceEnvelopeSha256, source.sha256); assert.equal(a.receiptSha256, f.digest(a.receipt));
    assert.deepEqual(a, api.negotiateInterchangeSchema({ ...input, offers: [...input.offers].reverse() }));
    for (const version of [0, 2, 999999]) { const denied = api.negotiateInterchangeSchema({ ...input, offers: [f.offer(familyId, version)] }); assert.equal(denied.status, 'UNSUPPORTED_SCHEMA'); assert.equal(denied.outputPublished, false); }
  }
});

test('WP705 every schema/identity/offer conjunct rejects independently', async t => {
  const api = await load(), request = await f.request(), valid = { envelope: request.envelope, expectedIdentity: f.identity(), offers: [f.offer()] };
  const cases = [
    ['empty offers', x => { x.offers = []; }], ['duplicate offers', x => { x.offers.push(f.offer()); }], ['offer budget', x => { x.offers = Array.from({ length: 17 }, (_, n) => f.offer('DOCUMENT', n)); }],
    ['unknown family', x => { x.offers[0].familyId = 'SECRET'; }], ['malformed version', x => { x.offers[0].familySchemaVersion = 'v1'; }], ['unknown field', x => { x.apply = true; }], ['offer authority', x => { x.offers[0].authority = true; }],
    ['envelope digest', x => { x.envelope.bodySha256 = '0'.repeat(64); }], ['future envelope', x => { x.envelope.schemaVersion = 'yalken.interchange.ir-envelope.v2'; }], ['future source family', x => { x.envelope.body.familySchemaVersion = 'yalken.interchange.document-ir.v2'; }],
    ...['entityId', 'projectId', 'sourceRevision', 'generation'].map(key => [key, x => { x.expectedIdentity[key] = key === 'generation' ? 99 : 'foreign'; }]),
    ['sparse array', x => { delete x.offers[0]; }], ['NFD', x => { x.expectedIdentity.entityId = 'e\u0301'; }], ['lone surrogate', x => { x.expectedIdentity.entityId = '\ud800'; }], ['null identity', x => { x.expectedIdentity = null; }],
  ];
  for (const [name, mutate] of cases) { const x = f.clone(valid); mutate(x); const result = api.negotiateInterchangeSchema(x); assert.equal(result.ok, false, name); assert.equal(result.outputPublished, false, name); }
  t.diagnostic(JSON.stringify({ schemaNegativeConjunctDenominator: cases.length, rejected: cases.length }));
});

test('WP705 accessors proxies hidden fields and executable JSON are denied without invocation', async () => {
  const api = await load(), request = await f.request(); let invoked = 0;
  const input = { envelope: request.envelope, expectedIdentity: f.identity(), offers: [f.offer()] };
  const accessor = { ...input }; Object.defineProperty(accessor, 'offers', { enumerable: true, get() { invoked++; return [f.offer()]; } });
  assert.equal(api.negotiateInterchangeSchema(accessor).ok, false);
  assert.equal(api.negotiateInterchangeSchema(new Proxy(input, { getPrototypeOf() { invoked++; throw Error('trap'); } })).ok, false);
  const row = f.offer(); Object.defineProperty(row, 'familyId', { enumerable: true, get() { invoked++; return 'DOCUMENT'; } });
  assert.equal(api.negotiateInterchangeSchema({ ...input, offers: [row] }).ok, false);
  for (const bad of [() => {}, Symbol('no'), new Date(), { x: NaN }, { x: -0 }, Object.assign([], { extra: true }), JSON.parse('{"__proto__":1}')]) assert.equal(api.negotiateInterchangeSchema({ ...input, offers: bad }).ok, false);
  const hidden = { ...input }; Object.defineProperty(hidden, 'hidden', { value: true }); assert.equal(api.negotiateInterchangeSchema(hidden).ok, false);
  assert.equal(invoked, 0);
});

test('WP705 downgrade requires exact explicit policy target source and current identity', async () => {
  const api = await load(), valid = await f.request();
  for (const [key, value] of [['policy', 'AUTO'], ['policy', null], ['targetProfileId', 'MARKDOWN_BOUNDED_V1'], ['targetSchemaVersion', 'yalken.text-formats.v2'], ['expectedIdentity', f.identity({ generation: 6 })], ['sourceBytes', Buffer.from('not an admitted source')]]) assert.equal(api.previewDocxTextDowngrade({ ...valid, [key]: value }).ok, false, key);
  const partial = { ...valid }; delete partial.policy; assert.equal(api.previewDocxTextDowngrade(partial).ok, false);
  const ir = await import('../../src/core/interchange-ir-v1.mjs');
  const wrong = ir.createInterchangeIrEnvelope({ familyId: 'REVIEW', identity: f.identity(), payload: {} });
  assert.equal(api.previewDocxTextDowngrade({ ...valid, envelope: wrong.value }).ok, false);
});

test('WP705 golden downgrade covers every semantic field and every nonpreserved field in loss', async () => {
  const api = await load(), document = f.document(), request = await f.request(document), before = f.canonical(request.envelope);
  const r = api.previewDocxTextDowngrade(request); assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(new TextDecoder('utf-8', { fatal: true }).decode(r.bytes), f.expectedText(document));
  const fields = f.expectedFields(document); assert.equal(r.receipt.fieldDenominator, fields.size); assert.equal(r.receipt.fieldRows.length, fields.size);
  for (const row of r.receipt.fieldRows) { assert(fields.has(row.fieldPath)); assert.equal(row.sourceValueSha256, f.digest(fields.get(row.fieldPath))); if (row.disposition === 'PRESERVED_TEXT') assert.equal(r.bytes.toString().slice(row.targetRangeUtf16.from, row.targetRangeUtf16.to), fields.get(row.fieldPath)); else assert(r.receipt.lossLedger.items.some(loss => loss.fieldPath === row.fieldPath)); }
  assert.equal(r.receipt.lossLedger.itemDenominator, fields.size - r.receipt.preservedTextFieldCount);
  assert.equal(r.receipt.productMutationAuthority, false); assert.equal(r.receipt.reviewApplyAuthority, false); assert.equal(r.receipt.providerAuthority, false); assert.equal(f.canonical(request.envelope), before); assert(Object.isFrozen(r.receipt.fieldRows[0]));
  assert.equal(api.verifyDocxTextDowngrade({ request, receipt: r.receipt, bytes: r.bytes }).ok, true);
});

test('WP705 cross-run NFC trailing linefeed empty and whitespace loss is explicit', async () => {
  const api = await load(), document = { paragraphs: [f.paragraph('', { runs: [f.run('e'), f.run('\u0301')] }), f.paragraph('x\n'), f.paragraph('  '), f.paragraph('')] }, request = await f.request(document);
  const r = api.previewDocxTextDowngrade(request); assert.equal(r.ok, true, JSON.stringify(r)); assert.equal(r.bytes.toString(), 'é\n\nx\n');
  const codes = r.receipt.fieldRows.map(row => row.disposition); for (const c of ['RUN_BOUNDARY_NFC_NORMALIZED', 'TRAILING_LINEFEED_NORMALIZED', 'WHITESPACE_OR_EMPTY_PARAGRAPH_DROPPED']) assert(codes.includes(c));
  assert.equal(api.verifyDocxTextDowngrade({ request, receipt: r.receipt, bytes: r.bytes }).ok, true);
});

test('WP705 imported DOCX exact source replay retains upstream lexical loss', async () => {
  const api = await load(), docx = await import('../../src/core/docx-profile-v1.mjs'), initial = await f.request();
  const artifact = docx.serializeDocxProfile({ envelope: initial.envelope, expectedIdentity: f.identity(), sourceBytes: null }); assert.equal(artifact.ok, true);
  const parsed = docx.parseDocxProfile({ bytes: artifact.bytes, identity: f.identity() }); assert.equal(parsed.ok, true);
  const request = { ...initial, envelope: parsed.value, sourceBytes: artifact.bytes }, r = api.previewDocxTextDowngrade(request); assert.equal(r.ok, true);
  assert.equal(r.receipt.lossLedger.inheritedItemDenominator, 1); assert.equal(r.receipt.lossLedger.items[0].item.code, 'PACKAGE_LEXICAL_BYTES_NOT_PRESERVED'); assert.equal(r.receipt.sourceArtifactSha256, artifact.sha256);
  const changed = Buffer.from(artifact.bytes); changed[10] ^= 1; assert(!changed.equals(artifact.bytes));
  for (const sourceBytes of [null, Buffer.from('bad'), changed]) assert.equal(api.previewDocxTextDowngrade({ ...request, sourceBytes }).ok, false);
});

test('WP705 verification recomputes receipt and output and rejects every accounting overclaim', async t => {
  const api = await load(), request = await f.request(), made = api.previewDocxTextDowngrade(request); assert.equal(made.ok, true);
  const mutations = [r => r.fieldDenominator--, r => r.fieldRows.pop(), r => r.lossLedger.items.pop(), r => r.lossLedger.itemDenominator--, r => r.productMutationAuthority = true, r => r.providerAuthority = true, r => r.sourceEnvelopeSha256 = '0'.repeat(64), r => r.targetSha256 = '0'.repeat(64), r => r.fieldRows[0].disposition = 'PRESERVED_TEXT', r => r.identity.generation++, r => r.targetSchemaVersion = 'v0'];
  for (const mutate of mutations) { const receipt = f.clone(made.receipt); mutate(receipt); assert.equal(api.verifyDocxTextDowngrade({ request, receipt, bytes: made.bytes }).ok, false); }
  assert.equal(api.verifyDocxTextDowngrade({ request, receipt: made.receipt, bytes: Buffer.from(made.bytes).fill(33, 0, 1) }).ok, false);
  assert.equal(api.verifyDocxTextDowngrade({ request: { ...request, expectedIdentity: f.identity({ sourceRevision: 'stale' }) }, receipt: made.receipt, bytes: made.bytes }).ok, false);
  t.diagnostic(JSON.stringify({ previewHostileDenominator: mutations.length + 2, rejected: mutations.length + 2 }));
});

test('WP705 one through six exact local hops preserve monotone loss and independent hash links', async () => {
  const api = await load(), request = await f.request(), preview = api.previewDocxTextDowngrade(request); assert.equal(preview.ok, true);
  for (let count = 1; count <= 6; count++) {
    const replay = api.replayDocxTextDowngrade({ request, hopCount: count }); assert.equal(replay.ok, true); assert.equal(replay.receipt.hopDenominator, count);
    let previous = preview.receiptSha256, lossCount = preview.receipt.lossLedger.itemDenominator;
    for (const { hopSha256, ...hop } of replay.receipt.hops) { assert.equal(hop.previousHopSha256, previous); assert.equal(hopSha256, f.digest(hop)); assert(hop.cumulativeLossDenominator >= lossCount); previous = hopSha256; lossCount = hop.cumulativeLossDenominator; }
    assert.deepEqual(replay.receipt.cumulativeLossLedger.items.slice(0, preview.receipt.lossLedger.itemDenominator), preview.receipt.lossLedger.items);
    assert.equal(replay.receipt.finalSha256, f.hash(replay.bytes)); assert.equal(replay.receipt.physicalProviderClaim, false);
  }
  for (const hopCount of [0, 7, 1.5, '2', null]) assert.equal(api.replayDocxTextDowngrade({ request, hopCount }).ok, false);
});
