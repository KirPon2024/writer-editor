import { createDerivedError, deriveView, hashCanonicalValue } from '../deriveView.mjs';
import { deriveIdeaProjection } from '../idea/deriveIdeaProjection.mjs';
import { deriveMeaningProjection } from '../meaning/deriveMeaningProjection.mjs';
import { derivePlotProjection } from '../plot/derivePlotProjection.mjs';
import {
  CROSS_PROJECTION_EDGE_KIND,
  CROSS_PROJECTION_GRAPH_PACKET_SCHEMA_VERSION,
  CROSS_PROJECTION_IMPACT_PREVIEW_SCHEMA_VERSION,
  CROSS_PROJECTION_NODE_KIND,
  CROSS_PROJECTION_ORIGIN_REF_SCHEMA_VERSION,
  sortCrossProjectionEdges,
  sortCrossProjectionImpactItems,
  sortCrossProjectionNodes,
  sortCrossProjectionOriginRefs,
} from './crossProjectionTypes.mjs';

const VIEW_ID = CROSS_PROJECTION_IMPACT_PREVIEW_SCHEMA_VERSION;
const VIEW_OP = 'derived.crossProjection.impactPreview';

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizeString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function numberOrZero(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function safeIdPart(value) {
  return String(value || '')
    .replace(/[^a-zA-Z0-9:_-]+/gu, '-')
    .replace(/^-+|-+$/gu, '') || 'item';
}

function isCrossProjectionCapabilityEnabled(snapshot) {
  if (!isPlainObject(snapshot)) return true;
  if (snapshot['crossProjection.impactPreview'] === false) return false;
  const capabilities = isPlainObject(snapshot.capabilities) ? snapshot.capabilities : {};
  if (capabilities['crossProjection.impactPreview'] === false) return false;
  if (capabilities.crossProjectionImpactPreview === false) return false;
  if (isPlainObject(capabilities.crossProjection) && capabilities.crossProjection.impactPreview === false) return false;
  return true;
}

function sourceUnavailable(sourceProjection, result) {
  throw createDerivedError(
    'E_CROSS_PROJECTION_SOURCE_UNAVAILABLE',
    VIEW_OP,
    'SOURCE_PROJECTION_UNAVAILABLE',
    {
      sourceProjection,
      sourceErrorCode: result?.error?.code || 'E_SOURCE_UNKNOWN',
    },
  );
}

function normalizeOriginRef(projectId, value) {
  const originRef = isPlainObject(value) ? value : {};
  const sceneId = normalizeString(originRef.sceneId);
  const startOffset = numberOrZero(originRef.startOffset);
  const endOffset = numberOrZero(originRef.endOffset);
  const sourceHash = normalizeString(originRef.sourceHash);
  const originKey = hashCanonicalValue({
    projectId,
    sceneId,
    startOffset,
    endOffset,
    sourceHash,
  });
  return {
    schemaVersion: CROSS_PROJECTION_ORIGIN_REF_SCHEMA_VERSION,
    originKey,
    projectId,
    sceneId,
    startOffset,
    endOffset,
    sourceHash,
    sourceSchemaVersion: normalizeString(originRef.schemaVersion),
    sourceKind: normalizeString(originRef.kind),
    targetId: normalizeString(originRef.targetId),
    sourceRefId: normalizeString(originRef.refId),
  };
}

function createObjectNode({ projection, objectKind, objectId, label }) {
  const normalizedObjectId = normalizeString(objectId);
  const normalizedProjection = normalizeString(projection);
  const normalizedObjectKind = normalizeString(objectKind);
  return {
    id: `cross-object:${safeIdPart(normalizedProjection)}:${safeIdPart(normalizedObjectKind)}:${safeIdPart(normalizedObjectId)}`,
    kind: CROSS_PROJECTION_NODE_KIND.PROJECTION_OBJECT,
    projection: normalizedProjection,
    objectKind: normalizedObjectKind,
    objectId: normalizedObjectId,
    label: normalizeString(label) || normalizedObjectId,
  };
}

function sourceSnapshot(node) {
  return {
    nodeId: node.id,
    projection: node.projection,
    objectKind: node.objectKind,
    objectId: node.objectId,
    label: node.label,
  };
}

function addObject(objectsById, object) {
  const node = createObjectNode(object);
  if (!objectsById.has(node.id)) objectsById.set(node.id, node);
  return objectsById.get(node.id);
}

function addOriginBinding({ projectId, originRefsByKey, objectsById, bindings, object, originRef, sourceId }) {
  const objectNode = addObject(objectsById, object);
  const normalizedRef = normalizeOriginRef(projectId, originRef);
  if (!normalizedRef.sceneId || !normalizedRef.sourceHash) return;
  const existing = originRefsByKey.get(normalizedRef.originKey) || {
    schemaVersion: CROSS_PROJECTION_ORIGIN_REF_SCHEMA_VERSION,
    originKey: normalizedRef.originKey,
    projectId,
    sceneId: normalizedRef.sceneId,
    startOffset: normalizedRef.startOffset,
    endOffset: normalizedRef.endOffset,
    sourceHash: normalizedRef.sourceHash,
    sourceKinds: [],
    sourceRefs: [],
  };
  const sourceKindSet = new Set(existing.sourceKinds);
  if (normalizedRef.sourceKind) sourceKindSet.add(normalizedRef.sourceKind);
  const sourceRef = {
    projection: objectNode.projection,
    objectNodeId: objectNode.id,
    objectKind: objectNode.objectKind,
    objectId: objectNode.objectId,
    sourceId: normalizeString(sourceId) || normalizedRef.sourceRefId || objectNode.objectId,
    sourceSchemaVersion: normalizedRef.sourceSchemaVersion,
    sourceKind: normalizedRef.sourceKind,
    targetId: normalizedRef.targetId,
  };
  const sourceRefKey = hashCanonicalValue(sourceRef);
  if (!existing.sourceRefs.some((item) => hashCanonicalValue(item) === sourceRefKey)) {
    existing.sourceRefs.push(sourceRef);
  }
  existing.sourceKinds = [...sourceKindSet].sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'variant' }));
  existing.sourceRefs = existing.sourceRefs.sort((a, b) => {
    if (a.projection !== b.projection) return a.projection.localeCompare(b.projection, 'en', { sensitivity: 'variant' });
    if (a.objectId !== b.objectId) return a.objectId.localeCompare(b.objectId, 'en', { sensitivity: 'variant' });
    return a.sourceId.localeCompare(b.sourceId, 'en', { sensitivity: 'variant' });
  });
  originRefsByKey.set(existing.originKey, existing);
  bindings.push({
    objectNodeId: objectNode.id,
    originKey: existing.originKey,
    projection: objectNode.projection,
  });
}

