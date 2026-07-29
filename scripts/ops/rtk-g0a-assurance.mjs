#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

export const DEFAULT_REGISTRY_PATH = 'docs/OPS/RTK/G0A_ASSURANCE_REGISTRY.json';
export const TOOL_VERSION = 'rtk-g0a-assurance.v1';

const ALLOWED_BLOCKING_FAMILIES = new Set([
  'DATA_SAFETY',
  'EXACT_AUTHORITY',
  'REGISTRY_POLICY',
  'OFFLINE_SECURITY',
  'OSS_DEPENDENCY',
]);

const ALLOWED_SOURCE_BINDING_KINDS = new Set([
  'PRODUCTION_BINARY',
  'PRODUCTION_MODULE',
  'EXTERNAL_EVIDENCE',
  'FIXTURE',
  'SYNTHETIC',
]);

const PRODUCT_BOUND_KINDS = new Set([
  'PRODUCTION_BINARY',
  'PRODUCTION_MODULE',
  'EXTERNAL_EVIDENCE',
]);

function isObjectRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizeString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function stableSort(value) {
  if (Array.isArray(value)) return value.map((entry) => stableSort(entry));
  if (!isObjectRecord(value)) return value;
  const out = {};
  for (const key of Object.keys(value).sort((a, b) => a.localeCompare(b))) {
    out[key] = stableSort(value[key]);
  }
  return out;
}

function sha256Hex(value) {
  return createHash('sha256').update(JSON.stringify(stableSort(value))).digest('hex');
}

function parseArgs(argv = process.argv.slice(2)) {
  const out = {
    json: false,
    repoRoot: '',
    registryPath: DEFAULT_REGISTRY_PATH,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = normalizeString(argv[i]);
    if (!arg) continue;
    if (arg === '--json') out.json = true;
    else if (arg === '--repo-root') {
      out.repoRoot = normalizeString(argv[i + 1]);
      i += 1;
    } else if (arg.startsWith('--repo-root=')) {
      out.repoRoot = normalizeString(arg.slice('--repo-root='.length));
    } else if (arg === '--registry') {
      out.registryPath = normalizeString(argv[i + 1]) || DEFAULT_REGISTRY_PATH;
      i += 1;
    } else if (arg.startsWith('--registry=')) {
      out.registryPath = normalizeString(arg.slice('--registry='.length)) || DEFAULT_REGISTRY_PATH;
    }
  }
  return out;
}

function resolveRepoRoot(inputRepoRoot = '') {
  const explicit = normalizeString(inputRepoRoot);
  if (explicit) {
    const marker = path.join(explicit, 'CANON.md');
    if (!fs.existsSync(marker)) {
      return { ok: false, repoRoot: explicit, failSignal: 'E_RTK_G0A_REPO_BINDING_INVALID' };
    }
    return { ok: true, repoRoot: path.resolve(explicit), failSignal: '' };
  }

  const git = spawnSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' });
  if (git.status !== 0) {
    return { ok: false, repoRoot: '', failSignal: 'E_RTK_G0A_REPO_BINDING_INVALID' };
  }
  const repoRoot = normalizeString(git.stdout);
  if (!repoRoot || !fs.existsSync(path.join(repoRoot, 'CANON.md'))) {
    return { ok: false, repoRoot, failSignal: 'E_RTK_G0A_REPO_BINDING_INVALID' };
  }
  return { ok: true, repoRoot: path.resolve(repoRoot), failSignal: '' };
}

function readJson(absPath) {
  try {
    return { ok: true, value: JSON.parse(fs.readFileSync(absPath, 'utf8')) };
  } catch (error) {
    return { ok: false, value: null, error: String(error && error.message ? error.message : error) };
  }
}

function assertionId(row) {
  return normalizeString(row && row.assertionId);
}

function splitTestRef(ref) {
  const value = normalizeString(ref);
  const index = value.indexOf('#');
  if (index === -1) return { file: value, testId: '' };
  return { file: value.slice(0, index), testId: value.slice(index + 1) };
}

function testRefExists(repoRoot, ref) {
  const { file, testId } = splitTestRef(ref);
  if (!file) return false;
  const absPath = path.resolve(repoRoot, file);
  if (!fs.existsSync(absPath)) return false;
  if (!testId) return true;
  const source = fs.readFileSync(absPath, 'utf8');
  return source.includes(testId);
}

