import crypto from 'node:crypto';
import { types } from 'node:util';
import { createInterchangeIrEnvelope, validateInterchangeIrEnvelope } from './interchange-ir-v1.mjs';
import { serializeDocxProfile } from './docx-profile-v1.mjs';
import { inspectParserQuarantine } from './parser-quarantine-v1.mjs';
import archiveCodec from '../export/archive/projectArchiveExportHandler.js';
import { buildRevisionPacketPreview } from '../io/revisionBridge/index.mjs';

export const PDF_ARCHIVE_REVIEW_PROFILE_VERSION = 'yalken.pdf-archive-review.profiles.v1';
export const PDF_RENDER_PROFILE = 'ELECTRON_41_10_3_OFFLINE_CLASSIC_PDF_V1';
export const PDF_ARCHIVE_REVIEW_LIMITS = Object.freeze({ maxJsonBytes: 1048576, maxOutputBytes: 8388608, maxEntries: 255, maxFileBytes: 196608, maxTotalFileBytes: 524288, maxReviewItems: 1024, maxPdfObjects: 20000 });
const L = PDF_ARCHIVE_REVIEW_LIMITS;
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const canonical = value => Array.isArray(value) ? `[${value.map(canonical).join(',')}]` : value && typeof value === 'object' ? `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${canonical(value[k])}`).join(',')}}` : JSON.stringify(value);
const jsonBytes = value => Buffer.from(canonical(value) + '\n');
const reject = code => { throw new Error(code); };
const denied = error => Object.freeze({ ok: false, status: 'REJECTED', error: { code: /^E_/.test(error?.message) ? error.message : 'E_PAR_INVALID' }, productMutationAuthority: false, providerAuthority: false, outputPublished: false });
const attempt = fn => { try { return fn(); } catch (error) { return denied(error); } };
function freeze(value) {
  if (!value || typeof value !== 'object' || ArrayBuffer.isView(value) || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) freeze(child);
  return Object.freeze(value);
}
function exact(value, keys) {
  if (!value || types.isProxy(value) || Object.getPrototypeOf(value) !== Object.prototype) reject('E_PAR_OBJECT');
  const actual = Reflect.ownKeys(value);
  if (actual.some(k => typeof k !== 'string') || canonical(actual.sort()) !== canonical([...keys].sort())) reject('E_PAR_FIELDS');
  for (const key of actual) { const d = Object.getOwnPropertyDescriptor(value, key); if (!d?.enumerable || !Object.hasOwn(d, 'value')) reject('E_PAR_ACCESSOR'); }
}
function list(value, max) {
  if (types.isProxy(value) || !Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype || value.length > max) reject('E_PAR_ARRAY');
  if (Reflect.ownKeys(value).length !== value.length + 1) reject('E_PAR_ARRAY_FIELDS');
  for (let n = 0; n < value.length; n++) { const d = Object.getOwnPropertyDescriptor(value, String(n)); if (!d?.enumerable || !Object.hasOwn(d, 'value')) reject('E_PAR_ACCESSOR'); }
  return value;
}
function clean(value, depth = 0, budget = { nodes: 0, bytes: 0 }) {
  if (++budget.nodes > 10000 || depth > 32) reject('E_PAR_JSON_BUDGET');
  if (value === null || typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    if (value !== value.normalize('NFC') || /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(value)) reject('E_PAR_UNICODE');
    budget.bytes += Buffer.byteLength(value); if (budget.bytes > L.maxJsonBytes || Buffer.byteLength(value) > 262144) reject('E_PAR_JSON_BUDGET'); return value;
  }
  if (typeof value === 'number' && Number.isFinite(value) && !Object.is(value, -0)) return value;
  if (!value || typeof value !== 'object' || types.isProxy(value)) reject('E_PAR_JSON_TYPE');
  if (Array.isArray(value)) return list(value, 4096).map(v => clean(v, depth + 1, budget));
  const keys = Reflect.ownKeys(value); exact(value, keys);
  const out = {};
  for (const k of keys.sort()) { if (['__proto__', 'constructor', 'prototype'].includes(k)) reject('E_PAR_UNSAFE_KEY'); clean(k, depth + 1, budget); out[k] = clean(value[k], depth + 1, budget); }
  return out;
}
function bytes(value, max = L.maxOutputBytes) {
  if (types.isProxy(value) || !Buffer.isBuffer(value) || Object.getPrototypeOf(value) !== Buffer.prototype || value.length === 0 || value.length > max) reject('E_PAR_BYTES');
  return Buffer.from(value);
}
function identity(value) {
  const id = clean(value), checked = createInterchangeIrEnvelope({ familyId: 'EVIDENCE', identity: id, payload: {} });
  if (!checked.ok) reject('E_PAR_IDENTITY'); return checked.value.body.identity;
}
function sameIdentity(a, b) { if (canonical(identity(a)) !== canonical(identity(b))) reject('E_PAR_STALE_IDENTITY'); }
function ir(familyId, id, payload) {
  const result = createInterchangeIrEnvelope({ familyId, identity: identity(id), payload });
  if (!result.ok) reject('E_PAR_IR_BOUNDARY');
  return freeze({ ...result, status: 'ADMITTED_DERIVED_ONLY', productMutationAuthority: false, providerAuthority: false });
}
function checkedIr(value, expectedIdentity, family) {
  const checked = validateInterchangeIrEnvelope(clean(value));
  if (!checked.ok || checked.value.body.familyId !== family) reject('E_PAR_IR_PROFILE');
  sameIdentity(checked.value.body.identity, expectedIdentity); return checked.value.body.payload;
}
const escapeHtml = s => s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');

export function buildPdfProfileProjection(input = {}) {
  return attempt(() => {
    exact(input, ['envelope', 'expectedIdentity', 'sourceBytes']);
    const proof = serializeDocxProfile(input);
    if (!proof.ok) reject('E_PAR_DOCUMENT_PROFILE');
    const body = clean(input.envelope).body, document = body.payload.document;
    const blocks = document.paragraphs.map(p => {
      const tag = p.outlineLevel === null ? 'p' : `h${Math.min(p.outlineLevel + 1, 6)}`;
      const runs = p.runs.map(r => `<span style="font-weight:${r.bold ? 700 : 400};font-style:${r.italic ? 'italic' : 'normal'};text-decoration:${r.underline ? 'underline' : 'none'}">${escapeHtml(r.text)}</span>`).join('');
      return `<${tag} style="text-align:${p.alignment === 'both' ? 'justify' : p.alignment}">${runs || '<br>'}</${tag}>`;
    }).join('\n');
    const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'"><title>Yalken deterministic export</title><style>@page{size:210mm 297mm;margin:20mm}html,body{margin:0;padding:0;background:white;color:#171717;font-family:serif;font-size:11pt;line-height:1.5}p{margin:0 0 8pt;white-space:pre-wrap;overflow-wrap:anywhere;orphans:2;widows:2}h1,h2,h3,h4,h5,h6{white-space:pre-wrap;overflow-wrap:anywhere;break-after:avoid;margin:12pt 0 8pt;font-size:14pt;line-height:1.3}h1{font-size:20pt}h2{font-size:17pt}span{white-space:pre-wrap}*{box-sizing:border-box}</style></head><body>${blocks}</body></html>`;
    return freeze({ ok: true, profileId: PDF_RENDER_PROFILE, identity: identity(input.expectedIdentity), html, htmlSha256: hash(Buffer.from(html)), semanticSha256: proof.semanticSha256, paragraphDenominator: document.paragraphs.length, fieldDenominator: proof.fieldDenominator, pageGeometryMm: { width: 210, height: 297, margin: 20 }, lossLedger: { itemDenominator: 2, items: [{ code: 'FIXED_PDF_PRINT_PROFILE', disposition: 'TRANSFORMED_LOSSY', detail: 'A4 fixed print form; source layout and editable document structure not retained.' }, { code: 'PDF_TEXT_EXTRACTION_NOT_EXACT', disposition: 'TRANSFORMED_LOSSY', detail: 'Platform font CMaps can map CJK glyphs to compatibility radicals; bidi extraction can differ in order. Exact Unicode copy-paste and editable roundtrip are not claimed. Source IR and HTML remain exact.' }] }, productMutationAuthority: false, providerAuthority: false });
  });
}

