#!/usr/bin/env node
// R2.4 E0 — runner truth receipt. Executes one named command, captures exact
// coordinates (cmd/args/cwd/env-filtered/exit/signal/duration/TAP summary),
// binds repo head/tree/dirty state and artifact digests, and fails closed on
// zero denominator, skipped evidence, missing TAP or unnamed runs.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { sha256hex, R24Error, HEX40_RE } from './canonical-json.mjs';

export const RUNNER_TRUTH_SCHEMA_VERSION = 'yalken.runner-truth.v1';

export function parseTapSummary(text) {
  const out = { tests: null, pass: null, fail: null, cancelled: null, skipped: null, todo: null };
  const source = String(text || '');
  for (const key of Object.keys(out)) {
    const matches = [...source.matchAll(new RegExp(`^[#ℹ]\\s+${key} (\\d+)$`, 'gm'))];
    if (matches.length > 0) out[key] = Number(matches[matches.length - 1][1]);
  }
  return out;
}

const gitAt = (cwd, argv) => {
  const result = spawnSync('git', ['-C', cwd, ...argv], { encoding: 'utf8' });
  if (result.status !== 0) return null;
  return result.stdout.trim();
};

export function runTruthful({
  runId,
  cmd,
  args = [],
  cwd,
  env = process.env,
  requireTap = true,
  failOnSkip = true,
  artifactPaths = [],
  maxBuffer = 64 * 1024 * 1024,
}) {
  if (typeof runId !== 'string' || runId.trim().length === 0) throw new R24Error('E_RUNNER_TRUTH_UNNAMED');
  if (typeof cmd !== 'string' || cmd.length === 0) throw new R24Error('E_RUNNER_TRUTH_CMD_REQUIRED');
  if (!Array.isArray(args)) throw new R24Error('E_RUNNER_TRUTH_ARGS_SHAPE');
  const cwdAbs = path.resolve(cwd || process.cwd());
  if (!fs.existsSync(cwdAbs)) throw new R24Error('E_RUNNER_TRUTH_CWD_MISSING', cwdAbs);

  const startedAt = new Date();
  const result = spawnSync(cmd, args, { cwd: cwdAbs, env, encoding: 'utf8', maxBuffer });
  const durationMs = Date.now() - startedAt.getTime();
  const stdout = String(result.stdout || '');
  const stderr = String(result.stderr || '');
  const tap = parseTapSummary(`${stdout}\n${stderr}`);
  const tapPresent = tap.pass !== null || tap.fail !== null;

  const headSha = gitAt(cwdAbs, ['rev-parse', 'HEAD']);
  const treeSha = headSha ? gitAt(cwdAbs, ['rev-parse', 'HEAD^{tree}']) : null;
  const dirtyRaw = headSha ? gitAt(cwdAbs, ['status', '--porcelain=v1', '--untracked-files=all']) : null;

  const failures = [];
  const exitCode = typeof result.status === 'number' ? result.status : 1;
  if (result.error) failures.push(`E_RUNNER_TRUTH_SPAWN:${result.error.message}`);
  if (requireTap && !tapPresent) failures.push('E_TAP_SUMMARY_MISSING');
  const executed = tapPresent ? (tap.pass ?? 0) + (tap.fail ?? 0) : null;
  if (tapPresent && executed === 0) failures.push('E_ZERO_DENOMINATOR');
  if (tapPresent && failOnSkip && (tap.skipped ?? 0) > 0) failures.push(`E_SKIPPED_EVIDENCE:${tap.skipped}`);
  if (exitCode !== 0) failures.push(`E_COMMAND_NONZERO_EXIT:${exitCode}`);

  const artifacts = artifactPaths.map((p) => {
    const abs = path.resolve(cwdAbs, p);
    if (!fs.existsSync(abs)) {
      failures.push(`E_ARTIFACT_MISSING:${p}`);
      return { path: p, missing: true };
    }
    const content = fs.readFileSync(abs);
    return { path: p, sha256: sha256hex(content), size: content.length };
  });

  const receipt = {
    schemaVersion: RUNNER_TRUTH_SCHEMA_VERSION,
    runId,
    cmd,
    args,
    cwd: cwdAbs,
    exitCode,
    signal: result.signal || null,
    durationMs,
    tap,
    executedDenominator: executed,
    repo: {
      headSha: HEX40_RE.test(String(headSha)) ? headSha : null,
      treeSha: HEX40_RE.test(String(treeSha)) ? treeSha : null,
      dirty: dirtyRaw === null ? null : dirtyRaw !== '',
    },
    artifacts,
    law: { requireTap, failOnSkip, zeroExecutedFails: true, unnamedFails: true },
    failures,
    verdict: failures.length === 0 ? 'PASS' : 'FAIL',
    startedAt: startedAt.toISOString(),
  };
  return { receipt, stdout, stderr };
}

export function main(argv = process.argv.slice(2)) {
  const sep = argv.indexOf('--');
  if (sep === -1) throw new R24Error('E_RUNNER_TRUTH_SEPARATOR_REQUIRED');
  const opts = argv.slice(0, sep);
  const command = argv.slice(sep + 1);
  if (command.length === 0) throw new R24Error('E_RUNNER_TRUTH_CMD_REQUIRED');
  const get = (name) => {
    const i = opts.indexOf(name);
    return i !== -1 && i + 1 < opts.length ? opts[i + 1] : null;
  };
  const runId = get('--run-id');
  const artifacts = [];
  for (let i = 0; i < opts.length; i += 1) {
    if (opts[i] === '--artifact' && i + 1 < opts.length) artifacts.push(opts[i + 1]);
  }
  const { receipt, stdout, stderr } = runTruthful({
    runId,
    cmd: command[0],
    args: command.slice(1),
    cwd: get('--cwd') || process.cwd(),
    requireTap: !opts.includes('--no-require-tap'),
    failOnSkip: !opts.includes('--allow-skip'),
    artifactPaths: artifacts,
  });
  if (stdout) process.stdout.write(stdout);
  if (stderr) process.stderr.write(stderr);
  process.stdout.write(`RUNNER_TRUTH_RECEIPT=${JSON.stringify(receipt)}\n`);
  process.exitCode = receipt.verdict === 'PASS' ? 0 : 1;
  return receipt;
}

const invokedAsScript = process.argv[1] && path.resolve(process.argv[1]).endsWith('runner-truth.mjs');
if (invokedAsScript) {
  try {
    main();
  } catch (error) {
    const code = error instanceof R24Error ? error.code : 'E_UNKNOWN';
    process.stderr.write(`${code}: ${error.message}\n`);
    process.exit(1);
  }
}
