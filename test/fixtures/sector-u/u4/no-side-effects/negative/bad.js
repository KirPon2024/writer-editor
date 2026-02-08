import { ipcRenderer } from 'electron';
import fs from 'node:fs';

export function bad() {
  return ipcRenderer.send('x') || fs.readFileSync('/tmp/a');
}
