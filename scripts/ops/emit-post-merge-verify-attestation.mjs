#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const TOOL_VERSION = 'post-merge-verify-attestation.v1';
const SCHEMA_VERSION = 'post-merge-strict-verify-attestation.v1';
const ATTESTATION_RELATIVE_PATH = 'docs/OPERATIONS/STATUS/POST_MERGE_STRICT_VERIFY_ATTESTATION.json';
const FAIL_REASON_NETWORK = 'NETWORK_ORIGIN_UNAVAILABLE';
const FAIL_REASON_MISSING_EXPECTED_SHA = 'EXPECTED_MERGE_SHA_REQUIRED';
const FAIL_REASON_STEP_FAILED = 'VERIFY_STEP_FAILED';
const FAIL_REASON_SHA_MISMATCH = 'MERGE_SHA_MISMATCH';
const FAIL_REASON_PROMPT = 'PROMPT_DETECTED';
const PROMPT_NOT_DETECTED = 'NOT_DETECTED';

function parseArgs(argv) {
  return {
    json: argv.includes('--json'),
  };
}

function normalizeSha(value) {
  const sha = String(value || '').trim().toLowerCase();
  return /^[0-9a-f]{40}$/u.test(sha) ? sha : '';
}

function runProcess(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    cwd: options.cwd || process.cwd(),
    env: {
      ...process.env,
      ...(options.env || {}),
    },
  });
  const exitCode = Number.isInteger(result.status) ? result.status : 1;
  return {
    exitCode,
    stdout: String(result.stdout || ''),
    stderr: String(result.stderr || ''),
  };
}

function keyLinesFromOutput(stdout, stderr) {
  const combined = `${String(stdout || '')}\n${String(stderr || '')}`
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean);
  if (combined.length === 0) return [];

  const priority = [];
  for (const line of combined) {
    if (/PROMPT_DETECTION=|DOCTOR_OK|FREEZE_READY_OK=|OPS_SUMMARY_|CHECK_MERGE_READINESS_|FAIL_REASON=|_OK=|_FAIL/u.test(line)) {
      priority.push(line);
    }
  }
  const source = priority.length > 0 ? priority : combined;
  return source.slice(0, 12);
}

function parsePromptDetection(stdout, stderr) {
  const lines = `${String(stdout || '')}\n${String(stderr || '')}`.split(/\r?\n/u);
  for (const line of lines) {
    const match = line.trim().match(/^PROMPT_DETECTION=([A-Z_]+)$/u);
    if (match) return match[1];
  }
  return '';
}

