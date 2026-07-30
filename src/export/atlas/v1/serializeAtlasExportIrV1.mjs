import { hashCanonicalValue } from '../../../derived/deriveView.mjs';
import {
  ATLAS_EXPORT_EVIDENCE_IDENTITY_INDEX_SCHEMA_VERSION,
  ATLAS_EXPORT_EVIDENCE_IDENTITY_ROW_SCHEMA_VERSION,
  ATLAS_EXPORT_FORMAT,
  ATLAS_EXPORT_IR_SCHEMA_VERSION,
  ATLAS_EXPORT_KNOWN_AUTHOR_DATA_KEYS,
  ATLAS_EXPORT_READABLE_JSON_SCHEMA_VERSION,
  ATLAS_EXPORT_UNKNOWN_FIELDS_ENVELOPE_SCHEMA_VERSION,
  sortAtlasEvidenceIdentityRows,
} from './atlasExportIrTypes.mjs';

const EXPORT_OP = 'atlas.exportIr.readableJson';
const ATLAS_AUTHOR_SCHEMA_VERSION = 'atlas.author.v1';
const PRIVATE_UNKNOWN_FIELD_NAMES = new Set([
  'absolute_path',
  'absolutePath',
  'base64',
  'buffer',
  'byte_content',
  'bytes',
  'content',
  'data',
  'file_path',
  'filepath',
  'filePath',
  'localPath',
  'path',
  'raw',
  'relative_path',
  'source_path',
  'text',
  'uri',
  'url',
]);

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
  const error = { code, op: EXPORT_OP, reason };
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

function normalizeRecord(value) {
  return isPlainObject(value) ? sortJsonValue(cloneJson(value)) : {};
}

function normalizeLanguageTags(value) {
  const source = isPlainObject(value) ? value : {};
  return sortJsonValue({
    schemaVersion: normalizeString(source.schemaVersion) || 'atlas.languageTags.v1',
    project: isPlainObject(source.project) ? source.project : null,
    scenes: normalizeRecord(source.scenes),
    blocks: normalizeRecord(source.blocks),
    ranges: normalizeRecord(source.ranges),
  });
}

function normalizeContinuityFactLedgers(value) {
  const source = isPlainObject(value) ? value : {};
  return sortJsonValue({
    location: normalizeRecord(source.location),
    knowledge: normalizeRecord(source.knowledge),
    object: normalizeRecord(source.object),
    promise: normalizeRecord(source.promise),
  });
}

function normalizeAtlasAuthorData(value) {
  const source = isPlainObject(value) ? value : {};
  return sortJsonValue({
    schemaVersion: normalizeString(source.schemaVersion) || ATLAS_AUTHOR_SCHEMA_VERSION,
    entities: normalizeRecord(source.entities),
    decisions: normalizeRecord(source.decisions),
    suppressions: normalizeRecord(source.suppressions),
    entityOperations: normalizeRecord(source.entityOperations),
    reassignments: normalizeRecord(source.reassignments),
    evidenceReattachments: normalizeRecord(source.evidenceReattachments),
    savedQueries: normalizeRecord(source.savedQueries),
    languageTags: normalizeLanguageTags(source.languageTags),
    seriesIdentityLinks: normalizeRecord(source.seriesIdentityLinks),
    entityVocabulary: normalizeRecord(source.entityVocabulary),
    relationVocabulary: normalizeRecord(source.relationVocabulary),
    seriesPortabilityOperations: normalizeRecord(source.seriesPortabilityOperations),
    calendarDefinitions: normalizeRecord(source.calendarDefinitions),
    sceneTemporalAnchors: normalizeRecord(source.sceneTemporalAnchors),
    continuityFactLedgers: normalizeContinuityFactLedgers(source.continuityFactLedgers),
  });
}