function collectPlotBindings({ projectId, plotProjection, originRefsByKey, objectsById, bindings }) {
  const refsById = new Map((Array.isArray(plotProjection.originRefs) ? plotProjection.originRefs : [])
    .map((ref) => [normalizeString(ref.refId), ref]));
  for (const node of Array.isArray(plotProjection.nodes) ? plotProjection.nodes : []) {
    const originRefId = normalizeString(node.originRefId);
    if (!originRefId) continue;
    const originRef = refsById.get(originRefId);
    if (!originRef) continue;
    addOriginBinding({
      projectId,
      originRefsByKey,
      objectsById,
      bindings,
      object: {
        projection: 'plot',
        objectKind: normalizeString(node.kind),
        objectId: normalizeString(node.id),
        label: normalizeString(node.label),
      },
      originRef,
      sourceId: originRefId,
    });
  }
}

function collectIdeaBindings({ projectId, ideaProjection, originRefsByKey, objectsById, bindings }) {
  const ideasById = new Map((Array.isArray(ideaProjection.ideas) ? ideaProjection.ideas : [])
    .map((idea) => [normalizeString(idea.id), idea]));
  for (const idea of ideasById.values()) {
    addObject(objectsById, {
      projection: 'idea',
      objectKind: 'idea',
      objectId: idea.id,
      label: idea.title,
    });
  }
  for (const link of Array.isArray(ideaProjection.originLinks) ? ideaProjection.originLinks : []) {
    const idea = ideasById.get(normalizeString(link.ideaId)) || {};
    addOriginBinding({
      projectId,
      originRefsByKey,
      objectsById,
      bindings,
      object: {
        projection: 'idea',
        objectKind: 'idea',
        objectId: normalizeString(link.ideaId),
        label: normalizeString(idea.title) || normalizeString(link.ideaId),
      },
      originRef: link.originRef,
      sourceId: normalizeString(link.id),
    });
  }
}

