import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

export const ARCHITECTURE_MANIFEST_PATH = 'docs/architecture/AGENT_ARCHITECTURE_MANIFEST_V1.json';
export const BOOTSTRAP_STATUS_PATH = 'docs/OPERATIONS/STATUS/AGENT_BOOTSTRAP_STATUS.json';
export const AUTOMATION_POLICY_PATH = 'docs/OPERATIONS/STATUS/CODEX_AUTOMATION_POLICY.json';
export const CURRENT_COREX_PATH = 'docs/corex/COREX.v2.md';

const TASK_TYPES = new Set([
  'REPORT_ONLY',
  'DOCS_ONLY',
  'PRODUCT_CODE',
  'PRODUCT_UI',
  'OPS_GOVERNANCE',
  'HYGIENE_ISOLATION',
]);

function toPosix(value) {
  return String(value).split(path.sep).join('/');
}

function fail(code, message, extra = {}) {
  return { code, message, ...extra };
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function runGit(repoRoot, args) {
  const result = spawnSync('git', args, {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 10000,
  });
  if (result.status !== 0) {
    const stderr = String(result.stderr || '').trim();
    throw new Error(`git ${args.join(' ')} failed${stderr ? `: ${stderr}` : ''}`);
  }
  return String(result.stdout || '').trim();
}

export function parseArgs(argv = []) {
  const result = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) continue;
    const equalIndex = token.indexOf('=');
    if (equalIndex > 2) {
      result[token.slice(2, equalIndex)] = token.slice(equalIndex + 1);
      continue;
    }
    const key = token.slice(2);
    const next = argv[index + 1];
    if (next && !next.startsWith('--')) {
      result[key] = next;
      index += 1;
    } else {
      result[key] = true;
    }
  }
  return result;
}

export function resolveRepoRoot(start = process.cwd()) {
  const result = spawnSync('git', ['rev-parse', '--show-toplevel'], {
    cwd: start,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
    timeout: 5000,
  });
  if (result.status !== 0 || !String(result.stdout || '').trim()) {
    throw new Error('E_AGENT_GIT_ROOT_NOT_FOUND');
  }
  return path.resolve(String(result.stdout).trim());
}

export function readJson(repoRoot, relativePath) {
  const fullPath = path.join(repoRoot, relativePath);
  if (!fs.existsSync(fullPath)) throw new Error(`MISSING_JSON:${relativePath}`);
  try {
    return JSON.parse(fs.readFileSync(fullPath, 'utf8'));
  } catch (error) {
    throw new Error(`INVALID_JSON:${relativePath}:${error.message}`);
  }
}

export function sha256File(repoRoot, relativePath) {
  return crypto
    .createHash('sha256')
    .update(fs.readFileSync(path.join(repoRoot, relativePath)))
    .digest('hex');
}

function safeRepoRelative(value) {
  if (typeof value !== 'string' || value.trim() === '') return false;
  if (path.isAbsolute(value)) return false;
  const normalized = path.posix.normalize(value.replaceAll('\\', '/'));
  return normalized !== '..'
    && !normalized.startsWith('../')
    && normalized !== '.'
    && !normalized.startsWith('/');
}

function ensureUniqueStrings(list, field, errors) {
  if (!Array.isArray(list) || list.length === 0) {
    errors.push(fail('E_AGENT_ARCHITECTURE_MANIFEST_INVALID', `${field} must be a non-empty array`));
    return;
  }
  const seen = new Set();
  for (const item of list) {
    if (typeof item !== 'string' || item.trim() === '') {
      errors.push(fail('E_AGENT_ARCHITECTURE_MANIFEST_INVALID', `${field} has an empty item`));
      continue;
    }
    if (seen.has(item)) errors.push(fail('E_AGENT_ARCHITECTURE_MANIFEST_INVALID', `${field} duplicates ${item}`));
    seen.add(item);
  }
}

