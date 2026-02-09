#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { URL } from 'node:url';
import https from 'node:https';
import dns from 'node:dns/promises';

const REMOTE_HEADS = 'refs/heads/main';
const DEFAULT_TIMEOUT_MS = 5000;
const MODE_LOCAL = 'local';
const MODE_DELIVERY = 'delivery';
const FAIL_DNS = 'NETWORK_GATE_FAIL_DNS';
const FAIL_CONNECT = 'NETWORK_GATE_FAIL_CONNECT';
const FAIL_TLS = 'NETWORK_GATE_FAIL_TLS';
const FAIL_AUTH = 'NETWORK_GATE_FAIL_AUTH';
const FAIL_ORIGIN_MISCONFIG = 'NETWORK_GATE_FAIL_ORIGIN_MISCONFIG';

function parseArgs(argv) {
  const out = { mode: MODE_DELIVERY, timeoutMs: DEFAULT_TIMEOUT_MS };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--mode') {
      out.mode = String(argv[i + 1] || '').toLowerCase();
      i += 1;
    } else if (argv[i] === '--timeout-ms') {
      const parsed = Number.parseInt(String(argv[i + 1] || ''), 10);
      if (Number.isInteger(parsed) && parsed > 0) out.timeoutMs = parsed;
      i += 1;
    }
  }
  return out;
}

function normalizeMode(mode) {
  return mode === MODE_LOCAL ? MODE_LOCAL : MODE_DELIVERY;
}

function run(cmd, args, timeoutMs) {
  return spawnSync(cmd, args, { encoding: 'utf8', timeout: timeoutMs });
}

function commandExists(cmd, timeoutMs) {
  const probe = run('sh', ['-lc', `command -v ${cmd}`], timeoutMs);
  return probe.status === 0;
}

