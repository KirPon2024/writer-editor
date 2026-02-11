export type FileSystemPort = {
  read(path: string): Promise<string | Uint8Array>
  write(path: string, data: string | Uint8Array): Promise<void>
  exists(path: string): Promise<boolean>
};

