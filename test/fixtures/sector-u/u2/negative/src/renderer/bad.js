export function badUiCalls() {
  window.electronAPI.openFile();
}

import { ipcRenderer } from 'electron';
const x = require('electron');
import fs from 'node:fs';
import path from 'node:path';
