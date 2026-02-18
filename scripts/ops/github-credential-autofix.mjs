#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HANDOFF_ID = 'AUTOMATION_HANDOFF_MINIMAL_CLICKS';
const DEFAULT_RESUME_FROM_STEP = 'STEP_08_PUSH';
const DEFAULT_FAIL_REASON = 'PUSH_BLOCKED_MISSING_WORKFLOW_SCOPE';
const DEFAULT_WORKFLOW_PATH = '.github/workflows/ops-vector-close.yml';
const DEFAULT_REMOTE_FALLBACK = 'https://github.com/KirPon2024/writer-editor.git';

const WORKFLOW_SCOPE_MARKERS = Object.freeze([
  'refusing to allow a personal access token to create or update workflow',
  "without 'workflow' scope",
  DEFAULT_FAIL_REASON.toLowerCase(),
]);

function normalizeString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeStatus(value) {
  if (typeof value === 'number' && Number.isInteger(value)) return value;
  return 1;
}

function isObjectRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function safeTextSlice(value, max = 512) {
  const text = String(value || '');
  if (text.length <= max) return text;
  return `${text.slice(0, max)}...`;
}

function parseArgs(argv = process.argv.slice(2)) {
  const out = {
    json: false,
    resumeFromStep: DEFAULT_RESUME_FROM_STEP,
    failReason: DEFAULT_FAIL_REASON,
    workflowPath: DEFAULT_WORKFLOW_PATH,
    remoteFallback: DEFAULT_REMOTE_FALLBACK,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = normalizeString(argv[i]);
    if (!arg) continue;
    if (arg === '--json') {
      out.json = true;
      continue;
    }
    if (arg === '--resume-from-step' && i + 1 < argv.length) {
      out.resumeFromStep = normalizeString(argv[i + 1]) || DEFAULT_RESUME_FROM_STEP;
      i += 1;
      continue;
    }
    if (arg.startsWith('--resume-from-step=')) {
      out.resumeFromStep = normalizeString(arg.slice('--resume-from-step='.length)) || DEFAULT_RESUME_FROM_STEP;
      continue;
    }
    if (arg === '--fail-reason' && i + 1 < argv.length) {
      out.failReason = normalizeString(argv[i + 1]) || DEFAULT_FAIL_REASON;
      i += 1;
      continue;
    }
    if (arg.startsWith('--fail-reason=')) {
      out.failReason = normalizeString(arg.slice('--fail-reason='.length)) || DEFAULT_FAIL_REASON;
      continue;
    }
    if (arg === '--workflow-path' && i + 1 < argv.length) {
      out.workflowPath = normalizeString(argv[i + 1]) || DEFAULT_WORKFLOW_PATH;
      i += 1;
      continue;
    }
    if (arg.startsWith('--workflow-path=')) {
      out.workflowPath = normalizeString(arg.slice('--workflow-path='.length)) || DEFAULT_WORKFLOW_PATH;
      continue;
    }
    if (arg === '--remote-fallback' && i + 1 < argv.length) {
      out.remoteFallback = normalizeString(argv[i + 1]) || DEFAULT_REMOTE_FALLBACK;
      i += 1;
      continue;
    }
    if (arg.startsWith('--remote-fallback=')) {
      out.remoteFallback = normalizeString(arg.slice('--remote-fallback='.length)) || DEFAULT_REMOTE_FALLBACK;
    }
  }

  return out;
}

export function detectWorkflowScopePushBlock(detail = '') {
  const text = String(detail || '').toLowerCase();
  if (!text) return false;
  const hasExplicitFailReason = text.includes(DEFAULT_FAIL_REASON.toLowerCase());
  const hasWorkflowBlockTuple = text.includes(WORKFLOW_SCOPE_MARKERS[0]) && text.includes(WORKFLOW_SCOPE_MARKERS[1]);
  return hasExplicitFailReason || hasWorkflowBlockTuple;
}

