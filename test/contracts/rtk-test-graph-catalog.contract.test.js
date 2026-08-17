const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { EventEmitter } = require('node:events');
const { spawn, spawnSync } = require('node:child_process');
const { PassThrough } = require('node:stream');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const CATALOG_PATH = path.join(REPO_ROOT, 'docs', 'OPS', 'RTK', 'RTK_TEST_GRAPH_CATALOG_V1.json');
const PACKAGE_PATH = path.join(REPO_ROOT, 'package.json');
const WORKFLOW_PATH = path.join(REPO_ROOT, '.github', 'workflows', 'rtk-required.yml');
const RUNNER_PATH = path.join(REPO_ROOT, 'scripts', 'run-rtk-tests.mjs');

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function listRtkContracts() {
  return fs.readdirSync(path.join(REPO_ROOT, 'test', 'contracts'))
    .filter((name) => /^rtk-.*\.contract\.test\.js$/u.test(name))
    .sort();
}

function removeNoFollowLocal(targetPath) {
  let stat;
  try {
    stat = fs.lstatSync(targetPath);
  } catch (error) {
    if (error.code === 'ENOENT') return;
    throw error;
  }
  if (stat.isDirectory() && !stat.isSymbolicLink()) {
    for (const entry of fs.readdirSync(targetPath, { withFileTypes: true })) {
      removeNoFollowLocal(path.join(targetPath, entry.name));
    }
    fs.rmdirSync(targetPath);
    return;
  }
  fs.unlinkSync(targetPath);
}

function makeTempParent(t, prefix = 'rtk-runner-contract-') {
  const root = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), prefix));
  t.after(() => removeNoFollowLocal(root));
  return root;
}

function writeFakeContract(dir, source) {
  const filePath = path.join(dir, `fake-${Date.now()}-${Math.random().toString(16).slice(2)}.test.js`);
  fs.writeFileSync(filePath, source);
  return filePath;
}

function makeWriter() {
  let value = '';
  return {
    write(chunk) {
      value += String(chunk);
    },
    value() {
      return value;
    },
  };
}

async function waitFor(predicate, { timeoutMs = 1000, intervalMs = 10 } = {}) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() <= deadline) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  assert.fail(`WAIT_FOR_TIMEOUT:${timeoutMs}`);
}

function pidAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function stopExactPid(pid) {
  if (!Number.isSafeInteger(pid) || pid <= 0) return;
  try { process.kill(pid, 'SIGTERM'); } catch { /* already exited */ }
  await new Promise((resolve) => setTimeout(resolve, 100));
  if (pidAlive(pid)) {
    try { process.kill(pid, 'SIGKILL'); } catch { /* already exited */ }
  }
}

test('C4 RTK catalog deterministically covers every maintained rtk contract', () => {
  const catalog = readJson(CATALOG_PATH);
  const actual = listRtkContracts();
  assert.equal(catalog.schemaVersion, 'yalken.rtk.test-graph-catalog.v1');
  assert.equal(catalog.status, 'ACTIVE_REQUIRED_LOCAL_PROMOTION_AND_CI');
  assert.deepEqual([...catalog.contractBasenames].sort(), actual);
  assert.equal(catalog.currentTruthBinding.wordAcceptanceRevoked, true);
  assert.equal(catalog.currentTruthBinding.wordSaturated, false);
  assert.equal(catalog.currentTruthBinding.googleStage, 'REAL_ACCOUNT_WHOLE_BOOK_E2E_SCOPED_VERIFIED_WITH_LIMITATIONS');
  assert.equal(catalog.currentTruthBinding.googleRealAccountE2E, 'GOOGLE_DOCS_REAL_ACCOUNT_E2E_V1_SCOPED_VERIFIED');
  assert.equal(catalog.currentTruthBinding.googleRealAccountWholeBookE2E, 'GOOGLE_DOCS_REAL_ACCOUNT_WHOLE_BOOK_E2E_V1_SCOPED_VERIFIED');
  assert.equal(catalog.currentTruthBinding.googleRealAccountE2EProgramVerdict, 'NEEDS_MORE_EVIDENCE');
  assert.equal(catalog.currentTruthBinding.interopC1WordFullBookRoute, 'C1_YALKEN_WORD_YALKEN_FULL_BOOK_ROUTE_V1_EXECUTED_BLOCKED_FAIL_CLOSED');
  assert.equal(catalog.currentTruthBinding.googleLocalFinalCompatibilityVerdict, 'GOOGLE_DOCS_LOCAL_FINAL_COMPATIBILITY_VERDICT_V1_LOCAL_VERIFIED');
  assert.equal(catalog.currentTruthBinding.r4PostmergeVerification, 'R4_POSTMERGE_REQUIRED_CI_GREEN_SCOPE_UNCHANGED');
  assert.equal(catalog.currentTruthBinding.rtkExecutionProcessEvidence, 'RTK_STREAMING_HARD_DEADLINES_EXPLICIT_PROCESS_INSPECTION_V1_REQUIRED');
});