function commandProducerExists(repoRoot, command) {
  const normalized = normalizeString(command);
  if (!normalized) return false;
  if (normalized.startsWith('npm run')) return fs.existsSync(path.join(repoRoot, 'package.json'));
  if (normalized.startsWith('node --test ')) {
    return normalized.slice('node --test '.length).split(/\s+/u).every((part) => {
      const clean = part.trim();
      return clean.length === 0 || fs.existsSync(path.resolve(repoRoot, clean));
    });
  }
  if (normalized.startsWith('node ')) {
    const script = normalized.slice('node '.length).split(/\s+/u)[0];
    return Boolean(script) && fs.existsSync(path.resolve(repoRoot, script));
  }
  return false;
}

function validateAssertion(repoRoot, row) {
  const failures = [];
  const id = assertionId(row);
  if (!id) failures.push('E_RTK_G0A_ASSERTION_ID_MISSING');
  if (!normalizeString(row.assertionKind)) failures.push('E_RTK_G0A_ASSERTION_KIND_MISSING');
  if (row.blocking !== true) failures.push('E_RTK_G0A_ASSERTION_NOT_BLOCKING');
  if (!commandProducerExists(repoRoot, row.producerCommand)) {
    failures.push('E_RTK_G0A_PRODUCER_MISSING');
  }
  if (!normalizeString(row.producerToken)) failures.push('E_RTK_G0A_PRODUCER_TOKEN_MISSING');
  if (!normalizeString(row.negativeExpectedFailSignal)) {
    failures.push('E_RTK_G0A_NEGATIVE_FAILSIGNAL_MISSING');
  }

  const sourceBindings = Array.isArray(row.sourceBindings) ? row.sourceBindings : [];
  if (sourceBindings.length === 0) failures.push('E_RTK_G0A_SOURCE_BINDING_MISSING');
  let productBindingCount = 0;
  for (const binding of sourceBindings) {
    const kind = normalizeString(binding && binding.kind);
    const ref = normalizeString(binding && binding.ref);
    if (!ALLOWED_SOURCE_BINDING_KINDS.has(kind)) failures.push('E_RTK_G0A_SOURCE_BINDING_KIND_INVALID');
    if (PRODUCT_BOUND_KINDS.has(kind)) productBindingCount += 1;
    if (kind === 'PRODUCTION_MODULE' && (!ref || !fs.existsSync(path.resolve(repoRoot, ref)))) {
      failures.push('E_RTK_G0A_SOURCE_BINDING_REF_MISSING');
    }
  }
  if (row.blocking === true && productBindingCount === 0) {
    failures.push('E_RTK_G0A_FIXTURE_ONLY_BLOCKING_BINDING');
  }

  const positiveTests = Array.isArray(row.positiveTestIds) ? row.positiveTestIds : [];
  const negativeTests = Array.isArray(row.negativeTestIds) ? row.negativeTestIds : [];
  if (positiveTests.length === 0) failures.push('E_RTK_G0A_POSITIVE_TEST_MISSING');
  if (negativeTests.length === 0) failures.push('E_RTK_G0A_NEGATIVE_TEST_MISSING');
  for (const ref of [...positiveTests, ...negativeTests]) {
    if (!testRefExists(repoRoot, ref)) failures.push('E_RTK_G0A_TEST_REF_MISSING');
  }

  const modes = isObjectRecord(row.dispositionByMode) ? row.dispositionByMode : {};
  for (const mode of ['pr', 'release', 'promotion']) {
    if (modes[mode] !== 'blocking') failures.push('E_RTK_G0A_MODE_DISPOSITION_INVALID');
  }
  if (!normalizeString(row.rollbackProcedure)) failures.push('E_RTK_G0A_ROLLBACK_MISSING');
  return { assertionId: id, failures: [...new Set(failures)].sort() };
}

