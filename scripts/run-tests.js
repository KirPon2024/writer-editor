const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const FAST_LANE_CONTRACT_TESTS = Object.freeze([
  'test/contracts/menu-config-backcompat.contract.test.js',
  'test/contracts/codex-no-repo-prompts.contract.test.js',
  'test/contracts/command-surface-bus-only.contract.test.js',
  'test/contracts/transition-exit-failsignal-token-wiring.contract.test.js',
]);

const TOOLBAR_CLOSEOUT_TESTS = Object.freeze([
  'test/unit/toolbar-profile-state.foundation.test.js',
  'test/unit/toolbar-runtime-projection.helpers.test.js',
  'test/unit/sector-m-toolbar-profile-switch.test.js',
  'test/unit/sector-m-toolbar-profile-ordering.test.js',
  'test/unit/toolbar-expansion-wave-c1.helpers.test.js',
  'test/contracts/phase03-safe-reset-last-stable-foundation-state.contract.test.js',
  'test/contracts/phase03-safe-reset-last-stable-artifact-state.contract.test.js',
]);

const ATLAS_EVENT_CONTRACT_TESTS = Object.freeze([
  'test/contracts/collab-apply-no-network-wiring.contract.test.js',
  'test/contracts/collab-apply-pipeline-deterministic.contract.test.js',
  'test/contracts/collab-apply-pipeline-typed-errors.contract.test.js',
  'test/contracts/yalken-atlas-v5-e10-c03-operation-replay-command-event-log.contract.test.js',
  'test/contracts/yalken-atlas-v5-p1-domain-event-contract-repair.contract.test.js',
]);

const FAST_LANE_FORBIDDEN_SEGMENTS = Object.freeze([
  'scripts/ops/run-wave.mjs',
  'scripts/guards/ops-current-wave-stop.mjs',
  'ops:current-wave',
  'ops-synth-negative.test.cjs',
  'OPS_SYNTH_OVERRIDE_',
]);

const CHECK_MODE_RELEASE = 'release';
const CHECK_MODE_PROMOTION = 'promotion';

function parseBooleanish(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return false;
  return normalized === '1'
    || normalized === 'true'
    || normalized === 'yes'
    || normalized === 'on';
}

function normalizeCheckMode(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === CHECK_MODE_PROMOTION) return CHECK_MODE_PROMOTION;
  if (normalized === CHECK_MODE_RELEASE) return CHECK_MODE_RELEASE;
  return '';
}

function parseCli(rawArgs) {
  const out = {
    dryRun: false,
    modeArg: '',
    explicitTests: [],
    checkMode: CHECK_MODE_RELEASE,
    error: '',
  };

  const tokens = [];
  let checkModeArg = '';
  for (let i = 0; i < rawArgs.length; i += 1) {
    const arg = String(rawArgs[i] || '').trim();
    if (!arg) continue;
    if (arg === '--dry-run') {
      out.dryRun = true;
      continue;
    }
    if (arg.startsWith('--mode=')) {
      checkModeArg = arg.slice('--mode='.length);
      continue;
    }
    if (arg === '--mode') {
      if (i + 1 >= rawArgs.length) {
        out.error = 'Missing value for --mode (expected release|promotion).';
        return out;
      }
      checkModeArg = String(rawArgs[i + 1] || '').trim();
      i += 1;
      continue;
    }
    if (arg === '--promotionMode' && i + 1 < rawArgs.length) {
      checkModeArg = parseBooleanish(rawArgs[i + 1]) ? CHECK_MODE_PROMOTION : CHECK_MODE_RELEASE;
      i += 1;
      continue;
    }
    if (arg.startsWith('--promotionMode=')) {
      checkModeArg = parseBooleanish(arg.slice('--promotionMode='.length))
        ? CHECK_MODE_PROMOTION
        : CHECK_MODE_RELEASE;
      continue;
    }
    tokens.push(arg);
  }

  out.modeArg = tokens[0] || '';
  out.explicitTests = tokens.filter((arg) => /\.test\.(?:js|mjs)$/u.test(arg));

  if (checkModeArg) {
    const normalizedMode = normalizeCheckMode(checkModeArg);
    if (!normalizedMode) {
      out.error = `Invalid --mode value "${checkModeArg}" (expected release|promotion).`;
      return out;
    }
    out.checkMode = normalizedMode;
  }

  return out;
}

