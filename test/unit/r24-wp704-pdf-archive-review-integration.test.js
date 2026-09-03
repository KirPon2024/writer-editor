'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const f = require('../fixtures/r24-wp704-pdf-archive-review-fixtures.js');
const load = () => import('../../src/core/pdf-archive-review-profile-v1.mjs');
// Independent local-record reader: deliberately does not call production ZIP
// parsing, quarantine, profile parsing or its manifest verifier.
function independentStoredZip(bytes) {
  const result = new Map(); let at = 0;
  while (bytes.readUInt32LE(at) === 0x04034b50) {
    assert.equal(bytes.readUInt16LE(at + 8), 0); assert.equal(bytes.readUInt16LE(at + 6), 0x800);
    assert.equal(bytes.readUInt16LE(at + 10), 0); assert.equal(bytes.readUInt16LE(at + 12), 33);
    const size = bytes.readUInt32LE(at + 18), names = bytes.readUInt16LE(at + 26), extras = bytes.readUInt16LE(at + 28), start = at + 30 + names + extras;
    const name = new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(at + 30, at + 30 + names)); assert(!result.has(name));
    result.set(name, Buffer.from(bytes.subarray(start, start + size))); at = start + size;
  }
  assert.equal(bytes.readUInt32LE(at), 0x02014b50); return result;
}

test('WP704 independent complete archive differential corpus and three-hop byte replay', async t => {
  const api = await load(); let cases = 0, comparisons = 0;
  for (let seed = 0; seed < 32; seed++) {
    const entries = [...f.entries(), ...Array.from({ length: seed % 8 }, (_, n) => ({ relativePath: `corpus/${seed}-${n}-мир.txt`, bytes: Buffer.from(('Synthetic café 日本語 ' + n).repeat(seed + 1)) }))];
    const model = api.createProjectArchiveProfile({ identity: f.identity(), entries: [...entries].reverse() }); assert.equal(model.ok, true);
    let envelope = model.value, first;
    for (let hop = 0; hop < 3; hop++) {
      const output = api.serializeProjectArchiveProfile({ envelope, expectedIdentity: f.identity() }); assert.equal(output.ok, true);
      first ??= output.bytes; assert.deepEqual(output.bytes, first);
      const readback = independentStoredZip(output.bytes); assert.equal(readback.size, entries.length + 1);
      const manifest = JSON.parse(readback.get('yalken-archive-manifest.v1.json')); assert.equal(manifest.entries.length, entries.length);
      for (const entry of entries) { assert.deepEqual(readback.get('project/' + entry.relativePath), entry.bytes); comparisons++; }
      const parsed = api.parseProjectArchiveProfile({ bytes: output.bytes, identity: f.identity() }); assert.equal(parsed.ok, true); envelope = parsed.value; cases++;
    }
  }
  assert.equal(cases, 96); assert.equal(comparisons, 720);
  t.diagnostic(JSON.stringify({ independentArchiveCases: cases, exactFileComparisons: comparisons, independentOracle: 'LOCAL_ZIP_RECORD_BYTES_NOT_PRODUCTION_PARSER' }));
});

test('WP704 archive bytes are stable across independent timezone and locale processes', async t => {
  const script = "const f=require('./test/fixtures/r24-wp704-pdf-archive-review-fixtures.js');import('./src/core/pdf-archive-review-profile-v1.mjs').then(a=>{const m=a.createProjectArchiveProfile({identity:f.identity(),entries:f.entries()});const r=a.serializeProjectArchiveProfile({envelope:m.value,expectedIdentity:f.identity()});if(!r.ok)throw Error(JSON.stringify(r));console.log(r.sha256);});";
  const hashes = [];
  for (const TZ of ['UTC', 'Pacific/Honolulu', 'Asia/Tokyo']) for (const LANG of ['C', 'en_US.UTF-8', 'tr_TR.UTF-8']) hashes.push(execFileSync(process.execPath, ['-e', script], { cwd: path.resolve(__dirname, '../..'), env: { ...process.env, TZ, LANG }, encoding: 'utf8' }).trim());
  assert.equal(hashes.length, 9); assert.equal(new Set(hashes).size, 1); assert.match(hashes[0], /^[0-9a-f]{64}$/);
  t.diagnostic(JSON.stringify({ independentTimezoneLocaleProcesses: hashes.length, uniqueArchiveDigests: 1 }));
});

