#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const TOKEN_NAME = 'X1_DESKTOP_PARITY_RUNTIME_OK';
const FAIL_CODE = 'E_X1_DESKTOP_PARITY_RUNTIME_INVALID';

function isObjectRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function stableSortObject(value) {
  if (Array.isArray(value)) return value.map((entry) => stableSortObject(entry));
  if (!isObjectRecord(value)) return value;
  const out = {};
  for (const key of Object.keys(value).sort((a, b) => a.localeCompare(b))) {
    out[key] = stableSortObject(value[key]);
  }
  return out;
}

function stableStringify(value) {
  return JSON.stringify(stableSortObject(value), null, 2);
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function normalizeText(value) {
  return String(value || '')
    .replace(/\r\n/g, '\n')
    .replace(/[\t ]+\n/g, '\n')
    .replace(/\n[\t ]+/g, '\n')
    .replace(/[\t ]{2,}/g, ' ')
    .trim();
}

function normalizeDocument(input) {
  if (!isObjectRecord(input) || !Array.isArray(input.scenes)) return null;
  const scenes = input.scenes.map((entry, index) => {
    const id = String(entry?.id || `scene-${index + 1}`).trim();
    const text = normalizeText(entry?.text);
    return {
      id,
      text,
    };
  });
  scenes.sort((a, b) => a.id.localeCompare(b.id));
  return {
    schemaVersion: 'v1',
    scenes,
  };
}

function semanticFingerprint(input) {
  const normalized = normalizeDocument(input);
  if (!normalized) return null;
  return normalized.scenes.map((scene) => ({
    id: scene.id,
    text: scene.text,
  }));
}

function defaultDocument() {
  return {
    schemaVersion: 'v1',
    scenes: [
      {
        id: 'scene-1',
        text: 'Alpha scene opening line.  ',
      },
      {
        id: 'scene-2',
        text: 'Beta scene closing line.',
      },
    ],
  };
}

function applyDeterministicEdit(doc) {
  const next = cloneJson(doc);
  if (!Array.isArray(next.scenes) || next.scenes.length === 0) {
    next.scenes = [{ id: 'scene-1', text: 'Runtime edit bootstrap.' }];
    return next;
  }
  const first = next.scenes[0];
  first.text = `${String(first.text || '').replace(/\s+$/g, '')}\nRuntime parity deterministic edit.`;
  return next;
}

function exportToMarkdown(doc) {
  const normalized = normalizeDocument(doc);
  if (!normalized) return '';
  const chunks = [];
  for (const scene of normalized.scenes) {
    chunks.push(`## ${scene.id}`);
    chunks.push(scene.text);
  }
  return `${chunks.join('\n\n')}\n`;
}

function importFromMarkdown(markdownText) {
  const text = String(markdownText || '').replace(/\r\n/g, '\n');
  const lines = text.split('\n');
  const scenes = [];
  let currentScene = null;

  for (const line of lines) {
    if (line.startsWith('## ')) {
      if (currentScene) {
        currentScene.text = normalizeText(currentScene.text);
        scenes.push(currentScene);
      }
      currentScene = {
        id: line.slice(3).trim(),
        text: '',
      };
      continue;
    }
    if (!currentScene) continue;
    if (currentScene.text.length > 0) {
      currentScene.text += '\n';
    }
    currentScene.text += line;
  }

  if (currentScene) {
    currentScene.text = normalizeText(currentScene.text);
    scenes.push(currentScene);
  }

  return {
    schemaVersion: 'v1',
    scenes,
  };
}

function equalJson(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function toRoundedMb(bytes) {
  const mb = Number(bytes) / (1024 * 1024);
  return Number(mb.toFixed(6));
}

export function runX1DesktopParityHarness(input = {}) {
  const startedAt = Date.now();
  const errors = [];
  let docSizeMb = 0;
  let roundtripOk = false;
  let exportImportOk = false;
  let normalizationOk = false;

  const ephemeralDir = fs.mkdtempSync(path.join(os.tmpdir(), 'x1-desktop-parity-'));
  const workDir = String(input.workDir || ephemeralDir).trim() || ephemeralDir;
  const shouldCleanup = input.cleanup !== false && workDir === ephemeralDir;

  try {
    fs.mkdirSync(workDir, { recursive: true });

    const openDoc = normalizeDocument(input.initialDoc || defaultDocument());
    if (!openDoc) {
      throw new Error('Invalid initial document for parity harness.');
    }

    const editedDoc = normalizeDocument(applyDeterministicEdit(openDoc));
    if (!editedDoc) {
      throw new Error('Edited document normalization failed.');
    }

    const savePath = path.join(workDir, 'x1-runtime-save.json');
    fs.writeFileSync(savePath, `${JSON.stringify(editedDoc, null, 2)}\n`, 'utf8');
    docSizeMb = toRoundedMb(fs.statSync(savePath).size);

    const reopenedDoc = JSON.parse(fs.readFileSync(savePath, 'utf8'));
    const reopenedNormalized = normalizeDocument(reopenedDoc);
    roundtripOk = Boolean(reopenedNormalized) && equalJson(reopenedNormalized, editedDoc);

    const exportedMarkdown = exportToMarkdown(reopenedNormalized);
    const exportPath = path.join(workDir, 'x1-runtime-export.md');
    fs.writeFileSync(exportPath, exportedMarkdown, 'utf8');

    const importedDoc = importFromMarkdown(fs.readFileSync(exportPath, 'utf8'));
    const importedFingerprint = semanticFingerprint(importedDoc);
    const editedFingerprint = semanticFingerprint(editedDoc);
    exportImportOk = Boolean(importedFingerprint)
      && Boolean(editedFingerprint)
      && equalJson(importedFingerprint, editedFingerprint);

    const normalizedTwice = normalizeDocument(editedDoc);
    normalizationOk = Boolean(normalizedTwice) && equalJson(normalizedTwice, editedDoc);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    errors.push({
      code: 'E_X1_DESKTOP_PARITY_HARNESS_EXCEPTION',
      message,
    });
  } finally {
    if (shouldCleanup) {
      fs.rmSync(workDir, { recursive: true, force: true });
    }
  }

  if (!roundtripOk) {
    errors.push({
      code: 'E_X1_DESKTOP_PARITY_ROUNDTRIP_FAILED',
      message: 'Open/edit/save/reopen roundtrip invariant failed.',
    });
  }
  if (!exportImportOk) {
    errors.push({
      code: 'E_X1_DESKTOP_PARITY_EXPORT_IMPORT_FAILED',
      message: 'Export/import semantic equality invariant failed.',
    });
  }
  if (!normalizationOk) {
    errors.push({
      code: 'E_X1_DESKTOP_PARITY_NORMALIZATION_FAILED',
      message: 'Normalization invariant failed.',
    });
  }

  const ok = errors.length === 0;
  const runtimeParityPassPct = ok ? 100 : 0;
  const durationMs = Date.now() - startedAt;

  return {
    [TOKEN_NAME]: ok ? 1 : 0,
    roundtripOk,
    exportImportOk,
    normalizationOk,
    durationMs,
    docSizeMb,
    runtimeParityPassPct,
    flakyRatePct: 0,
    failSignalCode: ok ? '' : FAIL_CODE,
    failSignal: ok
      ? null
      : {
          code: FAIL_CODE,
          details: {
            errors,
          },
        },
    errors,
  };
}

function parseArgs(argv) {
  const out = {
    json: false,
    workDir: '',
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--json') out.json = true;
    if (arg === '--work-dir' && i + 1 < argv.length) {
      out.workDir = String(argv[i + 1] || '').trim();
      i += 1;
    }
  }
  return out;
}

function printHuman(state) {
  console.log(`${TOKEN_NAME}=${state[TOKEN_NAME]}`);
  console.log(`X1_PARITY_ROUNDTRIP_OK=${state.roundtripOk ? 1 : 0}`);
  console.log(`X1_PARITY_EXPORT_IMPORT_OK=${state.exportImportOk ? 1 : 0}`);
  console.log(`X1_PARITY_NORMALIZATION_OK=${state.normalizationOk ? 1 : 0}`);
  console.log(`X1_PARITY_DURATION_MS=${state.durationMs}`);
  console.log(`X1_PARITY_DOC_SIZE_MB=${state.docSizeMb}`);
  if (state.failSignalCode) {
    console.log(`FAIL_REASON=${state.failSignalCode}`);
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const state = runX1DesktopParityHarness({
    workDir: args.workDir || undefined,
  });

  if (args.json) {
    process.stdout.write(`${stableStringify(state)}\n`);
  } else {
    printHuman(state);
  }

  process.exit(state[TOKEN_NAME] === 1 ? 0 : 1);
}

if (process.argv[1]) {
  const entrypointPath = path.resolve(process.argv[1]);
  if (fileURLToPath(import.meta.url) === entrypointPath) {
    main();
  }
}
