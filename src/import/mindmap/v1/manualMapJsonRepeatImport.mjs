import { hashCanonicalValue } from '../../../derived/deriveView.mjs';
import { deriveManualMapGraph } from '../../../derived/mindmap/deriveManualMapGraph.mjs';
import { hashCoreDomainEvents } from '../../../core/domainEvents.mjs';
import {
  MANUAL_MAP_EXPORT_FORMAT,
  MANUAL_MAP_EXPORT_SCHEMA_VERSION,
  serializeManualMapExportJsonV1WithLossReport,
} from '../../../export/mindmap/v1/index.mjs';

export const MANUAL_MAP_JSON_REPEAT_IMPORT_PLAN_SCHEMA_VERSION = 'manualMap.jsonRepeatImportPlan.v1';
export const MANUAL_MAP_JSON_REPEAT_IMPORT_RECEIPT_SCHEMA_VERSION = 'manualMap.jsonRepeatImportReceipt.v1';

const MANUAL_MAP_JSON_REPEAT_IMPORT_OP = 'manualMap.jsonRepeatImport';
const PATHLESS_ATTACHMENT_SOURCE_KEYS = Object.freeze(['byteLength', 'mediaType', 'name', 'sourceHash']);
const FORBIDDEN_PRIVATE_KEYS = Object.freeze([
  'absolutePath',
  'base64',
  'bytes',
  'content',
  'data',
  'filePath',
  'localPath',
  'path',
  'uri',
  'url',
]);

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function normalizePositiveInteger(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.max(0, Math.floor(number));
}

function typedFailure(code, reason, details = {}) {
  const error = { code, op: MANUAL_MAP_JSON_REPEAT_IMPORT_OP, reason };
  if (isPlainObject(details) && Object.keys(details).length > 0) error.details = cloneJson(details);
  return { ok: false, error };
}

function parsePayload(input) {
  const candidate = input.exportJson ?? input.exportPayload ?? input.payload;
  if (isPlainObject(candidate)) return { ok: true, value: cloneJson(candidate) };
  if (typeof candidate !== 'string') {
    return typedFailure('E_MANUAL_MAP_JSON_IMPORT_PAYLOAD_REQUIRED', 'PAYLOAD_REQUIRED');
  }
  try {
    const parsed = JSON.parse(candidate);
    if (!isPlainObject(parsed)) {
      return typedFailure('E_MANUAL_MAP_JSON_IMPORT_PAYLOAD_INVALID', 'PAYLOAD_INVALID');
    }
    return { ok: true, value: parsed };
  } catch {
    return typedFailure('E_MANUAL_MAP_JSON_IMPORT_JSON_INVALID', 'JSON_INVALID');
  }
}

function findForbiddenPrivateKey(value, path = '$') {
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      const found = findForbiddenPrivateKey(value[index], `${path}[${index}]`);
      if (found) return found;
    }
    return null;
  }
  if (!isPlainObject(value)) return null;
  for (const key of Object.keys(value)) {
    if (FORBIDDEN_PRIVATE_KEYS.includes(key)) return { key, path: `${path}.${key}` };
    const found = findForbiddenPrivateKey(value[key], `${path}.${key}`);
    if (found) return found;
  }
  return null;
}

function assertPathlessAttachmentSources(attachments) {
  for (const attachment of attachments) {
    const source = isPlainObject(attachment.source) ? attachment.source : {};
    const extraKeys = Object.keys(source).filter((key) => !PATHLESS_ATTACHMENT_SOURCE_KEYS.includes(key)).sort();
    if (extraKeys.length > 0) {
      return typedFailure('E_MANUAL_MAP_JSON_IMPORT_ATTACHMENT_SOURCE_NOT_PATHLESS', 'ATTACHMENT_SOURCE_NOT_PATHLESS', {
        attachmentId: normalizeText(attachment.id),
        extraKeys,
      });
    }
  }
  return { ok: true };
}

