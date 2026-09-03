import crypto from 'node:crypto';
import { types } from 'node:util';
import { INTERCHANGE_IR_ENVELOPE_SCHEMA_VERSION, INTERCHANGE_IR_FAMILIES, createInterchangeIrEnvelope, validateInterchangeIrEnvelope } from './interchange-ir-v1.mjs';
import { DOCX_PROFILE_ID, DOCX_PROFILE_SCHEMA_VERSION, serializeDocxProfile } from './docx-profile-v1.mjs';
import { TEXT_FORMATS_SCHEMA_VERSION, parseTextFormat, serializeTextFormat } from './text-formats-v1.mjs';

export const INTERCHANGE_NEGOTIATION_VERSION = 'yalken.interchange.negotiation.v1';
export const DOWNGRADE_PREVIEW_POLICY = 'EXPLICIT_LOSSY_PREVIEW_V1';
export const NEGOTIATION_LIMITS = Object.freeze({ maxOffers: 16, maxNodes: 100000, maxDepth: 32, maxJsonBytes: 2097152, maxStringBytes: 262144, maxHops: 6 });
const TARGET = 'TXT_UTF8_NFC_V1';
const hash = b => crypto.createHash('sha256').update(b).digest('hex');
const canonical = v => Array.isArray(v) ? `[${v.map(canonical).join(',')}]` : v && typeof v === 'object' ? `{${Object.keys(v).sort().map(k => `${JSON.stringify(k)}:${canonical(v[k])}`).join(',')}}` : JSON.stringify(v);
const digest = v => hash(Buffer.from(canonical(v)));
const arrayPrototype = Object.getPrototypeOf(Uint8Array.prototype);
const byteGetters = Object.fromEntries(['buffer', 'byteOffset', 'byteLength'].map(k => [k, Object.getOwnPropertyDescriptor(arrayPrototype, k).get]));
const reject = code => { throw new Error(code); };
const freeze = v => { if (!v || typeof v !== 'object' || ArrayBuffer.isView(v) || Object.isFrozen(v)) return v; for (const x of Object.values(v)) freeze(x); return Object.freeze(v); };
const attempt = fn => { try { return fn(); } catch (e) { if (!/^E_NEG_[A-Z_]+$/.test(e?.message)) throw e; return freeze({ ok: false, status: 'REJECTED', error: { code: e.message }, outputPublished: false, productMutationAuthority: false, providerAuthority: false }); } };
function exact(v, keys) {
  if (!v || types.isProxy(v) || Object.getPrototypeOf(v) !== Object.prototype) reject('E_NEG_OBJECT');
  const actual = Reflect.ownKeys(v);
  if (actual.some(k => typeof k !== 'string') || canonical(actual.sort()) !== canonical([...keys].sort())) reject('E_NEG_FIELDS');
  for (const k of actual) { const d = Object.getOwnPropertyDescriptor(v, k); if (!d?.enumerable || !Object.hasOwn(d, 'value')) reject('E_NEG_ACCESSOR'); }
}
function list(v, max) {
  if (!v || types.isProxy(v) || !Array.isArray(v) || Object.getPrototypeOf(v) !== Array.prototype || v.length > max) reject('E_NEG_ARRAY');
  if (Reflect.ownKeys(v).length !== v.length + 1) reject('E_NEG_ARRAY_FIELDS');
  for (let n = 0; n < v.length; n++) { const d = Object.getOwnPropertyDescriptor(v, String(n)); if (!d?.enumerable || !Object.hasOwn(d, 'value')) reject('E_NEG_ACCESSOR'); }
  return v;
}
function clean(v, depth = 0, budget = { nodes: 0, bytes: 0 }) {
  if (++budget.nodes > NEGOTIATION_LIMITS.maxNodes || depth > NEGOTIATION_LIMITS.maxDepth) reject('E_NEG_JSON_BUDGET');
  if (v === null || typeof v === 'boolean') return v;
  if (typeof v === 'string') {
    if (v !== v.normalize('NFC') || /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(v)) reject('E_NEG_UNICODE');
    const length = Buffer.byteLength(v); budget.bytes += length;
    if (length > NEGOTIATION_LIMITS.maxStringBytes || budget.bytes > NEGOTIATION_LIMITS.maxJsonBytes) reject('E_NEG_JSON_BUDGET');
    return v;
  }
  if (typeof v === 'number' && Number.isFinite(v) && !Object.is(v, -0)) return v;
  if (!v || typeof v !== 'object' || types.isProxy(v)) reject('E_NEG_JSON_TYPE');
  if (Array.isArray(v)) return list(v, NEGOTIATION_LIMITS.maxNodes).map(x => clean(x, depth + 1, budget));
  const keys = Reflect.ownKeys(v); exact(v, keys); const result = {};
  for (const k of keys.sort()) { if (['__proto__', 'prototype', 'constructor'].includes(k)) reject('E_NEG_UNSAFE_KEY'); clean(k, depth + 1, budget); result[k] = clean(v[k], depth + 1, budget); }
  return result;
}
function identity(v) {
  const id = clean(v), proof = createInterchangeIrEnvelope({ familyId: 'EVIDENCE', identity: id, payload: {} });
  if (!proof.ok) reject('E_NEG_IDENTITY'); return proof.value.body.identity;
}
function checkedBytes(v, expectedLength) {
  if (!v || types.isProxy(v) || !Buffer.isBuffer(v) || Object.getPrototypeOf(v) !== Buffer.prototype) reject('E_NEG_PREVIEW_BYTES');
  for (const k of Reflect.ownKeys(v)) if (typeof k !== 'string' || !/^(?:0|[1-9][0-9]*)$/.test(k)) reject('E_NEG_PREVIEW_BYTES');
  const backing = byteGetters.buffer.call(v), offset = byteGetters.byteOffset.call(v), length = byteGetters.byteLength.call(v);
  if (types.isSharedArrayBuffer(backing) || Object.getOwnPropertyDescriptor(ArrayBuffer.prototype, 'resizable')?.get.call(backing) || length !== expectedLength) reject('E_NEG_PREVIEW_BYTES');
  return Buffer.from(new Uint8Array(backing, offset, length));
}
function envelope(v, expectedIdentity) {
  const proof = validateInterchangeIrEnvelope(clean(v));
  if (!proof.ok) reject('E_NEG_ENVELOPE');
  if (canonical(proof.value.body.identity) !== canonical(identity(expectedIdentity))) reject('E_NEG_STALE_IDENTITY');
  return proof;
}
function offers(v) {
  const rows = list(v, NEGOTIATION_LIMITS.maxOffers).map(row => {
    exact(row, ['envelopeSchemaVersion', 'familyId', 'familySchemaVersion']);
    if (!Object.hasOwn(INTERCHANGE_IR_FAMILIES, row.familyId)) reject('E_NEG_OFFER_FAMILY');
    for (const key of ['envelopeSchemaVersion', 'familySchemaVersion']) if (typeof row[key] !== 'string' || !/^yalken\.interchange\.[a-z-]+\.v[0-9]{1,6}$/.test(row[key])) reject('E_NEG_OFFER_VERSION');
    return row;
  });
  if (rows.length === 0 || new Set(rows.map(canonical)).size !== rows.length) reject('E_NEG_OFFER_DENOMINATOR');
  return rows.sort((a, b) => canonical(a) < canonical(b) ? -1 : canonical(a) > canonical(b) ? 1 : 0);
}