export function evaluateRtkG0AAssurance(input = {}) {
  const repo = resolveRepoRoot(input.repoRoot);
  if (!repo.ok) {
    return {
      ok: false,
      status: 'FAIL',
      failSignal: repo.failSignal,
      failures: [repo.failSignal],
      token: { RTK_G0A_ASSURANCE_OK: 0 },
      RTK_G0A_ASSURANCE_OK: 0,
      toolVersion: TOOL_VERSION,
    };
  }

  const registryPath = normalizeString(input.registryPath || DEFAULT_REGISTRY_PATH);
  const registryAbsPath = path.resolve(repo.repoRoot, registryPath);
  const registryRead = input.registryDoc
    ? { ok: true, value: input.registryDoc }
    : readJson(registryAbsPath);
  if (!registryRead.ok || !isObjectRecord(registryRead.value)) {
    return {
      ok: false,
      status: 'FAIL',
      failSignal: 'E_BLOCKING_TOKEN_UNBOUND',
      failures: ['E_RTK_G0A_REGISTRY_MISSING_OR_INVALID'],
      token: { RTK_G0A_ASSURANCE_OK: 0 },
      RTK_G0A_ASSURANCE_OK: 0,
      toolVersion: TOOL_VERSION,
    };
  }

  const registry = registryRead.value;
  const failures = [];
  if (Number(registry.schemaVersion) !== 1) failures.push('E_RTK_G0A_SCHEMA_VERSION_INVALID');
  if (normalizeString(registry.missionId) !== 'YALKEN_RTK_D1_END_TO_END') {
    failures.push('E_RTK_G0A_MISSION_MISMATCH');
  }
  if (normalizeString(registry.stageId) !== 'G0A_ASSURANCE_REPAIR') {
    failures.push('E_RTK_G0A_STAGE_MISMATCH');
  }
  if (registry.runtimeWiring !== false) failures.push('E_RTK_G0A_RUNTIME_WIRING_FORBIDDEN');
  if (registry.generatedProjection !== true) failures.push('E_RTK_G0A_GENERATED_PROJECTION_MISSING');

  const families = Array.isArray(registry.blockingFamilies) ? registry.blockingFamilies.map(normalizeString) : [];
  for (const family of families) {
    if (!ALLOWED_BLOCKING_FAMILIES.has(family)) failures.push('E_RTK_G0A_BLOCKING_FAMILY_EXPANSION');
  }
  for (const required of ALLOWED_BLOCKING_FAMILIES) {
    if (!families.includes(required)) failures.push('E_RTK_G0A_BLOCKING_FAMILY_MISSING');
  }

  const ruleset = isObjectRecord(registry.ruleset) ? registry.ruleset : {};
  if (normalizeString(ruleset.requiredStatusCheck) !== 'oss-policy') {
    failures.push('E_RTK_G0A_REQUIRED_STATUS_MISMATCH');
  }
  if (!normalizeString(ruleset.branchRulesetName)) failures.push('E_RTK_G0A_RULESET_NAME_MISSING');

  const assertions = Array.isArray(registry.assertions) ? registry.assertions : [];
  if (assertions.length === 0) failures.push('E_RTK_G0A_ASSERTIONS_MISSING');
  const assertionResults = [];
  const seenIds = new Set();
  for (const row of assertions) {
    const result = validateAssertion(repo.repoRoot, row);
    assertionResults.push(result);
    if (seenIds.has(result.assertionId)) failures.push('E_RTK_G0A_ASSERTION_DUPLICATE');
    seenIds.add(result.assertionId);
    failures.push(...result.failures);
  }

  const uniqueFailures = [...new Set(failures)].sort();
  const ok = uniqueFailures.length === 0;
  return {
    ok,
    status: ok ? 'PASS' : 'FAIL',
    failSignal: ok ? '' : 'E_BLOCKING_TOKEN_UNBOUND',
    failures: uniqueFailures,
    registryDigest: sha256Hex(registry),
    registryPath,
    repoRoot: repo.repoRoot,
    assertionCount: assertions.length,
    blockingFamilyCount: families.length,
    assertionResults,
    token: { RTK_G0A_ASSURANCE_OK: ok ? 1 : 0 },
    RTK_G0A_ASSURANCE_OK: ok ? 1 : 0,
    toolVersion: TOOL_VERSION,
  };
}

function printTokens(result) {
  console.log(`RTK_G0A_ASSURANCE_OK=${result.RTK_G0A_ASSURANCE_OK}`);
  console.log(`RTK_G0A_ASSURANCE_STATUS=${result.status}`);
  console.log(`RTK_G0A_ASSURANCE_REGISTRY_DIGEST=${result.registryDigest || ''}`);
  if (result.failSignal) console.log(`FAIL_REASON=${result.failSignal}`);
}

function main() {
  const args = parseArgs();
  const result = evaluateRtkG0AAssurance({
    repoRoot: args.repoRoot,
    registryPath: args.registryPath,
  });
  if (args.json) process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  else printTokens(result);
  process.exit(result.ok ? 0 : 1);
}

const selfPath = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === selfPath) {
  main();
}
