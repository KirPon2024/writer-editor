export type CoreCommandType = string;
export type CoreEventType = string;

export const CORE_COMMANDS = [
  'project.create',
  'project.applyTextEdit',
] as const;
export const CORE_EVENTS = [] as const;