test('C4 test:rtk command and promotion wiring are local deterministic gates', () => {
  const pkg = readJson(PACKAGE_PATH);
  assert.equal(pkg.scripts['test:rtk'], 'node scripts/run-rtk-tests.mjs');
  assert.match(pkg.scripts['promotion:check'], /npm run -s test:rtk/u);

  const dryRun = spawnSync(process.execPath, [RUNNER_PATH, '--dry-run'], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  });
  assert.equal(dryRun.status, 0, `${dryRun.stdout}\n${dryRun.stderr}`);
  const plan = JSON.parse(dryRun.stdout);
  assert.equal(plan.command, 'node scripts/run-rtk-tests.mjs');
  assert.equal(plan.missing.length, 0);
  assert.equal(plan.extra.length, 0);
});

test('C4 required CI runs the deterministic RTK graph without product network', () => {
  const workflow = fs.readFileSync(WORKFLOW_PATH, 'utf8');
  assert.match(workflow, /name: rtk-required/u);
  assert.match(workflow, /npm run -s test:rtk/u);
  assert.match(workflow, /timeout-minutes:\s*40\b/u);
  assert.doesNotMatch(workflow, /password|secret|google|drive|network/iu);
});

test('C4 required CI fetches full history so exact-head ancestry checks do not fall back to rolling PR-base allowlists', () => {
  const workflow = fs.readFileSync(WORKFLOW_PATH, 'utf8');
  const checkoutStep = workflow.match(/- name: Checkout[\s\S]*?(?=\n\s*- name:|\n\s*$)/u)?.[0] || '';
  assert.match(checkoutStep, /uses:\s*actions\/checkout@v4/u);
  assert.match(checkoutStep, /with:\s*\n(?:\s+[^\n]*\n)*\s+fetch-depth:\s*0\b/u);
  assert.doesNotMatch(workflow, /PULL_REQUEST_BASE_SHA_MISMATCH.*5c16e0ee|5c16e0ee.*PULL_REQUEST_BASE_SHA_MISMATCH/u);
});

test('C4 RTK runner rejects hidden skip todo incomplete and zero-test TAP false greens', async () => {
  const runner = await import(RUNNER_PATH);
  const valid = [
    'TAP version 13',
    '# Subtest: mandatory a',
    'ok 1 - mandatory a',
    '# Subtest: mandatory b',
    'ok 2 - mandatory b',
    '1..2',
    '# tests 2',
    '# pass 2',
    '# fail 0',
    '# cancelled 0',
    '# skipped 0',
    '# todo 0',
  ].join('\n');
  assert.equal(runner.evaluateMandatoryTapOutput(valid, '', { expectedFileCount: 2 }).ok, true);

  const hiddenSkip = valid
    .replace('ok 2 - mandatory b', 'ok 2 - mandatory b # SKIP hidden')
    .replace('# skipped 0', '# skipped 1');
  assert.equal(runner.evaluateMandatoryTapOutput(hiddenSkip, '', { expectedFileCount: 2 }).failures.includes('RTK_TAP_SKIPPED_COUNT_NONZERO:1'), true);
  assert.equal(runner.evaluateMandatoryTapOutput(hiddenSkip, '', { expectedFileCount: 2 }).failures.some((failure) => failure.startsWith('RTK_TAP_SKIP_DIRECTIVE:2:mandatory b')), true);

  const hiddenTodo = valid
    .replace('ok 2 - mandatory b', 'ok 2 - mandatory b # TODO hidden')
    .replace('# todo 0', '# todo 1');
  assert.equal(runner.evaluateMandatoryTapOutput(hiddenTodo, '', { expectedFileCount: 2 }).failures.includes('RTK_TAP_TODO_COUNT_NONZERO:1'), true);

  const incomplete = valid.replace('# tests 2\n', '');
  assert.equal(runner.evaluateMandatoryTapOutput(incomplete, '', { expectedFileCount: 2 }).failures.includes('RTK_TAP_SUMMARY_TESTS_MISSING'), true);

  const zero = [
    'TAP version 13',
    '1..0',
    '# tests 0',
    '# pass 0',
    '# fail 0',
    '# cancelled 0',
    '# skipped 0',
    '# todo 0',
  ].join('\n');
  assert.equal(runner.evaluateMandatoryTapOutput(zero, '', { expectedFileCount: 1 }).failures.includes('RTK_TAP_ZERO_TESTS'), true);

  const mismatch = valid.replace('# tests 2', '# tests 3');
  assert.equal(runner.evaluateMandatoryTapOutput(mismatch, '', { expectedFileCount: 2 }).failures.includes('RTK_TAP_TEST_RECORD_COUNT_MISMATCH:2:3'), true);
});

test('C4 RTK runner streams explicit TAP immediately and emits monotonic progress heartbeats', async (t) => {
  const runner = await import(RUNNER_PATH);
  const tmpParent = makeTempParent(t);
  const fake = writeFakeContract(tmpParent, `
    const test = require('node:test');
    test('streams before completion', async () => {
      console.log('RTK_EARLY_STREAM_MARKER');
      await new Promise((resolve) => setTimeout(resolve, 240));
    });
  `);
  const stdout = makeWriter();
  const stderr = makeWriter();
  const runPromise = runner.runRtkTestGraph({
    plan: { testFiles: [fake] },
    tmpParent,
    stdout,
    stderr,
    heartbeatIntervalMs: 40,
    wallTimeoutMs: 5000,
    noProgressTimeoutMs: 2000,
    termGraceMs: 100,
    killGraceMs: 100,
  });
  assert.equal(typeof runPromise?.then, 'function', 'RTK_RUNNER_MUST_BE_ASYNC_STREAMING');
  await waitFor(() => stdout.value().includes('RTK_EARLY_STREAM_MARKER'), { timeoutMs: 1000 });
  assert.match(stderr.value(), /RTK_GRAPH_EVENT=.*"type":"RTK_GRAPH_STARTED"/u);
  await waitFor(() => (stderr.value().match(/"type":"RTK_GRAPH_PROGRESS"/gu) || []).length >= 2, { timeoutMs: 1000 });
  const run = await runPromise;
  assert.equal(run.exitCode, 0, `${stdout.value()}\n${stderr.value()}`);
  assert.deepEqual(run.spawnArgs.slice(0, 2), ['--test', '--test-reporter=tap']);
  const events = stderr.value().split('\n')
    .filter((line) => line.startsWith('RTK_GRAPH_EVENT='))
    .map((line) => JSON.parse(line.slice('RTK_GRAPH_EVENT='.length)));
  assert.equal(events[0].type, 'RTK_GRAPH_STARTED');
  assert.deepEqual(events.map((event) => event.sequence), events.map((_, index) => index + 1));
});

