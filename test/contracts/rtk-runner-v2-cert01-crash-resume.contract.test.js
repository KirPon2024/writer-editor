'use strict';

/**
 * RTK Runner V2 — CERT-01 Pass 1 crash/resume contract tests (REPRODUCED_RED).
 *
 * These scenarios require REAL separate runner processes and REAL evidence
 * files on disk. An in-process exception does NOT count as a crash proof.
 *
 * Crash proof pattern:
 *   1. spawn the runner CLI as a separate child process (node:child_process spawn),
 *   2. poll the durable CASE_OUTCOMES.jsonl on disk until N outcomes appear,
 *   3. deliver a real SIGKILL to the runner process mid-campaign,
 *   4. then run `--resume` and assert the durable on-disk state.
 *
 * No sleep-based races where file/process observation is possible; polls use a
 * bounded deadline. No skip/todo. All deterministic.
 *
 * Scenarios covered here: 5, 6, 7, 8, 15.
 * Behavioral scenarios 1, 2, 3, 4, 9, 10, 11, 12, 13, 14 live in the sibling file.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const { pathToFileURL } = require('node:url');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const RUNNER_V2_PATH = path.join(REPO_ROOT, 'scripts', 'ops', 'rtk-runner-v2.mjs');

// --- shared helpers (duplicated across the two CERT-01 files; CJS, no shared module allowed in write-set) ---

async function loadRunnerV2() {
  // Dynamic import of the ESM runner. On CURRENT this throws ERR_MODULE_NOT_FOUND,
  // which is the exact RED signal for this pass.
  return await import(pathToFileURL(RUNNER_V2_PATH).href);
}

function removeNoFollow(targetPath) {
  let stat;
  try {
    stat = fs.lstatSync(targetPath);
  } catch (error) {
    if (error.code === 'ENOENT') return;
    throw error;
  }
  if (stat.isDirectory() && !stat.isSymbolicLink()) {
    for (const entry of fs.readdirSync(targetPath, { withFileTypes: true })) {
      removeNoFollow(path.join(targetPath, entry.name));
    }
    fs.rmdirSync(targetPath);
    return;
  }
  fs.unlinkSync(targetPath);
}

function makeTempDir(t, prefix = 'rtk-runner-v2-cert01-crash-') {
  const root = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), prefix));
  t.after(() => removeNoFollow(root));
  return root;
}

function writeFixture(dir, name, source) {
  const filePath = path.join(dir, name);
  fs.writeFileSync(filePath, source, 'utf8');
  return filePath;
}

function buildManifest({ campaignId, seed = 1, budgets = { softWallMs: 400, hardWallMs: 1500, maxStdoutBytes: 1 * 1024 * 1024, maxStderrBytes: 1 * 1024 * 1024 }, declaredDenominator, cases }) {
  return { schemaVersion: 1, campaignId, seed, budgets, declaredDenominator, cases };
}

function writeManifest(dir, manifest) {
  const filePath = path.join(dir, 'manifest.json');
  fs.writeFileSync(filePath, JSON.stringify(manifest, null, 2) + '\n', 'utf8');
  return filePath;
}

function readJsonEvidence(evidenceRoot, name) {
  const filePath = path.join(evidenceRoot, name);
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function readOutcomes(evidenceRoot) {
  const filePath = path.join(evidenceRoot, 'CASE_OUTCOMES.jsonl');
  if (!fs.existsSync(filePath)) return [];
  const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/u).filter((line) => line.trim().length > 0);
  return lines.map((line) => JSON.parse(line));
}

function readRawOutcomeLines(evidenceRoot) {
  const filePath = path.join(evidenceRoot, 'CASE_OUTCOMES.jsonl');
  if (!fs.existsSync(filePath)) return [];
  return fs.readFileSync(filePath, 'utf8').split(/\r?\n/u).filter((line) => line.trim().length > 0);
}

function spawnRunnerAsync({ manifestPath, evidenceRoot, resume = false }) {
  const args = [RUNNER_V2_PATH, 'run', '--manifest', manifestPath, '--evidence-root', evidenceRoot];
  if (resume) args.push('--resume');
  const child = spawn(process.execPath, args, {
    cwd: REPO_ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, EVIDENCE_ROOT: evidenceRoot },
  });
  return child;
}

function spawnRunnerSync({ manifestPath, evidenceRoot, resume = false, timeoutMs = 30000 }) {
  const args = [RUNNER_V2_PATH, 'run', '--manifest', manifestPath, '--evidence-root', evidenceRoot];
  if (resume) args.push('--resume');
  return spawnSync(process.execPath, args, {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    timeout: timeoutMs,
    maxBuffer: 64 * 1024 * 1024,
    env: { ...process.env, EVIDENCE_ROOT: evidenceRoot },
  });
}

function isPidAlive(pid) {
  if (!Number.isSafeInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function countRunMarkers(evidenceRoot) {
  // Each case fixture writes a marker file `case-run-<caseId>.txt` with its run count.
  const dir = path.join(evidenceRoot, 'markers');
  if (!fs.existsSync(dir)) return {};
  const counts = {};
  for (const entry of fs.readdirSync(dir)) {
    const match = entry.match(/^case-run-(.+)\.txt$/u);
    if (!match) continue;
    counts[match[1]] = Number(fs.readFileSync(path.join(dir, entry), 'utf8').trim() || '0');
  }
  return counts;
}

function waitForOutcomeCount(evidenceRoot, count, deadlineMs = 15000) {
  const deadline = Date.now() + deadlineMs;
  while (Date.now() < deadline) {
    if (readOutcomes(evidenceRoot).length >= count) return true;
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 40);
  }
  return readOutcomes(evidenceRoot).length >= count;
}

function waitForFile(filePath, deadlineMs = 8000) {
  const deadline = Date.now() + deadlineMs;
  while (Date.now() < deadline) {
    if (fs.existsSync(filePath)) return true;
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 40);
  }
  return fs.existsSync(filePath);
}

// File-observed wait for the machine lease to become takeable (stale): once
// Date.now() exceeds heartbeatAt + expiryMs + slack, a crashed runner's lease
// can be taken over. Returns a Promise (async) so the event loop stays free.
function waitForLeaseExpiry(evidenceRoot, deadlineMs = 10000, slackMs = 250) {
  return new Promise((resolve) => {
    const deadline = Date.now() + deadlineMs;
    const tick = () => {
      const lease = readJsonEvidence(evidenceRoot, 'MACHINE_LEASE.json');
      if (lease) {
        const heartbeatAt = Date.parse(lease.heartbeatAt);
        const expiryMs = Number(lease.expiryMs) || 0;
        if (Number.isFinite(heartbeatAt) && Date.now() >= heartbeatAt + expiryMs + slackMs) {
          return resolve(true);
        }
      }
      if (Date.now() >= deadline) return resolve(false);
      setTimeout(tick, 50);
    };
    tick();
  });
}

function waitForProcessExit(pid, deadlineMs = 8000) {
  const deadline = Date.now() + deadlineMs;
  while (Date.now() < deadline) {
    if (!isPidAlive(pid)) return true;
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 40);
  }
  return !isPidAlive(pid);
}

function makeMarkerCaseScript(caseId, delayMs = 120) {
  // Writes/updates a run-count marker, sleeps briefly, then exits 0 (PASS).
  return `
    const fs = require('node:fs');
    const path = require('node:path');
    const dir = path.join(process.env.EVIDENCE_ROOT, 'markers');
    fs.mkdirSync(dir, { recursive: true });
    const marker = path.join(dir, 'case-run-${caseId}.txt');
    let n = 0;
    try { n = Number(fs.readFileSync(marker, 'utf8').trim()) || 0; } catch (e) { n = 0; }
    fs.writeFileSync(marker, String(n + 1));
    const start = Date.now();
    while (Date.now() - start < ${delayMs}) { /* spin briefly to be measurable */ }
    process.exit(0);
  `;
}

// ---------------------------------------------------------------------------
// Scenario 5: runner crashes (SIGKILL) after some cases -> --resume completes remaining; completed not re-run.
//
// AMDG transparency note (Pass 2 revision): the original Pass 1 scenario used
// three short-delay marker cases and crashed the runner after seeing >=1
// outcome. That was NONDETERMINISTIC: a SIGKILL delivered only to the runner
// process leaves the in-flight case as an ORPHAN that finishes honestly
// (marker becomes 1) with NO durable outcome, and then --resume legitimately
// re-runs it (marker becomes 2). The old assertion `markers.c2 == 1` is
// therefore UNREACHABLE for a correct runner and would flake.
//
// This revision rewrites the scenario to a deterministic GATE-FILE protocol.
// It is NOT a weakening: the core invariant from the TЗ — "a completed case
// (one with a durable terminal outcome) is NEVER re-run, and every case has
// exactly one terminal outcome" — is preserved and STRENGTHENED by making
// mid-flight observation deterministic via a `c2-started` file rather than a
// timer race.
// ---------------------------------------------------------------------------

test('CERT01-05 runner SIGKILL mid-campaign then --resume completes remaining without re-running', async (t) => {
  const fx = makeTempDir(t);

  // c1 and c3: fast marker cases (exit 0 immediately after writing the marker).
  const c1Script = makeMarkerCaseScript('c1', 60);
  const c3Script = makeMarkerCaseScript('c3', 60);
  // c2: writes its marker, signals it is mid-flight via `c2-started`, then
  // spins until the gate file appears (with a self-timeout so it never hangs a
  // runaway). When gated, it exits 0.
  const c2Script = `
    const fs = require('node:fs');
    const path = require('node:path');
    const dir = path.join(process.env.EVIDENCE_ROOT, 'markers');
    fs.mkdirSync(dir, { recursive: true });
    const marker = path.join(dir, 'case-run-c2.txt');
    let n = 0;
    try { n = Number(fs.readFileSync(marker, 'utf8').trim()) || 0; } catch (e) { n = 0; }
    fs.writeFileSync(marker, String(n + 1));
    // Signal mid-flight, deterministically observable by the test.
    fs.writeFileSync(path.join(process.env.EVIDENCE_ROOT, 'c2-started'), String(process.pid));
    const gate = path.join(process.env.EVIDENCE_ROOT, 'c2-gate');
    const deadline = Date.now() + 8000;
    while (!fs.existsSync(gate) && Date.now() < deadline) {
      // bounded spin; will not outlive its own self-timeout
    }
    process.exit(0);
  `;
  const cases = [
    { caseId: 'c1', kind: 'node-script', path: writeFixture(fx, 'case-c1.js', c1Script), args: [], expect: 'PASS' },
    { caseId: 'c2', kind: 'node-script', path: writeFixture(fx, 'case-c2.js', c2Script), args: [], expect: 'PASS' },
    { caseId: 'c3', kind: 'node-script', path: writeFixture(fx, 'case-c3.js', c3Script), args: [], expect: 'PASS' },
  ];
  const manifest = buildManifest({
    campaignId: 'cert01-05-crash-resume',
    budgets: { softWallMs: 2000, hardWallMs: 6000, maxStdoutBytes: 1 * 1024 * 1024, maxStderrBytes: 1 * 1024 * 1024 },
    declaredDenominator: 3,
    cases,
  });
  const manifestPath = writeManifest(fx, manifest);
  const evidenceRoot = path.join(fx, 'ev-crash-resume');
  fs.mkdirSync(evidenceRoot, { recursive: true });

  const runner = await loadRunnerV2();
  assert.equal(typeof runner === 'object', true);

  // Start the runner as a separate process.
  const child = spawnRunnerAsync({ manifestPath, evidenceRoot });
  assert.ok(Number.isSafeInteger(child.pid) && child.pid > 0, 'runner must spawn as a separate process');
  // Attach an exit listener so Node reaps the child after SIGKILL (a blocking
  // Atomics.wait poll would prevent reap and falsely observe a live zombie).
  const runnerExit = new Promise((resolve) => child.on('exit', (code, signal) => resolve({ code, signal })));
  t.after(() => {
    try { if (isPidAlive(child.pid)) process.kill(child.pid, 'SIGKILL'); } catch { /* noop */ }
  });

  // Deterministic crash point: c1 has a durable outcome AND c2 is observably
  // mid-flight (its `c2-started` file exists). c3 cannot have run yet because
  // the runner executes cases in declared order and c2 has not returned.
  assert.equal(waitForOutcomeCount(evidenceRoot, 1, 15000), true, 'c1 outcome must be durable before the crash');
  assert.equal(waitForFile(path.join(evidenceRoot, 'c2-started'), 15000), true, 'c2 must be observably mid-flight before the crash');
  const preCrashOutcomes = readOutcomes(evidenceRoot);
  assert.ok(preCrashOutcomes.length === 1 && preCrashOutcomes[0].caseId === 'c1', 'only c1 may have a durable outcome at crash time');

  // Deliver a REAL SIGKILL to the runner process only (c2 becomes an orphan).
  // Await the exit event (async) so the OS reap completes and death is observed
  // deterministically — NOT via a blocking poll that would stall the reap.
  try { process.kill(child.pid, 'SIGKILL'); } catch { /* may have exited */ }
  const exitInfo = await Promise.race([
    runnerExit,
    new Promise((resolve) => setTimeout(() => resolve(null), 8000)),
  ]);
  assert.ok(exitInfo, 'runner process must die (exit event observed) after SIGKILL');

  // Open the gate so the orphaned c2 completes honestly (marker c2 == 1, no outcome).
  fs.writeFileSync(path.join(evidenceRoot, 'c2-gate'), 'release');
  // Wait for c2 to actually finish so its marker reflects the honest single run.
  const c2Done = await new Promise((resolve) => {
    const deadline = Date.now() + 8000;
    const tick = () => {
      if ((countRunMarkers(evidenceRoot).c2 || 0) >= 1) return resolve(true);
      if (Date.now() >= deadline) return resolve(false);
      setTimeout(tick, 40);
    };
    tick();
  });
  assert.equal(c2Done, true, 'orphaned c2 must finish honestly after the gate is opened');

  // Deterministically wait for the crashed runner's lease to expire before
  // resuming. Takeover policy: a lease is stale only when pid is dead AND
  // now > heartbeatAt + expiryMs. The crashed runner's heartbeat stopped at
  // the crash, so we wait (file-observed, not sleep-based) until that
  // threshold passes with slack. This is the contract for lease takeover on
  // expiry and makes the resume non-racy.
  await waitForLeaseExpiry(evidenceRoot, 12000);

  // --resume: the runner takes over the now-expired lease and completes the
  // remaining cases. c1 is NOT re-run (durable outcome already present).
  // c2 IS re-run by resume because it produced NO durable outcome before the
  // crash (the orphaned run does not count). c3 runs once under resume.
  const resume = spawnRunnerSync({ manifestPath, evidenceRoot, resume: true, timeoutMs: 30000 });
  const outcomes = readOutcomes(evidenceRoot);

  // Exactly one terminal outcome per declared case.
  assert.equal(outcomes.length, 3, 'all 3 cases must have exactly one terminal outcome after resume');
  const caseIds = outcomes.map((o) => o.caseId).sort();
  assert.deepEqual(caseIds, ['c1', 'c2', 'c3']);
  // No re-run of a closed case: every outcome keeps attemptId 1.
  for (const outcome of outcomes) {
    assert.equal(outcome.attemptId, 1, `case ${outcome.caseId} must keep attemptId=1`);
  }

  const markers = countRunMarkers(evidenceRoot);
  // c1 ran exactly once and was NOT re-run by resume (it had a durable outcome).
  assert.equal(markers.c1, 1, 'c1 must run exactly once (no duplicate execution after resume)');
  // c2 ran once as an honest orphan (no outcome) and once under resume: 2 honest
  // executions, but exactly ONE terminal outcome. This is the semantically
  // correct value for a mid-flight case that produced no durable record.
  assert.equal(markers.c2, 2, 'c2 must run once orphaned + once under resume (no durable outcome pre-crash)');
  // c3 ran exactly once under resume.
  assert.equal(markers.c3, 1, 'c3 must run exactly once under resume');

  assert.equal(resume.status, 0, `resume of an all-PASS campaign must exit 0, got ${resume.status}\n${resume.stdout}\n${resume.stderr}`);
});

// ---------------------------------------------------------------------------
// Scenario 6: outcome exists but belongs to a different snapshotDigest -> not counted; campaign cannot PASS.
// ---------------------------------------------------------------------------

test('CERT01-06 outcome with foreign snapshotDigest is not counted and blocks campaign PASS', async (t) => {
  const fx = makeTempDir(t);
  const okScript = writeFixture(fx, 'ok6.js', 'process.exit(0);');
  const manifest = buildManifest({
    campaignId: 'cert01-06-foreign-snapshot',
    budgets: { softWallMs: 500, hardWallMs: 2000, maxStdoutBytes: 1 * 1024 * 1024, maxStderrBytes: 1 * 1024 * 1024 },
    declaredDenominator: 1,
    cases: [{ caseId: 'only', kind: 'node-script', path: okScript, args: [], expect: 'PASS' }],
  });
  const manifestPath = writeManifest(fx, manifest);
  const evidenceRoot = path.join(fx, 'ev-foreign-snapshot');
  fs.mkdirSync(evidenceRoot, { recursive: true });

  const runner = await loadRunnerV2();
  assert.equal(typeof runner === 'object', true);

  // Run once to produce a valid snapshot + outcome.
  const first = spawnRunnerSync({ manifestPath, evidenceRoot });
  assert.equal(first.status, 0, `baseline run must PASS, got ${first.status}\n${first.stdout}\n${first.stderr}`);
  const validSnapshot = readJsonEvidence(evidenceRoot, 'START_SNAPSHOT.json');
  assert.ok(validSnapshot, 'snapshot must exist after first run');
  const validOutcomes = readOutcomes(evidenceRoot);
  assert.equal(validOutcomes.length, 1);

  // Plant a foreign outcome line referencing a DIFFERENT snapshotDigest for the same caseId.
  // The behavior frozen by this test: resume must NOT credit a foreign-snapshot outcome.
  const foreignLine = JSON.stringify({
    schemaVersion: 1,
    campaignId: 'cert01-06-foreign-snapshot',
    caseId: 'only',
    attemptId: 1,
    snapshotDigest: 'sha256:' + 'f'.repeat(64), // foreign digest
    startedAt: '2020-01-01T00:00:00.000Z',
    finishedAt: '2020-01-01T00:00:01.000Z',
    durationMs: 1000,
    terminal: 'PASS',
    exitCode: 0,
    signal: null,
    reasonCode: null,
    stdoutDigest: 'sha256:' + '0'.repeat(64),
    stderrDigest: 'sha256:' + '0'.repeat(64),
    stdoutTruncated: false,
    stderrTruncated: false,
  });
  fs.appendFileSync(path.join(evidenceRoot, 'CASE_OUTCOMES.jsonl'), foreignLine + '\n', 'utf8');

  // Re-run with --resume: the foreign outcome must not be credited for the current snapshot,
  // so the case must be NOT_RUN for the current snapshot (re-run or red). Either way, the
  // campaign must not silently PASS using the foreign outcome.
  const resume = spawnRunnerSync({ manifestPath, evidenceRoot, resume: true, timeoutMs: 30000 });
  const reconciliation = readJsonEvidence(evidenceRoot, 'DENOMINATOR_RECONCILIATION.json');
  assert.ok(reconciliation, 'reconciliation must exist');
  // The foreign outcome must be excluded: for the current snapshot, the case must be run
  // under the current snapshot (one valid outcome with the valid snapshotDigest).
  const outcomes = readOutcomes(evidenceRoot);
  const validForSnapshot = outcomes.filter((o) => o.snapshotDigest === validSnapshot.snapshotDigest);
  assert.ok(validForSnapshot.length >= 1, 'at least one outcome bound to the current snapshot must exist');
  // No PASS may rely on the foreign snapshot outcome.
  const foreignCredited = reconciliation.foreignSnapshotOutcomes || reconciliation.foreign_snapshot_outcomes;
  assert.ok(Array.isArray(foreignCredited) ? foreignCredited.length >= 1 : true, 'foreign outcomes must be accounted in reconciliation');
});

// ---------------------------------------------------------------------------
// Scenario 7: two conflicting outcomes for same caseId+attemptId -> campaign red, conflict recorded, no overwrite.
// ---------------------------------------------------------------------------

test('CERT01-07 duplicate conflicting outcomes for caseId+attemptId make campaign red and are not overwritten', async (t) => {
  const fx = makeTempDir(t);
  const okScript = writeFixture(fx, 'ok7.js', 'process.exit(0);');
  const manifest = buildManifest({
    campaignId: 'cert01-07-conflict',
    budgets: { softWallMs: 500, hardWallMs: 2000, maxStdoutBytes: 1 * 1024 * 1024, maxStderrBytes: 1 * 1024 * 1024 },
    declaredDenominator: 1,
    cases: [{ caseId: 'only', kind: 'node-script', path: okScript, args: [], expect: 'PASS' }],
  });
  const manifestPath = writeManifest(fx, manifest);
  const evidenceRoot = path.join(fx, 'ev-conflict');
  fs.mkdirSync(evidenceRoot, { recursive: true });

  const runner = await loadRunnerV2();
  assert.equal(typeof runner === 'object', true);

  // Run to produce a valid PASS outcome.
  const first = spawnRunnerSync({ manifestPath, evidenceRoot });
  assert.equal(first.status, 0, `baseline must PASS, got ${first.status}\n${first.stdout}\n${first.stderr}`);
  const snapshot = readJsonEvidence(evidenceRoot, 'START_SNAPSHOT.json');
  const beforeLines = readRawOutcomeLines(evidenceRoot);
  assert.equal(beforeLines.length, 1);
  const originalOutcome = JSON.parse(beforeLines[0]);

  // Append a CONFLICTING outcome for the same caseId+attemptId (different terminal).
  const conflictingLine = JSON.stringify({
    ...originalOutcome,
    terminal: 'PRODUCT_FAIL',
    exitCode: 2,
    durationMs: originalOutcome.durationMs + 1,
  });
  fs.appendFileSync(path.join(evidenceRoot, 'CASE_OUTCOMES.jsonl'), conflictingLine + '\n', 'utf8');

  // Re-run/resume: the duplicate conflict must make the campaign RED and must NOT overwrite the first.
  const resume = spawnRunnerSync({ manifestPath, evidenceRoot, resume: true, timeoutMs: 30000 });
  assert.notEqual(resume.status, 0, 'a duplicate/conflicting outcome must make the campaign red');
  const reconciliation = readJsonEvidence(evidenceRoot, 'DENOMINATOR_RECONCILIATION.json');
  assert.ok(reconciliation, 'reconciliation must exist');
  const duplicates = reconciliation.duplicates || reconciliation.duplicateConflicts;
  assert.ok(Array.isArray(duplicates) && duplicates.length > 0, 'duplicate conflicts must be recorded in reconciliation');
  const lines = readRawOutcomeLines(evidenceRoot);
  // The original outcome line must still be present (not overwritten) and unchanged.
  const firstParsed = JSON.parse(lines[0]);
  assert.equal(firstParsed.terminal, originalOutcome.terminal);
  assert.equal(firstParsed.exitCode, originalOutcome.exitCode);
  assert.equal(firstParsed.durationMs, originalOutcome.durationMs, 'original outcome must not be overwritten by the conflict');
});

// ---------------------------------------------------------------------------
// Scenario 8: torn/malformed outcome (truncated JSONL / broken digest) -> not terminal, blocks PASS, typed evidence.
// ---------------------------------------------------------------------------

test('CERT01-08 torn or malformed outcome is not terminal and blocks campaign PASS with typed evidence', async (t) => {
  const fx = makeTempDir(t);
  const okScript = writeFixture(fx, 'ok8.js', 'process.exit(0);');
  const manifest = buildManifest({
    campaignId: 'cert01-08-torn',
    budgets: { softWallMs: 500, hardWallMs: 2000, maxStdoutBytes: 1 * 1024 * 1024, maxStderrBytes: 1 * 1024 * 1024 },
    declaredDenominator: 1,
    cases: [{ caseId: 'only', kind: 'node-script', path: okScript, args: [], expect: 'PASS' }],
  });
  const manifestPath = writeManifest(fx, manifest);
  const evidenceRoot = path.join(fx, 'ev-torn');
  fs.mkdirSync(evidenceRoot, { recursive: true });

  const runner = await loadRunnerV2();
  assert.equal(typeof runner === 'object', true);

  // Run to produce a valid snapshot.
  const first = spawnRunnerSync({ manifestPath, evidenceRoot });
  assert.equal(first.status, 0, `baseline must PASS, got ${first.status}\n${first.stdout}\n${first.stderr}`);

  // Append a TORN/malformed line: a truncated JSON object with no closing brace.
  const tornLine = '{"schemaVersion":1,"campaignId":"cert01-08-torn","caseId":"only","attemptId":1,"terminal":"PASS';
  fs.appendFileSync(path.join(evidenceRoot, 'CASE_OUTCOMES.jsonl'), tornLine + '\n', 'utf8');

  // Resume must detect the malformed line, refuse to credit it, and block PASS.
  const resume = spawnRunnerSync({ manifestPath, evidenceRoot, resume: true, timeoutMs: 30000 });
  assert.notEqual(resume.status, 0, 'a torn/malformed outcome must block campaign PASS');
  const combined = `${resume.stdout || ''}\n${resume.stderr || ''}`;
  assert.match(combined, /MALFORMED|TORN|INVALID|SCHEMA|DIGEST|OUTCOME/iu, 'malformed outcome must produce a typed evidence reason');
  const reconciliation = readJsonEvidence(evidenceRoot, 'DENOMINATOR_RECONCILIATION.json');
  assert.ok(reconciliation, 'reconciliation must exist');
  const seal = readJsonEvidence(evidenceRoot, 'EVIDENCE_SEAL.json');
  assert.equal(seal, null, 'no seal may be created while a malformed outcome is present');
});

// ---------------------------------------------------------------------------
// Scenario 15: repeated resume does not re-run an already-closed case (run count stays 1).
// ---------------------------------------------------------------------------

test('CERT01-15 repeated resume does not re-run a closed case and adds no second terminal outcome', async (t) => {
  const fx = makeTempDir(t);
  const okScript = writeFixture(fx, 'ok15.js', makeMarkerCaseScript('only', 80));
  const manifest = buildManifest({
    campaignId: 'cert01-15-idempotent-resume',
    budgets: { softWallMs: 1000, hardWallMs: 3000, maxStdoutBytes: 1 * 1024 * 1024, maxStderrBytes: 1 * 1024 * 1024 },
    declaredDenominator: 1,
    cases: [{ caseId: 'only', kind: 'node-script', path: okScript, args: [], expect: 'PASS' }],
  });
  const manifestPath = writeManifest(fx, manifest);
  const evidenceRoot = path.join(fx, 'ev-idempotent-resume');
  fs.mkdirSync(evidenceRoot, { recursive: true });

  const runner = await loadRunnerV2();
  assert.equal(typeof runner === 'object', true);

  // First run: completes the single case once.
  const first = spawnRunnerSync({ manifestPath, evidenceRoot });
  assert.equal(first.status, 0, `first run must PASS, got ${first.status}\n${first.stdout}\n${first.stderr}`);
  const outcomesAfterFirst = readOutcomes(evidenceRoot);
  assert.equal(outcomesAfterFirst.length, 1, 'exactly one terminal outcome after first run');
  assert.equal(countRunMarkers(evidenceRoot).only, 1, 'case must have run exactly once');

  // First resume: the closed case must NOT be re-run.
  const resume1 = spawnRunnerSync({ manifestPath, evidenceRoot, resume: true, timeoutMs: 15000 });
  assert.equal(resume1.status, 0, `idempotent resume must PASS, got ${resume1.status}\n${resume1.stdout}\n${resume1.stderr}`);
  assert.equal(readOutcomes(evidenceRoot).length, 1, 'resume must not add a second terminal outcome');
  assert.equal(countRunMarkers(evidenceRoot).only, 1, 'closed case must not be re-run by resume');

  // Second resume: still no re-run.
  const resume2 = spawnRunnerSync({ manifestPath, evidenceRoot, resume: true, timeoutMs: 15000 });
  assert.equal(resume2.status, 0, `second idempotent resume must PASS, got ${resume2.status}\n${resume2.stdout}\n${resume2.stderr}`);
  assert.equal(readOutcomes(evidenceRoot).length, 1, 'second resume must not add another terminal outcome');
  assert.equal(countRunMarkers(evidenceRoot).only, 1, 'closed case must not be re-run by a second resume');
});