// A schema handshake is not payload validation, a capability, or an apply permit.
export function negotiateInterchangeSchema(input = {}) {
  return attempt(() => {
    exact(input, ['envelope', 'expectedIdentity', 'offers']);
    const checked = envelope(input.envelope, input.expectedIdentity), offered = offers(clean(input.offers));
    const selected = offered.find(row => row.familyId === checked.value.body.familyId && row.envelopeSchemaVersion === INTERCHANGE_IR_ENVELOPE_SCHEMA_VERSION && row.familySchemaVersion === checked.value.body.familySchemaVersion);
    if (!selected) return freeze({ ok: false, status: 'UNSUPPORTED_SCHEMA', error: { code: 'E_NEG_NO_COMPATIBLE_SCHEMA' }, evaluatedOfferDenominator: offered.length, outputPublished: false, productMutationAuthority: false, providerAuthority: false });
    const receipt = { schemaVersion: INTERCHANGE_NEGOTIATION_VERSION, status: 'EXACT_SCHEMA_MATCH', sourceEnvelopeSha256: checked.sha256, sourceBodySha256: checked.value.bodySha256, identity: checked.value.body.identity, selectedSchemas: selected, receiverOffersSha256: digest(offered), evaluatedOfferDenominator: offered.length, schemaOnly: true, payloadQualified: false, productMutationAuthority: false, providerAuthority: false };
    return freeze({ ok: true, receipt, receiptSha256: digest(receipt) });
  });
}

function sourceProof(input) {
  exact(input, ['envelope', 'expectedIdentity', 'policy', 'sourceBytes', 'targetProfileId', 'targetSchemaVersion']);
  if (input.policy !== DOWNGRADE_PREVIEW_POLICY) reject('E_NEG_LOSS_POLICY');
  if (input.targetProfileId !== TARGET || input.targetSchemaVersion !== TEXT_FORMATS_SCHEMA_VERSION) reject('E_NEG_DOWNGRADE_TARGET');
  const checked = envelope(input.envelope, input.expectedIdentity);
  if (checked.value.body.familyId !== 'DOCUMENT' || checked.value.body.payload.profileId !== DOCX_PROFILE_ID || checked.value.body.payload.formatSchemaVersion !== DOCX_PROFILE_SCHEMA_VERSION) reject('E_NEG_DOWNGRADE_SOURCE');
  const proof = serializeDocxProfile({ envelope: checked.value, expectedIdentity: identity(input.expectedIdentity), sourceBytes: input.sourceBytes });
  if (!proof.ok) reject('E_NEG_DOCX_SOURCE_REPLAY');
  return { checked, proof };
}

