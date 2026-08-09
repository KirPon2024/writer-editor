const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { deflateRawSync } = require('node:zlib');
const { pathToFileURL } = require('node:url');

// GENERIC-01 Pass 1 — RED-FIRST FALSIFIERS ONLY.
//
// This contract pins the CURRENT defects of the generic DOCX create-only
// import lane against its TARGET contract:
//   - full SHA-256 artifact identity (not 32-bit content hash),
//   - main-owned importOperationId + durable idempotent receipt,
//   - fresh Core-allocated tree identity,
//   - one manifest-authority transaction,
//   - visible typed LossLedger,
//   - explicit carrier-ignored classification.
//
// Every RED subtest (G1-G7) fails for an exact, documented defect/absence
// reason, NOT a harness error. Controls (G8) assert already-green behaviour
// is preserved. This pass must not change product runtime: if a control turns
// RED (instead of the new REDs), the harness is broken.
//
// CONTRACT INTEGRITY: implementation is forbidden in this pass. The TARGET
// fields and behaviour named below are NOT claimed as live; they are the
// falsification targets the next pass must make real.

const ROOT = path.resolve(__dirname, '..', '..');
const BRIDGE_MODULE_PATH = path.join(ROOT, 'src', 'io', 'revisionBridge', 'index.mjs');
const SAFE_CREATE_MODULE_PATH = path.join(ROOT, 'src', 'utils', 'docxImportSafeCreate.js');
const FLOW_BATCH_MODULE_PATH = path.join(ROOT, 'src', 'utils', 'flowSceneBatchAtomic.js');

const {
  applyDocxImportSafeCreate,
  rememberDocxImportPreviewPlanAdmission,
  hashDocxImportPreviewPlanForAdmission,
} = require(SAFE_CREATE_MODULE_PATH);
const { writeFlowSceneBatchAtomic } = require(FLOW_BATCH_MODULE_PATH);

async function loadBridge() {
  return import(pathToFileURL(BRIDGE_MODULE_PATH).href);
}

// ---- low-level DOCX zip builder (real packages, no external deps) --------

function asciiBytes(value) {
  return Buffer.from(value, 'ascii');
}

function utf8Bytes(value) {
  return Buffer.from(value, 'utf8');
}

// NOTE: this zip builder mirrors the exact, production-validated fixture helper
// from revision-bridge-docx-import-e2e-command-chain.contract.test.js. The
// central directory records read offset/compressedSize/byteSize/method directly
// from the localRecord() result; re-normalizing here would drop the offset and
// break the multi-part central directory (hostile/multipart packages rely on
// correct local-header offsets).
function normalizeEntry(entry) {
  const body = Buffer.isBuffer(entry.body)
    ? entry.body
    : utf8Bytes(typeof entry.body === 'string' ? entry.body : '');
  const method = entry.method ?? 0;
  const compressedBody = method === 8 ? deflateRawSync(body) : body;
  return {
    name: entry.name,
    method,
    body,
    compressedBody,
    byteSize: entry.byteSize ?? body.length,
    compressedSize: entry.compressedSize ?? compressedBody.length,
  };
}

function localRecord(entry, offset) {
  const normalized = normalizeEntry(entry);
  const name = asciiBytes(normalized.name);
  const header = Buffer.alloc(30 + name.length);
  header.writeUInt32LE(0x04034b50, 0);
  header.writeUInt16LE(20, 4);
  header.writeUInt16LE(entry.flags ?? 0, 6);
  header.writeUInt16LE(normalized.method, 8);
  header.writeUInt32LE(0, 14);
  header.writeUInt32LE(normalized.compressedSize, 18);
  header.writeUInt32LE(normalized.byteSize, 22);
  header.writeUInt16LE(name.length, 26);
  name.copy(header, 30);
  return {
    ...normalized,
    offset,
    bytes: Buffer.concat([header, normalized.compressedBody]),
  };
}

function centralRecord(entry) {
  const name = asciiBytes(entry.name);
  const header = Buffer.alloc(46 + name.length);
  header.writeUInt32LE(0x02014b50, 0);
  header.writeUInt16LE(20, 4);
  header.writeUInt16LE(20, 6);
  header.writeUInt16LE(entry.flags ?? 0, 8);
  header.writeUInt16LE(entry.method, 10);
  header.writeUInt32LE(0, 16);
  header.writeUInt32LE(entry.compressedSize, 20);
  header.writeUInt32LE(entry.byteSize, 24);
  header.writeUInt16LE(name.length, 28);
  header.writeUInt16LE(0, 30);
  header.writeUInt16LE(0, 32);
  header.writeUInt16LE(0, 34);
  header.writeUInt32LE(entry.offset, 42);
  name.copy(header, 46);
  return header;
}

