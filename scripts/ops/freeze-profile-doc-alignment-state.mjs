#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BASELINE_REQUIRED_TOKENS } from './freeze-ready-evaluator.mjs';

const DEFAULT_DOC_PATH = 'docs/OPS/STATUS/XPLAT_UNIFIED_MASTER_EXECUTION_CONTRACT_v1.0.md';
const TOKEN_NAME = 'FREEZE_PROFILE_DOC_ALIGNMENT_OK';
const FAIL_DOC_PARSE_FAILED = 'E_DOC_PARSE_FAILED';
const FAIL_RUNTIME_SET_EMPTY = 'E_RUNTIME_SET_EMPTY';
const FAIL_ALIGNMENT_MISMATCH = 'E_ALIGNMENT_MISMATCH';
const SECTION_RE = /^#\s*26\.\s*CRITICAL_ROLLUPS_BASELINE\s*\(FREEZE REQUIRED\)\s*$/u;
const REQUIRED_MARKER_RE = /^Обязательные\s*=\s*1:\s*$/u;
const TOKEN_LINE_RE = /^[A-Z][A-Z0-9_]*$/u;

function uniqueSortedStrings(values) {
  const out = [];
  const seen = new Set();
  for (const value of values || []) {
    const normalized = String(value || '').trim();
    if (!normalized) continue;
    if (!seen.has(normalized)) {
      seen.add(normalized);
      out.push(normalized);
    }
  }
  return out.sort();
}

function readText(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch {
    return '';
  }
}

function parseDocRequiredBaseline(text) {
  const lines = String(text || '').split(/\r?\n/u);
  const sectionStart = lines.findIndex((line) => SECTION_RE.test(line.trim()));
  if (sectionStart < 0) return { ok: false, tokens: [] };

  let sectionEnd = lines.length;
  for (let i = sectionStart + 1; i < lines.length; i += 1) {
    if (/^#\s+/u.test(lines[i].trim())) {
      sectionEnd = i;
      break;
    }
  }

  let markerLine = -1;
  for (let i = sectionStart + 1; i < sectionEnd; i += 1) {
    if (REQUIRED_MARKER_RE.test(lines[i].trim())) {
      markerLine = i;
      break;
    }
  }
  if (markerLine < 0) return { ok: false, tokens: [] };

  const tokens = [];
  for (let i = markerLine + 1; i < sectionEnd; i += 1) {
    const trimmed = lines[i].trim();
    if (!trimmed) {
      if (tokens.length > 0) break;
      continue;
    }
    const normalized = trimmed.replace(/^[-*]\s+/u, '').trim();
    if (TOKEN_LINE_RE.test(normalized)) {
      tokens.push(normalized);
      continue;
    }
    if (tokens.length > 0) break;
  }

  if (tokens.length === 0) return { ok: false, tokens: [] };
  return {
    ok: true,
    tokens: uniqueSortedStrings(tokens),
  };
}

export function evaluateFreezeProfileDocAlignmentState(input = {}) {
  const docPath = String(
    input.docPath
    || process.env.FREEZE_PROFILE_DOC_ALIGNMENT_DOC_PATH
    || DEFAULT_DOC_PATH,
  ).trim();

  const runtimeRequiredAlways = uniqueSortedStrings(BASELINE_REQUIRED_TOKENS);
  const failures = [];

  if (runtimeRequiredAlways.length === 0) {
    failures.push(FAIL_RUNTIME_SET_EMPTY);
  }

  const docText = readText(docPath);
  const parsedDoc = parseDocRequiredBaseline(docText);
  const docRequiredBaseline = parsedDoc.ok ? parsedDoc.tokens : [];
  if (!parsedDoc.ok) {
    failures.push(FAIL_DOC_PARSE_FAILED);
  }

  const missingInDoc = parsedDoc.ok
    ? runtimeRequiredAlways.filter((token) => !docRequiredBaseline.includes(token))
    : [];
  const extraInDoc = parsedDoc.ok
    ? docRequiredBaseline.filter((token) => !runtimeRequiredAlways.includes(token))
    : [];
  if (missingInDoc.length > 0 || extraInDoc.length > 0) {
    failures.push(FAIL_ALIGNMENT_MISMATCH);
  }

  const sortedFailures = uniqueSortedStrings(failures);
  const ok = sortedFailures.length === 0;

  return {
    ok,
    token: ok ? 1 : 0,
    runtimeRequiredAlways,
    docRequiredBaseline,
    missingInDoc,
    extraInDoc,
    failures: sortedFailures,
  };
}

function parseArgs(argv) {
  const out = {
    json: false,
    docPath: '',
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = String(argv[i] || '').trim();
    if (arg === '--json') {
      out.json = true;
    } else if (arg === '--doc-path') {
      out.docPath = String(argv[i + 1] || '').trim();
      i += 1;
    }
  }
  return out;
}

function printTokens(state) {
  console.log(`${TOKEN_NAME}=${state.token}`);
  console.log(`FREEZE_PROFILE_DOC_ALIGNMENT_FAILURES=${JSON.stringify(state.failures)}`);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const state = evaluateFreezeProfileDocAlignmentState({
    docPath: args.docPath,
  });
  if (args.json) {
    process.stdout.write(`${JSON.stringify(state, null, 2)}\n`);
    return;
  }
  printTokens(state);
}

const selfPath = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === selfPath) {
  main();
}