test('WP704 actual archive and native packet file readback preserves source and complete identity', async () => {
  const api = await load(), dir = fs.mkdtempSync(path.join(os.tmpdir(), 'yalken-wp704-io-'));
  try {
    const project = api.createProjectArchiveProfile({ entries: f.entries(), identity: f.identity() });
    const archive = api.serializeProjectArchiveProfile({ envelope: project.value, expectedIdentity: f.identity() }); assert.equal(archive.ok, true);
    fs.writeFileSync(path.join(dir, 'synthetic-project.zip'), archive.bytes, { flag: 'wx' });
    assert.deepEqual(api.parseProjectArchiveProfile({ bytes: fs.readFileSync(path.join(dir, 'synthetic-project.zip')), identity: f.identity() }).value, project.value);
    const packet = await f.packet(), review = api.createReviewPacketProfile({ packet, identity: f.identity(), expectedBaselineHash: f.baseline });
    const output = api.serializeReviewPacketProfile({ envelope: review.value, expectedIdentity: f.identity(), expectedBaselineHash: f.baseline }); assert.equal(output.ok, true);
    fs.writeFileSync(path.join(dir, 'synthetic-review.json'), output.bytes, { flag: 'wx' });
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dir, 'synthetic-review.json'))), packet);
    assert.equal(api.parseReviewPacketProfile({ bytes: fs.readFileSync(path.join(dir, 'synthetic-review.json')), identity: f.identity({ projectId: 'foreign' }), expectedBaselineHash: f.baseline }).ok, false);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('WP704 PDF port pins actual Electron options, denies resource navigation and always destroys windows', async () => {
  const { createElectronPdfProfilePort } = require('../../src/core/electron-pdf-profile-port-v1.cjs');
  let options, open, navigation, filter, network, destroyed = 0, fail = false;
  class Window {
    constructor(input) { options = input; this.webContents = { setWindowOpenHandler: fn => { open = fn; }, on: (_name, fn) => { navigation = fn; }, session: { webRequest: { onBeforeRequest: (f, fn) => { filter = f; network = fn; } } }, printToPDF: async config => { assert.equal(config.preferCSSPageSize, true); assert.equal(config.generateTaggedPDF, false); if (fail) throw new Error('synthetic print failure'); return f.syntheticPdf(); } }; }
    async loadURL(url) { assert(url.startsWith('data:text/html;charset=utf-8,')); }
    isDestroyed() { return false; }
    destroy() { destroyed++; }
  }
  const port = createElectronPdfProfilePort({ BrowserWindow: Window, versions: { electron: '41.10.3' }, readIdentity: f.identity });
  await port.render('<!doctype html><html>synthetic</html>'); assert.equal(destroyed, 1);
  assert.equal(options.show, false); assert.deepEqual(options.webPreferences, { contextIsolation: true, javascript: false, nodeIntegration: false, sandbox: true, webSecurity: true, partition: 'wp704-offline-pdf' });
  assert.deepEqual(open(), { action: 'deny' }); let prevented = false; navigation({ preventDefault() { prevented = true; } }); assert(prevented);
  assert(filter.urls.includes('https://*/*')); let decision; network({}, d => { decision = d; }); assert.deepEqual(decision, { cancel: true });
  fail = true; await assert.rejects(port.render('<!doctype html><html>synthetic</html>'), /synthetic print failure/); assert.equal(destroyed, 2);
  assert.throws(() => createElectronPdfProfilePort({ BrowserWindow: Window, versions: { electron: '41.10.2' }, readIdentity: f.identity }), /E_PAR_ELECTRON_PROFILE/);
});