function zipFixture(entries) {
  const locals = [];
  let offset = 0;
  for (const entry of entries) {
    const local = localRecord(entry, offset);
    locals.push(local);
    offset += local.bytes.length;
  }
  const central = Buffer.concat(locals.map((entry) => centralRecord(entry)));
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(locals.length, 8);
  end.writeUInt16LE(locals.length, 10);
  end.writeUInt32LE(central.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);
  return Buffer.concat([Buffer.concat(locals.map((entry) => entry.bytes)), central, end]);
}

function documentXml(body) {
  return `<w:document><w:body>${body}</w:body></w:document>`;
}

function paragraphXml(text) {
  return `<w:p><w:r><w:t>${text}</w:t></w:r></w:p>`;
}

function cleanDocxZip(paragraphs = ['Alpha', 'Bravo']) {
  return zipFixture([
    {
      name: 'word/document.xml',
      method: 8,
      body: documentXml(paragraphs.map(paragraphXml).join('')),
    },
  ]);
}

function yrtk2CarrierDocxZip(paragraphs = ['Carrier scene one']) {
  // A DOCX carrying a YRTK2 round-locator carrier token as a custom property.
  // The generic import lane only parses word/document.xml, so this carrier is
  // silently ignored today (no docProps/custom.xml parse, no classification).
  const customXml = [
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
    '<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/custom-properties">',
    '<property fmtid="{D5CDD505-2E9C-101B-9397-08002B2CF9AE}" pid="2" name="YRTK2_TOKEN">',
    '<vt:lpwstr xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">',
    'YRT2-FAKE-CARRIER-PAYLOAD',
    '</vt:lpwstr>',
    '</property>',
    '</Properties>',
  ].join('');
  return zipFixture([
    {
      name: 'word/document.xml',
      method: 8,
      body: documentXml(paragraphs.map(paragraphXml).join('')),
    },
    {
      name: 'docProps/custom.xml',
      method: 8,
      body: customXml,
    },
  ]);
}

function lossyDocxZip() {
  // A DOCX whose document.xml carries lossy structures (table, tracked
  // revision, comment, hyperlink) that are known to be dropped by the
  // plain-text-only candidate. The TARGET contract persists these as typed
  // LossLedger items in the receipt; today they collapse to a summary count.
  const body = [
    paragraphXml('Has table below'),
    '<w:tbl><w:tr><w:tc><w:p><w:r><w:t>cell</w:t></w:r></w:p></w:tc></w:tr></w:tbl>',
    '<w:p><w:ins w:id="1" w:author="a"><w:r><w:t>inserted</w:t></w:r></w:ins></w:p>',
    '<w:p><w:commentRangeStart w:id="2"/><w:r><w:t>annotated</w:t></w:r><w:commentReference w:id="2"/></w:p>',
    '<w:p><w:hyperlink r:id="rId1"><w:r><w:t>linked</w:t></w:r></w:hyperlink></w:p>',
  ].join('');
  return zipFixture([
    { name: 'word/document.xml', method: 8, body: documentXml(body) },
  ]);
}

// ---- content preview / plan helpers ---------------------------------------

async function previewPlanFromBytes(bytes) {
  const bridge = await loadBridge();
  const content = bridge.buildDocxContentPreviewFromZipBytes(bytes);
  return bridge.buildDocxImportPreviewPlanFromContentPreview(content);
}

// ---- apply helpers --------------------------------------------------------