test('C4 RTK runner treats queued writer backpressure as flow control rather than evidence failure', async (t) => {
  const runner = await import(RUNNER_PATH);
  const tmpParent = makeTempParent(t);
  const child = new EventEmitter();
  child.pid = 414141;
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  let pauseCount = 0;
  let resumeCount = 0;
  const originalPause = child.stdout.pause.bind(child.stdout);
  const originalResume = child.stdout.resume.bind(child.stdout);
  child.stdout.pause = () => { pauseCount += 1; return originalPause(); };
  child.stdout.resume = () => { resumeCount += 1; return originalResume(); };
  const stdout = new EventEmitter();
  let stdoutText = '';
  let stdoutWrites = 0;
  stdout.write = (chunk) => {
    stdoutText += String(chunk);
    stdoutWrites += 1;
    if (stdoutWrites === 1) {
      setTimeout(() => stdout.emit('drain'), 5);
      return false;
    }
    return true;
  };
  const stderr = new EventEmitter();
  let stderrWrites = 0;
  stderr.write = () => {
    stderrWrites += 1;
    queueMicrotask(() => stderr.emit('drain'));
    return false;
  };
  const signals = [];
  const fakeIdentity = { pid: child.pid, pgid: child.pid, startIdentity: 'backpressure-start', executable: process.execPath };
  const validTap = [
    'TAP version 13',
    'ok 1 - queued backpressure',
    '1..1',
    '# tests 1',
    '# pass 1',
    '# fail 0',
    '# cancelled 0',
    '# skipped 0',
    '# todo 0',
    '',
  ].join('\n');
  const run = await runner.runRtkTestGraph({
    plan: { testFiles: ['queued-backpressure.test.js'] },
    tmpParent,
    stdout,
    stderr,
    spawnImpl: () => {
      setTimeout(() => {
        child.stdout.write(validTap);
        child.stdout.end();
      }, 5);
      setTimeout(() => {
        child.stderr.end();
        child.emit('close', 0, null);
      }, 100);
      return child;
    },
    signalProcessGroup: (_pgid, signal) => { signals.push(signal); return { ok: true, code: `TEST_SIGNAL_${signal}` }; },
    inspectProcessGroup: () => ({ ok: true, complete: true, status: 'AVAILABLE', rows: [] }),
    readProcessIdentity: () => ({ ok: true, complete: true, status: 'AVAILABLE', identity: fakeIdentity }),
    heartbeatIntervalMs: 20,
    wallTimeoutMs: 1000,
    noProgressTimeoutMs: 1000,
    termGraceMs: 30,
    killGraceMs: 30,
  });
  assert.equal(run.exitCode, 0, JSON.stringify(run));
  assert.equal(run.timeout.ok, true);
  assert.deepEqual(signals, []);
  assert.equal(pauseCount >= 1, true);
  assert.equal(resumeCount >= 1, true);
  assert.match(stdoutText, /queued backpressure/u);
  assert.equal(stderrWrites >= 2, true);
});

test('C4 RTK runner records a post-close writer error without signaling the closed child PGID', async (t) => {
  const runner = await import(RUNNER_PATH);
  const tmpParent = makeTempParent(t);
  const child = new EventEmitter();
  child.pid = 424243;
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  const stderr = new EventEmitter();
  let emitted = false;
  stderr.write = (chunk) => {
    if (!emitted && String(chunk).includes('"type":"RTK_GRAPH_EXITED"')) {
      emitted = true;
      queueMicrotask(() => stderr.emit('error', new Error('INJECTED_POST_CLOSE_WRITER_FAILURE')));
    }
    return true;
  };
  const signals = [];
  const fakeIdentity = { pid: child.pid, pgid: child.pid, startIdentity: 'closed-start', executable: process.execPath };
  const validTap = [
    'TAP version 13',
    'ok 1 - child already closed',
    '1..1',
    '# tests 1',
    '# pass 1',
    '# fail 0',
    '# cancelled 0',
    '# skipped 0',
    '# todo 0',
    '',
  ].join('\n');
  const run = await runner.runRtkTestGraph({
    plan: { testFiles: ['post-close-writer.test.js'] },
    tmpParent,
    stdout: makeWriter(),
    stderr,
    spawnImpl: () => {
      queueMicrotask(() => {
        child.stdout.end(validTap);
        child.stderr.end();
        child.emit('close', 0, null);
      });
      return child;
    },
    signalProcessGroup: (_pgid, signal) => { signals.push(signal); return { ok: true, code: `TEST_SIGNAL_${signal}` }; },
    inspectProcessGroup: () => ({ ok: true, complete: true, status: 'AVAILABLE', rows: [] }),
    readProcessIdentity: () => ({ ok: true, complete: true, status: 'AVAILABLE', identity: fakeIdentity }),
    heartbeatIntervalMs: 20,
    wallTimeoutMs: 1000,
    noProgressTimeoutMs: 1000,
    termGraceMs: 30,
    killGraceMs: 30,
  });
  assert.equal(run.exitCode, 1);
  assert.match(run.streamFailure.message, /INJECTED_POST_CLOSE_WRITER_FAILURE/u);
  assert.deepEqual(signals, []);
  assert.equal(run.cleanup.ok, true);
  assert.equal(fs.existsSync(run.lease.root), false);
});

