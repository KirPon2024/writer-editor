import { createDerivedError, deriveView, hashCanonicalValue } from '../deriveView.mjs';
import { deriveAtlasMentionIndex } from '../atlas/deriveAtlasMentionIndex.mjs';
import { ATLAS_TRUST_STATES } from '../atlas/atlasMentionTypes.mjs';
import {
  PLOT_EDGE_KIND,
  PLOT_NODE_KIND,
  PLOT_ORIGIN_REF_SCHEMA_VERSION,
  PLOT_PROJECTION_SCHEMA_VERSION,
  PLOT_SEQUENCE_LAYOUT_SCHEMA_VERSION,
  sortPlotEdges,
  sortPlotNodes,
  sortPlotOriginRefs,
} from './plotProjectionTypes.mjs';

const VIEW_ID = PLOT_PROJECTION_SCHEMA_VERSION;
const VIEW_OP = 'derived.plot.projection';
const SCENE_X_STEP = 240;
const LANE_Y_STEP = 84;

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizeString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function safeIdPart(value) {
  return String(value || '')
    .replace(/[^a-zA-Z0-9:_-]+/gu, '-')
    .replace(/^-+|-+$/gu, '') || 'ref';
}

function isPlotProjectionCapabilityEnabled(snapshot) {
  if (!isPlainObject(snapshot)) return true;
  if (snapshot['plot.projection'] === false) return false;
  const capabilities = isPlainObject(snapshot.capabilities) ? snapshot.capabilities : {};
  if (capabilities['plot.projection'] === false) return false;
  if (capabilities.plotProjection === false) return false;
  if (isPlainObject(capabilities.plot) && capabilities.plot.projection === false) return false;
  return true;
}

function getProject(coreState, projectId) {
  const projects = isPlainObject(coreState?.data?.projects) ? coreState.data.projects : {};
  return isPlainObject(projects[projectId]) ? projects[projectId] : null;
}

function getSceneText(scene) {
  return typeof scene?.text === 'string' ? scene.text : '';
}

function collectLinesWithOffsets(text) {
  const source = String(text || '');
  const lines = [];
  let cursor = 0;
  const pattern = /([^\r\n]*)(\r\n|\n|\r|$)/gu;
  let match = pattern.exec(source);
  while (match) {
    const line = match[1] || '';
    const terminator = match[2] || '';
    if (line.length > 0 || terminator || cursor < source.length) {
      lines.push({
        line,
        startOffset: cursor,
        endOffset: cursor + line.length,
      });
    }
    cursor += line.length + terminator.length;
    if (!terminator) break;
    match = pattern.exec(source);
  }
  return lines;
}

function createOriginRef({ projectId, sceneId, kind, startOffset, endOffset, sourceHash, ordinal, targetId }) {
  const refHash = hashCanonicalValue({
    projectId,
    sceneId,
    kind,
    startOffset,
    endOffset,
    sourceHash,
    ordinal,
    targetId,
  });
  return {
    schemaVersion: PLOT_ORIGIN_REF_SCHEMA_VERSION,
    refId: `plot-origin:${refHash}`,
    kind,
    projectId,
    sceneId,
    startOffset,
    endOffset,
    sourceHash,
    targetId,
  };
}

