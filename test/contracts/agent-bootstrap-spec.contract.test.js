const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');

const REPO_ROOT = process.cwd();
const SPEC_PATH = path.join(
  REPO_ROOT,
  'docs',
  'OPERATIONS',
  'STATUS',
  'AGENT_BOOTSTRAP_REPOSITORY_NATIVE_V2_0.json',
);

test('agent bootstrap spec: required machine-bound fields are present', () => {
  const doc = JSON.parse(fs.readFileSync(SPEC_PATH, 'utf8'));

  assert.equal(doc.documentId, 'AGENT_BOOTSTRAP_REPOSITORY_NATIVE_V2_0');
  assert.equal(doc.documentStatus, 'ACTIVE_BOOTSTRAP_FOR_ANY_AGENT');
  assert.equal(doc.repositoryNativeContext.objectiveOnlyPromptSufficient, true);
  assert.equal(doc.repositoryNativeContext.extraArchitecturePromptRequired, false);
  assert.equal(doc.repositoryNativeContext.rootEntrypoint, 'AGENTS.md');
  assert.equal(doc.directTaskPolicy.ordinaryDirectAgentTaskRequiresSeparateExecutionTicket, false);
  assert.equal(doc.directTaskPolicy.writeTaskRequiresArchitectureDeclaration, true);
  assert.equal(doc.automationExecutionTicket.requiredFields.length >= 18, true);
  assert.equal(doc.defaultDeliveryPolicy.mergeRequired, true);
  assert.equal(doc.finalReport.selfPassAllowed, false);
});

test('agent bootstrap spec checker: policy and spec alignment passes', () => {
  const checkerPath = path.join(REPO_ROOT, 'scripts', 'contracts', 'check-agent-bootstrap-spec.mjs');
  const result = spawnSync(process.execPath, [checkerPath], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  });

  assert.equal(result.status, 0);
  const output = `${result.stdout || ''}\n${result.stderr || ''}`;
  assert.match(output, /CP-7 AGENT_BOOTSTRAP_SPEC_OK=1/);
  assert.match(output, /CP-8 EXECUTION_TICKET_SCHEMA_OK=1/);
  assert.match(output, /CP-9 AUTOMATION_POLICY_ALIGNMENT_OK=1/);
  assert.match(output, /CP-10 REPOSITORY_NATIVE_CONTEXT_OK=1/);
  assert.match(output, /CP-11 ARCHITECTURE_PREFLIGHT_BINDING_OK=1/);
});
