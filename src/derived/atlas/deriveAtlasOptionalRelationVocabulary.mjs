import { createDerivedError, deriveView, hashCanonicalValue } from '../deriveView.mjs';
import { deriveAtlasTemporalContinuity } from './deriveAtlasTemporalContinuity.mjs';
import {
  ATLAS_OPTIONAL_RELATION_VOCABULARY_EVIDENCE_SCHEMA_VERSION,
  ATLAS_OPTIONAL_RELATION_VOCABULARY_REJECTED_ROW_SCHEMA_VERSION,
  ATLAS_OPTIONAL_RELATION_VOCABULARY_ROW_KIND,
  ATLAS_OPTIONAL_RELATION_VOCABULARY_ROW_SCHEMA_VERSION,
  ATLAS_OPTIONAL_RELATION_VOCABULARY_SCHEMA_VERSION,
  ATLAS_OPTIONAL_RELATION_VOCABULARY_STAGE_ID,
  sortAtlasOptionalRelationVocabularyRejectedRows,
  sortAtlasOptionalRelationVocabularyRows,
} from './atlasOptionalRelationVocabularyTypes.mjs';

const VIEW_ID = ATLAS_OPTIONAL_RELATION_VOCABULARY_SCHEMA_VERSION;
const VIEW_OP = 'derived.atlas.optionalRelationVocabulary';
const OPTIONAL_NON_BLOCKING = true;
const WRITER_BLOCKING = false;
const PROGRAM_VERDICT_CONTRIBUTION = false;
const PROJECT_TRUTH_MUTATION = false;
const TEXT_LIMIT = 160;

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizeString(value, limit = TEXT_LIMIT) {
  const text = typeof value === 'string' ? value.trim() : '';
  return text.length > limit ? text.slice(0, limit) : text;
}

function normalizeLower(value) {
  return normalizeString(value).toLowerCase();
}

function uniqueStrings(values) {
  return [...new Set((Array.isArray(values) ? values : [])
    .map((value) => normalizeString(value))
    .filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'variant' }));
}

function safeIdPart(value) {
  return String(value || '')
    .replace(/[^a-zA-Z0-9:_-]+/gu, '-')
    .replace(/^-+|-+$/gu, '') || 'item';
}

function getProject(coreState, projectId) {
  const projects = isPlainObject(coreState?.data?.projects) ? coreState.data.projects : {};
  return isPlainObject(projects[projectId]) ? projects[projectId] : null;
}

function relationVocabularyEntries(project) {
  const bucket = isPlainObject(project?.atlas?.relationVocabulary) ? project.atlas.relationVocabulary : {};
  return Object.keys(bucket)
    .sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'variant' }))
    .map((key) => [key, bucket[key]]);
}

function isOptionalRelationVocabularyCapabilityEnabled(snapshot) {
  if (!isPlainObject(snapshot)) return true;
  if (snapshot['atlas.optionalRelationVocabulary'] === false) return false;
  const capabilities = isPlainObject(snapshot.capabilities) ? snapshot.capabilities : {};
  if (capabilities['atlas.optionalRelationVocabulary'] === false) return false;
  if (capabilities.atlasOptionalRelationVocabulary === false) return false;
  if (isPlainObject(capabilities.atlas) && capabilities.atlas.optionalRelationVocabulary === false) return false;
  return true;
}

function rejectedRow({ code, sourceRowId, message, details = {} }) {
  return {
    schemaVersion: ATLAS_OPTIONAL_RELATION_VOCABULARY_REJECTED_ROW_SCHEMA_VERSION,
    code,
    sourceRowId: normalizeString(sourceRowId),
    message,
    details,
    blocksWriter: false,
    blocksProgram: false,
    optionalNonBlocking: OPTIONAL_NON_BLOCKING,
    privatePayloadCopied: false,
  };
}