function normalizeNode(rawNode, index) {
  if (!isPlainObject(rawNode)) {
    return typedFailure('E_MANUAL_MAP_JSON_IMPORT_NODE_INVALID', 'NODE_INVALID', { index });
  }
  const id = normalizeText(rawNode.id);
  const label = normalizeText(rawNode.label);
  if (!id || !label) {
    return typedFailure('E_MANUAL_MAP_JSON_IMPORT_NODE_INVALID', 'NODE_INVALID', { index, id });
  }
  const position = isPlainObject(rawNode.position) ? rawNode.position : {};
  const target = isPlainObject(rawNode.target) ? rawNode.target : {};
  return {
    ok: true,
    value: {
      id,
      label,
      kind: normalizeText(rawNode.kind) || 'note',
      position: {
        x: normalizeNumber(position.x),
        y: normalizeNumber(position.y),
      },
      target: {
        kind: normalizeText(target.kind),
        id: normalizeText(target.id),
      },
    },
  };
}

function normalizeEdge(rawEdge, index, validNodeIds) {
  if (!isPlainObject(rawEdge)) {
    return typedFailure('E_MANUAL_MAP_JSON_IMPORT_EDGE_INVALID', 'EDGE_INVALID', { index });
  }
  const id = normalizeText(rawEdge.id);
  const from = normalizeText(rawEdge.from);
  const to = normalizeText(rawEdge.to);
  if (!id || !from || !to || from === to || !validNodeIds.has(from) || !validNodeIds.has(to)) {
    return typedFailure('E_MANUAL_MAP_JSON_IMPORT_EDGE_INVALID', 'EDGE_INVALID', { index, id, from, to });
  }
  return {
    ok: true,
    value: {
      id,
      from,
      to,
      kind: normalizeText(rawEdge.kind) || 'link',
      label: normalizeText(rawEdge.label),
    },
  };
}

function normalizeAttachment(rawAttachment, index, validNodeIds) {
  if (!isPlainObject(rawAttachment)) {
    return typedFailure('E_MANUAL_MAP_JSON_IMPORT_ATTACHMENT_INVALID', 'ATTACHMENT_INVALID', { index });
  }
  const id = normalizeText(rawAttachment.id);
  const nodeId = normalizeText(rawAttachment.nodeId);
  const label = normalizeText(rawAttachment.label);
  const source = isPlainObject(rawAttachment.source) ? rawAttachment.source : {};
  const sourceHash = normalizeText(source.sourceHash);
  if (!id || !nodeId || !validNodeIds.has(nodeId) || !label || !sourceHash) {
    return typedFailure('E_MANUAL_MAP_JSON_IMPORT_ATTACHMENT_INVALID', 'ATTACHMENT_INVALID', { index, id, nodeId });
  }
  return {
    ok: true,
    value: {
      id,
      nodeId,
      label,
      kind: normalizeText(rawAttachment.kind) || 'reference',
      source: {
        name: normalizeText(source.name),
        mediaType: normalizeText(source.mediaType),
        sourceHash,
        byteLength: normalizePositiveInteger(source.byteLength),
      },
      storedContent: false,
    },
  };
}

function normalizePortal(rawPortal, index, validNodeIds, sourceMapId, targetMapId) {
  if (!isPlainObject(rawPortal)) {
    return typedFailure('E_MANUAL_MAP_JSON_IMPORT_PORTAL_INVALID', 'PORTAL_INVALID', { index });
  }
  const id = normalizeText(rawPortal.id);
  const fromNodeId = normalizeText(rawPortal.fromNodeId);
  const target = isPlainObject(rawPortal.target) ? rawPortal.target : {};
  const rawTargetMapId = normalizeText(target.mapId);
  const portalTargetMapId = rawTargetMapId === sourceMapId ? targetMapId : rawTargetMapId;
  if (!id || !fromNodeId || !validNodeIds.has(fromNodeId) || !portalTargetMapId) {
    return typedFailure('E_MANUAL_MAP_JSON_IMPORT_PORTAL_INVALID', 'PORTAL_INVALID', {
      index,
      id,
      fromNodeId,
      targetMapId: portalTargetMapId,
    });
  }
  return {
    ok: true,
    value: {
      id,
      fromNodeId,
      target: {
        mapId: portalTargetMapId,
        nodeId: normalizeText(target.nodeId),
      },
      label: normalizeText(rawPortal.label) || 'Portal',
    },
  };
}

