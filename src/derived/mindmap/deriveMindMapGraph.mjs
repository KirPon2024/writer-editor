import { createDerivedError, deriveView, hashCanonicalValue } from '../deriveView.mjs';
import {
  canonicalizeMindMapGraph,
  MINDMAP_EDGE_KIND,
  MINDMAP_NODE_KIND,
} from './mindMapGraphTypes.mjs';

const VIEW_ID = 'derived.mindmap.graph.v1';

function normalizeProjectId(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isMindMapCapabilityEnabled(snapshot) {
  if (!isPlainObject(snapshot)) return true;
  if (snapshot['mindmap.view'] === false) return false;
  const capabilities = isPlainObject(snapshot.capabilities) ? snapshot.capabilities : {};
  if (capabilities['mindmap.view'] === false) return false;
  if (capabilities.mindmapView === false) return false;
  if (isPlainObject(capabilities.mindmap) && capabilities.mindmap.view === false) return false;
  return true;
}

function collectSceneHeadingNodes(sceneText, sceneNodeId, sceneId) {
  const lines = String(sceneText || '').split(/\r?\n/u);
  const headingNodes = [];
  const headingEdges = [];
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const match = line.match(/^\s{0,3}(#{1,6})\s+(.+)$/u);
    if (!match) continue;
    const depth = match[1].length;
    const label = match[2].trim();
    if (!label) continue;
    const nodeId = `heading:${sceneId}:${i}`;
    headingNodes.push({
      id: nodeId,
      label,
      kind: MINDMAP_NODE_KIND.HEADING,
      depth: depth + 1,
      parentId: sceneNodeId,
    });
    headingEdges.push({
      from: sceneNodeId,
      to: nodeId,
      kind: MINDMAP_EDGE_KIND.CONTAINS,
    });
  }
  return { headingNodes, headingEdges };
}

function buildMindMapGraph(coreState, projectId) {
  const projects = isPlainObject(coreState?.data?.projects) ? coreState.data.projects : {};
  const project = isPlainObject(projects[projectId]) ? projects[projectId] : null;
  if (!project) {
    throw createDerivedError(
      'E_DERIVED_PROJECT_NOT_FOUND',
      'derived.mindmap.graph',
      'PROJECT_NOT_FOUND',
      { projectId },
    );
  }

  const scenesObj = isPlainObject(project.scenes) ? project.scenes : {};
  const sceneIds = Object.keys(scenesObj).sort();

  const projectNodeId = `project:${projectId}`;
  const nodes = [{
    id: projectNodeId,
    label: typeof project.title === 'string' && project.title.trim() ? project.title.trim() : projectId,
    kind: MINDMAP_NODE_KIND.PROJECT,
    depth: 0,
  }];
  const edges = [];

  for (const sceneId of sceneIds) {
    const scene = isPlainObject(scenesObj[sceneId]) ? scenesObj[sceneId] : {};
    const sceneNodeId = `scene:${sceneId}`;
    nodes.push({
      id: sceneNodeId,
      label: sceneId,
      kind: MINDMAP_NODE_KIND.SCENE,
      depth: 1,
      parentId: projectNodeId,
    });
    edges.push({
      from: projectNodeId,
      to: sceneNodeId,
      kind: MINDMAP_EDGE_KIND.CONTAINS,
    });

    const headings = collectSceneHeadingNodes(scene.text, sceneNodeId, sceneId);
    nodes.push(...headings.headingNodes);
    edges.push(...headings.headingEdges);
  }

  return canonicalizeMindMapGraph({ nodes, edges });
}

export function deriveMindMapGraph(input = {}) {
  const projectId = normalizeProjectId(input?.params?.projectId);
  if (!projectId) {
    return {
      ok: false,
      error: {
        code: 'E_DERIVED_PROJECT_ID_REQUIRED',
        op: 'derived.mindmap.graph',
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
      if (!isMindMapCapabilityEnabled(capabilitySnapshot)) {
        throw createDerivedError(
          'E_CAPABILITY_DISABLED_FOR_COMMAND',
          'derived.mindmap.graph',
          'MINDMAP_VIEW_DISABLED',
          { capabilityId: 'mindmap.view' },
        );
      }
      const graph = buildMindMapGraph(coreState, params.projectId);
      const graphHash = hashCanonicalValue({
        nodes: graph.nodes,
        edges: graph.edges,
      });
      return {
        nodes: graph.nodes,
        edges: graph.edges,
        meta: {
          graphHash,
          invalidationKey: meta.invalidationKey,
        },
      };
    },
  });
}

export { VIEW_ID as MINDMAP_GRAPH_VIEW_ID };
