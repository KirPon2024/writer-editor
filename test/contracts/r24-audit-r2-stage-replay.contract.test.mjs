import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { validateReplayPlan, executeReplay, parseTap, assertCleanRepository, assertExecutionSuccess, sanitizeReplayFailure } from '../../scripts/ops/r24/corrective/audit-r2-stage-replay.mjs';

const load = (path) => JSON.parse(fs.readFileSync(path, 'utf8'));
const plan = () => load('docs/OPS/R24/CORRECTIVE/AUDIT_R2_STAGE_REPLAY_PLAN_V1.json');
const registry = load('docs/OPS/R24/CORRECTIVE/STAGE_REGISTRY_V1.json');
const tap = ({tests=1,fail=0,skipped=0,cancelled=0,todo=0}={}) => Buffer.from(`TAP version 13\n# tests ${tests}\n# suites 0\n# pass ${tests-fail-skipped-cancelled}\n# fail ${fail}\n# cancelled ${cancelled}\n# skipped ${skipped}\n# todo ${todo}\n# duration_ms 1\n`);
const runtime = () => ({ sha:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(), tree:execFileSync('git',['rev-parse','HEAD^{tree}'],{encoding:'utf8'}).trim() });
const withTemp = (fn) => { const dir=fs.mkdtempSync(path.join(os.tmpdir(),'r24-r2-replay-test-')); try{return fn(dir);} finally{fs.rmSync(dir,{recursive:true,force:true});} };
const spawnTap = (output) => () => ({ status:0, signal:null, error:null, stdout:output, stderr:Buffer.alloc(0) });

