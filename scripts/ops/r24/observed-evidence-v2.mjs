import { HEX40_RE } from './canonical-json.mjs';

export const EVIDENCE_CLASS_INDEPENDENT_EXACT_HEAD = 'INDEPENDENT_EXACT_HEAD';
export const FORBIDDEN_LEGACY_EVIDENCE_CLASS_RE = /^E[0-9]_/;
const HEX64_RE = /^[0-9a-f]{64}$/;
const SUCCESS_VALUES = new Set(['SUCCESS', 'success', 'completed_success']);

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function nonEmptyString(value) {
  return typeof value === 'string' && value.trim() !== '';
}

function successConclusion(value) {
  return SUCCESS_VALUES.has(String(value || ''));
}

function evidenceClasses(value) {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') return [value];
  return [];
}

function failure(code, detail, context = {}) {
  return { ok: false, code, detail, context };
}

function validateDigestContainer(row, field) {
  const value = row[field];
  if (!isPlainObject(value)) return failure('GATE_DIGEST_BINDING_MISSING', field);
  if (!HEX64_RE.test(String(value.digest || ''))) return failure('GATE_DIGEST_BINDING_MISSING', `${field}.digest`);
  if (value.expectedDigest !== undefined && value.expectedDigest !== value.digest) {
    return failure('GATE_DIGEST_MISMATCH', field, { expectedDigest: value.expectedDigest, digest: value.digest });
  }
  return { ok: true };
}

function validateObservedIdentity(row, field) {
  const value = row[field];
  if (!isPlainObject(value)) return failure('GATE_OBSERVED_IDENTITY_MISSING', field);
  if (!nonEmptyString(value.id) && !nonEmptyString(value.name)) {
    return failure('GATE_OBSERVED_IDENTITY_MISSING', `${field}.id_or_name`);
  }
  if (!successConclusion(value.conclusion)) {
    return failure('GATE_NOT_SUCCESS', `${field}:${String(value.conclusion || '')}`);
  }
  return { ok: true };
}

export function buildTopologyOnlyEvidenceFromWorkflowPrefix({
  requiredStageIds,
  workflowScripts,
  compilerScript,
  stageScriptById,
}) {
  const compilerIndex = workflowScripts.indexOf(compilerScript);
  if (compilerIndex < 0) return [];
  const prefix = new Map(workflowScripts.slice(0, compilerIndex).map((script, index) => [script, index]));
  return requiredStageIds
    .filter((stageId) => prefix.has(stageScriptById[stageId]))
    .map((stageId) => ({
      stageId,
      source: 'RTK_REQUIRED_WORKFLOW_PREFIX',
      topologyOnly: true,
      workflowIndex: prefix.get(stageScriptById[stageId]),
      script: stageScriptById[stageId],
    }));
}

export function validateObservedGateEvidenceRow({
  row,
  stageId,
  stage,
  expectedHeadSha,
  expectedTreeSha,
  expectedScript,
  requiredEvidenceClass = EVIDENCE_CLASS_INDEPENDENT_EXACT_HEAD,
}) {
  if (!isPlainObject(row)) return failure('GATE_OBSERVED_EVIDENCE_REQUIRED', stageId);
  if (row.source === 'RTK_REQUIRED_WORKFLOW_PREFIX' || row.topologyOnly === true) {
    return failure('GATE_TOPOLOGY_ONLY_EVIDENCE', stageId);
  }
  if (row.stageId !== stageId) return failure('GATE_EVIDENCE_STAGE_MISMATCH', `${String(row.stageId || '')} != ${stageId}`);
  if (row.status !== 'SUCCESS') return failure('GATE_NOT_SUCCESS', `${stageId}:${String(row.status || '')}`);
  if (row.truncated === true || row.outputTruncated === true) return failure('GATE_EVIDENCE_TRUNCATED', stageId);
  if (row.headSha !== expectedHeadSha) return failure('GATE_HEAD_MISMATCH', `${stageId}:${String(row.headSha || '')} != ${expectedHeadSha}`);
  if (!HEX40_RE.test(String(row.treeSha || ''))) return failure('GATE_TREE_MISSING', stageId);
  if (expectedTreeSha && row.treeSha !== expectedTreeSha) {
    return failure('GATE_TREE_MISMATCH', `${stageId}:${row.treeSha} != ${expectedTreeSha}`);
  }

  const classes = evidenceClasses(row.evidenceClass ?? row.evidenceClasses);
  const legacy = classes.find((item) => FORBIDDEN_LEGACY_EVIDENCE_CLASS_RE.test(String(item || '')));
  if (legacy) return failure('GATE_LEGACY_EVIDENCE_CLASS_FORBIDDEN', `${stageId}:${legacy}`);
  if (!classes.includes(requiredEvidenceClass)) {
    return failure('GATE_EVIDENCE_CLASS_MISSING', `${stageId}:${requiredEvidenceClass}`);
  }

  if (!isPlainObject(row.candidate)) return failure('GATE_CANDIDATE_BINDING_MISSING', stageId);
  if (row.candidate.stageId !== stageId) return failure('GATE_CANDIDATE_STAGE_MISMATCH', `${String(row.candidate.stageId || '')} != ${stageId}`);
  if (expectedScript && row.candidate.script !== expectedScript) {
    return failure('GATE_CANDIDATE_SCRIPT_MISMATCH', `${String(row.candidate.script || '')} != ${expectedScript}`);
  }
  if (stage?.profile && row.candidate.profileId && row.candidate.profileId !== stage.profile) {
    return failure('GATE_CANDIDATE_PROFILE_MISMATCH', `${row.candidate.profileId} != ${stage.profile}`);
  }

  const runCheck = validateObservedIdentity(row, 'run');
  if (!runCheck.ok) return runCheck;
  if (row.run.headSha !== expectedHeadSha) return failure('GATE_RUN_HEAD_MISMATCH', `${stageId}:${String(row.run.headSha || '')} != ${expectedHeadSha}`);

  const jobCheck = validateObservedIdentity(row, 'job');
  if (!jobCheck.ok) return jobCheck;
  const stepCheck = validateObservedIdentity(row, 'step');
  if (!stepCheck.ok) return stepCheck;

  if (!isPlainObject(row.counts)) return failure('GATE_COUNTS_MISSING', stageId);
  if (!Number.isInteger(row.counts.denominator) || row.counts.denominator < 1) {
    return failure('GATE_COUNTS_INVALID', `${stageId}:denominator`);
  }
  if (row.counts.passed !== row.counts.denominator || row.counts.failed !== 0 || row.counts.skipped !== 0 || row.counts.exitCode !== 0) {
    return failure('GATE_NOT_SUCCESS', `${stageId}:counts`);
  }

  for (const field of ['artifact', 'tool', 'schema', 'fixture']) {
    const digestCheck = validateDigestContainer(row, field);
    if (!digestCheck.ok) return digestCheck;
  }

  for (const field of ['postmerge', 'survivor']) {
    const value = row[field];
    if (isPlainObject(value) && value.required === true) {
      if (!successConclusion(value.conclusion)) return failure('GATE_NOT_SUCCESS', `${stageId}:${field}`);
      if (value.headSha && value.headSha !== expectedHeadSha) {
        return failure('GATE_HEAD_MISMATCH', `${stageId}:${field}:${value.headSha} != ${expectedHeadSha}`);
      }
      if (!HEX64_RE.test(String(value.digest || ''))) return failure('GATE_DIGEST_BINDING_MISSING', `${field}.digest`);
    }
  }

  return { ok: true };
}