function makeStepDefinitions() {
  return [
    {
      id: 'STEP_01',
      cmd: 'git fetch origin',
      run: (cwd) => runProcess('git', ['fetch', 'origin'], { cwd }),
    },
    {
      id: 'STEP_02',
      cmd: 'git clean -fd',
      run: (cwd) => runProcess('git', ['clean', '-fd'], { cwd }),
    },
    {
      id: 'STEP_03',
      cmd: 'git checkout -B main origin/main',
      run: (cwd) => runProcess('git', ['checkout', '-B', 'main', 'origin/main'], { cwd }),
    },
    {
      id: 'STEP_04',
      cmd: 'git status --porcelain --untracked-files=all',
      run: (cwd) => runProcess('git', ['status', '--porcelain', '--untracked-files=all'], { cwd }),
      validate: (runtime) => {
        const dirty = String(runtime.stdout || '').trim() !== '';
        return {
          ok: !dirty,
          reason: dirty ? 'WORKTREE_NOT_CLEAN' : '',
        };
      },
    },
    {
      id: 'STEP_05',
      cmd: 'node scripts/ops/check-merge-readiness.mjs',
      run: (cwd) => runProcess(process.execPath, ['scripts/ops/check-merge-readiness.mjs'], { cwd }),
    },
    {
      id: 'STEP_06',
      cmd: 'node scripts/ops/emit-ops-summary.mjs',
      run: (cwd) => runProcess(process.execPath, ['scripts/ops/emit-ops-summary.mjs'], { cwd }),
    },
    {
      id: 'STEP_07',
      cmd: 'node scripts/ops/extract-truth-table.mjs --json',
      run: (cwd) => runProcess(process.execPath, ['scripts/ops/extract-truth-table.mjs', '--json'], { cwd }),
    },
    {
      id: 'STEP_08',
      cmd: 'FREEZE_MODE=1 node scripts/ops/freeze-ready-state.mjs --json',
      run: (cwd) => runProcess(process.execPath, ['scripts/ops/freeze-ready-state.mjs', '--json'], {
        cwd,
        env: { FREEZE_MODE: '1' },
      }),
      validate: (runtime) => {
        try {
          const parsed = JSON.parse(String(runtime.stdout || '{}'));
          return {
            ok: parsed && parsed.ok === true,
            reason: parsed && parsed.ok === true ? '' : 'FREEZE_READY_STATE_NOT_OK',
          };
        } catch {
          return {
            ok: false,
            reason: 'FREEZE_READY_STATE_PARSE_FAILED',
          };
        }
      },
    },
    {
      id: 'STEP_09',
      cmd: 'DOCTOR_MODE=delivery node scripts/doctor.mjs',
      run: (cwd) => runProcess(process.execPath, ['scripts/doctor.mjs'], {
        cwd,
        env: { DOCTOR_MODE: 'delivery' },
      }),
      validate: (runtime) => {
        const out = `${String(runtime.stdout || '')}\n${String(runtime.stderr || '')}`;
        const hasDoctorOk = /\bDOCTOR_OK\b/u.test(out);
        const hasWarn = /\bDOCTOR_WARN\b/u.test(out);
        const hasInfo = /\bDOCTOR_INFO\b/u.test(out);
        const ok = hasDoctorOk && !hasWarn && !hasInfo;
        return {
          ok,
          reason: ok ? '' : 'DOCTOR_DELIVERY_STRICT_FAILED',
        };
      },
    },
    {
      id: 'STEP_10',
      cmd: 'npm test',
      run: (cwd) => runProcess('npm', ['test'], { cwd }),
    },
    {
      id: 'STEP_11',
      cmd: 'node scripts/contracts/check-codex-prompt-mode.mjs',
      run: (cwd) => runProcess(process.execPath, ['scripts/contracts/check-codex-prompt-mode.mjs'], { cwd }),
      validate: (runtime) => {
        const promptDetection = parsePromptDetection(runtime.stdout, runtime.stderr);
        return {
          ok: promptDetection === PROMPT_NOT_DETECTED,
          reason: promptDetection === PROMPT_NOT_DETECTED ? '' : 'PROMPT_MODE_DETECTED',
        };
      },
    },
    {
      id: 'STEP_12',
      cmd: 'git merge-base --is-ancestor origin/main HEAD',
      run: (cwd) => runProcess('git', ['merge-base', '--is-ancestor', 'origin/main', 'HEAD'], { cwd }),
    },
    {
      id: 'STEP_13',
      cmd: 'git rev-parse HEAD && git rev-parse origin/main',
      run: (cwd) => {
        const head = runProcess('git', ['rev-parse', 'HEAD'], { cwd });
        if (head.exitCode !== 0) return head;
        const originMain = runProcess('git', ['rev-parse', 'origin/main'], { cwd });
        return {
          exitCode: originMain.exitCode,
          stdout: `${head.stdout.trim()}\n${originMain.stdout.trim()}\n`,
          stderr: `${head.stderr}${originMain.stderr}`,
        };
      },
    },
  ];
}

function buildSkippedSteps(reason) {
  return makeStepDefinitions().map((step) => ({
    id: step.id,
    cmd: step.cmd,
    exitCode: 1,
    ok: false,
    keyLines: [reason],
  }));
}