function normalizeTemplate(rawTemplate, index, validNodeIds, validEdgeIds) {
  if (!isPlainObject(rawTemplate)) {
    return typedFailure('E_MANUAL_MAP_JSON_IMPORT_TEMPLATE_INVALID', 'TEMPLATE_INVALID', { index });
  }
  const id = normalizeText(rawTemplate.id);
  const templateId = normalizeText(rawTemplate.templateId);
  const appliedNodeIds = Array.isArray(rawTemplate.appliedNodeIds)
    ? rawTemplate.appliedNodeIds.map(normalizeText).filter(Boolean).sort()
    : [];
  const appliedEdgeIds = Array.isArray(rawTemplate.appliedEdgeIds)
    ? rawTemplate.appliedEdgeIds.map(normalizeText).filter(Boolean).sort()
    : [];
  if (!id || !templateId || appliedNodeIds.length === 0) {
    return typedFailure('E_MANUAL_MAP_JSON_IMPORT_TEMPLATE_INVALID', 'TEMPLATE_INVALID', { index, id, templateId });
  }
  const unknownNodeId = appliedNodeIds.find((nodeId) => !validNodeIds.has(nodeId));
  const unknownEdgeId = appliedEdgeIds.find((edgeId) => !validEdgeIds.has(edgeId));
  if (unknownNodeId || unknownEdgeId) {
    return typedFailure('E_MANUAL_MAP_JSON_IMPORT_TEMPLATE_REFERENCE_INVALID', 'TEMPLATE_REFERENCE_INVALID', {
      index,
      id,
      unknownNodeId: unknownNodeId || '',
      unknownEdgeId: unknownEdgeId || '',
    });
  }
  return {
    ok: true,
    value: {
      id,
      templateId,
      name: normalizeText(rawTemplate.name) || 'Manual map template',
      appliedNodeIds,
      appliedEdgeIds,
    },
  };
}

function assertUnique(values, code, reason, detailKey) {
  const seen = new Set();
  for (const value of values) {
    if (seen.has(value)) return typedFailure(code, reason, { [detailKey]: value });
    seen.add(value);
  }
  return { ok: true };
}