function redactOriginUrl(raw) {
  const originUrl = String(raw || '').trim();
  if (!originUrl) return '';
  if (!/^https?:\/\//i.test(originUrl)) return originUrl;
  try {
    const u = new URL(originUrl);
    if (u.username) u.username = '***';
    if (u.password) u.password = '***';
    return u.toString();
  } catch {
    return originUrl;
  }
}

function detectOriginUrl(timeoutMs) {
  const result = spawnSync('git', ['remote', 'get-url', 'origin'], {
    encoding: 'utf8',
    timeout: timeoutMs,
  });
  if (result.status !== 0) {
    return {
      ok: 0,
      originUrl: '',
      originUrlRedacted: '',
      originHost: '',
      detail: String(result.stderr || 'origin_remote_unavailable').trim() || 'origin_remote_unavailable',
    };
  }
  const originUrl = String(result.stdout || '').trim();
  if (!originUrl) {
    return {
      ok: 0,
      originUrl: '',
      originUrlRedacted: '',
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
    originUrlRedacted: redactOriginUrl(originUrl),
    originHost,
    detail: 'origin_remote_ok',
  };
}

function runGitRemoteCheck(timeoutMs) {
  const result = spawnSync('git', ['ls-remote', 'origin', '-h', REMOTE_HEADS], {
    encoding: 'utf8',
    timeout: timeoutMs,
  });
  const ok = result.status === 0 && String(result.stdout || '').trim().length > 0 ? 1 : 0;
  const detail = ok === 1 ? 'git_ls_remote_ok' : String(result.stderr || 'git_ls_remote_failed').trim() || 'git_ls_remote_failed';
  return { ok, detail };
}

function runCurlCheck(targetUrl, timeoutMs) {
  if (!commandExists('curl', timeoutMs)) return null;
  const result = spawnSync('curl', ['-I', '--max-time', '8', targetUrl], {
    encoding: 'utf8',
    timeout: timeoutMs,
  });
  const ok = result.status === 0 ? 1 : 0;
  const detail = ok === 1 ? 'curl_head_ok' : String(result.stderr || 'curl_head_failed').trim() || 'curl_head_failed';
  return { ok, detail };
}

function runNodeHttpsCheck(targetUrl, timeoutMs) {
  return new Promise((resolve) => {
    const req = https.request(
      targetUrl,
      { method: 'HEAD', timeout: timeoutMs },
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

async function runDnsProbe(originHost, timeoutMs) {
  if (!originHost) {
    return { ok: 0, detail: 'dns_host_missing', method: 'none' };
  }

  if (process.platform === 'darwin' && commandExists('dscacheutil', timeoutMs)) {
    const result = run('dscacheutil', ['-q', 'host', '-a', 'name', originHost], timeoutMs);
    const txt = `${result.stdout || ''}\n${result.stderr || ''}`;
    if (result.status === 0 && /ip_address:\s*\S+/i.test(txt)) {
      return { ok: 1, detail: 'dns_ok_dscacheutil', method: 'dscacheutil' };
    }
  }

  if (commandExists('nslookup', timeoutMs)) {
    const result = run('nslookup', [originHost], timeoutMs);
    const txt = `${result.stdout || ''}\n${result.stderr || ''}`;
    if (result.status === 0 && !/(can't find|nxdomain|not found)/i.test(txt) && /(address|addresses)/i.test(txt)) {
      return { ok: 1, detail: 'dns_ok_nslookup', method: 'nslookup' };
    }
  }

  if (commandExists('dig', timeoutMs)) {
    const result = run('dig', [originHost, '+short'], timeoutMs);
    const txt = String(result.stdout || '').trim();
    if (result.status === 0 && txt.length > 0) {
      return { ok: 1, detail: 'dns_ok_dig', method: 'dig' };
    }
  }

  try {
    const lookup = dns.lookup(originHost);
    const timed = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('dns_timeout')), timeoutMs);
    });
    await Promise.race([lookup, timed]);
    return { ok: 1, detail: 'dns_ok_node_lookup', method: 'node_dns' };
  } catch (err) {
    const msg = String(err && err.message ? err.message : err);
    return { ok: 0, detail: `dns_lookup_failed:${msg}`, method: 'node_dns' };
  }
}

function classifyGitFailure(detail, dnsOk) {
  const text = String(detail || '').toLowerCase();
  if (dnsOk !== 1) return FAIL_DNS;
  if (text.includes('could not resolve host') || text.includes('name or service not known') || text.includes('nxdomain')) {
    return FAIL_DNS;
  }
  if (text.includes('ssl') || text.includes('tls') || text.includes('certificate') || text.includes('handshake')) {
    return FAIL_TLS;
  }
  if (
    text.includes('authentication failed')
    || text.includes('permission denied')
    || text.includes('could not read username')
    || text.includes('repository not found')
    || text.includes('access denied')
  ) {
    return FAIL_AUTH;
  }
  if (
    text.includes('failed to connect')
    || text.includes('connection timed out')
    || text.includes('connection timeout')
    || text.includes('connection refused')
    || text.includes('network is unreachable')
    || text.includes('operation timed out')
  ) {
    return FAIL_CONNECT;
  }
  return FAIL_CONNECT;
}

function loadFixture() {
  if (!process.env.NETWORK_GATE_FIXTURE_JSON) return null;
  try {
    const parsed = JSON.parse(process.env.NETWORK_GATE_FIXTURE_JSON);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    const gitOk = parsed.git && parsed.git.ok === 1 ? 1 : 0;
    const dnsOk = parsed.dns && parsed.dns.ok === 1 ? 1 : 0;
    const httpOk = parsed.http && parsed.http.ok === 1 ? 1 : 0;
    const originUrl = typeof parsed.originUrl === 'string' ? parsed.originUrl : 'fixture://origin';
    const originHost = typeof parsed.originHost === 'string' ? parsed.originHost : 'fixture-host';
    return {
      dns: { ok: dnsOk, detail: String((parsed.dns && parsed.dns.detail) || 'fixture_dns') },
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
  const timeoutMs = args.timeoutMs;
  const mode = normalizeMode(args.mode);
  const fixture = loadFixture();
  let originUrl = '';
  let originUrlRedacted = '';
  let originHost = '';
  let originDetail = '';
  let dnsCheck = { ok: 0, detail: 'dns_not_run' };
  let gitCheck;
  let httpCheck;

  if (fixture) {
    originUrl = fixture.originUrl;
    originUrlRedacted = redactOriginUrl(originUrl);
    originHost = fixture.originHost;
    originDetail = 'origin_remote_fixture';
    dnsCheck = fixture.dns;
    gitCheck = fixture.git;
    httpCheck = fixture.http;
  } else {
    const origin = detectOriginUrl(timeoutMs);
    originUrl = origin.originUrl;
    originUrlRedacted = origin.originUrlRedacted;
    originHost = origin.originHost;
    originDetail = origin.detail;
    if (origin.ok !== 1) {
      dnsCheck = { ok: 0, detail: 'dns_skipped_origin_misconfig' };
      gitCheck = { ok: 0, detail: origin.detail };
      httpCheck = { ok: 0, detail: 'http_diagnostic_skipped_no_origin' };
    } else {
      dnsCheck = await runDnsProbe(originHost, timeoutMs);
      if (dnsCheck.ok === 1) {
        gitCheck = runGitRemoteCheck(timeoutMs);
      } else {
        gitCheck = { ok: 0, detail: 'git_check_skipped_dns_fail' };
      }
      const diagnosticTarget = /^https?:\/\//i.test(originUrl)
        ? originUrlRedacted
        : (originHost ? `https://${originHost}` : '');
      if (diagnosticTarget) {
        const curlCheck = runCurlCheck(diagnosticTarget, timeoutMs);
        httpCheck = curlCheck || (await runNodeHttpsCheck(diagnosticTarget, timeoutMs));
      } else {
        httpCheck = { ok: 0, detail: 'http_diagnostic_skipped_no_origin_host' };
      }
    }
  }

  const deliveryMode = mode === MODE_DELIVERY;
  let failReason = '';
  if (deliveryMode) {
    if (!originUrl || !originHost) {
      failReason = FAIL_ORIGIN_MISCONFIG;
    } else if (dnsCheck.ok !== 1) {
      failReason = FAIL_DNS;
    } else if (gitCheck.ok !== 1) {
      failReason = classifyGitFailure(gitCheck.detail, dnsCheck.ok);
    }
  }
  const networkGateOk = deliveryMode ? (failReason === '' ? 1 : 0) : 1;
  const retryMax = 1;

  console.log(`NETWORK_GATE_DNS_OK=${dnsCheck.ok}`);
  console.log(`NETWORK_GATE_GIT_OK=${gitCheck.ok}`);
  console.log(`NETWORK_GATE_HTTP_OK=${httpCheck.ok}`);
  console.log(`NETWORK_GATE_OK=${networkGateOk}`);
  console.log(`NETWORK_GATE_DNS_DETAIL=${dnsCheck.detail}`);
  console.log(`NETWORK_GATE_GIT_DETAIL=${gitCheck.detail}`);
  console.log(`NETWORK_GATE_HTTP_DETAIL=${httpCheck.detail}`);
  console.log(`NETWORK_GATE_ORIGIN_URL=${originUrlRedacted}`);
  console.log(`NETWORK_GATE_ORIGIN_HOST=${originHost}`);
  console.log(`NETWORK_GATE_ORIGIN_DETAIL=${originDetail}`);
  console.log(`NETWORK_GATE_MODE=${deliveryMode ? MODE_DELIVERY : MODE_LOCAL}`);
  console.log(`NETWORK_GATE_FAIL_REASON=${failReason}`);
  console.log(`NETWORK_GATE_TIMEOUT_MS=${timeoutMs}`);
  console.log(`RETRY_MAX=${retryMax}`);
  if (failReason) {
    console.log(`FAIL_REASON=${failReason}`);
  }

  process.exit(networkGateOk === 1 ? 0 : 1);
}

main();
