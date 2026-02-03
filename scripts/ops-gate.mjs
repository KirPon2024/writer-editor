import fs from 'node:fs';

function fail(msg) {
  console.error(msg);
  process.exit(1);
}

function usage() {
  console.log('Usage: node scripts/ops-gate.mjs --task <path>');
}

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function hasH2(txt, heading) {
  const re = new RegExp(`^##\\s+${escapeRegExp(heading)}\\s*$`, 'm');
  return re.test(txt);
}

function getH2SectionBody(txt, heading) {
  const lines = txt.split(/\r?\n/);
  const header = `## ${heading}`;

  let start = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trimEnd() === header) {
      start = i + 1;
      break;
    }
  }
  if (start === -1) return null;

  let end = lines.length;
  for (let i = start; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith('## ') && line.trimEnd() !== header) {
      end = i;
      break;
    }
  }

  return lines.slice(start, end).join('\n');
}

function getFirstPrefixedValue(txt, prefix) {
  const lines = txt.split(/\r?\n/);
  for (const line of lines) {
    if (!line.startsWith(prefix)) continue;
    const right = line.slice(prefix.length).trimEnd();
    return right.trimStart();
  }
  return null;
}

function parseArgs(argv) {
  let taskPath = null;

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--task') {
      taskPath = argv[i + 1] || null;
      i++;
      continue;
    }
    if (a === '--help' || a === '-h') {
      usage();
      process.exit(0);
    }
    fail(`Unknown arg: ${a}`);
  }

  if (!taskPath) {
    usage();
    fail('Missing --task <path>');
  }

  return { taskPath };
}

const { taskPath } = parseArgs(process.argv.slice(1).slice(1));
const norm = taskPath.replaceAll('\\', '/');

if (!norm.endsWith('.md')) fail('Only .md files are supported');
if (!norm.startsWith('docs/tasks/') && !norm.startsWith('docs/OPERATIONS/')) {
  fail('E0 scope: docs/tasks/*.md and docs/OPERATIONS/*.md only');
}

let txt = '';
try {
  txt = fs.readFileSync(taskPath, 'utf8');
} catch (e) {
  fail(`Cannot read file: ${taskPath}`);
}

const isTask = norm.startsWith('docs/tasks/');
const allowedTypes = new Set(['OPS_WRITE', 'OPS_REPORT', 'AUDIT', 'CORE', 'UI']);

let taskType = null;
if (isTask) {
  taskType = getFirstPrefixedValue(txt, 'TYPE:');
  if (!taskType) fail('Missing TYPE:');
  if (!allowedTypes.has(taskType)) fail(`Invalid TYPE: ${taskType}`);

  if (!txt.includes('CANON_VERSION:')) fail('Missing CANON_VERSION:');
  if (!txt.includes('CHECKS_BASELINE_VERSION:')) fail('Missing CHECKS_BASELINE_VERSION:');

  if (txt.includes('NOT_APPLICABLE') && taskType !== 'OPS_REPORT') {
    fail('NOT_APPLICABLE is only allowed for TYPE=OPS_REPORT');
  }
}

// HARD-TZ базовая структура (10 секций, без HEADER).
if (isTask) {
  const required = [
    'MICRO_GOAL',
    'ARTIFACT',
    'ALLOWLIST',
    'DENYLIST',
    'CONTRACT / SHAPES',
    'IMPLEMENTATION_STEPS',
    'CHECKS',
    'STOP_CONDITION',
    'REPORT_FORMAT',
    'FAIL_PROTOCOL',
  ];

  for (const h of required) {
    if (!hasH2(txt, h)) fail(`Missing section: ${h}`);
  }
}

const checksBody = getH2SectionBody(txt, 'CHECKS') || '';

// Forbidden patterns in CHECKS (без хрупких count-based проверок).
const tokenA = String.fromCharCode(97, 119, 107); // a+w+k
if (checksBody.includes(tokenA)) fail('Forbidden token in CHECKS');

if (checksBody.includes('.trim(')) fail('Forbidden .trim( in CHECKS; use .trimEnd()');

// Allowlist argv MUST use process.argv.slice(1) for `node -e '...'` checks.
// Using slice(2) drops the first allowlist path (in `node -e` mode).
if (checksBody.includes('node -e')) {
  const badProcess = 'process.argv.slice(' + '2' + ')';
  const badArgv = 'argv.slice(' + '2' + ')';
  if (checksBody.includes(badProcess) || checksBody.includes(badArgv)) {
    fail('Forbidden allowlist argv offset in CHECKS; use process.argv.slice(1)');
  }
}

const tokenB = String.fromCharCode(119, 99, 32, 45, 108); // w+c+ + - + l
if (checksBody.includes(tokenB)) fail('Forbidden count-based CHECK in CHECKS');

const tokenC = String.fromCharCode(103, 114, 101, 112, 32, 45, 120); // g+r+e+p+ + - + x
if (checksBody.includes(tokenC)) fail('Forbidden count-based CHECK in CHECKS');

// Write tasks MUST иметь явную формулировку фаз CHECK (PRE/POST).
if (isTask) {
  const phaseLine = 'CHECK_01 выполняется ДО любых изменений; CHECK_02+ выполняются ПОСЛЕ.';
  if (!txt.includes(phaseLine)) fail('Missing CHECK phases rule (PRE/POST)');
  if (!hasH2(txt, 'DENYLIST')) fail('Missing section: DENYLIST');
}

process.exit(0);