function parseOriginUrls(remoteText, fallbackUrl = DEFAULT_REMOTE_FALLBACK) {
  const lines = String(remoteText || '').split(/\r?\n/u);
  let pushUrl = '';
  let fetchUrl = '';
  for (const lineRaw of lines) {
    const line = lineRaw.trim();
    const match = line.match(/^origin\s+(\S+)\s+\((fetch|push)\)$/u);
    if (!match) continue;
    if (match[2] === 'push') pushUrl = match[1];
    if (match[2] === 'fetch') fetchUrl = match[1];
  }

  const remoteUrl = pushUrl || fetchUrl || normalizeString(fallbackUrl) || DEFAULT_REMOTE_FALLBACK;
  const httpsMatch = remoteUrl.match(/^https:\/\/([^/]+)\/([^/]+\/[^/]+(?:\.git)?)$/u);
  if (httpsMatch) {
    return {
      remoteUrl,
      fetchUrl: fetchUrl || remoteUrl,
      pushUrl: pushUrl || remoteUrl,
      host: httpsMatch[1],
      repoPath: httpsMatch[2],
      owner: httpsMatch[2].split('/')[0],
      isHttps: true,
    };
  }

  const sshShortMatch = remoteUrl.match(/^git@([^:]+):([^/]+\/[^/]+(?:\.git)?)$/u);
  if (sshShortMatch) {
    return {
      remoteUrl,
      fetchUrl: fetchUrl || remoteUrl,
      pushUrl: pushUrl || remoteUrl,
      host: sshShortMatch[1],
      repoPath: sshShortMatch[2],
      owner: sshShortMatch[2].split('/')[0],
      isHttps: false,
    };
  }

  const sshUrlMatch = remoteUrl.match(/^ssh:\/\/git@([^/]+)\/([^/]+\/[^/]+(?:\.git)?)$/u);
  if (sshUrlMatch) {
    return {
      remoteUrl,
      fetchUrl: fetchUrl || remoteUrl,
      pushUrl: pushUrl || remoteUrl,
      host: sshUrlMatch[1],
      repoPath: sshUrlMatch[2],
      owner: sshUrlMatch[2].split('/')[0],
      isHttps: false,
    };
  }

  return {
    remoteUrl,
    fetchUrl: fetchUrl || remoteUrl,
    pushUrl: pushUrl || remoteUrl,
    host: 'github.com',
    repoPath: 'KirPon2024/writer-editor.git',
    owner: 'KirPon2024',
    isHttps: false,
  };
}

function parseCredentialFillOutput(stdoutText = '') {
  const lines = String(stdoutText || '').split(/\r?\n/u).map((line) => line.trim()).filter(Boolean);
  let username = '';
  let passwordPresent = false;
  let host = '';
  let protocol = '';
  let pathValue = '';

  for (const line of lines) {
    const idx = line.indexOf('=');
    if (idx <= 0) continue;
    const key = line.slice(0, idx);
    const value = line.slice(idx + 1);
    if (key === 'username') username = value;
    if (key === 'password') passwordPresent = value.length > 0;
    if (key === 'host') host = value;
    if (key === 'protocol') protocol = value;
    if (key === 'path') pathValue = value;
  }

  return {
    username,
    usernamePresent: username.length > 0,
    passwordPresent,
    host,
    protocol,
    path: pathValue,
    credentialFound: username.length > 0 || passwordPresent,
  };
}

function buildCredentialFillInput({ host, repoPath, username, includePath, includeUsername }) {
  const lines = ['protocol=https', `host=${host}`];
  if (includePath) lines.push(`path=${repoPath}`);
  if (includeUsername) lines.push(`username=${username}`);
  lines.push('');
  lines.push('');
  return lines.join('\n');
}

function makeDefaultRunner() {
  return function defaultRunner(step) {
    const result = spawnSync(step.cmd, step.args, {
      encoding: 'utf8',
      input: step.input,
      env: step.env || process.env,
    });
    return {
      status: normalizeStatus(result.status),
      stdout: String(result.stdout || ''),
      stderr: String(result.stderr || ''),
      error: result.error ? String(result.error.message || result.error) : '',
    };
  };
}

function runStep(runner, step) {
  const raw = runner(step);
  return {
    status: normalizeStatus(raw && raw.status),
    stdout: String(raw && raw.stdout ? raw.stdout : ''),
    stderr: String(raw && raw.stderr ? raw.stderr : ''),
    error: String(raw && raw.error ? raw.error : ''),
    label: step.label,
  };
}

function withInteractivePromptEnv() {
  const env = { ...process.env, GIT_TERMINAL_PROMPT: '1' };
  delete env.GIT_ASKPASS;
  delete env.SSH_ASKPASS;
  return env;
}

function summarizeCommandOutcome(result) {
  return {
    exitCode: normalizeStatus(result.status),
    stderrSample: safeTextSlice(result.stderr, 220),
    stdoutSample: safeTextSlice(result.stdout, 220),
    errorSample: safeTextSlice(result.error, 220),
  };
}

