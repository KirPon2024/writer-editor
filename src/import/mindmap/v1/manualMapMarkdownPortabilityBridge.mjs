import { hashCanonicalValue } from '../../../derived/deriveView.mjs';
import {
  MANUAL_MAP_EXPORT_FORMAT,
  MANUAL_MAP_EXPORT_SCHEMA_VERSION,
  serializeManualMapExportJsonV1WithLossReport,
} from '../../../export/mindmap/v1/index.mjs';
import {
  applyManualMapJsonRepeatImportViaCommandKernel,
  buildManualMapJsonRepeatImportPlan,
} from './manualMapJsonRepeatImport.mjs';

export const MANUAL_MAP_MARKDOWN_PORTABILITY_BRIDGE_SCHEMA_VERSION = 'manualMap.markdownPortabilityBridge.v1';
export const MANUAL_MAP_MARKDOWN_PORTABILITY_BRIDGE_RECEIPT_SCHEMA_VERSION = 'manualMap.markdownPortabilityBridgeReceipt.v1';

const MANUAL_MAP_MARKDOWN_PORTABILITY_OP = 'manualMap.markdownPortabilityBridge';
const FENCE_INFO = 'json yalken-manual-map-portability-v1';
const FENCE_PATTERN = /(^|\n)```json yalken-manual-map-portability-v1[^\n]*\n([\s\S]*?)\n```(?=\n|$)/gu;

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function typedFailure(code, reason, details = {}) {
  const error = { code, op: MANUAL_MAP_MARKDOWN_PORTABILITY_OP, reason };
  if (isPlainObject(details) && Object.keys(details).length > 0) error.details = cloneJson(details);
  return { ok: false, error };
}

function parseExportPayload(input = {}) {
  if (isPlainObject(input.payload)) return { ok: true, value: cloneJson(input.payload) };
  if (isPlainObject(input.exportPayload)) return { ok: true, value: cloneJson(input.exportPayload) };
  if (typeof input.exportJson === 'string') {
    try {
      const parsed = JSON.parse(input.exportJson);
      if (!isPlainObject(parsed)) {
        return typedFailure('E_MANUAL_MAP_MD_BRIDGE_PAYLOAD_INVALID', 'PAYLOAD_INVALID');
      }
      return { ok: true, value: parsed };
    } catch {
      return typedFailure('E_MANUAL_MAP_MD_BRIDGE_JSON_INVALID', 'JSON_INVALID');
    }
  }
  if (isPlainObject(input.graph)) {
    const exported = serializeManualMapExportJsonV1WithLossReport(input.graph);
    if (exported.lossReport.count !== 0) {
      return typedFailure('E_MANUAL_MAP_MD_BRIDGE_EXPORT_LOSS', 'EXPORT_LOSS', {
        lossCount: exported.lossReport.count,
      });
    }
    return { ok: true, value: JSON.parse(exported.json) };
  }
  return typedFailure('E_MANUAL_MAP_MD_BRIDGE_PAYLOAD_REQUIRED', 'PAYLOAD_REQUIRED');
}

function validateManualMapExportPayload(payload) {
  if (!isPlainObject(payload)) return typedFailure('E_MANUAL_MAP_MD_BRIDGE_PAYLOAD_INVALID', 'PAYLOAD_INVALID');
  if (payload.schemaVersion !== MANUAL_MAP_EXPORT_SCHEMA_VERSION || payload.format !== MANUAL_MAP_EXPORT_FORMAT) {
    return typedFailure('E_MANUAL_MAP_MD_BRIDGE_SCHEMA_INVALID', 'SCHEMA_INVALID', {
      schemaVersion: normalizeText(payload.schemaVersion),
      format: normalizeText(payload.format),
    });
  }
  const projectId = normalizeText(payload.projectId);
  const mapId = normalizeText(payload.mapId);
  if (!projectId || !mapId) {
    return typedFailure('E_MANUAL_MAP_MD_BRIDGE_IDENTITY_REQUIRED', 'IDENTITY_REQUIRED', { projectId, mapId });
  }
  return { ok: true };
}

