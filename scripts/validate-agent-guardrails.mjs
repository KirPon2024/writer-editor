#!/usr/bin/env node
import {
  parseArgs,
  printResult,
  resolveRepoRoot,
  validateRepositoryGuardrails,
} from './agent-guardrails-lib.mjs';

const args = parseArgs(process.argv.slice(2));
try {
  const result = validateRepositoryGuardrails({ repoRoot: resolveRepoRoot() });
  printResult(result, args.json === true);
  if (!result.ok) process.exitCode = 1;
} catch (error) {
  printResult({ ok: false, errors: [{ code: 'E_AGENT_GUARDRAIL_UNHANDLED', message: error.message }] }, args.json === true);
  process.exitCode = 1;
}
