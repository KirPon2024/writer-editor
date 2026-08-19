const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { spawnSync } = require('node:child_process');

const REPO_ROOT = process.cwd();
const MODULE_PATH = path.join(REPO_ROOT, 'scripts/ops/yalken-scientific-assurance-r1.mjs');

let modulePromise;

function loadModule() {
  if (!modulePromise) modulePromise = import(pathToFileURL(MODULE_PATH).href);
  return modulePromise;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

async function loadDocuments() {
  const { DEFAULT_PATHS } = await loadModule();
  return {
    sourceBindings: require(path.join(REPO_ROOT, DEFAULT_PATHS.sourceBindings)),
    findingMap: require(path.join(REPO_ROOT, DEFAULT_PATHS.findingMap)),
    programDag: require(path.join(REPO_ROOT, DEFAULT_PATHS.programDag)),
    scientificContracts: require(path.join(REPO_ROOT, DEFAULT_PATHS.scientificContracts)),
  };
}

async function evaluateMutated(mutator) {
  const { evaluateScientificAssuranceProgram } = await loadModule();
  const documents = clone(await loadDocuments());
  mutator(documents);
  return evaluateScientificAssuranceProgram({ repoRoot: REPO_ROOT, documents });
}

test('ASSURANCE_R1_BASELINE: complete audit map, DAG and scientific lab pass with bounded evidence ceiling', async () => {
  const { evaluateScientificAssuranceProgram } = await loadModule();
  const result = evaluateScientificAssuranceProgram({ repoRoot: REPO_ROOT });
  assert.equal(result.ok, true, JSON.stringify(result.failures));
  assert.equal(result.YALKEN_SCIENTIFIC_ASSURANCE_R1_OK, 1);
  assert.equal(result.findingCount, 66);
  assert.equal(result.issueCount, 16);
  assert.ok(result.stageCount >= 24);
  assert.equal(result.topologicalStageCount, result.stageCount);
  assert.equal(result.nextContour, 'E0_RUNNER_SAFETY_QUARANTINE');
  assert.equal(result.evidenceCeiling, 'MODEL_AND_CONTRACT_ONLY');
  assert.equal(result.programVerdict, 'NEEDS_MORE_EVIDENCE');
  assert.equal(result.profileVerdicts.WRITER_CORE, 'NEEDS_MORE_EVIDENCE');
  assert.equal(result.profileVerdicts.WORD_ROUNDTRIP, 'BLOCKED');
  assert.equal(result.profileVerdicts.PACKAGED_RELEASE_SECURITY, 'NOT_READY');
});

test('ASSURANCE_R1_CLI: JSON mode is non-mutating and emits the same bounded verdict', () => {
  const result = spawnSync(process.execPath, ['scripts/ops/yalken-scientific-assurance-r1.mjs', '--json'], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.ok, true);
  assert.equal(payload.findingCount, 66);
  assert.equal(payload.scientificLab.mutation.survived, 0);
  assert.equal(payload.scientificLab.mutation.class, 'PROGRAM_MODEL_AND_VALIDATOR_MUTANTS_NOT_PRODUCT_IMPLEMENTATION_MUTANTS');
});

test('ASSURANCE_R1_SOURCE_01: active authority digest drift fails closed', async () => {
  const result = await evaluateMutated((documents) => {
    documents.sourceBindings.repositoryAuthority[0].sha256 = '0'.repeat(64);
  });
  assert.equal(result.ok, false);
  assert.ok(result.failures.includes('E_ASSURANCE_AUTHORITY_DIGEST_DRIFT'));
});

test('ASSURANCE_R1_SOURCE_02: external evidence cannot acquire instruction authority', async () => {
  const result = await evaluateMutated((documents) => {
    documents.sourceBindings.sourcePolicy.externalEvidenceHasInstructionAuthority = true;
  });
  assert.equal(result.ok, false);
  assert.ok(result.failures.includes('E_ASSURANCE_EXTERNAL_AUTHORITY_FORBIDDEN'));
});

test('ASSURANCE_R1_FINDING_01: missing source finding is rejected', async () => {
  const result = await evaluateMutated((documents) => {
    documents.findingMap.requiredFindingSets.V7.pop();
  });
  assert.equal(result.ok, false);
  assert.ok(result.failures.includes('E_ASSURANCE_FINDING_DENOMINATOR_INVALID'));
  assert.ok(result.failures.includes('E_ASSURANCE_ISSUE_FINDING_UNKNOWN_OR_MISSING'));
});

test('ASSURANCE_R1_FINDING_02: duplicate source finding is rejected', async () => {
  const result = await evaluateMutated((documents) => {
    documents.findingMap.requiredFindingSets.V7[39] = documents.findingMap.requiredFindingSets.V7[0];
  });
  assert.equal(result.ok, false);
  assert.ok(result.failures.includes('E_ASSURANCE_REQUIRED_FINDING_DUPLICATE'));
});

test('ASSURANCE_R1_FINDING_03: finding routed to a different issue is rejected', async () => {
  const result = await evaluateMutated((documents) => {
    documents.findingMap.routing[0].issueId = 'I02_RUNNER_AND_EVIDENCE_TRUTH';
  });
  assert.equal(result.ok, false);
  assert.ok(result.failures.includes('E_ASSURANCE_ROUTING_ISSUE_MISMATCH'));
});

test('ASSURANCE_R1_DAG_01: unknown dependency is rejected', async () => {
  const result = await evaluateMutated((documents) => {
    documents.programDag.stages[1].dependsOn = ['DOES_NOT_EXIST'];
  });
  assert.equal(result.ok, false);
  assert.ok(result.failures.includes('E_ASSURANCE_DAG_UNKNOWN_DEPENDENCY'));
});

test('ASSURANCE_R1_DAG_02: cycle is rejected', async () => {
  const result = await evaluateMutated((documents) => {
    documents.programDag.stages[0].dependsOn = ['E0_RUNNER_SAFETY_QUARANTINE'];
  });
  assert.equal(result.ok, false);
  assert.ok(result.failures.includes('E_ASSURANCE_DAG_CYCLE'));
});

test('ASSURANCE_R1_DAG_03: more than one ready mutation contour is rejected', async () => {
  const result = await evaluateMutated((documents) => {
    documents.programDag.stages.find((row) => row.stageId === 'P0_AUTOSAVE_GENERATION').status = 'READY_NEXT';
  });
  assert.equal(result.ok, false);
  assert.ok(result.failures.includes('E_ASSURANCE_READY_NEXT_INVALID'));
});

test('ASSURANCE_R1_DAG_04: Writer core cannot depend on an optional profile', async () => {
  const result = await evaluateMutated((documents) => {
    documents.programDag.stages.find((row) => row.stageId === 'P0_AUTOSAVE_GENERATION').dependsOn.push('A0_ATLAS_INCREMENTAL_EQUIVALENCE');
  });
  assert.equal(result.ok, false);
  assert.ok(result.failures.includes('E_ASSURANCE_PROFILE_BACKEDGE'));
  assert.ok(result.failures.includes('E_ASSURANCE_WRITER_DEPENDS_ON_OPTIONAL'));
});

test('ASSURANCE_R1_CLAIM_01: universal maximum language is rejected', async () => {
  const result = await evaluateMutated((documents) => {
    documents.scientificContracts.claims[0].statement = 'UNIVERSAL_MAXIMUM';
  });
  assert.equal(result.ok, false);
  assert.ok(result.failures.includes('E_ASSURANCE_FORBIDDEN_CLAIM_LANGUAGE'));
});

test('ASSURANCE_R1_CLAIM_02: missing fault envelope is rejected', async () => {
  const result = await evaluateMutated((documents) => {
    documents.scientificContracts.claims[1].faultModelId = '';
  });
  assert.equal(result.ok, false);
  assert.ok(result.failures.includes('E_ASSURANCE_CLAIM_ENVELOPE_MISSING'));
  assert.ok(result.failures.includes('E_ASSURANCE_CLAIM_ENVELOPE_REFERENCE_INVALID'));
});

test('ASSURANCE_R1_CLAIM_03: model evidence cannot promote a physical profile', async () => {
  const result = await evaluateMutated((documents) => {
    documents.scientificContracts.claims.find((row) => row.profileId === 'WORD_ROUNDTRIP').minimumEvidenceClass = 'E1_MODEL';
  });
  assert.equal(result.ok, false);
  assert.ok(result.failures.includes('E_ASSURANCE_MODEL_TO_PHYSICAL_PROMOTION'));
});

test('ASSURANCE_R1_MATH_01: scalar maximum over revisions is rejected', async () => {
  const result = await evaluateMutated((documents) => {
    documents.scientificContracts.revisionAlgebra.scalarMaximumForbidden = false;
  });
  assert.equal(result.ok, false);
  assert.ok(result.failures.includes('E_ASSURANCE_REVISION_ALGEBRA_INVALID'));
});

test('ASSURANCE_R1_MATH_02: early save acknowledgement is rejected', async () => {
  const result = await evaluateMutated((documents) => {
    documents.scientificContracts.saveProtocol.ackPhase = 'ATOMIC_PUBLISH';
  });
  assert.equal(result.ok, false);
  assert.ok(result.failures.includes('E_ASSURANCE_SAVE_PROTOCOL_INVALID'));
});

test('ASSURANCE_R1_MATH_03: zero denominator policy cannot become pass', async () => {
  const result = await evaluateMutated((documents) => {
    documents.scientificContracts.denominatorAlgebra.zeroDenominatorDisposition = 'PASS';
  });
  assert.equal(result.ok, false);
  assert.ok(result.failures.includes('E_ASSURANCE_DENOMINATOR_ALGEBRA_INVALID'));
});

test('ASSURANCE_R1_MATH_04: storage ranking cannot precede hard safety filtering', async () => {
  const result = await evaluateMutated((documents) => {
    documents.scientificContracts.storageBakeoff.rankingAfterHardFilter = false;
  });
  assert.equal(result.ok, false);
  assert.ok(result.failures.includes('E_ASSURANCE_STORAGE_BAKEOFF_INVALID'));
});

test('ASSURANCE_R1_SCOPE_01: optional feature cannot become a Writer blocker', async () => {
  const result = await evaluateMutated((documents) => {
    documents.scientificContracts.optionalFeaturePolicy.writerCoreBlockingForbidden = false;
  });
  assert.equal(result.ok, false);
  assert.ok(result.failures.includes('E_ASSURANCE_OPTIONAL_FEATURE_POLICY_INVALID'));
});

test('ASSURANCE_R1_REALITY_01: stale risk sentinel fails closed instead of pretending closure', async () => {
  const result = await evaluateMutated((documents) => {
    documents.scientificContracts.currentRealityProbes[0].needle = 'THIS_RISK_SENTINEL_DOES_NOT_EXIST';
  });
  assert.equal(result.ok, false);
  assert.ok(result.failures.includes('E_ASSURANCE_CURRENT_REALITY_DRIFT'));
});

test('ASSURANCE_R1_LAB_01: admission algebra exhausts 128 cases and kills every omitted-conjunct mutant', async () => {
  const { evaluateScientificAssuranceProgram } = await loadModule();
  const result = evaluateScientificAssuranceProgram({ repoRoot: REPO_ROOT });
  assert.equal(result.scientificLab.admission.cases, 128);
  assert.equal(result.scientificLab.admission.accepted, 1);
  assert.equal(result.scientificLab.admission.rejected, 127);
  assert.equal(result.scientificLab.admission.singlePredicateMutantsKilled, 7);
});

test('ASSURANCE_R1_LAB_02: partial-order authoring algebra distinguishes saved, protected, captured, risk and divergence', async () => {
  const { buildRevisionGraph, classifyAuthoringState, revisionCovers, projectClean, projectProtected } = await loadModule();
  const graph = buildRevisionGraph();
  assert.equal(revisionCovers(graph, 'r1a', 'r1b'), false);
  assert.equal(revisionCovers(graph, 'r1b', 'r1a'), false);
  assert.equal(classifyAuthoringState({ workingHead: 'r1a', durableHead: 'r1b' }, graph), 'DIVERGED');
  assert.equal(classifyAuthoringState({ workingHead: 'r2a', durableHead: 'r1a', recoveryHead: 'r2a' }, graph), 'PROTECTED');
  assert.equal(classifyAuthoringState({ workingHead: 'r2a', durableHead: 'r1a', capturedHead: 'r2a' }, graph), 'CAPTURED');
  assert.equal(projectClean(['SAVED', 'PROTECTED']), false);
  assert.equal(projectProtected(['SAVED', 'PROTECTED']), true);
});

test('ASSURANCE_R1_LAB_03: denominator algebra fails zero, skip and incomplete execution', async () => {
  const { evaluateDenominator } = await loadModule();
  assert.equal(evaluateDenominator({ discovered: 0, executed: 0, passed: 0 }).ok, false);
  assert.equal(evaluateDenominator({ discovered: 1, executed: 1, passed: 1, skipped: 1 }).ok, false);
  assert.equal(evaluateDenominator({ discovered: 2, executed: 1, passed: 1 }).ok, false);
  assert.equal(evaluateDenominator({ discovered: 3, outOfScope: 1, executed: 2, passed: 2 }).ok, true);
});

test('ASSURANCE_R1_LAB_04: unsafe high-scoring storage candidates are filtered before ranking', async () => {
  const { filterStorageCandidates } = await loadModule();
  const checks = ['SAFE_A', 'SAFE_B'];
  const result = filterStorageCandidates([
    { candidateId: 'unsafe', score: 100, hardSafety: { SAFE_A: true, SAFE_B: false } },
    { candidateId: 'safe', score: 1, hardSafety: { SAFE_A: true, SAFE_B: true } },
  ], checks);
  assert.deepEqual(result.map((row) => row.candidateId), ['safe']);
});

test('ASSURANCE_R1_LAB_05: all intentional program mutants are killed but remain model/validator evidence only', async () => {
  const { evaluateScientificAssuranceProgram } = await loadModule();
  const result = evaluateScientificAssuranceProgram({ repoRoot: REPO_ROOT });
  assert.ok(result.scientificLab.mutation.intentionalMutants >= 18);
  assert.equal(result.scientificLab.mutation.killed, result.scientificLab.mutation.intentionalMutants);
  assert.equal(result.scientificLab.mutation.survived, 0);
  assert.equal(result.scientificLab.evidenceCeiling, 'MODEL_AND_CONTRACT_ONLY');
});
