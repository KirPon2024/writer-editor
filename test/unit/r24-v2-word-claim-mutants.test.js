'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const ROOT = path.resolve(__dirname, '..', '..');
const MODULE = path.join(ROOT, 'scripts', 'ops', 'r24', 'word-claim-compiler-v2.mjs');
const SUPPORT = ['canonical-json.mjs', 'observed-evidence-v2.mjs'];
const read = relative => JSON.parse(fs.readFileSync(path.join(ROOT, relative), 'utf8'));
const HEAD = '1'.repeat(40), ORIGIN = '2'.repeat(40), TREE = '3'.repeat(40), DIGEST = 'f'.repeat(64);

async function load(file) { return import(`${pathToFileURL(file).href}?v=${Date.now()}-${Math.random()}`); }
function fixture(c) {
  const program = read('docs/OPS/EVIDENCE/YALKEN_SCIENTIFIC_ASSURANCE_PROGRAM_R1/PROGRAM_DAG.json');
  const stage = program.stages.find(row => row.stageId === c.W0_STAGE_ID);
  const packageJson = { scripts: Object.fromEntries(Object.values(c.STAGE_SCRIPT_BY_ID).map(script => [script, script])) };
  const workflowText = ['test:r24-v0', 'test:r24-p2', 'test:r24-t1', 'test:r24-w0', 'test:r24-v2'].map(script => `        run: ${script === 'test:r24-v2' ? c.V2_WORKFLOW_COMMAND : `npm run -s ${script}`}`).join('\n');
  const row = { stageId: c.W0_STAGE_ID, status: 'SUCCESS', headSha: HEAD, treeSha: TREE, evidenceClass: 'INDEPENDENT_EXACT_HEAD', source: 'V2_COMPILER_CONTRACT_FIXTURE', candidate: { stageId: c.W0_STAGE_ID, script: c.STAGE_SCRIPT_BY_ID[c.W0_STAGE_ID], profile: stage.profile }, run: { id: 'run', attempt: 1, headSha: HEAD, conclusion: 'success' }, job: { id: 'job', name: 'w0', conclusion: 'success' }, step: { name: 'w0', conclusion: 'success' }, artifact: { name: 'a', digest: DIGEST }, tool: { name: 't', digest: DIGEST }, schema: { name: 's', digest: DIGEST }, fixture: { name: 'f', digest: DIGEST }, counts: { passed: 1, failed: 0, skipped: 0, denominator: 1, exitCode: 0 }, profileVerdictCandidate: 'BLOCKED', stageClosureKind: 'TYPED_WORD_PROFILE_BLOCKED_CLASSIFICATION', c8bContractDigest: c.C8B_CONTRACT_DIGEST, c8bEvidenceDigest: c.C8B_EVIDENCE_DIGEST, c8bExternalTerminalDigest: c.C8B_EXTERNAL_TERMINAL_DIGEST, routePassClaim: false, productApplyAuthority: false, safeApplyExpansion: false, wordTerminalPass: false, programPass: false, userDocumentsTouched: false, userDocumentsAllowed: false, googleDocsTransfer: false, releaseReady: false, productionReleaseReady: false, runtimeNetworkActivated: false };
  return { program, scientificContracts: read('docs/OPS/EVIDENCE/YALKEN_SCIENTIFIC_ASSURANCE_PROGRAM_R1/SCIENTIFIC_CONTRACTS.json'), c8bContract: read('docs/OPS/R24/CORRECTIVE/C8B_WORD_PHYSICAL_CONTRACT_V1.json'), c8bEvidence: read('docs/OPS/R24/CORRECTIVE/C8B_WORD_PHYSICAL_EVIDENCE_V1.json'), c9EffectiveState: read('docs/OPS/R24/CORRECTIVE/C9_EFFECTIVE_STATE_V1.json'), sourceDigests: { c8bContract: c.C8B_CONTRACT_DIGEST, c8bEvidence: c.C8B_EVIDENCE_DIGEST }, repoState: { headSha: HEAD, originMainSha: ORIGIN, treeSha: TREE, dirty: false }, packageJson, workflowText, gateEvidence: [row], expectedHeadSha: HEAD, expectedOriginMainSha: ORIGIN };
}