function authorVocabularyRow([bucketKey, input], context) {
  if (!isPlainObject(input)) {
    return {
      row: null,
      rejected: rejectedRow({
        code: 'RELATION_VOCABULARY_ROW_NOT_OBJECT',
        sourceRowId: bucketKey,
        message: 'Relation vocabulary row is not an object.',
      }),
    };
  }
  const sourceRowId = normalizeString(input.id || input.rowId || bucketKey);
  const label = normalizeString(input.label || input.value || input.name);
  if (!label) {
    return {
      row: null,
      rejected: rejectedRow({
        code: 'RELATION_VOCABULARY_LABEL_REQUIRED',
        sourceRowId,
        message: 'Relation vocabulary row is missing a label.',
      }),
    };
  }
  const rowBase = {
    schemaVersion: ATLAS_OPTIONAL_RELATION_VOCABULARY_ROW_SCHEMA_VERSION,
    rowKind: ATLAS_OPTIONAL_RELATION_VOCABULARY_ROW_KIND.AUTHOR_RELATION_VOCABULARY,
    sourceProjection: 'project.atlas.relationVocabulary',
    sourceRowId,
    label,
    normalizedLabel: normalizeLower(label),
    relationKind: normalizeLower(input.relationKind || label),
    appliesTo: normalizeString(input.appliesTo || input.entityKind || input.relationKind || 'relationKind'),
    aliases: uniqueStrings(input.aliases),
    description: normalizeString(input.description, 320),
    authorConfirmed: input.authorConfirmed === true,
    observedOnly: false,
    optionalNonBlocking: OPTIONAL_NON_BLOCKING,
    absenceNeutral: true,
    writerBlocking: WRITER_BLOCKING,
    projectTruthMutation: PROJECT_TRUTH_MUTATION,
    storageMutation: false,
    networkMutation: false,
    rendererMutation: false,
    claimPromotion: false,
  };
  return {
    row: {
      ...rowBase,
      rowId: `optional-relation-vocabulary:author:${safeIdPart(sourceRowId || hashCanonicalValue(rowBase))}`,
      sourceHash: hashCanonicalValue(rowBase),
    },
    rejected: null,
  };
}

function normalizeAuthorRows(project) {
  const rows = [];
  const rejectedRows = [];
  const seenAuthorLabels = new Map();
  for (const entry of relationVocabularyEntries(project)) {
    const normalized = authorVocabularyRow(entry);
    if (normalized.rejected) {
      rejectedRows.push(normalized.rejected);
      continue;
    }
    const row = normalized.row;
    if (seenAuthorLabels.has(row.normalizedLabel)) {
      rejectedRows.push(rejectedRow({
        code: 'RELATION_VOCABULARY_DUPLICATE_NORMALIZED_LABEL',
        sourceRowId: row.sourceRowId,
        message: 'Relation vocabulary row duplicates an existing normalized label.',
        details: { duplicateOf: seenAuthorLabels.get(row.normalizedLabel) },
      }));
      continue;
    }
    seenAuthorLabels.set(row.normalizedLabel, row.sourceRowId);
    rows.push(row);
  }
  return {
    rows: sortAtlasOptionalRelationVocabularyRows(rows),
    rejectedRows: sortAtlasOptionalRelationVocabularyRejectedRows(rejectedRows),
  };
}

function observedCooccurrenceRows(temporal) {
  return sortAtlasOptionalRelationVocabularyRows((Array.isArray(temporal?.cooccurrences) ? temporal.cooccurrences : [])
    .map((relation) => {
      const rowBase = {
        schemaVersion: ATLAS_OPTIONAL_RELATION_VOCABULARY_ROW_SCHEMA_VERSION,
        rowKind: ATLAS_OPTIONAL_RELATION_VOCABULARY_ROW_KIND.OBSERVED_COOCCURRENCE,
        sourceProjection: 'derived.atlas.temporalContinuity.v1',
        sourceRowId: normalizeString(relation.pairId),
        label: 'Observed co-occurrence',
        normalizedLabel: 'observed co-occurrence',
        relationKind: 'cooccurrence',
        appliesTo: 'relationPair',
        leftEntityId: normalizeString(relation.leftEntityId),
        rightEntityId: normalizeString(relation.rightEntityId),
        sceneCount: Number(relation.sceneCount || 0),
        occurrenceCount: Number(relation.occurrenceCount || 0),
        sceneIds: uniqueStrings(relation.sceneIds),
        evidenceAnchorIds: uniqueStrings(relation.evidenceAnchorIds),
        authorConfirmed: false,
        observedOnly: true,
        optionalNonBlocking: OPTIONAL_NON_BLOCKING,
        absenceNeutral: true,
        writerBlocking: WRITER_BLOCKING,
        projectTruthMutation: PROJECT_TRUTH_MUTATION,
        storageMutation: false,
        networkMutation: false,
        rendererMutation: false,
        claimPromotion: false,
      };
      return {
        ...rowBase,
        rowId: `optional-relation-vocabulary:observed:${safeIdPart(relation.pairId || hashCanonicalValue(rowBase))}`,
        sourceHash: hashCanonicalValue(rowBase),
      };
    }));
}

