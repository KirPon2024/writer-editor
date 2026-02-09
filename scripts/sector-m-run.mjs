#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const RESULT_SCHEMA_VERSION = 'sector-m-run.v1';
const DEFAULT_ARTIFACTS_ROOT = 'artifacts/sector-m-run';
const SECTOR_M_STATUS_PATH = 'docs/OPS/STATUS/SECTOR_M.json';
const SECTOR_M_CHECKS_PATH = 'docs/OPS/STATUS/SECTOR_M_CHECKS.md';
const SECTOR_M_SCOPE_MAP_PATH = 'scripts/ops/sector-m-scope-map.json';
const DELIVERY_FALLBACK_RUNBOOK_PATH = 'docs/OPS/RUNBOOKS/DELIVERY_FALLBACK_NETWORK_DNS.md';
const DOCTOR_PATH = 'scripts/doctor.mjs';

function parseArgs(argv) {
  const out = { pack: 'fast' };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--pack') {
      out.pack = String(argv[i + 1] || '').toLowerCase();
      i += 1;
    }
  }
  return out;
}

function normalizePathForJson(filePath) {
  return String(filePath).replaceAll('\\', '/');
}

function writeFileAtomic(targetPath, content) {
  const directory = path.dirname(targetPath);
  fs.mkdirSync(directory, { recursive: true });
  const tmpPath = `${targetPath}.tmp`;
  fs.writeFileSync(tmpPath, content, 'utf8');
  fs.renameSync(tmpPath, targetPath);
}

function createRunId(startedAtIso) {
  const base = String(startedAtIso).replace(/[:.]/g, '-');
  return `${base}-${process.pid}`;
}

function parseKvTokens(text) {
  const tokens = new Map();
  for (const lineRaw of String(text || '').split(/\r?\n/)) {
    const line = lineRaw.trim();
    if (!line) continue;
    const idx = line.indexOf('=');
    if (idx <= 0) continue;
    const key = line.slice(0, idx);
    const value = line.slice(idx + 1);
    if (!tokens.has(key)) tokens.set(key, value);
  }
  return tokens;
}

function hasNpmScript(scriptName) {
  try {
    const parsed = JSON.parse(fs.readFileSync('package.json', 'utf8'));
    const scripts = parsed && typeof parsed === 'object' ? parsed.scripts : null;
    return !!(scripts && typeof scripts === 'object' && typeof scripts[scriptName] === 'string' && scripts[scriptName].trim().length > 0);
  } catch {
    return false;
  }
}

function loadScopeMap() {
  if (!fs.existsSync(SECTOR_M_SCOPE_MAP_PATH)) {
    return { ok: 0, reason: 'ALLOWLIST_VIOLATION', details: `${SECTOR_M_SCOPE_MAP_PATH} is missing` };
  }
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(SECTOR_M_SCOPE_MAP_PATH, 'utf8'));
  } catch {
    return { ok: 0, reason: 'ALLOWLIST_VIOLATION', details: `${SECTOR_M_SCOPE_MAP_PATH} is invalid JSON` };
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { ok: 0, reason: 'ALLOWLIST_VIOLATION', details: 'scope map must be an object' };
  }
  if (parsed.schemaVersion !== 'sector-m-scope-map.v1') {
    return { ok: 0, reason: 'ALLOWLIST_VIOLATION', details: 'scope map schemaVersion mismatch' };
  }
  if (!Array.isArray(parsed.phaseOrder) || parsed.phaseOrder.length === 0) {
    return { ok: 0, reason: 'ALLOWLIST_VIOLATION', details: 'scope map phaseOrder is invalid' };
  }
  if (!parsed.allowByPhase || typeof parsed.allowByPhase !== 'object' || Array.isArray(parsed.allowByPhase)) {
    return { ok: 0, reason: 'ALLOWLIST_VIOLATION', details: 'scope map allowByPhase is invalid' };
  }
  if (!parsed.allowPrefixByPhase || typeof parsed.allowPrefixByPhase !== 'object' || Array.isArray(parsed.allowPrefixByPhase)) {
    return { ok: 0, reason: 'ALLOWLIST_VIOLATION', details: 'scope map allowPrefixByPhase is invalid' };
  }
  if (!Array.isArray(parsed.opsCarveoutAllow)) {
    return { ok: 0, reason: 'ALLOWLIST_VIOLATION', details: 'scope map opsCarveoutAllow is invalid' };
  }
  return { ok: 1, reason: '', details: 'scope map loaded', scopeMap: parsed };
}

