import fs from 'node:fs';
import path from 'node:path';

const policyPath = path.join(process.cwd(), 'docs', 'OPERATIONS', 'STATUS', 'CODEX_AUTOMATION_POLICY.json');
const expectedMode = 'prompt_disabled';

function fail(reason) {
  console.error(reason);
  process.exit(1);
}

if (!fs.existsSync(policyPath)) {
  fail('PROMPT_MODE_UNPROVEN:POLICY_MISSING');
}

const doc = JSON.parse(fs.readFileSync(policyPath, 'utf8'));

if (doc.promptMode !== expectedMode) {
  fail(`PROMPT_MODE_UNPROVEN:EXPECTED_${expectedMode}`);
}

if (!doc.promptDetection || typeof doc.promptDetection !== 'object') {
  fail('PROMPT_MODE_UNPROVEN:PROMPT_DETECTION_MISSING');
}

const markerRegex = doc.promptDetection.markerRegex;
if (typeof markerRegex !== 'string' || markerRegex.trim() === '') {
  fail('PROMPT_MODE_UNPROVEN:MARKER_REGEX_MISSING');
}

try {
  // Bootstrap proof only: ensure regex is valid and configured.
  new RegExp(markerRegex, 'i');
} catch (error) {
  fail(`PROMPT_MODE_UNPROVEN:MARKER_REGEX_INVALID:${error.message}`);
}

if (!Number.isInteger(doc.promptDetection.exitCodeOnPrompt)) {
  fail('PROMPT_MODE_UNPROVEN:EXIT_CODE_INVALID');
}

console.log('CP-5 PROMPT_MODE_BOOTSTRAP_OK=1');
