export const ATLAS_RELATION_REVIEW_ACTION_COMMAND_IDS = Object.freeze([
  'atlas.observation.suppress',
  'atlas.observation.reassign',
  'atlas.evidence.reattach',
]);

const ACTION_COMMAND_ID_SET = new Set(ATLAS_RELATION_REVIEW_ACTION_COMMAND_IDS);

export function isAtlasRelationReviewActionCommandId(commandId) {
  return typeof commandId === 'string' && ACTION_COMMAND_ID_SET.has(commandId);
}