function buildProgramBinding() {
  return {
    stageId: ATLAS_OPTIONAL_RELATION_VOCABULARY_STAGE_ID,
    profileId: 'ATLAS_MAPS_DERIVED',
    status: 'OPTIONAL_NON_BLOCKING',
    dependsOn: ['A0_ATLAS_INCREMENTAL_EQUIVALENCE'],
    requiredEvidence: ['E2_CONTRACT', 'E3_INTEGRATION'],
    claimCeiling: 'OPTIONAL_FEATURE_ONLY',
    optionalNonBlocking: OPTIONAL_NON_BLOCKING,
    writerBlocking: WRITER_BLOCKING,
    absenceNeutral: true,
    programVerdictContribution: PROGRAM_VERDICT_CONTRIBUTION,
  };
}

function buildAuthority() {
  return {
    sourceOfTruth: [
      'project.atlas.relationVocabulary',
      'derived.atlas.temporalContinuity.v1',
    ],
    readModelOnly: true,
    commandAuthority: 'none',
    queryOnly: true,
    optionalNonBlocking: OPTIONAL_NON_BLOCKING,
    writerBlocking: WRITER_BLOCKING,
    programVerdictContribution: PROGRAM_VERDICT_CONTRIBUTION,
    projectTruthMutation: PROJECT_TRUTH_MUTATION,
    manuscriptMutation: false,
    storageMutation: false,
    networkMutation: false,
    rendererMutation: false,
    automaticRelationCreation: false,
    claimPromotion: false,
    persistentDerivedTruth: false,
  };
}

function buildTemporalSource({ coreState, projectId, capabilitySnapshot }) {
  const temporalResult = deriveAtlasTemporalContinuity({
    coreState,
    params: { projectId },
    capabilitySnapshot,
  });
  if (!temporalResult.ok) {
    return {
      temporal: null,
      availability: {
        state: 'unavailable',
        sourceProjection: 'derived.atlas.temporalContinuity.v1',
        errorCode: temporalResult.error?.code || 'E_ATLAS_TEMPORAL_CONTINUITY_UNAVAILABLE',
        reason: temporalResult.error?.reason || 'TEMPORAL_CONTINUITY_UNAVAILABLE',
      },
    };
  }
  return {
    temporal: temporalResult.value,
    availability: {
      state: temporalResult.value.state,
      sourceProjection: 'derived.atlas.temporalContinuity.v1',
      sourceHash: temporalResult.value.summary?.temporalHash || '',
      invalidationKey: temporalResult.meta?.invalidationKey || '',
    },
  };
}

