'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const f = require('../fixtures/r24-wp705-negotiation-corpus-fixtures.js');
const load = () => import('../../src/core/interchange-negotiation-v1.mjs');

test('WP705 deterministic corpus independently checks every source field and output text across six local hops', async t => {
  const api = await load(); let fields = 0, preserved = 0, losses = 0, hopDenominator = 0;
  for (let seed = 0; seed < 96; seed++) {
    const document = f.generatedDocument(seed), request = await f.request(document), before = f.canonical(request.envelope);
    const preview = api.previewDocxTextDowngrade(request); assert.equal(preview.ok, true, 'seed ' + seed + ':' + JSON.stringify(preview));
    const decoded = new TextDecoder('utf-8', { fatal: true }).decode(preview.bytes); assert.equal(decoded, f.expectedText(document));
    const expected = f.expectedFields(document); assert.equal(preview.receipt.fieldDenominator, expected.size);
    assert.deepEqual(new Set(preview.receipt.fieldRows.map(row => row.fieldPath)), new Set(expected.keys()));
    for (const row of preview.receipt.fieldRows) {
      fields++; assert.equal(row.sourceValueSha256, f.digest(expected.get(row.fieldPath)));
      if (row.disposition === 'PRESERVED_TEXT') { preserved++; assert.equal(decoded.slice(row.targetRangeUtf16.from, row.targetRangeUtf16.to), expected.get(row.fieldPath)); assert.equal(row.targetValueSha256, row.sourceValueSha256); }
      else { losses++; assert(preview.receipt.lossLedger.items.some(item => item.fieldPath === row.fieldPath && item.disposition === row.disposition)); }
    }
    assert.equal(api.verifyDocxTextDowngrade({ request, receipt: preview.receipt, bytes: preview.bytes }).ok, true);
    const replay = api.replayDocxTextDowngrade({ request, hopCount: 6 }); assert.equal(replay.ok, true); hopDenominator += replay.receipt.hopDenominator;
    assert(replay.receipt.cumulativeLossLedger.itemDenominator >= preview.receipt.lossLedger.itemDenominator);
    assert.equal(f.canonical(request.envelope), before);
  }
  assert.equal(hopDenominator, 576); assert.equal(preserved + losses, fields); assert(fields > 3000); assert(preserved > 100);
  t.diagnostic(JSON.stringify({ independentDocumentCases: 96, exactSourceFieldComparisons: fields, preservedTextComparisons: preserved, explicitLossComparisons: losses, replayHopDenominator: hopDenominator, generator: 'WP705_XORSHIFT32_SEEDS_0_THROUGH_95_V1' }));
});

test('WP705 four independent IR families and downgrade artifacts survive actual synthetic file readback', async t => {
  const api = await load(), ir = await import('../../src/core/interchange-ir-v1.mjs'), formats = await import('../../src/core/pdf-archive-review-profile-v1.mjs'), previous = require('../fixtures/r24-wp704-pdf-archive-review-fixtures.js');
  const request = await f.request(), dir = fs.mkdtempSync(path.join(os.tmpdir(), 'yalken-wp705-io-'));
  const entries = previous.entries(), manifest = JSON.parse(entries[0].bytes); manifest.projectId = f.identity().projectId; entries[0].bytes = previous.jsonBytes(manifest);
  const project = formats.createProjectArchiveProfile({ entries, identity: f.identity() }); assert.equal(project.ok, true);
  const packet = await previous.packet(); packet.projectId = f.identity().projectId; packet.sessionId = f.identity().entityId;
  const review = formats.createReviewPacketProfile({ packet, identity: f.identity(), expectedBaselineHash: previous.baseline }); assert.equal(review.ok, true);
  const evidence = ir.createInterchangeIrEnvelope({ familyId: 'EVIDENCE', identity: f.identity(), payload: { fixtureOnly: true, claimAuthority: false } }); assert.equal(evidence.ok, true);
  const models = [request.envelope, project.value, review.value, evidence.value]; let files = 0;
  try {
    for (const model of models) {
      const family = model.body.familyId, serialized = ir.serializeInterchangeIrEnvelope(model); assert.equal(serialized.ok, true);
      const file = path.join(dir, family + '.json'); fs.writeFileSync(file, serialized.bytes, { flag: 'wx' }); files++;
      const bytes = fs.readFileSync(file); assert.deepEqual(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)), model);
      assert.equal(f.hash(bytes), serialized.sha256); const parsed = ir.parseInterchangeIrEnvelope(bytes); assert.equal(parsed.ok, true);
      assert.equal(api.negotiateInterchangeSchema({ envelope: parsed.value, expectedIdentity: f.identity(), offers: [f.offer(family)] }).ok, true);
    }
    const preview = api.previewDocxTextDowngrade(request); assert.equal(preview.ok, true); const file = path.join(dir, 'preview.txt'); fs.writeFileSync(file, preview.bytes, { flag: 'wx' }); files++;
    assert.equal(fs.readFileSync(file, 'utf8'), f.expectedText(f.document())); assert.equal(api.verifyDocxTextDowngrade({ request, receipt: preview.receipt, bytes: fs.readFileSync(file) }).ok, true);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  assert.equal(fs.existsSync(dir), false); t.diagnostic(JSON.stringify({ physicalLocalFileDenominator: files, independentFamilyDenominator: models.length, cleanup: 'REMOVED_ONLY_DISPOSABLE_TEST_DIRECTORY', physicalProviderClaim: false }));
});