function scopeMapPhaseIndex(scopeMap, phase) {
  const idx = scopeMap.phaseOrder.indexOf(phase);
  return idx >= 0 ? idx : 0;
}

function buildAllowedForPhase(scopeMap, phase) {
  const allowed = new Set();
  const cappedIndex = scopeMapPhaseIndex(scopeMap, phase);
  for (let i = 0; i <= cappedIndex; i += 1) {
    const phaseName = scopeMap.phaseOrder[i];
    const items = Array.isArray(scopeMap.allowByPhase[phaseName]) ? scopeMap.allowByPhase[phaseName] : [];
    for (const item of items) {
      allowed.add(item);
    }
  }
  return allowed;
}

function buildAllowedPrefixesForPhase(scopeMap, phase) {
  const prefixes = new Set();
  const cappedIndex = scopeMapPhaseIndex(scopeMap, phase);
  for (let i = 0; i <= cappedIndex; i += 1) {
    const phaseName = scopeMap.phaseOrder[i];
    const items = Array.isArray(scopeMap.allowPrefixByPhase[phaseName]) ? scopeMap.allowPrefixByPhase[phaseName] : [];
    for (const item of items) {
      prefixes.add(item);
    }
  }
  return prefixes;
}

function readSectorMSoT() {
  if (!fs.existsSync(SECTOR_M_STATUS_PATH)) {
    return { ok: 0, reason: 'SOT_MISSING_OR_INVALID', details: 'SECTOR_M.json is missing', phase: '' };
  }
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(SECTOR_M_STATUS_PATH, 'utf8'));
  } catch {
    return { ok: 0, reason: 'SOT_MISSING_OR_INVALID', details: 'SECTOR_M.json is not valid JSON', phase: '' };
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { ok: 0, reason: 'SOT_MISSING_OR_INVALID', details: 'SECTOR_M.json top-level must be object', phase: '' };
  }

  const required = ['schemaVersion', 'status', 'phase', 'goTag', 'baselineSha'];
  for (const key of required) {
    if (!(key in parsed)) {
      return { ok: 0, reason: 'SOT_MISSING_OR_INVALID', details: `SECTOR_M.json missing field: ${key}`, phase: '' };
    }
  }

  const statusAllowed = new Set(['NOT_STARTED', 'IN_PROGRESS', 'DONE']);
  const phaseAllowed = new Set(['M0', 'M1', 'M2', 'M3', 'M4', 'M5', 'M6', 'DONE']);
  const goTagAllowed = new Set([
    '',
    'GO:SECTOR_M_M0_DONE',
    'GO:SECTOR_M_M1_DONE',
    'GO:SECTOR_M_M2_DONE',
    'GO:SECTOR_M_M3_DONE',
    'GO:SECTOR_M_M4_DONE',
    'GO:SECTOR_M_M5_DONE',
    'GO:SECTOR_M_M6_DONE',
    'GO:SECTOR_M_DONE',
  ]);
  if (parsed.schemaVersion !== 'sector-m-status.v1') {
    return { ok: 0, reason: 'SOT_MISSING_OR_INVALID', details: 'schemaVersion must be sector-m-status.v1', phase: '' };
  }
  if (!statusAllowed.has(parsed.status)) {
    return { ok: 0, reason: 'SOT_MISSING_OR_INVALID', details: 'status must be NOT_STARTED|IN_PROGRESS|DONE', phase: '' };
  }
  if (!phaseAllowed.has(parsed.phase)) {
    return { ok: 0, reason: 'SOT_MISSING_OR_INVALID', details: 'phase is invalid', phase: '' };
  }
  if (!goTagAllowed.has(parsed.goTag)) {
    return { ok: 0, reason: 'SOT_MISSING_OR_INVALID', details: 'goTag is invalid', phase: '' };
  }
  if (!/^[0-9a-f]{7,}$/i.test(String(parsed.baselineSha || ''))) {
    return { ok: 0, reason: 'SOT_MISSING_OR_INVALID', details: 'baselineSha must be a git sha', phase: '' };
  }
  return {
    ok: 1,
    reason: '',
    details: `SECTOR_M.json schema is valid for ${parsed.phase}`,
    phase: parsed.phase,
  };
}

