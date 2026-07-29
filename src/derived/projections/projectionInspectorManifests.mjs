import { createDerivedError, deriveView, hashCanonicalValue } from '../deriveView.mjs';
import { deriveIdeaProjection } from '../idea/deriveIdeaProjection.mjs';
import { IDEA_PROJECTION_SCHEMA_VERSION } from '../idea/ideaProjectionTypes.mjs';
import { deriveMeaningProjection } from '../meaning/deriveMeaningProjection.mjs';
import { MEANING_PROJECTION_SCHEMA_VERSION } from '../meaning/meaningProjectionTypes.mjs';
import { derivePlotProjection } from '../plot/derivePlotProjection.mjs';
import { PLOT_PROJECTION_SCHEMA_VERSION } from '../plot/plotProjectionTypes.mjs';
import {
  PROJECTION_INSPECTOR_FALLBACK_SCHEMA_VERSION,
  PROJECTION_INSPECTOR_MANIFEST_SCHEMA_VERSION,
  PROJECTION_INSPECTOR_PROVIDER_SCHEMA_VERSION,
  PROJECTION_INSPECTOR_STATE,
  sortProjectionInspectorManifests,
  sortProjectionInspectorStates,
} from './projectionInspectorTypes.mjs';

const VIEW_ID = PROJECTION_INSPECTOR_PROVIDER_SCHEMA_VERSION;
const VIEW_OP = 'derived.projection.inspectorProvider';

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizeString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function createManifest({
  inspectorId,
  projectionId,
  projectionSchemaVersion,
  title,
  sourceOfTruth,
  summaryFields,
  detailSlots,
  emptyCode,
  unavailableCode,
}) {
  return {
    schemaVersion: PROJECTION_INSPECTOR_MANIFEST_SCHEMA_VERSION,
    inspectorId,
    projectionId,
    projectionSchemaVersion,
    title,
    readOnly: true,
    sourceOfTruth,
    commandAuthority: 'none',
    allowedActions: [],
    slots: [
      {
        slotId: 'summary',
        slotKind: 'summary',
        fields: summaryFields,
      },
      ...detailSlots.map((slotId) => ({
        slotId,
        slotKind: 'detailList',
      })),
      {
        slotId: 'fallback',
        slotKind: 'fallbackState',
      },
    ],
    fallback: {
      empty: {
        schemaVersion: PROJECTION_INSPECTOR_FALLBACK_SCHEMA_VERSION,
        state: PROJECTION_INSPECTOR_STATE.EMPTY,
        code: emptyCode,
      },
      unavailable: {
        schemaVersion: PROJECTION_INSPECTOR_FALLBACK_SCHEMA_VERSION,
        state: PROJECTION_INSPECTOR_STATE.UNAVAILABLE,
        code: unavailableCode,
      },
    },
    authority: {
      projectTruthMutation: false,
      storageMutation: false,
      networkMutation: false,
      rendererMutation: false,
    },
  };
}

export function createProjectionInspectorManifests() {
  return sortProjectionInspectorManifests([
    createManifest({
      inspectorId: 'plot.projection.inspector',
      projectionId: 'plot',
      projectionSchemaVersion: PLOT_PROJECTION_SCHEMA_VERSION,
      title: 'Plot projection',
      sourceOfTruth: 'project.core via derivePlotProjection',
      summaryFields: ['sceneCount', 'headingCount', 'confirmedMentionCount', 'originRefCount'],
      detailSlots: ['nodes', 'originRefs', 'sequenceLayout'],
      emptyCode: 'PLOT_PROJECTION_EMPTY',
      unavailableCode: 'PLOT_PROJECTION_UNAVAILABLE',
    }),
    createManifest({
      inspectorId: 'idea.projection.inspector',
      projectionId: 'idea',
      projectionSchemaVersion: IDEA_PROJECTION_SCHEMA_VERSION,
      title: 'Idea projection',
      sourceOfTruth: 'project.core.ideas via deriveIdeaProjection',
      summaryFields: ['ideaCount', 'originLinkCount', 'occurrenceEvidenceCount'],
      detailSlots: ['ideas', 'originLinks', 'occurrenceEvidence'],
      emptyCode: 'IDEA_PROJECTION_EMPTY',
      unavailableCode: 'IDEA_PROJECTION_UNAVAILABLE',
    }),
    createManifest({
      inspectorId: 'meaning.projection.inspector',
      projectionId: 'meaning',
      projectionSchemaVersion: MEANING_PROJECTION_SCHEMA_VERSION,
      title: 'Meaning projection',
      sourceOfTruth: 'project.core.meanings via deriveMeaningProjection',
      summaryFields: ['meaningCount', 'promotionEvidenceCount'],
      detailSlots: ['meanings', 'promotionEvidence'],
      emptyCode: 'MEANING_PROJECTION_EMPTY',
      unavailableCode: 'MEANING_PROJECTION_UNAVAILABLE',
    }),
  ]);
}