test('plan contains the exact ordered 33-stage registered dependency graph', () => {
  const candidate=plan();
  assert.equal(validateReplayPlan(candidate, registry).registeredStages, 33);
  assert.equal(candidate.effectiveAdmissionBinding.stageInstanceDigest,'f024ca68aa53612a44db05817166db693a55c7b4b41d693fa01dfb51fd192c98');
  assert.equal(candidate.effectiveAdmissionBinding.stageAdmissionDigest,'e6d3b8628632fb2ce4f6e32bd7c7c9a1cf0b0ac54be534b6fcb3cd0baae93236');
  const wrongBinding=plan();wrongBinding.effectiveAdmissionBinding.stageAdmissionDigest='0'.repeat(64);
  assert.throws(() => validateReplayPlan(wrongBinding,registry,{requireFiles:false}), (error)=>error.code==='E_REPLAY_EFFECTIVE_ADMISSION_BINDING');
});
test('C8D replay is the same-run hosted physical-byte successor and never the T7-bound legacy test', () => {
  const stage=plan().stages.find((entry)=>entry.stageId==='C8D');
  assert.deepEqual(stage.command,{program:'node',args:['--test','test/contracts/r24-audit-r2-c8d-hosted-replay.contract.test.mjs']});
  assert.ok(stage.artifactPaths.includes('docs/OPS/R24/CORRECTIVE/AUDIT_R2_C8D_HOSTED_REPLAY_RECOVERY_DIAGNOSTIC_EVIDENCE_V1.json'));
  assert.ok(stage.artifactPaths.includes('docs/OPS/R24/CORRECTIVE/AUDIT_R2_PHYSICAL_EVIDENCE_CONTRACT_V1.json'));
  assert.equal(stage.artifactPaths.includes('test/contracts/r24-c8d-pk1-security-package.contract.test.mjs'),false);
});
test('C8E replay is the immutable-ledger hosted successor and never the ephemeral local lease test', () => {
  const stage=plan().stages.find((entry)=>entry.stageId==='C8E');
  assert.deepEqual(stage.command,{program:'node',args:['--test','test/contracts/r24-audit-r2-c8e-hosted-lease-replay.contract.test.mjs']});
  assert.ok(stage.artifactPaths.includes('docs/OPS/R24/CORRECTIVE/AUDIT_R2_C8E_HOSTED_LEASE_REPLAY_RECOVERY_DIAGNOSTIC_EVIDENCE_V1.json'));
  assert.ok(stage.artifactPaths.includes('docs/OPS/R24/CORRECTIVE/AUDIT_R2_LEASE_FENCE_LEDGER_V1.json'));
  assert.ok(stage.artifactPaths.includes('docs/OPS/R24/CORRECTIVE/C8E_V3_PACKAGE_COMPILER_CONTRACT_V1.json'));
  assert.ok(stage.artifactPaths.includes('docs/OPS/R24/CORRECTIVE/C8E_V3_PACKAGE_COMPILER_EVIDENCE_V1.json'));
  assert.equal(stage.artifactPaths.includes('test/contracts/r24-c8e-v3-package-compiler.contract.test.mjs'),false);
});
test('fabricated PASS fields and unknown digests are not accepted as replay inputs', () => {
  const value=plan();
  value.stages[0].status='PASS';
  value.stages[0].evidenceDigest='1'.repeat(64);
  assert.throws(() => validateReplayPlan(value,registry,{requireFiles:false}), (error)=>error.code==='E_SCHEMA_UNKNOWN_FIELD');
});
test('missing, extra, duplicate, and out-of-order dependencies fail closed', () => {
  for (const mutate of [
    (value)=>{value.stages[1].dependencies=[];},
    (value)=>{value.stages[1].dependencies.push('C1A');},
    (value)=>{value.stages[4].dependencies=['C1B','C1A'];},
    (value)=>{value.stages[4].dependencies=['C1A','C1A'];},
  ]) {
    const value=plan(); mutate(value);
    assert.throws(() => validateReplayPlan(value,registry,{requireFiles:false}), (error)=>['E_REPLAY_DEPENDENCY_MISMATCH','E_REPLAY_DEPENDENCY_DUPLICATE'].includes(error.code));
  }
});
test('missing artifact bytes and injected commands fail closed', () => {
  const missing=plan(); missing.stages[0].artifactPaths[0]='docs/OPS/R24/CORRECTIVE/DOES_NOT_EXIST.json';
  assert.throws(() => validateReplayPlan(missing,registry), (error)=>error.code==='E_REPLAY_ARTIFACT_MISSING');
  const injection=plan(); injection.stages[0].command.args.push('ok;touch pwned');
  assert.throws(() => validateReplayPlan(injection,registry,{requireFiles:false}), (error)=>error.code==='E_REPLAY_COMMAND_INJECTION');
});
test('stale evaluation SHA or tree is rejected before any command', () => withTemp((dir) => {
  const now=runtime();
  assert.throws(() => executeReplay({plan:plan(),registry,evaluationSha:'0'.repeat(40),evaluationTreeSha:now.tree,outputDir:dir,spawn:spawnTap(tap())}), (error)=>error.code==='E_REPLAY_STALE_HEAD');
}));
test('skipped, cancelled, failed, and unparsed stage-specific logs fail closed', () => {
  for (const [output,code] of [[tap({skipped:1}),'E_REPLAY_TAP_NOT_CLEAN'],[tap({cancelled:1}),'E_REPLAY_TAP_NOT_CLEAN'],[tap({fail:1}),'E_REPLAY_TAP_NOT_CLEAN'],[Buffer.from('arbitrary PASS digests\n'),'E_REPLAY_TAP_SUMMARY_MISSING']]) {
    assert.throws(()=>parseTap(output,'C9'),(error)=>error.code===code);
  }
});

test('a skipped earlier TAP suite cannot be hidden by a clean final suite', () => {
  const output = Buffer.concat([tap({tests:2,skipped:1}),tap({tests:1})]);
  assert.throws(() => parseTap(output, 'C6B'), (error)=>error.code === 'E_REPLAY_TAP_NOT_CLEAN');
});
test('cancelled process cannot become a stage PASS', () => withTemp((dir) => {
  assert.throws(()=>assertExecutionSuccess({status:null,signal:'SIGTERM',error:null},'C9'),(error)=>error.code==='E_REPLAY_COMMAND_FAILED');
}));