function validateChecksDoc(phase) {
  if (!fs.existsSync(SECTOR_M_CHECKS_PATH)) {
    return { ok: 0, reason: 'SOT_MISSING_OR_INVALID', details: 'SECTOR_M_CHECKS.md is missing' };
  }
  const text = fs.readFileSync(SECTOR_M_CHECKS_PATH, 'utf8');
  const requiredM0Markers = [
    'CHECK_M0_SOT_SCHEMA',
    'CHECK_M0_RUNNER_ARTIFACT',
    'CHECK_M0_DOCTOR_TOKENS',
    'CHECK_M0_NO_SCOPE_LEAK',
  ];
  for (const marker of requiredM0Markers) {
    if (!text.includes(marker)) {
      return { ok: 0, reason: 'SOT_MISSING_OR_INVALID', details: `SECTOR_M_CHECKS.md missing marker: ${marker}` };
    }
  }
  if (phase === 'M1') {
    const requiredM1Markers = [
      'CHECK_M1_CONTRACT_DOCS_PRESENT',
      'CHECK_M1_CONTRACT_DOCS_COMPLETE',
      'CHECK_M1_NO_SPLIT_BRAIN_ENTRYPOINT',
      'CHECK_M1_POLICIES_NON_AMBIGUOUS',
    ];
    for (const marker of requiredM1Markers) {
      if (!text.includes(marker)) {
        return { ok: 0, reason: 'SOT_MISSING_OR_INVALID', details: `SECTOR_M_CHECKS.md missing marker: ${marker}` };
      }
    }
  }
  if (phase === 'M2') {
    const requiredM2Markers = [
      'CHECK_M2_TRANSFORM_FILES_PRESENT',
      'CHECK_M2_ROUNDTRIP_PROOFS',
      'CHECK_M2_SECURITY_ENFORCEMENT',
      'CHECK_M2_LIMITS_ENFORCEMENT',
    ];
    for (const marker of requiredM2Markers) {
      if (!text.includes(marker)) {
        return { ok: 0, reason: 'SOT_MISSING_OR_INVALID', details: `SECTOR_M_CHECKS.md missing marker: ${marker}` };
      }
    }
  }
  if (phase === 'M3') {
    const requiredM3Markers = [
      'CHECK_M3_COMMAND_WIRING',
      'CHECK_M3_TYPED_ERRORS',
      'CHECK_M3_SECURITY_VIA_COMMANDS',
    ];
    for (const marker of requiredM3Markers) {
      if (!text.includes(marker)) {
        return { ok: 0, reason: 'SOT_MISSING_OR_INVALID', details: `SECTOR_M_CHECKS.md missing marker: ${marker}` };
      }
    }
  }
  if (phase === 'M4') {
    const requiredM4Markers = [
      'CHECK_M4_UI_PATH_MINIMAL',
      'CHECK_M4_UI_NO_DIRECT_PLATFORM_BYPASS',
      'CHECK_M4_UI_FEEDBACK',
    ];
    for (const marker of requiredM4Markers) {
      if (!text.includes(marker)) {
        return { ok: 0, reason: 'SOT_MISSING_OR_INVALID', details: `SECTOR_M_CHECKS.md missing marker: ${marker}` };
      }
    }
  }
  return { ok: 1, reason: '', details: 'SECTOR_M_CHECKS.md markers present' };
}

function validateAllowlistLeak(phase) {
  const scopeMapLoad = loadScopeMap();
  if (scopeMapLoad.ok !== 1) {
    return {
      ok: 0,
      reason: scopeMapLoad.reason,
      details: scopeMapLoad.details,
      violations: [],
    };
  }
  const scopeMap = scopeMapLoad.scopeMap;
  const carveout = new Set(scopeMap.opsCarveoutAllow);
  const allowlist = buildAllowedForPhase(scopeMap, phase);
  const allowPrefixes = buildAllowedPrefixesForPhase(scopeMap, phase);
  const diff = spawnSync('git', ['diff', '--name-only', 'origin/main..HEAD'], { encoding: 'utf8' });
  if (diff.status !== 0) {
    return { ok: 0, reason: 'ALLOWLIST_VIOLATION', details: 'git diff command failed', violations: [] };
  }
  const files = String(diff.stdout || '')
    .split(/\r?\n/)
    .map((x) => x.trim())
    .filter(Boolean)
    .sort();

  const violations = files.filter((filePath) => {
    if (carveout.has(filePath)) return false;
    if (allowlist.has(filePath)) return false;
    for (const prefix of allowPrefixes) {
      if (filePath.startsWith(prefix)) return false;
    }
    return true;
  });
  if (violations.length > 0) {
    return {
      ok: 0,
      reason: 'ALLOWLIST_VIOLATION',
      details: `Files outside allowlist: ${violations.join(', ')}`,
      violations,
    };
  }

  return {
    ok: 1,
    reason: '',
    details: `Diff files within ${phase || 'M0'} allowlist (${files.length})`,
    violations: [],
  };
}

