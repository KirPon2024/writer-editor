#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const STATUS_PATH = path.join(
  REPO_ROOT,
  'docs',
  'OPS',
  'RTK',
  'W5_RELEASE_HARDENING_CERTIFICATION_STATUS.json',
);

const RESULT_PASS = 'PASS';
const RESULT_FAIL = 'FAIL';
const REQUIRED_SCHEMA = 'yalken.rtk.w5.release-hardening-certification.v1';
const REQUIRED_STAGE = 'W5_RELEASE_HARDENING_AND_CERTIFICATION';
const RESUMABLE_EXTERNAL_WORD = 'RESUMABLE_EXTERNAL_WORD_CERTIFICATION';
const PASS_LIKE_WORD_STATUSES = new Set([
  'PASS',
  'WORD_PROFILE_EVIDENCE_PASS',
  'WORD_CERTIFICATION_PASS',
  'FULL_WORD_EVIDENCE_PASS',
]);

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function normalizeString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function isObjectRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function detectLocalWordOracleAvailability() {
  const platform = os.platform();
  const macWordPath = '/Applications/Microsoft Word.app';
  return {
    platform,
    microsoftWordApp: platform === 'darwin' && fs.existsSync(macWordPath) ? 'present' : 'absent',
    windowsWordLab: platform === 'win32' ? 'unknown_not_proven' : 'unavailable_on_this_host',
  };
}

function pushIssue(issues, code, message, details = {}) {
  issues.push({
    code,
    message,
    ...details,
  });
}

function validateNoBroadClaims(status, issues) {
  const text = JSON.stringify(status, null, 2);
  const forbidden = [
    /\bWord support is (?:available|supported|ready|complete|proven)\b/iu,
    /\bWord import is (?:available|supported|ready|complete|proven)\b/iu,
    /\bWord roundtrip is (?:available|supported|ready|complete|proven)\b/iu,
    /\bWord layout parity is (?:available|supported|ready|complete|proven)\b/iu,
    /\bfull DOCX fidelity is (?:available|supported|ready|complete|proven)\b/iu,
    /\bDONE is (?:available|supported|ready|complete|proven)\b/iu,
  ];

  for (const pattern of forbidden) {
    if (pattern.test(text)) {
      pushIssue(issues, 'BROAD_CLAIM_FORBIDDEN', `Forbidden broad claim matched ${pattern.source}`);
    }
  }
}

function validateProofHooks(status, issues, repoRoot = REPO_ROOT) {
  const hooks = status?.localReleaseHardening?.proofHooks;
  if (!Array.isArray(hooks) || hooks.length < 8) {
    pushIssue(issues, 'LOCAL_PROOF_HOOKS_INCOMPLETE', 'W5 status must bind at least eight local proof hooks.');
    return;
  }

  const ids = new Set();
  for (const hook of hooks) {
    if (!isObjectRecord(hook)) {
      pushIssue(issues, 'LOCAL_PROOF_HOOK_INVALID', 'Proof hook must be an object.');
      continue;
    }
    const id = normalizeString(hook.id);
    const hookPath = normalizeString(hook.path);
    const command = normalizeString(hook.command);
    const purpose = normalizeString(hook.purpose);
    if (!id || ids.has(id)) {
      pushIssue(issues, 'LOCAL_PROOF_HOOK_ID_INVALID', 'Proof hook id must be present and unique.', { id });
    }
    ids.add(id);
    if (!hookPath || path.isAbsolute(hookPath) || hookPath.includes('..')) {
      pushIssue(issues, 'LOCAL_PROOF_HOOK_PATH_INVALID', 'Proof hook path must be repo-relative.', { id, path: hookPath });
    } else if (!fs.existsSync(path.join(repoRoot, hookPath))) {
      pushIssue(issues, 'LOCAL_PROOF_HOOK_PATH_MISSING', 'Proof hook path is missing.', { id, path: hookPath });
    }
    if (!command) {
      pushIssue(issues, 'LOCAL_PROOF_HOOK_COMMAND_MISSING', 'Proof hook command is required.', { id });
    }
    if (!purpose) {
      pushIssue(issues, 'LOCAL_PROOF_HOOK_PURPOSE_MISSING', 'Proof hook purpose is required.', { id });
    }
  }

  for (const requiredId of [
    'ops-current-wave',
    'oss-policy',
    'package-boundary',
    'archive-export',
    'migration-hardening',
    'performance-profile',
    'release-candidate-lock',
    'word-evidence-claim-gate',
  ]) {
    if (!ids.has(requiredId)) {
      pushIssue(issues, 'LOCAL_PROOF_HOOK_REQUIRED_ID_MISSING', 'Required proof hook id is missing.', { id: requiredId });
    }
  }
}