test('C4 RTK runner deadlines and emitted elapsed time use the injected monotonic clock', async (t) => {
  const runner = await import(RUNNER_PATH);
  const tmpParent = makeTempParent(t);
  const originalDateNow = Date.now;
  const makeChild = (pid) => {
    const child = new EventEmitter();
    child.pid = pid;
    child.stdout = new PassThrough();
    child.stderr = new PassThrough();
    return child;
  };
  const identityFor = (child) => ({ pid: child.pid, pgid: child.pid, startIdentity: `clock-${child.pid}`, executable: process.execPath });
  const validTap = 'TAP version 13\nok 1 - monotonic clock\n1..1\n# tests 1\n# pass 1\n# fail 0\n# cancelled 0\n# skipped 0\n# todo 0\n';
  try {
    const forwardChild = makeChild(424244);
    const forwardLease = runner.createOwnedTmpLease({ tmpParent });
    const forwardStderr = makeWriter();
    let wallReads = 0;
    Date.now = () => (wallReads++ === 0 ? 1000 : 10 ** 12);
    const forward = await runner.runRtkTestGraph({
      plan: { testFiles: ['monotonic-forward.test.js'] },
      tmpParent,
      createLease: () => forwardLease,
      stdout: makeWriter(),
      stderr: forwardStderr,
      spawnImpl: () => {
        setTimeout(() => {
          forwardChild.stdout.end(validTap);
          forwardChild.stderr.end();
          forwardChild.emit('close', 0, null);
        }, 80);
        return forwardChild;
      },
      inspectProcessGroup: () => ({ ok: true, complete: true, status: 'AVAILABLE', rows: [] }),
      readProcessIdentity: () => ({ ok: true, complete: true, status: 'AVAILABLE', identity: identityFor(forwardChild) }),
      monotonicNow: () => performance.now(),
      heartbeatIntervalMs: 20,
      wallTimeoutMs: 500,
      noProgressTimeoutMs: 500,
      termGraceMs: 30,
      killGraceMs: 30,
    });
    assert.equal(forward.exitCode, 0, JSON.stringify(forward));
    assert.equal(forward.timeout.ok, true);
    const elapsed = forwardStderr.value().split('\n')
      .filter((line) => line.startsWith('RTK_GRAPH_EVENT='))
      .map((line) => JSON.parse(line.slice('RTK_GRAPH_EVENT='.length)).elapsedMs);
    assert.equal(elapsed.every((value) => Number.isFinite(value) && value >= 0), true);
    assert.deepEqual(elapsed, [...elapsed].sort((left, right) => left - right));

    for (const [timeoutField, expectedCode, pid] of [
      ['wallTimeoutMs', 'RTK_GRAPH_WALL_TIMEOUT', 424245],
      ['noProgressTimeoutMs', 'RTK_GRAPH_NO_PROGRESS_TIMEOUT', 424246],
    ]) {
      const child = makeChild(pid);
      const lease = runner.createOwnedTmpLease({ tmpParent });
      const signals = [];
      let closed = false;
      let reversedWall = 10 ** 12;
      Date.now = () => reversedWall--;
      const close = (status, signal) => {
        if (closed) return;
        closed = true;
        child.stdout.end();
        child.stderr.end();
        child.emit('close', status, signal);
      };
      const safety = setTimeout(() => close(0, null), 300);
      const deadlines = await runner.runRtkTestGraph({
        plan: { testFiles: ['monotonic-deadline.test.js'] },
        tmpParent,
        createLease: () => lease,
        stdout: makeWriter(),
        stderr: makeWriter(),
        spawnImpl: () => child,
        inspectProcessGroup: () => ({ ok: true, complete: true, status: 'AVAILABLE', rows: [] }),
        readProcessIdentity: () => ({ ok: true, complete: true, status: 'AVAILABLE', identity: identityFor(child) }),
        signalProcessGroup: (_pgid, signal) => {
          signals.push(signal);
          if (signal === 'SIGTERM') queueMicrotask(() => close(null, 'SIGTERM'));
          return { ok: true, code: `TEST_SIGNAL_${signal}` };
        },
        monotonicNow: () => performance.now(),
        heartbeatIntervalMs: 20,
        wallTimeoutMs: timeoutField === 'wallTimeoutMs' ? 60 : 1000,
        noProgressTimeoutMs: timeoutField === 'noProgressTimeoutMs' ? 60 : 1000,
        termGraceMs: 30,
        killGraceMs: 30,
      });
      clearTimeout(safety);
      assert.equal(deadlines.timeout.code, expectedCode);
      assert.deepEqual(signals, ['SIGTERM']);
      assert.equal(deadlines.cleanup.ok, true);
    }
  } finally {
    Date.now = originalDateNow;
  }
});