function buildOptionalRelationVocabulary({ coreState, projectId, capabilitySnapshot, meta }) {
  const project = getProject(coreState, projectId);
  if (!project) {
    throw createDerivedError(
      'E_ATLAS_OPTIONAL_RELATION_VOCABULARY_PROJECT_NOT_FOUND',
      VIEW_OP,
      'PROJECT_NOT_FOUND',
      { projectId },
    );
  }
  const author = normalizeAuthorRows(project);
  const temporalSource = buildTemporalSource({ coreState, projectId, capabilitySnapshot });
  const observedRows = observedCooccurrenceRows(temporalSource.temporal);
  const rows = sortAtlasOptionalRelationVocabularyRows([...author.rows, ...observedRows]);
  const rejectedRows = sortAtlasOptionalRelationVocabularyRejectedRows(author.rejectedRows);
  const sourceHashes = {
    coreStateHash: meta.coreStateHash,
    paramsHash: meta.paramsHash,
    capabilityHash: meta.capabilityHash,
    authorRelationVocabularyHash: hashCanonicalValue(author.rows),
    observedCooccurrenceHash: hashCanonicalValue(observedRows),
    rejectedRowsHash: hashCanonicalValue(rejectedRows),
    temporalContinuityHash: temporalSource.availability.sourceHash || '',
  };
  const normalizedLabels = [...new Set(rows.map((row) => row.normalizedLabel).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'variant' }));
  const vocabularyHash = hashCanonicalValue({
    projectId,
    stageId: ATLAS_OPTIONAL_RELATION_VOCABULARY_STAGE_ID,
    rows,
    rejectedRows,
    sourceHashes,
  });
  const state = rejectedRows.length > 0 ? 'degraded' : rows.length > 0 ? 'ready' : 'empty';

  return {
    schemaVersion: ATLAS_OPTIONAL_RELATION_VOCABULARY_SCHEMA_VERSION,
    state,
    projectId,
    programBinding: buildProgramBinding(),
    authority: buildAuthority(),
    sourceAvailability: {
      projectRelationVocabulary: {
        state: author.rows.length > 0 || rejectedRows.length > 0 ? 'available' : 'empty',
        sourceProjection: 'project.atlas.relationVocabulary',
        sourceHash: sourceHashes.authorRelationVocabularyHash,
      },
      temporalContinuity: temporalSource.availability,
    },
    authorVocabularyRows: author.rows,
    observedRelationRows: observedRows,
    rejectedRows,
    rows,
    evidence: {
      schemaVersion: ATLAS_OPTIONAL_RELATION_VOCABULARY_EVIDENCE_SCHEMA_VERSION,
      evidenceClasses: ['E2_CONTRACT', 'E3_INTEGRATION'],
      sourceHashes,
      optionalNonBlocking: OPTIONAL_NON_BLOCKING,
      writerBlocking: WRITER_BLOCKING,
      programVerdictContribution: PROGRAM_VERDICT_CONTRIBUTION,
      vocabularyHash,
    },
    summary: {
      authorVocabularyRowCount: author.rows.length,
      observedRelationRowCount: observedRows.length,
      rejectedRowCount: rejectedRows.length,
      rowCount: rows.length,
      normalizedLabelCount: normalizedLabels.length,
      normalizedLabels,
      optionalNonBlocking: OPTIONAL_NON_BLOCKING,
      absenceNeutral: true,
      writerBlocking: WRITER_BLOCKING,
      projectTruthMutation: PROJECT_TRUTH_MUTATION,
      vocabularyHash,
      invalidationKey: meta.invalidationKey,
    },
    meta: {
      vocabularyHash,
      invalidationKey: meta.invalidationKey,
    },
  };
}

export function deriveAtlasOptionalRelationVocabulary(input = {}) {
  const projectId = normalizeString(input?.params?.projectId);
  if (!projectId) {
    return {
      ok: false,
      error: {
        code: 'E_ATLAS_OPTIONAL_RELATION_VOCABULARY_PROJECT_ID_REQUIRED',
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
      if (!isOptionalRelationVocabularyCapabilityEnabled(capabilitySnapshot)) {
        throw createDerivedError(
          'E_CAPABILITY_DISABLED_FOR_COMMAND',
          VIEW_OP,
          'ATLAS_OPTIONAL_RELATION_VOCABULARY_DISABLED',
          { capabilityId: 'atlas.optionalRelationVocabulary' },
        );
      }
      return buildOptionalRelationVocabulary({
        coreState,
        projectId: params.projectId,
        capabilitySnapshot,
        meta,
      });
    },
  });
}

export { VIEW_ID as ATLAS_OPTIONAL_RELATION_VOCABULARY_VIEW_ID };
