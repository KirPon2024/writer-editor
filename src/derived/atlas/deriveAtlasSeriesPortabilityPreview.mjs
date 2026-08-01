import { createDerivedError, deriveView, hashCanonicalValue } from '../deriveView.mjs';
import {
  buildMigrationPreparedEvent,
  hashCoreDomainEvents,
} from '../../core/domainEvents.mjs';
import {
  ATLAS_CUSTOM_VOCABULARY_ROW_SCHEMA_VERSION,
  ATLAS_SERIES_IDENTITY_LINK_SCHEMA_VERSION,
  ATLAS_SERIES_PORTABILITY_COLLISION_SCHEMA_VERSION,
  ATLAS_SERIES_PORTABILITY_PREVIEW_SCHEMA_VERSION,
  sortAtlasCustomVocabularyRows,
  sortAtlasSeriesIdentityLinks,
  sortAtlasSeriesPortabilityCollisions,
} from './atlasSeriesPortabilityTypes.mjs';

const VIEW_ID = ATLAS_SERIES_PORTABILITY_PREVIEW_SCHEMA_VERSION;
const VIEW_OP = 'derived.atlas.seriesPortabilityPreview';
const APPLY_COMMAND_ID = 'atlas.seriesPortability.apply';
const ROLLBACK_COMMAND_ID = 'atlas.seriesPortability.rollback';
const APPLY_CAPABILITY_ID = 'cap.atlas.seriesPortability.apply';

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

function normalizeLower(value) {
  return normalizeString(value).toLowerCase();
}

function normalizeArray(value) {
  return Array.isArray(value) ? value : [];
}

