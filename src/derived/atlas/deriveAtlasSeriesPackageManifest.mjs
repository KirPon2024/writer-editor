import { createDerivedError, deriveView, hashCanonicalValue } from '../deriveView.mjs';
import {
  ATLAS_SERIES_PACKAGE_AUTONOMY_PROOF_SCHEMA_VERSION,
  ATLAS_SERIES_PACKAGE_BOOK_REF_SCHEMA_VERSION,
  ATLAS_SERIES_PACKAGE_MANIFEST_SCHEMA_VERSION,
  sortAtlasSeriesPackageBookRefs,
} from './atlasSeriesPackageTypes.mjs';

const VIEW_ID = ATLAS_SERIES_PACKAGE_MANIFEST_SCHEMA_VERSION;
const VIEW_OP = 'derived.atlas.seriesPackageManifest';
const PRIVATE_FIELD_NAMES = new Set([
  'path',
  'filepath',
  'file_path',
  'absolute_path',
  'relative_path',
  'source_path',
  'url',
  'uri',
  'content',
  'text',
  'bytes',
  'byte_content',
  'data',
  'base64',
  'raw',
  'buffer',
]);

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizeString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeArray(value) {
  return Array.isArray(value) ? value : [];
}

function getProject(coreState, projectId) {
  const projects = isPlainObject(coreState?.data?.projects) ? coreState.data.projects : {};
  return isPlainObject(projects[projectId]) ? projects[projectId] : null;
}

function isSeriesPackageCapabilityEnabled(snapshot) {
  if (!isPlainObject(snapshot)) return true;
  if (snapshot['atlas.seriesPackageManifest'] === false) return false;
  const capabilities = isPlainObject(snapshot.capabilities) ? snapshot.capabilities : {};
  if (capabilities['atlas.seriesPackageManifest'] === false) return false;
  if (capabilities.atlasSeriesPackageManifest === false) return false;
  if (isPlainObject(capabilities.atlas) && capabilities.atlas.seriesPackageManifest === false) return false;
  return true;
}

function findPrivateField(value, trail = []) {
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      const found = findPrivateField(value[index], [...trail, String(index)]);
      if (found) return found;
    }
    return null;
  }
  if (!isPlainObject(value)) return null;
  for (const [key, child] of Object.entries(value)) {
    const normalizedKey = key.toLowerCase();
    if (PRIVATE_FIELD_NAMES.has(normalizedKey)) {
      return [...trail, key].join('.');
    }
    const found = findPrivateField(child, [...trail, key]);
    if (found) return found;
  }
  return null;
}

function normalizedHash(value) {
  const text = normalizeString(value);
  return /^[0-9a-f]{64}$/u.test(text) ? text : '';
}

function makeBookRefId(bookRef) {
  return `series-book:${hashCanonicalValue(bookRef)}`;
}

function buildCurrentBookRef({ project, projectId, meta }) {
  const title = normalizeString(project.title) || projectId;
  const base = {
    schemaVersion: ATLAS_SERIES_PACKAGE_BOOK_REF_SCHEMA_VERSION,
    projectId,
    bookId: projectId,
    title,
    role: 'current',
    sourceKind: 'currentProjectCoreState',
    currentProject: true,
    sourceHash: meta.coreStateHash,
    authorTruthHash: hashCanonicalValue({
      atlas: isPlainObject(project.atlas) ? project.atlas : {},
      manualMaps: isPlainObject(project.manualMaps) ? project.manualMaps : {},
    }),
    languageTagsHash: hashCanonicalValue({
      projectLanguageCode: normalizeString(project.languageCode),
      scenes: isPlainObject(project.scenes) ? Object.keys(project.scenes).sort() : [],
    }),
    evidenceIdentityHash: hashCanonicalValue({
      atlas: isPlainObject(project.atlas) ? project.atlas : {},
      scenes: isPlainObject(project.scenes) ? Object.keys(project.scenes).sort() : [],
    }),
    unknownFieldsHash: hashCanonicalValue(isPlainObject(project.unknownFields) ? project.unknownFields : {}),
    pathless: true,
    containsPrivatePath: false,
    embeddedBookContent: false,
    packageRequiredToOpen: false,
  };
  return {
    ...base,
    bookRefId: makeBookRefId(base),
  };
}

function normalizeExternalBookRef(input, index) {
  if (!isPlainObject(input)) {
    throw createDerivedError(
      'E_ATLAS_SERIES_PACKAGE_BOOK_REF_INVALID',
      VIEW_OP,
      'BOOK_REF_INVALID',
      { index },
    );
  }
  const privateField = findPrivateField(input);
  if (privateField) {
    throw createDerivedError(
      'E_ATLAS_SERIES_PACKAGE_PRIVATE_FIELD',
      VIEW_OP,
      'PRIVATE_FIELD_DENIED',
      { index, field: privateField },
    );
  }
  const projectId = normalizeString(input.projectId);
  const bookId = normalizeString(input.bookId) || projectId;
  if (!projectId || !bookId) {
    throw createDerivedError(
      'E_ATLAS_SERIES_PACKAGE_BOOK_REF_ID_REQUIRED',
      VIEW_OP,
      'BOOK_REF_ID_REQUIRED',
      { index },
    );
  }
  const base = {
    schemaVersion: ATLAS_SERIES_PACKAGE_BOOK_REF_SCHEMA_VERSION,
    projectId,
    bookId,
    title: normalizeString(input.title) || bookId,
    role: normalizeString(input.role) || 'external',
    sourceKind: 'externalPathlessBookReference',
    currentProject: false,
    sourceHash: normalizedHash(input.sourceHash),
    authorTruthHash: normalizedHash(input.authorTruthHash),
    languageTagsHash: normalizedHash(input.languageTagsHash),
    evidenceIdentityHash: normalizedHash(input.evidenceIdentityHash),
    unknownFieldsHash: normalizedHash(input.unknownFieldsHash),
    pathless: true,
    containsPrivatePath: false,
    embeddedBookContent: false,
    packageRequiredToOpen: false,
  };
  return {
    ...base,
    bookRefId: makeBookRefId(base),
  };
}