function validateM1ContractDocs() {
  const phase = readSectorMSoT().phase;
  if (phase !== 'M1') {
    return { ok: 1, reason: '', details: 'M1 contract doc check skipped outside M1 phase' };
  }
  const required = [
    'docs/FORMAT/MARKDOWN_MODE_SPEC_v1.md',
    'docs/FORMAT/MARKDOWN_LOSS_POLICY_v1.md',
    'docs/FORMAT/MARKDOWN_SECURITY_POLICY_v1.md',
  ];
  for (const filePath of required) {
    if (!fs.existsSync(filePath)) {
      return { ok: 0, reason: 'SOT_MISSING_OR_INVALID', details: `missing M1 contract doc: ${filePath}` };
    }
  }
  return { ok: 1, reason: '', details: 'M1 contract docs present' };
}

function validateM2TransformSurface() {
  const phase = readSectorMSoT().phase;
  if (phase !== 'M2') {
    return { ok: 1, reason: '', details: 'M2 transform surface check skipped outside M2 phase' };
  }
  const required = [
    'src/export/markdown/v1/index.mjs',
    'src/export/markdown/v1/types.mjs',
    'src/export/markdown/v1/lossReport.mjs',
    'src/export/markdown/v1/parseMarkdownV1.mjs',
    'src/export/markdown/v1/serializeMarkdownV1.mjs',
    'test/unit/sector-m-m2-roundtrip.test.js',
    'test/unit/sector-m-m2-security-policy.test.js',
    'test/unit/sector-m-m2-limits.test.js',
  ];
  for (const filePath of required) {
    if (!fs.existsSync(filePath)) {
      return { ok: 0, reason: 'SOT_MISSING_OR_INVALID', details: `missing M2 transform file: ${filePath}` };
    }
  }
  return { ok: 1, reason: '', details: 'M2 transform surface present' };
}

function validateM3CommandSurface() {
  const phase = readSectorMSoT().phase;
  if (phase !== 'M3') {
    return { ok: 1, reason: '', details: 'M3 command surface check skipped outside M3 phase' };
  }
  const required = [
    'src/renderer/commands/projectCommands.mjs',
    'src/preload.js',
    'src/main.js',
    'test/unit/sector-m-m3-commands.test.js',
    'test/unit/sector-m-m3-security.test.js',
    'test/fixtures/sector-m/m3/simple.md',
    'test/fixtures/sector-m/m3/unsafe.html.md',
    'test/fixtures/sector-m/m3/expected-import.json',
    'test/fixtures/sector-m/m3/expected-export.json',
  ];
  for (const filePath of required) {
    if (!fs.existsSync(filePath)) {
      return { ok: 0, reason: 'SOT_MISSING_OR_INVALID', details: `missing M3 command file: ${filePath}` };
    }
  }
  return { ok: 1, reason: '', details: 'M3 command surface present' };
}

function validateM4UiPathSurface() {
  const phase = readSectorMSoT().phase;
  if (phase !== 'M4') {
    return { ok: 1, reason: '', details: 'M4 UI path check skipped outside M4 phase' };
  }
  const required = [
    'src/renderer/editor.js',
    'test/unit/sector-m-m4-ui-path.test.js',
    'test/fixtures/sector-m/m4/ui-path-markers.json',
  ];
  for (const filePath of required) {
    if (!fs.existsSync(filePath)) {
      return { ok: 0, reason: 'SOT_MISSING_OR_INVALID', details: `missing M4 UI path file: ${filePath}` };
    }
  }
  return { ok: 1, reason: '', details: 'M4 UI path surface present' };
}

