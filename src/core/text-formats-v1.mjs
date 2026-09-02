import crypto from 'node:crypto';

import {
  INTERCHANGE_CAPABILITY_OPERATIONS,
  INTERCHANGE_FIDELITY_DIMENSIONS,
  composeInterchangeCapabilities,
  composeInterchangeFidelity,
  createInterchangeIrEnvelope,
  validateInterchangeIrEnvelope,
} from './interchange-ir-v1.mjs';
import {
  parseMarkdownV1,
  serializeMarkdownV1WithLossReport,
  serializePlainTextV1WithLossReport,
} from '../export/markdown/v1/index.mjs';

export const TEXT_FORMATS_SCHEMA_VERSION = 'yalken.text-formats.v1';
export const TEXT_FORMAT_PROFILE_IDS = Object.freeze(['MARKDOWN_BOUNDED_V1', 'TXT_UTF8_NFC_V1']);
export const TEXT_FORMAT_LIMITS = Object.freeze({ maxInputBytes: 1_048_576 });

const INPUT_KEYS = Object.freeze(['bytes', 'identity', 'profileId']);
const SERIALIZE_KEYS = Object.freeze(['envelope', 'expectedIdentity', 'profileId']);
const IDENTITY_KEYS = Object.freeze(['entityId', 'generation', 'projectId', 'sourceRevision']);
const ARCHIVE_SIGNATURES = Object.freeze([
  Buffer.from([0x50, 0x4b, 0x03, 0x04]),
  Buffer.from([0x50, 0x4b, 0x05, 0x06]),
  Buffer.from([0x50, 0x4b, 0x07, 0x08]),
  Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]),
  Buffer.from([0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c]),
  Buffer.from([0x1f, 0x8b]),
  Buffer.from('%PDF-', 'ascii'),
  Buffer.from('Rar!\x1a\x07', 'binary'),
]);

const CAPABILITY_VALUES = Object.freeze({
  MARKDOWN_BOUNDED_V1: Object.freeze({
    EXPORT_LOCAL: 'LOSSY_WRITE', IMPORT_CREATE: 'READ_ONLY', PARSE: 'FULL',
    PHYSICAL_ARTIFACT: 'FULL', PROVIDER_SYNC: 'DENIED', REVIEW_APPLY: 'DENIED',
    ROUND_TRIP: 'LOSSY_WRITE', SERIALIZE: 'FULL',
  }),
  TXT_UTF8_NFC_V1: Object.freeze({
    EXPORT_LOCAL: 'LOSSY_WRITE', IMPORT_CREATE: 'READ_ONLY', PARSE: 'FULL',
    PHYSICAL_ARTIFACT: 'FULL', PROVIDER_SYNC: 'DENIED', REVIEW_APPLY: 'DENIED',
    ROUND_TRIP: 'LOSSY_WRITE', SERIALIZE: 'FULL',
  }),
});

const FIDELITY_VALUES = Object.freeze({
  MARKDOWN_BOUNDED_V1: Object.freeze({
    COMMENTS: 'NONE', CONTENT: 'BOUNDED', EMBEDDED_ASSETS: 'NONE', LAYOUT: 'LOSSY',
    REVISIONS: 'NONE', STRUCTURE: 'BOUNDED', STYLES: 'LOSSY', UNKNOWN_FIELDS: 'NONE',
  }),
  TXT_UTF8_NFC_V1: Object.freeze({
    COMMENTS: 'NONE', CONTENT: 'BOUNDED', EMBEDDED_ASSETS: 'NONE', LAYOUT: 'NONE',
    REVISIONS: 'NONE', STRUCTURE: 'LOSSY', STYLES: 'NONE', UNKNOWN_FIELDS: 'NONE',
  }),
});

function failure(code, detail = '') {
  return Object.freeze({ ok: false, error: Object.freeze({ code, detail }) });
}

function sha256(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

function exactDataObject(value, expectedKeys) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) return false;
  const keys = Reflect.ownKeys(value);
  if (keys.some((key) => typeof key !== 'string') || JSON.stringify([...keys].sort()) !== JSON.stringify([...expectedKeys].sort())) return false;
  return keys.every((key) => {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return descriptor && Object.hasOwn(descriptor, 'value') && descriptor.enumerable === true;
  });
}

function cloneIdentity(value) {
  if (!exactDataObject(value, IDENTITY_KEYS)) return null;
  return {
    entityId: value.entityId,
    generation: value.generation,
    projectId: value.projectId,
    sourceRevision: value.sourceRevision,
  };
}