function pushAttempt(runner, label, env) {
  return runStep(runner, {
    label,
    cmd: 'git',
    args: ['push', '-u', 'origin', 'HEAD'],
    env,
  });
}

function buildHandoffPayload({
  resumeFromStep,
  workflowPath,
  remoteUrl,
  failReason,
}) {
  return {
    humanActionRequired: true,
    handoffReason: failReason,
    clickList: [
      {
        id: 'click-01',
        surface: 'github_ui',
        action: 'Open token settings',
        target: 'https://github.com/settings/tokens',
        expectedResult: 'Able to create or view a classic PAT with workflow scope',
        resumeFromStep,
      },
      {
        id: 'click-02',
        surface: 'github_ui',
        action: 'Create a new classic PAT with repo and workflow scopes',
        target: 'https://github.com/settings/tokens/new',
        expectedResult: 'Token scopes include repo and workflow',
        resumeFromStep,
      },
      {
        id: 'click-03',
        surface: 'other',
        action: 'Rebind git/github credential to use the new PAT',
        target: 'macOS Keychain Access or GH_TOKEN/GITHUB_TOKEN in active session',
        expectedResult: 'Next git push uses PAT with workflow scope',
        resumeFromStep,
      },
    ],
    resumeFromStep,
    artifacts: [workflowPath, remoteUrl],
    requiredFacts: [
      'CLICK_02_PATH_TAKEN: B',
      'WORKFLOW_SCOPE_EVIDENCE: token_name=<NAME>, token_type=classic, scopes=repo,workflow',
      'PUSH_CREDENTIAL_ASSERTION: Keychain github.com credential deleted/replaced; next push prompted_and_used_new_PAT',
    ],
  };
}

function makeRemediationSteps({ host, repoPath, username }) {
  return [
    {
      id: 'REM-1',
      actions: [
        {
          label: 'REM1_UNSET_LOCAL_HELPER',
          cmd: 'git',
          args: ['config', '--local', '--unset-all', 'credential.helper'],
        },
      ],
    },
    {
      id: 'REM-2',
      actions: [
        {
          label: 'REM2_ERASE_HOST_PATH',
          cmd: 'git',
          args: ['credential-osxkeychain', 'erase'],
          input: `protocol=https\nhost=${host}\npath=${repoPath}\n\n`,
        },
        {
          label: 'REM2_ERASE_HOST_PATH_USERNAME',
          cmd: 'git',
          args: ['credential-osxkeychain', 'erase'],
          input: `protocol=https\nhost=${host}\npath=${repoPath}\nusername=${username}\n\n`,
        },
      ],
    },
    {
      id: 'REM-3',
      actions: [
        {
          label: 'REM3_ERASE_HOST_ONLY',
          cmd: 'git',
          args: ['credential-osxkeychain', 'erase'],
          input: `protocol=https\nhost=${host}\n\n`,
        },
        {
          label: 'REM3_ERASE_HOST_USERNAME',
          cmd: 'git',
          args: ['credential-osxkeychain', 'erase'],
          input: `protocol=https\nhost=${host}\nusername=${username}\n\n`,
        },
      ],
    },
  ];
}

function probeCredentialVariants(runner, remoteMeta) {
  const variants = [
    { id: 'host_only', includePath: false, includeUsername: false },
    { id: 'host_username', includePath: false, includeUsername: true },
    { id: 'host_path', includePath: true, includeUsername: false },
    { id: 'host_path_username', includePath: true, includeUsername: true },
  ];

  const probes = [];
  for (const variant of variants) {
    const input = buildCredentialFillInput({
      host: remoteMeta.host,
      repoPath: remoteMeta.repoPath,
      username: remoteMeta.owner,
      includePath: variant.includePath,
      includeUsername: variant.includeUsername,
    });
    const result = runStep(runner, {
      label: `DIAG_CRED_FILL_${variant.id.toUpperCase()}`,
      cmd: 'git',
      args: ['credential', 'fill'],
      input,
    });
    const parsed = parseCredentialFillOutput(result.stdout);
    probes.push({
      variant: variant.id,
      exitCode: normalizeStatus(result.status),
      credentialFound: parsed.credentialFound,
      usernamePresent: parsed.usernamePresent,
      passwordPresent: parsed.passwordPresent,
      username: parsed.usernamePresent ? parsed.username : '',
      stderrSample: safeTextSlice(result.stderr, 160),
    });
  }

  const matched = probes.filter((entry) => entry.credentialFound);
  const specificity = ['host_path_username', 'host_path', 'host_username', 'host_only'];
  let credentialPath = 'none';
  for (const variant of specificity) {
    if (matched.some((entry) => entry.variant === variant)) {
      credentialPath = variant;
      break;
    }
  }

  return {
    probes,
    credentialPath,
  };
}