test('WP705 deterministic hostile version and corrupt-byte fuzz never upgrades authority', async t => {
  const api = await load(), request = await f.request(), preview = api.previewDocxTextDowngrade(request); let rejected = 0;
  for (let seed = 0; seed < 256; seed++) {
    const result = api.negotiateInterchangeSchema({ envelope: request.envelope, expectedIdentity: f.identity(), offers: [f.offer('DOCUMENT', seed + 2)] }); assert.equal(result.status, 'UNSUPPORTED_SCHEMA'); rejected++;
    const changed = Buffer.from(preview.bytes); changed[seed % changed.length] ^= 1 + seed % 255;
    assert(!changed.equals(preview.bytes)); assert.equal(api.verifyDocxTextDowngrade({ request, receipt: preview.receipt, bytes: changed }).ok, false); rejected++;
  }
  assert.equal(rejected, 512); t.diagnostic(JSON.stringify({ deterministicHostileCases: 512, rejected, unresolvedCounterexamples: 0, campaign: 'EXHAUSTIVE_VERSION_2_TO_257_AND_256_BYTE_MUTATIONS_V1', randomCampaignClaim: false }));
});

test('WP705 outputs are deterministic across nine independent timezone and locale processes', async t => {
  const code = "const f=require('./test/fixtures/r24-wp705-negotiation-corpus-fixtures.js');(async()=>{const a=await import('./src/core/interchange-negotiation-v1.mjs');const r=a.previewDocxTextDowngrade(await f.request());if(!r.ok)throw Error(JSON.stringify(r));console.log(r.receiptSha256+':'+f.hash(r.bytes));})();";
  const results = [];
  for (const TZ of ['UTC', 'Pacific/Honolulu', 'Asia/Tokyo']) for (const LANG of ['C', 'en_US.UTF-8', 'tr_TR.UTF-8']) results.push(execFileSync(process.execPath, ['-e', code], { cwd: path.resolve(__dirname, '../..'), env: { ...process.env, TZ, LANG }, encoding: 'utf8', timeout: 15000 }).trim());
  assert.equal(new Set(results).size, 1); t.diagnostic(JSON.stringify({ independentTimezoneLocaleProcesses: 9, uniquePreviewAndArtifactDigests: 1 }));
});

test('WP705 large bounded source has a complete independently enumerated ledger and safe resource rejection', async t => {
  const api = await load(), document = { paragraphs: Array.from({ length: 128 }, (_, n) => f.paragraph('', { runs: Array.from({ length: 4 }, (_, r) => f.run(`Synthetic ${n}:${r} ` + 'мир '.repeat(20), { bold: r % 2 === 0 })) })) }, request = await f.request(document);
  const start = performance.now(), rss = process.memoryUsage().rss, result = api.previewDocxTextDowngrade(request); assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.receipt.fieldDenominator, f.expectedFields(document).size); assert.equal(result.receipt.fieldDenominator, 2433); assert.equal(result.bytes.toString(), f.expectedText(document));
  assert.equal(api.verifyDocxTextDowngrade({ request, receipt: result.receipt, bytes: result.bytes }).ok, true);
  let deep = {}; for (let n = 0; n < 34; n++) deep = { nested: deep };
  const input = { envelope: request.envelope, expectedIdentity: f.identity(), offers: deep }; assert.equal(api.negotiateInterchangeSchema(input).ok, false);
  input.offers = { text: 'x'.repeat(262145) }; assert.equal(api.negotiateInterchangeSchema(input).ok, false);
  const elapsedMs = performance.now() - start, rssDelta = Math.max(0, process.memoryUsage().rss - rss); assert(elapsedMs < 15000); assert(rssDelta < 268435456);
  t.diagnostic(JSON.stringify({ largeSourceParagraphs: 128, largeSourceRuns: 512, exactFieldDenominator: 2433, outputBytes: result.bytes.length, elapsedMs, rssDelta, wallClockSlaClaim: false }));
});

test('WP705 byte accessors shared backing and proxies cannot execute or race verification', async () => {
  const api = await load(), request = await f.request(), preview = api.previewDocxTextDowngrade(request); let invoked = 0;
  const accessor = Buffer.from(preview.bytes); Object.defineProperty(accessor, 'length', { get() { invoked++; return preview.bytes.length; } });
  const proxy = new Proxy(preview.bytes, { getPrototypeOf() { invoked++; throw Error('trap'); } });
  const shared = Buffer.from(new SharedArrayBuffer(preview.bytes.length)); shared.set(preview.bytes);
  for (const bytes of [accessor, proxy, shared]) assert.equal(api.verifyDocxTextDowngrade({ request, receipt: preview.receipt, bytes }).ok, false);
  assert.equal(invoked, 0);
  const source = fs.readFileSync(path.resolve(__dirname, '../../src/core/interchange-negotiation-v1.mjs'), 'utf8');
  for (const forbidden of ['node:fs', 'child_process', 'fetch(', 'ipcRenderer', 'projectStore', 'commandKernel', 'BrowserWindow']) assert(!source.includes(forbidden), forbidden);
});
