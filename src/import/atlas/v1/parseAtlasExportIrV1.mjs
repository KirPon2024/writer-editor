import { hashCanonicalValue } from '../../../derived/deriveView.mjs';
import {
  ATLAS_EXPORT_FORMAT,
  ATLAS_EXPORT_IR_SCHEMA_VERSION,
  ATLAS_EXPORT_READABLE_JSON_SCHEMA_VERSION,
  ATLAS_EXPORT_ROUND_TRIP_PROOF_SCHEMA_VERSION,
  ATLAS_EXPORT_UNKNOWN_FIELDS_ENVELOPE_SCHEMA_VERSION,
  ATLAS_IMPORT_PREVIEW_SCHEMA_VERSION,
} from '../../../export/atlas/v1/index.mjs';

const IMPORT_OP = 'atlas.exportIr.importPreview';

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function normalizeString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function typedFailure(code, reason, details = {}) {
  const error = { code, op: IMPORT_OP, reason };
  if (isPlainObject(details) && Object.keys(details).length > 0) error.details = cloneJson(details);
  return { ok: false, error };
}

function sortJsonValue(value) {
  if (Array.isArray(value)) return value.map(sortJsonValue);
  if (!isPlainObject(value)) return value;
  const out = {};
  for (const key of Object.keys(value).sort()) {
    const child = value[key];
    if (child !== undefined) out[key] = sortJsonValue(child);
  }
  return out;
}

function parsePayload(input) {
  const candidate = input.exportJson ?? input.exportPayload ?? input.payload ?? input.packet;
  if (isPlainObject(candidate)) return { ok: true, value: sortJsonValue(cloneJson(candidate)) };
  if (typeof candidate !== 'string') return typedFailure('E_ATLAS_EXPORT_IR_IMPORT_PAYLOAD_REQUIRED', 'PAYLOAD_REQUIRED');
  try {
    const parsed = JSON.parse(candidate);
    if (!isPlainObject(parsed)) return typedFailure('E_ATLAS_EXPORT_IR_IMPORT_PAYLOAD_INVALID', 'PAYLOAD_INVALID');
    return { ok: true, value: sortJsonValue(parsed) };
  } catch {
    return typedFailure('E_ATLAS_EXPORT_IR_IMPORT_JSON_INVALID', 'JSON_INVALID');
  }
}

function verifyPacketHash(packet) {
  const actual = hashCanonicalValue({
    schemaVersion: packet.schemaVersion,
    format: packet.format,
    exportIr: packet.exportIr,
  });
  if (actual !== normalizeString(packet.packageHash)) {
    return typedFailure('E_ATLAS_EXPORT_IR_IMPORT_HASH_MISMATCH', 'PACKAGE_HASH_MISMATCH', {
      expectedPackageHash: normalizeString(packet.packageHash),
      actualPackageHash: actual,
    });
  }
  return { ok: true, value: actual };
}

function verifyUnknownFieldsEnvelope(envelope) {
  if (!isPlainObject(envelope) || envelope.schemaVersion !== ATLAS_EXPORT_UNKNOWN_FIELDS_ENVELOPE_SCHEMA_VERSION) {
    return typedFailure('E_ATLAS_EXPORT_IR_IMPORT_UNKNOWN_FIELDS_INVALID', 'UNKNOWN_FIELDS_ENVELOPE_INVALID');
  }
  const base = sortJsonValue({
    schemaVersion: envelope.schemaVersion,
    atlasUnknownFields: isPlainObject(envelope.atlasUnknownFields) ? envelope.atlasUnknownFields : {},
    projectUnknownFields: isPlainObject(envelope.projectUnknownFields) ? envelope.projectUnknownFields : {},
  });
  const actual = hashCanonicalValue(base);
  if (actual !== normalizeString(envelope.unknownFieldsHash)) {
    return typedFailure('E_ATLAS_EXPORT_IR_IMPORT_UNKNOWN_FIELDS_HASH_MISMATCH', 'UNKNOWN_FIELDS_HASH_MISMATCH', {
      expectedUnknownFieldsHash: normalizeString(envelope.unknownFieldsHash),
      actualUnknownFieldsHash: actual,
    });
  }
  return { ok: true, value: base, hash: actual };
}

