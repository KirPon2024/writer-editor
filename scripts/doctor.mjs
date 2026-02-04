import fs from 'node:fs';

const REQUIRED_FILES = [
  'docs/OPS/AUDIT-MATRIX-v1.1.md',
  'docs/OPS/DEBT_REGISTRY.json',
  'docs/OPS/QUEUE_POLICIES.json',
  'docs/OPS/CAPABILITIES_MATRIX.json',
  'docs/OPS/PUBLIC_SURFACE.json',
  'docs/OPS/DOMAIN_EVENTS_BASELINE.json',
  'docs/OPS/ONDISK_ARTIFACTS.json',
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

function hasAnyActiveDebt(debtItems) {
  const todayStart = utcTodayStartMs();
  for (let i = 0; i < debtItems.length; i += 1) {
    const ttlUntil = debtItems[i].ttlUntil;
    if (typeof ttlUntil !== 'string' || ttlUntil.length === 0) continue;
    const parsed = Date.parse(ttlUntil);
    if (Number.isNaN(parsed)) continue;
    if (parsed >= todayStart) return true;
  }
  return false;
}

function hasMatchingActiveDebt(debtItems, scopeNeedle) {
  const todayStart = utcTodayStartMs();

  for (let i = 0; i < debtItems.length; i += 1) {
    const item = debtItems[i];
    const ttlUntil = item.ttlUntil;
    if (typeof ttlUntil !== 'string' || ttlUntil.length === 0) continue;

    const parsed = Date.parse(ttlUntil);
    if (Number.isNaN(parsed)) continue;
    if (parsed < todayStart) continue;

    const scope = item.scope;
    if (typeof scope === 'string') {
      if (scope.includes(scopeNeedle)) return true;
      continue;
    }
    if (Array.isArray(scope)) {
      for (const s of scope) {
        if (typeof s === 'string' && s.includes(scopeNeedle)) return true;
      }
    }
  }

  return false;
}

function listSourceFiles(rootDir) {
  if (!fs.existsSync(rootDir)) return [];

  const out = [];
  const stack = [rootDir];

  while (stack.length > 0) {
    const dir = stack.pop();
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = `${dir}/${entry.name}`;
      if (entry.isDirectory()) {
        stack.push(fullPath);
        continue;
      }
      if (!entry.isFile()) continue;

      if (/\.(c|m)?js$/.test(entry.name) || /\.tsx?$/.test(entry.name) || /\.d\.ts$/.test(entry.name)) {
        out.push(fullPath);
      }
    }
  }

  return out.sort();
}

