export type CoreCommandType = string;
export type CoreEventType = string;

export const CORE_COMMANDS = [
  'project.create',
  'project.applyTextEdit',
  'atlas.entity.create',
  'atlas.alias.add',
  'atlas.mention.confirm',
  'atlas.observation.suppress',
  'atlas.entity.merge',
  'atlas.entity.splitRestore',
  'atlas.observation.reassign',
  'atlas.evidence.reattach',
  'idea.create',
  'idea.originLink.add',
  'meaning.promote',
  'manualMap.create',
  'manualMap.node.add',
  'manualMap.edge.add',
  'manualMap.attachment.add',
  'manualMap.portal.add',
  'manualMap.template.apply',
] as const;
export const CORE_EVENTS = [] as const;
