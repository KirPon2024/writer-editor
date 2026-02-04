import fs from 'node:fs';

const REQUIRED_FILES = [
  'docs/OPS/AUDIT-MATRIX-v1.1.md',
  'docs/OPS/DEBT_REGISTRY.json',
  'docs/OPS/QUEUE_POLICIES.json',
  'docs/OPS/CAPABILITIES_MATRIX.json',
];

function die(code, file, reason) {
  const error = new Error(reason);
  error.code = code;
  error.file = file;
  error.reason = reason;
  throw error;
}

function readText(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch {
    die('ERR_DOCTOR_MISSING_FILE', filePath, 'read_failed');
  }
}

function readJson(filePath) {
  const text = readText(filePath);
  try {
    return JSON.parse(text);
  } catch {
    die('ERR_DOCTOR_INVALID_SHAPE', filePath, 'json_parse_failed');
  }
}

function assertObjectShape(filePath, value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    die('ERR_DOCTOR_INVALID_SHAPE', filePath, 'top_level_must_be_object');
  }
  if (typeof value.schemaVersion !== 'number') {
    die('ERR_DOCTOR_INVALID_SHAPE', filePath, 'schemaVersion_must_be_number');
  }
  if (!Array.isArray(value.items)) {
    die('ERR_DOCTOR_INVALID_SHAPE', filePath, 'items_must_be_array');
  }
}

function assertItemsAreObjects(filePath, items) {
  for (let i = 0; i < items.length; i += 1) {
    const item = items[i];
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      die('ERR_DOCTOR_INVALID_SHAPE', filePath, `item_${i}_must_be_object`);
    }
  }
}

function assertRequiredKeys(filePath, items, keys) {
  for (let i = 0; i < items.length; i += 1) {
    const item = items[i];
    for (const key of keys) {
      if (!(key in item)) {
        die('ERR_DOCTOR_INVALID_SHAPE', filePath, `item_${i}_missing_${key}`);
      }
    }
  }
}

function parseMatrixModeBlock(auditText) {
  const start = '<!-- OPS:MATRIX-MODE -->';
  const end = '<!-- /OPS:MATRIX-MODE -->';

  const startIdx = auditText.indexOf(start);
  const endIdx = auditText.indexOf(end);

  if (startIdx === -1 || endIdx === -1 || endIdx < startIdx) {
    die('ERR_MATRIX_MODE_INVALID', 'docs/OPS/AUDIT-MATRIX-v1.1.md', 'missing_block');
  }

  if (auditText.indexOf(start, startIdx + 1) !== -1 || auditText.indexOf(end, endIdx + 1) !== -1) {
    die('ERR_MATRIX_MODE_INVALID', 'docs/OPS/AUDIT-MATRIX-v1.1.md', 'block_not_unique');
  }

  const body = auditText.slice(startIdx + start.length, endIdx);
  const lines = body.split('\n').map((l) => l.trimEnd()).filter((l) => l.trim() !== '');

  let mode = null;
  const enforcement = {};
  let inEnforcement = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('mode:')) {
      if (mode !== null) die('ERR_MATRIX_MODE_INVALID', 'docs/OPS/AUDIT-MATRIX-v1.1.md', 'duplicate_mode');
      const value = trimmed.slice('mode:'.length).trim();
      mode = value || null;
      inEnforcement = false;
      continue;
    }

    if (trimmed === 'enforcement:') {
      inEnforcement = true;
      continue;
    }

    if (inEnforcement) {
      const m = trimmed.match(/^(P0|P1|P2):\s*(off|soft|hard)$/);
      if (!m) die('ERR_MATRIX_MODE_INVALID', 'docs/OPS/AUDIT-MATRIX-v1.1.md', 'bad_enforcement_line');
      const key = m[1];
      const value = m[2];
      if (key in enforcement) die('ERR_MATRIX_MODE_INVALID', 'docs/OPS/AUDIT-MATRIX-v1.1.md', 'duplicate_enforcement_key');
      enforcement[key] = value;
      continue;
    }

    die('ERR_MATRIX_MODE_INVALID', 'docs/OPS/AUDIT-MATRIX-v1.1.md', 'unrecognized_line');
  }

  if (mode !== 'TRANSITIONAL' && mode !== 'STRICT') {
    die('ERR_MATRIX_MODE_INVALID', 'docs/OPS/AUDIT-MATRIX-v1.1.md', 'mode_invalid');
  }

  for (const key of ['P0', 'P1', 'P2']) {
    if (!(key in enforcement)) {
      die('ERR_MATRIX_MODE_INVALID', 'docs/OPS/AUDIT-MATRIX-v1.1.md', `missing_enforcement_${key}`);
    }
  }

  return { mode, enforcement };
}