function runOpsSynthNegativeTests(rootDir) {
  // R2.4 E0: the synthetic doctor negative suite is a committed static file.
  // Self-materializing a test into a fixed predictable /tmp path at run time
  // is quarantined: no run-time write, no fixed path, no self-authored
  // oracle materialization.
  const committedTestPath = path.join(rootDir, 'scripts', 'ops', 'ops-synth-negative.test.cjs');
  if (!fs.existsSync(committedTestPath)) {
    console.error('E_OPS_SYNTH_NEGATIVE_TEST_MISSING=1');
    return 1;
  }
  const result = spawnSync(process.execPath, ['--test', committedTestPath], {
    cwd: rootDir,
    stdio: 'inherit'
  });
  return result.status ?? 1;
}

function listTestFiles(dir, out = []) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      listTestFiles(fullPath, out);
      continue;
    }

    if (entry.isFile() && /\.test\.(?:js|mjs)$/u.test(entry.name)) {
      out.push(fullPath);
    }
  }

  return out;
}

function buildFastLanePlan(rootDir) {
  const fastTestsAbs = FAST_LANE_CONTRACT_TESTS
    .map((item) => path.resolve(rootDir, item))
    .sort();

  const doctorArgs = ['scripts/doctor.mjs', '--strict'];
  const testArgs = ['--test', ...fastTestsAbs];
  const doctorCommand = [process.execPath, ...doctorArgs].join(' ');
  const testCommand = [process.execPath, ...testArgs].join(' ');
  const commands = [doctorCommand, testCommand];
  const forbiddenHits = [];

  for (const command of commands) {
    for (const forbidden of FAST_LANE_FORBIDDEN_SEGMENTS) {
      if (command.includes(forbidden)) forbiddenHits.push({ command, forbidden });
    }
  }

  return {
    mode: 'fast',
    doctorRunCount: 1,
    testFiles: FAST_LANE_CONTRACT_TESTS.slice(),
    doctorCommand,
    testCommand,
    forbiddenHits,
  };
}

function runFastLane(rootDir, dryRun) {
  const plan = buildFastLanePlan(rootDir);
  if (dryRun) {
    process.stdout.write(`${JSON.stringify(plan, null, 2)}\n`);
    return 0;
  }

  if (plan.forbiddenHits.length > 0) {
    console.error(`DEV_FAST_LANE_FORBIDDEN_SEGMENT=${JSON.stringify(plan.forbiddenHits)}`);
    return 1;
  }

  const env = {
    ...process.env,
    DEV_FAST_LANE: '1',
    CHECKS_BASELINE_VERSION: 'v1.3',
    EFFECTIVE_MODE: 'STRICT',
  };

  const doctor = spawnSync(process.execPath, ['scripts/doctor.mjs', '--strict'], {
    cwd: rootDir,
    stdio: 'inherit',
    env,
  });
  const doctorExit = doctor.status ?? 1;
  if (doctorExit !== 0) return doctorExit;

  const fastTestsAbs = plan.testFiles
    .map((item) => path.resolve(rootDir, item))
    .sort();
  const tests = spawnSync(process.execPath, ['--test', ...fastTestsAbs], {
    cwd: rootDir,
    stdio: 'inherit',
    env,
  });
  return tests.status ?? 1;
}