function findPrivateUnknownField(value, trail = []) {
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      const found = findPrivateUnknownField(value[index], [...trail, String(index)]);
      if (found) return found;
    }
    return null;
  }
  if (!isPlainObject(value)) return null;
  for (const [key, child] of Object.entries(value)) {
    if (PRIVATE_UNKNOWN_FIELD_NAMES.has(key) || PRIVATE_UNKNOWN_FIELD_NAMES.has(key.toLowerCase())) {
      return { field: [...trail, key].join('.'), key };
    }
    const found = findPrivateUnknownField(child, [...trail, key]);
    if (found) return found;
  }
  return null;
}

function extractUnknownFields(source, knownKeys) {
  if (!isPlainObject(source)) return {};
  const known = new Set(knownKeys);
  const out = {};
  for (const key of Object.keys(source).sort()) {
    if (!known.has(key) && source[key] !== undefined) out[key] = sortJsonValue(cloneJson(source[key]));
  }
  return out;
}

function collectEvidenceIdentityRows(value, rows, seen, sourceBucket = '') {
  if (Array.isArray(value)) {
    for (const item of value) collectEvidenceIdentityRows(item, rows, seen, sourceBucket);
    return;
  }
  if (!isPlainObject(value)) return;
  const anchorId = normalizeString(value.anchorId);
  const quoteHash = normalizeString(value.quoteHash);
  const sceneTextHash = normalizeString(value.sceneTextHash);
  if (anchorId && quoteHash && sceneTextHash) {
    const base = {
      schemaVersion: ATLAS_EXPORT_EVIDENCE_IDENTITY_ROW_SCHEMA_VERSION,
      anchorId,
      projectId: normalizeString(value.projectId),
      sceneId: normalizeString(value.sceneId),
      entityId: normalizeString(value.entityId),
      quoteHash,
      sceneTextHash,
      startOffset: Number.isInteger(value.startOffset) ? value.startOffset : 0,
      endOffset: Number.isInteger(value.endOffset) ? value.endOffset : 0,
      sourceBucket,
    };
    const identityHash = hashCanonicalValue(base);
    if (!seen.has(identityHash)) {
      seen.add(identityHash);
      rows.push({ ...base, identityHash });
    }
  }
  for (const [key, child] of Object.entries(value)) {
    const nextBucket = sourceBucket || key;
    collectEvidenceIdentityRows(child, rows, seen, nextBucket);
  }
}

function buildEvidenceIdentityIndex(authorData) {
  const rows = [];
  const seen = new Set();
  collectEvidenceIdentityRows(authorData, rows, seen);
  const sortedRows = sortAtlasEvidenceIdentityRows(rows).map(sortJsonValue);
  return sortJsonValue({
    schemaVersion: ATLAS_EXPORT_EVIDENCE_IDENTITY_INDEX_SCHEMA_VERSION,
    rows: sortedRows,
    evidenceIdentityHash: hashCanonicalValue(sortedRows),
  });
}

function buildUnknownFieldsEnvelope(project, atlas) {
  const atlasUnknownFields = extractUnknownFields(atlas, ATLAS_EXPORT_KNOWN_AUTHOR_DATA_KEYS);
  const projectUnknownFields = normalizeRecord(project.unknownFields);
  const unsafeAtlas = findPrivateUnknownField(atlasUnknownFields);
  if (unsafeAtlas) {
    return typedFailure('E_ATLAS_EXPORT_PRIVATE_UNKNOWN_FIELD_DENIED', 'PRIVATE_UNKNOWN_FIELD_DENIED', {
      scope: 'atlas',
      ...unsafeAtlas,
    });
  }
  const unsafeProject = findPrivateUnknownField(projectUnknownFields);
  if (unsafeProject) {
    return typedFailure('E_ATLAS_EXPORT_PRIVATE_UNKNOWN_FIELD_DENIED', 'PRIVATE_UNKNOWN_FIELD_DENIED', {
      scope: 'project',
      ...unsafeProject,
    });
  }
  const base = sortJsonValue({
    schemaVersion: ATLAS_EXPORT_UNKNOWN_FIELDS_ENVELOPE_SCHEMA_VERSION,
    atlasUnknownFields,
    projectUnknownFields,
  });
  return {
    ok: true,
    value: sortJsonValue({
      ...base,
      unknownFieldsHash: hashCanonicalValue(base),
    }),
  };
}