test('dirty worktree evidence cannot bind an unchanged HEAD and tree', () => {
  assert.throws(()=>assertCleanRepository(' M scripts/example.mjs'),(error)=>error.code==='E_REPLAY_DIRTY_WORKTREE');
  assert.doesNotThrow(()=>assertCleanRepository(''));
});

test('failed stage persists bounded sanitized inner TAP evidence and exact failure binding', () => withTemp((dir) => {
  const now=runtime();
  const secret='ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const inner=Buffer.from(`TAP version 13\nnot ok 1 - C8D remote failure at /Users/runner/work/yalken/private-fixture\nAuthorization: Bearer ${secret}\n# tests 1\n# fail 1\n# skipped 0\n# cancelled 0\n# todo 0\n`);
  const gitResolve=(args)=>args[0]==='status'?'':args[1]==='HEAD'?now.sha:now.tree;
  let captured;
  assert.throws(() => executeReplay({plan:plan(),registry,evaluationSha:now.sha,evaluationTreeSha:now.tree,outputDir:dir,gitResolve,spawn:()=>({status:1,signal:null,error:null,stdout:inner,stderr:Buffer.alloc(0)})}), (error)=>{captured=error;return error.code==='E_REPLAY_COMMAND_FAILED';});
  const record=load(path.join(dir,'stage-00-C0-failure.json'));
  const evidence=fs.readFileSync(path.join(dir,record.sanitizedEvidence.path));
  assert.equal(record.status,'FAIL');
  assert.equal(record.exitCode,1);
  assert.equal(record.evaluationSha,now.sha);
  assert.equal(record.evaluationTreeSha,now.tree);
  assert.equal(record.sanitizedEvidence.sizeBytes,evidence.length);
  assert.ok(evidence.length <= 64 * 1024);
  assert.match(evidence.toString('utf8'),/not ok 1 - C8D remote failure/);
  assert.doesNotMatch(evidence.toString('utf8'),/\/Users\/runner|ghp_|Authorization: Bearer/);
  assert.ok(Buffer.isBuffer(captured.diagnosticEvidence));
  assert.equal(fs.existsSync(path.join(dir,'stage-00-C0.json')),false);
}));

test('failure sanitizer rejects oversized bounds and truncates to the fixed maximum', () => {
  assert.throws(()=>sanitizeReplayFailure(Buffer.from('x'),{maxBytes:64*1024+1}),(error)=>error.code==='E_REPLAY_FAILURE_BOUND');
  const result=sanitizeReplayFailure(Buffer.from(`${'x'.repeat(70*1024)}€AWS_PRIVATE_KEY=forbidden`));
  assert.equal(result.truncated,true);
  assert.ok(result.sanitizedBytes.length <= 64*1024);
  assert.doesNotMatch(result.sanitizedBytes.toString('utf8'),/forbidden/);
});

test('macOS replay workflow immutably uploads diagnostics whenever the replay step fails', () => {
  const workflow=fs.readFileSync('.github/workflows/r24-terminal-attestation.yml','utf8');
  const physicalIndex=workflow.indexOf('Prepare same-run physical macOS, DOCX, unsigned artifact, and package evidence');
  const replayIndex=workflow.indexOf('Execute stage-specific 33-stage replay',physicalIndex);
  assert.ok(physicalIndex > 0 && replayIndex > physicalIndex);
  assert.match(workflow,/AUDIT_R2_PHYSICAL_ROOT: \$\{\{ runner\.temp \}\}\/physical/u);
  assert.match(workflow,/id: stage_replay/u);
  assert.match(workflow,/always\(\) && steps\.stage_replay\.outcome == 'failure'/u);
  assert.match(workflow,/audit-r2-stage-replay-diagnostics-macos-/u);
  assert.match(workflow,/\*-failure-sanitized\.log/u);
  assert.match(workflow,/\*-failure\.json/u);
  assert.match(workflow,/if-no-files-found: error/u);
});