test('C4 RTK runner process probes are bounded and thrown probes preserve verified lease policy', async (t) => {
  const runner = await import(RUNNER_PATH);
  assert.equal(typeof runner.inspectRtkProcessIdentity, 'function', 'RTK_BOUNDED_IDENTITY_PROBE_EXPORT_MISSING');
  assert.equal(typeof runner.inspectRtkProcessGroup, 'function', 'RTK_BOUNDED_GROUP_PROBE_EXPORT_MISSING');
  const timeoutError = Object.assign(new Error('probe timed out'), { code: 'ETIMEDOUT' });
  const optionsSeen = [];
  const timedOut = (_command, _args, options) => {
    optionsSeen.push(options);
    return { status: null, stdout: '', stderr: '', error: timeoutError };
  };
  const identityTimeout = runner.inspectRtkProcessIdentity(12345, { spawnSyncImpl: timedOut });
  const groupTimeout = runner.inspectRtkProcessGroup(12345, { spawnSyncImpl: timedOut });
  assert.equal(identityTimeout.ok, false);
  assert.equal(groupTimeout.ok, false);
  assert.match(`${identityTimeout.code}|${groupTimeout.code}`, /ETIMEDOUT/u);
  assert.equal(optionsSeen.every((options) => options.timeout > 0 && options.timeout <= 2000), true);
  assert.equal(optionsSeen.every((options) => options.maxBuffer > 0 && options.maxBuffer <= 1024 * 1024), true);

  const tmpParent = makeTempParent(t);
  const runThrownCase = async ({ pid, groupThrows }) => {
    const child = new EventEmitter();
    child.pid = pid;
    child.stdout = new PassThrough();
    child.stderr = new PassThrough();
    const signals = [];
    queueMicrotask(() => {
      child.stdout.end('TAP version 13\nok 1 - probe throw\n1..1\n# tests 1\n# pass 1\n# fail 0\n# cancelled 0\n# skipped 0\n# todo 0\n');
      child.stderr.end();
      child.emit('close', 0, null);
    });
    const run = await runner.runRtkTestGraph({
      plan: { testFiles: ['probe-throw.test.js'] },
      tmpParent,
      stdout: makeWriter(),
      stderr: makeWriter(),
      spawnImpl: () => child,
      readProcessIdentity: () => { throw new Error('INJECTED_IDENTITY_PROBE_THROW'); },
      inspectProcessGroup: () => {
        if (groupThrows) throw new Error('INJECTED_GROUP_PROBE_THROW');
        return { ok: true, complete: true, status: 'AVAILABLE', rows: [] };
      },
      signalProcessGroup: (_pgid, signal) => { signals.push(signal); return { ok: true }; },
      heartbeatIntervalMs: 20,
      wallTimeoutMs: 1000,
      noProgressTimeoutMs: 1000,
      termGraceMs: 30,
      killGraceMs: 30,
    });
    return { run, signals };
  };
  const independentlyAbsent = await runThrownCase({ pid: 424247, groupThrows: false });
  assert.equal(independentlyAbsent.run.exitCode, 1);
  assert.deepEqual(independentlyAbsent.signals, []);
  assert.equal(independentlyAbsent.run.processGroupCleanup.ok, true);
  assert.equal(independentlyAbsent.run.cleanup.ok, true);
  assert.equal(fs.existsSync(independentlyAbsent.run.lease.root), false);

  const indeterminate = await runThrownCase({ pid: 424248, groupThrows: true });
  try {
    assert.equal(indeterminate.run.exitCode, 1);
    assert.deepEqual(indeterminate.signals, []);
    assert.equal(indeterminate.run.processGroupCleanup.ok, false);
    assert.equal(indeterminate.run.cleanup.ok, false);
    assert.equal(fs.existsSync(indeterminate.run.lease.root), true);
  } finally {
    runner.removeNoFollow(indeterminate.run.lease.root);
  }
});

test('C4 RTK runner wall deadline escalates TERM to KILL and cleans the owned lease after terminal exit', async (t) => {
  const runner = await import(RUNNER_PATH);
  const tmpParent = makeTempParent(t);
  const stdout = makeWriter();
  const stderr = makeWriter();
  const child = new EventEmitter();
  child.pid = 424242;
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  const signals = [];
  const fakeIdentity = { pid: child.pid, pgid: child.pid, startIdentity: 'test-start', executable: process.execPath };
  const run = await runner.runRtkTestGraph({
    plan: { testFiles: ['never-finishes.test.js'] },
    tmpParent,
    stdout,
    stderr,
    spawnImpl: () => child,
    signalProcessGroup: (_pgid, signal) => {
      signals.push(signal);
      if (signal === 'SIGKILL') {
        queueMicrotask(() => {
          child.emit('exit', null, 'SIGKILL');
          child.stdout.end();
          child.stderr.end();
          child.emit('close', null, 'SIGKILL');
        });
      }
      return { ok: true, code: `TEST_SIGNAL_${signal}` };
    },
    inspectProcessGroup: () => ({ ok: true, complete: true, status: 'AVAILABLE', rows: [] }),
    readProcessIdentity: () => ({ ok: true, complete: true, status: 'AVAILABLE', identity: fakeIdentity }),
    heartbeatIntervalMs: 20,
    wallTimeoutMs: 60,
    noProgressTimeoutMs: 1000,
    termGraceMs: 40,
    killGraceMs: 80,
  });
  assert.equal(run.exitCode, 1);
  assert.equal(run.timeout.code, 'RTK_GRAPH_WALL_TIMEOUT');
  assert.deepEqual(signals, ['SIGTERM', 'SIGKILL']);
  assert.equal(run.cleanup.ok, true);
  assert.equal(fs.existsSync(run.lease.root), false);
});