// This is a narrow Chromium-output normalizer, not a general PDF parser.
// Only fixed-length dates in the xref-addressed Info dictionary are changed.
export function canonicalizePdfProfileBytes(input = {}) {
  return attempt(() => {
    exact(input, ['bytes', 'profileId']); if (input.profileId !== PDF_RENDER_PROFILE) reject('E_PAR_PDF_RENDER_PROFILE');
    const output = bytes(input.bytes), text = output.toString('latin1');
    if (!/^%PDF-1\.[4-7]\r?\n/.test(text)) reject('E_PAR_PDF_HEADER');
    const end = /startxref\s+(\d+)\s+%%EOF\s*$/.exec(text); if (!end) reject('E_PAR_PDF_EOF');
    const xref = Number(end[1]); if (!Number.isSafeInteger(xref) || xref >= end.index || xref < 10) reject('E_PAR_PDF_XREF');
    const table = /^xref\r?\n0 (\d+)\r?\n/.exec(text.slice(xref)); if (!table) reject('E_PAR_PDF_CLASSIC_XREF');
    const count = Number(table[1]); if (count < 2 || count > L.maxPdfObjects) reject('E_PAR_PDF_OBJECT_BUDGET');
    let cursor = xref + table[0].length; const offsets = [0];
    for (let n = 0; n < count; n++) {
      const row = /^(\d{10}) (\d{5}) ([nf])(?: \r?\n|\r\n)/.exec(text.slice(cursor)); if (!row) reject('E_PAR_PDF_XREF_ROW'); cursor += row[0].length;
      if (n === 0) { if (row[1] !== '0000000000' || row[2] !== '65535' || row[3] !== 'f') reject('E_PAR_PDF_XREF_FREE'); continue; }
      const offset = Number(row[1]);
      if (row[2] !== '00000' || row[3] !== 'n' || offset < 10 || offset >= xref || !text.startsWith(`${n} 0 obj`, offset)) reject('E_PAR_PDF_OBJECT_OFFSET'); offsets.push(offset);
    }
    if (new Set(offsets).size !== count) reject('E_PAR_PDF_OBJECT_ALIAS');
    const trailer = text.slice(cursor, end.index);
    const fields = /^trailer\s*<<\s*\/Size (\d+)\s*\/Root (\d+) 0 R\s*\/Info (\d+) 0 R\s*>>\s*$/.exec(trailer);
    if (!fields || Number(fields[1]) !== count || !offsets[Number(fields[2])] || !offsets[Number(fields[3])]) reject('E_PAR_PDF_TRAILER');
    const n = Number(fields[3]), start = offsets[n], next = Math.min(xref, ...offsets.filter(o => o > start));
    const object = text.slice(start, next), head = new RegExp(`^${n} 0 obj\\s*<<`).exec(object), tail = />>\s*endobj\s*$/.exec(object);
    if (!head || !tail) reject('E_PAR_PDF_INFO_OBJECT');
    const content = object.slice(head[0].length, tail.index), token = /\/(Title|Creator|Producer|CreationDate|ModDate)\s+\(((?:\\.|[^\\()])*)\)/gy;
    let at = 0; const seen = new Set(), edits = [];
    while (at < content.length) {
      const gap = /^\s*/.exec(content.slice(at))[0]; at += gap.length; if (at === content.length) break;
      token.lastIndex = at; const m = token.exec(content); if (!m || seen.has(m[1])) reject('E_PAR_PDF_INFO_FIELD'); seen.add(m[1]);
      if (m[1].endsWith('Date')) {
        if (!/^D:\d{14}\+00'00'$/.test(m[2])) reject('E_PAR_PDF_DATE');
        const valueStart = start + head[0].length + m.index + m[0].indexOf('(') + 1;
        edits.push({ offset: valueStart, length: m[2].length });
      }
      at = token.lastIndex;
    }
    if (!seen.has('Creator') || !seen.has('Producer') || !seen.has('CreationDate') || !seen.has('ModDate') || edits.length !== 2) reject('E_PAR_PDF_INFO_DENOMINATOR');
    for (const edit of edits) { const stable = "D:20000101000000+00'00'"; if (stable.length !== edit.length) reject('E_PAR_PDF_DATE_WIDTH'); output.write(stable, edit.offset, edit.length, 'latin1'); }
    return freeze({ ok: true, status: 'CANONICAL_CHROMIUM_BYTES', bytes: output, sha256: hash(output), byteLength: output.length, objectDenominator: count - 1, transformedDateDenominator: edits.length, profileId: PDF_RENDER_PROFILE, genericPdfValidationClaim: false, productMutationAuthority: false });
  });
}
export async function renderPdfProfile(input = {}, port) {
  try {
    exact(input, ['envelope', 'expectedIdentity', 'sourceBytes']); exact(port, ['profileId', 'readIdentity', 'render']);
    if (port.profileId !== PDF_RENDER_PROFILE || typeof port.render !== 'function' || typeof port.readIdentity !== 'function') reject('E_PAR_PDF_PORT');
    const projection = buildPdfProfileProjection(input); if (!projection.ok) return projection;
    sameIdentity(await port.readIdentity(), projection.identity);
    const rendered = await port.render(projection.html);
    sameIdentity(await port.readIdentity(), projection.identity);
    const output = canonicalizePdfProfileBytes({ bytes: rendered, profileId: port.profileId }); if (!output.ok) return output;
    return freeze({ ...output, identity: projection.identity, htmlSha256: projection.htmlSha256, semanticSha256: projection.semanticSha256, fieldDenominator: projection.fieldDenominator, lossLedger: projection.lossLedger, sourceUnchanged: true, providerAuthority: false });
  } catch (error) { return denied(error); }
}