function readSkippedCount(stdout, stderr) {
  const combined = `${String(stdout || '')}\n${String(stderr || '')}`;
  const matches = [...combined.matchAll(/# skipped (\d+)/g)];
  if (matches.length === 0) return 0;
  const value = Number(matches[matches.length - 1][1]);
  return Number.isInteger(value) ? value : 0;
}

function readTapTotals(stdout, stderr) {
  const combined = `${String(stdout || '')}\n${String(stderr || '')}`;
  const last = (key) => {
    const matches = [...combined.matchAll(new RegExp(`^[#ℹ]\\s+${key} (\\d+)$`, 'gm'))];
    if (matches.length === 0) return null;
    const value = Number(matches[matches.length - 1][1]);
    return Number.isInteger(value) ? value : null;
  };
  const pass = last('pass');
  const fail = last('fail');
  const skipped = last('skipped');
  const executed = pass === null && fail === null ? null : (pass ?? 0) + (fail ?? 0);
  return { pass, fail, skipped, executed };
}

function runToolbarCloseoutLane(rootDir, dryRun) {
  const testsAbs = TOOLBAR_CLOSEOUT_TESTS
    .map((item) => path.resolve(rootDir, item))
    .sort();

  if (dryRun) {
    process.stdout.write(`${JSON.stringify({
      mode: 'closeout',
      failOnSkip: true,
      testFiles: TOOLBAR_CLOSEOUT_TESTS.slice(),
      command: [process.execPath, '--test', ...testsAbs].join(' '),
    }, null, 2)}\n`);
    return 0;
  }

  const result = spawnSync(process.execPath, ['--test', ...testsAbs], {
    cwd: rootDir,
    encoding: 'utf8',
  });

  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);

  const exitCode = result.status ?? 1;
  const skippedCount = readSkippedCount(result.stdout, result.stderr);
  if (skippedCount > 0) {
    console.error(`TOOLBAR_CLOSEOUT_SKIP_COUNT=${skippedCount}`);
    return 1;
  }

  return exitCode;
}

function runPerfBaselineGuard(rootDir, isPromotionMode) {
  const checkMode = isPromotionMode ? 'promotion' : 'release';
  const npmArgs = ['run', '-s', 'perf:baseline:check', '--', `--mode=${checkMode}`];
  const npmExecPath = String(process.env.npm_execpath || '').trim();
  let command = 'npm';
  let commandArgs = npmArgs;

  if (npmExecPath) {
    if (!path.isAbsolute(npmExecPath) || path.basename(npmExecPath).toLowerCase() !== 'npm-cli.js') {
      console.error('E_NPM_EXEC_PATH_INVALID=1');
      return 1;
    }
    command = process.execPath;
    commandArgs = [npmExecPath, ...npmArgs];
  } else if (process.platform === 'win32') {
    const commandShell = String(process.env.ComSpec || '').trim();
    if (!path.isAbsolute(commandShell)) {
      console.error('E_WINDOWS_COMMAND_SHELL_INVALID=1');
      return 1;
    }
    command = commandShell;
    commandArgs = ['/d', '/s', '/c', 'npm.cmd', ...npmArgs];
  }

  const result = spawnSync(
    command,
    commandArgs,
    { cwd: rootDir, stdio: 'inherit' },
  );
  if (result.error) console.error(`E_PERF_BASELINE_SPAWN=${result.error.code || 'UNKNOWN'}`);
  return result.status ?? 1;
}

function runAtlasEventContractGuard(rootDir) {
  const testsAbs = ATLAS_EVENT_CONTRACT_TESTS
    .map((item) => path.resolve(rootDir, item))
    .sort();
  const result = spawnSync(process.execPath, ['--test', ...testsAbs], {
    cwd: rootDir,
    stdio: 'inherit',
  });
  return result.status ?? 1;
}

function runCommandNamespaceGuard(rootDir, isPromotionMode) {
  const checkMode = isPromotionMode ? 'promotion' : 'release';
  const result = spawnSync(
    process.execPath,
    ['scripts/ops/check-command-namespace.mjs', `--mode=${checkMode}`],
    { cwd: rootDir, stdio: 'inherit' },
  );
  return result.status ?? 1;
}

function runCommandNamespaceStaticGuard(rootDir, isPromotionMode) {
  const checkMode = isPromotionMode ? 'promotion' : 'release';
  const result = spawnSync(
    process.execPath,
    ['scripts/ops/check-command-namespace-static.mjs', `--mode=${checkMode}`],
    { cwd: rootDir, stdio: 'inherit' },
  );
  return result.status ?? 1;
}

function runEnabledWhenDslGuard(rootDir, isPromotionMode) {
  const checkMode = isPromotionMode ? 'promotion' : 'release';
  const result = spawnSync(
    process.execPath,
    ['scripts/ops/check-enabledwhen-dsl.mjs', `--mode=${checkMode}`],
    { cwd: rootDir, stdio: 'inherit' },
  );
  return result.status ?? 1;
}

function runMenuConfigNormalizationGuard(rootDir, isPromotionMode) {
  const checkMode = isPromotionMode ? 'promotion' : 'release';
  const outPath = path.join(os.tmpdir(), `menu-config.normalized.${process.pid}.json`);
  const result = spawnSync(
    process.execPath,
    [
      'scripts/ops/menu-config-normalize.mjs',
      '--in',
      'src/menu/menu-config.v2.json',
      '--context',
      'test/fixtures/menu/context.default.json',
      '--out',
      outPath,
      `--mode=${checkMode}`,
    ],
    { cwd: rootDir, stdio: 'inherit' },
  );
  return result.status ?? 1;
}

function runMenuOverlayStackGuard(rootDir, isPromotionMode) {
  const checkMode = isPromotionMode ? 'promotion' : 'release';
  const result = spawnSync(
    process.execPath,
    [
      'scripts/ops/check-menu-overlay-stack.mjs',
      `--mode=${checkMode}`,
    ],
    { cwd: rootDir, stdio: 'inherit' },
  );
  return result.status ?? 1;
}

function runMenuSnapshotGuard(rootDir, isPromotionMode) {
  const checkMode = isPromotionMode ? 'promotion' : 'release';
  const result = spawnSync(
    process.execPath,
    [
      'scripts/ops/menu-config-normalize.mjs',
      '--snapshot-check',
      '--snapshot-id=menu-default-desktop-minimal',
      `--mode=${checkMode}`,
    ],
    { cwd: rootDir, stdio: 'inherit' },
  );
  return result.status ?? 1;
}

function runMenuArtifactExportGuard(rootDir, isPromotionMode) {
  const checkMode = isPromotionMode ? 'promotion' : 'release';
  const result = spawnSync(
    process.execPath,
    [
      'scripts/ops/menu-config-normalize.mjs',
      '--export-artifact',
      '--out',
      'docs/OPS/ARTIFACTS/menu/menu.normalized.json',
      '--snapshot-id',
      'menu-default-desktop-minimal',
      '--lock-artifact',
      `--mode=${checkMode}`,
    ],
    { cwd: rootDir, stdio: 'inherit' },
  );
  return result.status ?? 1;
}

function runMenuArtifactLockGuard(rootDir, isPromotionMode) {
  const checkMode = isPromotionMode ? 'promotion' : 'release';
  const result = spawnSync(
    process.execPath,
    [
      'scripts/ops/check-menu-artifact-lock.mjs',
      '--snapshot-id=menu-default-desktop-minimal',
      `--mode=${checkMode}`,
    ],
    { cwd: rootDir, stdio: 'inherit' },
  );
  return result.status ?? 1;
}

function runMenuRuntimeEquivalentGuard(rootDir, isPromotionMode) {
  const checkMode = isPromotionMode ? 'promotion' : 'release';
  const result = spawnSync(
    process.execPath,
    [
      'scripts/ops/menu-config-normalize.mjs',
      '--runtime-equivalent-check',
      '--context',
      'test/fixtures/menu/context.default.json',
      `--mode=${checkMode}`,
    ],
    { cwd: rootDir, stdio: 'inherit' },
  );
  return result.status ?? 1;
}

function runLawPathCanonGuard(rootDir, isPromotionMode) {
  const checkMode = isPromotionMode ? 'promotion' : 'release';
  const result = spawnSync(
    process.execPath,
    [
      'scripts/ops/check-law-path-canon.mjs',
      `--mode=${checkMode}`,
    ],
    { cwd: rootDir, stdio: 'inherit' },
  );
  return result.status ?? 1;
}

function runExecutionSequenceGuard(rootDir, isPromotionMode) {
  const checkMode = isPromotionMode ? 'promotion' : 'release';
  const result = spawnSync(
    process.execPath,
    [
      'scripts/ops/check-execution-sequence.mjs',
      `--mode=${checkMode}`,
    ],
    { cwd: rootDir, stdio: 'inherit' },
  );
  return result.status ?? 1;
}

function runReleaseCandidateGuard(rootDir, isPromotionMode) {
  const checkMode = isPromotionMode ? 'promotion' : 'release';
  const evidenceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'yalken-rc-evidence-'));
  const result = spawnSync(
    process.execPath,
    [
      'scripts/ops/release-candidate.mjs',
      '--verify',
      `--mode=${checkMode}`,
      '--evidence-root',
      evidenceRoot,
    ],
    { cwd: rootDir, stdio: 'inherit' },
  );
  return result.status ?? 1;
}