test('C4 RTK runner handles spawn stream and reused-leader failures without unsafe cleanup', async (t) => {
  const runner = await import(RUNNER_PATH);
  const tmpParent = makeTempParent(t);
  const spawnFailure = await runner.runRtkTestGraph({
    plan: { testFiles: ['not-started.test.js'] },
    tmpParent,
    stdout: makeWriter(),
    stderr: makeWriter(),
    spawnImpl: () => spawn('/definitely/missing/rtk-node', []),
    wallTimeoutMs: 500,
    noProgressTimeoutMs: 200,
    termGraceMs: 30,
    killGraceMs: 30,
  });
  assert.equal(spawnFailure.exitCode, 1);
  assert.equal(spawnFailure.cleanup.ok, true);
  assert.equal(spawnFailure.processGroupCleanup.code, 'RTK_NO_CHILD_PROCESS_SPAWN_PROVEN');
  assert.equal(fs.existsSync(spawnFailure.lease.root), false);

  const fake = writeFakeContract(tmpParent, `
    const test = require('node:test');
    test('stream failure child', async () => new Promise((resolve) => setTimeout(resolve, 1000)));
  `);
  const streamFailure = await runner.runRtkTestGraph({
    plan: { testFiles: [fake] },
    tmpParent,
    stdout: { write() { throw new Error('INJECTED_WRITER_FAILURE'); } },
    stderr: makeWriter(),
    wallTimeoutMs: 2000,
    noProgressTimeoutMs: 1000,
    heartbeatIntervalMs: 20,
    termGraceMs: 50,
    killGraceMs: 100,
  });
  assert.equal(streamFailure.exitCode, 1);
  assert.match(streamFailure.streamFailure.message, /INJECTED_WRITER_FAILURE/u);
  assert.equal(streamFailure.cleanup.ok, true);
  assert.equal(fs.existsSync(streamFailure.lease.root), false);

  const asyncWriter = new EventEmitter();
  asyncWriter.write = () => true;
  const asyncWriterRun = runner.runRtkTestGraph({
    plan: { testFiles: [fake] },
    tmpParent,
    stdout: asyncWriter,
    stderr: makeWriter(),
    wallTimeoutMs: 2000,
    noProgressTimeoutMs: 1500,
    heartbeatIntervalMs: 20,
    termGraceMs: 50,
    killGraceMs: 100,
  });
  let asyncWriterListenerAttached = false;
  try {
    await waitFor(() => asyncWriter.listenerCount('error') > 0, { timeoutMs: 250, intervalMs: 10 });
    asyncWriterListenerAttached = true;
    asyncWriter.emit('error', new Error('INJECTED_ASYNC_WRITER_FAILURE'));
  } catch {
    // Assertion below preserves a deterministic RED without emitting an
    // unhandled EventEmitter error against the pre-repair implementation.
  }
  const asyncWriterFailure = await asyncWriterRun;
  assert.equal(asyncWriterListenerAttached, true, 'RTK_ASYNC_WRITER_ERROR_LISTENER_MISSING');
  assert.equal(asyncWriterFailure.exitCode, 1);
  assert.match(asyncWriterFailure.streamFailure.message, /INJECTED_ASYNC_WRITER_FAILURE/u);
  assert.equal(asyncWriterFailure.cleanup.ok, true);
  assert.equal(fs.existsSync(asyncWriterFailure.lease.root), false);

  const child = new EventEmitter();
  child.pid = 434343;
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  const oldIdentity = { pid: child.pid, pgid: child.pid, startIdentity: 'old-start', executable: process.execPath };
  const newIdentity = { ...oldIdentity, startIdentity: 'reused-start' };
  let identityReads = 0;
  const unsafeSignals = [];
  const reused = await runner.runRtkTestGraph({
    plan: { testFiles: ['never-finishes.test.js'] },
    tmpParent,
    stdout: makeWriter(),
    stderr: makeWriter(),
    spawnImpl: () => child,
    inspectProcessGroup: () => ({ ok: true, complete: true, status: 'AVAILABLE', rows: [] }),
    readProcessIdentity: () => ({ ok: true, complete: true, status: 'AVAILABLE', identity: identityReads++ === 0 ? oldIdentity : newIdentity }),
    signalProcessGroup: (_pgid, signal) => { unsafeSignals.push(signal); return { ok: true }; },
    wallTimeoutMs: 40,
    noProgressTimeoutMs: 1000,
    heartbeatIntervalMs: 20,
    termGraceMs: 30,
    killGraceMs: 40,
  });
  try {
    assert.equal(reused.exitCode, 1);
    assert.deepEqual(unsafeSignals, []);
    assert.equal(reused.cleanup.ok, false);
    assert.match(reused.cleanup.failures.join(','), /PROCESS_GROUP_UNPROVEN/u);
  } finally {
    runner.removeNoFollow(reused.lease.root);
  }
});

