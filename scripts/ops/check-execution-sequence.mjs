#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { evaluateLawPathCanonState } from './check-law-path-canon.mjs';

const MODE_RELEASE = 'release';
const MODE_PROMOTION = 'promotion';
const RESULT_PASS = 'PASS';
const RESULT_WARN = 'WARN';
const RESULT_FAIL = 'FAIL';
const FAIL_SIGNAL_SEQUENCE = 'E_SEQUENCE_ORDER_DRIFT';
const FAIL_SIGNAL_LAW_PATH = 'E_LAW_PATH_DRIFT';
const LAW_PATH_CANON_INVALID = 'LAW_PATH_CANON_INVALID';
const DEFAULT_SEQUENCE_CANON_PATH = 'docs/OPS/STATUS/EXECUTION_SEQUENCE_CANON_v1.json';
const DEFAULT_LAW_PATH_CANON_PATH = 'docs/OPS/STATUS/LAW_PATH_CANON.json';

function normalizeString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function parseBooleanish(value) {
  const normalized = normalizeString(value).toLowerCase();
  if (!normalized) return false;
  return normalized === '1'
    || normalized === 'true'
    || normalized === 'yes'
    || normalized === 'on';
}

function normalizeMode(value) {
  const normalized = normalizeString(value).toLowerCase();
  if (normalized === MODE_PROMOTION) return MODE_PROMOTION;
  return MODE_RELEASE;
}

function resolveMode(rawMode) {
  if (normalizeString(rawMode)) return normalizeMode(rawMode);
  if (parseBooleanish(process.env.promotionMode)
    || parseBooleanish(process.env.PROMOTION_MODE)
    || parseBooleanish(process.env.WAVE_PROMOTION_MODE)) {
    return MODE_PROMOTION;
  }
  return MODE_RELEASE;
}

function isObjectRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function toRepoRelative(repoRoot, absPath) {
  return path.relative(repoRoot, absPath).replaceAll(path.sep, '/');
}