function projectFields(document, outputText) {
  const rows = [], parts = []; let cursor = 0;
  const add = (fieldPath, value, disposition, range = null) => rows.push({ fieldPath, sourceValueSha256: digest(value), disposition, targetRangeUtf16: range, targetValueSha256: range === null ? null : digest(outputText.slice(range.from, range.to)) });
  add('/paragraphs', document.paragraphs, 'PARAGRAPH_STRUCTURE_NORMALIZED');
  for (const [pi, p] of document.paragraphs.entries()) {
    const base = `/paragraphs/${pi}`, joined = p.runs.map(r => r.text).join('');
    const retained = joined.trim().length === 0 ? '' : joined.replace(/\n+$/u, '');
    const normalized = retained.normalize('NFC'), visible = retained.length > 0;
    if (visible && parts.length > 0) cursor += 2;
    const start = cursor; let offset = 0;
    add(base + '/alignment', p.alignment, 'FORMAT_FIELD_NOT_REPRESENTED');
    add(base + '/outlineLevel', p.outlineLevel, 'FORMAT_FIELD_NOT_REPRESENTED');
    add(base + '/runs', p.runs, 'RUN_BOUNDARIES_REMOVED');
    for (const [ri, r] of p.runs.entries()) {
      const at = base + `/runs/${ri}`, end = offset + r.text.length;
      if (!visible) add(at + '/text', r.text, 'WHITESPACE_OR_EMPTY_PARAGRAPH_DROPPED');
      else if (retained !== normalized) add(at + '/text', r.text, 'RUN_BOUNDARY_NFC_NORMALIZED');
      else {
        const from = start + Math.min(offset, retained.length), to = start + Math.min(end, retained.length);
        const exactText = outputText.slice(from, to) === r.text;
        add(at + '/text', r.text, exactText ? 'PRESERVED_TEXT' : 'TRAILING_LINEFEED_NORMALIZED', { from, to });
      }
      for (const mark of ['bold', 'italic', 'underline']) add(at + '/' + mark, r[mark], 'FORMAT_FIELD_NOT_REPRESENTED');
      offset = end;
    }
    if (visible) { parts.push(normalized); cursor += normalized.length; }
  }
  const predicted = parts.join('\n\n') + '\n';
  if (predicted !== outputText) reject('E_NEG_TEXT_PROJECTION_MISMATCH');
  const expected = 1 + document.paragraphs.reduce((n, p) => n + 3 + 4 * p.runs.length, 0);
  if (rows.length !== expected || new Set(rows.map(r => r.fieldPath)).size !== expected) reject('E_NEG_FIELD_DENOMINATOR');
  return rows;
}

// Returns disposable derived bytes and a preview receipt. It never writes files.
export function previewDocxTextDowngrade(input = {}) {
  return attempt(() => {
    const { checked, proof } = sourceProof(input), body = checked.value.body, payload = body.payload;
    const scene = { kind: 'scene.v1', blocks: payload.document.paragraphs.map(p => ({ type: 'paragraph', text: p.runs.map(r => r.text).join('').normalize('NFC') })) };
    const projection = createInterchangeIrEnvelope({ familyId: 'DOCUMENT', identity: body.identity, payload: { formatSchemaVersion: TEXT_FORMATS_SCHEMA_VERSION, profileId: TARGET, scene, lossLedger: { items: [] } } });
    if (!projection.ok) reject('E_NEG_TEXT_IR');
    const output = serializeTextFormat({ envelope: projection.value, expectedIdentity: body.identity, profileId: TARGET });
    if (!output.ok) reject('E_NEG_TEXT_SERIALIZE');
    const text = output.bytes.toString('utf8'), fieldRows = projectFields(payload.document, text);
    const reparsed = parseTextFormat({ bytes: output.bytes, identity: body.identity, profileId: TARGET });
    if (!reparsed.ok) reject('E_NEG_TEXT_READBACK');
    const inherited = payload.lossLedger.items.map(item => ({ kind: 'INHERITED_SOURCE_LOSS', sourceEnvelopeSha256: checked.sha256, item }));
    const losses = [...inherited, ...fieldRows.filter(row => row.disposition !== 'PRESERVED_TEXT').map(row => ({ kind: 'SOURCE_FIELD_LOSS', ...row }))];
    const receipt = { schemaVersion: 'yalken.interchange.docx-text-downgrade-preview.v1', policy: DOWNGRADE_PREVIEW_POLICY, status: 'LOSSY_PREVIEW_ONLY', identity: body.identity, sourceEnvelopeSha256: checked.sha256, sourceBodySha256: checked.value.bodySha256, sourceArtifactSha256: payload.source?.archiveSha256 ?? null, sourceRevalidatedArtifactSha256: proof.sha256, sourceProfileId: DOCX_PROFILE_ID, sourceSchemaVersion: DOCX_PROFILE_SCHEMA_VERSION, targetProfileId: TARGET, targetSchemaVersion: TEXT_FORMATS_SCHEMA_VERSION, targetSha256: hash(output.bytes), targetByteLength: output.bytes.length, targetReadbackIrSha256: reparsed.sha256, fieldDenominator: fieldRows.length, preservedTextFieldCount: fieldRows.filter(r => r.disposition === 'PRESERVED_TEXT').length, fieldRows, lossLedger: { inheritedItemDenominator: inherited.length, itemDenominator: losses.length, items: losses }, sourceUnchanged: true, reversibleFromRetainedSourceOnly: true, productMutationAuthority: false, providerAuthority: false, reviewApplyAuthority: false };
    return freeze({ ok: true, bytes: Buffer.from(output.bytes), receipt, receiptSha256: digest(receipt) });
  });
}