function sameIdentity(left, right) {
  return IDENTITY_KEYS.every((key) => left[key] === right[key]);
}

function hasKnownContainerSignature(bytes) {
  return ARCHIVE_SIGNATURES.some((signature) => bytes.length >= signature.length && bytes.subarray(0, signature.length).equals(signature));
}

function decodeBoundary(bytes) {
  if (!(Buffer.isBuffer(bytes) || bytes instanceof Uint8Array)) return failure('E_TF_INPUT_BYTES');
  const physical = Buffer.from(bytes);
  if (physical.length > TEXT_FORMAT_LIMITS.maxInputBytes) return failure('E_TF_INPUT_BYTE_BUDGET');
  if (hasKnownContainerSignature(physical)) return failure('E_TF_CONTAINER_OR_BINARY');
  const decoded = physical.toString('utf8');
  if (!Buffer.from(decoded, 'utf8').equals(physical)) return failure('E_TF_UTF8_INVALID');
  let text = decoded;
  const losses = [];
  if (text.startsWith('\ufeff')) {
    text = text.slice(1);
    losses.push({ action: 'REMOVE', code: 'UTF8_BOM_REMOVED', path: '$', severity: 'INFO' });
  }
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(text)) return failure('E_TF_CONTROL_CHARACTER');
  if (text !== text.normalize('NFC')) return failure('E_TF_NOT_NFC');
  if (/\r/u.test(text)) {
    text = text.replaceAll('\r\n', '\n').replaceAll('\r', '\n');
    losses.push({ action: 'NORMALIZE', code: 'NEWLINE_TO_LF', path: '$', severity: 'INFO' });
  }
  if (!text.endsWith('\n') && text.length > 0) {
    text += '\n';
    losses.push({ action: 'NORMALIZE', code: 'TERMINAL_LF_ADDED', path: '$', severity: 'INFO' });
  }
  return { ok: true, text, losses, physicalByteLength: physical.length };
}

function sanitizeMarkdownLosses(report) {
  if (!report || !Array.isArray(report.items)) return [];
  return report.items.map((item, index) => Object.freeze({
    action: String(item.action || 'DOWNGRADE'),
    code: String(item.reasonCode || item.code || item.kind || 'MARKDOWN_DOWNGRADE'),
    path: String(item.path || `item:${index + 1}`),
    severity: String(item.severity || 'WARN'),
  }));
}

function makeLedger(items, evaluatedBoundaryCount) {
  const normalized = [...items].map((item) => ({
    action: item.action,
    code: item.code,
    path: item.path,
    severity: item.severity,
  })).sort((left, right) => `${left.path}:${left.code}:${left.action}`.localeCompare(`${right.path}:${right.code}:${right.action}`, 'en'));
  return Object.freeze({
    evaluatedBoundaryCount,
    itemCount: normalized.length,
    items: Object.freeze(normalized.map(Object.freeze)),
  });
}

function plainTextScene(text) {
  if (text.length === 0) return { kind: 'scene.v1', blocks: [] };
  const withoutTerminal = text.endsWith('\n') ? text.slice(0, -1) : text;
  const parts = withoutTerminal.split(/\n{2,}/u);
  return {
    kind: 'scene.v1',
    blocks: parts.filter((part) => part.length > 0).map((part) => ({ type: 'paragraph', text: part })),
  };
}

function profileScene(profileId, text) {
  if (profileId === 'TXT_UTF8_NFC_V1') return { ok: true, scene: plainTextScene(text), losses: [] };
  try {
    const parsed = parseMarkdownV1(text, { limits: { maxInputBytes: TEXT_FORMAT_LIMITS.maxInputBytes } });
    return { ok: true, scene: { kind: parsed.kind, blocks: parsed.blocks }, losses: sanitizeMarkdownLosses(parsed.lossReport) };
  } catch (error) {
    const sourceCode = typeof error?.code === 'string' ? error.code : 'E_MD_UNKNOWN';
    return failure('E_TF_MARKDOWN_REJECTED', sourceCode);
  }
}

function validateProfile(profileId) {
  return TEXT_FORMAT_PROFILE_IDS.includes(profileId);
}

