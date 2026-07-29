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
const WORD_MAC_PASS = 'WORD_MAC_CERTIFICATION_PASS';
const WORD_MAC_CERTIFICATION_STATUS_PATH = path.join(
  REPO_ROOT,
  'docs',
  'OPS',
  'RTK',
  'WORD_MAC_CERTIFICATION_STATUS.json',
);
const WORD_MAC_EVIDENCE_MANIFEST_PATH = path.join(
  REPO_ROOT,
  'docs',
  'OPS',
  'RTK',
  'WORD_MAC_ROUNDTRIP_EVIDENCE_MANIFEST.json',
);
const PASS_LIKE_WORD_STATUSES = new Set([
  'PASS',
  'WORD_PROFILE_EVIDENCE_PASS',
  'WORD_CERTIFICATION_PASS',
  'FULL_WORD_EVIDENCE_PASS',
  WORD_MAC_PASS,
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

function validateMacWordEvidence(status, word, issues) {
  if (normalizeString(word.status) !== WORD_MAC_PASS) {
    pushIssue(issues, 'WORD_MAC_STATUS_INVALID', 'Active macOS Word evidence must use WORD_MAC_CERTIFICATION_PASS.', {
      status: word.status,
    });
  }
  if (normalizeString(word.activePlatform) !== 'macos') {
    pushIssue(issues, 'WORD_MAC_ACTIVE_PLATFORM_INVALID', 'Accepted active Word evidence must be bound to macos.');
  }
  if (word.acceptedWordEvidence !== true || word.falsePassForbidden !== true || word.blocksDone !== false) {
    pushIssue(issues, 'WORD_MAC_GATES_INVALID', 'Mac Word evidence must be accepted, false-pass-forbidden, and no longer block F00.');
  }
  if (!/^sha256:[a-f0-9]{64}$/u.test(normalizeString(word.wordProfileDigest))) {
    pushIssue(issues, 'WORD_MAC_PROFILE_DIGEST_INVALID', 'wordProfileDigest must be a full lowercase sha256 identity.');
  }
  if (!/^sha256:[a-f0-9]{64}$/u.test(normalizeString(word.corpusDigest))) {
    pushIssue(issues, 'WORD_MAC_CORPUS_DIGEST_INVALID', 'corpusDigest must be a full lowercase sha256 identity.');
  }
  if (!/^sha256:[a-f0-9]{64}$/u.test(normalizeString(word.evidenceManifestDigest))) {
    pushIssue(issues, 'WORD_MAC_EVIDENCE_DIGEST_INVALID', 'evidenceManifestDigest must be a full lowercase sha256 identity.');
  }
  if (!Array.isArray(word.requiredEvidence) || word.requiredEvidence.length < 10) {
    pushIssue(issues, 'WORD_MAC_REQUIRED_EVIDENCE_INCOMPLETE', 'Mac Word evidence requirements must remain explicit.');
  }
  if (status?.activePlatformRebind?.activePlatform !== 'macos') {
    pushIssue(issues, 'WORD_MAC_REBIND_MISSING', 'W5 status must bind the owner-approved active macOS platform rebind.');
  }
  if (status?.activePlatformRebind?.immutableContractChanged !== false) {
    pushIssue(issues, 'WORD_MAC_REBIND_MUTATES_IMMUTABLE_CONTRACT', 'Active-platform rebind must not mutate the immutable contract.');
  }

  let certification = null;
  let evidence = null;
  try {
    certification = readJson(WORD_MAC_CERTIFICATION_STATUS_PATH);
  } catch (error) {
    pushIssue(issues, 'WORD_MAC_CERTIFICATION_STATUS_MISSING', 'Committed Mac Word certification status is missing.', {
      errorCode: normalizeString(error?.code),
    });
  }
  try {
    evidence = readJson(WORD_MAC_EVIDENCE_MANIFEST_PATH);
  } catch (error) {
    pushIssue(issues, 'WORD_MAC_EVIDENCE_MANIFEST_MISSING', 'Committed Mac Word evidence manifest is missing.', {
      errorCode: normalizeString(error?.code),
    });
  }

  if (certification) {
    if (certification.result !== 'PASS') {
      pushIssue(issues, 'WORD_MAC_CERTIFICATION_NOT_PASS', 'Mac Word certification status must be PASS.');
    }
    if (certification.activePlatformRebind?.activePlatform !== 'macos') {
      pushIssue(issues, 'WORD_MAC_CERTIFICATION_REBIND_INVALID', 'Mac Word certification status must bind activePlatform=macos.');
    }
    if (certification.wordProfileDigest !== word.wordProfileDigest) {
      pushIssue(issues, 'WORD_MAC_PROFILE_DIGEST_MISMATCH', 'W5 profile digest must match Mac certification status.');
    }
    if (certification.corpusDigest !== word.corpusDigest) {
      pushIssue(issues, 'WORD_MAC_CORPUS_DIGEST_MISMATCH', 'W5 corpus digest must match Mac certification status.');
    }
    if (certification.evidenceManifestDigest !== word.evidenceManifestDigest) {
      pushIssue(issues, 'WORD_MAC_EVIDENCE_DIGEST_MISMATCH', 'W5 evidence manifest digest must match Mac certification status.');
    }
    const totals = certification.totals || {};
    if (Number(totals.rounds) < 30) pushIssue(issues, 'WORD_MAC_ROUND_COUNT_TOO_LOW', 'Mac Word certification requires at least 30 rounds.');
    if (Number(totals.falseExact) !== 0) pushIssue(issues, 'WORD_MAC_FALSE_EXACT_NONZERO', 'Mac Word certification must have zero false exact.');
    if (Number(totals.silentApply) !== 0) pushIssue(issues, 'WORD_MAC_SILENT_APPLY_NONZERO', 'Mac Word certification must have zero silent apply.');
    if (Number(totals.wrongSceneRouting) !== 0) pushIssue(issues, 'WORD_MAC_WRONG_SCENE_NONZERO', 'Mac Word certification must have zero wrong-scene routing.');
    if (Number(totals.replayFailures) !== 0) pushIssue(issues, 'WORD_MAC_REPLAY_FAILURE_NONZERO', 'Mac Word certification must have zero replay failures.');
    if (Number(totals.commentCases) < 4) pushIssue(issues, 'WORD_MAC_COMMENT_CASES_TOO_LOW', 'Mac Word certification must preserve multiple comment cases.');
  }

  if (evidence) {
    if (evidence.activePlatform !== 'macos') {
      pushIssue(issues, 'WORD_MAC_EVIDENCE_PLATFORM_INVALID', 'Evidence manifest must bind activePlatform=macos.');
    }
    if (evidence.wordProfileDigest !== word.wordProfileDigest) {
      pushIssue(issues, 'WORD_MAC_EVIDENCE_PROFILE_DIGEST_MISMATCH', 'Evidence manifest profile digest must match W5.');
    }
    if (evidence.corpusDigest !== word.corpusDigest) {
      pushIssue(issues, 'WORD_MAC_EVIDENCE_CORPUS_DIGEST_MISMATCH', 'Evidence manifest corpus digest must match W5.');
    }
    if (evidence.matrixCoverage?.requiredCovered !== true) {
      pushIssue(issues, 'WORD_MAC_MATRIX_COVERAGE_INCOMPLETE', 'Evidence manifest must cover the mandatory matrix.');
    }
    const rounds = Array.isArray(evidence.rounds) ? evidence.rounds : [];
    if (rounds.length < 30) {
      pushIssue(issues, 'WORD_MAC_EVIDENCE_ROUNDS_MISSING', 'Evidence manifest must contain at least 30 round rows.');
    }
    if (!rounds.some((round) => Array.isArray(round.matrixTags) && round.matrixTags.includes('large-text'))) {
      pushIssue(issues, 'WORD_MAC_LARGE_TEXT_EVIDENCE_MISSING', 'Evidence manifest must include writer-scale large-text rounds.');
    }
    if (!rounds.some((round) => Number(round.commentCount) >= 3 && Array.isArray(round.matrixTags) && round.matrixTags.includes('large-text'))) {
      pushIssue(issues, 'WORD_MAC_LARGE_COMMENT_EVIDENCE_MISSING', 'Evidence manifest must include comments on a large writer-scale document.');
    }
    if (rounds.some((round) => round.packageZipOk !== true || round.deterministicRepeatedAnalysis !== true)) {
      pushIssue(issues, 'WORD_MAC_ROUND_INVARIANT_FAILED', 'Every Word round must have valid zip and deterministic repeated analysis.');
    }
    if (rounds.some((round) => round.classification === 'EXACT' && round.applyResult?.status !== 'applied')) {
      pushIssue(issues, 'WORD_MAC_EXACT_APPLY_NOT_PROVEN', 'Every exact Word round must prove a first apply.');
    }
    if (rounds.some((round) => round.classification === 'EXACT' && round.applyResult?.replayStatus !== 'replay')) {
      pushIssue(issues, 'WORD_MAC_EXACT_REPLAY_NOT_PROVEN', 'Every exact Word round must prove replay idempotence.');
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
  const activePlatform = normalizeString(word.activePlatform);

  if (wordStatus === WORD_MAC_PASS || activePlatform === 'macos' || acceptedWordEvidence) {
    validateMacWordEvidence(status, word, issues);
    return;
  }

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
  const activeMacCertified = status?.externalWordCertification?.status === WORD_MAC_PASS
    && status?.externalWordCertification?.activePlatform === 'macos'
    && status?.externalWordCertification?.acceptedWordEvidence === true;
  if (activeMacCertified) {
    if (gate.doneAllowed !== false || gate.f00Allowed !== true) {
      pushIssue(issues, 'WORD_MAC_DONE_GATE_INVALID', 'After Mac Word certification, DONE remains false until F00 and f00Allowed must be true.');
    }
    const remaining = Array.isArray(gate.remainingBeforeDone) ? gate.remainingBeforeDone : [];
    if (!remaining.includes('F00_FINAL_AUDIT_REQUIRED')) {
      pushIssue(issues, 'WORD_MAC_F00_REMAINING_MISSING', 'DONE gate must require F00 final audit after Word evidence.');
    }
    if (blockers.includes('WORD_PROFILE_EVIDENCE_REQUIRED')) {
      pushIssue(issues, 'WORD_MAC_STALE_WORD_BLOCKER_PRESENT', 'Mac-certified W5 status must not keep stale Word evidence blocker.');
    }
    return;
  }
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
  const acceptedOverall = new Set([
    'LOCAL_HARDENING_READY_EXTERNAL_WORD_RESUMABLE',
    'ACTIVE_PLATFORM_WORD_MAC_CERTIFIED_F00_READY',
  ]);
  if (!acceptedOverall.has(status.overallStatus)) {
    pushIssue(issues, 'OVERALL_STATUS_INVALID', 'W5 status must advertise a known W5 certification state.');
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
      W5_ACTIVE_PLATFORM_WORD_MAC_CERTIFIED: status?.externalWordCertification?.status === WORD_MAC_PASS ? 1 : 0,
      W5_F00_READY: status?.doneGate?.f00Allowed === true ? 1 : 0,
    },
    issues,
  };
}

function printHuman(result) {
  console.log(`W5_RELEASE_HARDENING_CERTIFICATION_RESULT=${result.result}`);
  console.log(`W5_RELEASE_HARDENING_STATUS_OK=${result.ok ? 1 : 0}`);
  console.log(`W5_EXTERNAL_WORD_CERTIFICATION_RESUMABLE=${result.tokens.W5_EXTERNAL_WORD_CERTIFICATION_RESUMABLE}`);
  console.log(`W5_DONE_BLOCKED_BY_EXTERNAL_WORD_EVIDENCE=${result.tokens.W5_DONE_BLOCKED_BY_EXTERNAL_WORD_EVIDENCE}`);
  console.log(`W5_ACTIVE_PLATFORM_WORD_MAC_CERTIFIED=${result.tokens.W5_ACTIVE_PLATFORM_WORD_MAC_CERTIFIED}`);
  console.log(`W5_F00_READY=${result.tokens.W5_F00_READY}`);
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
