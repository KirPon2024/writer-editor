#!/usr/bin/env node

const PASS = 'PASS';
const DENY = 'DENY';

function oracle(input) {
  if (input.closedRequest !== true) return { decision: DENY, code: 'KEYSET_INVALID' };
  if (input.expectedClosed !== true) return { decision: DENY, code: 'KEYSET_INVALID' };
  if (input.featureEnabled !== true) return { decision: DENY, code: 'FEATURE_DISABLED' };
  if (input.observerPresent !== true) return { decision: DENY, code: 'REVISION_OBSERVER_REQUIRED' };
  if (input.authorityDecision !== 'ALLOW' || input.mayWrite !== false) return { decision: DENY, code: 'AUTHORITY_NOT_GRANTED' };
  if (input.dirtyState !== 'CLEAN') return { decision: DENY, code: 'DIRTY_DOCUMENT_REJECTED' };
  if (input.beforeMatchesExpected !== true || input.afterMatchesExpected !== true || input.beforeAfterStable !== true) {
    return { decision: DENY, code: 'REVISION_STALE' };
  }
  if (input.manifestPresent !== true || input.manifestParseable !== true || input.sceneOrderArray !== true) {
    return { decision: DENY, code: 'PROJECT_MANIFEST_REQUIRED' };
  }
  if (input.manifestProjectMatches !== true || input.manifestRootMatches !== true) {
    return { decision: DENY, code: 'REVISION_STALE' };
  }
  if (input.allBindingsFileSafe !== true || input.noUnsupportedDeclaredSources !== true) {
    return { decision: DENY, code: 'SOURCE_FILE_UNSUPPORTED' };
  }
  if (input.allFilesPresent !== true) return { decision: DENY, code: 'SOURCE_FILE_MISSING' };
  if (input.digestRecomputedFromBytes !== true || input.p0aAccepts !== true) return { decision: DENY, code: 'P0A_REJECTED' };
  return { decision: PASS, code: 'SOURCE_SNAPSHOT_READY' };
}

function baseCase(overrides = {}) {
  return {
    closedRequest: true,
    expectedClosed: true,
    featureEnabled: true,
    observerPresent: true,
    authorityDecision: 'ALLOW',
    mayWrite: false,
    dirtyState: 'CLEAN',
    beforeMatchesExpected: true,
    afterMatchesExpected: true,
    beforeAfterStable: true,
    manifestPresent: true,
    manifestParseable: true,
    sceneOrderArray: true,
    manifestProjectMatches: true,
    manifestRootMatches: true,
    allBindingsFileSafe: true,
    noUnsupportedDeclaredSources: true,
    allFilesPresent: true,
    digestRecomputedFromBytes: true,
    p0aAccepts: true,
    ...overrides,
  };
}

function buildFiniteCases() {
  const cases = [];
  for (const featureEnabled of [true, false]) {
    for (const closedRequest of [true, false]) {
      for (const authorityDecision of ['ALLOW', 'UNKNOWN']) {
        for (const dirtyState of ['CLEAN', 'DIRTY', 'ABSTAIN']) {
          for (const beforeAfterStable of [true, false]) {
            cases.push(baseCase({ featureEnabled, closedRequest, authorityDecision, dirtyState, beforeAfterStable }));
          }
        }
      }
    }
  }
  return cases;
}

function buildHostileCases() {
  return [
    baseCase({ closedRequest: false }),
    baseCase({ expectedClosed: false }),
    baseCase({ featureEnabled: false }),
    baseCase({ observerPresent: false }),
    baseCase({ authorityDecision: 'UNKNOWN' }),
    baseCase({ authorityDecision: 'ABSTAIN' }),
    baseCase({ authorityDecision: 'CONFLICTING' }),
    baseCase({ mayWrite: true }),
    baseCase({ dirtyState: 'DIRTY' }),
    baseCase({ dirtyState: 'UNKNOWN' }),
    baseCase({ beforeMatchesExpected: false }),
    baseCase({ afterMatchesExpected: false }),
    baseCase({ beforeAfterStable: false }),
    baseCase({ manifestPresent: false }),
    baseCase({ manifestProjectMatches: false }),
    baseCase({ allBindingsFileSafe: false }),
    baseCase({ allFilesPresent: false }),
    baseCase({ digestRecomputedFromBytes: false }),
  ];
}

function mutatedOracle(name, input) {
  const mutant = { ...input };
  if (name === 'drops_request_keyset') mutant.closedRequest = true;
  if (name === 'drops_expected_keyset') mutant.expectedClosed = true;
  if (name === 'drops_feature_flag') mutant.featureEnabled = true;
  if (name === 'drops_observer_required') mutant.observerPresent = true;
  if (name === 'trusts_unknown_authority') mutant.authorityDecision = 'ALLOW';
  if (name === 'allows_may_write') mutant.mayWrite = false;
  if (name === 'allows_dirty') mutant.dirtyState = 'CLEAN';
  if (name === 'drops_before_expected_match') mutant.beforeMatchesExpected = true;
  if (name === 'drops_after_expected_match') mutant.afterMatchesExpected = true;
  if (name === 'drops_before_after_stability') mutant.beforeAfterStable = true;
  if (name === 'allows_path_traversal') mutant.allBindingsFileSafe = true;
  if (name === 'trusts_caller_digest') mutant.digestRecomputedFromBytes = true;
  return oracle(mutant);
}

export function runBlackBoxTrustedSourceSnapshotV1Model() {
  const finite = buildFiniteCases();
  const hostile = buildHostileCases();
  const allCases = [...finite, ...hostile];
  const failures = [];

  for (const [index, item] of finite.entries()) {
    const result = oracle(item);
    const shouldPass = item.featureEnabled === true
      && item.closedRequest === true
      && item.expectedClosed === true
      && item.observerPresent === true
      && item.authorityDecision === 'ALLOW'
      && item.mayWrite === false
      && item.dirtyState === 'CLEAN'
      && item.beforeMatchesExpected === true
      && item.afterMatchesExpected === true
      && item.beforeAfterStable === true;
    if (shouldPass && result.decision !== PASS) failures.push({ type: 'finite_false_red', index, result });
    if (!shouldPass && result.decision === PASS) failures.push({ type: 'finite_false_green', index, result });
  }
  for (const [index, item] of hostile.entries()) {
    const result = oracle(item);
    if (result.decision === PASS) failures.push({ type: 'hostile_false_green', index, result });
  }

  const mutants = [
    'drops_request_keyset',
    'drops_expected_keyset',
    'drops_feature_flag',
    'drops_observer_required',
    'trusts_unknown_authority',
    'allows_may_write',
    'allows_dirty',
    'drops_before_expected_match',
    'drops_after_expected_match',
    'drops_before_after_stability',
    'allows_path_traversal',
    'trusts_caller_digest',
  ];
  const survivors = [];
  for (const name of mutants) {
    const killed = allCases.some((item) => oracle(item).decision === DENY && mutatedOracle(name, item).decision === PASS);
    if (!killed) survivors.push(name);
  }

  return {
    ok: failures.length === 0 && survivors.length === 0,
    finiteCases: finite.length,
    hostileCases: hostile.length,
    semanticMutants: mutants.length,
    survivors: survivors.length,
    survivorNames: survivors,
    failures: failures.length,
    failureDetails: failures,
    skips: 0,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const result = runBlackBoxTrustedSourceSnapshotV1Model();
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) process.exitCode = 1;
}
