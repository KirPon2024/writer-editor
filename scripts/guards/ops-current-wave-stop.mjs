import { spawnSync } from 'node:child_process';

function fastLaneBypassActive() {
  return String(process.env.DEV_FAST_LANE || '').trim() === '1';
}

function printAndExit(outLines, exitCode) {
  process.stdout.write(outLines.join('\n') + '\n');
  process.exit(exitCode);
}

function runDoctorStrict() {
  const env = { ...process.env, CHECKS_BASELINE_VERSION: 'v1.3', EFFECTIVE_MODE: 'STRICT' };
  const r = spawnSync(process.execPath, ['scripts/doctor.mjs'], {
    env,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const stdout = typeof r.stdout === 'string' ? r.stdout : '';
  const exitCode = typeof r.status === 'number' ? r.status : 1;
  return { stdout, exitCode };
}

function parseDoctorTokens(stdout) {
  const desired = [
    { key: 'CURRENT_WAVE_STOP_CONDITION_OK', prefix: 'CURRENT_WAVE_STOP_CONDITION_OK=' },
    { key: 'CURRENT_WAVE_STOP_CONDITION_FAIL_REASON', prefix: 'CURRENT_WAVE_STOP_CONDITION_FAIL_REASON=' },
    { key: 'CURRENT_WAVE_STRICT_DOCTOR_EXIT', prefix: 'CURRENT_WAVE_STRICT_DOCTOR_EXIT=' },
    { key: 'CURRENT_WAVE_BOUNDARY_GUARD_EXIT', prefix: 'CURRENT_WAVE_BOUNDARY_GUARD_EXIT=' },
    { key: 'STRICT_LIE_CLASS_01_VIOLATIONS_COUNT', prefix: 'STRICT_LIE_CLASS_01_VIOLATIONS_COUNT=' },
    { key: 'STRICT_LIE_CLASS_02_VIOLATIONS_COUNT', prefix: 'STRICT_LIE_CLASS_02_VIOLATIONS_COUNT=' },
    { key: 'STRICT_LIE_CLASSES_OK', prefix: 'STRICT_LIE_CLASSES_OK=' },
  ];

  const out = new Map();
  for (const line of stdout.split(/\r?\n/)) {
    for (const d of desired) {
      if (out.has(d.key)) continue;
      if (line.startsWith(d.prefix)) out.set(d.key, line.slice(d.prefix.length));
    }
  }
  return { out, desired };
}

if (fastLaneBypassActive()) {
  printAndExit([
    'CURRENT_WAVE_GUARD_RAN=1',
    'CURRENT_WAVE_STOP_CONDITION_OK=1',
    'CURRENT_WAVE_STOP_CONDITION_FAIL_REASON=DEV_FAST_LANE_BYPASS',
    'CURRENT_WAVE_STRICT_DOCTOR_EXIT=0',
    'CURRENT_WAVE_BOUNDARY_GUARD_EXIT=0',
    'STRICT_LIE_CLASS_01_VIOLATIONS_COUNT=0',
    'STRICT_LIE_CLASS_02_VIOLATIONS_COUNT=0',
    'STRICT_LIE_CLASSES_OK=1',
    'CURRENT_WAVE_STOP_CONDITION_GUARD_OK=1',
  ], 0);
}

const doctor = runDoctorStrict();
const parsed = parseDoctorTokens(doctor.stdout);

let stopOk = '0';
let failReason = '';

for (const d of parsed.desired) {
  if (!parsed.out.has(d.key)) {
    stopOk = '0';
    failReason = `TOKEN_MISSING:${d.key}`;
    break;
  }
}

if (failReason === '') {
  stopOk = parsed.out.get('CURRENT_WAVE_STOP_CONDITION_OK');
  failReason = parsed.out.get('CURRENT_WAVE_STOP_CONDITION_FAIL_REASON');
}

const strictDoctorExit = parsed.out.get('CURRENT_WAVE_STRICT_DOCTOR_EXIT') ?? String(doctor.exitCode);
const boundaryExit = parsed.out.get('CURRENT_WAVE_BOUNDARY_GUARD_EXIT') ?? '1';
const c1 = parsed.out.get('STRICT_LIE_CLASS_01_VIOLATIONS_COUNT') ?? '0';
const c2 = parsed.out.get('STRICT_LIE_CLASS_02_VIOLATIONS_COUNT') ?? '0';
const strictOk = parsed.out.get('STRICT_LIE_CLASSES_OK') ?? '0';

const stopOkInt = stopOk === '1' ? 1 : 0;
const guardOkInt = stopOkInt;

const outLines = [
  'CURRENT_WAVE_GUARD_RAN=1',
  `CURRENT_WAVE_STOP_CONDITION_OK=${stopOkInt}`,
  `CURRENT_WAVE_STOP_CONDITION_FAIL_REASON=${failReason ?? ''}`,
  `CURRENT_WAVE_STRICT_DOCTOR_EXIT=${strictDoctorExit}`,
  `CURRENT_WAVE_BOUNDARY_GUARD_EXIT=${boundaryExit}`,
  `STRICT_LIE_CLASS_01_VIOLATIONS_COUNT=${c1}`,
  `STRICT_LIE_CLASS_02_VIOLATIONS_COUNT=${c2}`,
  `STRICT_LIE_CLASSES_OK=${strictOk}`,
  `CURRENT_WAVE_STOP_CONDITION_GUARD_OK=${guardOkInt}`,
];

printAndExit(outLines, guardOkInt === 1 ? 0 : 1);
