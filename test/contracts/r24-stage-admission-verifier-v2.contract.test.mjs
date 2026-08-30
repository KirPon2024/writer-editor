import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const VERIFIER='scripts/ops/r24/corrective/stage-admission-verifier-anchor-v2.mjs';
const VERIFIER_DIGEST='d7837ff49cb9df196303384111336d9907cbf66147ba23bf8b687404666e5b59';
const AUTHORITY='docs/OPS/R24/CORRECTIVE/POST_AUDIT_CORRECTIONS_OWNER_AMENDMENT_V10.json';
const INSTANCE='docs/OPS/R24/CORRECTIVE/POST_AUDIT_CORRECTIONS_STAGE_INSTANCE_V11.json';
const ADMISSION='docs/OPS/R24/CORRECTIVE/POST_AUDIT_CORRECTIONS_STAGE_ADMISSION_ATTESTATION_V11.json';
const sha256=(bytes)=>crypto.createHash('sha256').update(bytes).digest('hex');
const canonical=(v)=>Array.isArray(v)?`[${v.map(canonical).join(',')}]`:v&&typeof v==='object'?`{${Object.keys(v).sort().map(k=>`${JSON.stringify(k)}:${canonical(v[k])}`).join(',')}}`:JSON.stringify(v);
const write=(file,value)=>{fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,`${JSON.stringify(value,null,2)}\n`);};
const clone=(v)=>JSON.parse(JSON.stringify(v));

function rootFixture(){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'stage-v2-root-'));const instance=JSON.parse(fs.readFileSync(INSTANCE));
  const existing=[...instance.operations.readPaths,...instance.operations.modifyPaths,...instance.operations.deletePaths,...instance.fixedBindings.map(x=>x.path)];
  for(const relative of new Set(existing)){const target=path.join(root,relative);fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(relative,target);}
  for(const relative of instance.operations.createPaths)fs.mkdirSync(path.dirname(path.join(root,relative)),{recursive:true});
  return root;
}
function spawn({root=rootFixture(),authority=AUTHORITY,instance=INSTANCE,admission=ADMISSION,verifier=VERIFIER,authorityDigest=sha256(fs.readFileSync(authority))}={}){
  return spawnSync(process.execPath,[verifier,'--repo-root',root,'--authority',authority,'--stage-instance',instance,'--stage-admission',admission,'--expected-verifier-digest',VERIFIER_DIGEST,'--expected-authority-digest',authorityDigest],{encoding:'utf8'});
}
function mutated(mutator){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'stage-v2-input-'));const authority=clone(JSON.parse(fs.readFileSync(AUTHORITY))),instance=clone(JSON.parse(fs.readFileSync(INSTANCE))),admission=clone(JSON.parse(fs.readFileSync(ADMISSION)));mutator({authority,instance,admission});
  const authorityPath=path.join(dir,'authority.json'),instancePath=path.join(dir,'instance.json'),admissionPath=path.join(dir,'admission.json');write(authorityPath,authority);write(instancePath,instance);
  admission.authorityDigest=sha256(fs.readFileSync(authorityPath));admission.stageInstanceDigest=sha256(fs.readFileSync(instancePath));admission.writeSetDigest=sha256(Buffer.from(canonical({createPaths:instance.operations.createPaths,deletePaths:instance.operations.deletePaths,modifyPaths:instance.operations.modifyPaths,renamePairs:instance.operations.renamePairs})));admission.commandScopeDigest=sha256(Buffer.from(canonical(instance.commands)));admission.acceptanceSignalsDigest=sha256(Buffer.from(canonical(instance.acceptanceSignals)));write(admissionPath,admission);
  return {authority:authorityPath,instance:instancePath,admission:admissionPath,authorityDigest:admission.authorityDigest};
}