function normalizeSequenceToken(value) {
  return normalizeString(value)
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function parseSequenceFromCanon(sequenceDoc) {
  if (!isObjectRecord(sequenceDoc) || !Array.isArray(sequenceDoc.sequence)) return [];
  return sequenceDoc.sequence.map((entry) => normalizeSequenceToken(entry)).filter(Boolean);
}

function cutA1Section(lawText) {
  const startMatch = lawText.match(/^###\s+A1\)[^\n]*$/m);
  if (!startMatch || typeof startMatch.index !== 'number') return '';
  const tail = lawText.slice(startMatch.index);

  let end = tail.length;
  const markers = [
    /^Fail [^:\n]+:[^\n]*$/m,
    /^####\s+A1\.1\)[^\n]*$/m,
    /^###\s+A2\)[^\n]*$/m,
  ];
  for (const marker of markers) {
    const found = tail.match(marker);
    if (!found || typeof found.index !== 'number') continue;
    if (found.index > 0 && found.index < end) end = found.index;
  }
  return tail.slice(0, end);
}

function parseSequenceFromLaw(lawText) {
  const section = cutA1Section(lawText);
  if (!section) return [];
  const tokens = [];
  const backtickRe = /`([^`]+)`/g;
  let match = null;
  while ((match = backtickRe.exec(section)) !== null) {
    tokens.push(normalizeSequenceToken(String(match[1] || '')));
  }
  return tokens.filter(Boolean);
}

function arraysEqual(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b)) return false;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false;
  }
  return true;
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

function parseArgs(argv = process.argv.slice(2)) {
  const out = {
    json: false,
    mode: '',
    repoRoot: process.cwd(),
    sequenceCanonPath: DEFAULT_SEQUENCE_CANON_PATH,
    lawPathCanonPath: DEFAULT_LAW_PATH_CANON_PATH,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = normalizeString(argv[i]);
    if (!arg) continue;
    if (arg === '--json') {
      out.json = true;
      continue;
    }
    if (arg.startsWith('--mode=')) {
      out.mode = normalizeString(arg.slice('--mode='.length));
      continue;
    }
    if (arg === '--mode' && i + 1 < argv.length) {
      out.mode = normalizeString(argv[i + 1]);
      i += 1;
      continue;
    }
    if (arg.startsWith('--repo-root=')) {
      out.repoRoot = normalizeString(arg.slice('--repo-root='.length)) || process.cwd();
      continue;
    }
    if (arg === '--repo-root' && i + 1 < argv.length) {
      out.repoRoot = normalizeString(argv[i + 1]) || process.cwd();
      i += 1;
      continue;
    }
    if (arg.startsWith('--sequence-canon-path=')) {
      out.sequenceCanonPath = normalizeString(arg.slice('--sequence-canon-path='.length)) || DEFAULT_SEQUENCE_CANON_PATH;
      continue;
    }
    if (arg === '--sequence-canon-path' && i + 1 < argv.length) {
      out.sequenceCanonPath = normalizeString(argv[i + 1]) || DEFAULT_SEQUENCE_CANON_PATH;
      i += 1;
      continue;
    }
    if (arg.startsWith('--law-path-canon-path=')) {
      out.lawPathCanonPath = normalizeString(arg.slice('--law-path-canon-path='.length)) || DEFAULT_LAW_PATH_CANON_PATH;
      continue;
    }
    if (arg === '--law-path-canon-path' && i + 1 < argv.length) {
      out.lawPathCanonPath = normalizeString(argv[i + 1]) || DEFAULT_LAW_PATH_CANON_PATH;
      i += 1;
    }
  }

  return out;
}

export function evaluateExecutionSequenceState(input = {}) {
  const repoRoot = path.resolve(normalizeString(input.repoRoot) || process.cwd());
  const mode = resolveMode(input.mode);
  const sequenceCanonPath = normalizeString(input.sequenceCanonPath) || DEFAULT_SEQUENCE_CANON_PATH;
  const sequenceCanonAbsPath = path.resolve(repoRoot, sequenceCanonPath);
  const issues = [];

  const lawPathState = evaluateLawPathCanonState({
    repoRoot,
    mode,
    canonPath: normalizeString(input.lawPathCanonPath) || DEFAULT_LAW_PATH_CANON_PATH,
  });

  const lawDocPath = normalizeString(lawPathState.lawDocPath);
  const lawDocAbsPath = lawDocPath ? path.resolve(repoRoot, lawDocPath) : '';
  const lawDocFound = Boolean(lawDocAbsPath && fs.existsSync(lawDocAbsPath));

  if (!lawPathState.ok) {
    issues.push({
      code: LAW_PATH_CANON_INVALID,
      message: 'LAW path canon is invalid for execution sequence check.',
      details: lawPathState.issues,
      filePath: normalizeString(lawPathState.lawPathCanonPath),
    });
  }

  if (!fs.existsSync(sequenceCanonAbsPath)) {
    issues.push({
      code: 'SEQUENCE_CANON_MISSING',
      message: `Missing execution sequence canon: ${sequenceCanonPath}`,
      filePath: sequenceCanonPath,
    });
  }

  let expected = [];
  if (issues.length === 0) {
    try {
      const sequenceCanonDoc = JSON.parse(fs.readFileSync(sequenceCanonAbsPath, 'utf8'));
      expected = parseSequenceFromCanon(sequenceCanonDoc);
      if (expected.length === 0) {
        issues.push({
          code: 'SEQUENCE_CANON_INVALID',
          message: 'Execution sequence canon is empty or invalid.',
          filePath: sequenceCanonPath,
        });
      }
    } catch (error) {
      issues.push({
        code: 'SEQUENCE_CANON_UNREADABLE',
        message: `Cannot parse execution sequence canon JSON: ${error.message}`,
        filePath: sequenceCanonPath,
      });
    }
  }

  let actual = [];
  if (issues.length === 0) {
    if (!lawDocFound) {
      issues.push({
        code: LAW_PATH_CANON_INVALID,
        message: `LAW doc path does not exist: ${lawDocPath}`,
        filePath: lawDocPath,
      });
    } else {
      try {
        const lawText = fs.readFileSync(lawDocAbsPath, 'utf8');
        actual = parseSequenceFromLaw(lawText);
        if (actual.length === 0) {
          issues.push({
            code: 'LAW_A1_SEQUENCE_MISSING',
            message: 'Cannot parse A1 execution sequence from LAW document.',
            filePath: lawDocPath,
          });
        }
      } catch (error) {
        issues.push({
          code: 'LAW_FILE_UNREADABLE',
          message: `Cannot read LAW document: ${error.message}`,
          filePath: lawDocPath,
        });
      }
    }
  }

  if (issues.length === 0 && !arraysEqual(actual, expected)) {
    issues.push({
      code: 'SEQUENCE_ORDER_MISMATCH',
      message: 'LAW A1 order does not match execution sequence canon.',
      expected,
      actual,
    });
  }

  const ok = issues.length === 0;
  const result = ok
    ? RESULT_PASS
    : (mode === MODE_PROMOTION ? RESULT_FAIL : RESULT_WARN);

  const usesLawPathSignal = issues.some((issue) => String(issue.code || '').startsWith(LAW_PATH_CANON_INVALID));
  const failSignalCode = ok
    ? ''
    : (usesLawPathSignal ? FAIL_SIGNAL_LAW_PATH : FAIL_SIGNAL_SEQUENCE);

  return {
    ok,
    mode,
    lawDocPath,
    lawDocFound,
    expected,
    actual,
    result,
    failSignalCode,
    failReason: ok ? '' : String(issues[0]?.code || ''),
    issues,
    sequenceCanonPath: toRepoRelative(repoRoot, sequenceCanonAbsPath),
    lawPathCanonPath: normalizeString(lawPathState.lawPathCanonPath),
  };
}

function printHuman(state) {
  process.stdout.write(`EXECUTION_SEQUENCE_MODE=${state.mode}\n`);
  process.stdout.write(`EXECUTION_SEQUENCE_RESULT=${state.result}\n`);
  process.stdout.write(`EXECUTION_SEQUENCE_OK=${state.ok ? 1 : 0}\n`);
  process.stdout.write(`EXECUTION_SEQUENCE_SEQUENCE_CANON_PATH=${state.sequenceCanonPath}\n`);
  process.stdout.write(`EXECUTION_SEQUENCE_LAW_PATH_CANON_PATH=${state.lawPathCanonPath}\n`);
  process.stdout.write(`EXECUTION_SEQUENCE_LAW_DOC_PATH=${state.lawDocPath}\n`);
  process.stdout.write(`EXECUTION_SEQUENCE_LAW_DOC_FOUND=${state.lawDocFound ? 1 : 0}\n`);
  process.stdout.write(`EXECUTION_SEQUENCE_EXPECTED=${JSON.stringify(state.expected)}\n`);
  process.stdout.write(`EXECUTION_SEQUENCE_ACTUAL=${JSON.stringify(state.actual)}\n`);
  if (state.failReason) process.stdout.write(`EXECUTION_SEQUENCE_FAIL_REASON=${state.failReason}\n`);
  if (state.failSignalCode) process.stdout.write(`EXECUTION_SEQUENCE_FAIL_SIGNAL=${state.failSignalCode}\n`);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const state = evaluateExecutionSequenceState(args);
  if (args.json) {
    process.stdout.write(`${stableStringify(state)}\n`);
  } else {
    printHuman(state);
  }
  process.exit(state.result === RESULT_FAIL ? 1 : 0);
}

const selfPath = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === selfPath) {
  main();
}