function buildAutonomyProof(bookRefs) {
  return {
    schemaVersion: ATLAS_SERIES_PACKAGE_AUTONOMY_PROOF_SCHEMA_VERSION,
    bookCount: bookRefs.length,
    eachBookOpensWithoutSeriesPackage: bookRefs.every((ref) => ref.packageRequiredToOpen === false),
    pathlessBookReferences: bookRefs.every((ref) => ref.pathless === true && ref.containsPrivatePath === false),
    embeddedBookContent: false,
    sourceProjectRewrite: false,
    silentProjectTruthRewrite: false,
    projectTruthMutation: false,
    manuscriptMutation: false,
    storageMutation: false,
    networkMutation: false,
    rendererMutation: false,
  };
}

function buildSeriesPackageManifest({ coreState, projectId, params, meta }) {
  const project = getProject(coreState, projectId);
  if (!project) {
    throw createDerivedError(
      'E_ATLAS_SERIES_PACKAGE_PROJECT_NOT_FOUND',
      VIEW_OP,
      'PROJECT_NOT_FOUND',
      { projectId },
    );
  }

  const externalRefs = normalizeArray(params.bookRefs)
    .map((ref, index) => normalizeExternalBookRef(ref, index));
  const seen = new Set();
  const bookRefs = sortAtlasSeriesPackageBookRefs([
    buildCurrentBookRef({ project, projectId, meta }),
    ...externalRefs,
  ].filter((ref) => {
    const key = `${ref.projectId}:${ref.bookId}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }));
  const seriesId = normalizeString(params.seriesId) || `series:${projectId}`;
  const title = normalizeString(params.title) || `${normalizeString(project.title) || projectId} series`;
  const autonomyProof = buildAutonomyProof(bookRefs);
  const packageHash = hashCanonicalValue({
    schemaVersion: ATLAS_SERIES_PACKAGE_MANIFEST_SCHEMA_VERSION,
    seriesId,
    title,
    projectId,
    bookRefs,
    autonomyProof,
    coreStateHash: meta.coreStateHash,
  });

  return {
    schemaVersion: ATLAS_SERIES_PACKAGE_MANIFEST_SCHEMA_VERSION,
    state: bookRefs.length > 0 ? 'ready' : 'empty',
    projectId,
    seriesId,
    title,
    bookRefs,
    autonomyProof,
    authority: {
      sourceOfTruth: [
        'project.core.currentBookIdentity',
        'params.bookRefs.pathlessExternalBookReferences',
      ],
      readModelOnly: true,
      commandAuthority: 'none',
      projectTruthMutation: false,
      manuscriptMutation: false,
      storageMutation: false,
      networkMutation: false,
      rendererMutation: false,
      sourceProjectRewrite: false,
      silentProjectTruthRewrite: false,
    },
    privacy: {
      pathless: true,
      containsPrivatePath: false,
      embeddedBookContent: false,
      containsManuscriptText: false,
      cloudSync: false,
      accountSync: false,
    },
    summary: {
      bookCount: bookRefs.length,
      externalBookRefCount: bookRefs.filter((ref) => ref.currentProject !== true).length,
      currentBookIncluded: bookRefs.some((ref) => ref.currentProject === true && ref.projectId === projectId),
      packageHash,
      coreStateHash: meta.coreStateHash,
    },
    meta: {
      packageHash,
      invalidationKey: meta.invalidationKey,
    },
  };
}

export function deriveAtlasSeriesPackageManifest(input = {}) {
  const projectId = normalizeString(input?.params?.projectId);
  if (!projectId) {
    return {
      ok: false,
      error: {
        code: 'E_ATLAS_SERIES_PACKAGE_PROJECT_ID_REQUIRED',
        op: VIEW_OP,
        reason: 'PROJECT_ID_REQUIRED',
      },
    };
  }

  return deriveView({
    viewId: VIEW_ID,
    coreState: input.coreState,
    params: {
      ...input.params,
      projectId,
    },
    capabilitySnapshot: input.capabilitySnapshot,
    derive: ({ coreState, params, capabilitySnapshot, meta }) => {
      if (!isSeriesPackageCapabilityEnabled(capabilitySnapshot)) {
        throw createDerivedError(
          'E_CAPABILITY_DISABLED_FOR_COMMAND',
          VIEW_OP,
          'ATLAS_SERIES_PACKAGE_MANIFEST_DISABLED',
          { capabilityId: 'atlas.seriesPackageManifest' },
        );
      }
      return buildSeriesPackageManifest({ coreState, projectId: params.projectId, params, meta });
    },
  });
}

export { VIEW_ID as ATLAS_SERIES_PACKAGE_MANIFEST_VIEW_ID };
