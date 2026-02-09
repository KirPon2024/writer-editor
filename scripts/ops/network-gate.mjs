#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { URL } from 'node:url';
import https from 'node:https';

const REMOTE_HEADS = 'refs/heads/main';
const TIMEOUT_MS = 8000;

function parseArgs(argv) {
  const out = { mode: 'delivery' };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--mode') {
      out.mode = String(argv[i + 1] || '').toLowerCase();
      i += 1;
    }
  }
  return out;
}

function detectOriginUrl() {
  const result = spawnSync('git', ['remote', 'get-url', 'origin'], {
    encoding: 'utf8',
    timeout: TIMEOUT_MS,
  });
  if (result.status !== 0) {
    return {
      ok: 0,
      originUrl: '',
      originHost: '',
      detail: String(result.stderr || 'origin_remote_unavailable').trim(),
    };
  }
  const originUrl = String(result.stdout || '').trim();
  if (!originUrl) {
    return {
      ok: 0,
      originUrl: '',
      originHost: '',
      detail: 'origin_remote_empty',
    };
  }

  let originHost = '';
  try {
    if (/^https?:\/\//i.test(originUrl) || /^ssh:\/\//i.test(originUrl)) {
      originHost = new URL(originUrl).hostname;
    } else {
      const scpMatch = originUrl.match(/^[^@]+@([^:]+):/);
      originHost = scpMatch ? scpMatch[1] : '';
    }
  } catch {
    originHost = '';
  }

  return {
    ok: 1,
    originUrl,
    originHost,
    detail: 'origin_remote_ok',
  };
}

function runGitRemoteCheck() {
  const result = spawnSync('git', ['ls-remote', 'origin', '-h', REMOTE_HEADS], {
    encoding: 'utf8',
    timeout: TIMEOUT_MS,
  });
  const ok = result.status === 0 && String(result.stdout || '').trim().length > 0 ? 1 : 0;
  const detail = ok === 1 ? 'git_ls_remote_ok' : String(result.stderr || 'git_ls_remote_failed').trim();
  return { ok, detail };
}

function runCurlCheck(targetUrl) {
  const probe = spawnSync('curl', ['--version'], { encoding: 'utf8', timeout: TIMEOUT_MS });
  if (probe.status !== 0) return null;
  const result = spawnSync('curl', ['-I', '--max-time', '8', targetUrl], {
    encoding: 'utf8',
    timeout: TIMEOUT_MS,
  });
  const ok = result.status === 0 ? 1 : 0;
  const detail = ok === 1 ? 'curl_head_ok' : String(result.stderr || 'curl_head_failed').trim();
  return { ok, detail };
}

function runNodeHttpsCheck(targetUrl) {
  return new Promise((resolve) => {
    const req = https.request(
      targetUrl,
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

function loadFixture() {
  if (!process.env.NETWORK_GATE_FIXTURE_JSON) return null;
  try {
    const parsed = JSON.parse(process.env.NETWORK_GATE_FIXTURE_JSON);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    const gitOk = parsed.git && parsed.git.ok === 1 ? 1 : 0;
    const httpOk = parsed.http && parsed.http.ok === 1 ? 1 : 0;
    const originUrl = typeof parsed.originUrl === 'string' ? parsed.originUrl : 'fixture://origin';
    const originHost = typeof parsed.originHost === 'string' ? parsed.originHost : 'fixture-host';
    return {
      git: { ok: gitOk, detail: String((parsed.git && parsed.git.detail) || 'fixture_git') },
      http: { ok: httpOk, detail: String((parsed.http && parsed.http.detail) || 'fixture_http') },
      originUrl,
      originHost,
    };
  } catch {
    return null;
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const fixture = loadFixture();
  let originUrl = '';
  let originHost = '';
  let originDetail = '';
  let gitCheck;
  let httpCheck;

  if (fixture) {
    originUrl = fixture.originUrl;
    originHost = fixture.originHost;
    originDetail = 'origin_remote_fixture';
    gitCheck = fixture.git;
    httpCheck = fixture.http;
  } else {
    const origin = detectOriginUrl();
    originUrl = origin.originUrl;
    originHost = origin.originHost;
    originDetail = origin.detail;
    if (origin.ok !== 1) {
      gitCheck = { ok: 0, detail: origin.detail };
      httpCheck = { ok: 0, detail: 'http_diagnostic_skipped_no_origin' };
    } else {
      gitCheck = runGitRemoteCheck();
      const diagnosticTarget = /^https?:\/\//i.test(originUrl)
        ? originUrl
        : (originHost ? `https://${originHost}` : '');
      if (diagnosticTarget) {
        const curlCheck = runCurlCheck(diagnosticTarget);
        httpCheck = curlCheck || (await runNodeHttpsCheck(diagnosticTarget));
      } else {
        httpCheck = { ok: 0, detail: 'http_diagnostic_skipped_no_origin_host' };
      }
    }
  }

  const deliveryMode = args.mode === 'delivery';
  const networkGateOk = deliveryMode ? (gitCheck.ok === 1 ? 1 : 0) : 1;
  const failReason = networkGateOk === 1 ? '' : 'NETWORK_GATE_FAIL';
  const retryMax = 1;

  console.log(`NETWORK_GATE_GIT_OK=${gitCheck.ok}`);
  console.log(`NETWORK_GATE_HTTP_OK=${httpCheck.ok}`);
  console.log(`NETWORK_GATE_OK=${networkGateOk}`);
  console.log(`NETWORK_GATE_GIT_DETAIL=${gitCheck.detail}`);
  console.log(`NETWORK_GATE_HTTP_DETAIL=${httpCheck.detail}`);
  console.log(`NETWORK_GATE_ORIGIN_URL=${originUrl}`);
  console.log(`NETWORK_GATE_ORIGIN_HOST=${originHost}`);
  console.log(`NETWORK_GATE_ORIGIN_DETAIL=${originDetail}`);
  console.log(`NETWORK_GATE_MODE=${deliveryMode ? 'delivery' : 'local'}`);
  console.log(`RETRY_MAX=${retryMax}`);
  if (failReason) {
    console.log(`FAIL_REASON=${failReason}`);
  }

  process.exit(networkGateOk === 1 ? 0 : 1);
}

main();