function markdownEscapeHeading(value) {
  return normalizeText(value).replaceAll('\n', ' ') || 'Manual map portability packet';
}

function buildMarkdown(payload, options = {}) {
  const title = markdownEscapeHeading(options.title) || markdownEscapeHeading(payload.title) || payload.mapId;
  const embeddedJson = `${JSON.stringify(payload, null, 2)}\n`;
  const payloadHash = hashCanonicalValue(payload);
  const header = [
    `# ${title}`,
    '',
    '<!-- yalken-manual-map-portability:v1 -->',
    `<!-- payload-sha256:${payloadHash} -->`,
    '',
    `\`\`\`${FENCE_INFO}`,
    embeddedJson.trimEnd(),
    '```',
    '',
  ];
  return {
    markdown: `${header.join('\n')}`,
    embeddedJson,
    payloadHash,
  };
}

export function buildManualMapMarkdownPortabilityBridge(input = {}) {
  const parsed = parseExportPayload(input);
  if (!parsed.ok) return parsed;
  const payload = parsed.value;
  const validation = validateManualMapExportPayload(payload);
  if (!validation.ok) return validation;
  const built = buildMarkdown(payload, input);
  const value = {
    schemaVersion: MANUAL_MAP_MARKDOWN_PORTABILITY_BRIDGE_SCHEMA_VERSION,
    projectId: normalizeText(payload.projectId),
    mapId: normalizeText(payload.mapId),
    markdown: built.markdown,
    embeddedJson: built.embeddedJson,
    payloadHash: built.payloadHash,
    markdownHash: hashCanonicalValue(built.markdown),
    directCoreMutation: false,
    storageMutation: false,
    networkMutation: false,
    rendererMutation: false,
  };
  return {
    ok: true,
    value: {
      ...value,
      meta: {
        bridgeHash: hashCanonicalValue(value),
      },
    },
  };
}

function extractFences(markdown) {
  FENCE_PATTERN.lastIndex = 0;
  const matches = [];
  let match = FENCE_PATTERN.exec(markdown);
  while (match) {
    matches.push({
      start: match.index,
      json: match[2],
    });
    match = FENCE_PATTERN.exec(markdown);
  }
  return matches;
}

export function parseManualMapMarkdownPortabilityBridge(input = {}) {
  const markdown = typeof input.markdown === 'string' ? input.markdown : '';
  if (!markdown) {
    return typedFailure('E_MANUAL_MAP_MD_BRIDGE_MARKDOWN_REQUIRED', 'MARKDOWN_REQUIRED');
  }
  const fences = extractFences(markdown);
  if (fences.length !== 1) {
    return typedFailure('E_MANUAL_MAP_MD_BRIDGE_FENCE_COUNT_INVALID', 'FENCE_COUNT_INVALID', {
      fenceCount: fences.length,
    });
  }
  let payload;
  try {
    payload = JSON.parse(fences[0].json);
  } catch {
    return typedFailure('E_MANUAL_MAP_MD_BRIDGE_JSON_INVALID', 'JSON_INVALID');
  }
  const validation = validateManualMapExportPayload(payload);
  if (!validation.ok) return validation;
  const payloadHash = hashCanonicalValue(payload);
  const declaredHashMatch = markdown.match(/<!--\s*payload-sha256:([a-f0-9]{64})\s*-->/u);
  const declaredPayloadHash = normalizeText(declaredHashMatch?.[1]);
  if (declaredPayloadHash && declaredPayloadHash !== payloadHash) {
    return typedFailure('E_MANUAL_MAP_MD_BRIDGE_PAYLOAD_HASH_MISMATCH', 'PAYLOAD_HASH_MISMATCH', {
      declaredPayloadHash,
      actualPayloadHash: payloadHash,
    });
  }
  const value = {
    schemaVersion: MANUAL_MAP_MARKDOWN_PORTABILITY_BRIDGE_SCHEMA_VERSION,
    projectId: normalizeText(payload.projectId),
    mapId: normalizeText(payload.mapId),
    payload,
    payloadHash,
    markdownHash: hashCanonicalValue(markdown),
    directCoreMutation: false,
    storageMutation: false,
    networkMutation: false,
    rendererMutation: false,
  };
  return {
    ok: true,
    value: {
      ...value,
      meta: {
        bridgeHash: hashCanonicalValue(value),
      },
    },
  };
}