function validateExternalWord(status, issues) {
  const word = status?.externalWordCertification;
  if (!isObjectRecord(word)) {
    pushIssue(issues, 'EXTERNAL_WORD_STATUS_MISSING', 'externalWordCertification is required.');
    return;
  }

  const wordStatus = normalizeString(word.status);
  const acceptedWordEvidence = word.acceptedWordEvidence === true;
  const requiredEvidence = Array.isArray(word.requiredEvidence) ? word.requiredEvidence : [];

  if (PASS_LIKE_WORD_STATUSES.has(wordStatus) && !acceptedWordEvidence) {
    pushIssue(
      issues,
      'EXTERNAL_WORD_FALSE_PASS_FORBIDDEN',
      'Word certification cannot be PASS-like without accepted external Word evidence.',
      { status: wordStatus },
    );
  }
  if (wordStatus !== RESUMABLE_EXTERNAL_WORD || acceptedWordEvidence) {
    pushIssue(
      issues,
      'EXTERNAL_WORD_CERTIFICATION_MUST_BE_RESUMABLE',
      'Current W5 local run must remain resumable until real external Word evidence is attached.',
      { status: wordStatus, acceptedWordEvidence },
    );
  }
  if (word.falsePassForbidden !== true || word.blocksDone !== true) {
    pushIssue(issues, 'EXTERNAL_WORD_GATES_NOT_STRICT', 'Word evidence must forbid false PASS and block DONE.');
  }
  if (requiredEvidence.length < 8) {
    pushIssue(issues, 'EXTERNAL_WORD_REQUIRED_EVIDENCE_INCOMPLETE', 'Word evidence requirements must remain explicit.');
  }
}

function validateDoneGate(status, issues) {
  const gate = status?.doneGate;
  if (!isObjectRecord(gate)) {
    pushIssue(issues, 'DONE_GATE_MISSING', 'doneGate is required.');
    return;
  }
  const blockers = Array.isArray(gate.blockers) ? gate.blockers : [];
  if (gate.doneAllowed === true) {
    pushIssue(issues, 'DONE_FALSE_PASS_FORBIDDEN', 'DONE cannot be allowed while Word evidence is resumable.');
  }
  if (!blockers.includes('WORD_PROFILE_EVIDENCE_REQUIRED')) {
    pushIssue(issues, 'DONE_GATE_WORD_BLOCKER_MISSING', 'DONE gate must include WORD_PROFILE_EVIDENCE_REQUIRED.');
  }
  if (gate.resumableAfterExternalEvidence !== true) {
    pushIssue(issues, 'DONE_GATE_RESUMABLE_FLAG_MISSING', 'DONE gate must explicitly allow resuming after external evidence.');
  }
}

function evaluateW5ReleaseHardeningStatus(input = {}) {
  const repoRoot = path.resolve(input.repoRoot || REPO_ROOT);
  const statusPath = path.resolve(input.statusPath || path.join(
    repoRoot,
    'docs',
    'OPS',
    'RTK',
    'W5_RELEASE_HARDENING_CERTIFICATION_STATUS.json',
  ));
  const status = input.status || readJson(statusPath);
  const issues = [];

  if (status.schemaVersion !== REQUIRED_SCHEMA) {
    pushIssue(issues, 'SCHEMA_VERSION_INVALID', 'Unexpected W5 status schema.', { actual: status.schemaVersion });
  }
  if (status.stageId !== REQUIRED_STAGE) {
    pushIssue(issues, 'STAGE_ID_INVALID', 'Unexpected W5 stage id.', { actual: status.stageId });
  }
  if (status.overallStatus !== 'LOCAL_HARDENING_READY_EXTERNAL_WORD_RESUMABLE') {
    pushIssue(issues, 'OVERALL_STATUS_INVALID', 'W5 status must advertise local readiness with external Word resumable.');
  }

  validateExternalWord(status, issues);
  validateDoneGate(status, issues);
  validateProofHooks(status, issues, repoRoot);
  validateNoBroadClaims(status, issues);

  const ok = issues.length === 0;
  return {
    ok,
    result: ok ? RESULT_PASS : RESULT_FAIL,
    stageId: REQUIRED_STAGE,
    statusPath,
    localWordOracleAvailability: detectLocalWordOracleAvailability(),
    tokens: {
      W5_LOCAL_HARDENING_STATUS_OK: ok ? 1 : 0,
      W5_EXTERNAL_WORD_CERTIFICATION_RESUMABLE: status?.externalWordCertification?.status === RESUMABLE_EXTERNAL_WORD ? 1 : 0,
      W5_DONE_BLOCKED_BY_EXTERNAL_WORD_EVIDENCE: status?.doneGate?.doneAllowed === false ? 1 : 0,
    },
    issues,
  };
}

function printHuman(result) {
  console.log(`W5_RELEASE_HARDENING_CERTIFICATION_RESULT=${result.result}`);
  console.log(`W5_RELEASE_HARDENING_STATUS_OK=${result.ok ? 1 : 0}`);
  console.log(`W5_EXTERNAL_WORD_CERTIFICATION_RESUMABLE=${result.tokens.W5_EXTERNAL_WORD_CERTIFICATION_RESUMABLE}`);
  console.log(`W5_DONE_BLOCKED_BY_EXTERNAL_WORD_EVIDENCE=${result.tokens.W5_DONE_BLOCKED_BY_EXTERNAL_WORD_EVIDENCE}`);
  console.log(`W5_LOCAL_WORD_ORACLE=${JSON.stringify(result.localWordOracleAvailability)}`);
  if (result.issues.length > 0) {
    console.log(`W5_RELEASE_HARDENING_ISSUES=${JSON.stringify(result.issues)}`);
  }
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === __filename;

if (isMain) {
  const json = process.argv.includes('--json');
  const result = evaluateW5ReleaseHardeningStatus({ statusPath: STATUS_PATH, repoRoot: REPO_ROOT });
  if (json) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } else {
    printHuman(result);
  }
  process.exit(result.ok ? 0 : 1);
}

export {
  evaluateW5ReleaseHardeningStatus,
};