function normalizePayload(payload, input) {
  if (payload.schemaVersion !== MANUAL_MAP_EXPORT_SCHEMA_VERSION || payload.format !== MANUAL_MAP_EXPORT_FORMAT) {
    return typedFailure('E_MANUAL_MAP_JSON_IMPORT_SCHEMA_INVALID', 'SCHEMA_INVALID', {
      schemaVersion: normalizeText(payload.schemaVersion),
      format: normalizeText(payload.format),
    });
  }
  const forbidden = findForbiddenPrivateKey(payload);
  if (forbidden) {
    return typedFailure('E_MANUAL_MAP_JSON_IMPORT_PRIVATE_DATA_REJECTED', 'PRIVATE_DATA_REJECTED', forbidden);
  }
  const sourceProjectId = normalizeText(payload.projectId);
  const sourceMapId = normalizeText(payload.mapId);
  const targetProjectId = normalizeText(input.targetProjectId) || normalizeText(input.projectId) || sourceProjectId;
  const targetMapId = normalizeText(input.targetMapId) || sourceMapId;
  const title = normalizeText(input.title) || normalizeText(payload.title) || targetMapId;
  if (!targetProjectId || !targetMapId) {
    return typedFailure('E_MANUAL_MAP_JSON_IMPORT_TARGET_REQUIRED', 'TARGET_REQUIRED', { targetProjectId, targetMapId });
  }

  const rawNodes = Array.isArray(payload.nodes) ? payload.nodes : [];
  const nodes = [];
  for (let index = 0; index < rawNodes.length; index += 1) {
    const node = normalizeNode(rawNodes[index], index);
    if (!node.ok) return node;
    nodes.push(node.value);
  }
  const uniqueNodes = assertUnique(nodes.map((node) => node.id), 'E_MANUAL_MAP_JSON_IMPORT_NODE_DUPLICATE', 'NODE_DUPLICATE', 'nodeId');
  if (!uniqueNodes.ok) return uniqueNodes;
  const validNodeIds = new Set(nodes.map((node) => node.id));

  const rawEdges = Array.isArray(payload.edges) ? payload.edges : [];
  const edges = [];
  for (let index = 0; index < rawEdges.length; index += 1) {
    const edge = normalizeEdge(rawEdges[index], index, validNodeIds);
    if (!edge.ok) return edge;
    edges.push(edge.value);
  }
  const uniqueEdges = assertUnique(edges.map((edge) => edge.id), 'E_MANUAL_MAP_JSON_IMPORT_EDGE_DUPLICATE', 'EDGE_DUPLICATE', 'edgeId');
  if (!uniqueEdges.ok) return uniqueEdges;
  const validEdgeIds = new Set(edges.map((edge) => edge.id));

  const rawAttachments = Array.isArray(payload.attachments) ? payload.attachments : [];
  const pathlessAttachments = assertPathlessAttachmentSources(rawAttachments);
  if (!pathlessAttachments.ok) return pathlessAttachments;
  const attachments = [];
  for (let index = 0; index < rawAttachments.length; index += 1) {
    const attachment = normalizeAttachment(rawAttachments[index], index, validNodeIds);
    if (!attachment.ok) return attachment;
    attachments.push(attachment.value);
  }
  const uniqueAttachments = assertUnique(
    attachments.map((attachment) => attachment.id),
    'E_MANUAL_MAP_JSON_IMPORT_ATTACHMENT_DUPLICATE',
    'ATTACHMENT_DUPLICATE',
    'attachmentId',
  );
  if (!uniqueAttachments.ok) return uniqueAttachments;

  const rawPortals = Array.isArray(payload.portals) ? payload.portals : [];
  const portals = [];
  for (let index = 0; index < rawPortals.length; index += 1) {
    const portal = normalizePortal(rawPortals[index], index, validNodeIds, sourceMapId, targetMapId);
    if (!portal.ok) return portal;
    portals.push(portal.value);
  }
  const uniquePortals = assertUnique(portals.map((portal) => portal.id), 'E_MANUAL_MAP_JSON_IMPORT_PORTAL_DUPLICATE', 'PORTAL_DUPLICATE', 'portalId');
  if (!uniquePortals.ok) return uniquePortals;

  const rawTemplates = Array.isArray(payload.templates) ? payload.templates : [];
  const templates = [];
  for (let index = 0; index < rawTemplates.length; index += 1) {
    const template = normalizeTemplate(rawTemplates[index], index, validNodeIds, validEdgeIds);
    if (!template.ok) return template;
    templates.push(template.value);
  }
  const uniqueTemplates = assertUnique(
    templates.map((template) => template.id),
    'E_MANUAL_MAP_JSON_IMPORT_TEMPLATE_DUPLICATE',
    'TEMPLATE_DUPLICATE',
    'templateInstanceId',
  );
  if (!uniqueTemplates.ok) return uniqueTemplates;

  const templateNodeOwner = new Map();
  for (const template of templates) {
    for (const nodeId of template.appliedNodeIds) {
      if (templateNodeOwner.has(nodeId)) {
        return typedFailure('E_MANUAL_MAP_JSON_IMPORT_TEMPLATE_NODE_DUPLICATE', 'TEMPLATE_NODE_DUPLICATE', {
          nodeId,
          firstTemplateId: templateNodeOwner.get(nodeId),
          secondTemplateId: template.id,
        });
      }
      templateNodeOwner.set(nodeId, template.id);
    }
  }
  const templateEdgeOwner = new Map();
  for (const template of templates) {
    for (const edgeId of template.appliedEdgeIds) {
      if (templateEdgeOwner.has(edgeId)) {
        return typedFailure('E_MANUAL_MAP_JSON_IMPORT_TEMPLATE_EDGE_DUPLICATE', 'TEMPLATE_EDGE_DUPLICATE', {
          edgeId,
          firstTemplateId: templateEdgeOwner.get(edgeId),
          secondTemplateId: template.id,
        });
      }
      templateEdgeOwner.set(edgeId, template.id);
    }
  }

  const graph = {
    projectId: targetProjectId,
    mapId: targetMapId,
    title,
    nodes: nodes.sort((a, b) => a.id.localeCompare(b.id)),
    edges: edges.sort((a, b) => a.id.localeCompare(b.id)),
    attachments: attachments.sort((a, b) => a.id.localeCompare(b.id)),
    portals: portals.sort((a, b) => a.id.localeCompare(b.id)),
    templates: templates.sort((a, b) => a.id.localeCompare(b.id)),
  };
  return {
    ok: true,
    value: {
      sourceProjectId,
      sourceMapId,
      targetProjectId,
      targetMapId,
      title,
      graph,
      sourceGraphHash: normalizeText(payload.recovery?.graphHash) || '',
      targetGraphHash: hashCanonicalValue(graph),
      templateNodeOwner,
      templateEdgeOwner,
    },
  };
}