function isProjectionEmpty(projectionId, value) {
  if (projectionId === 'plot') {
    return Number(value?.summary?.sceneCount || 0) === 0
      && Number(value?.summary?.headingCount || 0) === 0
      && Number(value?.summary?.confirmedMentionCount || 0) === 0;
  }
  if (projectionId === 'idea') {
    return Number(value?.summary?.ideaCount || 0) === 0
      && Number(value?.summary?.originLinkCount || 0) === 0;
  }
  if (projectionId === 'meaning') {
    return Number(value?.summary?.meaningCount || 0) === 0;
  }
  return true;
}

function itemCountFor(projectionId, value) {
  if (projectionId === 'plot') return Number(value?.summary?.originRefCount || 0);
  if (projectionId === 'idea') return Number(value?.summary?.ideaCount || 0);
  if (projectionId === 'meaning') return Number(value?.summary?.meaningCount || 0);
  return 0;
}

function stateFromResult(manifest, result) {
  const manifestHash = hashCanonicalValue(manifest);
  if (!result?.ok) {
    return {
      schemaVersion: PROJECTION_INSPECTOR_FALLBACK_SCHEMA_VERSION,
      inspectorId: manifest.inspectorId,
      projectionId: manifest.projectionId,
      state: PROJECTION_INSPECTOR_STATE.UNAVAILABLE,
      fallbackCode: manifest.fallback.unavailable.code,
      unavailableReason: result?.error?.code || 'E_PROJECTION_UNAVAILABLE',
      itemCount: 0,
      manifestHash,
      projectionHash: '',
    };
  }
  const empty = isProjectionEmpty(manifest.projectionId, result.value);
  return {
    schemaVersion: PROJECTION_INSPECTOR_FALLBACK_SCHEMA_VERSION,
    inspectorId: manifest.inspectorId,
    projectionId: manifest.projectionId,
    state: empty ? PROJECTION_INSPECTOR_STATE.EMPTY : PROJECTION_INSPECTOR_STATE.READY,
    fallbackCode: empty ? manifest.fallback.empty.code : '',
    unavailableReason: '',
    itemCount: itemCountFor(manifest.projectionId, result.value),
    manifestHash,
    projectionHash: normalizeString(result.value?.meta?.projectionHash),
  };
}

function buildProvider(coreState, projectId, capabilitySnapshot, meta) {
  const manifests = createProjectionInspectorManifests();
  const byProjection = new Map(manifests.map((manifest) => [manifest.projectionId, manifest]));
  const plot = derivePlotProjection({ coreState, params: { projectId }, capabilitySnapshot });
  const idea = deriveIdeaProjection({ coreState, params: { projectId }, capabilitySnapshot });
  const meaning = deriveMeaningProjection({ coreState, params: { projectId }, capabilitySnapshot });
  const projectionStates = sortProjectionInspectorStates([
    stateFromResult(byProjection.get('plot'), plot),
    stateFromResult(byProjection.get('idea'), idea),
    stateFromResult(byProjection.get('meaning'), meaning),
  ]);
  const summary = {
    manifestCount: manifests.length,
    readyCount: projectionStates.filter((item) => item.state === PROJECTION_INSPECTOR_STATE.READY).length,
    emptyCount: projectionStates.filter((item) => item.state === PROJECTION_INSPECTOR_STATE.EMPTY).length,
    unavailableCount: projectionStates.filter((item) => item.state === PROJECTION_INSPECTOR_STATE.UNAVAILABLE).length,
  };
  const providerHash = hashCanonicalValue({
    manifests,
    projectionStates,
    summary,
  });
  return {
    schemaVersion: PROJECTION_INSPECTOR_PROVIDER_SCHEMA_VERSION,
    projectId,
    manifests,
    projectionStates,
    authority: {
      sourceOfTruth: 'derived plot, idea, and meaning projections',
      commandAuthority: 'none',
      readOnlyProvider: true,
      projectTruthMutation: false,
      storageMutation: false,
      networkMutation: false,
      rendererMutation: false,
    },
    summary,
    meta: {
      providerHash,
      invalidationKey: meta.invalidationKey,
    },
  };
}

export function deriveProjectionInspectorProvider(input = {}) {
  const projectId = normalizeString(input?.params?.projectId);
  if (!projectId) {
    return {
      ok: false,
      error: {
        code: 'E_PROJECTION_INSPECTOR_PROJECT_ID_REQUIRED',
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
      if (!isPlainObject(coreState)) {
        throw createDerivedError(
          'E_PROJECTION_INSPECTOR_CORE_STATE_REQUIRED',
          VIEW_OP,
          'CORE_STATE_REQUIRED',
          { projectId: params.projectId },
        );
      }
      return buildProvider(coreState, params.projectId, capabilitySnapshot, meta);
    },
  });
}

export { VIEW_ID as PROJECTION_INSPECTOR_PROVIDER_VIEW_ID };