function runStrictVerifySteps(cwd) {
  const stepDefinitions = makeStepDefinitions();
  const steps = [];
  let promptDetection = '';
  let headSha = '';
  let originMainSha = '';
  let blocked = false;

  for (const step of stepDefinitions) {
    if (blocked) {
      steps.push({
        id: step.id,
        cmd: step.cmd,
        exitCode: 1,
        ok: false,
        keyLines: ['SKIPPED_DUE_TO_PREVIOUS_FAILURE'],
      });
      continue;
    }

    const runtime = step.run(cwd);
    let exitCode = runtime.exitCode;
    let keyLines = keyLinesFromOutput(runtime.stdout, runtime.stderr);
    if (exitCode === 0 && typeof step.validate === 'function') {
      const validation = step.validate(runtime);
      if (!validation.ok) {
        exitCode = 1;
        if (validation.reason) {
          keyLines = [...keyLines, validation.reason].slice(0, 12);
        }
      }
    }
    const ok = exitCode === 0;
    steps.push({
      id: step.id,
      cmd: step.cmd,
      exitCode,
      ok,
      keyLines,
    });

    if (step.id === 'STEP_11') {
      promptDetection = parsePromptDetection(runtime.stdout, runtime.stderr);
    }
    if (step.id === 'STEP_13' && runtime.exitCode === 0) {
      const lines = String(runtime.stdout || '')
        .split(/\r?\n/u)
        .map((line) => line.trim())
        .filter(Boolean);
      headSha = normalizeSha(lines[0] || '');
      originMainSha = normalizeSha(lines[1] || '');
    }
    if (!ok) {
      blocked = true;
    }
  }

  return {
    steps,
    promptDetection: promptDetection || '',
    headSha,
    originMainSha,
  };
}

function normalizeOriginSmoke(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {
      ok: false,
      lsRemoteOk: false,
      fetchOk: false,
      failReason: FAIL_REASON_NETWORK,
    };
  }
  return {
    ok: value.ok === true,
    lsRemoteOk: value.lsRemoteOk === true,
    fetchOk: value.fetchOk === true,
    failReason: String(value.failReason || '').trim(),
  };
}

function normalizeSteps(stepsInput) {
  const expected = makeStepDefinitions();
  const index = new Map();
  for (const step of Array.isArray(stepsInput) ? stepsInput : []) {
    if (!step || typeof step !== 'object') continue;
    const id = String(step.id || '').trim();
    if (!id) continue;
    index.set(id, step);
  }

  const out = [];
  for (const expectedStep of expected) {
    const source = index.get(expectedStep.id);
    const exitCode = Number.isInteger(source && source.exitCode) ? source.exitCode : 1;
    out.push({
      id: expectedStep.id,
      cmd: expectedStep.cmd,
      exitCode,
      ok: exitCode === 0,
      keyLines: Array.isArray(source && source.keyLines)
        ? source.keyLines.map((line) => String(line || '').trim()).filter(Boolean).slice(0, 12)
        : [],
    });
  }
  return out;
}

export function evaluatePostMergeVerifyAttestation(input = {}) {
  const expectedMergeSha = normalizeSha(input.expectedMergeSha);
  const originSmoke = normalizeOriginSmoke(input.originSmoke);
  const steps = normalizeSteps(input.steps);
  const allStepsOk = steps.every((step) => step.exitCode === 0);
  const promptDetection = String(input.promptDetection || '').trim() || 'UNKNOWN';
  const headSha = normalizeSha(input.headSha);
  const originMainSha = normalizeSha(input.originMainSha);
  const equalityOk = Boolean(
    expectedMergeSha
    && headSha
    && originMainSha
    && expectedMergeSha === headSha
    && expectedMergeSha === originMainSha,
  );

  const failures = [];
  if (!originSmoke.ok) failures.push(FAIL_REASON_NETWORK);
  if (!allStepsOk) failures.push(FAIL_REASON_STEP_FAILED);
  if (!equalityOk) failures.push(FAIL_REASON_SHA_MISMATCH);
  if (promptDetection !== PROMPT_NOT_DETECTED) failures.push(FAIL_REASON_PROMPT);

  const verifyAttestationOk = failures.length === 0;
  return {
    schemaVersion: SCHEMA_VERSION,
    expectedMergeSha,
    originSmoke: {
      lsRemoteOk: originSmoke.lsRemoteOk,
      fetchOk: originSmoke.fetchOk,
      ok: originSmoke.ok,
      failReason: originSmoke.failReason,
    },
    steps,
    headSha,
    originMainSha,
    equalityOk,
    promptDetection,
    timestampIso: String(input.timestampIso || new Date().toISOString()),
    verifyAttestationOk,
    stopRequired: verifyAttestationOk ? 0 : 1,
    failures,
    toolVersion: TOOL_VERSION,
  };
}

