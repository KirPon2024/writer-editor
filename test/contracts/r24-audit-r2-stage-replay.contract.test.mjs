import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { validateReplayPlan, executeReplay, parseTap, assertCleanRepository, assertExecutionSuccess } from '../../scripts/ops/r24/corrective/audit-r2-stage-replay.mjs';

const load = (path) => JSON.parse(fs.readFileSync(path, 'utf8'));
const plan = () => load('docs/OPS/R24/CORRECTIVE/AUDIT_R2_STAGE_REPLAY_PLAN_V1.json');
const registry = load('docs/OPS/R24/CORRECTIVE/STAGE_REGISTRY_V1.json');
const tap = ({tests=1,fail=0,skipped=0,cancelled=0,todo=0}={}) => Buffer.from(`TAP version 13\n# tests ${tests}\n# suites 0\n# pass ${tests-fail-skipped-cancelled}\n# fail ${fail}\n# cancelled ${cancelled}\n# skipped ${skipped}\n# todo ${todo}\n# duration_ms 1\n`);
const runtime = () => ({ sha:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(), tree:execFileSync('git',['rev-parse','HEAD^{tree}'],{encoding:'utf8'}).trim() });
const withTemp = (fn) => { const dir=fs.mkdtempSync(path.join(os.tmpdir(),'r24-r2-replay-test-')); try{return fn(dir);} finally{fs.rmSync(dir,{recursive:true,force:true});} };
const spawnTap = (output) => () => ({ status:0, signal:null, error:null, stdout:output, stderr:Buffer.alloc(0) });

test('plan contains the exact ordered 33-stage registered dependency graph', () => {
  assert.equal(validateReplayPlan(plan(), registry).registeredStages, 33);
  const wrongBinding=plan();wrongBinding.effectiveAdmissionBinding.stageAdmissionDigest='0'.repeat(64);
  assert.throws(() => validateReplayPlan(wrongBinding,registry,{requireFiles:false}), (error)=>error.code==='E_REPLAY_EFFECTIVE_ADMISSION_BINDING');
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
