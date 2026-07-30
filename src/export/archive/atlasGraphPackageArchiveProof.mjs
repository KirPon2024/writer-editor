import { hashCanonicalValue } from '../../derived/deriveView.mjs';

export const ATLAS_FULL_ARCHIVE_INTEGRATION_PROOF_SCHEMA_VERSION = 'atlas.fullArchiveIntegrationProof.v1';

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function normalizeString(value) {
  return typeof value === 'string' ? value.trim() : '';
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

export function buildAtlasGraphPackageArchiveIntegrationProof(input = {}) {
  const graphPackage = isPlainObject(input.graphPackage) ? cloneJson(input.graphPackage) : {};
  const readableJsonPacket = isPlainObject(input.readableJsonPacket) ? cloneJson(input.readableJsonPacket) : {};
  const graphPackageHash = normalizeString(input.graphPackageHash) || hashCanonicalValue(graphPackage);
  const readableJsonPackageHash = normalizeString(readableJsonPacket.packageHash);
  const base = sortJsonValue({
    schemaVersion: ATLAS_FULL_ARCHIVE_INTEGRATION_PROOF_SCHEMA_VERSION,
    archiveKind: 'full-project',
    projectId: normalizeString(graphPackage.projectId),
    requiredEntries: [
      {
        entryId: 'atlas-export-ir-readable-json',
        mediaType: 'application/json',
        sha256: readableJsonPackageHash,
        required: true,
      },
      {
        entryId: 'atlas-graph-package-json',
        mediaType: 'application/json',
        sha256: graphPackageHash,
        required: true,
      },
      {
        entryId: 'atlas-loss-report-json',
        mediaType: 'application/json',
        sha256: hashCanonicalValue(graphPackage.lossReport || {}),
        required: true,
      },
    ],
    contentProof: {
      authorTruth: Boolean(graphPackage.contentProof?.authorTruth),
      languageTags: Boolean(graphPackage.contentProof?.languageTags),
      evidenceIdentities: Boolean(graphPackage.contentProof?.evidenceIdentities),
      customVocabularies: Boolean(graphPackage.contentProof?.customVocabularies),
      seriesReferences: Boolean(graphPackage.contentProof?.seriesReferences),
      unknownFields: Boolean(graphPackage.contentProof?.unknownFields),
    },
    localOnly: true,
    pathlessReceipt: true,
    filesystemPathLeaked: false,
    projectTruthMutation: false,
    manuscriptMutation: false,
    storageMutation: false,
    networkMutation: false,
    rendererMutation: false,
  });
  return sortJsonValue({
    ...base,
    archiveIntegrationHash: hashCanonicalValue(base),
  });
}