function collectHeadingRefs({ projectId, sceneId, sceneText, sceneHash }) {
  const lines = collectLinesWithOffsets(sceneText);
  const refs = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const match = line.line.match(/^\s{0,3}(#{1,6})\s+(.+)$/u);
    if (!match) continue;
    const title = match[2].trim();
    if (!title) continue;
    const depth = match[1].length;
    const nodeId = `plot-heading:${safeIdPart(sceneId)}:${index}`;
    refs.push({
      nodeId,
      label: title,
      depth,
      lineIndex: index,
      originRef: createOriginRef({
        projectId,
        sceneId,
        kind: 'sceneHeadingRange',
        startOffset: line.startOffset,
        endOffset: line.endOffset,
        sourceHash: sceneHash,
        ordinal: index,
        targetId: nodeId,
      }),
    });
  }
  return refs;
}

function buildConfirmedDecisionLookup(project) {
  const decisions = isPlainObject(project?.atlas?.decisions) ? project.atlas.decisions : {};
  const byMentionId = new Map();
  const byAnchorId = new Map();
  for (const decisionId of Object.keys(decisions).sort()) {
    const decision = isPlainObject(decisions[decisionId]) ? decisions[decisionId] : {};
    if (decision.decisionKind !== 'mention.confirm') continue;
    if (decision.trustState !== ATLAS_TRUST_STATES.AUTHOR_CONFIRMED) continue;
    const mentionId = normalizeString(decision.mentionId);
    const anchorId = normalizeString(decision.evidenceAnchor?.anchorId);
    const normalized = {
      decisionId: normalizeString(decision.id) || decisionId,
      trustState: ATLAS_TRUST_STATES.AUTHOR_CONFIRMED,
      createdByCommandSeq: Number.isInteger(decision.createdByCommandSeq) ? decision.createdByCommandSeq : 0,
    };
    if (mentionId) byMentionId.set(mentionId, normalized);
    if (anchorId) byAnchorId.set(anchorId, normalized);
  }
  return { byMentionId, byAnchorId };
}

function deriveOccurrenceEvidence({ coreState, project, projectId, capabilitySnapshot }) {
  const mentionIndex = deriveAtlasMentionIndex({
    coreState,
    params: { projectId },
    capabilitySnapshot,
  });
  if (!mentionIndex.ok) {
    return {
      state: 'unavailable',
      unavailableReason: mentionIndex.error?.code || 'E_ATLAS_MENTION_INDEX_UNAVAILABLE',
      occurrenceEvidence: [],
      confirmedMentions: [],
    };
  }

  const lookup = buildConfirmedDecisionLookup(project);
  const occurrenceEvidence = [];
  const confirmedMentions = [];
  const mentions = Array.isArray(mentionIndex.value?.mentions) ? mentionIndex.value.mentions : [];
  for (const mention of mentions) {
    const mentionId = normalizeString(mention.mentionId);
    const anchorId = normalizeString(mention.evidenceAnchor?.anchorId);
    const decision = lookup.byMentionId.get(mentionId) || lookup.byAnchorId.get(anchorId) || null;
    const trustState = decision ? ATLAS_TRUST_STATES.AUTHOR_CONFIRMED : ATLAS_TRUST_STATES.ALGORITHMIC_OBSERVATION;
    const evidence = {
      mentionId,
      projectId,
      sceneId: normalizeString(mention.sceneId),
      entityId: normalizeString(mention.entityId),
      termId: normalizeString(mention.termId),
      startOffset: Number.isInteger(mention.startOffset) ? mention.startOffset : 0,
      endOffset: Number.isInteger(mention.endOffset) ? mention.endOffset : 0,
      trustState,
      anchorId,
      sceneTextHash: normalizeString(mention.evidenceAnchor?.sceneTextHash),
      quoteHash: normalizeString(mention.evidenceAnchor?.quoteHash),
    };
    if (decision) {
      evidence.decisionId = decision.decisionId;
      evidence.createdByCommandSeq = decision.createdByCommandSeq;
      confirmedMentions.push(evidence);
    }
    occurrenceEvidence.push(evidence);
  }
  return {
    state: 'available',
    occurrenceEvidence,
    confirmedMentions,
  };
}

function createLayout(nodeId, sequenceIndex, laneIndex) {
  return {
    nodeId,
    schemaVersion: PLOT_SEQUENCE_LAYOUT_SCHEMA_VERSION,
    x: sequenceIndex * SCENE_X_STEP,
    y: laneIndex * LANE_Y_STEP,
  };
}

function buildPlotProjection(coreState, projectId, capabilitySnapshot, meta) {
  const project = getProject(coreState, projectId);
  if (!project) {
    throw createDerivedError(
      'E_PLOT_PROJECT_NOT_FOUND',
      VIEW_OP,
      'PROJECT_NOT_FOUND',
      { projectId },
    );
  }

  const nodes = [];
  const edges = [];
  const originRefs = [];
  const layout = [];
  const projectNodeId = `plot-project:${safeIdPart(projectId)}`;
  nodes.push({
    id: projectNodeId,
    kind: PLOT_NODE_KIND.PROJECT,
    label: normalizeString(project.title) || projectId,
    sequenceIndex: 0,
    laneIndex: 0,
  });
  layout.push(createLayout(projectNodeId, 0, 0));

  const scenes = isPlainObject(project.scenes) ? project.scenes : {};
  const sceneIds = Object.keys(scenes).sort();
  const occurrence = deriveOccurrenceEvidence({ coreState, project, projectId, capabilitySnapshot });
  const confirmedByScene = new Map();
  for (const evidence of occurrence.confirmedMentions) {
    const sceneId = normalizeString(evidence.sceneId);
    if (!confirmedByScene.has(sceneId)) confirmedByScene.set(sceneId, []);
    confirmedByScene.get(sceneId).push(evidence);
  }

  let headingCount = 0;
  let confirmedMentionCount = 0;
  for (let sceneIndex = 0; sceneIndex < sceneIds.length; sceneIndex += 1) {
    const sceneId = sceneIds[sceneIndex];
    const scene = isPlainObject(scenes[sceneId]) ? scenes[sceneId] : {};
    const sceneText = getSceneText(scene);
    const sceneHash = hashCanonicalValue(sceneText);
    const sceneNodeId = `plot-scene:${safeIdPart(sceneId)}`;
    const sceneOriginRef = createOriginRef({
      projectId,
      sceneId,
      kind: 'scene',
      startOffset: 0,
      endOffset: sceneText.length,
      sourceHash: sceneHash,
      ordinal: sceneIndex,
      targetId: sceneNodeId,
    });
    nodes.push({
      id: sceneNodeId,
      kind: PLOT_NODE_KIND.SCENE,
      label: sceneId,
      sequenceIndex: sceneIndex + 1,
      laneIndex: 1,
      parentId: projectNodeId,
      originRefId: sceneOriginRef.refId,
    });
    edges.push({ from: projectNodeId, to: sceneNodeId, kind: PLOT_EDGE_KIND.CONTAINS });
    originRefs.push(sceneOriginRef);
    layout.push(createLayout(sceneNodeId, sceneIndex + 1, 1));

    const headings = collectHeadingRefs({ projectId, sceneId, sceneText, sceneHash });
    for (let headingIndex = 0; headingIndex < headings.length; headingIndex += 1) {
      const heading = headings[headingIndex];
      headingCount += 1;
      nodes.push({
        id: heading.nodeId,
        kind: PLOT_NODE_KIND.HEADING,
        label: heading.label,
        depth: heading.depth,
        sequenceIndex: sceneIndex + 1,
        laneIndex: headingIndex + 2,
        parentId: sceneNodeId,
        originRefId: heading.originRef.refId,
      });
      edges.push({ from: sceneNodeId, to: heading.nodeId, kind: PLOT_EDGE_KIND.CONTAINS });
      originRefs.push(heading.originRef);
      layout.push(createLayout(heading.nodeId, sceneIndex + 1, headingIndex + 2));
    }

    const confirmed = [...(confirmedByScene.get(sceneId) || [])].sort((a, b) => {
      if (a.startOffset !== b.startOffset) return a.startOffset - b.startOffset;
      if (a.endOffset !== b.endOffset) return a.endOffset - b.endOffset;
      return a.mentionId.localeCompare(b.mentionId, 'en', { sensitivity: 'variant' });
    });
    for (let mentionIndex = 0; mentionIndex < confirmed.length; mentionIndex += 1) {
      const evidence = confirmed[mentionIndex];
      const nodeId = `plot-atlas-mention:${safeIdPart(evidence.mentionId)}`;
      const mentionOriginRef = createOriginRef({
        projectId,
        sceneId,
        kind: 'atlasMentionRange',
        startOffset: evidence.startOffset,
        endOffset: evidence.endOffset,
        sourceHash: evidence.sceneTextHash,
        ordinal: mentionIndex,
        targetId: nodeId,
      });
      confirmedMentionCount += 1;
      nodes.push({
        id: nodeId,
        kind: PLOT_NODE_KIND.ATLAS_MENTION,
        label: evidence.entityId,
        entityId: evidence.entityId,
        mentionId: evidence.mentionId,
        trustState: evidence.trustState,
        decisionId: evidence.decisionId,
        sequenceIndex: sceneIndex + 1,
        laneIndex: headings.length + mentionIndex + 2,
        parentId: sceneNodeId,
        originRefId: mentionOriginRef.refId,
      });
      edges.push({ from: sceneNodeId, to: nodeId, kind: PLOT_EDGE_KIND.OCCURS_IN });
      originRefs.push(mentionOriginRef);
      layout.push(createLayout(nodeId, sceneIndex + 1, headings.length + mentionIndex + 2));
    }
  }

  const sortedNodes = sortPlotNodes(nodes);
  const sortedEdges = sortPlotEdges(edges);
  const sortedOriginRefs = sortPlotOriginRefs(originRefs);
  const sortedLayout = [...layout].sort((a, b) => a.nodeId.localeCompare(b.nodeId, 'en', { sensitivity: 'variant' }));
  const summary = {
    sceneCount: sceneIds.length,
    headingCount,
    occurrenceEvidenceState: occurrence.state,
    algorithmicMentionCount: occurrence.occurrenceEvidence
      .filter((item) => item.trustState === ATLAS_TRUST_STATES.ALGORITHMIC_OBSERVATION).length,
    confirmedMentionCount,
    originRefCount: sortedOriginRefs.length,
  };
  const projectionHash = hashCanonicalValue({
    nodes: sortedNodes,
    edges: sortedEdges,
    originRefs: sortedOriginRefs,
    layout: sortedLayout,
    summary,
  });

  return {
    schemaVersion: PLOT_PROJECTION_SCHEMA_VERSION,
    projectId,
    nodes: sortedNodes,
    edges: sortedEdges,
    originRefs: sortedOriginRefs,
    sequenceLayout: {
      schemaVersion: PLOT_SEQUENCE_LAYOUT_SCHEMA_VERSION,
      orientation: 'left-to-right',
      nodes: sortedLayout,
    },
    occurrenceEvidence: occurrence.occurrenceEvidence,
    occurrenceEvidenceState: occurrence.state,
    unavailableReason: occurrence.unavailableReason || '',
    authority: {
      sourceOfTruth: 'project.core',
      commandAuthority: 'none',
      projectTruthMutation: false,
      storageMutation: false,
      networkMutation: false,
      rendererMutation: false,
    },
    summary,
    meta: {
      projectionHash,
      invalidationKey: meta.invalidationKey,
    },
  };
}

export function derivePlotProjection(input = {}) {
  const projectId = normalizeString(input?.params?.projectId);
  if (!projectId) {
    return {
      ok: false,
      error: {
        code: 'E_PLOT_PROJECT_ID_REQUIRED',
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
      if (!isPlotProjectionCapabilityEnabled(capabilitySnapshot)) {
        throw createDerivedError(
          'E_CAPABILITY_DISABLED_FOR_COMMAND',
          VIEW_OP,
          'PLOT_PROJECTION_DISABLED',
          { capabilityId: 'plot.projection' },
        );
      }
      return buildPlotProjection(coreState, params.projectId, capabilitySnapshot, meta);
    },
  });
}

export { VIEW_ID as PLOT_PROJECTION_VIEW_ID };
