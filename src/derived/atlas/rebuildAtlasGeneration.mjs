import { createDerivedError, deriveView, hashCanonicalValue } from '../deriveView.mjs';
import { deriveAtlasMentionIndex } from './deriveAtlasMentionIndex.mjs';
import {
  ATLAS_CURRENT_SCENE_DOSSIER_SCHEMA_VERSION,
  ATLAS_GENERATION_MANIFEST_SCHEMA_VERSION,
  ATLAS_MENTION_INDEX_SCHEMA_VERSION,
} from './atlasMentionTypes.mjs';

const VIEW_ID = 'derived.atlas.generationManifest.v1';

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizeString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function getProject(coreState, projectId) {
  const projects = isPlainObject(coreState?.data?.projects) ? coreState.data.projects : {};
  return isPlainObject(projects[projectId]) ? projects[projectId] : null;
}

function listSceneIds(project) {
  const scenes = isPlainObject(project?.scenes) ? project.scenes : {};
  return Object.keys(scenes).sort();
}

function listDecisionIds(project) {
  const decisions = isPlainObject(project?.atlas?.decisions) ? project.atlas.decisions : {};
  return Object.keys(decisions).sort();
}

function buildGenerationManifest({ coreState, projectId, sourceRevision, indexResult, meta }) {
  const project = getProject(coreState, projectId);
  if (!project) {
    throw createDerivedError(
      'E_ATLAS_PROJECT_NOT_FOUND',
      VIEW_ID,
      'PROJECT_NOT_FOUND',
      { projectId },
    );
  }
  const sceneIds = listSceneIds(project);
  const decisionIds = listDecisionIds(project);
  const sceneShardById = new Map((Array.isArray(indexResult.value.sceneShards) ? indexResult.value.sceneShards : [])
    .map((shard) => [shard.sceneId, shard]));
  const shards = sceneIds.map((sceneId) => {
    const shard = sceneShardById.get(sceneId) || {};
    return {
      sceneId,
      sceneTextHash: typeof shard.sceneTextHash === 'string' ? shard.sceneTextHash : hashCanonicalValue(project.scenes[sceneId]?.text || ''),
      mentionCount: Number.isInteger(shard.mentionCount) ? shard.mentionCount : 0,
      mentionIds: Array.isArray(shard.mentionIds) ? shard.mentionIds.slice().sort() : [],
    };
  });
  const decisionsHash = hashCanonicalValue(decisionIds.map((decisionId) => project.atlas.decisions[decisionId]));
  const contentHash = hashCanonicalValue({
    projectId,
    sourceRevision,
    schemaVersions: {
      mentionIndex: ATLAS_MENTION_INDEX_SCHEMA_VERSION,
      currentSceneDossier: ATLAS_CURRENT_SCENE_DOSSIER_SCHEMA_VERSION,
    },
    indexHash: indexResult.value.meta?.indexHash || '',
    shards,
    decisionIds,
    decisionsHash,
  });
  return {
    schemaVersion: ATLAS_GENERATION_MANIFEST_SCHEMA_VERSION,
    projectId,
    sourceRevision,
    generationId: `atlas-generation:${contentHash}`,
    sourceCoreStateHash: meta.coreStateHash,
    paramsHash: meta.paramsHash,
    capabilityHash: meta.capabilityHash,
    analyzerVersions: {
      mentionIndex: ATLAS_MENTION_INDEX_SCHEMA_VERSION,
      currentSceneDossier: ATLAS_CURRENT_SCENE_DOSSIER_SCHEMA_VERSION,
    },
    aggregate: {
      indexHash: indexResult.value.meta?.indexHash || '',
      mentionCount: Array.isArray(indexResult.value.mentions) ? indexResult.value.mentions.length : 0,
      sceneCount: sceneIds.length,
      decisionCount: decisionIds.length,
      decisionsHash,
    },
    shards,
    recovery: {
      mode: 'rebuild-from-core-state',
      persistentDerivedTruth: false,
      cacheDeletionSafe: true,
      rebuildInput: ['coreState', 'projectId', 'sourceRevision', 'capabilitySnapshot'],
      stalePublishRule: 'reject-when-sourceRevision-mismatch',
    },
  };
}

export function deriveAtlasGenerationManifest(input = {}) {
  const projectId = normalizeString(input?.params?.projectId);
  const sourceRevision = normalizeString(input?.params?.sourceRevision);
  if (!projectId) {
    return {
      ok: false,
      error: {
        code: 'E_ATLAS_PROJECT_ID_REQUIRED',
        op: VIEW_ID,
        reason: 'PROJECT_ID_REQUIRED',
      },
    };
  }
  if (!sourceRevision) {
    return {
      ok: false,
      error: {
        code: 'E_ATLAS_SOURCE_REVISION_REQUIRED',
        op: VIEW_ID,
        reason: 'SOURCE_REVISION_REQUIRED',
      },
    };
  }

  return deriveView({
    viewId: VIEW_ID,
    coreState: input.coreState,
    params: {
      ...input.params,
      projectId,
      sourceRevision,
    },
    capabilitySnapshot: input.capabilitySnapshot,
    derive: ({ coreState, params, capabilitySnapshot, meta }) => {
      const indexResult = deriveAtlasMentionIndex({
        coreState,
        params: { projectId: params.projectId },
        capabilitySnapshot,
      });
      if (!indexResult.ok) {
        throw createDerivedError(
          indexResult.error?.code || 'E_ATLAS_INDEX_UNAVAILABLE',
          VIEW_ID,
          indexResult.error?.reason || 'ATLAS_INDEX_UNAVAILABLE',
          indexResult.error?.details || {},
        );
      }
      return buildGenerationManifest({
        coreState,
        projectId: params.projectId,
        sourceRevision: params.sourceRevision,
        indexResult,
        meta,
      });
    },
  });
}

export function canPublishAtlasGeneration(manifest, currentSourceRevision) {
  const sourceRevision = normalizeString(manifest?.sourceRevision);
  const current = normalizeString(currentSourceRevision);
  const schemaVersion = normalizeString(manifest?.schemaVersion);
  if (schemaVersion !== ATLAS_GENERATION_MANIFEST_SCHEMA_VERSION) {
    return { ok: false, reason: 'GENERATION_SCHEMA_MISMATCH' };
  }
  if (!sourceRevision || !current || sourceRevision !== current) {
    return { ok: false, reason: 'STALE_SOURCE_REVISION' };
  }
  return { ok: true, reason: '' };
}

export function recoverAtlasGenerationFromManifest(input = {}) {
  const manifest = isPlainObject(input.manifest) ? input.manifest : {};
  const rebuilt = deriveAtlasGenerationManifest({
    coreState: input.coreState,
    params: {
      projectId: manifest.projectId,
      sourceRevision: manifest.sourceRevision,
    },
    capabilitySnapshot: input.capabilitySnapshot,
  });
  if (!rebuilt.ok) return rebuilt;
  const expectedHash = hashCanonicalValue(cloneJson(manifest));
  const rebuiltHash = hashCanonicalValue(rebuilt.value);
  if (expectedHash !== rebuiltHash) {
    return {
      ok: false,
      error: {
        code: 'E_ATLAS_GENERATION_RECOVERY_MISMATCH',
        op: VIEW_ID,
        reason: 'RECOVERY_MISMATCH',
      },
      rebuilt: rebuilt.value,
    };
  }
  return {
    ok: true,
    value: rebuilt.value,
  };
}

export { VIEW_ID as ATLAS_GENERATION_MANIFEST_VIEW_ID };