function buildRoundTripProof({ packet, exportIr, unknownEnvelope, restoredAtlasAuthorData }) {
  const languageTagsHash = hashCanonicalValue(exportIr.languageTags);
  const evidenceRows = Array.isArray(exportIr.evidenceIdentity?.rows) ? exportIr.evidenceIdentity.rows : [];
  const evidenceIdentityHash = hashCanonicalValue(evidenceRows);
  const proofBase = {
    schemaVersion: ATLAS_EXPORT_ROUND_TRIP_PROOF_SCHEMA_VERSION,
    packageHash: packet.packageHash,
    packageHashVerified: true,
    knownAuthorDataHash: hashCanonicalValue(exportIr.authorData),
    restoredAtlasAuthorDataHash: hashCanonicalValue(restoredAtlasAuthorData),
    languageTagsHash,
    languageTagsPreserved: languageTagsHash === normalizeString(exportIr.source?.languageTagsHash),
    evidenceIdentityHash,
    evidenceIdentityPreserved: evidenceIdentityHash === normalizeString(exportIr.evidenceIdentity?.evidenceIdentityHash),
    unknownFieldsHash: unknownEnvelope.hash,
    unknownFieldsPreserved: unknownEnvelope.hash === normalizeString(exportIr.unknownFieldsEnvelope?.unknownFieldsHash),
    derivedGraphDataPersistedAsTruth: false,
    projectTruthMutation: false,
    manuscriptMutation: false,
    storageMutation: false,
    networkMutation: false,
    rendererMutation: false,
  };
  return sortJsonValue({
    ...proofBase,
    proofHash: hashCanonicalValue(proofBase),
  });
}

export function parseAtlasExportIrReadableJsonV1(input = {}) {
  const parsed = parsePayload(input);
  if (!parsed.ok) return parsed;
  const packet = parsed.value;
  if (packet.schemaVersion !== ATLAS_EXPORT_READABLE_JSON_SCHEMA_VERSION || packet.format !== ATLAS_EXPORT_FORMAT) {
    return typedFailure('E_ATLAS_EXPORT_IR_IMPORT_SCHEMA_INVALID', 'SCHEMA_INVALID', {
      schemaVersion: normalizeString(packet.schemaVersion),
      format: normalizeString(packet.format),
    });
  }
  if (!isPlainObject(packet.exportIr) || packet.exportIr.schemaVersion !== ATLAS_EXPORT_IR_SCHEMA_VERSION) {
    return typedFailure('E_ATLAS_EXPORT_IR_IMPORT_IR_INVALID', 'EXPORT_IR_INVALID', {
      schemaVersion: normalizeString(packet.exportIr?.schemaVersion),
    });
  }
  const packageHash = verifyPacketHash(packet);
  if (!packageHash.ok) return packageHash;
  const unknownEnvelope = verifyUnknownFieldsEnvelope(packet.exportIr.unknownFieldsEnvelope);
  if (!unknownEnvelope.ok) return unknownEnvelope;
  const authorData = isPlainObject(packet.exportIr.authorData) ? packet.exportIr.authorData : {};
  const restoredAtlasAuthorData = sortJsonValue({
    ...cloneJson(authorData),
    ...cloneJson(unknownEnvelope.value.atlasUnknownFields),
  });
  const restoredProjectPatch = sortJsonValue({
    projectId: normalizeString(packet.exportIr.projectId),
    atlas: restoredAtlasAuthorData,
    unknownFields: cloneJson(unknownEnvelope.value.projectUnknownFields),
  });
  const roundTripProof = buildRoundTripProof({
    packet,
    exportIr: packet.exportIr,
    unknownEnvelope,
    restoredAtlasAuthorData,
  });
  return {
    ok: true,
    value: sortJsonValue({
      schemaVersion: ATLAS_IMPORT_PREVIEW_SCHEMA_VERSION,
      projectId: restoredProjectPatch.projectId,
      packageHash: packageHash.value,
      exportIrHash: hashCanonicalValue(packet.exportIr),
      readableJson: true,
      restoredProjectPatch,
      roundTripProof,
      authority: {
        previewOnly: true,
        commandAuthority: 'none',
        projectTruthMutation: false,
        manuscriptMutation: false,
        storageMutation: false,
        networkMutation: false,
        rendererMutation: false,
      },
    }),
  };
}