function utcTodayStartMs() {
  const now = new Date();
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
}

function checkDebtTtl(debtItems, mode) {
  if (debtItems.length === 0) {
    return { status: 'DEBT_TTL_OK', level: 'ok' };
  }

  const todayStart = utcTodayStartMs();

  for (let i = 0; i < debtItems.length; i += 1) {
    const ttlUntil = debtItems[i].ttlUntil;
    if (typeof ttlUntil !== 'string' || ttlUntil.length === 0) {
      return { status: mode === 'STRICT' ? 'DEBT_TTL_FAIL' : 'DEBT_TTL_WARN', level: mode === 'STRICT' ? 'fail' : 'warn' };
    }
    const parsed = Date.parse(ttlUntil);
    if (Number.isNaN(parsed)) {
      return { status: mode === 'STRICT' ? 'DEBT_TTL_FAIL' : 'DEBT_TTL_WARN', level: mode === 'STRICT' ? 'fail' : 'warn' };
    }
    if (parsed < todayStart) {
      return { status: mode === 'STRICT' ? 'DEBT_TTL_FAIL' : 'DEBT_TTL_WARN', level: mode === 'STRICT' ? 'fail' : 'warn' };
    }
  }

  return { status: 'DEBT_TTL_OK', level: 'ok' };
}

function run() {
  for (const filePath of REQUIRED_FILES) {
    if (!fs.existsSync(filePath)) {
      die('ERR_DOCTOR_MISSING_FILE', filePath, 'missing');
    }
  }

  const auditPath = 'docs/OPS/AUDIT-MATRIX-v1.1.md';
  const auditStat = fs.statSync(auditPath);
  if (auditStat.size <= 0) {
    die('ERR_DOCTOR_EMPTY_MATRIX', auditPath, 'empty');
  }
  const auditText = readText(auditPath);

  const matrixMode = parseMatrixModeBlock(auditText);

  const debtPath = 'docs/OPS/DEBT_REGISTRY.json';
  const debt = readJson(debtPath);
  assertObjectShape(debtPath, debt);
  assertItemsAreObjects(debtPath, debt.items);
  assertRequiredKeys(debtPath, debt.items, [
    'debtId',
    'owner',
    'ttlUntil',
    'exitCriteria',
    'scope',
  ]);

  const queuePath = 'docs/OPS/QUEUE_POLICIES.json';
  const queue = readJson(queuePath);
  assertObjectShape(queuePath, queue);
  assertItemsAreObjects(queuePath, queue.items);
  assertRequiredKeys(queuePath, queue.items, [
    'queueId',
    'maxSize',
    'overflow',
    'owner',
  ]);

  const allowedOverflow = new Set([
    'drop_oldest',
    'drop_newest',
    'hard_fail',
    'degrade',
  ]);
  for (let i = 0; i < queue.items.length; i += 1) {
    const ov = queue.items[i].overflow;
    if (typeof ov !== 'string' || !allowedOverflow.has(ov)) {
      die('ERR_DOCTOR_INVALID_SHAPE', queuePath, `item_${i}_bad_overflow`);
    }
  }

  const capsPath = 'docs/OPS/CAPABILITIES_MATRIX.json';
  const caps = readJson(capsPath);
  assertObjectShape(capsPath, caps);
  assertItemsAreObjects(capsPath, caps.items);
  assertRequiredKeys(capsPath, caps.items, [
    'platformId',
    'capabilities',
  ]);
  for (let i = 0; i < caps.items.length; i += 1) {
    const capabilities = caps.items[i].capabilities;
    if (!capabilities || typeof capabilities !== 'object' || Array.isArray(capabilities)) {
      die('ERR_DOCTOR_INVALID_SHAPE', capsPath, `item_${i}_capabilities_must_be_object`);
    }
  }

  const debtTtl = checkDebtTtl(debt.items, matrixMode.mode);
  console.log(debtTtl.status);

  if (debtTtl.level === 'fail') {
    console.log('DOCTOR_FAIL');
    process.exit(1);
  }
  if (debtTtl.level === 'warn') {
    console.log('DOCTOR_WARN');
    process.exit(0);
  }

  console.log('DOCTOR_OK');
  process.exit(0);
}

try {
  run();
} catch (err) {
  const code = err && typeof err === 'object' && 'code' in err ? err.code : 'ERR_DOCTOR_UNKNOWN';
  const file = err && typeof err === 'object' && 'file' in err ? err.file : '(unknown)';
  const reason = err && typeof err === 'object' && 'reason' in err ? err.reason : 'unknown';
  console.error(`${code} ${file} ${reason}`);
  console.log('DOCTOR_FAIL');
  process.exit(1);
}
