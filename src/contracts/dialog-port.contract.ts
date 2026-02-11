export type DialogPort = {
  openFile(): Promise<string | null>
  saveFile(): Promise<string | null>
};

