import { createDerivedError, deriveView, hashCanonicalValue } from '../deriveView.mjs';
import { ATLAS_EVIDENCE_ANCHOR_SCHEMA_VERSION } from './atlasMentionTypes.mjs';
import {
  buildAtlasTextAnchorPacket,
  buildAtlasTextCoordinateIndex,
} from './atlasTextAnchorNormalization.mjs';
import {
  ATLAS_EVIDENCE_REATTACHMENT_CANDIDATE_SCHEMA_VERSION,
  ATLAS_EVIDENCE_REATTACHMENT_INBOX_SCHEMA_VERSION,
  ATLAS_EVIDENCE_REATTACHMENT_ITEM_SCHEMA_VERSION,
  sortAtlasEvidenceReattachmentCandidates,
  sortAtlasEvidenceReattachmentItems,
} from './atlasEvidenceReattachmentTypes.mjs';

const VIEW_ID = 'derived.atlas.evidenceReattachmentInbox.v1';

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function plainString(value) {
  return typeof value === 'string' ? value : '';
}

function normalizeString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function uniqueSorted(values) {
  return [...new Set(values.filter((value) => typeof value === 'string' && value.length > 0))]
    .sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'variant' }));
}

function getProject(coreState, projectId) {
  const projects = isPlainObject(coreState?.data?.projects) ? coreState.data.projects : {};
  return isPlainObject(projects[projectId]) ? projects[projectId] : null;
}

function isAtlasEvidenceReattachmentInboxCapabilityEnabled(snapshot) {
  if (!isPlainObject(snapshot)) return true;
  if (snapshot['atlas.evidenceReattachmentInbox'] === false) return false;
  const capabilities = isPlainObject(snapshot.capabilities) ? snapshot.capabilities : {};
  if (capabilities['atlas.evidenceReattachmentInbox'] === false) return false;
  if (capabilities.atlasEvidenceReattachmentInbox === false) return false;
  if (isPlainObject(capabilities.atlas) && capabilities.atlas.evidenceReattachmentInbox === false) return false;
  return true;
}

function normalizeEvidenceAnchor(value) {
  if (!isPlainObject(value)) return null;
  const anchorId = normalizeString(value.anchorId);
  const sceneId = normalizeString(value.sceneId);
  const entityId = normalizeString(value.entityId);
  const startOffset = Number(value.startOffset);
  const endOffset = Number(value.endOffset);
  const quote = plainString(value.quote);
  const quoteHash = normalizeString(value.quoteHash);
  const sceneTextHash = normalizeString(value.sceneTextHash);
  if (!anchorId || !sceneId || !Number.isInteger(startOffset) || !Number.isInteger(endOffset) || endOffset < startOffset || !quoteHash || !sceneTextHash) return null;
  let preserved = {};
  try {
    const cloned = JSON.parse(JSON.stringify(value));
    preserved = isPlainObject(cloned) ? cloned : {};
  } catch {
    preserved = {};
  }
  return {
    ...preserved,
    schemaVersion: normalizeString(value.schemaVersion) || ATLAS_EVIDENCE_ANCHOR_SCHEMA_VERSION,
    anchorId,
    projectId: normalizeString(value.projectId),
    sceneId,
    entityId,
    startOffset,
    endOffset,
    quote,
    quoteHash,
    sceneTextHash,
  };
}

function sourceEntityId(record, sourceRecordKind) {
  if (sourceRecordKind === 'reassignment') return normalizeString(record.sourceEntityId);
  return normalizeString(record.entityId);
}

function collectSourceRecords(project) {
  const atlas = isPlainObject(project?.atlas) ? project.atlas : {};
  const sourceBuckets = [
    ['decision', isPlainObject(atlas.decisions) ? atlas.decisions : {}],
    ['suppression', isPlainObject(atlas.suppressions) ? atlas.suppressions : {}],
    ['reassignment', isPlainObject(atlas.reassignments) ? atlas.reassignments : {}],
  ];
  const records = [];
  for (const [sourceRecordKind, bucket] of sourceBuckets) {
    for (const sourceRecordId of Object.keys(bucket).sort()) {
      const record = isPlainObject(bucket[sourceRecordId]) ? bucket[sourceRecordId] : {};
      const evidenceAnchor = normalizeEvidenceAnchor(record.evidenceAnchor);
      if (!evidenceAnchor) continue;
      records.push({
        sourceRecordKind,
        sourceRecordId,
        sourceRecordHash: hashCanonicalValue(record),
        entityId: sourceEntityId(record, sourceRecordKind) || evidenceAnchor.entityId,
        evidenceAnchor,
      });
    }
  }
  return records;
}

