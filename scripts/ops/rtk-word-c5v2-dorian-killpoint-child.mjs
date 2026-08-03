#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const RESULT_PREFIX = 'YALKEN_C5V2_DORIAN_KILLPOINT_RESULT ';
const FIRST_SCENE_PREFIX = 'YALKEN_C5V2_DORIAN_AFTER_FIRST_SCENE ';

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map((item) => stableJson(item)).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

const cryptoPort = {
  sha256Text(value) {
    return crypto.createHash('sha256').update(Buffer.from(String(value), 'utf8')).digest('hex');
  },
  sha256Json(value) {
    return `sha256:${this.sha256Text(stableJson(value))}`;
  },
};

function parseArgs(argv) {
  const options = { mode: '', inputPath: '' };
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--mode') {
      options.mode = argv[index + 1] || '';
      index += 1;
    } else if (argv[index] === '--input') {
      options.inputPath = argv[index + 1] || '';
      index += 1;
    } else {
      throw new Error(`C5V2_DORIAN_KILLPOINT_CHILD_ARGUMENT_UNKNOWN:${argv[index]}`);
    }
  }
  return options;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (!['kill', 'recover', 'apply', 'inspect'].includes(options.mode) || !options.inputPath) {
    throw new Error('C5V2_DORIAN_KILLPOINT_CHILD_ARGUMENT_REQUIRED');
  }
  const input = JSON.parse(fs.readFileSync(path.resolve(options.inputPath), 'utf8'));
  const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
  const runtime = await import(pathToFileURL(path.join(
    rootDir,
    'src',
    'io',
    'revisionBridge',
    'reviewTransportFormattingReturnRuntime.mjs',
  )).href);
  let result;
  if (options.mode === 'recover') {
    result = await runtime.reconcileFormattingReturnRuntimeAtStartup(input.startupScope, { cryptoPort });
  } else if (options.mode === 'inspect') {
    result = await runtime.inspectFormattingReturnRuntimeState(input.startupScope, { cryptoPort });
  } else {
    const handlerOptions = { cryptoPort };
    if (options.mode === 'kill') {
      handlerOptions.afterSceneWrite = async ({ index, sceneId }) => {
        if (index !== 0) return;
        process.stdout.write(`${FIRST_SCENE_PREFIX}${JSON.stringify({ index, sceneId, pid: process.pid })}\n`);
        await new Promise(() => {});
      };
    }
    const handler = runtime.createRtkFormattingReturnCommandHandler(handlerOptions);
    result = await handler(input.commandPayload);
  }
  process.stdout.write(`${RESULT_PREFIX}${JSON.stringify({ mode: options.mode, result })}\n`);
  process.exit(result?.ok === true ? 0 : 1);
}

main().catch((error) => {
  process.stderr.write(`${error && error.stack ? error.stack : String(error)}\n`);
  process.exit(1);
});
