'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const f = require('../fixtures/r24-wp704-pdf-archive-review-fixtures.js');
const archive = require('../../src/export/archive/projectArchiveExportHandler.js');
const { buildZip } = require('../fixtures/r24-wp701-parser-quarantine-fixtures.js');
const load = () => import('../../src/core/pdf-archive-review-profile-v1.mjs');
const bad = result => { assert.equal(result.ok, false, JSON.stringify(result)); assert.equal(result.productMutationAuthority, false); assert.equal(result.outputPublished, false); assert.equal(result.bytes, undefined); };

test('WP704 PDF projection preserves bounded semantic document with escaped offline markup', async () => {
  const api = await load(), envelope = await f.documentEnvelope(), input = { envelope, expectedIdentity: f.identity(), sourceBytes: null };
  const a = api.buildPdfProfileProjection(input), b = api.buildPdfProfileProjection(input);
  assert.equal(a.ok, true, JSON.stringify(a)); assert.deepEqual(a, b); assert.equal(a.paragraphDenominator, 4);
  assert(a.html.includes('&lt;script&gt;')); assert(!a.html.includes('<script>')); assert(a.html.includes("default-src 'none'"));
  assert(a.html.includes('мир')); assert(a.html.includes('white-space:pre-wrap')); assert.equal(a.lossLedger.itemDenominator, 2);
  assert.equal(a.lossLedger.items[1].code, 'PDF_TEXT_EXTRACTION_NOT_EXACT');
  for (const key of ['projectId', 'entityId', 'sourceRevision', 'generation']) bad(api.buildPdfProfileProjection({ ...input, expectedIdentity: f.identity({ [key]: key === 'generation' ? 5 : 'foreign' }) }));
  const forged = f.clone(envelope); forged.body.payload.document.paragraphs[0].runs[0].text = 'tampered'; bad(api.buildPdfProfileProjection({ ...input, envelope: forged }));
});

test('WP704 metadata transform changes exactly two xref-addressed dates and preserves offsets', async () => {
  const api = await load(), original = f.syntheticPdf(), input = { bytes: original, profileId: api.PDF_RENDER_PROFILE };
  const a = api.canonicalizePdfProfileBytes(input), b = api.canonicalizePdfProfileBytes({ ...input, bytes: f.syntheticPdf("D:20260903040506+00'00'") });
  assert.equal(a.ok, true, JSON.stringify(a)); assert.deepEqual(a.bytes, b.bytes); assert.equal(a.byteLength, original.length); assert.equal(a.transformedDateDenominator, 2); assert.equal(a.objectDenominator, 3);
  assert.deepEqual(original, f.syntheticPdf()); assert.equal(a.genericPdfValidationClaim, false);
  assert.deepEqual(api.canonicalizePdfProfileBytes({ ...input, bytes: a.bytes }).bytes, a.bytes);
  const replacements = [Buffer.from('%PDF-1.7\nfake'), Buffer.from(original.toString().replace('/Info 3 0 R', '/Info 9 0 R')), Buffer.from(original.toString().replace('/Size 4', '/Size 5')), f.syntheticPdf("D:20260102030405+00'00'", '\n/Secret (no)'), Buffer.from(original.toString().replace('0000000020', '0000000021')), Buffer.concat([original, Buffer.from('garbage')])];
  for (const bytes of replacements) bad(api.canonicalizePdfProfileBytes({ ...input, bytes }));
  bad(api.canonicalizePdfProfileBytes({ ...input, profileId: 'UNPINNED' }));
});

test('WP704 asynchronous render rejects stale identity before and after work and preserves failure', async () => {
  const api = await load(), input = { envelope: await f.documentEnvelope(), expectedIdentity: f.identity(), sourceBytes: null }; let calls = 0, current = f.identity();
  const port = { profileId: api.PDF_RENDER_PROFILE, readIdentity: () => current, render: async () => { calls++; return f.syntheticPdf(); } };
  assert.equal((await api.renderPdfProfile(input, port)).ok, true); assert.equal(calls, 1);
  current = f.identity({ generation: 5 }); bad(await api.renderPdfProfile(input, port)); assert.equal(calls, 1);
  current = f.identity(); bad(await api.renderPdfProfile(input, { ...port, render: async () => { current = f.identity({ sourceRevision: 'later' }); return f.syntheticPdf(); } }));
  current = f.identity(); bad(await api.renderPdfProfile(input, { ...port, render: async () => { throw new Error('E_PAR_RENDER_FAILED'); } }));
  bad(await api.renderPdfProfile(input, { ...port, profileId: 'DRIFT' }));
});