test('WP704 pure profiles reject directory ambiguity, duplicate proposal ids and resolved decisions', async () => {
  const api = await load();
  assert.equal(api.createProjectArchiveProfile({ identity: f.identity(), entries: [...f.entries(), { relativePath: 'node', bytes: Buffer.from('file') }, { relativePath: 'node/child.txt', bytes: Buffer.from('child') }] }).ok, false);
  const packet = await f.packet();
  for (const mutate of [p => p.reviewPacket.commentThreads.push(f.clone(p.reviewPacket.commentThreads[0])), p => p.reviewPacket.commentThreads[0].status = 'resolved']) { const v = f.clone(packet); mutate(v); assert.equal(api.createReviewPacketProfile({ packet: v, identity: f.identity(), expectedBaselineHash: f.baseline }).ok, false); }
  const source = fs.readFileSync(path.join(__dirname, '../../src/core/pdf-archive-review-profile-v1.mjs'), 'utf8');
  for (const forbidden of ['node:fs', 'child_process', 'fetch(', 'projectStore', 'commandKernel', 'ipcRenderer']) assert(!source.includes(forbidden), forbidden);
});

test('WP704 bounded large archive and document profiles have measured nonzero coverage', async t => {
  const api = await load(), entries = [...f.entries(), { relativePath: 'corpus/a.txt', bytes: Buffer.alloc(180000, 65) }, { relativePath: 'corpus/b.txt', bytes: Buffer.alloc(180000, 66) }];
  const start = performance.now(), rss = process.memoryUsage().rss;
  const a = api.createProjectArchiveProfile({ entries, identity: f.identity() }); assert.equal(a.ok, true, JSON.stringify(a));
  const serialized = api.serializeProjectArchiveProfile({ envelope: a.value, expectedIdentity: f.identity() }); assert.equal(serialized.ok, true); assert.equal(api.parseProjectArchiveProfile({ bytes: serialized.bytes, identity: f.identity() }).ok, true);
  const doc = { paragraphs: Array.from({ length: 512 }, (_, n) => f.paragraph(`Synthetic paragraph ${n}: ` + 'bounded '.repeat(12))) };
  const projection = api.buildPdfProfileProjection({ envelope: await f.documentEnvelope(doc), expectedIdentity: f.identity(), sourceBytes: null }); assert.equal(projection.ok, true); assert.equal(projection.paragraphDenominator, 512);
  const elapsedMs = performance.now() - start, rssDelta = Math.max(0, process.memoryUsage().rss - rss); assert(elapsedMs < 15000); assert(rssDelta < 268435456);
  t.diagnostic(JSON.stringify({ largeArchiveSourceBytes: entries.reduce((n, e) => n + e.bytes.length, 0), largeDocumentParagraphs: 512, elapsedMs, rssDelta, wallClockSlaClaim: false }));
});

test('WP704 adapter deadline destroys a stalled window and never publishes partial bytes', async () => {
  const vm = require('node:vm'), module = { exports: {} }; let destroyed = 0, timerCleared = 0, deadline;
  // Execute the unchanged adapter with a deterministic host clock; do not wait
  // thirty seconds or count a synthetic receipt as an executed timeout oracle.
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../../src/core/electron-pdf-profile-port-v1.cjs'), 'utf8'), {
    module, Buffer, setTimeout(callback, ms) { deadline = ms; queueMicrotask(callback); return 704; },
    clearTimeout(id) { assert.equal(id, 704); timerCleared++; },
  });
  class StalledWindow {
    constructor() { this.webContents = { setWindowOpenHandler() {}, on() {}, session: { webRequest: { onBeforeRequest() {} } }, printToPDF() { assert.fail('stalled navigation must not print'); } }; }
    loadURL() { return new Promise(() => {}); }
    isDestroyed() { return false; }
    destroy() { destroyed++; }
  }
  const port = module.exports.createElectronPdfProfilePort({ BrowserWindow: StalledWindow, versions: { electron: '41.10.3' }, readIdentity: f.identity });
  await assert.rejects(port.render('<!doctype html><html>synthetic</html>'), /E_PAR_ELECTRON_TIMEOUT/);
  assert.equal(deadline, 30000); assert.equal(destroyed, 1); assert.equal(timerCleared, 1);
  await assert.rejects(port.render('<!doctype html>' + 'x'.repeat(1048576)), /E_PAR_ELECTRON_HTML/); assert.equal(destroyed, 1);
});
