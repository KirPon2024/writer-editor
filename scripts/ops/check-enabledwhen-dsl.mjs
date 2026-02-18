#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { validateEnabledWhenAst } = require('../../src/menu/enabledwhen-eval.js');

const MODE_RELEASE = 'release';
const MODE_PROMOTION = 'promotion';
const RESULT_PASS = 'PASS';
const RESULT_WARN = 'WARN';
const RESULT_FAIL = 'FAIL';
const FAIL_SIGNAL_DSL = 'E_ENABLEDWHEN_DSL_INVALID';
const FAIL_SIGNAL_MATRIX = 'E_COMMAND_VISIBILITY_MATRIX_DRIFT';
const DEFAULT_MENU_ROOT = 'src/menu';
const DSL_CANON_PATH = 'docs/OPS/STATUS/ENABLEDWHEN_DSL_CANON.json';
const VISIBILITY_MATRIX_PATH = 'docs/OPS/STATUS/COMMAND_VISIBILITY_MATRIX.json';
const MENU_VALIDATOR_PATH = 'src/menu/menu-config-validator.js';

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

function resolveMode(args) {
  if (normalizeString(args.mode)) return normalizeMode(args.mode);
  if (parseBooleanish(process.env.promotionMode)
    || parseBooleanish(process.env.PROMOTION_MODE)
    || parseBooleanish(process.env.WAVE_PROMOTION_MODE)) {
    return MODE_PROMOTION;
  }
  return MODE_RELEASE;
}

function parseArgs(argv = process.argv.slice(2)) {
  const out = {
    json: false,
    mode: '',
    menuRoot: DEFAULT_MENU_ROOT,
    repoRoot: process.cwd(),
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = normalizeString(argv[i]);
    if (!arg) continue;
    if (arg === '--json') {
      out.json = true;
      continue;
    }
    if (arg.startsWith('--mode=')) {
      out.mode = arg.slice('--mode='.length);
      continue;
    }
    if (arg === '--mode' && i + 1 < argv.length) {
      out.mode = normalizeString(argv[i + 1]);
      i += 1;
      continue;
    }
    if (arg.startsWith('--menu-root=')) {
      out.menuRoot = normalizeString(arg.slice('--menu-root='.length)) || DEFAULT_MENU_ROOT;
      continue;
    }
    if (arg === '--menu-root' && i + 1 < argv.length) {
      out.menuRoot = normalizeString(argv[i + 1]) || DEFAULT_MENU_ROOT;
      i += 1;
    }
  }
  return out;
}

function collectFilesRecursive(absDir, out = []) {
  if (!fs.existsSync(absDir)) return out;
  const entries = fs.readdirSync(absDir, { withFileTypes: true });
  for (const entry of entries) {
    const absPath = path.join(absDir, entry.name);
    if (entry.isDirectory()) {
      collectFilesRecursive(absPath, out);
      continue;
    }
    if (entry.isFile()) out.push(absPath);
  }
  return out;
}

function toRepoRelative(repoRoot, absPath) {
  return path.relative(repoRoot, absPath).replaceAll(path.sep, '/');
}

function walkMenuNodes(nodes, prefix, out) {
  if (!Array.isArray(nodes)) return;
  nodes.forEach((node, index) => {
    if (!node || typeof node !== 'object' || Array.isArray(node)) return;
    const nodePath = `${prefix}[${index}]`;
    if (Object.prototype.hasOwnProperty.call(node, 'enabledWhen')) {
      out.push({
        path: `${nodePath}.enabledWhen`,
        value: node.enabledWhen,
      });
    }
    if (Array.isArray(node.items)) {
      walkMenuNodes(node.items, `${nodePath}.items`, out);
    }
  });
}