const rootDir = path.resolve(__dirname, '..');
const cli = parseCli(process.argv.slice(2));
if (cli.error) {
  console.error(cli.error);
  process.exitCode = 1;
  return;
}

const checkMode = cli.checkMode === CHECK_MODE_PROMOTION ? CHECK_MODE_PROMOTION : CHECK_MODE_RELEASE;
const isPromotionMode = checkMode === CHECK_MODE_PROMOTION;
const dryRun = cli.dryRun;
const modeArg = cli.modeArg;

if (modeArg === 'fast') {
  process.exitCode = runFastLane(rootDir, dryRun);
  return;
}

if (modeArg === 'closeout') {
  process.exitCode = runToolbarCloseoutLane(rootDir, dryRun);
  return;
}

const explicitTests = cli.explicitTests;
const mode = modeArg === 'electron' ? 'electron' : 'unit';
const testDir = path.join(rootDir, 'test', mode);
const testFiles = explicitTests.length > 0
  ? explicitTests.map((item) => path.resolve(rootDir, item)).sort()
  : (fs.existsSync(testDir) ? listTestFiles(testDir).sort() : []);

if (testFiles.length === 0) {
  console.error(`No test files found in ./test/${mode} (expected **/*.test.js or **/*.test.mjs).`);
  process.exitCode = 1;
} else {
  let exitCode = 0;

  if (explicitTests.length === 0) {
    const opsExit = runOpsSynthNegativeTests(rootDir);
    if (opsExit !== 0) {
      process.exitCode = opsExit;
      return;
    }
  }

  // R2.4 E0 runner truth: capture the TAP stream instead of inheriting so
  // the lane fails closed on a zero executed denominator and reports the
  // exact skip inventory instead of hiding it inside an aggregate exit code.
  const result = spawnSync(process.execPath, ['--test', ...testFiles], {
    cwd: rootDir,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  exitCode = result.status ?? 1;
  const tapTotals = readTapTotals(result.stdout, result.stderr);
  console.log(`UNIT_LANE_EXECUTED=${tapTotals.executed === null ? 'UNKNOWN' : tapTotals.executed}`);
  console.log(`UNIT_LANE_SKIPPED_DENOMINATOR=${tapTotals.skipped === null ? 'UNKNOWN' : tapTotals.skipped}`);
  if (tapTotals.executed === 0) {
    console.error('E_ZERO_DENOMINATOR_UNIT_LANE=1');
    exitCode = 1;
  }
  if (exitCode === 0 && explicitTests.length === 0) {
    const atlasEventContractsExit = runAtlasEventContractGuard(rootDir);
    if (atlasEventContractsExit !== 0) {
      process.exitCode = atlasEventContractsExit;
      return;
    }
    const perfExit = runPerfBaselineGuard(rootDir, isPromotionMode);
    if (perfExit !== 0) {
      process.exitCode = perfExit;
      return;
    }
    const namespaceExit = runCommandNamespaceGuard(rootDir, isPromotionMode);
    if (namespaceExit !== 0) {
      process.exitCode = namespaceExit;
      return;
    }
    const namespaceStaticExit = runCommandNamespaceStaticGuard(rootDir, isPromotionMode);
    if (namespaceStaticExit !== 0) {
      process.exitCode = namespaceStaticExit;
      return;
    }
    const enabledWhenExit = runEnabledWhenDslGuard(rootDir, isPromotionMode);
    if (enabledWhenExit !== 0) {
      process.exitCode = enabledWhenExit;
      return;
    }
    const menuNormalizationExit = runMenuConfigNormalizationGuard(rootDir, isPromotionMode);
    if (menuNormalizationExit !== 0) {
      process.exitCode = menuNormalizationExit;
      return;
    }
    const menuOverlayStackExit = runMenuOverlayStackGuard(rootDir, isPromotionMode);
    if (menuOverlayStackExit !== 0) {
      process.exitCode = menuOverlayStackExit;
      return;
    }
    const menuSnapshotExit = runMenuSnapshotGuard(rootDir, isPromotionMode);
    if (menuSnapshotExit !== 0) {
      process.exitCode = menuSnapshotExit;
      return;
    }
    const menuArtifactExportExit = runMenuArtifactExportGuard(rootDir, isPromotionMode);
    if (menuArtifactExportExit !== 0) {
      process.exitCode = menuArtifactExportExit;
      return;
    }
    const menuArtifactLockExit = runMenuArtifactLockGuard(rootDir, isPromotionMode);
    if (menuArtifactLockExit !== 0) {
      process.exitCode = menuArtifactLockExit;
      return;
    }
    const menuRuntimeEquivalentExit = runMenuRuntimeEquivalentGuard(rootDir, isPromotionMode);
    if (menuRuntimeEquivalentExit !== 0) {
      process.exitCode = menuRuntimeEquivalentExit;
      return;
    }
    const lawPathCanonExit = runLawPathCanonGuard(rootDir, isPromotionMode);
    if (lawPathCanonExit !== 0) {
      process.exitCode = lawPathCanonExit;
      return;
    }
    const executionSequenceExit = runExecutionSequenceGuard(rootDir, isPromotionMode);
    if (executionSequenceExit !== 0) {
      process.exitCode = executionSequenceExit;
      return;
    }
    const releaseCandidateExit = runReleaseCandidateGuard(rootDir, isPromotionMode);
    if (releaseCandidateExit !== 0) {
      process.exitCode = releaseCandidateExit;
      return;
    }
  }
  process.exitCode = exitCode;
}