function getProject(coreState, projectId) {
  const projects = isPlainObject(coreState?.data?.projects) ? coreState.data.projects : {};
  return isPlainObject(projects[projectId]) ? projects[projectId] : null;
}

export function buildAtlasExportIrPacket(input = {}) {
  const coreState = input.coreState;
  const projectId = normalizeString(input.projectId ?? input.params?.projectId);
  if (!isPlainObject(coreState)) return typedFailure('E_ATLAS_EXPORT_CORE_STATE_REQUIRED', 'CORE_STATE_REQUIRED');
  if (!projectId) return typedFailure('E_ATLAS_EXPORT_PROJECT_ID_REQUIRED', 'PROJECT_ID_REQUIRED');
  const project = getProject(coreState, projectId);
  if (!project) return typedFailure('E_ATLAS_EXPORT_PROJECT_NOT_FOUND', 'PROJECT_NOT_FOUND', { projectId });

  const rawAtlas = isPlainObject(project.atlas) ? project.atlas : {};
  const unknownEnvelope = buildUnknownFieldsEnvelope(project, rawAtlas);
  if (!unknownEnvelope.ok) return unknownEnvelope;
  const authorData = normalizeAtlasAuthorData(rawAtlas);
  const languageTags = normalizeLanguageTags(authorData.languageTags);
  const evidenceIdentity = buildEvidenceIdentityIndex(authorData);
  const atlasAuthorDataHash = hashCanonicalValue(authorData);
  const languageTagsHash = hashCanonicalValue(languageTags);
  const exportIr = sortJsonValue({
    schemaVersion: ATLAS_EXPORT_IR_SCHEMA_VERSION,
    projectId,
    title: normalizeString(project.title) || projectId,
    source: {
      projectId,
      coreStateHash: hashCanonicalValue(coreState),
      projectHash: hashCanonicalValue(project),
      atlasAuthorDataHash,
      languageTagsHash,
      evidenceIdentityHash: evidenceIdentity.evidenceIdentityHash,
      unknownFieldsHash: unknownEnvelope.value.unknownFieldsHash,
    },
    authorData,
    languageTags,
    evidenceIdentity,
    unknownFieldsEnvelope: unknownEnvelope.value,
    portability: {
      readableJson: true,
      humanReadable: true,
      localOnly: true,
      pathlessPackage: true,
      derivedGraphDataPersistedAsTruth: false,
      derivedGraphRebuildRequired: true,
      projectTruthMutation: false,
      manuscriptMutation: false,
      storageMutation: false,
      networkMutation: false,
      rendererMutation: false,
    },
  });
  const packageHash = hashCanonicalValue({
    schemaVersion: ATLAS_EXPORT_READABLE_JSON_SCHEMA_VERSION,
    format: ATLAS_EXPORT_FORMAT,
    exportIr,
  });
  const packet = sortJsonValue({
    schemaVersion: ATLAS_EXPORT_READABLE_JSON_SCHEMA_VERSION,
    format: ATLAS_EXPORT_FORMAT,
    packageHash,
    exportIr,
    recovery: {
      humanReadable: true,
      summary: `${normalizeString(project.title) || projectId}: Atlas ExportIR ${ATLAS_EXPORT_IR_SCHEMA_VERSION}`,
      entityCount: Object.keys(authorData.entities).length,
      languageTagHash: languageTagsHash,
      evidenceIdentityHash: evidenceIdentity.evidenceIdentityHash,
      unknownFieldsHash: unknownEnvelope.value.unknownFieldsHash,
      derivedGraphDataPersistedAsTruth: false,
    },
  });
  return { ok: true, value: packet };
}

export function serializeAtlasExportIrReadableJsonV1(input = {}) {
  const packet = buildAtlasExportIrPacket(input);
  if (!packet.ok) return packet;
  return {
    ok: true,
    value: packet.value,
    json: `${JSON.stringify(packet.value, null, 2)}\n`,
  };
}