test('caller-pinned authority and verifier admit exact base proposal',()=>{const r=spawn();assert.equal(r.status,0,r.stderr);assert.match(r.stdout,/"status":"PASS"/);});
test('modified verifier bytes are rejected before interpretation',()=>{const dir=fs.mkdtempSync(path.join(os.tmpdir(),'stage-v2-verifier-')),file=path.join(dir,'verifier.mjs');fs.copyFileSync(VERIFIER,file);fs.appendFileSync(file,'\n// mutant\n');const r=spawn({verifier:file});assert.notEqual(r.status,0);assert.match(r.stderr,/E_VERIFIER_BYTES/);});
test('modified authority cannot self-authorize coordinated instance changes',()=>{const input=mutated(({authority,instance})=>{authority.allowedOperations.createPaths.push('new-self-authorized.json');authority.allowedOperations.createPaths.sort();instance.operations.createPaths.push('new-self-authorized.json');instance.operations.createPaths.sort();});const r=spawn({...input,authorityDigest:sha256(fs.readFileSync(AUTHORITY))});assert.notEqual(r.status,0);assert.match(r.stderr,/E_AUTHORITY_BYTES/);});
test('modified historical program bytes are rejected',()=>{const root=rootFixture();fs.appendFileSync(path.join(root,'docs/OPS/R24/CORRECTIVE/PROGRAM_TEMPLATE_V1_1.json'),' ');const r=spawn({root});assert.notEqual(r.status,0);assert.match(r.stderr,/E_FIXED_BINDING_BYTES/);});
test('modified historical verifier contract schema bytes are rejected',()=>{const root=rootFixture();fs.appendFileSync(path.join(root,'docs/OPS/R24/CORRECTIVE/schemas/STAGE_INSTANCE_V1.schema.json'),' ');const r=spawn({root});assert.notEqual(r.status,0);assert.match(r.stderr,/E_FIXED_BINDING_BYTES/);});
test('unknown StageInstance fields are rejected',()=>{const input=mutated(({instance})=>{instance.selfAuthorized=true;});const r=spawn(input);assert.notEqual(r.status,0);assert.match(r.stderr,/E_UNKNOWN_OR_MISSING_FIELD/);});
test('hostile symlink component is rejected relative to canonical root',()=>{const root=rootFixture(),outside=fs.mkdtempSync(path.join(os.tmpdir(),'stage-v2-outside-'));fs.rmSync(path.join(root,'.github'),{recursive:true});fs.symlinkSync(outside,path.join(root,'.github'));const r=spawn({root});assert.notEqual(r.status,0);assert.match(r.stderr,/E_SYMLINK_COMPONENT/);});
test('missing create parent is rejected',()=>{const input=mutated(({authority,instance})=>{authority.allowedOperations.createPaths.push('missing-parent/file.json');authority.allowedOperations.createPaths.sort();instance.operations.createPaths.push('missing-parent/file.json');instance.operations.createPaths.sort();});const r=spawn(input);assert.notEqual(r.status,0);assert.match(r.stderr,/E_MISSING_COMPONENT/);});
test('NFD Unicode repo path is rejected',()=>{const p='docs/OPS/R24/CORRECTIVE/Cafe\u0301.json';const input=mutated(({authority,instance})=>{authority.allowedOperations.createPaths.push(p);authority.allowedOperations.createPaths.sort();instance.operations.createPaths.push(p);instance.operations.createPaths.sort();});const r=spawn(input);assert.notEqual(r.status,0);assert.match(r.stderr,/E_PATH_NOT_NFC/);});
test('outside-root absolute path is rejected',()=>{const input=mutated(({authority,instance})=>{authority.allowedOperations.createPaths.push('/tmp/outside.json');authority.allowedOperations.createPaths.sort();instance.operations.createPaths.push('/tmp/outside.json');instance.operations.createPaths.sort();});const r=spawn(input);assert.notEqual(r.status,0);assert.match(r.stderr,/E_PATH_NOT_POSIX_RELATIVE/);});
test('exact owner-pinned rename pair is modeled and admitted',()=>{const from='.node-version',to='.node-version.successor';const input=mutated(({authority,instance})=>{for(const value of [authority.allowedOperations,instance.operations]){value.modifyPaths=value.modifyPaths.filter(p=>p!==from);value.renamePairs=[{from,to}];}});const root=rootFixture();fs.copyFileSync(from,path.join(root,from));const r=spawn({...input,root});assert.equal(r.status,0,r.stderr);});
test('operation-class escalation without the caller-pinned authority is rejected',()=>{const input=mutated(({authority,instance})=>{for(const value of [authority.allowedOperations,instance.operations]){value.modifyPaths=value.modifyPaths.filter(p=>p!=='.node-version');value.deletePaths=['.node-version'];}});const r=spawn({...input,authorityDigest:sha256(fs.readFileSync(AUTHORITY))});assert.notEqual(r.status,0);assert.match(r.stderr,/E_AUTHORITY_BYTES/);});
test('V2 schemas are closed and expose exact operation classes',()=>{const schema=JSON.parse(fs.readFileSync('docs/OPS/R24/CORRECTIVE/schemas/STAGE_INSTANCE_V2.schema.json'));assert.equal(schema.additionalProperties,false);assert.deepEqual(Object.keys(schema.properties.operations.properties).sort(),['createPaths','deletePaths','modifyPaths','readPaths','renamePairs']);const admission=JSON.parse(fs.readFileSync('docs/OPS/R24/CORRECTIVE/schemas/STAGE_ADMISSION_ATTESTATION_V2.schema.json'));assert.equal(admission.additionalProperties,false);assert.equal(admission.required.includes('authorityDigest'),true);});