const MUTANTS = [
  ["claim.currentVerdict !== 'BLOCKED'", "false", input => { input.scientificContracts.claims.find(row => row.claimId === 'CLM_WORD_ROUNDTRIP').currentVerdict = 'PASS'; }],
  ["program.verdictAggregation?.currentVector?.[WORD_PROFILE_ID] !== 'BLOCKED'", "false", input => { input.program.verdictAggregation.currentVector.WORD_ROUNDTRIP = 'PASS'; }],
  ["repoState.headSha !== expectedHeadSha", "false", input => { input.repoState.headSha = '4'.repeat(40); }],
  ["request.programVerdict === 'PASS' || request.globalScalarPass === true", "false", input => { input.claimRequest = { programVerdict: 'PASS' }; }],
  ["v0Index >= v2Index || w0Index >= v2Index", "false", input => { input.workflowText = ['test:r24-v2', 'test:r24-v0', 'test:r24-w0'].map(script => `        run: npm run -s ${script}`).join('\n'); }],
  ["sourceDigests?.c8bContract !== C8B_CONTRACT_DIGEST || sourceDigests?.c8bEvidence !== C8B_EVIDENCE_DIGEST", "false", input => { input.sourceDigests.c8bContract = '0'.repeat(64); }],
  ["correction.from !== 'BLOCKED_TYPED' || correction.to !== 'DONE'", "false || correction.from !== 'BLOCKED_TYPED' && correction.to !== 'DONE'", input => { input.c9EffectiveState.appendOnlyCorrections.find(row => row.nodeId === 'W0_WORD_PHYSICAL_RECERTIFICATION').to = 'BLOCKED_TYPED'; }],
  ["observations?.safety?.userDocumentsTouched !== false", "false", input => { input.c8bEvidence.observations.safety.userDocumentsTouched = true; }],
  ["row.profileVerdictCandidate !== 'BLOCKED' || row.stageClosureKind !== 'TYPED_WORD_PROFILE_BLOCKED_CLASSIFICATION'", "false", input => { input.gateEvidence[0].profileVerdictCandidate = 'PASS'; }],
  ["const forbidden = FORBIDDEN_TRUE_FIELDS.find((field) => row[field] === true);", "const forbidden = undefined;", input => { input.gateEvidence[0].productApplyAuthority = true; }],
];

function materialize(find, replace) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'r24-v2-mutant-'));
  const source = fs.readFileSync(MODULE, 'utf8');
  assert.equal(source.split(find).length - 1, 1, `unique mutation anchor: ${find}`);
  for (const name of SUPPORT) fs.copyFileSync(path.join(ROOT, 'scripts', 'ops', 'r24', name), path.join(dir, name));
  const target = path.join(dir, 'word-claim-compiler-v2.mjs');
  fs.writeFileSync(target, source.replace(find, replace));
  return { dir, target };
}

test('V2 actual source mutants are all killed by independent negative oracles', async () => {
  const baseline = await load(MODULE);
  for (const [, , mutate] of MUTANTS) {
    const input = fixture(baseline); mutate(input); assert.equal(baseline.compileWordVerdict(input).ok, false);
  }
  const results = [];
  for (const [find, replace, mutate] of MUTANTS) {
    const { dir, target } = materialize(find, replace);
    let killed = false;
    try {
      const candidate = await load(target), input = fixture(candidate); mutate(input);
      assert.equal(candidate.compileWordVerdict(input).ok, false);
    } catch { killed = true; }
    finally { fs.rmSync(dir, { recursive: true, force: true }); }
    results.push(killed);
  }
  assert.deepEqual(results, Array(MUTANTS.length).fill(true));
  console.log(`R24_V2_MUTATION_RECEIPT=${JSON.stringify({ actualSourceMutations: true, killed: results.filter(Boolean).length, survived: results.filter(value => !value).length, denominator: MUTANTS.length })}`);
});