function evaluateEnabledWhenDslState(input = {}) {
  const repoRoot = normalizeString(input.repoRoot) || process.cwd();
  const menuRoot = normalizeString(input.menuRoot) || DEFAULT_MENU_ROOT;
  const mode = resolveMode({ mode: input.mode });
  const absMenuRoot = path.resolve(repoRoot, menuRoot);
  const issues = [];
  const menuFiles = [];
  let enabledWhenNodes = 0;

  const absDslCanonPath = path.resolve(repoRoot, DSL_CANON_PATH);
  const absVisibilityMatrixPath = path.resolve(repoRoot, VISIBILITY_MATRIX_PATH);
  const absValidatorPath = path.resolve(repoRoot, MENU_VALIDATOR_PATH);

  if (!fs.existsSync(absDslCanonPath)) {
    issues.push({
      code: FAIL_SIGNAL_DSL,
      message: `Missing SSOT: ${DSL_CANON_PATH}`,
      filePath: DSL_CANON_PATH,
    });
  }
  if (!fs.existsSync(absVisibilityMatrixPath)) {
    issues.push({
      code: FAIL_SIGNAL_MATRIX,
      message: `Missing SSOT: ${VISIBILITY_MATRIX_PATH}`,
      filePath: VISIBILITY_MATRIX_PATH,
    });
  }

  if (!fs.existsSync(absValidatorPath)) {
    issues.push({
      code: FAIL_SIGNAL_MATRIX,
      message: `Missing validator: ${MENU_VALIDATOR_PATH}`,
      filePath: MENU_VALIDATOR_PATH,
    });
  } else {
    const validatorText = fs.readFileSync(absValidatorPath, 'utf8');
    if (!validatorText.includes('COMMAND_VISIBILITY_MATRIX_PATH') || !validatorText.includes('loadVisibilityMatrix')) {
      issues.push({
        code: FAIL_SIGNAL_MATRIX,
        message: 'Visibility matrix is not wired in menu-config-validator.',
        filePath: MENU_VALIDATOR_PATH,
      });
    }
  }

  const files = collectFilesRecursive(absMenuRoot);
  for (const absPath of files) {
    if (!absPath.endsWith('.json')) continue;
    const relPath = toRepoRelative(repoRoot, absPath);
    let parsed = null;
    try {
      parsed = JSON.parse(fs.readFileSync(absPath, 'utf8'));
    } catch {
      continue;
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) continue;
    if (!Array.isArray(parsed.menus)) continue;
    menuFiles.push(relPath);

    const nodes = [];
    walkMenuNodes(parsed.menus, '$.menus', nodes);
    for (const entry of nodes) {
      enabledWhenNodes += 1;
      if (typeof entry.value === 'string') {
        issues.push({
          code: FAIL_SIGNAL_DSL,
          message: 'String enabledWhen is forbidden; canonical AST required.',
          filePath: relPath,
          path: entry.path,
        });
        continue;
      }
      const state = validateEnabledWhenAst(entry.value);
      if (!state.ok) {
        issues.push({
          code: FAIL_SIGNAL_DSL,
          message: `Invalid enabledWhen AST: ${state.reasonCode}`,
          filePath: relPath,
          path: entry.path,
        });
      }
    }
  }

  const hasIssues = issues.length > 0;
  const result = hasIssues
    ? (mode === MODE_PROMOTION ? RESULT_FAIL : RESULT_WARN)
    : RESULT_PASS;
  const primaryFailSignal = issues.find((item) => item.code === FAIL_SIGNAL_DSL)
    ? FAIL_SIGNAL_DSL
    : (issues.find((item) => item.code === FAIL_SIGNAL_MATRIX) ? FAIL_SIGNAL_MATRIX : '');

  return {
    menuRoot,
    mode,
    enabledWhenNodes,
    filesScanned: menuFiles.sort((a, b) => a.localeCompare(b)),
    issues,
    result,
    failSignalCode: primaryFailSignal,
  };
}

function printState(state, jsonMode) {
  if (jsonMode) {
    process.stdout.write(`${JSON.stringify(state, null, 2)}\n`);
    return;
  }
  process.stdout.write(`ENABLEDWHEN_DSL_FILES_SCANNED=${state.filesScanned.length}\n`);
  process.stdout.write(`ENABLEDWHEN_DSL_NODES=${state.enabledWhenNodes}\n`);
  process.stdout.write(`ENABLEDWHEN_DSL_RESULT=${state.result}\n`);
  if (state.failSignalCode) process.stdout.write(`ENABLEDWHEN_DSL_FAIL_SIGNAL=${state.failSignalCode}\n`);
}

const args = parseArgs(process.argv.slice(2));
const state = evaluateEnabledWhenDslState(args);
printState(state, args.json);
process.exit(state.result === RESULT_FAIL ? 1 : 0);

export {
  evaluateEnabledWhenDslState,
};
