import { deriveView, hashCanonicalValue } from '../deriveView.mjs';

const VIEW_ID = 'derived.comments.v1';
const STABLE_COMMENT_ANCHOR_PACKET_SCHEMA = 'revision-bridge.stable-comment-anchor-packet.v1';

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function normalizeStableCommentAnchorPacket(value) {
  if (!isPlainObject(value)) return null;
  if (value.schemaVersion !== STABLE_COMMENT_ANCHOR_PACKET_SCHEMA) return null;
  const anchorRecords = Array.isArray(value.anchorRecords) ? value.anchorRecords.filter(isPlainObject) : [];
  const decisionRows = Array.isArray(value.decisionRows) ? value.decisionRows.filter(isPlainObject) : [];
  return {
    schemaVersion: value.schemaVersion,
    status: typeof value.status === 'string' ? value.status : '',
    packetHash: typeof value.packetHash === 'string' ? value.packetHash : hashCanonicalValue(value),
    anchorRecords: cloneJson(anchorRecords),
    decisionRows: cloneJson(decisionRows),
  };
}

function normalizeParams(params) {
  const source = params && typeof params === 'object' && !Array.isArray(params) ? params : {};
  const projectId = typeof source.projectId === 'string' ? source.projectId.trim() : '';
  const filter = typeof source.filter === 'string' ? source.filter.trim() : '';
  const stableCommentAnchorPacket = normalizeStableCommentAnchorPacket(source.stableCommentAnchorPacket);
  return {
    projectId,
    filter,
    stableCommentAnchorPacket,
  };
}

function commentItemDecision(packet, anchorRecord) {
  return packet.decisionRows.find((row) => (
    row.anchorRecordId === anchorRecord.anchorRecordId
    || (
      row.stableThreadIdentity === anchorRecord.stableThreadIdentity
      && row.commentId === anchorRecord.commentId
    )
  )) || null;
}

function deriveStableCommentItems(packet) {
  if (!packet) return [];
  return packet.anchorRecords.map((record) => {
    const decision = commentItemDecision(packet, record);
    return {
      itemType: 'stableCommentAnchor',
      anchorRecordId: record.anchorRecordId,
      stableThreadIdentity: record.stableThreadIdentity,
      threadId: record.threadId,
      commentId: record.commentId,
      sourceCommentId: record.sourceCommentId,
      durableId: record.durableId,
      placementStatus: record.placementStatus,
      orphanReason: record.orphanReason,
      anchorKind: record.anchorKind,
      sourcePart: record.sourcePart,
      authorHandle: record.authorHandle,
      createdAtUtc: record.createdAtUtc,
      resolvedDone: record.resolvedDone === true,
      evidenceIdentity: record.evidenceIdentity,
      decisionId: decision?.decisionId || '',
      decisionState: decision?.state || 'pending',
      requiresAuthorDecision: decision?.requiresAuthorDecision === true,
      canAutoApply: false,
      canWriteManuscript: false,
    };
  });
}

export function deriveComments(input = {}) {
  const params = normalizeParams(input.params);
  return deriveView({
    viewId: VIEW_ID,
    coreState: input.coreState,
    params,
    capabilitySnapshot: input.capabilitySnapshot,
    derive: ({ params: normalizedParams, meta }) => {
      const items = deriveStableCommentItems(normalizedParams.stableCommentAnchorPacket);
      return {
        schemaVersion: 'derived.comments.v1',
        projectId: normalizedParams.projectId,
        filter: normalizedParams.filter,
        items,
        meta: {
          invalidationKey: meta.invalidationKey,
          stableCommentAnchorPacketHash: normalizedParams.stableCommentAnchorPacket?.packetHash || '',
        },
      };
    },
  });
}

export { VIEW_ID as COMMENTS_VIEW_ID };
