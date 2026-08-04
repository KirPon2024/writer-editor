#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import {
  parseArgs,
  printResult,
  resolveRepoRoot,
  validateTaskDeclaration,
} from './agent-guardrails-lib.mjs';

const args = parseArgs(process.argv.slice(2));
try {
  if (typeof args.declaration !== 'string' || args.declaration.trim() === '') {
    throw new Error('E_TASK_DECLARATION_PATH_REQUIRED');
  }
  const repoRoot = resolveRepoRoot();
  const declarationPath = path.resolve(process.cwd(), args.declaration);
  if (!fs.existsSync(declarationPath)) throw new Error(`E_TASK_DECLARATION_FILE_MISSING:${declarationPath}`);
  const declaration = JSON.parse(fs.readFileSync(declarationPath, 'utf8'));
  const result = validateTaskDeclaration({ repoRoot, declaration });
  printResult(result, args.json === true);
  if (!result.ok) process.exitCode = 1;
} catch (error) {
  printResult({ ok: false, errors: [{ code: 'E_TASK_DECLARATION_INVALID', message: error.message }] }, args.json === true);
  process.exitCode = 1;
}
