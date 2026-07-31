#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const RECEIPT_PATH = path.join(REPO_ROOT, 'docs', 'OPS', 'RTK', 'WORD_SAFE_SEMANTIC_ROUNDTRIP_V4_E12_MODERN_COMMENT_NATIVE_UI_FOLLOWUP_RECEIPT.json');
const PRIOR_MODERN_RECEIPT_PATH = path.join(REPO_ROOT, 'docs', 'OPS', 'RTK', 'WORD_SAFE_SEMANTIC_ROUNDTRIP_V4_E12_MODERN_COMMENT_FOLLOWUP_RECEIPT.json');

const SCHEMA = 'yalken.rtk.word-safe-semantic-roundtrip-v4.e12-modern-comment-native-ui-followup-receipt.v1';
const STAGE = 'EXECUTION_12_WORD_LIMITATION_FOLLOWUP_MODERN_COMMENT_NATIVE_UI_CERTIFICATION';
const STATUS = 'MODERN_COMMENT_NATIVE_UI_BLOCKED_EXTERNAL_MACOS_ACCESSIBILITY_NOT_SATURATED';
const NEXT_STAGE = 'EXECUTION_12_WORD_LIMITATION_FOLLOWUP_MODERN_COMMENT_NATIVE_UI_CERTIFICATION';
const ACTIVE_LIMITATION = 'MODERN_REPLY_RESOLVE_REOPEN_STILL_TYPED_LIMITATION';

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function sha256File(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function issue(code, field, message) {
  return { code, field, message };
}

function isHex64(value) {
  return /^[0-9a-f]{64}$/u.test(String(value || ''));
}

function runAppleScript(script) {
  return execFileSync('/usr/bin/osascript', ['-e', script], { encoding: 'utf8' }).trim();
}

export function probeModernCommentNativeUiAccess() {
  const wordOutput = runAppleScript('tell application "Microsoft Word" to return (version as text) & "|" & ((count of documents) as text)');
  const [versionByAppleScript, openDocumentsText] = wordOutput.split('|');
  const systemEventsOutput = runAppleScript('tell application "System Events" to return UI elements enabled');
  const sdef = spawnSync('/usr/bin/sdef', ['/Applications/Microsoft Word.app'], { encoding: 'utf8' });
  return {
    wordProfile: {
      appPath: '/Applications/Microsoft Word.app',
      versionByAppleScript,
      openDocumentsBeforeLab: Number(openDocumentsText || 0),
    },
    systemEvents: {
      uiElementsEnabled: systemEventsOutput === 'true',
      rawValue: systemEventsOutput,
    },
    dictionaryProbe: {
      command: 'sdef Microsoft Word.app',
      exitCode: Number(sdef.status ?? 0),
      stderrDigest: `sha256:${crypto.createHash('sha256').update(String(sdef.stderr || '')).digest('hex')}`,
      blockedByCommandLineToolsOnly: String(sdef.stderr || '').includes("tool 'sdef' requires Xcode"),
    },
  };
}

function verifyBinding(binding, expectedPath, issues, field, { requireFiles }) {
  const relative = path.relative(REPO_ROOT, expectedPath).replaceAll(path.sep, '/');
  if (!binding || binding.path !== relative || !isHex64(binding.sha256)) {
    issues.push(issue('RTK_V4_E12_MODERN_NATIVE_UI_BINDING_INVALID', field, 'Binding path and lowercase SHA-256 are required.'));
    return null;
  }
  if (!requireFiles) return null;
  if (!fs.existsSync(expectedPath)) {
    issues.push(issue('RTK_V4_E12_MODERN_NATIVE_UI_BINDING_FILE_MISSING', field, 'Bound evidence file is missing.'));
    return null;
  }
  if (sha256File(expectedPath) !== binding.sha256) {
    issues.push(issue('RTK_V4_E12_MODERN_NATIVE_UI_BINDING_SHA_MISMATCH', field, 'Bound evidence SHA-256 does not match current bytes.'));
  }
  return readJson(expectedPath);
}

export function evaluateWordV4E12ModernCommentNativeUiFollowup(input = {}) {
  const receipt = input.receipt || readJson(RECEIPT_PATH);
  const issues = [];
  const add = (code, field, message) => issues.push(issue(code, field, message));

  if (receipt.schemaVersion !== SCHEMA) add('RTK_V4_E12_MODERN_NATIVE_UI_SCHEMA_INVALID', 'schemaVersion', 'Modern comment native UI followup schema is invalid.');
  if (receipt.stageId !== STAGE) add('RTK_V4_E12_MODERN_NATIVE_UI_STAGE_INVALID', 'stageId', 'Modern comment native UI followup stage is invalid.');
  if (receipt.status !== STATUS || receipt.result !== 'BLOCKED') {
    add('RTK_V4_E12_MODERN_NATIVE_UI_STATUS_INVALID', 'status', 'Followup must be a truthful external accessibility blocker, not a support PASS.');
  }
  if (receipt.nextStage !== NEXT_STAGE || receipt.saturated !== false) {
    add('RTK_V4_E12_MODERN_NATIVE_UI_SEQUENCE_INVALID', 'nextStage', 'Followup must keep Word not saturated and stay on the same native UI certification stage.');
  }

  const prior = verifyBinding(receipt.boundEvidence?.priorAppleScriptObjectModelProbe, PRIOR_MODERN_RECEIPT_PATH, issues, 'boundEvidence.priorAppleScriptObjectModelProbe', { requireFiles: input.requireFiles === true });
  if (input.requireFiles === true) {
    if (prior?.status !== 'MODERN_COMMENT_APPLESCRIPT_PROBE_LIMITATION_CONFIRMED_NOT_SATURATED'
      || prior?.totals?.replyThreadsCertified !== 0
      || prior?.totals?.resolveReopenCertified !== 0
      || prior?.totals?.deleteCertified !== 0) {
      add('RTK_V4_E12_MODERN_NATIVE_UI_PRIOR_PROBE_INVALID', 'boundEvidence.priorAppleScriptObjectModelProbe', 'Prior AppleScript object-model probe must remain a typed limitation.');
    }
  }

  if (receipt.wordProfile?.versionByAppleScript !== '16.111.2' || receipt.wordProfile?.openDocumentsBeforeLab !== 0) {
    add('RTK_V4_E12_MODERN_NATIVE_UI_WORD_PROFILE_INVALID', 'wordProfile', 'Native UI blocker must bind Word 16.111.2 with zero open user documents.');
  }
  if (receipt.systemEvents?.uiElementsEnabled !== false || receipt.systemEvents?.nativeUiAutomationAllowed !== false) {
    add('RTK_V4_E12_MODERN_NATIVE_UI_ACCESSIBILITY_INVALID', 'systemEvents', 'System Events UI scripting must be recorded as disabled for this blocker.');
  }
  if (receipt.dictionaryProbe?.blockedByCommandLineToolsOnly !== true) {
    add('RTK_V4_E12_MODERN_NATIVE_UI_DICTIONARY_PROBE_INVALID', 'dictionaryProbe', 'Dictionary probe limitation must be explicit.');
  }

  const certification = receipt.certificationDecision || {};
  if (certification.modernReplyCertified !== false
    || certification.resolveReopenCertified !== false
    || certification.deleteCertified !== false
    || certification.nativeUiPhysicalActionsPerformed !== false
    || certification.externalPermissionRequired !== true) {
    add('RTK_V4_E12_MODERN_NATIVE_UI_DECISION_INVALID', 'certificationDecision', 'Native UI blocker cannot certify reply resolve reopen delete support.');
  }
  if (!Array.isArray(receipt.remainingWordLimitations) || !receipt.remainingWordLimitations.includes(ACTIVE_LIMITATION)) {
    add('RTK_V4_E12_MODERN_NATIVE_UI_LIMITATION_MISSING', 'remainingWordLimitations', 'Modern reply resolve reopen limitation must remain active.');
  }
  if (receipt.runtimeClaims?.productRuntimeChanged !== false
    || receipt.runtimeClaims?.writerAuthorityAdded !== false
    || receipt.runtimeClaims?.automaticApplyExpanded !== false
    || receipt.runtimeClaims?.uiChanged !== false
    || receipt.runtimeClaims?.networkDependencyAdded !== false) {
    add('RTK_V4_E12_MODERN_NATIVE_UI_RUNTIME_OVERCLAIM', 'runtimeClaims', 'Followup cannot add runtime, UI, network, writer, or automatic apply authority.');
  }
  for (const [key, value] of Object.entries(receipt.vetoMetrics || {})) {
    if (Number(value) !== 0) add('RTK_V4_E12_MODERN_NATIVE_UI_VETO_NONZERO', `vetoMetrics.${key}`, 'All native UI blocker veto metrics must be zero.');
  }

  return {
    ok: issues.length === 0,
    status: issues.length === 0 ? 'PASS' : 'FAIL',
    issues,
    result: receipt.result || '',
    uiElementsEnabled: receipt.systemEvents?.uiElementsEnabled === true,
    saturated: receipt.saturated === true,
  };
}

function main() {
  const json = process.argv.includes('--json');
  if (process.argv.includes('--probe')) {
    const result = probeModernCommentNativeUiAccess();
    process.stdout.write(json ? `${JSON.stringify(result, null, 2)}\n` : `RTK_WORD_V4_E12_MODERN_NATIVE_UI_PROBE=${result.systemEvents.uiElementsEnabled ? 'AVAILABLE' : 'BLOCKED'}\n`);
    return;
  }
  const result = evaluateWordV4E12ModernCommentNativeUiFollowup({ requireFiles: process.argv.includes('--require-files') });
  process.stdout.write(json ? `${JSON.stringify(result, null, 2)}\n` : `RTK_WORD_V4_E12_MODERN_NATIVE_UI_FOLLOWUP=${result.status}\n`);
  process.exit(result.ok ? 0 : 1);
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  main();
}
