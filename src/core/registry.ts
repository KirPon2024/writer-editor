export type CoreCommandType = string;
export type CoreEventType = string;

export const CORE_COMMANDS = [
  'project.create',
  'project.applyTextEdit',
  'atlas.entity.create',
  'atlas.alias.add',
  'atlas.mention.confirm',
] as const;
export const CORE_EVENTS = [] as const;
