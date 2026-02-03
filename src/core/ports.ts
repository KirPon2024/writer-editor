export type CorePort = string;

export type CorePortRequest = { port: CorePort; type: string; payload?: unknown; };

export type CorePortResponse = { port: CorePort; type: string; payload?: unknown; };
