import fs from 'node:fs';

const REQUIRED_FILES = [
  'docs/OPS/AUDIT-MATRIX-v1.1.md',
  'docs/OPS/DEBT_REGISTRY.json',
  'docs/OPS/QUEUE_POLICIES.json',
  'docs/OPS/CAPABILITIES_MATRIX.json',
];

function fail(code, file, reason) {
  console.error(`${code} ${file} ${reason}`);
  process.exit(1);
}

function readText(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch {
    fail('ERR_DOCTOR_MISSING_FILE', filePath, 'read_failed');
  }
}

function readJson(filePath) {
  const text = readText(filePath);
  try {
    return JSON.parse(text);
  } catch {
    fail('ERR_DOCTOR_INVALID_SHAPE', filePath, 'json_parse_failed');
  }
}

function assertObjectShape(filePath, value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail('ERR_DOCTOR_INVALID_SHAPE', filePath, 'top_level_must_be_object');
  }
  if (typeof value.schemaVersion !== 'number') {
    fail('ERR_DOCTOR_INVALID_SHAPE', filePath, 'schemaVersion_must_be_number');
  }
  if (!Array.isArray(value.items)) {
    fail('ERR_DOCTOR_INVALID_SHAPE', filePath, 'items_must_be_array');
  }
}

function assertItemsAreObjects(filePath, items) {
  for (let i = 0; i < items.length; i += 1) {
    const item = items[i];
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      fail('ERR_DOCTOR_INVALID_SHAPE', filePath, `item_${i}_must_be_object`);
    }
  }
}

function assertRequiredKeys(filePath, items, keys) {
  for (let i = 0; i < items.length; i += 1) {
    const item = items[i];
    for (const key of keys) {
      if (!(key in item)) {
        fail('ERR_DOCTOR_INVALID_SHAPE', filePath, `item_${i}_missing_${key}`);
      }
    }
  }
}

function main() {
  for (const filePath of REQUIRED_FILES) {
    if (!fs.existsSync(filePath)) {
      fail('ERR_DOCTOR_MISSING_FILE', filePath, 'missing');
    }
  }

  const auditStat = fs.statSync('docs/OPS/AUDIT-MATRIX-v1.1.md');
  if (auditStat.size <= 0) {
    fail('ERR_DOCTOR_EMPTY_MATRIX', 'docs/OPS/AUDIT-MATRIX-v1.1.md', 'empty');
  }

  const debt = readJson('docs/OPS/DEBT_REGISTRY.json');
  assertObjectShape('docs/OPS/DEBT_REGISTRY.json', debt);
  assertItemsAreObjects('docs/OPS/DEBT_REGISTRY.json', debt.items);
  assertRequiredKeys('docs/OPS/DEBT_REGISTRY.json', debt.items, [
    'debtId',
    'owner',
    'ttlUntil',
    'exitCriteria',
    'scope',
  ]);

  const queue = readJson('docs/OPS/QUEUE_POLICIES.json');
  assertObjectShape('docs/OPS/QUEUE_POLICIES.json', queue);
  assertItemsAreObjects('docs/OPS/QUEUE_POLICIES.json', queue.items);
  assertRequiredKeys('docs/OPS/QUEUE_POLICIES.json', queue.items, [
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
      fail('ERR_DOCTOR_INVALID_SHAPE', 'docs/OPS/QUEUE_POLICIES.json', `item_${i}_bad_overflow`);
    }
  }

  const caps = readJson('docs/OPS/CAPABILITIES_MATRIX.json');
  assertObjectShape('docs/OPS/CAPABILITIES_MATRIX.json', caps);
  assertItemsAreObjects('docs/OPS/CAPABILITIES_MATRIX.json', caps.items);
  assertRequiredKeys('docs/OPS/CAPABILITIES_MATRIX.json', caps.items, [
    'platformId',
    'capabilities',
  ]);
  for (let i = 0; i < caps.items.length; i += 1) {
    const capabilities = caps.items[i].capabilities;
    if (!capabilities || typeof capabilities !== 'object' || Array.isArray(capabilities)) {
      fail('ERR_DOCTOR_INVALID_SHAPE', 'docs/OPS/CAPABILITIES_MATRIX.json', `item_${i}_capabilities_must_be_object`);
    }
  }

  console.log('DOCTOR_BASE_OK');
}

main();