test('C4 RTK runner no-progress deadline fails closed even while its own heartbeat remains live', async (t) => {
  const runner = await import(RUNNER_PATH);
  const tmpParent = makeTempParent(t);
  const fake = writeFakeContract(tmpParent, `
    const test = require('node:test');
    test('silent work', async () => {
      await new Promise((resolve) => setTimeout(resolve, 1000));
    });
  `);
  const stdout = makeWriter();
  const stderr = makeWriter();
  const run = await runner.runRtkTestGraph({
    plan: { testFiles: [fake] },
    tmpParent,
    stdout,
    stderr,
    heartbeatIntervalMs: 20,
    wallTimeoutMs: 2000,
    noProgressTimeoutMs: 80,
    termGraceMs: 50,
    killGraceMs: 100,
  });
  assert.equal(run.exitCode, 1);
  assert.equal(run.timeout.code, 'RTK_GRAPH_NO_PROGRESS_TIMEOUT');
  assert.match(stderr.value(), /"type":"RTK_GRAPH_TIMEOUT"/u);
  assert.equal(run.cleanup.ok, true);
});

test('C4 RTK runner terminates a same-group orphan before removing its owned TMPDIR', async (t) => {
  const runner = await import(RUNNER_PATH);
  const tmpParent = makeTempParent(t);
  const pidLog = path.join(tmpParent, 'orphan.pid');
  t.after(async () => {
    if (fs.existsSync(pidLog)) await stopExactPid(Number(fs.readFileSync(pidLog, 'utf8').trim()));
  });
  const fake = writeFakeContract(tmpParent, `
    const test = require('node:test');
    const fs = require('node:fs');
    const { spawn } = require('node:child_process');
    test('leaves a same-group orphan', async () => {
      const child = spawn(process.execPath, ['-e', 'setTimeout(()=>{},5000)'], { stdio: 'ignore' });
      fs.writeFileSync(${JSON.stringify(pidLog)}, String(child.pid));
      child.unref();
      await new Promise((resolve) => setTimeout(resolve, 120));
    });
  `);
  const run = await runner.runRtkTestGraph({
    plan: { testFiles: [fake] },
    tmpParent,
    stdout: makeWriter(),
    stderr: makeWriter(),
    heartbeatIntervalMs: 20,
    wallTimeoutMs: 5000,
    noProgressTimeoutMs: 2000,
    termGraceMs: 100,
    killGraceMs: 300,
  });
  const orphanPid = Number(fs.readFileSync(pidLog, 'utf8').trim());
  assert.equal(run.exitCode, 0, JSON.stringify(run));
  assert.equal(pidAlive(orphanPid), false, `RTK_ORPHAN_SURVIVED:${orphanPid}`);
  assert.equal(run.processGroupCleanup.ok, true);
  assert.equal(fs.existsSync(run.lease.root), false);
});

test('C4 RTK runner rejects output beyond bounded retained diagnostics', async (t) => {
  const runner = await import(RUNNER_PATH);
  const tmpParent = makeTempParent(t);
  const fake = writeFakeContract(tmpParent, `
    const test = require('node:test');
    test('large diagnostic', () => console.log('x'.repeat(8192)));
  `);
  const stderr = makeWriter();
  const run = await runner.runRtkTestGraph({
    plan: { testFiles: [fake] },
    tmpParent,
    stdout: makeWriter(),
    stderr,
    retainedOutputBytes: 1024,
    heartbeatIntervalMs: 20,
    wallTimeoutMs: 5000,
    noProgressTimeoutMs: 2000,
    termGraceMs: 100,
    killGraceMs: 100,
  });
  assert.equal(run.exitCode, 1);
  assert.equal(run.outputRetention.ok, false);
  assert.match(stderr.value(), /RTK_GRAPH_OUTPUT_RETENTION_EXCEEDED/u);
});

test('C4 RTK runner leases an owned TMPDIR and cleans child C5V2 residue', async (t) => {
  const runner = await import(RUNNER_PATH);
  const tmpParent = makeTempParent(t);
  const inheritedTmp = makeTempParent(t, 'rtk-runner-inherited-');
  const fake = writeFakeContract(tmpParent, `
    const test = require('node:test');
    const assert = require('node:assert/strict');
    const fs = require('node:fs');
    const os = require('node:os');
    const path = require('node:path');
    test('writes owned residue', () => {
      assert.notEqual(fs.realpathSync(os.tmpdir()), fs.realpathSync(process.env.INHERITED_TMPDIR));
      const residue = fs.mkdtempSync(path.join(os.tmpdir(), 'c5v2-runner-owned-residue-'));
      fs.writeFileSync(path.join(residue, 'artifact.json'), JSON.stringify({ ok: true }));
      console.log('CHILD_TMPDIR=' + fs.realpathSync(os.tmpdir()));
    });
  `);
  const stdout = makeWriter();
  const stderr = makeWriter();
  const run = await runner.runRtkTestGraph({
    plan: { testFiles: [fake] },
    tmpParent,
    env: {
      ...process.env,
      TMPDIR: inheritedTmp,
      TMP: inheritedTmp,
      TEMP: inheritedTmp,
      INHERITED_TMPDIR: inheritedTmp,
    },
    stdout,
    stderr,
  });
  assert.equal(run.exitCode, 0, `${stdout.value()}\n${stderr.value()}`);
  assert.equal(run.cleanup.ok, true);
  assert.equal(fs.existsSync(run.lease.root), false);
  assert.deepEqual(fs.readdirSync(inheritedTmp), []);
  assert.match(stdout.value(), /CHILD_TMPDIR=.*rtk-owned-tmpdir-/u);
});