function collectReattachments(project) {
  const reattachments = isPlainObject(project?.atlas?.evidenceReattachments) ? project.atlas.evidenceReattachments : {};
  const bySource = new Map();
  for (const reattachmentId of Object.keys(reattachments).sort()) {
    const record = isPlainObject(reattachments[reattachmentId]) ? reattachments[reattachmentId] : {};
    if (record.operationKind !== 'evidence.reattach') continue;
    const sourceRecordKind = normalizeString(record.sourceRecordKind);
    const sourceRecordId = normalizeString(record.sourceRecordId);
    const staleEvidenceAnchor = normalizeEvidenceAnchor(record.staleEvidenceAnchor);
    const newEvidenceAnchor = normalizeEvidenceAnchor(record.newEvidenceAnchor);
    if (!sourceRecordKind || !sourceRecordId || !staleEvidenceAnchor || !newEvidenceAnchor) continue;
    bySource.set(`${sourceRecordKind}:${sourceRecordId}`, {
      id: normalizeString(record.id) || reattachmentId,
      sourceRecordKind,
      sourceRecordId,
      sourceRecordHash: normalizeString(record.sourceRecordHash),
      staleEvidenceAnchor,
      newEvidenceAnchor,
      reason: plainString(record.reason),
      createdByCommandSeq: Number(record.createdByCommandSeq),
    });
  }
  return bySource;
}

function anchorMatchesCurrentScene(project, anchor, sceneTextHashesByScene) {
  const sceneText = plainString(project?.scenes?.[anchor.sceneId]?.text);
  const currentQuote = sceneText.slice(anchor.startOffset, anchor.endOffset);
  if (!sceneTextHashesByScene.has(anchor.sceneId)) {
    sceneTextHashesByScene.set(anchor.sceneId, hashCanonicalValue(sceneText));
  }
  return currentQuote === anchor.quote
    && hashCanonicalValue(currentQuote) === anchor.quoteHash
    && sceneTextHashesByScene.get(anchor.sceneId) === anchor.sceneTextHash;
}

function buildEvidenceAnchor({
  projectId,
  sceneId,
  entityId,
  startOffset,
  endOffset,
  quote,
  sceneText,
  sourceRecordKind,
  sourceRecordId,
  coordinateIndex,
}) {
  const anchorPacket = buildAtlasTextAnchorPacket({
    projectId,
    sceneId,
    entityId,
    startOffset,
    endOffset,
    sceneText,
    coordinateIndex,
    materializeOffsetMap: false,
  });
  const quoteHash = anchorPacket.evidenceAnchor.quoteHash;
  const sceneTextHash = anchorPacket.evidenceAnchor.sceneTextHash;
  const anchorId = `atlas-anchor:${hashCanonicalValue({
    projectId,
    sceneId,
    entityId,
    sourceRecordKind,
    sourceRecordId,
    startOffset,
    endOffset,
    quoteHash,
    sceneTextHash,
  })}`;
  return {
    ...anchorPacket.evidenceAnchor,
    schemaVersion: ATLAS_EVIDENCE_ANCHOR_SCHEMA_VERSION,
    anchorId,
    projectId,
    sceneId,
    entityId,
    startOffset,
    endOffset,
    quote,
    quoteHash,
    sceneTextHash,
  };
}

function findReattachmentCandidates({ projectId, project, source, coordinateIndexesByScene }) {
  const quote = source.evidenceAnchor.quote;
  if (!quote) return [];
  const scenes = isPlainObject(project.scenes) ? project.scenes : {};
  const candidates = [];
  for (const sceneId of Object.keys(scenes).sort()) {
    const sceneText = plainString(scenes[sceneId]?.text);
    let cursor = 0;
    while (cursor <= sceneText.length) {
      const found = sceneText.indexOf(quote, cursor);
      if (found < 0) break;
      const endOffset = found + quote.length;
      let coordinateIndex = coordinateIndexesByScene.get(sceneId);
      if (!coordinateIndex) {
        coordinateIndex = buildAtlasTextCoordinateIndex(sceneText);
        coordinateIndexesByScene.set(sceneId, coordinateIndex);
      }
      const evidenceAnchor = buildEvidenceAnchor({
        projectId,
        sceneId,
        entityId: source.entityId,
        startOffset: found,
        endOffset,
        quote,
        sceneText,
        sourceRecordKind: source.sourceRecordKind,
        sourceRecordId: source.sourceRecordId,
        coordinateIndex,
      });
      candidates.push({
        schemaVersion: ATLAS_EVIDENCE_REATTACHMENT_CANDIDATE_SCHEMA_VERSION,
        candidateId: `atlas-reattach-candidate:${hashCanonicalValue({ source, evidenceAnchor })}`,
        candidateKind: sceneId === source.evidenceAnchor.sceneId ? 'sameSceneExactQuote' : 'movedSceneExactQuote',
        projectId,
        sourceRecordKind: source.sourceRecordKind,
        sourceRecordId: source.sourceRecordId,
        sourceRecordHash: source.sourceRecordHash,
        staleEvidenceAnchor: source.evidenceAnchor,
        evidenceAnchor,
      });
      cursor = Math.max(endOffset, found + 1);
    }
  }
  return sortAtlasEvidenceReattachmentCandidates(candidates);
}