function stableZip(entries) {
  const output = archiveCodec.buildZipArchive([...entries].sort((a, b) => a.archivePath < b.archivePath ? -1 : a.archivePath > b.archivePath ? 1 : 0));
  let offset = 0;
  while (output.readUInt32LE(offset) === 0x04034b50) { output.writeUInt16LE(0, offset + 10); output.writeUInt16LE(33, offset + 12); offset += 30 + output.readUInt16LE(offset + 26) + output.readUInt16LE(offset + 28) + output.readUInt32LE(offset + 18); }
  while (output.readUInt32LE(offset) === 0x02014b50) { output.writeUInt16LE(0, offset + 12); output.writeUInt16LE(33, offset + 14); offset += 46 + output.readUInt16LE(offset + 28) + output.readUInt16LE(offset + 30) + output.readUInt16LE(offset + 32); }
  if (output.readUInt32LE(offset) !== 0x06054b50) reject('E_PAR_ZIP_BUILDER'); return output;
}
function entryModel(input) {
  let total = 0;
  const entries = list(input, L.maxEntries).map(entry => {
    exact(entry, ['bytes', 'relativePath']); const relativePath = clean(entry.relativePath);
    if (typeof relativePath !== 'string' || relativePath.length === 0 || relativePath !== archiveCodec.normalizeArchivePath(relativePath) || relativePath.includes('\\') || relativePath.startsWith('/') || /^[A-Za-z]:/.test(relativePath)) reject('E_PAR_ARCHIVE_PATH');
    if (types.isProxy(entry.bytes) || !Buffer.isBuffer(entry.bytes) || Object.getPrototypeOf(entry.bytes) !== Buffer.prototype || entry.bytes.length > L.maxFileBytes) reject('E_PAR_ARCHIVE_FILE_BUDGET');
    const buffer = Buffer.from(entry.bytes); total += buffer.length; if (total > L.maxTotalFileBytes) reject('E_PAR_ARCHIVE_TOTAL_BUDGET');
    return { relativePath, byteLength: buffer.length, sha256: hash(buffer), dataBase64: buffer.toString('base64') };
  }).sort((a, b) => a.relativePath < b.relativePath ? -1 : a.relativePath > b.relativePath ? 1 : 0);
  if (entries.length === 0 || new Set(entries.map(e => e.relativePath)).size !== entries.length) reject('E_PAR_ARCHIVE_DENOMINATOR');
  for (const parent of entries) if (entries.some(child => child.relativePath.startsWith(parent.relativePath + '/'))) reject('E_PAR_ARCHIVE_FILE_DIRECTORY_COLLISION');
  return entries;
}
function archiveManifest(entries, id) {
  const entry = entries.find(e => e.relativePath === 'project.craftsman.json'); if (!entry) reject('E_PAR_PROJECT_MANIFEST');
  let project; try { project = clean(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.from(entry.dataBase64, 'base64')))); } catch { reject('E_PAR_PROJECT_MANIFEST'); }
  if (project.projectId !== id.projectId || typeof project.projectName !== 'string') reject('E_PAR_PROJECT_IDENTITY');
  return { schemaVersion: archiveCodec.ARCHIVE_SCHEMA_VERSION, archiveKind: 'full-project', createdAtUtc: '2000-01-01T00:00:00.000Z', project: { projectId: project.projectId, projectName: project.projectName, manifestSha256: entry.sha256 }, source: { localOnly: true, networkRequired: false, pathlessReceipt: true, sourceProjectMutated: false }, entries: entries.map(e => ({ archivePath: 'project/' + e.relativePath, relativePath: e.relativePath, size: e.byteLength, sha256: e.sha256 })) };
}
function archiveBytes(entries, id) {
  const manifest = archiveManifest(entries, id), output = stableZip([{ archivePath: archiveCodec.ARCHIVE_MANIFEST_PATH, buffer: jsonBytes(manifest) }, ...entries.map(e => ({ archivePath: 'project/' + e.relativePath, buffer: Buffer.from(e.dataBase64, 'base64') }))]);
  const quarantine = inspectParserQuarantine({ bytes: output, format: 'ZIP', budgets: {} }); if (!quarantine.ok) reject('E_PAR_ARCHIVE_QUARANTINE');
  if (quarantine.value.parts.length !== entries.length + 1) reject('E_PAR_ARCHIVE_DENOMINATOR'); return { output, manifest };
}
export function createProjectArchiveProfile(input = {}) {
  return attempt(() => {
    exact(input, ['entries', 'identity']); const id = identity(input.identity), entries = entryModel(input.entries);
    archiveBytes(entries, id);
    return ir('PROJECT', id, { profileId: 'PROJECT_ARCHIVE_CLOSED_V1', entries, entryDenominator: entries.length, totalFileBytes: entries.reduce((n, e) => n + e.byteLength, 0), lossLedger: { itemDenominator: 0, items: [] } });
  });
}
export function serializeProjectArchiveProfile(input = {}) {
  return attempt(() => {
    exact(input, ['envelope', 'expectedIdentity']); const payload = checkedIr(input.envelope, input.expectedIdentity, 'PROJECT');
    exact(payload, ['entries', 'entryDenominator', 'lossLedger', 'profileId', 'totalFileBytes']);
    if (payload.profileId !== 'PROJECT_ARCHIVE_CLOSED_V1') reject('E_PAR_ARCHIVE_PROFILE');
    const entries = list(payload.entries, L.maxEntries).map(e => { exact(e, ['byteLength', 'dataBase64', 'relativePath', 'sha256']); if (typeof e.dataBase64 !== 'string') reject('E_PAR_BASE64'); const b = Buffer.from(e.dataBase64, 'base64'); if (b.toString('base64') !== e.dataBase64 || b.length !== e.byteLength || hash(b) !== e.sha256) reject('E_PAR_ARCHIVE_ENTRY_BINDING'); return { relativePath: e.relativePath, bytes: b }; });
    const rebuilt = createProjectArchiveProfile({ entries, identity: input.expectedIdentity });
    if (!rebuilt.ok || canonical(rebuilt.value.body.payload) !== canonical(payload)) reject('E_PAR_ARCHIVE_REPLAY');
    const { output, manifest } = archiveBytes(payload.entries, identity(input.expectedIdentity));
    return freeze({ ok: true, bytes: output, sha256: hash(output), byteLength: output.length, entryDenominator: entries.length, manifest, sourceUnchanged: true, productMutationAuthority: false, providerAuthority: false });
  });
}
export function parseProjectArchiveProfile(input = {}) {
  return attempt(() => {
    exact(input, ['bytes', 'identity']); const source = bytes(input.bytes), id = identity(input.identity);
    const quarantine = inspectParserQuarantine({ bytes: source, format: 'ZIP', budgets: {} }); if (!quarantine.ok) reject('E_PAR_ARCHIVE_QUARANTINE');
    const decoded = archiveCodec.readProjectArchivePayload(source);
    if (decoded.entryCount === 0 || decoded.entryCount + 1 !== quarantine.value.parts.length) reject('E_PAR_ARCHIVE_DENOMINATOR');
    const result = createProjectArchiveProfile({ entries: decoded.entries.map(e => ({ relativePath: e.relativePath, bytes: e.buffer })), identity: id }); if (!result.ok) return result;
    const expected = archiveManifest(result.value.body.payload.entries, id);
    if (canonical(clean(decoded.manifest)) !== canonical(expected)) reject('E_PAR_ARCHIVE_MANIFEST_BINDING');
    return result;
  });
}