function readText(repoRoot, relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

function requireTokens(repoRoot, relativePath, tokens, errors) {
  const fullPath = path.join(repoRoot, relativePath);
  if (!fs.existsSync(fullPath)) {
    errors.push(fail('E_AGENT_ENTRYPOINT_MISSING', `Missing required entrypoint ${relativePath}`, { path: relativePath }));
    return;
  }
  const text = fs.readFileSync(fullPath, 'utf8');
  for (const token of tokens) {
    if (!text.includes(token)) {
      errors.push(fail('E_AGENT_DOCUMENT_DRIFT', `${relativePath} missing ${token}`, { path: relativePath }));
    }
  }
}

export function validateRepositoryGuardrails(options = {}) {
  const repoRoot = path.resolve(options.repoRoot || resolveRepoRoot());
  const errors = [];
  let manifest;
  let canonStatus;
  let bootstrapStatus;
  let bootstrapSpec;
  let policy;

  try {
    manifest = readJson(repoRoot, ARCHITECTURE_MANIFEST_PATH);
  } catch (error) {
    errors.push(fail('E_AGENT_ARCHITECTURE_MANIFEST_INVALID', error.message));
    return { ok: false, repoRoot, errors };
  }

  if (manifest.schemaVersion !== 1 || manifest.status !== 'ACTIVE_REPOSITORY_ARCHITECTURE_BOOTSTRAP') {
    errors.push(fail('E_AGENT_ARCHITECTURE_MANIFEST_INVALID', 'Manifest schemaVersion or status is invalid'));
  }

  if (!Array.isArray(manifest.authorityOrder) || manifest.authorityOrder[0]?.path !== 'docs/OPS/STATUS/CANON_STATUS.json') {
    errors.push(fail('E_AGENT_CANON_RESOLUTION_FAILED', 'Authority order must start with CANON_STATUS resolver'));
  }

  for (const row of manifest.authorityOrder || []) {
    if (row.pathFrom === 'canonicalDocPath') continue;
    if (!safeRepoRelative(row.path) || !fs.existsSync(path.join(repoRoot, row.path))) {
      errors.push(fail('E_AGENT_ENTRYPOINT_MISSING', `Authority document is missing or unsafe: ${row.path}`, { path: row.path }));
    }
  }

  for (const relativePath of manifest.requiredEntrypoints || []) {
    if (!safeRepoRelative(relativePath) || !fs.existsSync(path.join(repoRoot, relativePath))) {
      errors.push(fail('E_AGENT_ENTRYPOINT_MISSING', `Missing or unsafe required entrypoint ${relativePath}`, { path: relativePath }));
    }
  }

  try {
    canonStatus = readJson(repoRoot, 'docs/OPS/STATUS/CANON_STATUS.json');
    const canonPath = canonStatus.canonicalDocPath;
    if (canonStatus.status !== 'ACTIVE_CANON' || !safeRepoRelative(canonPath)) {
      errors.push(fail('E_AGENT_CANON_RESOLUTION_FAILED', 'CANON_STATUS status/path is invalid'));
    } else if (!fs.existsSync(path.join(repoRoot, canonPath))) {
      errors.push(fail('E_AGENT_CANON_RESOLUTION_FAILED', `Resolved canon is missing: ${canonPath}`));
    }
  } catch (error) {
    errors.push(fail('E_AGENT_CANON_RESOLUTION_FAILED', error.message));
  }

  const corexPointerPath = path.join(repoRoot, 'docs/corex/COREX.md');
  if (!fs.existsSync(corexPointerPath) || !fs.readFileSync(corexPointerPath, 'utf8').includes(`ACTIVE_COREX: \`${CURRENT_COREX_PATH}\``)) {
    errors.push(fail('E_AGENT_COREX_POINTER_DRIFT', `COREX pointer must select ${CURRENT_COREX_PATH}`));
  }

  for (const artifact of manifest.frozenArtifacts || []) {
    if (!safeRepoRelative(artifact.path) || !fs.existsSync(path.join(repoRoot, artifact.path))) {
      errors.push(fail('E_AGENT_COREX_POINTER_DRIFT', `Frozen artifact missing: ${artifact.path}`));
      continue;
    }
    const actual = sha256File(repoRoot, artifact.path);
    if (actual !== artifact.sha256) {
      errors.push(fail('E_AGENT_COREX_POINTER_DRIFT', `Frozen digest mismatch: ${artifact.path}`, {
        expected: artifact.sha256,
        actual,
      }));
    }
  }

  try {
    const tracked = new Set(runGit(repoRoot, ['ls-files']).split('\n').filter(Boolean));
    if (!tracked.has('AGENTS.md') || tracked.has('agents.md')) {
      errors.push(fail('E_AGENT_ENTRYPOINT_CASE_DRIFT', 'Git must track AGENTS.md with exact uppercase spelling only'));
    }
  } catch (error) {
    errors.push(fail('E_AGENT_ENTRYPOINT_CASE_DRIFT', error.message));
  }

  ensureUniqueStrings(manifest.operationKinds, 'operationKinds', errors);
  ensureUniqueStrings((manifest.stateClasses || []).map((row) => row.id), 'stateClasses', errors);
  ensureUniqueStrings((manifest.stopSignals || []).map((row) => row.code), 'stopSignals', errors);
  ensureUniqueStrings(manifest.requiredTaskDeclarationFields, 'requiredTaskDeclarationFields', errors);
  ensureUniqueStrings(manifest.requiredFinalReportFields, 'requiredFinalReportFields', errors);

  requireTokens(repoRoot, 'AGENTS.md', [
    'npm run agent:bootstrap',
    'Product Core',
    'Command Kernel',
    'Design OS',
    'AUTHORING_WORKING_STATE',
    'npm run agent:preflight',
    'npm run agent:guardrails',
  ], errors);
  requireTokens(repoRoot, 'CANON.md', [CURRENT_COREX_PATH, 'AGENT_START_PROTOCOL.md'], errors);
  requireTokens(repoRoot, 'README.md', ['AGENT_START_PROTOCOL.md', CURRENT_COREX_PATH], errors);
  requireTokens(repoRoot, 'docs/AGENT_START_PROMPT.md', [
    'AGENTS.md',
    'AGENT_START_PROTOCOL.md',
    'npm run agent:bootstrap',
  ], errors);
  requireTokens(repoRoot, 'docs/PROCESS.md', ['npm run agent:bootstrap', 'npm run agent:preflight'], errors);
  requireTokens(repoRoot, 'docs/YALKEN_DESIGN_OS_FEATURE_INTEGRATION_DOCTRINE_V1.md', [
    'PRODUCT_TRUTH + COMMAND_MEANING + COMPUTED_INTERFACE_FORM = YALKEN',
    'PROJECT_STATE',
    'AUTHORING_WORKING_STATE',
    'DERIVED_STATE',
    'SHELL_STATE',
    'TRANSIENT_STATE',
  ], errors);

  try {
    bootstrapStatus = readJson(repoRoot, BOOTSTRAP_STATUS_PATH);
    policy = readJson(repoRoot, AUTOMATION_POLICY_PATH);
    if (bootstrapStatus.status !== 'ACTIVE_AGENT_BOOTSTRAP_RESOLVER' || !safeRepoRelative(bootstrapStatus.activeSpecPath)) {
      errors.push(fail('E_AGENT_BOOTSTRAP_SPEC_DRIFT', 'Agent bootstrap status resolver is invalid'));
    } else {
      const activeSpecSha256 = sha256File(repoRoot, bootstrapStatus.activeSpecPath);
      if (bootstrapStatus.activeSpecSha256 !== activeSpecSha256) {
        errors.push(fail('E_AGENT_BOOTSTRAP_SPEC_DRIFT', 'Active bootstrap spec digest does not match resolver'));
      }
      bootstrapSpec = readJson(repoRoot, bootstrapStatus.activeSpecPath);
      if (bootstrapSpec.documentId !== 'AGENT_BOOTSTRAP_REPOSITORY_NATIVE_V2_0'
        || bootstrapSpec.documentStatus !== 'ACTIVE_BOOTSTRAP_FOR_ANY_AGENT') {
        errors.push(fail('E_AGENT_BOOTSTRAP_SPEC_DRIFT', 'Active bootstrap spec identity/status is invalid'));
      }
      if (bootstrapSpec.repositoryNativeContext?.architectureManifestSha256 !== sha256File(repoRoot, ARCHITECTURE_MANIFEST_PATH)) {
        errors.push(fail('E_AGENT_BOOTSTRAP_SPEC_DRIFT', 'Architecture manifest digest does not match active bootstrap spec'));
      }
      if (policy.bootstrapSpecRef !== bootstrapStatus.activeSpecPath
        || policy.executionTicketPolicyRef !== `${bootstrapStatus.activeSpecPath}#/automationExecutionTicket`) {
        errors.push(fail('E_AGENT_BOOTSTRAP_SPEC_DRIFT', 'Automation policy does not resolve the active bootstrap spec'));
      }
    }
  } catch (error) {
    errors.push(fail('E_AGENT_BOOTSTRAP_SPEC_DRIFT', error.message));
  }

  try {
    const declarationSchema = readJson(repoRoot, 'docs/architecture/AGENT_TASK_ARCHITECTURE_DECLARATION_V1.schema.json');
    const reportSchema = readJson(repoRoot, 'docs/architecture/AGENT_FINAL_REPORT_V1.schema.json');
    const contextSchema = readJson(repoRoot, 'docs/architecture/AGENT_CONTEXT_PACKET_V1.schema.json');
    const declarationRequired = new Set(declarationSchema.required || []);
    const reportRequired = new Set(reportSchema.required || []);
    for (const field of manifest.requiredTaskDeclarationFields) {
      if (!declarationRequired.has(field)) errors.push(fail('E_AGENT_SCHEMA_DRIFT', `Declaration schema missing ${field}`));
    }
    const deliveryRequired = new Set(declarationSchema.properties?.deliveryPolicy?.required || []);
    for (const field of [
      'commitRequired',
      'pushRequired',
      'prRequired',
      'mergeRequired',
      'postMergeExactHeadVerificationRequired',
    ]) {
      if (!deliveryRequired.has(field)) errors.push(fail('E_AGENT_SCHEMA_DRIFT', `Declaration delivery schema missing ${field}`));
    }
    for (const field of manifest.requiredFinalReportFields) {
      if (!reportRequired.has(field)) errors.push(fail('E_AGENT_SCHEMA_DRIFT', `Final report schema missing ${field}`));
    }
    if (!Array.isArray(contextSchema.required) || !contextSchema.required.includes('activeCanon')) {
      errors.push(fail('E_AGENT_SCHEMA_DRIFT', 'Context packet schema must require activeCanon'));
    }
  } catch (error) {
    errors.push(fail('E_AGENT_SCHEMA_DRIFT', error.message));
  }

  try {
    const packageJson = readJson(repoRoot, 'package.json');
    const expectedScripts = {
      'agent:bootstrap': 'node scripts/agent-bootstrap.mjs',
      'agent:preflight': 'node scripts/agent-preflight.mjs',
      'agent:guardrails': 'node scripts/validate-agent-guardrails.mjs',
    };
    for (const [name, command] of Object.entries(expectedScripts)) {
      if (packageJson.scripts?.[name] !== command) {
        errors.push(fail('E_AGENT_PACKAGE_SCRIPT_DRIFT', `package.json script ${name} must equal ${command}`));
      }
    }
  } catch (error) {
    errors.push(fail('E_AGENT_PACKAGE_SCRIPT_DRIFT', error.message));
  }

  return {
    ok: errors.length === 0,
    repoRoot,
    errors,
    details: {
      manifestId: manifest.manifestId,
      activeCanonPath: canonStatus?.canonicalDocPath || null,
      activeCanonVersion: canonStatus?.canonVersion || null,
      currentCorexPath: CURRENT_COREX_PATH,
      bootstrapSpecPath: bootstrapStatus?.activeSpecPath || null,
      bootstrapSpecId: bootstrapSpec?.documentId || null,
      policyVersion: policy?.policyVersion || null,
    },
  };
}

export function buildContextPacket(options = {}) {
  const repoRoot = path.resolve(options.repoRoot || resolveRepoRoot());
  const objective = typeof options.objective === 'string' ? options.objective.trim() : '';
  if (!objective) {
    return {
      ok: false,
      errors: [fail('E_AGENT_OBJECTIVE_REQUIRED', 'Pass --objective with one concrete outcome')],
    };
  }
  const validation = validateRepositoryGuardrails({ repoRoot });
  if (!validation.ok) return validation;

  const manifest = readJson(repoRoot, ARCHITECTURE_MANIFEST_PATH);
  const canonStatus = readJson(repoRoot, 'docs/OPS/STATUS/CANON_STATUS.json');
  const readingOrder = manifest.authorityOrder.map((row) => (
    row.pathFrom === 'canonicalDocPath' ? canonStatus.canonicalDocPath : row.path
  ));
  readingOrder.push('TASK_RELEVANT_EXACT_CODE_TESTS_AND_EXACT_HEAD_EVIDENCE');

  const statusText = runGit(repoRoot, ['status', '--porcelain=v1', '--untracked-files=all']);
  return {
    ok: true,
    packet: {
      schemaVersion: 1,
      status: 'READY_FOR_READ_AND_DECLARATION',
      objective,
      repoRoot: toPosix(repoRoot),
      headSha: runGit(repoRoot, ['rev-parse', 'HEAD']),
      originMainSha: runGit(repoRoot, ['rev-parse', 'origin/main']),
      branch: runGit(repoRoot, ['branch', '--show-current']) || 'DETACHED',
      worktreeDirty: statusText !== '',
      activeCanon: {
        status: canonStatus.status,
        version: canonStatus.canonVersion,
        path: canonStatus.canonicalDocPath,
        activeFeatureExtensions: canonStatus.activeFeatureExtensions || [],
      },
      currentCorex: CURRENT_COREX_PATH,
      architectureManifest: ARCHITECTURE_MANIFEST_PATH,
      readingOrder,
      requiredPreflight: {
        template: 'docs/templates/AGENT_TASK_ARCHITECTURE_DECLARATION_V1.json',
        schema: 'docs/architecture/AGENT_TASK_ARCHITECTURE_DECLARATION_V1.schema.json',
        command: 'npm run agent:preflight -- --declaration <temporary-json-file>',
      },
      nextAction: 'READ_IN_ORDER_THEN_CREATE_AND_VALIDATE_TASK_ARCHITECTURE_DECLARATION_BEFORE_WRITE',
    },
  };
}

function emptyValue(value) {
  if (typeof value === 'string') return value.trim() === '';
  if (Array.isArray(value)) return value.length === 0 || value.some((item) => typeof item !== 'string' || item.trim() === '');
  return value == null;
}

function validateScopePaths(list, field, errors) {
  if (!Array.isArray(list) || list.length === 0) {
    errors.push(fail('E_TASK_DECLARATION_INVALID', `${field} must be non-empty`));
    return;
  }
  const seen = new Set();
  for (const item of list) {
    if (!safeRepoRelative(item) || item.includes('*')) {
      errors.push(fail('E_TASK_DECLARATION_INVALID', `${field} contains unsafe or non-exact path: ${item}`));
    }
    if (seen.has(item)) {
      errors.push(fail('E_TASK_DECLARATION_INVALID', `${field} duplicates path: ${item}`));
    }
    seen.add(item);
  }
}

function validateStringField(declaration, field, errors) {
  if (typeof declaration[field] !== 'string' || declaration[field].trim() === '') {
    errors.push(fail('E_TASK_DECLARATION_INVALID', `${field} must be a non-empty string`, { field }));
  }
}

function validateStringArrayField(declaration, field, errors) {
  const value = declaration[field];
  if (!Array.isArray(value) || value.length === 0) {
    errors.push(fail('E_TASK_DECLARATION_INVALID', `${field} must be a non-empty string array`, { field }));
    return;
  }
  const seen = new Set();
  for (const item of value) {
    if (typeof item !== 'string' || item.trim() === '') {
      errors.push(fail('E_TASK_DECLARATION_INVALID', `${field} contains an empty or non-string item`, { field }));
      continue;
    }
    if (seen.has(item)) {
      errors.push(fail('E_TASK_DECLARATION_INVALID', `${field} duplicates ${item}`, { field }));
    }
    seen.add(item);
  }
}

export function validateTaskDeclaration(options = {}) {
  const repoRoot = path.resolve(options.repoRoot || resolveRepoRoot());
  const repositoryValidation = validateRepositoryGuardrails({ repoRoot });
  if (!repositoryValidation.ok) return repositoryValidation;

  const declaration = options.declaration;
  const errors = [];
  if (!isPlainObject(declaration)) {
    return { ok: false, repoRoot, errors: [fail('E_TASK_DECLARATION_INVALID', 'Declaration must be a JSON object')] };
  }
  const manifest = readJson(repoRoot, ARCHITECTURE_MANIFEST_PATH);
  for (const field of manifest.requiredTaskDeclarationFields) {
    if (!(field in declaration) || emptyValue(declaration[field])) {
      errors.push(fail('E_TASK_DECLARATION_INVALID', `Missing or empty field: ${field}`, { field }));
    }
  }
  if (declaration.schemaVersion !== 1) {
    errors.push(fail('E_TASK_DECLARATION_INVALID', 'schemaVersion must equal 1'));
  }
  for (const field of [
    'taskId',
    'objective',
    'bindingBaseSha',
    'productAuthority',
    'commandAuthority',
    'designAuthority',
    'capabilityRevalidation',
    'securityAndInputBoundary',
    'performanceAndAccessibility',
    'dependenciesAndNetwork',
    'rollbackPlan',
  ]) {
    validateStringField(declaration, field, errors);
  }
  for (const field of [
    'writePaths',
    'readPaths',
    'productPorts',
    'designOsPorts',
    'readProjections',
    'identityGuards',
    'fallbacks',
    'recoveryAndNegativeChecks',
    'currentReality',
    'targetOnly',
  ]) {
    validateStringArrayField(declaration, field, errors);
  }
  if (!TASK_TYPES.has(declaration.taskType)) {
    errors.push(fail('E_TASK_DECLARATION_INVALID', `Unknown taskType: ${declaration.taskType}`));
  }

  const headSha = runGit(repoRoot, ['rev-parse', 'HEAD']);
  if (declaration.bindingBaseSha !== headSha) {
    errors.push(fail('E_BASE_SHA_MISMATCH', `bindingBaseSha must equal current HEAD ${headSha}`, {
      expected: headSha,
      actual: declaration.bindingBaseSha,
    }));
  }

  validateScopePaths(declaration.scopeIn, 'scopeIn', errors);
  validateScopePaths(declaration.scopeOut, 'scopeOut', errors);
  const scopeOut = new Set(declaration.scopeOut || []);
  for (const item of declaration.scopeIn || []) {
    if (scopeOut.has(item)) errors.push(fail('E_TASK_DECLARATION_INVALID', `Path is both scopeIn and scopeOut: ${item}`));
  }

  const operationKinds = new Set([...manifest.operationKinds, 'NOT_APPLICABLE_DOCS_ONLY', 'NOT_APPLICABLE_REPORT_ONLY']);
  if (!Array.isArray(declaration.operationKinds) || declaration.operationKinds.length === 0) {
    errors.push(fail('E_TASK_DECLARATION_INVALID', 'operationKinds must be a non-empty array'));
  } else {
    for (const item of declaration.operationKinds) {
      if (!operationKinds.has(item)) errors.push(fail('E_TASK_DECLARATION_INVALID', `Unknown operation kind: ${item}`));
    }
  }
  const stateClasses = new Set([
    ...manifest.stateClasses.map((row) => row.id),
    'NOT_APPLICABLE_DOCS_ONLY',
    'NOT_APPLICABLE_REPORT_ONLY',
  ]);
  if (!Array.isArray(declaration.stateClasses) || declaration.stateClasses.length === 0) {
    errors.push(fail('E_TASK_DECLARATION_INVALID', 'stateClasses must be a non-empty array'));
  } else {
    for (const item of declaration.stateClasses) {
      if (!stateClasses.has(item)) errors.push(fail('E_TASK_DECLARATION_INVALID', `Unknown state class: ${item}`));
    }
  }

  if (declaration.taskType === 'PRODUCT_UI' && declaration.designToolRouter !== 'APPLICABLE_LAZYWEB_FIRST') {
    errors.push(fail('E_DESIGN_TOOL_ROUTER_MISMATCH', 'PRODUCT_UI requires APPLICABLE_LAZYWEB_FIRST'));
  }
  if (declaration.taskType !== 'PRODUCT_UI' && declaration.designToolRouter !== 'NOT_APPLICABLE') {
    errors.push(fail('E_DESIGN_TOOL_ROUTER_MISMATCH', `${declaration.taskType} requires NOT_APPLICABLE`));
  }

  const delivery = declaration.deliveryPolicy;
  if (!isPlainObject(delivery)) {
    errors.push(fail('E_TASK_DECLARATION_INVALID', 'deliveryPolicy must be an object'));
  } else {
    const fields = [
      'commitRequired',
      'pushRequired',
      'prRequired',
      'mergeRequired',
      'postMergeExactHeadVerificationRequired',
    ];
    for (const field of fields) {
      if (typeof delivery[field] !== 'boolean') errors.push(fail('E_TASK_DECLARATION_INVALID', `deliveryPolicy.${field} must be boolean`));
    }
    if (declaration.taskType === 'REPORT_ONLY') {
      if (fields.some((field) => delivery[field] !== false)) {
        errors.push(fail('E_TASK_DECLARATION_INVALID', 'REPORT_ONLY delivery flags must all be false'));
      }
    } else if (fields.some((field) => delivery[field] !== true)) {
      errors.push(fail('E_TASK_DECLARATION_INVALID', 'Write task delivery flags default to true and require explicit owner override to differ'));
    }
  }

  const statusText = runGit(repoRoot, ['status', '--porcelain=v1', '--untracked-files=all']);
  if (statusText !== '' && declaration.taskType !== 'HYGIENE_ISOLATION') {
    errors.push(fail('E_SCOPE_OR_DIRTY_STATE_UNSAFE', 'Preflight requires a clean worktree before write'));
  }

  return {
    ok: errors.length === 0,
    repoRoot,
    errors,
    details: {
      taskId: declaration.taskId || null,
      taskType: declaration.taskType || null,
      bindingBaseSha: declaration.bindingBaseSha || null,
      headSha,
      scopeInCount: Array.isArray(declaration.scopeIn) ? declaration.scopeIn.length : 0,
      scopeOutCount: Array.isArray(declaration.scopeOut) ? declaration.scopeOut.length : 0,
      worktreeDirty: statusText !== '',
      designToolRouter: declaration.designToolRouter || null,
    },
  };
}

export function printResult(result, json = false) {
  if (json) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return;
  }
  if (result.ok) {
    process.stdout.write('AGENT_GUARDRAIL_STATUS=PASS\n');
    for (const [key, value] of Object.entries(result.details || {})) {
      process.stdout.write(`${key}=${typeof value === 'object' ? JSON.stringify(value) : value}\n`);
    }
    return;
  }
  process.stderr.write('AGENT_GUARDRAIL_STATUS=STOP\n');
  for (const error of result.errors || []) {
    process.stderr.write(`${error.code}:${error.message}\n`);
  }
}