function uniqueStrings(values) {
  return [...new Set(normalizeArray(values).map(normalizeString).filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

function normalizedHash(value) {
  const text = normalizeString(value);
  return /^[0-9a-f]{64}$/u.test(text) ? text : '';
}

function getProject(coreState, projectId) {
  const projects = isPlainObject(coreState?.data?.projects) ? coreState.data.projects : {};
  return isPlainObject(projects[projectId]) ? projects[projectId] : null;
}

function isSeriesPortabilityCapabilityEnabled(snapshot) {
  if (!isPlainObject(snapshot)) return true;
  if (snapshot['atlas.seriesPortability'] === false) return false;
  const capabilities = isPlainObject(snapshot.capabilities) ? snapshot.capabilities : {};
  if (capabilities['atlas.seriesPortability'] === false) return false;
  if (capabilities.atlasSeriesPortability === false) return false;
  if (isPlainObject(capabilities.atlas) && capabilities.atlas.seriesPortability === false) return false;
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

function collision(code, subjectId, message, details = {}) {
  return {
    schemaVersion: ATLAS_SERIES_PORTABILITY_COLLISION_SCHEMA_VERSION,
    severity: 'error',
    code,
    subjectId: normalizeString(subjectId),
    message,
    silent: false,
    blocksApply: true,
    details,
  };
}

function makeIdentityLinkId(row) {
  return `series-identity-link:${hashCanonicalValue({
    seriesId: row.seriesId,
    sharedIdentityId: row.sharedIdentityId,
    localProjectId: row.localProjectId,
    localEntityId: row.localEntityId,
  })}`;
}

function makeVocabularyRowId(row) {
  return `atlas-vocabulary:${hashCanonicalValue({
    seriesId: row.seriesId,
    vocabularyKind: row.vocabularyKind,
    normalizedLabel: row.normalizedLabel,
    appliesTo: row.appliesTo,
  })}`;
}

function normalizeIdentityLink(input, context) {
  if (!isPlainObject(input)) {
    throw createDerivedError(
      'E_ATLAS_SERIES_PORTABILITY_IDENTITY_LINK_INVALID',
      VIEW_OP,
      'IDENTITY_LINK_INVALID',
      { index: context.index },
    );
  }
  const privateField = findPrivateField(input);
  if (privateField) {
    throw createDerivedError(
      'E_ATLAS_SERIES_PORTABILITY_PRIVATE_FIELD',
      VIEW_OP,
      'PRIVATE_FIELD_DENIED',
      { index: context.index, field: privateField },
    );
  }
  const rowBase = {
    schemaVersion: ATLAS_SERIES_IDENTITY_LINK_SCHEMA_VERSION,
    seriesId: context.seriesId,
    localProjectId: context.projectId,
    localEntityId: normalizeString(input.localEntityId || input.entityId),
    sharedIdentityId: normalizeString(input.sharedIdentityId),
    externalBookRefIds: uniqueStrings(input.externalBookRefIds || input.bookRefIds),
    aliases: uniqueStrings(input.aliases),
    evidenceIdentityHashes: uniqueStrings(input.evidenceIdentityHashes).map(normalizedHash).filter(Boolean),
    expectedEntityHash: normalizedHash(input.expectedEntityHash),
    source: 'author-preview',
    authorConfirmed: false,
    manuscriptMutation: false,
    projectTruthMutation: false,
    silentMerge: false,
  };
  return {
    ...rowBase,
    id: normalizeString(input.id || input.linkId) || makeIdentityLinkId(rowBase),
  };
}

function normalizeVocabularyRow(input, context) {
  if (!isPlainObject(input)) {
    throw createDerivedError(
      'E_ATLAS_SERIES_PORTABILITY_VOCABULARY_ROW_INVALID',
      VIEW_OP,
      'VOCABULARY_ROW_INVALID',
      { index: context.index, vocabularyKind: context.vocabularyKind },
    );
  }
  const privateField = findPrivateField(input);
  if (privateField) {
    throw createDerivedError(
      'E_ATLAS_SERIES_PORTABILITY_PRIVATE_FIELD',
      VIEW_OP,
      'PRIVATE_FIELD_DENIED',
      { index: context.index, vocabularyKind: context.vocabularyKind, field: privateField },
    );
  }
  const label = normalizeString(input.label || input.value || input.name);
  const rowBase = {
    schemaVersion: ATLAS_CUSTOM_VOCABULARY_ROW_SCHEMA_VERSION,
    seriesId: context.seriesId,
    projectId: context.projectId,
    vocabularyKind: context.vocabularyKind,
    label,
    normalizedLabel: normalizeLower(label),
    appliesTo: normalizeString(input.appliesTo || input.entityKind || input.relationKind),
    aliases: uniqueStrings(input.aliases),
    description: normalizeString(input.description),
    source: 'author-preview',
    authorConfirmed: false,
    manuscriptMutation: false,
    projectTruthMutation: false,
  };
  return {
    ...rowBase,
    id: normalizeString(input.id || input.rowId) || makeVocabularyRowId(rowBase),
  };
}

function existingAtlasBucket(atlas, bucketName) {
  return isPlainObject(atlas?.[bucketName]) ? atlas[bucketName] : {};
}

function addIdentityCollisions({ links, atlas, projectId, collisions }) {
  const entities = isPlainObject(atlas?.entities) ? atlas.entities : {};
  const existingLinks = existingAtlasBucket(atlas, 'seriesIdentityLinks');
  const localToShared = new Map(Object.values(existingLinks)
    .filter(isPlainObject)
    .map((link) => [normalizeString(link.localEntityId), normalizeString(link.sharedIdentityId)]));
  const sharedToLocal = new Map(Object.values(existingLinks)
    .filter(isPlainObject)
    .map((link) => [normalizeString(link.sharedIdentityId), normalizeString(link.localEntityId)]));
  for (const link of links) {
    const subjectId = link.id;
    if (!link.localEntityId) {
      collisions.push(collision('IDENTITY_LOCAL_ENTITY_REQUIRED', subjectId, 'Identity link is missing a local entity id.', { projectId }));
      continue;
    }
    if (!link.sharedIdentityId) {
      collisions.push(collision('IDENTITY_SHARED_ID_REQUIRED', subjectId, 'Identity link is missing a shared identity id.', { projectId, localEntityId: link.localEntityId }));
      continue;
    }
    const entity = isPlainObject(entities[link.localEntityId]) ? entities[link.localEntityId] : null;
    if (!entity) {
      collisions.push(collision('IDENTITY_LOCAL_ENTITY_NOT_FOUND', subjectId, 'Identity link targets a missing local entity.', { projectId, localEntityId: link.localEntityId }));
      continue;
    }
    const actualEntityHash = hashCanonicalValue(entity);
    if (link.expectedEntityHash && link.expectedEntityHash !== actualEntityHash) {
      collisions.push(collision('IDENTITY_LOCAL_ENTITY_STALE', subjectId, 'Identity link expected entity hash is stale.', {
        projectId,
        localEntityId: link.localEntityId,
        expectedEntityHash: link.expectedEntityHash,
        actualEntityHash,
      }));
    }
    const existing = isPlainObject(existingLinks[link.id]) ? existingLinks[link.id] : null;
    if (existing && hashCanonicalValue(existing) !== hashCanonicalValue(link)) {
      collisions.push(collision('IDENTITY_LINK_ID_ALREADY_EXISTS', subjectId, 'Identity link id already exists with different data.', { projectId, linkId: link.id }));
    }
    const localMappedTo = localToShared.get(link.localEntityId);
    if (localMappedTo && localMappedTo !== link.sharedIdentityId) {
      collisions.push(collision('IDENTITY_LOCAL_COLLISION', subjectId, 'Local entity is already linked to a different shared identity.', {
        projectId,
        localEntityId: link.localEntityId,
        existingSharedIdentityId: localMappedTo,
        incomingSharedIdentityId: link.sharedIdentityId,
      }));
    }
    const sharedMappedTo = sharedToLocal.get(link.sharedIdentityId);
    if (sharedMappedTo && sharedMappedTo !== link.localEntityId) {
      collisions.push(collision('IDENTITY_SHARED_COLLISION', subjectId, 'Shared identity is already linked to a different local entity in this book.', {
        projectId,
        sharedIdentityId: link.sharedIdentityId,
        existingLocalEntityId: sharedMappedTo,
        incomingLocalEntityId: link.localEntityId,
      }));
    }
    localToShared.set(link.localEntityId, link.sharedIdentityId);
    sharedToLocal.set(link.sharedIdentityId, link.localEntityId);
  }
}

function addVocabularyCollisions({ rows, existingRows, projectId, collisions }) {
  const idHashes = new Map(Object.values(existingRows)
    .filter(isPlainObject)
    .map((row) => [normalizeString(row.id), hashCanonicalValue(row)]));
  const labelToId = new Map(Object.values(existingRows)
    .filter(isPlainObject)
    .map((row) => [`${normalizeString(row.vocabularyKind)}:${normalizeString(row.normalizedLabel)}`, normalizeString(row.id)]));
  for (const row of rows) {
    const subjectId = row.id;
    if (!row.label || !row.normalizedLabel) {
      collisions.push(collision('VOCABULARY_LABEL_REQUIRED', subjectId, 'Vocabulary row is missing a label.', { projectId, vocabularyKind: row.vocabularyKind }));
      continue;
    }
    const existingHash = idHashes.get(row.id);
    if (existingHash && existingHash !== hashCanonicalValue(row)) {
      collisions.push(collision('VOCABULARY_ROW_ID_ALREADY_EXISTS', subjectId, 'Vocabulary row id already exists with different data.', { projectId, rowId: row.id }));
    }
    const labelKey = `${row.vocabularyKind}:${row.normalizedLabel}`;
    const existingId = labelToId.get(labelKey);
    if (existingId && existingId !== row.id) {
      collisions.push(collision('VOCABULARY_LABEL_COLLISION', subjectId, 'Vocabulary label collides with an existing row.', {
        projectId,
        rowId: row.id,
        existingRowId: existingId,
        normalizedLabel: row.normalizedLabel,
      }));
    }
    labelToId.set(labelKey, row.id);
    idHashes.set(row.id, hashCanonicalValue(row));
  }
}

function hashPreviewPlan(planBase) {
  return hashCanonicalValue({
    schemaVersion: planBase.schemaVersion,
    projectId: planBase.projectId,
    seriesId: planBase.seriesId,
    sourceCoreStateHash: planBase.sourceCoreStateHash,
    identityLinks: planBase.identityLinks,
    entityVocabularyRows: planBase.entityVocabularyRows,
    relationVocabularyRows: planBase.relationVocabularyRows,
    collisionReport: planBase.collisionReport,
    applyAllowed: planBase.applyAllowed,
  });
}

function buildSeriesPortabilityPreview({ coreState, projectId, params, meta }) {
  const project = getProject(coreState, projectId);
  if (!project) {
    throw createDerivedError(
      'E_ATLAS_SERIES_PORTABILITY_PROJECT_NOT_FOUND',
      VIEW_OP,
      'PROJECT_NOT_FOUND',
      { projectId },
    );
  }
  const atlas = isPlainObject(project.atlas) ? project.atlas : {};
  const seriesId = normalizeString(params.seriesId) || `series:${projectId}`;
  const identityLinks = sortAtlasSeriesIdentityLinks(normalizeArray(params.identityLinks)
    .map((link, index) => normalizeIdentityLink(link, { index, projectId, seriesId })));
  const entityVocabularyRows = sortAtlasCustomVocabularyRows(normalizeArray(params.entityVocabularyRows)
    .map((row, index) => normalizeVocabularyRow(row, { index, projectId, seriesId, vocabularyKind: 'entity' })));
  const relationVocabularyRows = sortAtlasCustomVocabularyRows(normalizeArray(params.relationVocabularyRows)
    .map((row, index) => normalizeVocabularyRow(row, { index, projectId, seriesId, vocabularyKind: 'relation' })));
  const collisions = [];
  addIdentityCollisions({ links: identityLinks, atlas, projectId, collisions });
  addVocabularyCollisions({
    rows: entityVocabularyRows,
    existingRows: existingAtlasBucket(atlas, 'entityVocabulary'),
    projectId,
    collisions,
  });
  addVocabularyCollisions({
    rows: relationVocabularyRows,
    existingRows: existingAtlasBucket(atlas, 'relationVocabulary'),
    projectId,
    collisions,
  });
  const collisionReport = sortAtlasSeriesPortabilityCollisions(collisions);
  const requestedOperationCount = identityLinks.length + entityVocabularyRows.length + relationVocabularyRows.length;
  const applyAllowed = requestedOperationCount > 0 && collisionReport.length === 0;
  const planBase = {
    schemaVersion: ATLAS_SERIES_PORTABILITY_PREVIEW_SCHEMA_VERSION,
    state: applyAllowed ? 'ready' : 'needs-author-resolution',
    projectId,
    seriesId,
    sourceCoreStateHash: meta.coreStateHash,
    identityLinks,
    entityVocabularyRows,
    relationVocabularyRows,
    collisionReport,
    applyAllowed,
  };
  const previewHash = hashPreviewPlan(planBase);
  const operationId = `atlas-series-portability:${previewHash}`;
  const domainEvents = [
    buildMigrationPreparedEvent({
      projectId,
      migrationId: operationId,
      sourceSchemaVersion: 'atlas.author.v1',
      targetSchemaVersion: 'atlas.author.v1',
      commandSeq: Number.isSafeInteger(Number(coreState?.data?.lastCommandId))
        ? Number(coreState.data.lastCommandId)
        : 0,
      previousStateHash: meta.coreStateHash,
      nextStateHash: meta.coreStateHash,
    }),
  ];
  return {
    ...planBase,
    previewHash,
    operationId,
    domainEvents,
    domainEventDigest: hashCoreDomainEvents(domainEvents),
    applyInstructions: {
      commandId: APPLY_COMMAND_ID,
      rollbackCommandId: ROLLBACK_COMMAND_ID,
      capabilityId: APPLY_CAPABILITY_ID,
      requiresAuthorConfirmation: true,
      requiresPreviewHash: true,
      previewHash,
      noAutoMerge: true,
      collisionReportRequired: true,
    },
    authority: {
      productPlane: 'Product Core owns accepted identity and vocabulary rows',
      commandAuthority: 'Command Kernel must dispatch atlas.seriesPortability.apply after revalidating capability',
      previewOnly: true,
      authorConfirmedApplyRequired: true,
      projectTruthMutation: false,
      manuscriptMutation: false,
      storageMutation: false,
      networkMutation: false,
      rendererMutation: false,
      silentProjectTruthRewrite: false,
      automaticEntityMerge: false,
      automaticManuscriptRewrite: false,
    },
    summary: {
      identityLinkCount: identityLinks.length,
      entityVocabularyRowCount: entityVocabularyRows.length,
      relationVocabularyRowCount: relationVocabularyRows.length,
      collisionCount: collisionReport.length,
      requestedOperationCount,
      applyAllowed,
      previewHash,
    },
    meta: {
      invalidationKey: meta.invalidationKey,
      coreStateHash: meta.coreStateHash,
      outputHashSeed: previewHash,
      domainEventDigest: hashCoreDomainEvents(domainEvents),
    },
  };
}

export function deriveAtlasSeriesPortabilityPreview(input = {}) {
  const projectId = normalizeString(input?.params?.projectId);
  if (!projectId) {
    return {
      ok: false,
      error: {
        code: 'E_ATLAS_SERIES_PORTABILITY_PROJECT_ID_REQUIRED',
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
      if (!isSeriesPortabilityCapabilityEnabled(capabilitySnapshot)) {
        throw createDerivedError(
          'E_CAPABILITY_DISABLED_FOR_COMMAND',
          VIEW_OP,
          'ATLAS_SERIES_PORTABILITY_DISABLED',
          { capabilityId: 'atlas.seriesPortability' },
        );
      }
      return buildSeriesPortabilityPreview({ coreState, projectId: params.projectId, params, meta });
    },
  });
}

export { VIEW_ID as ATLAS_SERIES_PORTABILITY_PREVIEW_VIEW_ID };