function validateFullScopeMapIntegrity() {
  const scopeMapLoad = loadScopeMap();
  if (scopeMapLoad.ok !== 1) {
    return {
      ok: 0,
      reason: scopeMapLoad.reason,
      details: scopeMapLoad.details,
    };
  }
  const scopeMap = scopeMapLoad.scopeMap;
  const expectedPhases = ['M0', 'M1', 'M2', 'M3', 'M4', 'M5', 'M6', 'DONE'];
  for (const phase of expectedPhases) {
    if (!scopeMap.phaseOrder.includes(phase)) {
      return { ok: 0, reason: 'ALLOWLIST_VIOLATION', details: `scope map missing phase: ${phase}` };
    }
    if (!Array.isArray(scopeMap.allowByPhase[phase])) {
      return { ok: 0, reason: 'ALLOWLIST_VIOLATION', details: `scope map allowByPhase missing: ${phase}` };
    }
    if (!Array.isArray(scopeMap.allowPrefixByPhase[phase])) {
      return { ok: 0, reason: 'ALLOWLIST_VIOLATION', details: `scope map allowPrefixByPhase missing: ${phase}` };
    }
  }

  if (!fs.existsSync(DELIVERY_FALLBACK_RUNBOOK_PATH)) {
    return { ok: 0, reason: 'SOT_MISSING_OR_INVALID', details: 'delivery fallback runbook is missing' };
  }
  const runbook = fs.readFileSync(DELIVERY_FALLBACK_RUNBOOK_PATH, 'utf8');
  const markers = [
    '## NETWORK_GATE',
    'RETRY_MAX=1',
    'git ls-remote origin -h refs/heads/main',
    'node scripts/ops/network-gate.mjs',
  ];
  for (const marker of markers) {
    if (!runbook.includes(marker)) {
      return { ok: 0, reason: 'SOT_MISSING_OR_INVALID', details: `runbook missing marker: ${marker}` };
    }
  }
  return { ok: 1, reason: '', details: 'full-only scope-map integrity checks passed' };
}

