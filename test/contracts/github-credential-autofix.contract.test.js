const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

let modulePromise = null;

function loadModule() {
  if (!modulePromise) {
    const href = pathToFileURL(
      path.join(process.cwd(), 'scripts/ops/github-credential-autofix.mjs'),
    ).href;
    modulePromise = import(href);
  }
  return modulePromise;
}

function makeQueueRunner(expectedSequence) {
  const queue = [...expectedSequence];
  return {
    runner(step) {
      assert.ok(queue.length > 0, `unexpected step ${step.label}`);
      const next = queue.shift();
      assert.equal(step.label, next.label, `step order mismatch for ${step.label}`);
      return {
        status: Object.prototype.hasOwnProperty.call(next, 'status') ? next.status : 0,
        stdout: next.stdout || '',
        stderr: next.stderr || '',
        error: next.error || '',
      };
    },
    assertDone() {
      assert.equal(queue.length, 0, `unused mocked steps: ${queue.map((entry) => entry.label).join(',')}`);
    },
  };
}

function workflowScopeError() {
  return "remote: refusing to allow a Personal Access Token to create or update workflow '.github/workflows/ops-vector-close.yml' without 'workflow' scope";
}

function diagnosticsSequence() {
  return [
    {
      label: 'DIAG_GIT_REMOTE',
      stdout: 'origin https://github.com/KirPon2024/writer-editor.git (fetch)\norigin https://github.com/KirPon2024/writer-editor.git (push)\n',
    },
    { label: 'DIAG_HELPER_LOCAL', stdout: 'osxkeychain\n' },
    { label: 'DIAG_HELPER_GLOBAL', stdout: 'osxkeychain\n' },
    { label: 'DIAG_HELPER_SYSTEM', stdout: '' },
    { label: 'DIAG_GH_AUTH_STATUS', status: 0, stdout: 'github.com\n  Logged in to github.com as KirPon2024\n' },
    {
      label: 'DIAG_CRED_FILL_HOST_ONLY',
      status: 0,
      stdout: 'protocol=https\nhost=github.com\nusername=KirPon2024\npassword=SECRET_VALUE_1\n\n',
    },
    {
      label: 'DIAG_CRED_FILL_HOST_USERNAME',
      status: 0,
      stdout: 'protocol=https\nhost=github.com\nusername=KirPon2024\npassword=SECRET_VALUE_2\n\n',
    },
    {
      label: 'DIAG_CRED_FILL_HOST_PATH',
      status: 0,
      stdout: 'protocol=https\nhost=github.com\npath=KirPon2024/writer-editor.git\nusername=KirPon2024\npassword=SECRET_VALUE_3\n\n',
    },
    {
      label: 'DIAG_CRED_FILL_HOST_PATH_USERNAME',
      status: 0,
      stdout: 'protocol=https\nhost=github.com\npath=KirPon2024/writer-editor.git\nusername=KirPon2024\npassword=SECRET_VALUE_4\n\n',
    },
  ];
}

test('unit: workflow scope push block parser is deterministic', async () => {
  const { detectWorkflowScopePushBlock } = await loadModule();
  assert.equal(detectWorkflowScopePushBlock(workflowScopeError()), true);
  assert.equal(detectWorkflowScopePushBlock('remote: permission denied'), false);
});

test('contract: output never leaks credential secrets from credential fill', async () => {
  const { runGithubCredentialAutofix } = await loadModule();
  const mock = makeQueueRunner([
    { label: 'PUSH_INITIAL', status: 1, stderr: workflowScopeError() },
    ...diagnosticsSequence(),
    { label: 'REM1_UNSET_LOCAL_HELPER', status: 0 },
    { label: 'PUSH_AFTER_REM-1', status: 1, stderr: workflowScopeError() },
    { label: 'REM2_ERASE_HOST_PATH', status: 0 },
    { label: 'REM2_ERASE_HOST_PATH_USERNAME', status: 0 },
    { label: 'PUSH_AFTER_REM-2', status: 1, stderr: workflowScopeError() },
    { label: 'REM3_ERASE_HOST_ONLY', status: 0 },
    { label: 'REM3_ERASE_HOST_USERNAME', status: 0 },
    { label: 'PUSH_AFTER_REM-3', status: 1, stderr: workflowScopeError() },
  ]);

  const result = runGithubCredentialAutofix({
    runner: mock.runner,
    resumeFromStep: 'STEP_11_PUSH_PR',
  });
  mock.assertDone();

  assert.equal(result.status, 'HUMAN_ACTION_REQUIRED');
  assert.equal(result.handoffId, 'AUTOMATION_HANDOFF_MINIMAL_CLICKS');
  assert.equal(result.handoff.resumeFromStep, 'STEP_11_PUSH_PR');
  assert.equal(result.remediations.length, 3);
  assert.equal(result.push.attempts.length, 4);
  assert.equal(result.diagnostics.credentialFill.credentialPath, 'host_path_username');
  const serialized = JSON.stringify(result);
  assert.equal(serialized.includes('SECRET_VALUE_'), false);
});

test('integration-dry-run: succeeds on REM-2 and stops further remediation', async () => {
  const { runGithubCredentialAutofix } = await loadModule();
  const mock = makeQueueRunner([
    { label: 'PUSH_INITIAL', status: 1, stderr: workflowScopeError() },
    ...diagnosticsSequence(),
    { label: 'REM1_UNSET_LOCAL_HELPER', status: 0 },
    { label: 'PUSH_AFTER_REM-1', status: 1, stderr: workflowScopeError() },
    { label: 'REM2_ERASE_HOST_PATH', status: 0 },
    { label: 'REM2_ERASE_HOST_PATH_USERNAME', status: 0 },
    { label: 'PUSH_AFTER_REM-2', status: 0, stdout: 'branch set up to track origin/head\n' },
  ]);

  const result = runGithubCredentialAutofix({
    runner: mock.runner,
    resumeFromStep: 'STEP_08_PUSH',
  });
  mock.assertDone();

  assert.equal(result.status, 'PASS');
  assert.equal(result.stopRequired, 0);
  assert.equal(result.push.succeeded, true);
  assert.equal(result.push.successfulAttempt, 'PUSH_AFTER_REM-2');
  assert.equal(result.remediations.length, 2);
});
