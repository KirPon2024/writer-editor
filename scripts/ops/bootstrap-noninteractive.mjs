#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ASKPASS_CANDIDATES = ['/usr/bin/true', '/bin/true'];

export function applyNonInteractiveEnv(targetEnv = process.env) {
  targetEnv.GIT_TERMINAL_PROMPT = '0';
  targetEnv.CI = '1';

  let askPass = typeof targetEnv.GIT_ASKPASS === 'string' && targetEnv.GIT_ASKPASS.trim()
    ? targetEnv.GIT_ASKPASS.trim()
    : '';

  if (!askPass) {
    askPass = ASKPASS_CANDIDATES.find((candidate) => fs.existsSync(candidate)) || 'true';
    targetEnv.GIT_ASKPASS = askPass;
  }

  const ok = targetEnv.GIT_TERMINAL_PROMPT === '0' && targetEnv.CI === '1' && typeof askPass === 'string' && askPass.length > 0;

  return {
    ok,
    gitTerminalPrompt: targetEnv.GIT_TERMINAL_PROMPT,
    gitAskPass: askPass,
    ci: targetEnv.CI,
  };
}

function printToken(key, value) {
  console.log(`${key}=${value}`);
}

function main() {
  const bootstrap = applyNonInteractiveEnv(process.env);
  if (!bootstrap.ok) {
    printToken('NON_INTERACTIVE_BOOTSTRAP_OK', 0);
    printToken('FAIL_REASON', 'NON_INTERACTIVE_BOOTSTRAP_FAILED');
    process.exit(1);
  }

  printToken('NON_INTERACTIVE_BOOTSTRAP_OK', 1);
  printToken('NON_INTERACTIVE_GIT_TERMINAL_PROMPT', bootstrap.gitTerminalPrompt);
  printToken('NON_INTERACTIVE_GIT_ASKPASS', bootstrap.gitAskPass);
  printToken('NON_INTERACTIVE_CI', bootstrap.ci);
  printToken('PROMPT_LAYER_ALLOWED', 'RUNNER_UI_ONCE');
  printToken('PROMPT_LAYER_REPO_ALLOWED', 0);
  printToken('PROMPT_DETECTION', 'NOT_DETECTED');
  printToken('PROMPT_LAYER', 'RUNNER_UI');
}

const selfPath = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === selfPath) {
  main();
}