function runDoctorCheck(phase) {
  if (!fs.existsSync(DOCTOR_PATH)) {
    return { ok: 0, reason: 'DOCTOR_TOKEN_REGRESSION', details: 'doctor script missing' };
  }
  const out = spawnSync(process.execPath, [DOCTOR_PATH], {
    encoding: 'utf8',
    env: {
      ...process.env,
      SECTOR_M_RUN_SKIP_DOCTOR_TEST: '1',
    },
  });
  if (out.status !== 0) {
    return { ok: 0, reason: 'DOCTOR_TOKEN_REGRESSION', details: 'doctor exited non-zero' };
  }
  const tokens = parseKvTokens(out.stdout);
  const must = [
    ['SECTOR_M_STATUS_OK', '1'],
    ['SECTOR_M_PHASE', phase],
    ['M0_RUNNER_EXISTS', '1'],
  ];
  if (phase === 'M1') {
    must.push(['M1_CONTRACT_OK', '1']);
  }
  if (phase === 'M2') {
    must.push(['M2_TRANSFORM_OK', '1']);
    must.push(['M2_ROUNDTRIP_OK', '1']);
    must.push(['M2_SECURITY_ENFORCEMENT_OK', '1']);
    must.push(['M2_LIMITS_OK', '1']);
  }
  if (phase === 'M3') {
    must.push(['M3_COMMAND_WIRING_OK', '1']);
    must.push(['M3_IMPORT_CMD_OK', '1']);
    must.push(['M3_EXPORT_CMD_OK', '1']);
    must.push(['M3_TYPED_ERRORS_OK', '1']);
  }
  if (phase === 'M4') {
    must.push(['M4_UI_PATH_OK', '1']);
    must.push(['M4_GO_TAG_RULE_OK', '1']);
    must.push(['M3_COMMAND_WIRING_OK', '1']);
  }
  for (const [k, v] of must) {
    if (tokens.get(k) !== v) {
      return { ok: 0, reason: 'DOCTOR_TOKEN_REGRESSION', details: `doctor token mismatch: ${k}=${tokens.get(k) || ''}` };
    }
  }
  return { ok: 1, reason: '', details: 'doctor emits required M0 tokens' };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!['fast', 'full'].includes(args.pack)) {
    console.log('SECTOR_M_RUN_PACK=');
    console.log('SECTOR_M_RUN_OK=0');
    console.log('SECTOR_M_RUN_FAIL_REASON=PACK_NOT_SUPPORTED');
    process.exit(1);
  }

  if (!hasNpmScript('test:sector-m')) {
    console.log(`SECTOR_M_RUN_PACK=${args.pack}`);
    console.log('SECTOR_M_RUN_OK=0');
    console.log('SECTOR_M_RUN_FAIL_REASON=TEST_FAIL');
    process.exit(1);
  }

  const startedAt = new Date().toISOString();
  const artifactsRoot = path.resolve(process.env.SECTOR_M_ARTIFACTS_ROOT || DEFAULT_ARTIFACTS_ROOT);
  const runId = createRunId(startedAt);
  const runDir = path.join(artifactsRoot, runId);
  const latestResultPath = path.join(artifactsRoot, 'latest', 'result.json');
  const runResultPath = path.join(runDir, 'result.json');

  const checks = [];
  let failReason = '';

  const sot = readSectorMSoT();
  checks.push({ checkId: 'CHECK_M0_SOT_SCHEMA', ok: sot.ok, details: sot.details });
  if (!failReason && sot.ok !== 1) failReason = sot.reason;

  const checksDoc = validateChecksDoc(sot.phase);
  checks.push({ checkId: 'CHECK_M0_CHECKS_DOC', ok: checksDoc.ok, details: checksDoc.details });
  if (!failReason && checksDoc.ok !== 1) failReason = checksDoc.reason;

  const noLeak = validateAllowlistLeak(sot.phase);
  checks.push({
    checkId: 'CHECK_M0_NO_SCOPE_LEAK',
    ok: noLeak.ok,
    details: noLeak.details,
    violations: noLeak.violations,
  });
  if (!failReason && noLeak.ok !== 1) failReason = noLeak.reason;

  const m1Docs = validateM1ContractDocs();
  checks.push({
    checkId: 'CHECK_M1_CONTRACT_DOCS_PRESENT',
    ok: m1Docs.ok,
    details: m1Docs.details,
  });
  if (!failReason && m1Docs.ok !== 1) failReason = m1Docs.reason;

  const m2Surface = validateM2TransformSurface();
  checks.push({
    checkId: 'CHECK_M2_TRANSFORM_FILES_PRESENT',
    ok: m2Surface.ok,
    details: m2Surface.details,
  });
  if (!failReason && m2Surface.ok !== 1) failReason = m2Surface.reason;

  const m3Surface = validateM3CommandSurface();
  checks.push({
    checkId: 'CHECK_M3_COMMAND_WIRING',
    ok: m3Surface.ok,
    details: m3Surface.details,
  });
  if (!failReason && m3Surface.ok !== 1) failReason = m3Surface.reason;

  const m4Surface = validateM4UiPathSurface();
  checks.push({
    checkId: 'CHECK_M4_UI_PATH_MINIMAL',
    ok: m4Surface.ok,
    details: m4Surface.details,
  });
  if (!failReason && m4Surface.ok !== 1) failReason = m4Surface.reason;

  if (args.pack === 'full') {
    const fullScope = validateFullScopeMapIntegrity();
    checks.push({
      checkId: 'CHECK_M_FULL_SCOPE_MAP_INTEGRITY',
      ok: fullScope.ok,
      details: fullScope.details,
    });
    if (!failReason && fullScope.ok !== 1) failReason = fullScope.reason;
  }

  const doctor = runDoctorCheck(sot.phase || 'M0');
  checks.push({ checkId: 'CHECK_M0_DOCTOR_TOKENS', ok: doctor.ok, details: doctor.details });
  if (!failReason && doctor.ok !== 1) failReason = doctor.reason;

  checks.push({
    checkId: 'CHECK_M0_RUNNER_ARTIFACT',
    ok: 1,
    details: 'runner artifact paths resolved and will be written atomically',
  });

  const result = {
    schemaVersion: RESULT_SCHEMA_VERSION,
    runId,
    pack: args.pack,
    ok: failReason ? 0 : 1,
    failReason,
    checks,
    paths: {
      artifactsRoot: normalizePathForJson(artifactsRoot),
      runDir: normalizePathForJson(runDir),
      latestResultPath: normalizePathForJson(latestResultPath),
    },
  };

  const json = `${JSON.stringify(result, null, 2)}\n`;
  writeFileAtomic(runResultPath, json);
  writeFileAtomic(latestResultPath, json);

  console.log(`SECTOR_M_RUN_PACK=${args.pack}`);
  console.log(`SECTOR_M_RUN_OK=${result.ok}`);
  console.log(`SECTOR_M_RUN_FAIL_REASON=${failReason}`);
  console.log(`SECTOR_M_RUN_RESULT_PATH=${normalizePathForJson(latestResultPath)}`);

  process.exit(result.ok === 1 ? 0 : 1);
}

main();