export function parseTextFormat(input = {}) {
  if (!exactDataObject(input, INPUT_KEYS)) return failure('E_TF_INPUT_SHAPE');
  if (!validateProfile(input.profileId)) return failure('E_TF_PROFILE');
  const identity = cloneIdentity(input.identity);
  if (!identity) return failure('E_TF_IDENTITY_SHAPE');
  const boundary = decodeBoundary(input.bytes);
  if (!boundary.ok) return boundary;
  const projected = profileScene(input.profileId, boundary.text);
  if (!projected.ok) return projected;
  const ledger = makeLedger([...boundary.losses, ...projected.losses], 6);
  const envelope = createInterchangeIrEnvelope({
    familyId: 'DOCUMENT',
    identity,
    payload: {
      formatSchemaVersion: TEXT_FORMATS_SCHEMA_VERSION,
      lossLedger: ledger,
      profileId: input.profileId,
      scene: projected.scene,
      source: { canonicalByteLength: Buffer.byteLength(boundary.text, 'utf8'), physicalByteLength: boundary.physicalByteLength },
    },
  });
  if (!envelope.ok) return failure('E_TF_INTERCHANGE_PROJECTION', envelope.error.code);
  return Object.freeze({
    ok: true,
    byteLength: envelope.byteLength,
    bytes: envelope.bytes,
    lossLedger: ledger,
    profileId: input.profileId,
    sha256: envelope.sha256,
    value: envelope.value,
  });
}

export function serializeTextFormat(input = {}) {
  if (!exactDataObject(input, SERIALIZE_KEYS)) return failure('E_TF_SERIALIZE_SHAPE');
  if (!validateProfile(input.profileId)) return failure('E_TF_PROFILE');
  const expectedIdentity = cloneIdentity(input.expectedIdentity);
  if (!expectedIdentity) return failure('E_TF_IDENTITY_SHAPE');
  const verified = validateInterchangeIrEnvelope(input.envelope);
  if (!verified.ok) return failure('E_TF_INTERCHANGE_ENVELOPE', verified.error.code);
  if (verified.value.body.familyId !== 'DOCUMENT') return failure('E_TF_INTERCHANGE_FAMILY');
  if (!sameIdentity(verified.value.body.identity, expectedIdentity)) return failure('E_TF_STALE_IDENTITY');
  const payload = verified.value.body.payload;
  if (!payload || payload.formatSchemaVersion !== TEXT_FORMATS_SCHEMA_VERSION || !payload.scene || !Array.isArray(payload.scene.blocks)) {
    return failure('E_TF_PAYLOAD_SHAPE');
  }
  let rendered;
  try {
    rendered = input.profileId === 'TXT_UTF8_NFC_V1'
      ? serializePlainTextV1WithLossReport(payload.scene)
      : serializeMarkdownV1WithLossReport(payload.scene);
  } catch (error) {
    return failure('E_TF_SERIALIZE_REJECTED', typeof error?.code === 'string' ? error.code : 'E_MD_UNKNOWN');
  }
  const text = (input.profileId === 'TXT_UTF8_NFC_V1' ? rendered.text : rendered.markdown).normalize('NFC');
  const bytes = Buffer.from(text, 'utf8');
  if (bytes.length > TEXT_FORMAT_LIMITS.maxInputBytes) return failure('E_TF_OUTPUT_BYTE_BUDGET');
  const ledger = makeLedger([
    ...(Array.isArray(payload.lossLedger?.items) ? payload.lossLedger.items : []),
    ...sanitizeMarkdownLosses(rendered.lossReport),
  ], 8);
  return Object.freeze({ ok: true, bytes, byteLength: bytes.length, lossLedger: ledger, profileId: input.profileId, sha256: sha256(bytes) });
}

export function evaluateTextFormatComposition(profileIds = TEXT_FORMAT_PROFILE_IDS) {
  if (!Array.isArray(profileIds) || profileIds.length === 0 || new Set(profileIds).size !== profileIds.length
      || profileIds.some((profileId) => !validateProfile(profileId))) return failure('E_TF_COMPOSITION_PROFILES');
  const capabilityRows = profileIds.map((profileId) => ({ profileId, values: { ...CAPABILITY_VALUES[profileId] } }));
  const fidelityRows = profileIds.map((profileId) => ({ reportId: profileId, values: { ...FIDELITY_VALUES[profileId] } }));
  const capabilities = composeInterchangeCapabilities(capabilityRows, INTERCHANGE_CAPABILITY_OPERATIONS);
  const fidelity = composeInterchangeFidelity(fidelityRows);
  if (!capabilities.ok || !fidelity.ok) return failure('E_TF_COMPOSITION_INTERNAL');
  return Object.freeze({
    ok: true,
    capabilities,
    capabilityDenominator: profileIds.length * INTERCHANGE_CAPABILITY_OPERATIONS.length,
    fidelity,
    fidelityDenominator: profileIds.length * INTERCHANGE_FIDELITY_DIMENSIONS.length,
    profileIds: Object.freeze([...profileIds].sort()),
  });
}
