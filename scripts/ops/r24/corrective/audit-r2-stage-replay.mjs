#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { canonicalBytes, canonicalize, readCanonicalJson } from './canonical-json.mjs';
import { assert, assertClosedObject, assertExactJson, assertHex, sha256 } from './audit-r1-corrections.mjs';

const FIXED = Object.freeze({
  programTemplateDigest: '6c833c964318da3e61e1743365f8763206be838647b5222c187b3bda8d1c6b9a',
  stageRegistryDigest: 'c8af046b5918f43a50af66886b0b5c9d2e22ea6501240d4b239101d8836ced1a',
  ownerAuthorityBindingDigest: 'be68bd97021d13fbfb75c73791bda7f6bfeebecebf525d4a927d1a4c9fe9efd6',
});
const EFFECTIVE_ADMISSION_BINDING = Object.freeze({
  programAmendmentDigest:'988a7a5d5f5dad75c43c40dfc85fac2ba649a9628b818634d843ac2a2fcc1a44',
  stageAdmissionDigest:'decb456ea5e3b51b3220c4349b2ac2f3a2e4dc247d78e685615876279bbdc1a3',
  stageInstanceDigest:'e3136181930a86c5beb21a50884e551e5477abe4563fdad0749ac546d70b811f',
  successorVerifierCodeDigest:'f6ff040d1b02b4db7195f57a4fc6527003f3903c3a66703924df0905fe095807',
  successorVerifierContractDigest:'093615deb41bd2b33f7c31508e1cf1022149e00a7d79fa49a104672b2ecafae8',
  writeSetDigest:'a4a4c5bbb3c0764cadb8eceda1653b0b2e0ef2ef606c62cd234493ed1d425e68',
});
const MAX_FAILURE_DIAGNOSTIC_BYTES = 64 * 1024;
const git = (args, cwd = process.cwd()) => {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
  assert(result.status === 0, 'E_GIT', args.join(' '));
  return result.stdout.trim();
};
const safePath = (value) => {
  assert(typeof value === 'string' && value.length > 0 && !value.startsWith('/') && !value.startsWith('file:') && !value.includes('\\') && !/(^|\/)\.\.(\/|$)/u.test(value) && !value.includes('*'), 'E_REPLAY_PATH', String(value));
};
const validateCommand = (command, label) => {
  assertClosedObject(command, ['args','environment','program'], ['args','program'], label);
  assert(['node','npm'].includes(command.program), 'E_REPLAY_PROGRAM', command.program);
  assert(Array.isArray(command.args) && command.args.length > 0, 'E_REPLAY_ARGS', label);
  for (const arg of command.args) assert(typeof arg === 'string' && arg.length > 0 && !/[;&|\x60$><\n\r\0]/u.test(arg), 'E_REPLAY_COMMAND_INJECTION', arg);
  if (command.environment !== undefined) {
    assertClosedObject(command.environment, ['SECTOR_U_FULL_A11Y','SECTOR_U_FULL_PERF','SECTOR_U_FULL_VISUAL'], [], `${label}.environment`);
    for (const value of Object.values(command.environment)) assert(value === '1', 'E_REPLAY_ENVIRONMENT_VALUE', String(value));
  }
};