export function buildManualMapMarkdownPortabilityImportPlan(input = {}) {
  const parsed = parseManualMapMarkdownPortabilityBridge(input);
  if (!parsed.ok) return parsed;
  const plan = buildManualMapJsonRepeatImportPlan({
    payload: parsed.value.payload,
    initialState: input.initialState,
    coreState: input.coreState,
    targetProjectId: input.targetProjectId,
    targetMapId: input.targetMapId,
    title: input.title,
  });
  if (!plan.ok) return plan;
  return {
    ok: true,
    value: {
      schemaVersion: MANUAL_MAP_MARKDOWN_PORTABILITY_BRIDGE_SCHEMA_VERSION,
      projectId: plan.value.projectId,
      mapId: plan.value.mapId,
      markdownHash: parsed.value.markdownHash,
      payloadHash: parsed.value.payloadHash,
      jsonPlanHash: plan.value.meta.planHash,
      commandAuthority: 'CommandKernel',
      commands: plan.value.commands.map(cloneJson),
      directCoreMutation: false,
      storageMutation: false,
      networkMutation: false,
      rendererMutation: false,
      meta: {
        bridgePlanHash: hashCanonicalValue({
          markdownHash: parsed.value.markdownHash,
          payloadHash: parsed.value.payloadHash,
          jsonPlanHash: plan.value.meta.planHash,
        }),
      },
    },
  };
}

export async function applyManualMapMarkdownPortabilityBridgeViaCommandKernel(input = {}) {
  const parsed = parseManualMapMarkdownPortabilityBridge(input);
  if (!parsed.ok) return parsed;
  const applied = await applyManualMapJsonRepeatImportViaCommandKernel({
    payload: parsed.value.payload,
    initialState: input.initialState,
    coreState: input.coreState,
    targetProjectId: input.targetProjectId,
    targetMapId: input.targetMapId,
    title: input.title,
    commandExecutor: input.commandExecutor,
    deriveGraph: input.deriveGraph,
    capabilitySnapshot: input.capabilitySnapshot,
  });
  if (!applied.ok) return applied;
  const receipt = {
    schemaVersion: MANUAL_MAP_MARKDOWN_PORTABILITY_BRIDGE_RECEIPT_SCHEMA_VERSION,
    projectId: applied.value.projectId,
    mapId: applied.value.mapId,
    sourceProjectId: applied.value.sourceProjectId,
    sourceMapId: applied.value.sourceMapId,
    markdownHash: parsed.value.markdownHash,
    payloadHash: parsed.value.payloadHash,
    jsonImportHash: applied.value.meta.importHash,
    jsonCommandPlanHash: applied.value.commandPlanHash,
    commandAuthority: 'CommandKernel',
    appliedCommandCount: applied.value.appliedCommandCount,
    expectedGraphHash: applied.value.expectedGraphHash,
    actualGraphHash: applied.value.actualGraphHash,
    repeatExportGraphHash: applied.value.repeatExportGraphHash,
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
      state: applied.value.state,
      repeatExportJson: applied.value.repeatExportJson,
      meta: {
        bridgeImportHash: hashCanonicalValue(receipt),
        stateHash: applied.value.meta.stateHash,
      },
    },
  };
}