test('WP704 complete archive roundtrip preserves every source byte including empty and Unicode names', async () => {
  const api = await load(), entries = f.entries(), sourceHashes = entries.map(e => f.hash(e.bytes));
  const model = api.createProjectArchiveProfile({ identity: f.identity(), entries }); assert.equal(model.ok, true, JSON.stringify(model));
  const output = api.serializeProjectArchiveProfile({ envelope: model.value, expectedIdentity: f.identity() }); assert.equal(output.ok, true, JSON.stringify(output)); assert.equal(output.entryDenominator, 4);
  const parsed = api.parseProjectArchiveProfile({ bytes: output.bytes, identity: f.identity() }); assert.equal(parsed.ok, true, JSON.stringify(parsed)); assert.deepEqual(parsed.value, model.value);
  assert.deepEqual(api.serializeProjectArchiveProfile({ envelope: parsed.value, expectedIdentity: f.identity() }).bytes, output.bytes);
  assert.deepEqual(entries.map(e => f.hash(e.bytes)), sourceHashes); assert.equal(output.productMutationAuthority, false);
  const native = archive.readProjectArchivePayload(output.bytes); assert.equal(native.entryCount, entries.length);
  for (const e of entries) assert.deepEqual(native.entries.find(n => n.relativePath === e.relativePath).buffer, e.bytes);
});

test('WP704 archive rejects empty duplicate normalized case confusable and traversal ambiguity', async () => {
  const api = await load(); bad(api.createProjectArchiveProfile({ identity: f.identity(), entries: [] }));
  for (const pair of [['a.txt', 'a.txt'], ['A.txt', 'a.txt'], ['package.txt', 'pаckage.txt'], ['alpha.txt', 'αlpha.txt'], ['full.txt', 'ｆull.txt']]) bad(api.createProjectArchiveProfile({ identity: f.identity(), entries: [...f.entries(), ...pair.map(relativePath => ({ relativePath, bytes: Buffer.from('x') }))] }));
  for (const relativePath of ['/absolute', '../outside', 'a/../outside', 'a//b', 'a\\b', 'C:evil', 'cafe\u0301.txt']) bad(api.createProjectArchiveProfile({ identity: f.identity(), entries: [...f.entries(), { relativePath, bytes: Buffer.from('x') }] }));
  bad(api.createProjectArchiveProfile({ identity: f.identity({ projectId: 'foreign' }), entries: f.entries() }));
  bad(api.createProjectArchiveProfile({ identity: f.identity(), entries: f.entries().slice(1) }));
});

test('WP704 legacy zero-count false green is rejected by complete-denominator profile', async () => {
  const api = await load(), manifest = { schemaVersion: archive.ARCHIVE_SCHEMA_VERSION, entries: [] };
  const bytes = archive.buildZipArchive([{ archivePath: archive.ARCHIVE_MANIFEST_PATH, buffer: f.jsonBytes(manifest) }, { archivePath: 'project/hidden.txt', buffer: Buffer.from('unclaimed') }]);
  assert.equal(archive.verifyProjectArchiveBuffer(bytes).ok, true); bad(api.parseProjectArchiveProfile({ bytes, identity: f.identity() }));
  const source = api.createProjectArchiveProfile({ entries: f.entries(), identity: f.identity() }), valid = api.serializeProjectArchiveProfile({ envelope: source.value, expectedIdentity: f.identity() });
  const native = archive.readProjectArchivePayload(valid.bytes), zipEntries = [{ name: archive.ARCHIVE_MANIFEST_PATH, data: f.jsonBytes(native.manifest) }, ...native.entries.map(e => ({ name: e.archivePath, data: e.buffer }))];
  for (const change of [e => e.slice(0, -1), e => [...e, { name: 'project/extra.txt', data: 'extra' }], e => [...e, e[1]], e => e.map((v, n) => n === 1 ? { ...v, data: 'wrong' } : v)]) bad(api.parseProjectArchiveProfile({ bytes: buildZip(change(zipEntries)), identity: f.identity() }));
});