function collectDiagnostics(runner, remoteFallback) {
  const remoteResult = runStep(runner, {
    label: 'DIAG_GIT_REMOTE',
    cmd: 'git',
    args: ['remote', '-v'],
  });
  const remoteMeta = parseOriginUrls(remoteResult.stdout, remoteFallback);

  const helperLocal = runStep(runner, {
    label: 'DIAG_HELPER_LOCAL',
    cmd: 'git',
    args: ['config', '--local', '--get-all', 'credential.helper'],
  });
  const helperGlobal = runStep(runner, {
    label: 'DIAG_HELPER_GLOBAL',
    cmd: 'git',
    args: ['config', '--global', '--get-all', 'credential.helper'],
  });
  const helperSystem = runStep(runner, {
    label: 'DIAG_HELPER_SYSTEM',
    cmd: 'git',
    args: ['config', '--system', '--get-all', 'credential.helper'],
  });
  const ghAuth = runStep(runner, {
    label: 'DIAG_GH_AUTH_STATUS',
    cmd: 'gh',
    args: ['auth', 'status', '--hostname', 'github.com'],
  });
  const credentialProbes = probeCredentialVariants(runner, remoteMeta);

  return {
    remote: {
      pushUrl: remoteMeta.pushUrl,
      fetchUrl: remoteMeta.fetchUrl,
      remoteUrl: remoteMeta.remoteUrl,
      isHttps: remoteMeta.isHttps,
      host: remoteMeta.host,
      repoPath: remoteMeta.repoPath,
      owner: remoteMeta.owner,
    },
    credentialHelpers: {
      local: String(helperLocal.stdout || '').trim().split(/\r?\n/u).filter(Boolean),
      global: String(helperGlobal.stdout || '').trim().split(/\r?\n/u).filter(Boolean),
      system: String(helperSystem.stdout || '').trim().split(/\r?\n/u).filter(Boolean),
      localExitCode: normalizeStatus(helperLocal.status),
      globalExitCode: normalizeStatus(helperGlobal.status),
      systemExitCode: normalizeStatus(helperSystem.status),
    },
    ghAuth: {
      ok: normalizeStatus(ghAuth.status) === 0,
      exitCode: normalizeStatus(ghAuth.status),
      stderrSample: safeTextSlice(ghAuth.stderr, 220),
      stdoutSample: safeTextSlice(ghAuth.stdout, 220),
    },
    credentialFill: credentialProbes,
  };
}

function remediationResultRecord(remediationId, actionOutcomes, pushOutcome) {
  return {
    remediationId,
    actions: actionOutcomes,
    pushAttempt: pushOutcome,
  };
}