function checkCoreBoundary(matrixMode, debtItems) {
  const invariantId = 'CORE-BOUNDARY-001';
  const roots = ['src/core', 'src/contracts'];
  const files = roots.flatMap((r) => listSourceFiles(r));

  const patterns = [
    /\bfrom\s+['"]electron['"]/g,
    /\bfrom\s+['"]fs['"]/g,
    /\bfrom\s+['"]path['"]/g,
    /\bfrom\s+['"]@\/ui['"]/g,
    /\bfrom\s+['"]@\/platform['"]/g,
    /\brequire\s*\(\s*['"]electron['"]\s*\)/g,
    /\brequire\s*\(\s*['"]fs['"]\s*\)/g,
    /\brequire\s*\(\s*['"]path['"]\s*\)/g,
    /\brequire\s*\(\s*['"]@\/ui['"]\s*\)/g,
    /\brequire\s*\(\s*['"]@\/platform['"]\s*\)/g,
  ];

  const violations = [];

  for (const filePath of files) {
    let text;
    try {
      text = fs.readFileSync(filePath, 'utf8');
    } catch {
      continue;
    }

    for (const re of patterns) {
      re.lastIndex = 0;
      const m = re.exec(text);
      if (m) {
        violations.push({ filePath, token: m[0] });
      }
    }
  }

  for (const v of violations) {
    console.log(`CORE_BOUNDARY_VIOLATION file=${v.filePath} token=${JSON.stringify(v.token)} invariant=${invariantId}`);
  }

  if (violations.length === 0) {
    return { status: 'CORE_BOUNDARY_OK', level: 'ok' };
  }

  if (matrixMode.mode === 'STRICT') {
    return { status: 'CORE_BOUNDARY_FAIL', level: 'fail' };
  }

  const activeDebt = hasAnyActiveDebt(debtItems);
  return {
    status: activeDebt ? 'CORE_BOUNDARY_WARN' : 'CORE_BOUNDARY_WARN_MISSING_DEBT',
    level: 'warn',
  };
}

function checkCoreDeterminism(matrixMode, debtItems) {
  const roots = ['src/core', 'src/contracts'];
  const files = roots.flatMap((r) => listSourceFiles(r));

  const tokenRules = [
    { token: 'Date.now', invariantId: 'CORE-DET-001' },
    { token: 'new Date(', invariantId: 'CORE-DET-001' },
    { token: 'Math.random', invariantId: 'CORE-DET-002' },
    { token: 'crypto.randomUUID', invariantId: 'CORE-DET-002' },
    { token: 'process.env', invariantId: 'CORE-DET-001' },
    { token: 'process.platform', invariantId: 'CORE-DET-001' },
    { token: 'setTimeout', invariantId: 'CORE-DET-001' },
    { token: 'setInterval', invariantId: 'CORE-DET-001' },
  ];

  const violations = [];

  for (const filePath of files) {
    let text;
    try {
      text = fs.readFileSync(filePath, 'utf8');
    } catch {
      continue;
    }

    for (const rule of tokenRules) {
      if (text.includes(rule.token)) {
        violations.push({ filePath, token: rule.token, invariantId: rule.invariantId });
      }
    }
  }

  for (const v of violations) {
    console.log(`CORE_DET_VIOLATION file=${v.filePath} token=${JSON.stringify(v.token)} invariant=${v.invariantId}`);
  }

  if (violations.length === 0) {
    return { status: 'CORE_DET_OK', level: 'ok' };
  }

  if (matrixMode.mode === 'STRICT') {
    return { status: 'CORE_DET_FAIL', level: 'fail' };
  }

  const activeDebt = hasAnyActiveDebt(debtItems);
  return {
    status: activeDebt ? 'CORE_DET_WARN' : 'CORE_DET_WARN_MISSING_DEBT',
    level: 'warn',
  };
}

function checkQueuePolicies(matrixMode, debtItems, queueItems) {
  const invariantId = 'OPS-QUEUE-001';
  const allowedOverflow = new Set([
    'drop_oldest',
    'drop_newest',
    'hard_fail',
    'degrade',
  ]);

  const violations = [];

  for (let i = 0; i < queueItems.length; i += 1) {
    const item = queueItems[i];

    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      violations.push({ queueId: 'unknown', field: 'item' });
      continue;
    }

    const queueIdRaw = item.queueId;
    const queueId = typeof queueIdRaw === 'string' && queueIdRaw.length > 0 ? queueIdRaw : 'unknown';

    if (queueId === 'unknown') violations.push({ queueId, field: 'queueId' });

    const maxSize = item.maxSize;
    if (typeof maxSize !== 'number' || !Number.isFinite(maxSize) || maxSize <= 0) {
      violations.push({ queueId, field: 'maxSize' });
    }

    const overflow = item.overflow;
    if (typeof overflow !== 'string' || !allowedOverflow.has(overflow)) {
      violations.push({ queueId, field: 'overflow' });
    }

    const owner = item.owner;
    if (typeof owner !== 'string' || owner.length === 0) {
      violations.push({ queueId, field: 'owner' });
    }
  }

  for (const v of violations) {
    console.log(`QUEUE_POLICY_VIOLATION queueId=${v.queueId} field=${v.field} invariant=${invariantId}`);
  }

  if (violations.length === 0) {
    return { status: 'QUEUE_POLICY_OK', level: 'ok' };
  }

  if (matrixMode.mode === 'STRICT') {
    return { status: 'QUEUE_POLICY_FAIL', level: 'fail' };
  }

  const activeDebt = hasAnyActiveDebt(debtItems);
  return {
    status: activeDebt ? 'QUEUE_POLICY_WARN' : 'QUEUE_POLICY_WARN_MISSING_DEBT',
    level: 'warn',
  };
}

function checkCapabilitiesMatrix(matrixMode, debtItems, capsItems) {
  const invariantId = 'OPS-CAPABILITIES-001';
  const violations = [];
  const seenPlatformIds = new Set();

  for (let i = 0; i < capsItems.length; i += 1) {
    const item = capsItems[i];

    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      violations.push({ platformId: 'unknown', field: 'item' });
      continue;
    }

    const platformIdRaw = item.platformId;
    const platformId = typeof platformIdRaw === 'string' && platformIdRaw.length > 0 ? platformIdRaw : 'unknown';
    if (platformId === 'unknown') violations.push({ platformId, field: 'platformId' });

    if (platformId !== 'unknown') {
      if (seenPlatformIds.has(platformId)) {
        violations.push({ platformId, field: 'platformId_duplicate' });
      } else {
        seenPlatformIds.add(platformId);
      }
    }

    const capabilities = item.capabilities;
    if (!capabilities || typeof capabilities !== 'object' || Array.isArray(capabilities)) {
      violations.push({ platformId, field: 'capabilities' });
    } else {
      const keys = Object.keys(capabilities);
      if (keys.length === 0) {
        violations.push({ platformId, field: 'capabilities_empty' });
      }
      for (const k of keys) {
        const v = capabilities[k];
        const t = typeof v;
        const ok = t === 'boolean' || t === 'string' || t === 'number';
        if (!ok || v === null || Array.isArray(v) || (t === 'object')) {
          violations.push({ platformId, field: `capabilities.${k}` });
        }
      }
    }

    if ('disabledCommands' in item) {
      const dc = item.disabledCommands;
      if (!Array.isArray(dc)) {
        violations.push({ platformId, field: 'disabledCommands' });
      } else {
        for (let j = 0; j < dc.length; j += 1) {
          const v = dc[j];
          if (typeof v !== 'string' || v.length === 0) {
            violations.push({ platformId, field: 'disabledCommands' });
            break;
          }
        }
      }
    }

    if ('degradedFeatures' in item) {
      const df = item.degradedFeatures;
      if (!Array.isArray(df)) {
        violations.push({ platformId, field: 'degradedFeatures' });
      } else {
        for (let j = 0; j < df.length; j += 1) {
          const v = df[j];
          if (typeof v !== 'string' || v.length === 0) {
            violations.push({ platformId, field: 'degradedFeatures' });
            break;
          }
        }
      }
    }
  }

  for (const v of violations) {
    console.log(`CAPABILITIES_VIOLATION platformId=${v.platformId} field=${v.field} invariant=${invariantId}`);
  }

  if (violations.length === 0) {
    return { status: 'CAPABILITIES_OK', level: 'ok' };
  }

  if (matrixMode.mode === 'STRICT') {
    return { status: 'CAPABILITIES_FAIL', level: 'fail' };
  }

  const activeDebt = hasAnyActiveDebt(debtItems);
  return {
    status: activeDebt ? 'CAPABILITIES_WARN' : 'CAPABILITIES_WARN_MISSING_DEBT',
    level: 'warn',
  };
}

function checkPublicSurface(matrixMode, debtItems) {
  const invariantId = 'OPS-PUBLIC-SURFACE-001';
  const filePath = 'docs/OPS/PUBLIC_SURFACE.json';

  const violations = [];

  let parsed;
  try {
    parsed = JSON.parse(readText(filePath));
  } catch {
    violations.push({ id: 'unknown', field: 'json' });
    parsed = null;
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    violations.push({ id: 'unknown', field: 'root' });
  }

  const schemaVersion = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed.schemaVersion : undefined;
  if (schemaVersion !== 1) {
    violations.push({ id: 'unknown', field: 'schemaVersion' });
  }

  const items = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed.items : undefined;
  if (!Array.isArray(items)) {
    violations.push({ id: 'unknown', field: 'items' });
  }

  if (Array.isArray(items) && items.length < 1) {
    violations.push({ id: 'unknown', field: 'items_empty' });
  }

  const seenIds = new Set();

  if (Array.isArray(items)) {
    for (let i = 0; i < items.length; i += 1) {
      const item = items[i];
      if (!item || typeof item !== 'object' || Array.isArray(item)) {
        violations.push({ id: 'unknown', field: 'item' });
        continue;
      }

      const idRaw = item.id;
      const id = typeof idRaw === 'string' && idRaw.length > 0 ? idRaw : 'unknown';
      if (id === 'unknown') violations.push({ id, field: 'id' });

      if (id !== 'unknown') {
        if (seenIds.has(id)) {
          violations.push({ id, field: 'id_duplicate' });
        } else {
          seenIds.add(id);
        }
      }

      const kind = item.kind;
      if (kind !== 'contract' && kind !== 'schema' && kind !== 'ondisk') {
        violations.push({ id, field: 'kind' });
      }

      const stability = item.stability;
      if (stability !== 'Stable' && stability !== 'Evolving' && stability !== 'Experimental') {
        violations.push({ id, field: 'stability' });
      }

      const paths = item.paths;
      if (!Array.isArray(paths)) {
        violations.push({ id, field: 'paths' });
      } else {
        if (paths.length < 1) violations.push({ id, field: 'paths_empty' });

        if (paths.length === 1 && paths[0] === '**/*') {
          violations.push({ id, field: 'paths_blanket' });
        }

        for (let j = 0; j < paths.length; j += 1) {
          const p = paths[j];
          if (typeof p !== 'string' || p.length === 0) {
            violations.push({ id, field: 'paths' });
            break;
          }
          if (p.includes('\\')) {
            violations.push({ id, field: 'paths_backslash' });
            break;
          }
        }
      }

      if ('notes' in item) {
        if (typeof item.notes !== 'string') {
          violations.push({ id, field: 'notes' });
        }
      }

      if ('owner' in item) {
        if (typeof item.owner !== 'string') {
          violations.push({ id, field: 'owner' });
        }
      }
    }
  }

  for (const v of violations) {
    console.log(`PUBLIC_SURFACE_VIOLATION id=${v.id} field=${v.field} invariant=${invariantId}`);
  }

  if (violations.length === 0) {
    return { status: 'PUBLIC_SURFACE_OK', level: 'ok' };
  }

  if (matrixMode.mode === 'STRICT') {
    return { status: 'PUBLIC_SURFACE_FAIL', level: 'fail' };
  }

  const hasDebt = hasMatchingActiveDebt(debtItems, filePath);
  return {
    status: hasDebt ? 'PUBLIC_SURFACE_WARN' : 'PUBLIC_SURFACE_WARN_MISSING_DEBT',
    level: 'warn',
  };
}

function checkEventsAppendOnly(matrixMode, debtItems) {
  const invariantId = 'EVENTS-APPEND-ONLY-001';
  const baselinePath = 'docs/OPS/DOMAIN_EVENTS_BASELINE.json';

  const violations = [];

  const baseline = readJson(baselinePath);
  if (!baseline || typeof baseline !== 'object' || Array.isArray(baseline)) {
    die('ERR_DOCTOR_INVALID_SHAPE', baselinePath, 'top_level_must_be_object');
  }
  if (typeof baseline.schemaVersion !== 'number') {
    die('ERR_DOCTOR_INVALID_SHAPE', baselinePath, 'schemaVersion_must_be_number');
  }
  if (!Array.isArray(baseline.events)) {
    die('ERR_DOCTOR_INVALID_SHAPE', baselinePath, 'events_must_be_array');
  }
  if (baseline.events.length < 1) {
    die('ERR_DOCTOR_INVALID_SHAPE', baselinePath, 'events_must_be_non_empty');
  }

  const baselineEventIds = [];
  const seen = new Set();

  for (let i = 0; i < baseline.events.length; i += 1) {
    const item = baseline.events[i];
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      die('ERR_DOCTOR_INVALID_SHAPE', baselinePath, `event_${i}_must_be_object`);
    }
    const eventId = item.eventId;
    if (typeof eventId !== 'string' || eventId.length === 0) {
      die('ERR_DOCTOR_INVALID_SHAPE', baselinePath, `event_${i}_eventId_must_be_string`);
    }
    if (seen.has(eventId)) {
      die('ERR_DOCTOR_INVALID_SHAPE', baselinePath, `event_${i}_eventId_duplicate`);
    }
    seen.add(eventId);
    baselineEventIds.push(eventId);

    const stability = item.stability;
    if (stability !== 'Stable' && stability !== 'Evolving' && stability !== 'Experimental') {
      die('ERR_DOCTOR_INVALID_SHAPE', baselinePath, `event_${i}_stability_invalid`);
    }

    const introducedIn = item.introducedIn;
    if (typeof introducedIn !== 'string') {
      die('ERR_DOCTOR_INVALID_SHAPE', baselinePath, `event_${i}_introducedIn_must_be_string`);
    }

    if ('deprecatedIn' in item && typeof item.deprecatedIn !== 'string') {
      die('ERR_DOCTOR_INVALID_SHAPE', baselinePath, `event_${i}_deprecatedIn_must_be_string`);
    }
  }

  const canonicalRoots = fs.existsSync('src/contracts/events')
    ? ['src/contracts/events']
    : ['src/contracts/core-event.contract.ts'];

  let hasWildcardType = false;
  const currentIds = new Set();

  for (const root of canonicalRoots) {
    const files = root.endsWith('.ts') ? [root] : listSourceFiles(root);
    for (const filePath of files) {
      if (!fs.existsSync(filePath)) continue;
      let text;
      try {
        text = fs.readFileSync(filePath, 'utf8');
      } catch {
        continue;
      }

      if (/\btype\s*:\s*string\b/.test(text)) {
        hasWildcardType = true;
      }

      const re = /\btype\s*:\s*(['"`])([^'"`]+)\1/g;
      for (;;) {
        const m = re.exec(text);
        if (!m) break;
        currentIds.add(m[2]);
      }
    }
  }

  if (!hasWildcardType) {
    for (const eventId of baselineEventIds) {
      if (!currentIds.has(eventId)) {
        violations.push({ eventId });
      }
    }
  }

  for (const v of violations) {
    console.log(`EVENTS_APPEND_VIOLATION eventId=${v.eventId} invariant=${invariantId}`);
  }

  if (violations.length === 0) {
    return { status: 'EVENTS_APPEND_OK', level: 'ok' };
  }

  if (matrixMode.mode === 'STRICT') {
    return { status: 'EVENTS_APPEND_FAIL', level: 'fail' };
  }

  const hasDebt = hasMatchingActiveDebt(debtItems, baselinePath)
    || hasMatchingActiveDebt(debtItems, 'src/contracts/core-event.contract.ts')
    || hasMatchingActiveDebt(debtItems, 'src/contracts/events');
  return {
    status: hasDebt ? 'EVENTS_APPEND_WARN' : 'EVENTS_APPEND_WARN_MISSING_DEBT',
    level: 'warn',
  };
}

function checkOndiskArtifacts(matrixMode, debtItems) {
  const invariantId = 'OPS-ONDISK-001';
  const filePath = 'docs/OPS/ONDISK_ARTIFACTS.json';

  const violations = [];

  let parsed;
  try {
    parsed = JSON.parse(readText(filePath));
  } catch {
    violations.push({ id: 'unknown', field: 'json' });
    parsed = null;
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    violations.push({ id: 'unknown', field: 'root' });
  }

  const schemaVersion = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed.schemaVersion : undefined;
  if (schemaVersion !== 1) {
    violations.push({ id: 'unknown', field: 'schemaVersion' });
  }

  const items = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed.items : undefined;
  if (!Array.isArray(items)) {
    violations.push({ id: 'unknown', field: 'items' });
  }
  if (Array.isArray(items) && items.length < 1) {
    violations.push({ id: 'unknown', field: 'items_empty' });
  }

  const allowedStability = new Set(['Stable', 'Evolving', 'Experimental']);
  const allowedKind = new Set(['project_manifest', 'scene_document', 'backup', 'architecture_snapshot', 'cache']);
  const allowedMigrationPolicy = new Set(['required', 'optional', 'not_applicable']);

  const seenIds = new Set();

  if (Array.isArray(items)) {
    for (let i = 0; i < items.length; i += 1) {
      const item = items[i];
      if (!item || typeof item !== 'object' || Array.isArray(item)) {
        violations.push({ id: 'unknown', field: 'item' });
        continue;
      }

      const idRaw = item.id;
      const id = typeof idRaw === 'string' && idRaw.length > 0 ? idRaw : 'unknown';
      if (id === 'unknown') violations.push({ id, field: 'id' });

      if (id !== 'unknown') {
        if (seenIds.has(id)) {
          violations.push({ id, field: 'id_duplicate' });
        } else {
          seenIds.add(id);
        }
      }

      const stability = item.stability;
      if (typeof stability !== 'string' || !allowedStability.has(stability)) {
        violations.push({ id, field: 'stability' });
      }

      const kind = item.kind;
      if (typeof kind !== 'string' || !allowedKind.has(kind)) {
        violations.push({ id, field: 'kind' });
      }

      const pathPattern = item.pathPattern;
      if (typeof pathPattern !== 'string' || pathPattern.length === 0) {
        violations.push({ id, field: 'pathPattern' });
      }

      const schemaRef = item.schemaRef;
      if (typeof schemaRef !== 'string' || schemaRef.length === 0) {
        violations.push({ id, field: 'schemaRef' });
      }

      const migrationPolicy = item.migrationPolicy;
      if (typeof migrationPolicy !== 'string' || !allowedMigrationPolicy.has(migrationPolicy)) {
        violations.push({ id, field: 'migrationPolicy' });
      }

      const safeToDelete = item.safeToDelete;
      if (typeof safeToDelete !== 'boolean') {
        violations.push({ id, field: 'safeToDelete' });
      }

      if ('notes' in item) {
        if (typeof item.notes !== 'string') {
          violations.push({ id, field: 'notes' });
        }
      }

      const isCache = kind === 'cache';
      if (isCache) {
        if (migrationPolicy !== 'not_applicable') {
          violations.push({ id, field: 'migrationPolicy_cache' });
        }
        if (safeToDelete !== true) {
          violations.push({ id, field: 'safeToDelete_cache' });
        }
      } else {
        if (migrationPolicy !== 'required') {
          violations.push({ id, field: 'migrationPolicy_non_cache' });
        }
        if (safeToDelete !== false) {
          violations.push({ id, field: 'safeToDelete_non_cache' });
        }
      }
    }
  }

  for (const v of violations) {
    console.log(`ONDISK_VIOLATION id=${v.id} field=${v.field} invariant=${invariantId}`);
  }

  if (violations.length === 0) {
    return { status: 'ONDISK_OK', level: 'ok' };
  }

  if (matrixMode.mode === 'STRICT') {
    return { status: 'ONDISK_FAIL', level: 'fail' };
  }

  const hasDebt = hasMatchingActiveDebt(debtItems, filePath);
  return {
    status: hasDebt ? 'ONDISK_WARN' : 'ONDISK_WARN_MISSING_DEBT',
    level: 'warn',
  };
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
  const queuePolicy = checkQueuePolicies(matrixMode, debt.items, queue.items);

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

  const capsPolicy = checkCapabilitiesMatrix(matrixMode, debt.items, caps.items);
  const publicSurface = checkPublicSurface(matrixMode, debt.items);
  const eventsAppend = checkEventsAppendOnly(matrixMode, debt.items);
  const ondiskPolicy = checkOndiskArtifacts(matrixMode, debt.items);

  const debtTtl = checkDebtTtl(debt.items, matrixMode.mode);
  const coreDet = checkCoreDeterminism(matrixMode, debt.items);
  const coreBoundary = checkCoreBoundary(matrixMode, debt.items);

  console.log(coreBoundary.status);
  console.log(coreDet.status);
  console.log(queuePolicy.status);
  console.log(capsPolicy.status);
  console.log(publicSurface.status);
  console.log(eventsAppend.status);
  console.log(ondiskPolicy.status);
  console.log(debtTtl.status);

  const hasFail = coreBoundary.level === 'fail'
    || coreDet.level === 'fail'
    || queuePolicy.level === 'fail'
    || capsPolicy.level === 'fail'
    || publicSurface.level === 'fail'
    || eventsAppend.level === 'fail'
    || ondiskPolicy.level === 'fail'
    || debtTtl.level === 'fail';
  const hasWarn = coreBoundary.level === 'warn'
    || coreDet.level === 'warn'
    || queuePolicy.level === 'warn'
    || capsPolicy.level === 'warn'
    || publicSurface.level === 'warn'
    || eventsAppend.level === 'warn'
    || ondiskPolicy.level === 'warn'
    || debtTtl.level === 'warn';

  if (hasFail) {
    console.log('DOCTOR_FAIL');
    process.exit(1);
  }
  if (hasWarn) {
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