test('WP704 archive envelope denominator digest and loss tampering cannot self-certify', async () => {
  const api = await load(), created = api.createProjectArchiveProfile({ identity: f.identity(), entries: f.entries() });
  for (const mutate of [p => p.entryDenominator--, p => p.totalFileBytes++, p => p.entries[0].sha256 = '0'.repeat(64), p => p.entries[0].dataBase64 += '=', p => p.lossLedger.items.push({ code: 'hidden' }), p => p.entries.reverse(), p => p.profileId = 'FOREIGN']) bad(api.serializeProjectArchiveProfile({ envelope: await f.reEnvelope(created.value, mutate), expectedIdentity: f.identity() }));
  bad(api.serializeProjectArchiveProfile({ envelope: created.value, expectedIdentity: f.identity({ generation: 5 }) }));
});

test('WP704 native Review Packet has exact proposal-only semantic byte roundtrip', async () => {
  const api = await load(), packet = await f.packet();
  const model = api.createReviewPacketProfile({ packet, identity: f.identity(), expectedBaselineHash: f.baseline }); assert.equal(model.ok, true, JSON.stringify(model)); assert.equal(model.value.body.payload.itemDenominator, 2);
  const output = api.serializeReviewPacketProfile({ envelope: model.value, expectedIdentity: f.identity(), expectedBaselineHash: f.baseline }); assert.equal(output.ok, true, JSON.stringify(output)); assert.deepEqual(JSON.parse(output.bytes), packet); assert.equal(output.canAutoApply, false);
  const parsed = api.parseReviewPacketProfile({ bytes: output.bytes, identity: f.identity(), expectedBaselineHash: f.baseline }); assert.equal(parsed.ok, true, JSON.stringify(parsed)); assert.deepEqual(parsed.value, model.value);
  assert.equal(parsed.providerAuthority, false); assert.equal(parsed.productMutationAuthority, false);
});

test('WP704 Review Packet rejects authority injection decisions foreign identities and silent normalization', async () => {
  const api = await load(), packet = await f.packet();
  for (const key of ['applyOps', 'canApply', 'authority', 'signature', 'secret', 'token', 'receipt', 'recovery', 'filePath', 'projectRoot', 'commandId']) { const mutated = f.clone(packet); mutated.reviewPacket.commentThreads[0][key] = 'hostile'; bad(api.createReviewPacketProfile({ packet: mutated, identity: f.identity(), expectedBaselineHash: f.baseline })); }
  for (const mutate of [p => p.reviewPacket.decisionStates.push({ status: 'accepted' }), p => p.projectId = 'other', p => p.sessionId = 'other', p => p.baselineHash = 'sha256:' + '0'.repeat(64), p => p.reviewPacket.commentThreads[0].unknown = true, p => p.reviewPacket.commentThreads[0].messages[0].body = ' padded ']) { const v = f.clone(packet); mutate(v); bad(api.createReviewPacketProfile({ packet: v, identity: f.identity(), expectedBaselineHash: f.baseline })); }
  const canonical = f.jsonBytes(packet); bad(api.parseReviewPacketProfile({ bytes: Buffer.from(canonical.toString().replace('"packetVersion":', '"packetVersion":"wrong","packetVersion":')), identity: f.identity(), expectedBaselineHash: f.baseline }));
  bad(api.parseReviewPacketProfile({ bytes: Buffer.from(JSON.stringify(packet, null, 2)), identity: f.identity(), expectedBaselineHash: f.baseline }));
});

test('WP704 boundaries reject executable object traps malformed arrays budgets and false family claims', async () => {
  const api = await load(); let invoked = 0;
  const proxy = new Proxy({}, { getPrototypeOf() { invoked++; throw new Error('TRAP'); } }); bad(api.createProjectArchiveProfile(proxy));
  const accessor = { identity: f.identity() }; Object.defineProperty(accessor, 'entries', { enumerable: true, get() { invoked++; return f.entries(); } }); bad(api.createProjectArchiveProfile(accessor)); assert.equal(invoked, 0);
  const sparse = new Array(2); bad(api.createProjectArchiveProfile({ identity: f.identity(), entries: sparse }));
  bad(api.createProjectArchiveProfile({ identity: f.identity(), entries: [...f.entries(), { relativePath: 'large.bin', bytes: Buffer.alloc(api.PDF_ARCHIVE_REVIEW_LIMITS.maxFileBytes + 1) }] }));
  bad(api.createProjectArchiveProfile({ identity: f.identity(), entries: Array.from({ length: 256 }, (_, n) => ({ relativePath: n + '.txt', bytes: Buffer.from('a') })) }));
  bad(api.serializeProjectArchiveProfile({ envelope: await f.documentEnvelope(), expectedIdentity: f.identity() }));
});