export function runGithubCredentialAutofix(input = {}) {
  const runner = typeof input.runner === 'function' ? input.runner : makeDefaultRunner();
  const resumeFromStep = normalizeString(input.resumeFromStep) || DEFAULT_RESUME_FROM_STEP;
  const failReason = normalizeString(input.failReason) || DEFAULT_FAIL_REASON;
  const workflowPath = normalizeString(input.workflowPath) || DEFAULT_WORKFLOW_PATH;
  const remoteFallback = normalizeString(input.remoteFallback) || DEFAULT_REMOTE_FALLBACK;

  const attempts = [];
  const remediationTrace = [];

  const initialPush = pushAttempt(runner, 'PUSH_INITIAL', process.env);
  attempts.push({
    id: 'PUSH_INITIAL',
    ...summarizeCommandOutcome(initialPush),
    workflowScopeBlocked: detectWorkflowScopePushBlock(`${initialPush.stderr}\n${initialPush.stdout}`),
  });

  if (normalizeStatus(initialPush.status) === 0) {
    return {
      ok: true,
      status: 'PASS',
      stopRequired: 0,
      humanActionRequired: 0,
      failReason: '',
      resumeFromStep,
      handoffId: '',
      push: {
        succeeded: true,
        successfulAttempt: 'PUSH_INITIAL',
        attempts,
      },
      diagnostics: null,
      remediations: remediationTrace,
      handoff: null,
    };
  }

  const initialWorkflowBlocked = detectWorkflowScopePushBlock(`${initialPush.stderr}\n${initialPush.stdout}`);
  if (!initialWorkflowBlocked) {
    return {
      ok: false,
      status: 'STOP_REQUIRED',
      stopRequired: 1,
      humanActionRequired: 0,
      failReason: 'PUSH_FAILED_NON_WORKFLOW_SCOPE',
      resumeFromStep,
      handoffId: '',
      push: {
        succeeded: false,
        successfulAttempt: '',
        attempts,
      },
      diagnostics: null,
      remediations: remediationTrace,
      handoff: null,
    };
  }

  const diagnostics = collectDiagnostics(runner, remoteFallback);
  const remediationSteps = makeRemediationSteps({
    host: diagnostics.remote.host,
    repoPath: diagnostics.remote.repoPath,
    username: diagnostics.remote.owner,
  });

  for (const remediation of remediationSteps) {
    const actionOutcomes = [];
    for (const action of remediation.actions) {
      const actionResult = runStep(runner, action);
      actionOutcomes.push({
        id: action.label,
        ...summarizeCommandOutcome(actionResult),
      });
    }

    const pushAfter = pushAttempt(runner, `PUSH_AFTER_${remediation.id}`, withInteractivePromptEnv());
    const pushSummary = {
      id: `PUSH_AFTER_${remediation.id}`,
      ...summarizeCommandOutcome(pushAfter),
      workflowScopeBlocked: detectWorkflowScopePushBlock(`${pushAfter.stderr}\n${pushAfter.stdout}`),
    };
    attempts.push(pushSummary);
    remediationTrace.push(remediationResultRecord(remediation.id, actionOutcomes, pushSummary));

    if (normalizeStatus(pushAfter.status) === 0) {
      return {
        ok: true,
        status: 'PASS',
        stopRequired: 0,
        humanActionRequired: 0,
        failReason: '',
        resumeFromStep,
        handoffId: '',
        push: {
          succeeded: true,
          successfulAttempt: `PUSH_AFTER_${remediation.id}`,
          attempts,
        },
        diagnostics,
        remediations: remediationTrace,
        handoff: null,
      };
    }

    if (!pushSummary.workflowScopeBlocked) {
      return {
        ok: false,
        status: 'STOP_REQUIRED',
        stopRequired: 1,
        humanActionRequired: 0,
        failReason: 'PUSH_FAILED_AFTER_AUTOFIX',
        resumeFromStep,
        handoffId: '',
        push: {
          succeeded: false,
          successfulAttempt: '',
          attempts,
        },
        diagnostics,
        remediations: remediationTrace,
        handoff: null,
      };
    }
  }

  const handoff = buildHandoffPayload({
    resumeFromStep,
    workflowPath,
    remoteUrl: diagnostics.remote.pushUrl,
    failReason,
  });

  return {
    ok: false,
    status: 'HUMAN_ACTION_REQUIRED',
    stopRequired: 1,
    humanActionRequired: 1,
    failReason,
    resumeFromStep,
    handoffId: HANDOFF_ID,
    push: {
      succeeded: false,
      successfulAttempt: '',
      attempts,
    },
    diagnostics,
    remediations: remediationTrace,
    handoff,
  };
}

function printTokens(result) {
  process.stdout.write(`GITHUB_CREDENTIAL_AUTOFIX_STATUS=${result.status}\n`);
  process.stdout.write(`STOP_REQUIRED=${result.stopRequired}\n`);
  process.stdout.write(`HUMAN_ACTION_REQUIRED=${result.humanActionRequired}\n`);
  process.stdout.write(`FAIL_REASON=${result.failReason || 'NONE'}\n`);
  process.stdout.write(`RESUME_FROM_STEP=${result.resumeFromStep}\n`);
  process.stdout.write(`PUSH_SUCCEEDED=${result.push && result.push.succeeded ? 1 : 0}\n`);
  process.stdout.write(`PUSH_ATTEMPTS=${Array.isArray(result.push && result.push.attempts) ? result.push.attempts.length : 0}\n`);
  process.stdout.write(`HANDOFF_ID=${result.handoffId || 'NONE'}\n`);
  if (result.handoff) {
    process.stdout.write(`HANDOFF_REASON=${result.handoff.handoffReason}\n`);
    process.stdout.write(`CLICK_LIST_IDS=${result.handoff.clickList.map((entry) => entry.id).join(',')}\n`);
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const state = runGithubCredentialAutofix(args);
  if (args.json) {
    process.stdout.write(`${JSON.stringify(state, null, 2)}\n`);
  } else {
    printTokens(state);
  }
  process.exit(state.ok ? 0 : 1);
}

const selfPath = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === selfPath) {
  main();
}