const COLLECTIONS = ['commentThreads', 'commentPlacements', 'textChanges', 'structuralChanges', 'diagnosticItems', 'decisionStates'];
const AUTHORITY_KEYS = /^(?:apply|canApply|canWrite|canImport|exactAuthority|authority|signature|secret|token|password|credential|receipt|recovery|writeEffect|publicationEffect|filePath|projectRoot|scenePath|sourcePath|rawBytes|docxBytes|rendererPacket|rendererSession|plan|commandId)/iu;
function noAuthority(value) {
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) { if (AUTHORITY_KEYS.test(key)) reject('E_PAR_REVIEW_AUTHORITY'); noAuthority(child); }
}
function nativePacket(value, id, baseline) {
  const packet = clean(value); exact(packet, ['packetVersion', 'projectId', 'sessionId', 'baselineHash', 'reviewPacket', 'createdAt', 'updatedAt']);
  if (packet.packetVersion !== 'review-packet.v1' || packet.projectId !== id.projectId || packet.sessionId !== id.entityId || packet.baselineHash !== baseline || typeof baseline !== 'string' || !/^sha256:[0-9a-f]{64}$/.test(baseline)) reject('E_PAR_REVIEW_IDENTITY');
  exact(packet.reviewPacket, COLLECTIONS); noAuthority(packet);
  let count = 0; for (const name of COLLECTIONS) count += list(packet.reviewPacket[name], L.maxReviewItems).length;
  if (count > L.maxReviewItems || packet.reviewPacket.decisionStates.length !== 0) reject('E_PAR_REVIEW_DECISIONS');
  if (packet.reviewPacket.commentThreads.some(thread => thread.status !== 'open')) reject('E_PAR_REVIEW_DECISIONS');
  for (const [name, key] of [['commentThreads', 'threadId'], ['commentPlacements', 'placementId'], ['textChanges', 'changeId'], ['structuralChanges', 'structuralChangeId'], ['diagnosticItems', 'diagnosticId']]) {
    const ids = packet.reviewPacket[name].map(item => item[key]); if (new Set(ids).size !== ids.length) reject('E_PAR_REVIEW_DUPLICATE_ID');
  }
  const { packetVersion, ...native } = packet, preview = buildRevisionPacketPreview(native);
  if (!preview.ok) reject('E_PAR_REVIEW_NATIVE_VALIDATION');
  if (canonical(preview.session.reviewGraph) !== canonical(packet.reviewPacket)) reject('E_PAR_REVIEW_SILENT_NORMALIZATION');
  if (preview.session.createdAt !== packet.createdAt || preview.session.updatedAt !== packet.updatedAt) reject('E_PAR_REVIEW_TIME_NORMALIZATION');
  return { packet, count };
}
export function createReviewPacketProfile(input = {}) {
  return attempt(() => {
    exact(input, ['packet', 'identity', 'expectedBaselineHash']); const id = identity(input.identity), { packet, count } = nativePacket(input.packet, id, input.expectedBaselineHash);
    return ir('REVIEW', id, { profileId: 'REVIEW_PACKET_PROPOSAL_V1', packet, itemDenominator: count, disposition: 'UNTRUSTED_PROPOSAL_ONLY', lossLedger: { itemDenominator: 0, items: [] } });
  });
}
export function serializeReviewPacketProfile(input = {}) {
  return attempt(() => {
    exact(input, ['envelope', 'expectedIdentity', 'expectedBaselineHash']); const payload = checkedIr(input.envelope, input.expectedIdentity, 'REVIEW');
    exact(payload, ['disposition', 'itemDenominator', 'lossLedger', 'packet', 'profileId']);
    const rebuilt = createReviewPacketProfile({ packet: payload.packet, identity: input.expectedIdentity, expectedBaselineHash: input.expectedBaselineHash });
    if (!rebuilt.ok || canonical(rebuilt.value.body.payload) !== canonical(payload)) reject('E_PAR_REVIEW_REPLAY');
    const output = jsonBytes(payload.packet); if (output.length > L.maxJsonBytes) reject('E_PAR_JSON_BUDGET');
    return freeze({ ok: true, bytes: output, sha256: hash(output), byteLength: output.length, itemDenominator: payload.itemDenominator, disposition: 'UNTRUSTED_PROPOSAL_ONLY', productMutationAuthority: false, providerAuthority: false, canAutoApply: false });
  });
}
export function parseReviewPacketProfile(input = {}) {
  return attempt(() => {
    exact(input, ['bytes', 'identity', 'expectedBaselineHash']); const source = bytes(input.bytes, L.maxJsonBytes);
    let packet; try { packet = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(source)); } catch { reject('E_PAR_REVIEW_JSON'); }
    if (!jsonBytes(clean(packet)).equals(source)) reject('E_PAR_REVIEW_NONCANONICAL_BYTES');
    return createReviewPacketProfile({ packet, identity: input.identity, expectedBaselineHash: input.expectedBaselineHash });
  });
}