function getProject(state, projectId) {
  const projects = isPlainObject(state?.data?.projects) ? state.data.projects : {};
  return isPlainObject(projects[projectId]) ? projects[projectId] : null;
}

function getManualMaps(project) {
  return isPlainObject(project?.manualMaps?.maps) ? project.manualMaps.maps : {};
}

function buildCommandPlan(normalized, initialState) {
  const project = getProject(initialState, normalized.targetProjectId);
  if (!project) {
    return typedFailure('E_MANUAL_MAP_JSON_IMPORT_PROJECT_NOT_FOUND', 'PROJECT_NOT_FOUND', {
      targetProjectId: normalized.targetProjectId,
    });
  }
  const maps = getManualMaps(project);
  if (isPlainObject(maps[normalized.targetMapId])) {
    return typedFailure('E_MANUAL_MAP_JSON_IMPORT_TARGET_MAP_EXISTS', 'TARGET_MAP_EXISTS', {
      targetProjectId: normalized.targetProjectId,
      targetMapId: normalized.targetMapId,
    });
  }

  const commands = [{
    type: 'manualMap.create',
    payload: {
      projectId: normalized.targetProjectId,
      mapId: normalized.targetMapId,
      title: normalized.title,
    },
  }];

  const externalPortalTargets = new Map();
  for (const portal of normalized.graph.portals) {
    const targetMapId = portal.target.mapId;
    const targetNodeId = portal.target.nodeId;
    if (targetMapId === normalized.targetMapId) continue;
    if (!externalPortalTargets.has(targetMapId)) externalPortalTargets.set(targetMapId, new Set());
    if (targetNodeId) externalPortalTargets.get(targetMapId).add(targetNodeId);
  }
  for (const [targetMapId, targetNodeIds] of [...externalPortalTargets.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    const targetMap = isPlainObject(maps[targetMapId]) ? maps[targetMapId] : null;
    if (!targetMap) {
      commands.push({
        type: 'manualMap.create',
        payload: {
          projectId: normalized.targetProjectId,
          mapId: targetMapId,
          title: targetMapId,
        },
      });
    }
    const targetNodes = isPlainObject(targetMap?.nodes) ? targetMap.nodes : {};
    for (const targetNodeId of [...targetNodeIds].sort()) {
      if (!targetMap || !isPlainObject(targetNodes[targetNodeId])) {
        if (targetMap) {
          return typedFailure('E_MANUAL_MAP_JSON_IMPORT_PORTAL_TARGET_NODE_MISSING', 'PORTAL_TARGET_NODE_MISSING', {
            targetProjectId: normalized.targetProjectId,
            targetMapId,
            targetNodeId,
          });
        }
        commands.push({
          type: 'manualMap.node.add',
          payload: {
            projectId: normalized.targetProjectId,
            mapId: targetMapId,
            nodeId: targetNodeId,
            label: targetNodeId,
            position: { x: 0, y: 0 },
          },
        });
      }
    }
  }

  const templateNodeIds = new Set(normalized.templateNodeOwner.keys());
  const templateEdgeIds = new Set(normalized.templateEdgeOwner.keys());
  for (const node of normalized.graph.nodes.filter((item) => !templateNodeIds.has(item.id))) {
    commands.push({
      type: 'manualMap.node.add',
      payload: {
        projectId: normalized.targetProjectId,
        mapId: normalized.targetMapId,
        nodeId: node.id,
        label: node.label,
        nodeKind: node.kind,
        position: node.position,
        targetKind: node.target.kind,
        targetId: node.target.id,
      },
    });
  }

  const nodesById = new Map(normalized.graph.nodes.map((node) => [node.id, node]));
  const edgesById = new Map(normalized.graph.edges.map((edge) => [edge.id, edge]));
  for (const template of normalized.graph.templates) {
    commands.push({
      type: 'manualMap.template.apply',
      payload: {
        projectId: normalized.targetProjectId,
        mapId: normalized.targetMapId,
        templateInstanceId: template.id,
        templateId: template.templateId,
        templateName: template.name,
        nodes: template.appliedNodeIds.map((nodeId) => {
          const node = nodesById.get(nodeId);
          return {
            nodeId: node.id,
            label: node.label,
            nodeKind: node.kind,
            position: node.position,
            targetKind: node.target.kind,
            targetId: node.target.id,
          };
        }),
        edges: template.appliedEdgeIds.map((edgeId) => {
          const edge = edgesById.get(edgeId);
          return {
            edgeId: edge.id,
            fromNodeId: edge.from,
            toNodeId: edge.to,
            edgeKind: edge.kind,
            label: edge.label,
          };
        }),
      },
    });
  }

  for (const edge of normalized.graph.edges.filter((item) => !templateEdgeIds.has(item.id))) {
    commands.push({
      type: 'manualMap.edge.add',
      payload: {
        projectId: normalized.targetProjectId,
        mapId: normalized.targetMapId,
        edgeId: edge.id,
        fromNodeId: edge.from,
        toNodeId: edge.to,
        edgeKind: edge.kind,
        label: edge.label,
      },
    });
  }
  for (const attachment of normalized.graph.attachments) {
    commands.push({
      type: 'manualMap.attachment.add',
      payload: {
        projectId: normalized.targetProjectId,
        mapId: normalized.targetMapId,
        nodeId: attachment.nodeId,
        attachmentId: attachment.id,
        label: attachment.label,
        attachmentKind: attachment.kind,
        source: attachment.source,
      },
    });
  }
  for (const portal of normalized.graph.portals) {
    commands.push({
      type: 'manualMap.portal.add',
      payload: {
        projectId: normalized.targetProjectId,
        mapId: normalized.targetMapId,
        portalId: portal.id,
        fromNodeId: portal.fromNodeId,
        targetMapId: portal.target.mapId,
        targetNodeId: portal.target.nodeId,
        label: portal.label,
      },
    });
  }

  const commandPlan = {
    schemaVersion: MANUAL_MAP_JSON_REPEAT_IMPORT_PLAN_SCHEMA_VERSION,
    projectId: normalized.targetProjectId,
    mapId: normalized.targetMapId,
    commandAuthority: 'CommandKernel',
    commands,
    expectedGraphHash: normalized.targetGraphHash,
    sourceGraphHash: normalized.sourceGraphHash,
    directCoreMutation: false,
    storageMutation: false,
    networkMutation: false,
  };
  return {
    ok: true,
    value: {
      ...commandPlan,
      meta: {
        planHash: hashCanonicalValue(commandPlan),
      },
    },
  };
}

export function buildManualMapJsonRepeatImportPlan(input = {}) {
  const parsed = parsePayload(input);
  if (!parsed.ok) return parsed;
  const normalized = normalizePayload(parsed.value, input);
  if (!normalized.ok) return normalized;
  const initialState = isPlainObject(input.initialState) ? input.initialState : input.coreState;
  if (!isPlainObject(initialState)) {
    return typedFailure('E_MANUAL_MAP_JSON_IMPORT_STATE_REQUIRED', 'STATE_REQUIRED', {
      targetProjectId: normalized.value.targetProjectId,
      targetMapId: normalized.value.targetMapId,
    });
  }
  return buildCommandPlan(normalized.value, initialState);
}

function normalizeCommandReceipt(result, command, commandIndex) {
  const stateHash = normalizeText(result?.stateHash) || (
    isPlainObject(result?.state) ? hashCanonicalValue(result.state) : ''
  );
  const domainEvents = Array.isArray(result?.events) ? result.events.map(cloneJson) : [];
  return {
    commandIndex,
    commandType: normalizeText(command.type),
    ok: result?.ok === true,
    stateHash,
    domainEvents,
    domainEventDigest: hashCoreDomainEvents(domainEvents),
  };
}

function normalizeGraphForHash(graph) {
  return {
    projectId: normalizeText(graph.projectId),
    mapId: normalizeText(graph.mapId),
    title: normalizeText(graph.title),
    nodes: Array.isArray(graph.nodes)
      ? graph.nodes
        .map((node) => ({
          id: normalizeText(node.id),
          label: normalizeText(node.label),
          kind: normalizeText(node.kind) || 'note',
          position: {
            x: normalizeNumber(node.position?.x),
            y: normalizeNumber(node.position?.y),
          },
          target: {
            kind: normalizeText(node.target?.kind),
            id: normalizeText(node.target?.id),
          },
        }))
        .sort((a, b) => a.id.localeCompare(b.id))
      : [],
    edges: Array.isArray(graph.edges)
      ? graph.edges
        .map((edge) => ({
          id: normalizeText(edge.id),
          from: normalizeText(edge.from),
          to: normalizeText(edge.to),
          kind: normalizeText(edge.kind) || 'link',
          label: normalizeText(edge.label),
        }))
        .sort((a, b) => a.id.localeCompare(b.id))
      : [],
    attachments: Array.isArray(graph.attachments)
      ? graph.attachments.map(cloneJson).sort((a, b) => normalizeText(a.id).localeCompare(normalizeText(b.id)))
      : [],
    portals: Array.isArray(graph.portals)
      ? graph.portals.map(cloneJson).sort((a, b) => normalizeText(a.id).localeCompare(normalizeText(b.id)))
      : [],
    templates: Array.isArray(graph.templates)
      ? graph.templates.map(cloneJson).sort((a, b) => normalizeText(a.id).localeCompare(normalizeText(b.id)))
      : [],
  };
}

export async function applyManualMapJsonRepeatImportViaCommandKernel(input = {}) {
  const parsed = parsePayload(input);
  if (!parsed.ok) return parsed;
  const normalized = normalizePayload(parsed.value, input);
  if (!normalized.ok) return normalized;
  const initialState = isPlainObject(input.initialState) ? input.initialState : input.coreState;
  if (!isPlainObject(initialState)) {
    return typedFailure('E_MANUAL_MAP_JSON_IMPORT_STATE_REQUIRED', 'STATE_REQUIRED', {
      targetProjectId: normalized.value.targetProjectId,
      targetMapId: normalized.value.targetMapId,
    });
  }
  const plan = buildCommandPlan(normalized.value, initialState);
  if (!plan.ok) return plan;
  const commandExecutor = input.commandExecutor;
  if (typeof commandExecutor !== 'function') {
    return typedFailure('E_MANUAL_MAP_JSON_IMPORT_COMMAND_EXECUTOR_REQUIRED', 'COMMAND_EXECUTOR_REQUIRED', {
      targetProjectId: normalized.value.targetProjectId,
      targetMapId: normalized.value.targetMapId,
    });
  }

  let currentState = cloneJson(initialState);
  const commandReceipts = [];
  const commands = plan.value.commands.map(cloneJson);
  for (let commandIndex = 0; commandIndex < commands.length; commandIndex += 1) {
    const command = commands[commandIndex];
    const result = await commandExecutor(cloneJson(command), {
      commandIndex,
      state: currentState,
      projectId: normalized.value.targetProjectId,
      mapId: normalized.value.targetMapId,
      commandAuthority: 'CommandKernel',
      planHash: plan.value.meta.planHash,
    });
    commandReceipts.push(normalizeCommandReceipt(result, command, commandIndex));
    if (!result || result.ok !== true || !isPlainObject(result.state)) {
      return typedFailure('E_MANUAL_MAP_JSON_IMPORT_COMMAND_APPLY_FAILED', 'COMMAND_APPLY_FAILED', {
        commandIndex,
        commandType: normalizeText(command.type),
        commandError: isPlainObject(result?.error) ? result.error : null,
        commandReceipts,
      });
    }
    currentState = cloneJson(result.state);
  }

  const deriveGraph = typeof input.deriveGraph === 'function' ? input.deriveGraph : deriveManualMapGraph;
  const derived = deriveGraph({
    coreState: currentState,
    params: {
      projectId: normalized.value.targetProjectId,
      mapId: normalized.value.targetMapId,
    },
    capabilitySnapshot: input.capabilitySnapshot || { platformId: 'node', capabilities: { manualMapView: true } },
  });
  if (!derived || derived.ok !== true) {
    return typedFailure('E_MANUAL_MAP_JSON_IMPORT_REOPEN_DERIVE_FAILED', 'REOPEN_DERIVE_FAILED', {
      targetProjectId: normalized.value.targetProjectId,
      targetMapId: normalized.value.targetMapId,
      deriveError: isPlainObject(derived?.error) ? derived.error : null,
    });
  }
  const actualGraph = normalizeGraphForHash(derived.value);
  const actualGraphHash = hashCanonicalValue(actualGraph);
  if (actualGraphHash !== normalized.value.targetGraphHash) {
    return typedFailure('E_MANUAL_MAP_JSON_IMPORT_REOPEN_GRAPH_MISMATCH', 'REOPEN_GRAPH_MISMATCH', {
      targetProjectId: normalized.value.targetProjectId,
      targetMapId: normalized.value.targetMapId,
      expectedGraphHash: normalized.value.targetGraphHash,
      actualGraphHash,
    });
  }

  const repeatExport = serializeManualMapExportJsonV1WithLossReport(derived.value);
  if (repeatExport.lossReport.count !== 0) {
    return typedFailure('E_MANUAL_MAP_JSON_IMPORT_REPEAT_EXPORT_LOSS', 'REPEAT_EXPORT_LOSS', {
      lossCount: repeatExport.lossReport.count,
    });
  }
  const repeatPayload = JSON.parse(repeatExport.json);
  const repeatGraphHash = normalizeText(repeatPayload.recovery?.graphHash);
  if (repeatGraphHash !== normalized.value.targetGraphHash) {
    return typedFailure('E_MANUAL_MAP_JSON_IMPORT_REPEAT_EXPORT_HASH_MISMATCH', 'REPEAT_EXPORT_HASH_MISMATCH', {
      expectedGraphHash: normalized.value.targetGraphHash,
      repeatGraphHash,
    });
  }

  const domainEvents = commandReceipts.flatMap((receiptEntry) => receiptEntry.domainEvents);
  const domainEventDigest = hashCoreDomainEvents(domainEvents);
  const receipt = {
    schemaVersion: MANUAL_MAP_JSON_REPEAT_IMPORT_RECEIPT_SCHEMA_VERSION,
    projectId: normalized.value.targetProjectId,
    mapId: normalized.value.targetMapId,
    sourceProjectId: normalized.value.sourceProjectId,
    sourceMapId: normalized.value.sourceMapId,
    commandAuthority: 'CommandKernel',
    commandPlanHash: plan.value.meta.planHash,
    appliedCommandCount: commandReceipts.length,
    commandReceipts,
    domainEvents,
    domainEventDigest,
    expectedGraphHash: normalized.value.targetGraphHash,
    actualGraphHash,
    repeatExportGraphHash: repeatGraphHash,
    repeatExportLossCount: repeatExport.lossReport.count,
    directCoreMutation: false,
    storageMutation: false,
    networkMutation: false,
    rendererMutation: false,
    projectTruthMutation: true,
  };
  return {
    ok: true,
    value: {
      ...receipt,
      state: currentState,
      repeatExportJson: repeatExport.json,
      meta: {
        importHash: hashCanonicalValue(receipt),
        stateHash: hashCanonicalValue(currentState),
      },
    },
  };
}