function runOriginSmoke(cwd) {
  const guardPath = fileURLToPath(new URL('../guards/check-origin-smoke.mjs', import.meta.url));
  const result = runProcess(process.execPath, [guardPath, '--json'], { cwd });
  let parsed = null;
  try {
    parsed = JSON.parse(String(result.stdout || '{}'));
  } catch {
    parsed = null;
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return {
      ok: false,
      lsRemoteOk: false,
      fetchOk: false,
      failReason: FAIL_REASON_NETWORK,
    };
  }
  return parsed;
}

function writeAttestationFile(repoRoot, report) {
  const outputPath = path.join(repoRoot, ATTESTATION_RELATIVE_PATH);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  return outputPath;
}

function printTokens(report, outputPath) {
  console.log(`ORIGIN_SMOKE_OK=${report.originSmoke.ok ? 1 : 0}`);
  console.log(`VERIFY_ATTESTATION_OK=${report.verifyAttestationOk ? 1 : 0}`);
  console.log(`VERIFY_ATTESTATION_PATH=${outputPath}`);
  console.log(`PROMPT_DETECTION=${report.promptDetection}`);
  if (report.failures.length > 0) {
    console.log(`FAIL_REASON=${report.failures[0]}`);
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const expectedMergeSha = normalizeSha(process.env.EXPECTED_MERGE_SHA);
  const repoRoot = path.resolve(process.env.VERIFY_CLONE_PATH || process.cwd());

  if (!expectedMergeSha) {
    const report = evaluatePostMergeVerifyAttestation({
      expectedMergeSha: '',
      originSmoke: {
        ok: false,
        lsRemoteOk: false,
        fetchOk: false,
        failReason: FAIL_REASON_MISSING_EXPECTED_SHA,
      },
      steps: buildSkippedSteps('EXPECTED_MERGE_SHA_NOT_PROVIDED'),
      headSha: '',
      originMainSha: '',
      promptDetection: 'UNKNOWN',
    });
    report.failures.unshift(FAIL_REASON_MISSING_EXPECTED_SHA);
    report.verifyAttestationOk = false;
    report.stopRequired = 1;
    const outputPath = writeAttestationFile(repoRoot, report);
    if (args.json) {
      process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    } else {
      printTokens(report, outputPath);
    }
    process.exit(1);
  }

  const originSmoke = runOriginSmoke(repoRoot);
  let runtime = {
    steps: buildSkippedSteps('ORIGIN_SMOKE_FAILED'),
    promptDetection: 'UNKNOWN',
    headSha: '',
    originMainSha: '',
  };

  if (originSmoke.ok === true) {
    runtime = runStrictVerifySteps(repoRoot);
  }

  const report = evaluatePostMergeVerifyAttestation({
    expectedMergeSha,
    originSmoke,
    steps: runtime.steps,
    headSha: runtime.headSha,
    originMainSha: runtime.originMainSha,
    promptDetection: runtime.promptDetection,
  });
  const outputPath = writeAttestationFile(repoRoot, report);

  if (args.json) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } else {
    printTokens(report, outputPath);
  }
  process.exit(report.verifyAttestationOk ? 0 : 1);
}

const selfPath = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === selfPath) {
  main();
}