export function validateReplayPlan(plan, registry, { root = process.cwd(), requireFiles = true } = {}) {
  assertClosedObject(plan, ['c0ReplacementPath','effectiveAdmissionBinding','evaluationRule','ownerAuthorityBindingDigest','passRule','programDoneClaimed','programId','programTemplateDigest','schemaVersion','stageRegistryDigest','stages','wp400MutationStarted'], ['c0ReplacementPath','effectiveAdmissionBinding','evaluationRule','ownerAuthorityBindingDigest','passRule','programDoneClaimed','programId','programTemplateDigest','schemaVersion','stageRegistryDigest','stages','wp400MutationStarted'], 'replayPlan');
  assert(plan.schemaVersion === 'AUDIT_R2_STAGE_REPLAY_PLAN_V1' && plan.programId === 'YALKEN_R24_CORRECTIVE_RECOVERY_AND_RESUME_V1_1', 'E_REPLAY_PLAN_IDENTITY', plan.schemaVersion);
  assert(plan.programTemplateDigest === FIXED.programTemplateDigest && plan.stageRegistryDigest === FIXED.stageRegistryDigest && plan.ownerAuthorityBindingDigest === FIXED.ownerAuthorityBindingDigest, 'E_REPLAY_FIXED_BINDING', 'plan');
  assertExactJson(plan.effectiveAdmissionBinding, EFFECTIVE_ADMISSION_BINDING, 'E_REPLAY_EFFECTIVE_ADMISSION_BINDING', 'plan');
  assert(plan.evaluationRule === 'RUNTIME_EXACT_SHA_TREE_ONLY' && plan.passRule === 'PROCESS_EXIT_ZERO_AND_STAGE_SPECIFIC_PARSER_AND_ALL_ARTIFACT_BYTES_PARSED_AND_ZERO_SKIP_CANCEL_TODO', 'E_REPLAY_PASS_RULE', plan.passRule);
  assert(plan.programDoneClaimed === false && plan.wp400MutationStarted === false, 'E_REPLAY_SCOPE_EXPANSION', 'claims');
  assert(Array.isArray(plan.stages) && plan.stages.length === 33 && registry.stages.length === 33, 'E_REPLAY_STAGE_COUNT', plan.stages?.length);
  for (let index = 0; index < registry.stages.length; index += 1) {
    const expected = registry.stages[index];
    const actual = plan.stages[index];
    assertClosedObject(actual, ['artifactPaths','command','dependencies','order','parser','stageId'], ['artifactPaths','command','dependencies','order','parser','stageId'], `stages.${index}`);
    assert(actual.order === index && actual.stageId === expected.stageId, 'E_REPLAY_STAGE_ORDER', actual.stageId);
    assertExactJson(actual.dependencies, expected.dependencies, 'E_REPLAY_DEPENDENCY_MISMATCH', actual.stageId);
    assert(new Set(actual.dependencies).size === actual.dependencies.length, 'E_REPLAY_DEPENDENCY_DUPLICATE', actual.stageId);
    validateCommand(actual.command, `stages.${index}.command`);
    if (actual.stageId === 'C6B') assertExactJson(actual.command.environment, {SECTOR_U_FULL_A11Y:'1',SECTOR_U_FULL_PERF:'1',SECTOR_U_FULL_VISUAL:'1'}, 'E_REPLAY_C6B_FULL_LANE_ENVIRONMENT', actual.stageId);
    else assert(actual.command.environment === undefined, 'E_REPLAY_UNEXPECTED_ENVIRONMENT', actual.stageId);
    assert(['NODE_TAP_ZERO_SKIP','CANONICAL_JSON_STATUS','JSON_DOCUMENT_ZERO_VULNERABILITIES','R24_E0_RECEIPT'].includes(actual.parser), 'E_REPLAY_PARSER', actual.parser);
    assert(Array.isArray(actual.artifactPaths) && actual.artifactPaths.length >= 3 && new Set(actual.artifactPaths).size === actual.artifactPaths.length, 'E_REPLAY_ARTIFACT_SET', actual.stageId);
    for (const artifactPath of actual.artifactPaths) {
      safePath(artifactPath);
      if (requireFiles) assert(fs.existsSync(path.join(root, artifactPath)), 'E_REPLAY_ARTIFACT_MISSING', `${actual.stageId}:${artifactPath}`);
    }
  }
  return { status: 'PASS', registeredStages: 33, planDigest: sha256(canonicalBytes(plan)) };
}