function collectMeaningBindings({ projectId, meaningProjection, ideaProjection, originRefsByKey, objectsById, bindings }) {
  const ideasById = new Map((Array.isArray(ideaProjection.ideas) ? ideaProjection.ideas : [])
    .map((idea) => [normalizeString(idea.id), idea]));
  const meaningIdeaEdges = [];
  for (const meaning of Array.isArray(meaningProjection.meanings) ? meaningProjection.meanings : []) {
    const meaningNode = addObject(objectsById, {
      projection: 'meaning',
      objectKind: 'meaning',
      objectId: meaning.id,
      label: meaning.title,
    });
    if (meaning.source?.kind === 'sceneOriginRef') {
      addOriginBinding({
        projectId,
        originRefsByKey,
        objectsById,
        bindings,
        object: {
          projection: 'meaning',
          objectKind: 'meaning',
          objectId: meaning.id,
          label: meaning.title,
        },
        originRef: meaning.source.originRef,
        sourceId: meaning.id,
      });
    }
    if (meaning.source?.kind === 'idea') {
      const ideaId = normalizeString(meaning.source.ideaId);
      const idea = ideasById.get(ideaId) || {};
      const ideaNode = addObject(objectsById, {
        projection: 'idea',
        objectKind: 'idea',
        objectId: ideaId,
        label: normalizeString(idea.title) || ideaId,
      });
      meaningIdeaEdges.push({
        id: `cross-edge:${hashCanonicalValue({
          kind: CROSS_PROJECTION_EDGE_KIND.MEANING_PROMOTED_FROM_IDEA,
          from: ideaNode.id,
          to: meaningNode.id,
        })}`,
        kind: CROSS_PROJECTION_EDGE_KIND.MEANING_PROMOTED_FROM_IDEA,
        from: ideaNode.id,
        to: meaningNode.id,
        sourceProjection: 'meaning',
        sourceId: meaning.id,
      });
    }
  }
  return meaningIdeaEdges;
}

function createCanvasPacket({ originRefs, objectNodes, bindings, meaningIdeaEdges }) {
  const originNodes = originRefs.map((ref) => ({
    id: `cross-origin:${ref.originKey}`,
    kind: CROSS_PROJECTION_NODE_KIND.ORIGIN_REF,
    originKey: ref.originKey,
    sceneId: ref.sceneId,
    startOffset: ref.startOffset,
    endOffset: ref.endOffset,
    label: `${ref.sceneId}:${ref.startOffset}-${ref.endOffset}`,
  }));
  const objectOriginEdges = bindings.map((binding) => ({
    id: `cross-edge:${hashCanonicalValue({
      kind: CROSS_PROJECTION_EDGE_KIND.OBJECT_ORIGIN_REF,
      from: binding.objectNodeId,
      to: binding.originKey,
      projection: binding.projection,
    })}`,
    kind: CROSS_PROJECTION_EDGE_KIND.OBJECT_ORIGIN_REF,
    from: binding.objectNodeId,
    to: `cross-origin:${binding.originKey}`,
    projection: binding.projection,
    originKey: binding.originKey,
  }));
  const nodes = sortCrossProjectionNodes([...originNodes, ...objectNodes]);
  const edges = sortCrossProjectionEdges([...objectOriginEdges, ...meaningIdeaEdges]);
  return {
    schemaVersion: CROSS_PROJECTION_GRAPH_PACKET_SCHEMA_VERSION,
    nodes,
    edges,
    summary: {
      nodeCount: nodes.length,
      edgeCount: edges.length,
      originNodeCount: originNodes.length,
      objectNodeCount: objectNodes.length,
    },
  };
}

function createImpactItems({ originRefs, objectsById, meaningIdeaEdges }) {
  const originImpactItems = originRefs.map((ref) => {
    const affectedObjects = ref.sourceRefs
      .map((sourceRef) => sourceSnapshot(objectsById.get(sourceRef.objectNodeId) || {
        id: sourceRef.objectNodeId,
        projection: sourceRef.projection,
        objectKind: sourceRef.objectKind,
        objectId: sourceRef.objectId,
        label: sourceRef.objectId,
      }))
      .sort((a, b) => {
        if (a.projection !== b.projection) return a.projection.localeCompare(b.projection, 'en', { sensitivity: 'variant' });
        return a.objectId.localeCompare(b.objectId, 'en', { sensitivity: 'variant' });
      });
    const projections = [...new Set(affectedObjects.map((item) => item.projection))].sort();
    return {
      impactKey: `origin:${ref.originKey}`,
      relationKind: 'sharedOriginRef',
      originKey: ref.originKey,
      sceneId: ref.sceneId,
      startOffset: ref.startOffset,
      endOffset: ref.endOffset,
      sourceHash: ref.sourceHash,
      affectedObjects,
      crossProjectionCount: projections.length,
      hasCrossProjectionImpact: projections.length > 1,
    };
  });
  const promotionImpactItems = meaningIdeaEdges.map((edge) => ({
    impactKey: `relation:${edge.id}`,
    relationKind: CROSS_PROJECTION_EDGE_KIND.MEANING_PROMOTED_FROM_IDEA,
    sourceObject: sourceSnapshot(objectsById.get(edge.from) || { id: edge.from, projection: 'idea', objectKind: 'idea', objectId: edge.from, label: edge.from }),
    affectedObjects: [
      sourceSnapshot(objectsById.get(edge.to) || { id: edge.to, projection: 'meaning', objectKind: 'meaning', objectId: edge.to, label: edge.to }),
    ],
    crossProjectionCount: 2,
    hasCrossProjectionImpact: true,
  }));
  return sortCrossProjectionImpactItems([...originImpactItems, ...promotionImpactItems]);
}

