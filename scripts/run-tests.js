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

const FAST_LANE_FORBIDDEN_SEGMENTS = Object.freeze([
  'scripts/ops/run-wave.mjs',
  'scripts/guards/ops-current-wave-stop.mjs',
  'ops:current-wave',
  'ops_synth_negative.test.js',
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
  out.explicitTests = tokens.filter((arg) => arg.endsWith('.test.js'));

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
  const tmpTestPath = path.join('/tmp', 'ops_synth_negative.test.js');

  const testSource = `\
const { spawnSync } = require('node:child_process');
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');

function parseTokens(stdout) {
  const lines = String(stdout).split(/\\r?\\n/);
  if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();

  const tokens = new Map();
  for (const line of lines) {
    if (!line) continue;
    if (!/^[A-Z0-9_]+=/.test(line)) continue;
    const i = line.indexOf('=');
    const key = line.slice(0, i);
    const value = line.slice(i + 1);
    if (tokens.has(key)) throw new Error('DUP_TOKEN_' + key + '=1');
    tokens.set(key, value);
  }
  return tokens;
}

function getRequired(tokens, key) {
  if (!tokens.has(key)) throw new Error('MISSING_TOKEN_' + key + '=1');
  return tokens.get(key);
}

function parseIntStrict(s, key) {
  const n = Number(s);
  if (!Number.isInteger(n)) throw new Error('BAD_INT_' + key + '=1');
  return n;
}

function runDoctorStrict(envExtra) {
  const env = { ...process.env, CHECKS_BASELINE_VERSION: 'v1.3', EFFECTIVE_MODE: 'STRICT', ...envExtra };
  delete env.OPS_SYNTH_OVERRIDE_ENABLED;
  delete env.OPS_SYNTH_OVERRIDE_JSON;
  if (envExtra && Object.prototype.hasOwnProperty.call(envExtra, 'OPS_SYNTH_OVERRIDE_ENABLED')) {
    env.OPS_SYNTH_OVERRIDE_ENABLED = envExtra.OPS_SYNTH_OVERRIDE_ENABLED;
  }
  if (envExtra && Object.prototype.hasOwnProperty.call(envExtra, 'OPS_SYNTH_OVERRIDE_JSON')) {
    env.OPS_SYNTH_OVERRIDE_JSON = envExtra.OPS_SYNTH_OVERRIDE_JSON;
  }

  const r = spawnSync(process.execPath, ['scripts/doctor.mjs'], { env, encoding: 'utf8' });
  const stdout = String(r.stdout || '');
  const tokens = parseTokens(stdout);
  return { status: r.status ?? 1, stdout, tokens };
}

function assertStrictBaselineTokens(tokens) {
  for (const k of [
    'STRICT_LIE_CLASS_01_VIOLATIONS_COUNT',
    'STRICT_LIE_CLASS_01_VIOLATIONS',
    'STRICT_LIE_CLASS_02_VIOLATIONS_COUNT',
    'STRICT_LIE_CLASS_02_VIOLATIONS',
    'STRICT_LIE_CLASSES_OK'
  ]) {
    getRequired(tokens, k);
  }
}

test('ops strict: baseline ok', () => {
  const r = runDoctorStrict({});
  assert.equal(r.status, 0);
  assertStrictBaselineTokens(r.tokens);

  const c1 = parseIntStrict(getRequired(r.tokens, 'STRICT_LIE_CLASS_01_VIOLATIONS_COUNT'), 'STRICT_LIE_CLASS_01_VIOLATIONS_COUNT');
  const c2 = parseIntStrict(getRequired(r.tokens, 'STRICT_LIE_CLASS_02_VIOLATIONS_COUNT'), 'STRICT_LIE_CLASS_02_VIOLATIONS_COUNT');
  assert.equal(c1, 0);
  assert.equal(c2, 0);

  const a1 = JSON.parse(getRequired(r.tokens, 'STRICT_LIE_CLASS_01_VIOLATIONS'));
  const a2 = JSON.parse(getRequired(r.tokens, 'STRICT_LIE_CLASS_02_VIOLATIONS'));
  assert.ok(Array.isArray(a1));
  assert.ok(Array.isArray(a2));
  assert.equal(a1.length, 0);
  assert.equal(a2.length, 0);

  assert.ok(r.stdout.split(/\\r?\\n/).includes('STRICT_LIE_CLASSES_OK=1'));
});

test('ops synth negative: lie_class_01', () => {
  const idx = JSON.parse(fs.readFileSync('docs/OPS/INVENTORY_INDEX.json', 'utf8'));
  let invPath = '';
  for (const it of idx.items || []) {
    if (!it || it.requiresDeclaredEmpty !== true) continue;
    if (typeof it.path !== 'string' || !it.path) continue;
    try {
      const j = JSON.parse(fs.readFileSync(it.path, 'utf8'));
      if (j && j.declaredEmpty === true && Array.isArray(j.items) && j.items.length === 0) {
        invPath = it.path;
        break;
      }
    } catch {}
  }
  if (!invPath) throw new Error('LIE_CLASS_01_CANDIDATE_NONE=1');

  const override = {
    schemaVersion: 1,
    overrides: [{ path: invPath, op: 'json_delete_key', where: { key: 'declaredEmpty' } }]
  };

  const r = runDoctorStrict({
    OPS_SYNTH_OVERRIDE_ENABLED: '1',
    OPS_SYNTH_OVERRIDE_JSON: JSON.stringify(override)
  });

  assert.notEqual(r.status, 0);
  assertStrictBaselineTokens(r.tokens);

  assert.ok(r.stdout.split(/\\r?\\n/).includes('OPS_SYNTH_OVERRIDE_ENABLED=1'));
  assert.ok(r.stdout.split(/\\r?\\n/).includes('OPS_SYNTH_OVERRIDE_SCHEMA_OK=1'));
  assert.ok(r.stdout.split(/\\r?\\n/).includes('OPS_SYNTH_OVERRIDE_PARSE_OK=1'));
  assert.ok(r.stdout.split(/\\r?\\n/).includes('OPS_SYNTH_OVERRIDE_APPLY_OK=1'));

  const c = parseIntStrict(getRequired(r.tokens, 'STRICT_LIE_CLASS_01_VIOLATIONS_COUNT'), 'STRICT_LIE_CLASS_01_VIOLATIONS_COUNT');
  assert.ok(c > 0);
});

test('ops synth negative: lie_class_02', () => {
  const reg = JSON.parse(fs.readFileSync('docs/OPS/INVARIANTS_REGISTRY.json', 'utf8'));
  const enf = JSON.parse(fs.readFileSync('docs/OPS/CONTOUR-C-ENFORCEMENT.json', 'utf8'));
  const regSet = new Set((reg.items || []).map((x) => x && x.invariantId).filter(Boolean));

  let invId = '';
  let s0 = '';
  for (const it of enf.items || []) {
    if (!it || typeof it.invariantId !== 'string') continue;
    if (!regSet.has(it.invariantId)) continue;
    if (typeof it.severity === 'string' && it.severity.trim()) {
      invId = it.invariantId;
      s0 = it.severity.trim();
      break;
    }
  }
  if (!invId) throw new Error('LIE_CLASS_02_CANDIDATE_NONE=1');

  let s1 = s0 === 'HIGH' ? 'MEDIUM' : 'HIGH';
  if (s0 !== 'HIGH' && s0 !== 'MEDIUM') s1 = 'HIGH';

  const override = {
    schemaVersion: 1,
    overrides: [
      {
        path: 'docs/OPS/CONTOUR-C-ENFORCEMENT.json',
        op: 'json_set_value',
        where: { jsonPath: '$.items[?(@.invariantId==\"' + invId + '\")].severity' },
        toggle: [s0, s1]
      }
    ]
  };

  const r = runDoctorStrict({
    OPS_SYNTH_OVERRIDE_ENABLED: '1',
    OPS_SYNTH_OVERRIDE_JSON: JSON.stringify(override)
  });

  assert.notEqual(r.status, 0);
  assertStrictBaselineTokens(r.tokens);

  assert.ok(r.stdout.split(/\\r?\\n/).includes('OPS_SYNTH_OVERRIDE_ENABLED=1'));
  assert.ok(r.stdout.split(/\\r?\\n/).includes('OPS_SYNTH_OVERRIDE_SCHEMA_OK=1'));
  assert.ok(r.stdout.split(/\\r?\\n/).includes('OPS_SYNTH_OVERRIDE_PARSE_OK=1'));
  assert.ok(r.stdout.split(/\\r?\\n/).includes('OPS_SYNTH_OVERRIDE_APPLY_OK=1'));

  const c = parseIntStrict(getRequired(r.tokens, 'STRICT_LIE_CLASS_02_VIOLATIONS_COUNT'), 'STRICT_LIE_CLASS_02_VIOLATIONS_COUNT');
  assert.ok(c > 0);
});
`;

  fs.writeFileSync(tmpTestPath, testSource, 'utf8');
  const result = spawnSync(process.execPath, ['--test', tmpTestPath], {
    cwd: rootDir,
    stdio: 'inherit'
  });

  try {
    fs.unlinkSync(tmpTestPath);
  } catch {}

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

    if (entry.isFile() && entry.name.endsWith('.test.js')) {
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

function runPerfBaselineGuard(rootDir, isPromotionMode) {
  const checkMode = isPromotionMode ? 'promotion' : 'release';
  const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const result = spawnSync(
    npmCmd,
    ['run', '-s', 'perf:baseline:check', '--', `--mode=${checkMode}`],
    { cwd: rootDir, stdio: 'inherit' },
  );
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
      'src/menu/menu-config.v2.example.json',
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
  const result = spawnSync(
    process.execPath,
    [
      'scripts/ops/release-candidate.mjs',
      '--verify',
      `--mode=${checkMode}`,
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

const explicitTests = cli.explicitTests;
const mode = modeArg === 'electron' ? 'electron' : 'unit';
const testDir = path.join(rootDir, 'test', mode);
const testFiles = explicitTests.length > 0
  ? explicitTests.map((item) => path.resolve(rootDir, item)).sort()
  : (fs.existsSync(testDir) ? listTestFiles(testDir).sort() : []);

if (testFiles.length === 0) {
  console.error(`No test files found in ./test/${mode} (expected **/*.test.js).`);
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

  const result = spawnSync(process.execPath, ['--test', ...testFiles], { cwd: rootDir, stdio: 'inherit' });
  exitCode = result.status ?? 1;
  if (exitCode === 0 && explicitTests.length === 0) {
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
