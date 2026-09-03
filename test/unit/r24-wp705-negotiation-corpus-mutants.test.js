'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const f = require('../fixtures/r24-wp705-negotiation-corpus-fixtures.js');
const file = path.resolve(__dirname, '../../src/core/interchange-negotiation-v1.mjs');

test('WP705 twenty-two real implementation mutants are killed only by named behavioral assertions', async t => {
  const original = await import(pathToFileURL(file).href), source = fs.readFileSync(file, 'utf8'), request = await f.request();
  const negotiation = { envelope: request.envelope, expectedIdentity: f.identity(), offers: [f.offer()] };
  const preview = original.previewDocxTextDowngrade(request); assert.equal(preview.ok, true);
  const docx = await import('../../src/core/docx-profile-v1.mjs'), artifact = docx.serializeDocxProfile({ envelope: request.envelope, expectedIdentity: f.identity(), sourceBytes: null }); assert.equal(artifact.ok, true);
  const imported = { ...request, envelope: docx.parseDocxProfile({ bytes: artifact.bytes, identity: f.identity() }).value, sourceBytes: artifact.bytes };
  const reject = r => assert.equal(r.ok, false);
  const changedReceipt = f.clone(preview.receipt); changedReceipt.fieldDenominator--;
  const changedBytes = Buffer.from(preview.bytes); changedBytes[0] ^= 1;
  const nfcRequest = await f.request({ paragraphs: [f.paragraph('', { runs: [f.run('e'), f.run('\u0301')] }), f.paragraph('x\n')] });
  const cases = [
    ['proxy-before-traps', '!v || types.isProxy(v) || Object.getPrototypeOf(v) !== Object.prototype', '!v || Object.getPrototypeOf(v) !== Object.prototype', api => { let calls = 0; try { api.negotiateInterchangeSchema(new Proxy({}, { getPrototypeOf() { calls++; throw Error('trap'); } })); } catch {} assert.equal(calls, 0); }],
    ['source-identity', "if (canonical(proof.value.body.identity) !== canonical(identity(expectedIdentity))) reject('E_NEG_STALE_IDENTITY');", '', api => reject(api.negotiateInterchangeSchema({ ...negotiation, expectedIdentity: f.identity({ generation: 9 }) }))],
    ['family-isolation', 'row.familyId === checked.value.body.familyId && ', '', api => reject(api.negotiateInterchangeSchema({ ...negotiation, offers: [{ ...f.offer(), familyId: 'REVIEW' }] }))],
    ['envelope-version', 'row.envelopeSchemaVersion === INTERCHANGE_IR_ENVELOPE_SCHEMA_VERSION && ', '', api => reject(api.negotiateInterchangeSchema({ ...negotiation, offers: [{ ...f.offer(), envelopeSchemaVersion: 'yalken.interchange.ir-envelope.v2' }] }))],
    ['family-version', ' && row.familySchemaVersion === checked.value.body.familySchemaVersion', '', api => reject(api.negotiateInterchangeSchema({ ...negotiation, offers: [f.offer('DOCUMENT', 2)] }))],
    ['duplicate-offers', ' || new Set(rows.map(canonical)).size !== rows.length', '', api => reject(api.negotiateInterchangeSchema({ ...negotiation, offers: [f.offer(), f.offer()] }))],
    ['offer-budget', 'maxOffers: 16', 'maxOffers: 17', api => reject(api.negotiateInterchangeSchema({ ...negotiation, offers: Array.from({ length: 17 }, (_, n) => f.offer('DOCUMENT', n)) }))],
    ['schema-not-payload-authority', 'payloadQualified: false', 'payloadQualified: true', api => assert.equal(api.negotiateInterchangeSchema(negotiation).receipt.payloadQualified, false)],
    ['explicit-loss-policy', "if (input.policy !== DOWNGRADE_PREVIEW_POLICY) reject('E_NEG_LOSS_POLICY');", '', api => reject(api.previewDocxTextDowngrade({ ...request, policy: 'AUTO' }))],
    ['target-schema', ' || input.targetSchemaVersion !== TEXT_FORMATS_SCHEMA_VERSION', '', api => reject(api.previewDocxTextDowngrade({ ...request, targetSchemaVersion: 'yalken.text-formats.v2' }))],
    ['imported-source-replay', "if (!proof.ok) reject('E_NEG_DOCX_SOURCE_REPLAY');", '', api => reject(api.previewDocxTextDowngrade({ ...imported, sourceBytes: null }))],
    ['nfc-loss', 'else if (retained !== normalized)', 'else if (false)', api => assert(api.previewDocxTextDowngrade(nfcRequest).receipt.fieldRows.some(r => r.disposition === 'RUN_BOUNDARY_NFC_NORMALIZED'))],
    ['text-exactness', "exactText ? 'PRESERVED_TEXT' : 'TRAILING_LINEFEED_NORMALIZED'", "true ? 'PRESERVED_TEXT' : 'TRAILING_LINEFEED_NORMALIZED'", api => { const r = api.previewDocxTextDowngrade(nfcRequest); assert.equal(r.ok, true); assert.notEqual(r.receipt.fieldRows.find(row => row.fieldPath === '/paragraphs/1/runs/0/text').disposition, 'PRESERVED_TEXT'); }],
    ['field-denominator', 'fieldDenominator: fieldRows.length,', 'fieldDenominator: fieldRows.length - 1,', api => assert.equal(api.previewDocxTextDowngrade(request).receipt.fieldDenominator, f.expectedFields(f.document()).size)],
    ['inherited-loss', 'const losses = [...inherited, ...fieldRows', 'const losses = [...fieldRows', api => assert(api.previewDocxTextDowngrade(imported).receipt.lossLedger.items.some(r => r.kind === 'INHERITED_SOURCE_LOSS'))],
    ['no-silent-field-loss', "fieldRows.filter(row => row.disposition !== 'PRESERVED_TEXT')", "fieldRows.filter(row => row.disposition === 'PRESERVED_TEXT')", api => { const r = api.previewDocxTextDowngrade(request); assert(r.receipt.lossLedger.items.some(x => x.fieldPath === '/paragraphs')); }],
    ['target-digest', 'targetSha256: hash(output.bytes),', "targetSha256: '0'.repeat(64),", api => { const r = api.previewDocxTextDowngrade(request); assert.equal(r.receipt.targetSha256, f.hash(r.bytes)); }],
    ['preview-byte-replay', "if (!replay.bytes.equals(checkedBytes(input.bytes, replay.bytes.length))) reject('E_NEG_PREVIEW_BYTES');", '', api => reject(api.verifyDocxTextDowngrade({ request, receipt: preview.receipt, bytes: changedBytes }))],
    ['receipt-replay', "if (canonical(clean(input.receipt)) !== canonical(replay.receipt)) reject('E_NEG_PREVIEW_RECEIPT');", '', api => reject(api.verifyDocxTextDowngrade({ request, receipt: changedReceipt, bytes: preview.bytes }))],
    ['loss-monotonicity', 'losses = [...preview.receipt.lossLedger.items]', 'losses = []', api => assert(api.replayDocxTextDowngrade({ request, hopCount: 3 }).receipt.cumulativeLossLedger.itemDenominator >= preview.receipt.lossLedger.itemDenominator)],
    ['hop-hash-link', 'previousHopSha256 = digest(hop);', "previousHopSha256 = '0'.repeat(64);", api => { for (const { hopSha256, ...hop } of api.replayDocxTextDowngrade({ request, hopCount: 3 }).receipt.hops) assert.equal(hopSha256, f.digest(hop)); }],
    ['shared-byte-backing', "types.isSharedArrayBuffer(backing) || Object.getOwnPropertyDescriptor(ArrayBuffer.prototype, 'resizable')?.get.call(backing) || ", '', api => { const bytes = Buffer.from(new SharedArrayBuffer(preview.bytes.length)); bytes.set(preview.bytes); reject(api.verifyDocxTextDowngrade({ request, receipt: preview.receipt, bytes })); }],
  ];
  let killed = 0;
  for (const [name, needle, replacement, behavior] of cases) {
    assert.equal(source.split(needle).length - 1, 1, name + ' anchor'); await behavior(original);
    const mutated = source.replace(needle, replacement).replace(/from '([.][^']+)'/g, (_all, relative) => `from '${pathToFileURL(path.resolve(path.dirname(file), relative)).href}'`);
    const api = await import('data:text/javascript;base64,' + Buffer.from(mutated).toString('base64')); let failure;
    try { await behavior(api); } catch (e) { failure = e; }
    assert.equal(failure?.code, 'ERR_ASSERTION', name + ' survived or failed outside behavioral oracle'); killed++;
  }
  assert.equal(cases.length, 22); assert.equal(killed, 22); t.diagnostic(JSON.stringify({ implementationMutants: cases.length, killed, survivors: cases.length - killed, syntaxOrImportFailuresCountedAsKills: false }));
});