test('C4 RTK runner cleanup removes symlink descendants without following escape targets', async (t) => {
  const runner = await import(RUNNER_PATH);
  const tmpParent = makeTempParent(t);
  const outside = makeTempParent(t, 'rtk-runner-outside-target-');
  const outsideFile = path.join(outside, 'must-survive.txt');
  fs.writeFileSync(outsideFile, 'outside target');
  const fake = writeFakeContract(tmpParent, `
    const test = require('node:test');
    const fs = require('node:fs');
    const os = require('node:os');
    const path = require('node:path');
    test('creates symlink escape', () => {
      fs.symlinkSync(process.env.OUTSIDE_TARGET, path.join(os.tmpdir(), 'c5v2-symlink-escape'));
      fs.writeFileSync(path.join(os.tmpdir(), 'c5v2-plain-file'), 'plain');
    });
  `);
  const stdout = makeWriter();
  const stderr = makeWriter();
  const run = await runner.runRtkTestGraph({
    plan: { testFiles: [fake] },
    tmpParent,
    env: { ...process.env, OUTSIDE_TARGET: outside },
    stdout,
    stderr,
  });
  assert.equal(run.exitCode, 0, `${stdout.value()}\n${stderr.value()}`);
  assert.equal(fs.existsSync(run.lease.root), false);
  assert.equal(fs.readFileSync(outsideFile, 'utf8'), 'outside target');
});

test('C4 RTK runner fails closed when owned TMPDIR cleanup cannot be proven', async (t) => {
  const runner = await import(RUNNER_PATH);
  const tmpParent = makeTempParent(t);
  const fake = writeFakeContract(tmpParent, `
    const test = require('node:test');
    test('passes before cleanup failure', () => {});
  `);
  const stdout = makeWriter();
  const stderr = makeWriter();
  const run = await runner.runRtkTestGraph({
    plan: { testFiles: [fake] },
    tmpParent,
    stdout,
    stderr,
    cleanupLease: (lease) => ({
      ok: false,
      failures: ['INJECTED_CLEANUP_FAILURE'],
      root: lease.root,
      residue: { count: 1, bytes: 1, entries: [lease.root] },
    }),
  });
  try {
    assert.equal(run.exitCode, 1);
    assert.match(stderr.value(), /RTK_TMPDIR_CLEANUP_FAILED/u);
    assert.match(stderr.value(), /INJECTED_CLEANUP_FAILURE/u);
  } finally {
    runner.removeNoFollow(run.lease.root);
  }
});

test('C4 RTK runner reports unreadable cleanup residue without throwing', async (t) => {
  const runner = await import(RUNNER_PATH);
  const tmpParent = makeTempParent(t);
  const fake = writeFakeContract(tmpParent, `
    const test = require('node:test');
    test('passes before unreadable cleanup residue', () => {});
  `);
  const lease = runner.createOwnedTmpLease({ tmpParent });
  const blockedDir = path.join(lease.root, 'c5v2-unreadable-residue');
  fs.mkdirSync(blockedDir);
  fs.writeFileSync(path.join(blockedDir, 'artifact.json'), JSON.stringify({ leaked: true }));
  const originalReaddirSync = fs.readdirSync;
  const stdout = makeWriter();
  const stderr = makeWriter();
  try {
    fs.readdirSync = function patchedReaddirSync(targetPath, options) {
      if (path.resolve(String(targetPath)) === blockedDir) {
        const error = new Error('injected traversal denial');
        error.code = 'EACCES';
        throw error;
      }
      return originalReaddirSync.call(this, targetPath, options);
    };
    const run = await runner.runRtkTestGraph({
      plan: { testFiles: [fake] },
      tmpParent,
      stdout,
      stderr,
      createLease: () => lease,
      cleanupLease: (ownedLease) => runner.cleanupOwnedTmpLease(ownedLease, {
        removeImpl: () => {
          const error = new Error('injected remove denial');
          error.code = 'EACCES';
          throw error;
        },
      }),
    });
    assert.equal(run.exitCode, 1);
    assert.equal(run.cleanup.ok, false);
    assert.match(stderr.value(), /RTK_TMPDIR_CLEANUP_FAILED/u);
    assert.match(stderr.value(), /RTK_TMPDIR_CLEANUP_REMOVE_FAILED:EACCES/u);
    assert.match(stderr.value(), /RTK_TMPDIR_RESIDUE_REMAINS/u);
    assert.match(stderr.value(), /RTK_TMPDIR_RESIDUE_SUMMARY_READDIR_FAILED:EACCES/u);
    assert.equal(run.cleanup.residue.errors.length, 1);
    assert.equal(run.cleanup.residue.errors[0].op, 'readdir');
    assert.equal(run.cleanup.residue.errors[0].path, blockedDir);
    assert.equal(run.cleanup.residue.count >= 2, true);
    assert.equal(fs.existsSync(lease.root), true);
  } finally {
    fs.readdirSync = originalReaddirSync;
    runner.removeNoFollow(lease.root);
  }
});