function buildInbox({ coreState, projectId, meta }) {
  const project = getProject(coreState, projectId);
  if (!project) {
    throw createDerivedError(
      'E_ATLAS_PROJECT_NOT_FOUND',
      VIEW_ID,
      'PROJECT_NOT_FOUND',
      { projectId },
    );
  }
  const reattachmentsBySource = collectReattachments(project);
  const coordinateIndexesByScene = new Map();
  const sceneTextHashesByScene = new Map();
  const items = collectSourceRecords(project).map((source) => {
    const reattachment = reattachmentsBySource.get(`${source.sourceRecordKind}:${source.sourceRecordId}`) || null;
    const current = anchorMatchesCurrentScene(project, source.evidenceAnchor, sceneTextHashesByScene);
    const candidates = current || reattachment ? [] : findReattachmentCandidates({
      projectId,
      project,
      source,
      coordinateIndexesByScene,
    });
    const status = reattachment ? 'REATTACHED' : current ? 'CURRENT' : 'REVIEW_REQUIRED';
    return {
      schemaVersion: ATLAS_EVIDENCE_REATTACHMENT_ITEM_SCHEMA_VERSION,
      itemId: `atlas-reattach-item:${hashCanonicalValue({ sourceRecordKind: source.sourceRecordKind, sourceRecordId: source.sourceRecordId })}`,
      projectId,
      sourceRecordKind: source.sourceRecordKind,
      sourceRecordId: source.sourceRecordId,
      sourceRecordHash: source.sourceRecordHash,
      entityId: source.entityId,
      status,
      staleEvidenceAnchor: source.evidenceAnchor,
      currentEvidenceAnchor: reattachment ? reattachment.newEvidenceAnchor : current ? source.evidenceAnchor : null,
      reattachmentId: reattachment ? reattachment.id : '',
      candidates,
      candidateIds: candidates.map((candidate) => candidate.candidateId),
      candidateCount: candidates.length,
    };
  });
  const sortedItems = sortAtlasEvidenceReattachmentItems(items);
  const candidates = sortAtlasEvidenceReattachmentCandidates(sortedItems.flatMap((item) => item.candidates));
  const inboxHash = hashCanonicalValue({ sortedItems, candidates });
  return {
    schemaVersion: ATLAS_EVIDENCE_REATTACHMENT_INBOX_SCHEMA_VERSION,
    state: sortedItems.length > 0 ? 'ready' : 'empty',
    projectId,
    authority: {
      sourceOfTruth: 'atlas.author.v1 evidence-bearing records',
      readModelOnly: true,
      commandAuthority: 'atlas.evidence.reattach',
      projectTruthMutation: false,
      storageMutation: false,
      networkMutation: false,
      automaticReattachment: false,
    },
    summary: {
      sourceRecordCount: sortedItems.length,
      reviewRequiredCount: sortedItems.filter((item) => item.status === 'REVIEW_REQUIRED').length,
      currentCount: sortedItems.filter((item) => item.status === 'CURRENT').length,
      reattachedCount: sortedItems.filter((item) => item.status === 'REATTACHED').length,
      candidateCount: candidates.length,
      sourceRecordKinds: uniqueSorted(sortedItems.map((item) => item.sourceRecordKind)),
      inboxHash,
      invalidationKey: meta.invalidationKey,
    },
    items: sortedItems,
    candidates,
  };
}

export function deriveAtlasEvidenceReattachmentInbox(input = {}) {
  const projectId = normalizeString(input?.params?.projectId);
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

  return deriveView({
    viewId: VIEW_ID,
    coreState: input.coreState,
    params: {
      ...input.params,
      projectId,
    },
    capabilitySnapshot: input.capabilitySnapshot,
    derive: ({ coreState, params, capabilitySnapshot, meta }) => {
      if (!isAtlasEvidenceReattachmentInboxCapabilityEnabled(capabilitySnapshot)) {
        throw createDerivedError(
          'E_CAPABILITY_DISABLED_FOR_COMMAND',
          VIEW_ID,
          'ATLAS_EVIDENCE_REATTACHMENT_INBOX_DISABLED',
          { capabilityId: 'atlas.evidenceReattachmentInbox' },
        );
      }
      return buildInbox({ coreState, projectId: params.projectId, meta });
    },
  });
}

export { VIEW_ID as ATLAS_EVIDENCE_REATTACHMENT_INBOX_VIEW_ID };