function makeProjectRoot(prefix = 'rtk-generic01-') {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function makeRomanRoot(projectRoot) {
  const romanRoot = path.join(projectRoot, 'roman');
  fs.mkdirSync(romanRoot, { recursive: true });
  return romanRoot;
}

function defaultApplyOptions(projectRoot, romanRoot) {
  return {
    projectRoot,
    romanRoot,
    projectId: 'generic01-probe-project',
    queueDiskOperation: async (operation) => operation(),
    writeBatchAtomic: writeFlowSceneBatchAtomic,
    operationLabel: 'safe create DOCX import scene batch',
  };
}

async function applyPlan(plan, projectRoot, romanRoot) {
  rememberDocxImportPreviewPlanAdmission(plan);
  return applyDocxImportSafeCreate(
    { docxImportPreviewPlan: plan },
    defaultApplyOptions(projectRoot, romanRoot),
  );
}

function readCreatedSceneFiles(romanRoot) {
  const importedRoot = path.join(romanRoot, 'Imported');
  return fs.readdirSync(importedRoot)
    .filter((name) => name.endsWith('.txt'))
    .sort();
}

function readSingleCreatedScene(romanRoot) {
  const names = readCreatedSceneFiles(romanRoot);
  assert.equal(names.length, 1, `expected exactly one created scene, got ${names.length}`);
  const scenePath = path.join(romanRoot, 'Imported', names[0]);
  return { name: names[0], path: scenePath, content: fs.readFileSync(scenePath, 'utf8') };
}

// ---- assertion helpers ----------------------------------------------------

function sha256Hex(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function deepKeys(value, prefix = '') {
  if (Array.isArray(value)) {
    return value.flatMap((item, index) => deepKeys(item, `${prefix}${index}.`));
  }
  if (!isPlainObject(value)) return [];
  return Object.keys(value).flatMap((key) => {
    const here = `${prefix}${key}`;
    return [here].concat(deepKeys(value[key], `${here}.`));
  });
}

// ===========================================================================
// G1 — full SHA-256 artifact identity (RED: identity is 32-bit content hash)
// ===========================================================================

test('GENERIC01-G1-full-sha-artifact-identity: plan must carry full SHA-256 artifact identity, not a 32-bit content hash', async () => {
  const plan = await previewPlanFromBytes(cleanDocxZip(['Alpha']));
  const source = plan.source;
  const candidateEntry = plan.candidateCreatePlan.entries[0];

  // TARGET: plan.source carries sourceArtifactSha256, a full 64-hex SHA-256 of
  // the raw DOCX artifact bytes.
  // RED REASON (CURRENT): identity is derived from a 32-bit FNV content hash;
  // source has no sourceArtifactSha256 field, so the assertion below fails.
  assert.ok(
    typeof source.sourceArtifactSha256 === 'string' && /^[a-f0-9]{64}$/u.test(source.sourceArtifactSha256),
    'GENERIC01-G1: expected plan.source.sourceArtifactSha256 (64 hex of raw artifact bytes); CURRENT: identity is 32-bit FNV content hash',
  );

  // TARGET: the candidate entry carries a separate candidateContentSha256
  // (64-hex SHA-256 of the importable content), distinct from the artifact.
  // RED REASON (CURRENT): the entry only carries contentTextHash, an 8-hex FNV
  // digest; candidateContentSha256 is absent.
  assert.ok(
    typeof candidateEntry.candidateContentSha256 === 'string' && /^[a-f0-9]{64}$/u.test(candidateEntry.candidateContentSha256),
    'GENERIC01-G1: expected candidate entry candidateContentSha256 (64 hex); CURRENT: only 8-hex contentTextHash (FNV) is present',
  );

  // TARGET: sceneId is NOT derived from the content hash; it is Core-allocated.
  // Two distinct raw artifacts (same document.xml text, different package) must
  // therefore yield distinct sceneIds once identity is bound to the full
  // artifact SHA-256.
  // RED REASON (CURRENT): the two collapse to the SAME sceneId because the
  // sceneId is derived from the 32-bit content hash; distinct artifacts collide.
  const artifactA = cleanDocxZip(['Alpha']);
  const artifactB = zipFixture([
    { name: 'word/document.xml', method: 8, body: documentXml(paragraphXml('Alpha')) },
    { name: 'docProps/custom.xml', method: 8, body: '<x/>' },
  ]);
  assert.equal(artifactA.equals(artifactB), false, 'fixtures must be distinct raw bytes');
  assert.equal(sha256Hex(artifactA) === sha256Hex(artifactB), false, 'raw artifact SHA-256 must differ');

  const planA = await previewPlanFromBytes(artifactA);
  const planB = await previewPlanFromBytes(artifactB);
  const sceneIdA = planA.candidateCreatePlan.entries[0].sceneId;
  const sceneIdB = planB.candidateCreatePlan.entries[0].sceneId;
  assert.notEqual(
    sceneIdA,
    sceneIdB,
    `GENERIC01-G1: expected distinct sceneIds for distinct raw artifacts; CURRENT: both collapse to ${sceneIdA} because identity is 32-bit content hash`,
  );
});

// ===========================================================================
// G2 — duplicate admitted plan returns idempotent receipt (RED: returns error)
// ===========================================================================

test('GENERIC01-G2-duplicate-returns-receipt: re-applying one admitted plan must return the same idempotent receipt', async () => {
  const projectRoot = makeProjectRoot();
  const romanRoot = makeRomanRoot(projectRoot);
  const plan = await previewPlanFromBytes(cleanDocxZip(['Once', 'Twice']));

  const first = await applyPlan(plan, projectRoot, romanRoot);
  assert.equal(first.ok, true, JSON.stringify(first, null, 2));
  const firstReceipt = first.value.receipt;
  const originalText = readSingleCreatedScene(romanRoot).content;

  // TARGET: re-applying the SAME admitted plan returns the original receipt
  // (same importOperationId) and performs no new storage writes.
  // RED REASON (CURRENT): the second apply returns a blocking error
  // (EXISTING_SCENE_BLOCKED) because the path already exists; there is no
  // idempotent receipt store keyed by importOperationId.
  const second = await applyPlan(plan, projectRoot, romanRoot);
  assert.equal(
    second.ok,
    true,
    'GENERIC01-G2: expected duplicate apply to return an idempotent receipt; CURRENT: fails with EXISTING_SCENE_BLOCKED',
  );
  // TARGET: same importOperationId, no new writes.
  assert.equal(
    second.value.receipt.importOperationId,
    firstReceipt.importOperationId,
    'GENERIC01-G2: expected duplicate to reuse the same importOperationId',
  );
  // No new scene files created by the duplicate.
  assert.equal(readCreatedSceneFiles(romanRoot).length, 1);
  assert.equal(readSingleCreatedScene(romanRoot).content, originalText);
});

// ===========================================================================
// G3 — one manifest-authority transaction (RED: bare txt, no tree identity / manifest revision)
// ===========================================================================

test('GENERIC01-G3-one-manifest-authority-transaction: accepted scene must carry canonical tree identity and atomic manifest revision', async () => {
  const projectRoot = makeProjectRoot();
  const romanRoot = makeRomanRoot(projectRoot);
  const plan = await previewPlanFromBytes(cleanDocxZip(['Tree', 'Identity']));
  const applied = await applyPlan(plan, projectRoot, romanRoot);
  assert.equal(applied.ok, true, JSON.stringify(applied, null, 2));
  const receipt = applied.value.receipt;
  const createdSceneRecord = receipt.createdScenes[0];

  // (a) TARGET: the created scene has a canonical tree-node identity (not a
  // bare .txt fingerprint).
  // RED REASON (CURRENT): createdScenes[0] only carries {sceneId, kind, title,
  // bytesWritten, outputHash}; there is no treeNodeId/treeId, so the scene is a
  // bare .txt without tree identity.
  assert.ok(
    typeof createdSceneRecord.treeNodeId === 'string' && createdSceneRecord.treeNodeId.length > 0,
    'GENERIC01-G3: expected created scene to carry canonical tree-node identity; CURRENT: scene is a bare .txt with no tree identity',
  );

  // (b) TARGET: the manifest revision is bumped atomically in the same
  // transaction, with lease/CAS evidence.
  // RED REASON (CURRENT): the receipt has no manifestRevision/manifestAuthority
  // evidence; atomic evidence only records a file-batch marker.
  assert.ok(
    receipt.manifestAuthority && /^[a-f0-9]+$/u.test(String(receipt.manifestAuthority.revision || '')),
    'GENERIC01-G3: expected manifest-authority transaction evidence (lease/CAS revision); CURRENT: only file-batch marker evidence exists',
  );

  // (c) TARGET: the receipt is durable (recoverable), not transient.
  // RED REASON (CURRENT): the receipt is returned in-memory and never persisted
  // to a durable store; no receipt artifact survives the operation.
  assert.ok(
    typeof receipt.importOperationId === 'string' && receipt.importOperationId.length > 0,
    'GENERIC01-G3: expected receipt to be durable via importOperationId; CURRENT: receipt is transient with no operation identity',
  );
});

// ===========================================================================
// G4 — durable idempotent receipt store (RED: receipt transient, no operationId)
// ===========================================================================

test('GENERIC01-G4-durable-idempotent-receipt-store: receipt must carry importOperationId and be recoverable from a durable store', async () => {
  const projectRoot = makeProjectRoot();
  const romanRoot = makeRomanRoot(projectRoot);
  const plan = await previewPlanFromBytes(cleanDocxZip(['Durable', 'Receipt']));
  const applied = await applyPlan(plan, projectRoot, romanRoot);
  assert.equal(applied.ok, true, JSON.stringify(applied, null, 2));
  const receipt = applied.value.receipt;

  // TARGET: the receipt carries a main-owned importOperationId.
  // RED REASON (CURRENT): the receipt has no importOperationId field; there is
  // no main-owned operation identity for idempotent lookup.
  assert.ok(
    typeof receipt.importOperationId === 'string' && receipt.importOperationId.length > 0,
    'GENERIC01-G4: expected receipt.importOperationId (main-owned operation identity); CURRENT: receipt has no importOperationId',
  );

  // TARGET: re-issuing the same operation id returns the prior receipt from a
  // durable store (idempotent), while a new operation id on the same artifact
  // produces an independent copy.
  // RED REASON (CURRENT): there is no durable receipt store; the same plan
  // cannot be looked up by operation id, it can only re-run or block.
  assert.ok(
    typeof applied.value.lookupReceipt === 'function'
      || typeof applied.value.receiptStore === 'object',
    'GENERIC01-G4: expected a durable idempotent receipt store handle; CURRENT: receipt is transient, no store to query',
  );
});

// ===========================================================================
// G5 — target path from instance identity (RED: path uses content hash suffix)
// ===========================================================================

test('GENERIC01-G5-target-path-from-instance-identity: scene path must derive from instance identity, not a content hash suffix', async () => {
  const projectRoot = makeProjectRoot();
  const romanRoot = makeRomanRoot(projectRoot);
  const plan = await previewPlanFromBytes(cleanDocxZip(['Path', 'Identity']));
  const contentTextHash = plan.candidateCreatePlan.entries[0].contentTextHash;

  const applied = await applyPlan(plan, projectRoot, romanRoot);
  assert.equal(applied.ok, true, JSON.stringify(applied, null, 2));
  const scene = readSingleCreatedScene(romanRoot);

  // TARGET: the scene filename is derived from import instance identity
  // (importOperationId or Core-allocated id), never from the content hash.
  // RED REASON (CURRENT): the filename embeds the 8-hex content hash suffix
  // (`${sanitize(title)} ${contentTextHash}.txt`).
  assert.equal(
    scene.name.includes(contentTextHash),
    false,
    `GENERIC01-G5: expected path derived from instance identity; CURRENT: scene path "${scene.name}" embeds content hash suffix ${contentTextHash}`,
  );
});

// ===========================================================================
// G6 — carrier explicitly ignored (RED: carrier silently ignored)
// ===========================================================================

test('GENERIC01-G6-carrier-ignored-explicit: YRTK2-bearing DOCX must classify carrierIgnored with a typed reason and no apply authority', async () => {
  const carrierBytes = yrtk2CarrierDocxZip(['Carrier scene one']);
  const bridge = await loadBridge();
  const content = bridge.buildDocxContentPreviewFromZipBytes(carrierBytes);

  // CONTROL: the carrier-bearing DOCX must still be importable as plain text
  // (the generic lane ignores the carrier for plain-text purposes).
  assert.equal(content.ok, true, 'CONTROL: carrier DOCX must still preview as plain text');
  assert.equal(content.code, 'DOCX_CONTENT_PREVIEW_READY');

  // TARGET: the content preview carries an explicit carrierIgnored
  // classification with a typed reason.
  // RED REASON (CURRENT): the carrier is silently ignored; content preview has
  // no carrierIgnored classification (the generic lane never parses
  // docProps/custom.xml).
  assert.equal(
    content.carrierIgnored && content.carrierIgnored.ignored === true
      && typeof content.carrierIgnored.reason === 'string',
    true,
    'GENERIC01-G6: expected content preview carrierIgnored classification with typed reason; CURRENT: YRTK2 carrier is silently ignored with no classification',
  );

  // TARGET: the preview plan also classifies the carrier explicitly.
  // RED REASON (CURRENT): the preview plan has no carrier classification.
  const plan = await previewPlanFromBytes(carrierBytes);
  assert.equal(plan.ok, true);
  assert.equal(
    plan.carrierIgnored && plan.carrierIgnored.ignored === true,
    true,
    'GENERIC01-G6: expected preview plan carrierIgnored classification; CURRENT: preview plan has no carrier classification',
  );

  // CONTROL: applying must never gain return/apply authority for the carrier —
  // no YRTK2 token echo, no review-return materialization, and the carrier
  // payload must not leak into the scene content.
  const projectRoot = makeProjectRoot();
  const romanRoot = makeRomanRoot(projectRoot);
  const applied = await applyPlan(plan, projectRoot, romanRoot);
  assert.equal(applied.ok, true, JSON.stringify(applied, null, 2));
  const scene = readSingleCreatedScene(romanRoot);
  assert.equal(scene.content.includes('Carrier scene one'), true);
  assert.equal(/YRT2-FAKE-CARRIER-PAYLOAD/i.test(scene.content), false, 'CONTROL: carrier token must not leak into scene content');
  const leakedCarrier = deepKeys(applied.value).some((key) => /yrtk|YRTK2_TOKEN|carrierPayload/i.test(key));
  assert.equal(leakedCarrier, false, 'CONTROL: carrier payload must not leak into the receipt');

  // TARGET: the receipt records an explicit carrier-ignored classification.
  // RED REASON (CURRENT): the receipt has no carrier classification field.
  assert.equal(
    applied.value.receipt.carrierIgnored && applied.value.receipt.carrierIgnored.ignored === true,
    true,
    'GENERIC01-G6: expected receipt carrierIgnored classification; CURRENT: receipt has no explicit carrier-ignored record',
  );
});

// ===========================================================================
// G7 — typed LossLedger persists in receipt (RED: items dropped to summary)
// ===========================================================================

test('GENERIC01-G7-loss-ledger-persists: receipt must persist the typed LossLedger items, not only a summary count', async () => {
  const projectRoot = makeProjectRoot();
  const romanRoot = makeRomanRoot(projectRoot);
  const plan = await previewPlanFromBytes(lossyDocxZip());
  assert.equal(plan.ok, true);
  // CONTROL: the preview plan itself carries typed loss items.
  assert.equal(Array.isArray(plan.lossReport.items), true);
  assert.ok(plan.lossReport.items.length > 0, 'CONTROL: preview plan lossReport must carry typed loss items');

  const applied = await applyPlan(plan, projectRoot, romanRoot);
  assert.equal(applied.ok, true, JSON.stringify(applied, null, 2));
  const receipt = applied.value.receipt;

  // TARGET: the receipt persists the typed lossReport (with items), preserving
  // the table/revision/comment/link categories across the apply boundary.
  // RED REASON (CURRENT): the receipt carries only lossReportSummary (a count);
  // the typed lossReport with its items is dropped.
  assert.ok(
    isPlainObject(receipt.lossReport) && Array.isArray(receipt.lossReport.items) && receipt.lossReport.items.length > 0,
    'GENERIC01-G7: expected receipt.lossReport with typed items; CURRENT: receipt drops typed loss items into lossReportSummary (count only)',
  );

  // TARGET: the typed categories observed in the preview survive into the
  // receipt (e.g. table/revision/comment/link loss categories).
  // RED REASON (CURRENT): the summary is only {schemaVersion, mode, itemCount};
  // no categories survive.
  const receiptCategories = (receipt.lossReport && Array.isArray(receipt.lossReport.items)
    ? receipt.lossReport.items
    : []).map((item) => item.category).filter(Boolean);
  const previewCategories = plan.lossReport.items.map((item) => item.category).filter(Boolean);
  assert.ok(
    previewCategories.every((category) => receiptCategories.includes(category)),
    `GENERIC01-G7: expected receipt to preserve loss categories ${previewCategories.join(',')}; CURRENT: receipt has no typed loss items`,
  );
});

// ===========================================================================
// G8 — CONTROLS (must remain GREEN)
// ===========================================================================

test('GENERIC01-G8-control-content-preview: clean DOCX content preview remains 8-hex deterministic (control, marked-for-amendment)', async () => {
  // CONTROL: the existing content-preview shape is green today. The 8-hex hash
  // form is marked-for-amendment by G1 (full SHA-256 artifact identity), but
  // this subtest pins the CURRENT green shape so the harness detects if Pass 2
  // regresses the preview without also updating this control.
  const bridge = await loadBridge();
  const first = bridge.buildDocxContentPreviewFromZipBytes(cleanDocxZip(['Alpha', 'Bravo']));
  const second = bridge.buildDocxContentPreviewFromZipBytes(cleanDocxZip(['Alpha', 'Bravo']));

  assert.equal(first.ok, true);
  assert.equal(first.code, 'DOCX_CONTENT_PREVIEW_READY');
  assert.equal(first.contentPreview.sourcePart, 'word/document.xml');
  assert.deepEqual(first, second);
  assert.match(first.contentPreview.textHash, /^[a-f0-9]{8}$/u);
  assert.match(first.previewHash || first.contentPreview.textHash, /^[a-f0-9]{8}$/u);
});

test('GENERIC01-G8-control-preview-plan-shell: clean content preview becomes a deterministic single-scene candidate (control)', async () => {
  const plan = await previewPlanFromBytes(cleanDocxZip(['Alpha', 'Bravo']));
  assert.equal(plan.ok, true);
  assert.equal(plan.status, 'preview');
  assert.equal(plan.decision, 'preview');
  assert.equal(plan.code, 'DOCX_IMPORT_PREVIEW_READY');
  assert.equal(plan.writeEffects, false);
  assert.equal(plan.candidateCreatePlan.mode, 'create-only');
  assert.equal(plan.candidateCreatePlan.sceneStrategy, 'single-scene');
  assert.equal(plan.candidateCreatePlan.entryCount, 1);
  assert.match(plan.candidateCreatePlan.entries[0].sceneId, /^docx-import-scene-[a-f0-9]{8}$/u);
  assert.equal(plan.candidateCreatePlan.entries[0].content, 'Alpha\n\nBravo');
});

test('GENERIC01-G8-control-safe-create-applies-once: clean admitted plan creates one local scene (control)', async () => {
  const projectRoot = makeProjectRoot();
  const romanRoot = makeRomanRoot(projectRoot);
  const plan = await previewPlanFromBytes(cleanDocxZip(['Alpha', 'Bravo']));
  const applied = await applyPlan(plan, projectRoot, romanRoot);

  assert.equal(applied.ok, true, JSON.stringify(applied, null, 2));
  assert.equal(applied.value.created, true);
  assert.equal(applied.value.safeCreate, true);
  const scene = readSingleCreatedScene(romanRoot);
  assert.equal(scene.content, 'Alpha\n\nBravo');
  assert.equal(applied.value.receipt.atomicEvidence.sceneCount, 1);
  assert.equal(applied.value.receipt.atomicEvidence.markerCleared, true);
  // CONTROL: no .flow-batch markers leak (atomic write cleanup is intact).
  const batchDir = path.join(projectRoot, '.flow-batch');
  assert.deepEqual(fs.readdirSync(batchDir), []);
});

test('GENERIC01-G8-control-duplicate-is-idempotent-now: duplicate apply returns the same idempotent receipt (control, amended by G2)', async () => {
  // CONTROL (amended by G2): the duplicate behaviour is now idempotent. This
  // control was originally "duplicate = error" (marked-for-amendment by G2);
  // G2 changed duplicate to return an idempotent receipt, so this control was
  // updated in the same delta per its own RED-first contract comment.
  const projectRoot = makeProjectRoot();
  const romanRoot = makeRomanRoot(projectRoot);
  const plan = await previewPlanFromBytes(cleanDocxZip(['Dup', 'Control']));

  const first = await applyPlan(plan, projectRoot, romanRoot);
  assert.equal(first.ok, true, JSON.stringify(first, null, 2));
  const originalText = readSingleCreatedScene(romanRoot).content;
  const firstOperationId = first.value.receipt.importOperationId;

  const duplicate = await applyPlan(plan, projectRoot, romanRoot);
  assert.equal(duplicate.ok, true, JSON.stringify(duplicate, null, 2));
  assert.equal(duplicate.value.created, false, 'duplicate must not create a new scene');
  assert.equal(
    duplicate.value.receipt.importOperationId,
    firstOperationId,
    'duplicate must reuse the same importOperationId',
  );
  assert.equal(readCreatedSceneFiles(romanRoot).length, 1, 'no new scene files created');
  assert.equal(readSingleCreatedScene(romanRoot).content, originalText);
});