export function verifyDocxTextDowngrade(input = {}) {
  return attempt(() => {
    exact(input, ['bytes', 'receipt', 'request']);
    const replay = previewDocxTextDowngrade(input.request);
    if (!replay.ok) reject('E_NEG_PREVIEW_REPLAY');
    if (!replay.bytes.equals(checkedBytes(input.bytes, replay.bytes.length))) reject('E_NEG_PREVIEW_BYTES');
    if (canonical(clean(input.receipt)) !== canonical(replay.receipt)) reject('E_NEG_PREVIEW_RECEIPT');
    return freeze({ ok: true, status: 'EXACT_PREVIEW_REPLAY', receiptSha256: replay.receiptSha256, fieldDenominator: replay.receipt.fieldDenominator, lossDenominator: replay.receipt.lossLedger.itemDenominator, productMutationAuthority: false, providerAuthority: false });
  });
}

export function replayDocxTextDowngrade(input = {}) {
  return attempt(() => {
    exact(input, ['hopCount', 'request']);
    if (!Number.isSafeInteger(input.hopCount) || input.hopCount < 1 || input.hopCount > NEGOTIATION_LIMITS.maxHops) reject('E_NEG_HOP_BUDGET');
    const preview = previewDocxTextDowngrade(input.request); if (!preview.ok) reject('E_NEG_PREVIEW_REPLAY');
    let output = preview.bytes, losses = [...preview.receipt.lossLedger.items], previousHopSha256 = preview.receiptSha256;
    const hops = [];
    for (let index = 0; index < input.hopCount; index++) {
      const sourceSha256 = index === 0 ? preview.receipt.sourceEnvelopeSha256 : hash(output);
      if (index > 0) {
        const parsed = parseTextFormat({ bytes: output, identity: preview.receipt.identity, profileId: TARGET });
        if (!parsed.ok) reject('E_NEG_REPLAY_PARSE');
        const next = serializeTextFormat({ envelope: parsed.value, expectedIdentity: preview.receipt.identity, profileId: TARGET });
        if (!next.ok) reject('E_NEG_REPLAY_SERIALIZE');
        if (!next.bytes.equals(output)) losses = [...losses, { kind: 'TEXT_ROUNDTRIP_NORMALIZED', hopIndex: index, sourceSha256, targetSha256: hash(next.bytes) }];
        output = next.bytes;
      }
      const hop = { index, kind: index === 0 ? 'DOCX_TO_TXT_PREVIEW' : 'TXT_LOCAL_ROUNDTRIP', sourceSha256, targetSha256: hash(output), schemaVersion: index === 0 ? DOCX_PROFILE_SCHEMA_VERSION : TEXT_FORMATS_SCHEMA_VERSION, targetSchemaVersion: TEXT_FORMATS_SCHEMA_VERSION, previousHopSha256, cumulativeLossDenominator: losses.length, cumulativeLossSha256: digest(losses) };
      previousHopSha256 = digest(hop); hops.push({ ...hop, hopSha256: previousHopSha256 });
    }
    return freeze({ ok: true, bytes: Buffer.from(output), receipt: { schemaVersion: 'yalken.interchange.downgrade-replay.v1', identity: preview.receipt.identity, initialPreviewSha256: preview.receiptSha256, hopDenominator: hops.length, hops, cumulativeLossLedger: { itemDenominator: losses.length, items: losses }, finalSha256: hash(output), productMutationAuthority: false, providerAuthority: false, physicalProviderClaim: false } });
  });
}
