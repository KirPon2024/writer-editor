#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import https from 'node:https';

const REMOTE_REF = 'refs/heads/main';
const GITHUB_URL = 'https://github.com';
const TIMEOUT_MS = 8000;

function runGitRemoteCheck() {
  const result = spawnSync('git', ['ls-remote', 'origin', '-h', REMOTE_REF], {
    encoding: 'utf8',
    timeout: TIMEOUT_MS,
  });
  const ok = result.status === 0 && String(result.stdout || '').trim().length > 0 ? 1 : 0;
  const detail = ok === 1 ? 'git_ls_remote_ok' : String(result.stderr || 'git_ls_remote_failed').trim();
  return { ok, detail };
}

function runCurlCheck() {
  const probe = spawnSync('curl', ['--version'], { encoding: 'utf8', timeout: TIMEOUT_MS });
  if (probe.status !== 0) return null;
  const result = spawnSync('curl', ['-I', '--max-time', '8', GITHUB_URL], {
    encoding: 'utf8',
    timeout: TIMEOUT_MS,
  });
  const ok = result.status === 0 ? 1 : 0;
  const detail = ok === 1 ? 'curl_head_ok' : String(result.stderr || 'curl_head_failed').trim();
  return { ok, detail };
}

function runNodeHttpsCheck() {
  return new Promise((resolve) => {
    const req = https.request(
      GITHUB_URL,
      { method: 'HEAD', timeout: TIMEOUT_MS },
      (res) => {
        const ok = res.statusCode && res.statusCode >= 200 && res.statusCode < 500 ? 1 : 0;
        resolve({ ok, detail: `https_head_status_${res.statusCode || 0}` });
      },
    );
    req.on('timeout', () => {
      req.destroy(new Error('timeout'));
    });
    req.on('error', (err) => {
      resolve({ ok: 0, detail: `https_head_error:${String(err && err.message ? err.message : err)}` });
    });
    req.end();
  });
}

async function main() {
  const gitCheck = runGitRemoteCheck();
  const curlCheck = runCurlCheck();
  const httpCheck = curlCheck || (await runNodeHttpsCheck());
  const networkGateOk = gitCheck.ok === 1 && httpCheck.ok === 1 ? 1 : 0;

  console.log(`NETWORK_GATE_GIT_OK=${gitCheck.ok}`);
  console.log(`NETWORK_GATE_HTTP_OK=${httpCheck.ok}`);
  console.log(`NETWORK_GATE_OK=${networkGateOk}`);
  console.log(`NETWORK_GATE_GIT_DETAIL=${gitCheck.detail}`);
  console.log(`NETWORK_GATE_HTTP_DETAIL=${httpCheck.detail}`);

  process.exit(networkGateOk === 1 ? 0 : 1);
}

main();
