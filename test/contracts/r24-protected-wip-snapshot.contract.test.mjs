import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const SCRIPT=path.resolve('scripts/ops/r24/corrective/protected-wip-snapshot.mjs');
const CARRIER='docs/OPS/R24/CORRECTIVE/AUDIT_CYCLE_1_PROTECTED_WIP_BEFORE_V1.json';
const h=(bytes)=>crypto.createHash('sha256').update(bytes).digest('hex');
const hex=(value)=>typeof value==='string'&&/^[0-9a-f]{64}$/.test(value);

function verifySnapshot(snapshot){
  const {snapshotSha256,...payload}=snapshot;
  assert.equal(h(Buffer.from(`${JSON.stringify(payload)}\n`)),snapshotSha256);
  assert.equal(snapshot.completeDenominator,snapshot.entries.length);
  assert.equal(snapshot.presentDenominator,snapshot.entries.filter((entry)=>entry.present).length);
  assert.equal(snapshot.prunableDenominator,snapshot.entries.filter((entry)=>entry.prunable).length);
  assert.equal(snapshot.dirtyDenominator,snapshot.entries.filter((entry)=>entry.dirty).length);
  assert.deepEqual(snapshot.entries.map((entry)=>entry.pathIdentitySha256),[...snapshot.entries.map((entry)=>entry.pathIdentitySha256)].sort());
  assert.equal(new Set(snapshot.entries.map((entry)=>entry.pathIdentitySha256)).size,snapshot.entries.length);
  for(const entry of snapshot.entries){assert.equal(hex(entry.pathIdentitySha256),true);assert.equal(hex(entry.statusSha256),true);assert.equal(Object.hasOwn(entry,'path'),false);assert.equal(Object.hasOwn(entry,'statusBytes'),false);}
  assert.deepEqual(snapshot.protectedDirtySet,snapshot.entries.filter((entry)=>entry.dirty).map(({pathIdentitySha256,head,statusByteLength,statusSha256})=>({pathIdentitySha256,head,statusByteLength,statusSha256})));
  return true;
}

function fixture(){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'r24-wip-root-'));
  const sibling=fs.mkdtempSync(path.join(os.tmpdir(),'r24-wip-linked-parent-'));
  fs.rmSync(sibling,{recursive:true,force:true});
  const run=(args,cwd=root)=>{const result=spawnSync('git',args,{cwd,encoding:'utf8'});assert.equal(result.status,0,result.stderr);return result.stdout.trim();};
  run(['init','-q']);run(['config','user.email','r24@example.invalid']);run(['config','user.name','R24 Test']);fs.writeFileSync(path.join(root,'tracked.txt'),'base\n');run(['add','tracked.txt']);run(['commit','-qm','base']);run(['worktree','add','-q','-b','protected-wip',sibling]);fs.writeFileSync(path.join(sibling,'tracked.txt'),'dirty\n');
  return {root,sibling,cleanup:()=>{spawnSync('git',['worktree','remove','--force',sibling],{cwd:root});fs.rmSync(root,{recursive:true,force:true});fs.rmSync(sibling,{recursive:true,force:true});}};
}

test('before carrier is privacy-safe complete-denominator evidence and supersedes the old overclaim',()=>{const carrier=JSON.parse(fs.readFileSync(CARRIER));assert.equal(carrier.externalSourcePlanDigest,'1f5b5b7b63a9f7806db1ecbcd8fa5f16484a73df3fe51f9a5d699d52f4c3fb9a');assert.equal(carrier.compiledProgramFileDigest,'da754a8a0e2c09014f342b908502e83ab975488ab665feb2a8a66d0b0d46ae0a');assert.equal(carrier.snapshot.completeDenominator,251);assert.equal(carrier.snapshot.dirtyDenominator,7);assert.equal(carrier.historicalOverclaimSupersession.pastEntriesFabricated,false);assert.equal(carrier.privacy.userContentDisclosed,false);assert.equal(verifySnapshot(carrier.snapshot),true);});
test('algorithm captures all non-excluded worktrees with stable domain-separated identities',()=>{const value=fixture();try{const listing=spawnSync('git',['worktree','list','--porcelain'],{cwd:value.root,encoding:'utf8'});assert.equal(listing.status,0,listing.stderr);const registeredRoot=listing.stdout.match(/^worktree (.+)$/m)?.[1];assert.ok(registeredRoot);const result=spawnSync(process.execPath,[SCRIPT,`writer=${registeredRoot}`],{cwd:value.root,encoding:'utf8'});assert.equal(result.status,0,result.stderr);const snapshot=JSON.parse(result.stdout);assert.equal(verifySnapshot(snapshot),true);assert.equal(snapshot.completeDenominator,1);assert.equal(snapshot.dirtyDenominator,1);assert.equal(snapshot.entries[0].statusByteLength>0,true);assert.equal(result.stdout.includes(value.root),false);assert.equal(result.stdout.includes(value.sibling),false);assert.equal(result.stdout.includes('tracked.txt'),false);}finally{value.cleanup();}});
test('tampered status evidence cannot retain the declared snapshot digest',()=>{const carrier=JSON.parse(fs.readFileSync(CARRIER));const mutant=structuredClone(carrier.snapshot);mutant.entries[0].statusSha256='0'.repeat(64);assert.throws(()=>verifySnapshot(mutant));});