export function parseTap(bytes, stageId) {
  const text = bytes.toString('utf8');
  const numbers = (label) => {
    const matches = [...text.matchAll(new RegExp(`^(?:#|ℹ) ${label} ([0-9]+)$`, 'gmu'))];
    assert(matches.length > 0, 'E_REPLAY_TAP_SUMMARY_MISSING', `${stageId}:${label}`);
    return matches.map((match)=>Number(match[1]));
  };
  const all = Object.fromEntries(['tests','fail','skipped','cancelled','todo'].map((label)=>[label,numbers(label)]));
  const summaryCount = all.tests.length;
  assert(Object.values(all).every((values)=>values.length === summaryCount), 'E_REPLAY_TAP_SUMMARY_COUNT', stageId);
  const sum = (values)=>values.reduce((total,value)=>total+value,0);
  const tests = sum(all.tests);
  const fail = sum(all.fail);
  const skipped = sum(all.skipped);
  const cancelled = sum(all.cancelled);
  const todo = sum(all.todo);
  assert(tests > 0 && fail === 0 && skipped === 0 && cancelled === 0 && todo === 0, 'E_REPLAY_TAP_NOT_CLEAN', `${stageId}:${tests}/${fail}/${skipped}/${cancelled}/${todo}`);
  return { parser: 'NODE_TAP_ZERO_SKIP', summaryCount, tests, fail, skipped, cancelled, todo };
}
export function assertCleanRepository(status) {
  assert(status === '', 'E_REPLAY_DIRTY_WORKTREE', status);
}
export function assertExecutionSuccess(execution, stageId) {
  assert(execution.status === 0 && !execution.error && !execution.signal, 'E_REPLAY_COMMAND_FAILED', `${stageId}:${execution.status}:${execution.signal ?? ''}`);
}
export function sanitizeReplayFailure(bytes, { maxBytes = MAX_FAILURE_DIAGNOSTIC_BYTES } = {}) {
  assert(Buffer.isBuffer(bytes), 'E_REPLAY_FAILURE_BYTES', typeof bytes);
  assert(Number.isInteger(maxBytes) && maxBytes > 0 && maxBytes <= MAX_FAILURE_DIAGNOSTIC_BYTES, 'E_REPLAY_FAILURE_BOUND', String(maxBytes));
  let redactionCount = 0;
  let text = bytes.toString('utf8').replace(/\r\n?/gu, '\n');
  const redact = (pattern, replacement) => { text = text.replace(pattern, () => { redactionCount += 1; return replacement; }); };
  redact(/(?:\/(?:Users|Volumes|private|tmp|var|etc|home)\/[^\s"'<>)]*)/gu, '<redacted-absolute-path>');
  redact(/(?:[A-Za-z]:\\|\\\\)[^\s"'<>)]*/gu, '<redacted-absolute-path>');
  redact(/\b(?:github_pat_|gh[pousr]_)[A-Za-z0-9_]+\b/gu, '<redacted-credential>');
  redact(/\b(?:authorization|password|secret|token)(\s*[:=]\s*)(?:Bearer\s+)?[^\s,;]+/giu, '<redacted-sensitive-field>');
  redact(/\b[A-Z][A-Z0-9_]*(?:TOKEN|SECRET|PASSWORD|PRIVATE_KEY)\s*=\s*[^\s,;]+/gu, '<redacted-sensitive-field>');
  const sanitizedFull = Buffer.from(text, 'utf8');
  const truncated = sanitizedFull.length > maxBytes;
  let start = truncated ? sanitizedFull.length - maxBytes : 0;
  while (start < sanitizedFull.length && (sanitizedFull[start] & 0xc0) === 0x80) start += 1;
  const sanitizedBytes = sanitizedFull.subarray(start);
  return { sanitizedBytes, originalSizeBytes: bytes.length, sanitizedSizeBytes: sanitizedBytes.length, maxBytes, truncated, redactionCount };
}
export function persistReplayFailure({ outputDir, stage, execution, logBytes, evaluationSha, evaluationTreeSha }) {
  const diagnostic = sanitizeReplayFailure(logBytes);
  const prefix = `stage-${String(stage.order).padStart(2,'0')}-${stage.stageId}-failure`;
  const evidencePath = `${prefix}-sanitized.log`;
  const recordPath = `${prefix}.json`;
  fs.writeFileSync(path.join(outputDir, evidencePath), diagnostic.sanitizedBytes, { flag: 'wx' });
  const record = {
    schemaVersion: 'AUDIT_R2_STAGE_REPLAY_FAILURE_V1',
    status: 'FAIL',
    code: 'E_REPLAY_COMMAND_FAILED',
    stageId: stage.stageId,
    order: stage.order,
    evaluationSha,
    evaluationTreeSha,
    command: stage.command,
    commandDigest: sha256(canonicalBytes(stage.command)),
    exitCode: execution.status,
    signal: execution.signal ?? null,
    errorCode: execution.error?.code ?? null,
    combinedOutputDigest: sha256(logBytes),
    combinedOutputSizeBytes: logBytes.length,
    sanitizedEvidence: { path: evidencePath, sha256: sha256(diagnostic.sanitizedBytes), sizeBytes: diagnostic.sanitizedSizeBytes, maxBytes: diagnostic.maxBytes, truncated: diagnostic.truncated, redactionCount: diagnostic.redactionCount },
    programDoneClaimed: false,
    wp400MutationStarted: false,
  };
  fs.writeFileSync(path.join(outputDir, recordPath), canonicalBytes(record), { flag: 'wx' });
  return { record, recordPath, diagnosticBytes: diagnostic.sanitizedBytes };
}
function parseJsonStatus(bytes, stageId) {
  const lines = bytes.toString('utf8').trim().split('\n').reverse();
  let value = null;
  for (const line of lines) { try { value=JSON.parse(line); break; } catch {} }
  if (!value) { const error = new Error(stageId); error.code = 'E_REPLAY_JSON_PARSE'; throw error; }
  assert(value && typeof value === 'object' && !['FAIL','FAILED','BLOCKED'].includes(value.status), 'E_REPLAY_JSON_STATUS', stageId);
  return { parser: 'CANONICAL_JSON_STATUS', parsedDigest: sha256(canonicalBytes(value)), status: value.status ?? 'PROCESS_PASS' };
}
function parseAuditJson(bytes, stageId) {
  let value;
  const text=bytes.toString('utf8');
  try { value = JSON.parse(text.slice(text.indexOf('{'),text.lastIndexOf('}')+1)); } catch { const error = new Error(stageId); error.code = 'E_REPLAY_AUDIT_JSON_PARSE'; throw error; }
  const counts = value?.metadata?.vulnerabilities;
  assert(counts && counts.total === 0 && counts.info === 0 && counts.low === 0 && counts.moderate === 0 && counts.high === 0 && counts.critical === 0, 'E_REPLAY_AUDIT_VULNERABILITIES', `${stageId}:${JSON.stringify(counts)}`);
  return { parser:'JSON_DOCUMENT_ZERO_VULNERABILITIES', auditReportVersion:value.auditReportVersion, vulnerabilities:counts, parsedDigest:sha256(canonicalBytes(value)) };
}
function parseE0Receipt(bytes, stageId) {
  const text=bytes.toString('utf8');
  const match=text.match(/^R24_E0_LANE_RECEIPT=(\{.*\})$/mu);
  assert(match, 'E_REPLAY_E0_RECEIPT_MISSING', stageId);
  let value;
  try { value=JSON.parse(match[1]); } catch { const error=new Error(stageId); error.code='E_REPLAY_E0_RECEIPT_PARSE'; throw error; }
  assert(value.verdict==='PASS' && value.suite==='PASS' && value.mutants==='PASS' && value.envRegistry==='PASS' && value.docsClaimLint==='PASS' && Array.isArray(value.failures) && value.failures.length===0, 'E_REPLAY_E0_RECEIPT_FAIL', stageId);
  return {parser:'R24_E0_RECEIPT',receiptDigest:sha256(canonicalBytes(value)),verdict:value.verdict};
}
export function parseStageLog(bytes, parser, stageId) {
  if (parser === 'NODE_TAP_ZERO_SKIP') return parseTap(bytes, stageId);
  if (parser === 'CANONICAL_JSON_STATUS') return parseJsonStatus(bytes, stageId);
  if (parser === 'JSON_DOCUMENT_ZERO_VULNERABILITIES') return parseAuditJson(bytes, stageId);
  if (parser === 'R24_E0_RECEIPT') return parseE0Receipt(bytes, stageId);
  const error=new Error(`${stageId}:${parser}`);error.code='E_REPLAY_PARSER';throw error;
}
function parseArtifact(root, outputDir, artifactPath, stageId) {
  const bytes = fs.readFileSync(path.join(root, artifactPath));
  assert(bytes.length > 0, 'E_REPLAY_ARTIFACT_EMPTY', `${stageId}:${artifactPath}`);
  const carriedPath = path.posix.join('stage-inputs', stageId, artifactPath);
  const carriedAbsolute = path.join(outputDir, carriedPath);
  fs.mkdirSync(path.dirname(carriedAbsolute), { recursive: true });
  fs.writeFileSync(carriedAbsolute, bytes, { flag: 'wx' });
  const record = { path: artifactPath, carriedPath, sha256: sha256(bytes), sizeBytes: bytes.length, parser: 'RAW_BYTES' };
  if (artifactPath.endsWith('.json')) {
    let value;
    try { value = JSON.parse(bytes.toString('utf8')); } catch { const error = new Error(`${stageId}:${artifactPath}`); error.code = 'E_REPLAY_ARTIFACT_JSON_PARSE'; throw error; }
    record.parser = 'JSON';
    record.parsedCanonicalDigest = sha256(canonicalBytes(value));
    if ('stageId' in value) assert(value.stageId === stageId, 'E_REPLAY_ARTIFACT_STAGE_ID', `${stageId}:${artifactPath}`);
  } else if (/\.(?:mjs|js)$/u.test(artifactPath)) {
    record.parser = 'SOURCE_BYTES';
    assert(bytes.includes(Buffer.from('test', 'utf8')), 'E_REPLAY_SOURCE_UNPARSED', `${stageId}:${artifactPath}`);
  }
  return record;
}

export function executeReplay({ plan, registry, evaluationSha, evaluationTreeSha, outputDir, root = process.cwd(), spawn = spawnSync, gitResolve = (args) => git(args, root) }) {
  validateReplayPlan(plan, registry, { root });
  assertHex(evaluationSha, 40, 'evaluationSha');
  assertHex(evaluationTreeSha, 40, 'evaluationTreeSha');
  assert(gitResolve(['rev-parse','HEAD']) === evaluationSha && gitResolve(['rev-parse','HEAD^{tree}']) === evaluationTreeSha, 'E_REPLAY_STALE_HEAD', `${evaluationSha}/${evaluationTreeSha}`);
  assertCleanRepository(gitResolve(['status','--porcelain=v1','--untracked-files=all']));
  fs.mkdirSync(outputDir, { recursive: true });
  const results = new Map();
  for (const stage of plan.stages) {
    const dependencies = stage.dependencies.map((stageId) => {
      const prior = results.get(stageId);
      assert(prior?.status === 'PASS', 'E_REPLAY_DEPENDENCY_NOT_PASS', `${stage.stageId}:${stageId}`);
      return { stageId, resultDigest: sha256(canonicalBytes(prior)), status: prior.status };
    });
    const execution = spawn(stage.command.program, stage.command.args, { cwd: root, encoding: null, env: { ...process.env, ...(stage.command.environment ?? {}), AUDIT_R2_EVALUATION_SHA: evaluationSha, AUDIT_R2_EVALUATION_TREE_SHA: evaluationTreeSha }, maxBuffer: 64 * 1024 * 1024, timeout: 20 * 60 * 1000 });
    const stdout = Buffer.isBuffer(execution.stdout) ? execution.stdout : Buffer.from(execution.stdout ?? '');
    const stderr = Buffer.isBuffer(execution.stderr) ? execution.stderr : Buffer.from(execution.stderr ?? '');
    const logBytes = Buffer.concat([stdout, stderr]);
    const logName = `stage-${String(stage.order).padStart(2,'0')}-${stage.stageId}.log`;
    fs.writeFileSync(path.join(outputDir, logName), logBytes, { flag: 'wx' });
    try {
      assertExecutionSuccess(execution, stage.stageId);
    } catch (error) {
      const failure = persistReplayFailure({ outputDir, stage, execution, logBytes, evaluationSha, evaluationTreeSha });
      error.message = `${error.message}:${failure.recordPath}:${failure.record.sanitizedEvidence.sha256}`;
      error.diagnosticEvidence = failure.diagnosticBytes;
      throw error;
    }
    const parsed = parseStageLog(logBytes, stage.parser, stage.stageId);
    const artifacts = stage.artifactPaths.map((artifactPath) => parseArtifact(root, outputDir, artifactPath, stage.stageId));
    const result = {
      schemaVersion: 'AUDIT_R2_STAGE_REPLAY_RESULT_V1',
      stageId: stage.stageId,
      order: stage.order,
      evaluationSha,
      evaluationTreeSha,
      effectiveAdmissionBinding: plan.effectiveAdmissionBinding,
      command: stage.command,
      commandDigest: sha256(canonicalBytes(stage.command)),
      dependencies,
      artifacts,
      log: { path: logName, sha256: sha256(logBytes), sizeBytes: logBytes.length },
      parserResult: parsed,
      exitCode: 0,
      signal: null,
      skipped: 0,
      cancelled: 0,
      todo: 0,
      status: 'PASS',
    };
    fs.writeFileSync(path.join(outputDir, `stage-${String(stage.order).padStart(2,'0')}-${stage.stageId}.json`), canonicalBytes(result), { flag: 'wx' });
    results.set(stage.stageId, result);
  }
  const ordered = [...results.values()];
  const manifest = { schemaVersion:'AUDIT_R2_STAGE_REPLAY_MANIFEST_V1',evaluationSha,evaluationTreeSha,replayPlanDigest:sha256(canonicalBytes(plan)),effectiveAdmissionBindingDigest:sha256(canonicalBytes(plan.effectiveAdmissionBinding)),stageCount:ordered.length,passCount:ordered.filter((item)=>item.status==='PASS').length,requiredSkips:0,unexplainedSkips:0,cancelled:0,todo:0,stageResultDigests:ordered.map((item)=>({stageId:item.stageId,digest:sha256(canonicalBytes(item))})),status:'PASS',programDoneClaimed:false,wp400MutationStarted:false };
  assert(manifest.stageCount === 33 && manifest.passCount === 33, 'E_REPLAY_INCOMPLETE', `${manifest.passCount}/${manifest.stageCount}`);
  fs.writeFileSync(path.join(outputDir, 'stage-replay-manifest.json'), canonicalBytes(manifest), { flag: 'wx' });
  return manifest;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    const args = process.argv.slice(2);
    if (args[0] === '--check-plan') {
      const plan = readCanonicalJson(args[1]);
      const registry = readCanonicalJson('docs/OPS/R24/CORRECTIVE/STAGE_REGISTRY_V1.json');
      assert(registry.digest === FIXED.stageRegistryDigest, 'E_REPLAY_REGISTRY_DIGEST', registry.digest);
      process.stdout.write(`${canonicalize(validateReplayPlan(plan.value, registry.value))}\n`);
    } else {
      const options = {};
      for (let index = 0; index < args.length; index += 1) if (args[index].startsWith('--')) options[args[index].slice(2)] = args[++index];
      assert(options.execute && options['evaluation-sha'] && options['evaluation-tree'] && options['output-dir'], 'E_USAGE', '--execute plan --evaluation-sha --evaluation-tree --output-dir');
      const plan = readCanonicalJson(options.execute);
      const registry = readCanonicalJson('docs/OPS/R24/CORRECTIVE/STAGE_REGISTRY_V1.json');
      process.stdout.write(canonicalBytes(executeReplay({plan:plan.value,registry:registry.value,evaluationSha:options['evaluation-sha'],evaluationTreeSha:options['evaluation-tree'],outputDir:options['output-dir']})));
    }
  } catch (error) {
    if (Buffer.isBuffer(error.diagnosticEvidence)) {
      process.stderr.write('AUDIT_R2_SANITIZED_STAGE_FAILURE_BEGIN\n');
      process.stderr.write(error.diagnosticEvidence);
      if (error.diagnosticEvidence.at(-1) !== 10) process.stderr.write('\n');
      process.stderr.write('AUDIT_R2_SANITIZED_STAGE_FAILURE_END\n');
    }
    process.stderr.write(`${canonicalize({code:error.code ?? 'E_UNTYPED',message:error.message})}\n`);
    process.exitCode = 1;
  }
}