function buildImpactPreview(coreState, projectId, capabilitySnapshot, meta, params) {
  const expectedCoreStateHash = normalizeString(params.expectedCoreStateHash || params.expectedRevisionHash);
  if (!expectedCoreStateHash) {
    throw createDerivedError(
      'E_CROSS_PROJECTION_EXPECTED_CORE_STATE_HASH_REQUIRED',
      VIEW_OP,
      'EXPECTED_CORE_STATE_HASH_REQUIRED',
      { projectId },
    );
  }
  if (expectedCoreStateHash !== meta.coreStateHash) {
    throw createDerivedError(
      'E_CROSS_PROJECTION_STALE_CORE_STATE_HASH',
      VIEW_OP,
      'STALE_CORE_STATE_HASH',
      {
        projectId,
        expectedCoreStateHash,
        actualCoreStateHash: meta.coreStateHash,
      },
    );
  }

  const plot = derivePlotProjection({ coreState, params: { projectId }, capabilitySnapshot });
  if (!plot.ok) sourceUnavailable('plot', plot);
  const idea = deriveIdeaProjection({ coreState, params: { projectId }, capabilitySnapshot });
  if (!idea.ok) sourceUnavailable('idea', idea);
  const meaning = deriveMeaningProjection({ coreState, params: { projectId }, capabilitySnapshot });
  if (!meaning.ok) sourceUnavailable('meaning', meaning);

  const originRefsByKey = new Map();
  const objectsById = new Map();
  const bindings = [];
  collectPlotBindings({ projectId, plotProjection: plot.value, originRefsByKey, objectsById, bindings });
  collectIdeaBindings({ projectId, ideaProjection: idea.value, originRefsByKey, objectsById, bindings });
  const meaningIdeaEdges = collectMeaningBindings({
    projectId,
    meaningProjection: meaning.value,
    ideaProjection: idea.value,
    originRefsByKey,
    objectsById,
    bindings,
  });
  const originRefs = sortCrossProjectionOriginRefs([...originRefsByKey.values()]);
  const objectNodes = sortCrossProjectionNodes([...objectsById.values()]);
  const canvasGraphPacket = createCanvasPacket({ originRefs, objectNodes, bindings, meaningIdeaEdges });
  const impactItems = createImpactItems({ originRefs, objectsById, meaningIdeaEdges });
  const sharedOriginRefCount = impactItems
    .filter((item) => item.relationKind === 'sharedOriginRef' && item.hasCrossProjectionImpact).length;
  const summary = {
    sourceProjectionCount: 3,
    originRefCount: originRefs.length,
    sharedOriginRefCount,
    relationImpactCount: meaningIdeaEdges.length,
    impactItemCount: impactItems.length,
    canvasNodeCount: canvasGraphPacket.summary.nodeCount,
    canvasEdgeCount: canvasGraphPacket.summary.edgeCount,
  };
  const previewHash = hashCanonicalValue({
    originRefs,
    impactItems,
    canvasGraphPacket,
    summary,
  });
  return {
    schemaVersion: CROSS_PROJECTION_IMPACT_PREVIEW_SCHEMA_VERSION,
    projectId,
    staleGuard: {
      state: 'matched',
      expectedCoreStateHash,
      actualCoreStateHash: meta.coreStateHash,
    },
    sourceProjections: {
      plotProjectionHash: plot.value.meta.projectionHash,
      ideaProjectionHash: idea.value.meta.projectionHash,
      meaningProjectionHash: meaning.value.meta.projectionHash,
    },
    originRefs,
    impactItems,
    canvasGraphPacket,
    authority: {
      sourceOfTruth: 'project.core via derived plot, idea, and meaning projections',
      commandAuthority: 'none',
      secondTruthStore: false,
      projectTruthMutation: false,
      storageMutation: false,
      networkMutation: false,
      rendererMutation: false,
    },
    summary,
    meta: {
      previewHash,
      invalidationKey: meta.invalidationKey,
    },
  };
}

export function deriveCrossProjectionImpactPreview(input = {}) {
  const projectId = normalizeString(input?.params?.projectId);
  if (!projectId) {
    return {
      ok: false,
      error: {
        code: 'E_CROSS_PROJECTION_PROJECT_ID_REQUIRED',
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
      if (!isCrossProjectionCapabilityEnabled(capabilitySnapshot)) {
        throw createDerivedError(
          'E_CAPABILITY_DISABLED_FOR_COMMAND',
          VIEW_OP,
          'CROSS_PROJECTION_IMPACT_PREVIEW_DISABLED',
          { capabilityId: 'crossProjection.impactPreview' },
        );
      }
      return buildImpactPreview(coreState, params.projectId, capabilitySnapshot, meta, params);
    },
  });
}

export { VIEW_ID as CROSS_PROJECTION_IMPACT_PREVIEW_VIEW_ID };
