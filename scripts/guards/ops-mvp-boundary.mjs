import fs from 'node:fs';

const POLICY_PATH = 'OPS-CHECKS-MVP-BOUNDARY-01.md';
const SSOT_SECTION_HEADER = '### 1.2 SSOT_ARTIFACTS (EXACT)';

const DEBT_REGISTRY_PATH = 'docs/OPS/DEBT_REGISTRY.json';

function uniqSorted(arr) {
  return [...new Set(arr)].sort();
}

function parseSsotListFromPolicyText(text) {
  const lines = text.split(/\r?\n/);
  let start = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trimEnd() === SSOT_SECTION_HEADER) {
      start = i + 1;
      break;
    }
  }
  if (start === -1) return { ok: false, paths: [] };

  const paths = [];
  for (let i = start; i < lines.length; i++) {
    const line = lines[i];
    if (/^#{1,3}\s+/.test(line)) break;
    const m = line.match(/^\s*-\s+(\S.*)\s*$/);
    if (!m) continue;
    const p = String(m[1]).trim().replaceAll('\\', '/');
    if (!p) continue;
    paths.push(p);
  }
  return { ok: true, paths: uniqSorted(paths) };
}

function printBaseTokens({ declared, missing, debtPresent, debtFallbackRequired }) {
  console.log(`SSOT_DECLARED_COUNT=${declared.length}`);
  console.log(`SSOT_DECLARED=${JSON.stringify(declared)}`);
  console.log(`SSOT_MISSING_COUNT=${missing.length}`);
  console.log(`SSOT_MISSING=${JSON.stringify(missing)}`);
  console.log(`DEBT_REGISTRY_PRESENT=${debtPresent ? 1 : 0}`);
  console.log(`DEBT_REGISTRY_PATH=${DEBT_REGISTRY_PATH}`);
  console.log(`DEBT_REGISTRY_FALLBACK_REQUIRED=${debtFallbackRequired ? 1 : 0}`);
  console.log('SSOT_BOUNDARY_ENFORCED=1');
}

function stopWith({ code, stopToken, declared, missing, debtPresent, debtFallbackRequired }) {
  printBaseTokens({ declared, missing, debtPresent, debtFallbackRequired });
  console.log(`STOP: ${stopToken}=1`);
  process.exit(code);
}

function main() {
  let policyText = '';
  try {
    policyText = fs.readFileSync(POLICY_PATH, 'utf8');
  } catch {
    policyText = '';
  }

  const debtPresent = fs.existsSync(DEBT_REGISTRY_PATH);
  const debtFallbackRequired = !debtPresent;

  const parsed = parseSsotListFromPolicyText(policyText);
  const declared = parsed.paths;

  if (!parsed.ok) {
    stopWith({
      code: 2,
      stopToken: 'SSOT_SECTION_NOT_FOUND',
      declared: [],
      missing: [],
      debtPresent,
      debtFallbackRequired,
    });
  }

  if (debtPresent && !declared.includes(DEBT_REGISTRY_PATH)) {
    stopWith({
      code: 4,
      stopToken: 'DEBT_REGISTRY_EXISTS_BUT_NOT_DECLARED',
      declared,
      missing: [],
      debtPresent,
      debtFallbackRequired: false,
    });
  }

  const missing = [];
  for (const p of declared) {
    if (p === DEBT_REGISTRY_PATH && !debtPresent) continue;
    if (!fs.existsSync(p)) missing.push(p);
  }
  const missingSorted = uniqSorted(missing);

  if (missingSorted.length > 0) {
    stopWith({
      code: 3,
      stopToken: 'SSOT_FILES_MISSING',
      declared,
      missing: missingSorted,
      debtPresent,
      debtFallbackRequired,
    });
  }

  printBaseTokens({ declared, missing: [], debtPresent, debtFallbackRequired });
  process.exit(0);
}

main();

