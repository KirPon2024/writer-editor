#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { buildInventory } from '../test-inventory.mjs';
import { canonicalBytes } from './canonical-json.mjs';

export const STAGE_ID = 'C8Z';
export const OBSERVED_AT_UTC = '2026-08-29T05:28:30Z';
export const PROGRAM_TEMPLATE_DIGEST = '6c833c964318da3e61e1743365f8763206be838647b5222c187b3bda8d1c6b9a';
export const STAGE_REGISTRY_DIGEST = 'c8af046b5918f43a50af66886b0b5c9d2e22ea6501240d4b239101d8836ced1a';
export const TRUST_MODEL_DIGEST = '4f6e4b3a191e0302ea44646659e8c2f71121af7d808cc0ee768269b4e156840d';
export const OWNER_BINDING_DIGEST = 'be68bd97021d13fbfb75c73791bda7f6bfeebecebf525d4a927d1a4c9fe9efd6';
export const STAGE_INSTANCE_DIGEST = '8ab927f43d9b54be45eb51c24aa6225fd8a6b31fbf8f6ced3c5cebcf201b87ce';
export const STAGE_ADMISSION_DIGEST = '501a45051ab6fc3620eb4bc4a9f2a6877d4d9ea7b491b32ff04ce5b964986414';
export const ACCEPTANCE_SIGNALS_DIGEST = '21f3d7e5ae08c034e612865d414e816fa32cce8d97c09e46d644589585b880f5';
export const WRITE_SET_DIGEST = '0afc5fe0694499ecb542d5d92c1bcac952853c3dcbb677070ccb517b9ab861cb';
export const SOURCE_HEAD_SHA = '560f654d8da855ee7e6046d1ba5ea9f7bf682c24';
export const SOURCE_TREE_SHA = '29f38e09c13152d44d8f38d9c4af5dc520f85093';
export const PREDECESSOR_TERMINAL_DIGEST = '416a174eb175a8e510f299d787ae69f8f219678e81ae1e802d13d5e8b92ab5c3';
export const PREDECESSOR_CERTIFIED_DONE_RECEIPT_DIGEST = 'ba5482de71773468bfd4486942535e95b756063040c94b5e0cd2742a44d278d4';
export const PREDECESSOR_LEASE_RELEASE_DIGEST = '02c4fa953b4786f4ec193c8b9ad8a6ffa0c6769c8273622768d1f7479fba4404';
export const LEASE_DIGEST = 'f39ed2a2d078fb8319a0b353afa5574ea7e44d2e55ac515ba854bd41d9d9d7a2';
export const FENCE_DIGEST = '698ff2c18ceaaaf94fa6f6ce21a4f808b68e48d6adef66c7efbaac24aaf63b55';
export const FENCE_COUNTER = 50;
export const CONTROL_PLANE_EVIDENCE_STAMP_ID = 'ES-R24-CORRECTIVE-B0-CONTROL-PLANE-CLAIM-BINDINGS';

const LOCAL_LEASE = '/private/tmp/yalken-r24-corrective-canonical-writer.lock/lease-c8z-umbrella-current-head-recertification-v1.json';
const LOCAL_FENCE = '/private/tmp/yalken-r24-corrective-canonical-writer.lock/fence-c8z-umbrella-current-head-recertification-v1.json';
const LEXICAL = (left, right) => left < right ? -1 : left > right ? 1 : 0;

export const PATHS = Object.freeze({
  activeApprovals: 'docs/OPS/R24/CORRECTIVE/C1C_GOVERNANCE_CHANGE_APPROVALS_V1.json',
  approvals: 'docs/OPS/R24/CORRECTIVE/C8Z_GOVERNANCE_CHANGE_APPROVALS_V1.json',
  contract: 'docs/OPS/R24/CORRECTIVE/C8Z_UMBRELLA_CURRENT_HEAD_CONTRACT_V1.json',
  evaluation: 'docs/OPS/R24/CORRECTIVE/C8Z_CURRENT_HEAD_EVALUATION_V1.json',
  inventory: 'docs/OPS/R24/CORRECTIVE/C1B_TEST_INVENTORY_V1.json',
  ledger: 'docs/OPS/R24/CORRECTIVE/C8Z_RECERTIFICATION_LEDGER_V1.json',
  program: 'docs/OPS/R24/CORRECTIVE/PROGRAM_TEMPLATE_V1_1.json',
  registry: 'docs/OPS/R24/CORRECTIVE/STAGE_REGISTRY_V1.json',
  script: 'scripts/ops/r24/corrective/c8z-umbrella-current-head-recertification.mjs',
  stageAdmission: 'docs/OPS/R24/CORRECTIVE/C8Z_STAGE_ADMISSION_ATTESTATION_V1.json',
  stageInstance: 'docs/OPS/R24/CORRECTIVE/C8Z_STAGE_INSTANCE_V1.json',
  standing: 'docs/OPS/R24/CORRECTIVE/STANDING_AUTHORITY_BINDING_V1.json',
  test: 'test/contracts/r24-c8z-umbrella-current-head-recertification.contract.test.mjs',
  trust: 'docs/OPS/R24/CORRECTIVE/TERMINAL_ATTESTATION_TRUST_MODEL_V1.json',
});

export const WRITE_SET = Object.freeze([
  PATHS.inventory, PATHS.activeApprovals, PATHS.evaluation, PATHS.approvals,
  PATHS.ledger, PATHS.stageAdmission, PATHS.stageInstance, PATHS.contract,
  PATHS.script, PATHS.test,
].sort(LEXICAL));

export const ENVELOPES = Object.freeze([
  {
    artifactDigest: '2e5a057d98dade38dedf69718500201931110a3fa635c42c6818412cd0a9b031',
    artifactId: '9705645675',
    artifacts: [
      ['docs/OPS/R24/CORRECTIVE/C8A_STAGE_INSTANCE_AMENDMENT_V1.json', '31038ecef7a296f5d4d7a30272dd3b092c08bb5e1feea1c152061998ee00803c', 'STAGE_INSTANCE'],
      ['docs/OPS/R24/CORRECTIVE/C8A_STAGE_ADMISSION_ATTESTATION_AMENDMENT_V1.json', 'ff1df2e63213ed60d64b0c8953922d1f1cd97a733c13afbfdec69831134b6fdc', 'STAGE_ADMISSION'],
      ['docs/OPS/R24/CORRECTIVE/C8A_PHYSICAL_A11Y_PERFORMANCE_CONTRACT_V1.json', 'ea869098033b1ec0c3e31ad75b69b26939350f46afa388df2e10343876bd8497', 'ENVELOPE_CONTRACT'],
      ['docs/OPS/R24/CORRECTIVE/C8A_PHYSICAL_A11Y_PERFORMANCE_EVIDENCE_V1.json', 'a35f234c5128f3bfcb2a08f04d4d8c218f20337e8fb6b04147576b70073f7fc7', 'ENVELOPE_EVIDENCE'],
      ['scripts/ops/r24/corrective/c8a-physical-a11y-performance.mjs', '5a2193470cea0443c2d444e8fcdd78d2278e6e45d1b5b905b8d731e935c905fb', 'ENVELOPE_COMPILER'],
      ['test/contracts/r24-c8a-physical-a11y-performance.contract.test.mjs', '48c48c0cca5cbc2283f61e7ab35c1a871dff94edf4b396005c76f413a4033434', 'INDEPENDENT_CONTRACT_TEST'],
    ],
    candidateSha: 'b0bd98d05347615c307a5a785afb35e21ee08aff',
    mergeSha: 'f700a9fff675e89d77c805536e6e573207ab7d83',
    receiptDigest: '231640a9683b776f1edbd28197caea72240a4166832482e8fc49535e90eabe7c',
    releaseDigest: '4ef6143312208fd52b8cf8a01931993564ee4fdac964718f19d74795147c7010',
    runId: '33222411902',
    stageId: 'C8A',
    terminalDigest: 'c4b9349140a9dc33b664f166cf59b2ae9c00e3394a044b87ee6195adc554d66e',
    treeSha: '976e08b5381ce3f53158751b7db6897c7186bb5a',
  },
  {
    artifactDigest: 'e6fed1e8c1d589fd9fb90fa0dd21e0446aa0eae4ca368a8ad539a297bf039d05',
    artifactId: '9707198303',
    artifacts: [
      ['docs/OPS/R24/CORRECTIVE/C8B_STAGE_INSTANCE_V1.json', 'c56804939a1a6d2234581e9c64f88de3336d352d99c4e44cbaf550041a063d1f', 'STAGE_INSTANCE'],
      ['docs/OPS/R24/CORRECTIVE/C8B_STAGE_ADMISSION_ATTESTATION_V1.json', 'db1e1febeeebcaa1551cd4287bcc2ae6a4a6c828fc725e7d58d41863306ac54c', 'STAGE_ADMISSION'],
      ['docs/OPS/R24/CORRECTIVE/C8B_WORD_PHYSICAL_CONTRACT_V1.json', 'c027961bd3c7faa781962e86b325b844053268b8ea4d1b3a958d1861c627304a', 'ENVELOPE_CONTRACT'],
      ['docs/OPS/R24/CORRECTIVE/C8B_WORD_PHYSICAL_EVIDENCE_V1.json', '90d52e4fc6d9521e051a3c3d76a5061e0f75c8384c83df67c04de98d093ee1b8', 'ENVELOPE_EVIDENCE'],
      ['scripts/ops/r24/corrective/c8b-word-physical.mjs', 'bac5d55b6417c146e65ebbf618e03c515b37480be7a210833ba755a40d6ded31', 'ENVELOPE_COMPILER'],
      ['test/contracts/r24-c8b-word-physical.contract.test.mjs', '35d8aa1673a2a33db1279123fe7c3747e061f823e6ad9bd3d8577397154cf0d5', 'INDEPENDENT_CONTRACT_TEST'],
    ],
    candidateSha: 'e83640a2658779647aece5744f5b72c2a3f96868',
    mergeSha: 'e87cec7caed50eb7d552779a3dcdd9e5d71d9698',
    receiptDigest: 'de3a5b3f03acb56977a3a05037bfad9a17eaf866d7c1e62e1d2be1e6fe69de36',
    releaseDigest: '02ddb470e945ce8846d027260fe54ae8a3c23f3d8af31d02b94765a83d407307',
    runId: '33227000708',
    stageId: 'C8B',
    terminalDigest: 'd83dcb271ae1067e41bdaf82e1dc787905721edb4880350646a7e3b18ec6d7b8',
    treeSha: '1a9d615e5e40df6d652c41c06d755614c26ca6ae',
  },
  {
    artifactDigest: '26a0566e0bf83f236b89ab1389ef19a5e53340d218d56cecff932f812d72d840',
    artifactId: '9708456379',
    artifacts: [
      ['docs/OPS/R24/CORRECTIVE/C8C_STAGE_INSTANCE_V1.json', 'edc01f039b7614e4f8a85609a2f07dd4d16276840af2051708078a8915e42714', 'STAGE_INSTANCE'],
      ['docs/OPS/R24/CORRECTIVE/C8C_STAGE_ADMISSION_ATTESTATION_V1.json', 'e7c182a4b9e32b5374db1576503b917348c7d5f1616f20902637f15399b05606', 'STAGE_ADMISSION'],
      ['docs/OPS/R24/CORRECTIVE/C8C_MACOS_ARTIFACT_CONTRACT_V1.json', 'f47c42a55e8edc6c45470a8e08849bbb588bb18616bd798b6d4841781cd4ff4a', 'ENVELOPE_CONTRACT'],
      ['docs/OPS/R24/CORRECTIVE/C8C_MACOS_ARTIFACT_EVIDENCE_V1.json', 'd28d4fc9e5c48e083230f0aa6a0af3873b5195aeb9856acfc17bbdf973ee99cd', 'ENVELOPE_EVIDENCE'],
      ['scripts/ops/r24/corrective/c8c-macos-artifact.mjs', '56dd3883af04bf997d2b44ad29b2b8a6e56cf440eaa59e07d1a2a35b0c1f2f3f', 'ENVELOPE_COMPILER'],
      ['test/contracts/r24-c8c-macos-artifact.contract.test.mjs', '1900188e8187704a3cdb9b7d60fcfd8f0ace0a1be944aa26292f4dcf7e715db5', 'INDEPENDENT_CONTRACT_TEST'],
    ],
    candidateSha: 'b25d834e5592cec1295bbd854e14ec075fdfe9a6',
    mergeSha: '3617c2bfbc17398ecc42bdb2d55f2d54c4803b17',
    receiptDigest: 'c1ac5f2ee31f36ec95a9472b99af2cca0b9939ecfa8e8ba66e79990f94148656',
    releaseDigest: '205f480319f787e3c2a58ba95d265f5c4b349b1944fd770c4e3d532c4568759b',
    runId: '33230950008',
    stageId: 'C8C',
    terminalDigest: '8f907fe61b10173ccb0b49f964b08157c472b73e7ee0dda3ea570821487df602',
    treeSha: '4bc565bf7a544c9864a5148c23416de10a889633',
  },
  {
    artifactDigest: '6858abc1dbeb7db8937f498faef928d54f44f1c8bd73fca5ad37a0ccb3dc1545',
    artifactId: '9709259390',
    artifacts: [
      ['docs/OPS/R24/CORRECTIVE/C8D_STAGE_INSTANCE_V1.json', '03fb9fd8aa7991b74c240e9560258bbae2643aa0e6e65850f44849bdcd1acf9a', 'STAGE_INSTANCE'],
      ['docs/OPS/R24/CORRECTIVE/C8D_STAGE_ADMISSION_ATTESTATION_V1.json', 'b9ea68d0a608ffb9e681d10283e055b558e32d143d18ae09efe98bf2ac2d629e', 'STAGE_ADMISSION'],
      ['docs/OPS/R24/CORRECTIVE/C8D_PK1_SECURITY_PACKAGE_CONTRACT_V1.json', 'cce00920aacf24e60490e583bd5098ca2d468cd741cbdc776d08f40569d45795', 'ENVELOPE_CONTRACT'],
      ['docs/OPS/R24/CORRECTIVE/C8D_PK1_SECURITY_PACKAGE_EVIDENCE_V1.json', '52900c2f40ff13f95f80cced44a776b79e2dfeaa6050c8a9f48f34474fcabe33', 'ENVELOPE_EVIDENCE'],
      ['scripts/ops/r24/corrective/c8d-pk1-security-package.mjs', '39fd1a25864ac88e9135c4faad38da735cc0e0ed2fe58cba237a843e99bdfc7b', 'ENVELOPE_COMPILER'],
      ['test/contracts/r24-c8d-pk1-security-package.contract.test.mjs', 'f7d7f94b8790aab8eb4712c3f0cdb25b1f67fcb0d203c975488afed7af96255f', 'INDEPENDENT_CONTRACT_TEST'],
    ],
    candidateSha: '7fca2f11fb313d9055b1d414732daad1ba6a8f4a',
    mergeSha: 'a044da92cc85cbe54a7261a4c7430c83d7e85dbd',
    receiptDigest: 'b3e3c3fcdaa544ebaeebb5939d6fc03b2b314966c5d0c2acf8e2aeb632b07458',
    releaseDigest: '72f0fbba583a9ead2212e440c876acb1334e352ca2c4622fe9d98b4b5b3275db',
    runId: '33233687714',
    stageId: 'C8D',
    terminalDigest: '07c8ebd7c44e0c90bfd3bb3f7b04041aaec49c85fc14de79596ba22dd5a6e74c',
    treeSha: 'a0cd27dc14381c0c93f0c8fc5961814c8f77ae91',
  },
  {
    artifactDigest: '75b6c673638693cfb297db804e09c2e1732cd67417e27c4e12972357e00e4533',
    artifactId: '9709947115',
    artifacts: [
      ['docs/OPS/R24/CORRECTIVE/C8E_STAGE_INSTANCE_V1.json', '6d6ea53145265bf31465b81b7d0f0dfd66fa5dce35c2edd859e217af92eca696', 'STAGE_INSTANCE'],
      ['docs/OPS/R24/CORRECTIVE/C8E_STAGE_ADMISSION_ATTESTATION_V1.json', 'aa9280ce97c979691762f640249b787da2b0dd6484c3b8fd33534b1ef2de8ed8', 'STAGE_ADMISSION'],
      ['docs/OPS/R24/CORRECTIVE/C8E_V3_PACKAGE_COMPILER_CONTRACT_V1.json', '332eb5cf6c209eb93b4ac6d1b87a574fc4fe67d4e606c53b289c65ac18d03cff', 'ENVELOPE_CONTRACT'],
      ['docs/OPS/R24/CORRECTIVE/C8E_V3_PACKAGE_COMPILER_EVIDENCE_V1.json', '2813300f600e486780aaf59fc2d4abad8390cec54b5909bb5749aebcbc07098f', 'ENVELOPE_EVIDENCE'],
      ['scripts/ops/r24/corrective/c8e-v3-package-compiler.mjs', '3b53309705c3de961990ccc2f5293f47444f8a694d696c2d0e65fcce99d57c95', 'ENVELOPE_COMPILER'],
      ['test/contracts/r24-c8e-v3-package-compiler.contract.test.mjs', 'c48cb6f05e2e4cdff271c385bdb158e90ba09ddedc3442e17ad4e92cf5dfbf10', 'INDEPENDENT_CONTRACT_TEST'],
    ],
    candidateSha: 'e1db296dc8ca08626239468a2e57f01406f5857f',
    mergeSha: SOURCE_HEAD_SHA,
    receiptDigest: PREDECESSOR_CERTIFIED_DONE_RECEIPT_DIGEST,
    releaseDigest: PREDECESSOR_LEASE_RELEASE_DIGEST,
    runId: '33236049628',
    stageId: 'C8E',
    terminalDigest: PREDECESSOR_TERMINAL_DIGEST,
    treeSha: SOURCE_TREE_SHA,
  },
]);

export class C8ZRecertificationError extends Error {
  constructor(code, detail) { super(`${code}: ${detail}`); this.code = code; }
}
function fail(code, detail) { throw new C8ZRecertificationError(code, detail); }
function assert(condition, code, detail) { if (!condition) fail(code, detail); }
export function sha256(bytes) { return createHash('sha256').update(bytes).digest('hex'); }
function isHex64(value) { return typeof value === 'string' && /^[0-9a-f]{64}$/u.test(value); }
function sameArray(left, right) { return JSON.stringify(left) === JSON.stringify(right); }

function readJsonBytes(repoRoot, relativePath, canonical = false) {
  const bytes = fs.readFileSync(path.join(repoRoot, relativePath));
  const value = JSON.parse(bytes.toString('utf8'));
  if (canonical) assert(bytes.equals(canonicalBytes(value)), 'E_NON_CANONICAL_INPUT', relativePath);
  return { bytes, digest: sha256(bytes), value };
}
function git(repoRoot, args) {
  const result = spawnSync('git', args, { cwd: repoRoot, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, timeout: 30000 });
  assert(result.status === 0, 'E_GIT', `${args.join(' ')}:${String(result.stderr || '').trim()}`);
  return String(result.stdout || '').trim();
}
function statusPaths(repoRoot) {
  const result = spawnSync('git', ['status', '--porcelain=v1', '--untracked-files=all'], { cwd: repoRoot, encoding: 'utf8', timeout: 30000 });
  assert(result.status === 0, 'E_GIT', 'status');
  const output = String(result.stdout || '').trimEnd();
  return output ? output.split('\n').map((line) => line.slice(3)).sort(LEXICAL) : [];
}

export function validateCandidateDelta(observation) {
  const { candidateSha, changedPaths = [], commitCount, sourceIsAncestor } = observation || {};
  assert(/^[0-9a-f]{40}$/u.test(candidateSha || ''), 'E_DELTA_SHA', String(candidateSha));
  assert(sourceIsAncestor === true, 'E_SOURCE_HEAD_NOT_ANCESTOR', candidateSha);
  assert(Number.isInteger(commitCount) && commitCount >= 0 && commitCount <= 2, 'E_UNBOUNDED_DELTA', String(commitCount));
  if (candidateSha === SOURCE_HEAD_SHA) assert(commitCount === 0 && changedPaths.length === 0, 'E_SOURCE_DELTA_NOT_EMPTY', candidateSha);
  else assert(commitCount >= 1, 'E_DESCENDANT_DELTA_EMPTY', candidateSha);
  for (const relativePath of changedPaths) {
    assert(relativePath === path.posix.normalize(relativePath) && !path.posix.isAbsolute(relativePath)
      && !relativePath.startsWith('../') && !relativePath.includes('\\') && WRITE_SET.includes(relativePath), 'E_WRITE_SET_DRIFT', relativePath);
  }
  assert(new Set(changedPaths).size === changedPaths.length, 'E_DELTA_PATH_DUPLICATE', candidateSha);
  return true;
}
function observeCandidateDelta(repoRoot, candidateSha) {
  if (candidateSha === SOURCE_HEAD_SHA) return validateCandidateDelta({ candidateSha, changedPaths: [], commitCount: 0, sourceIsAncestor: true });
  const ancestor = spawnSync('git', ['merge-base', '--is-ancestor', SOURCE_HEAD_SHA, candidateSha], { cwd: repoRoot });
  return validateCandidateDelta({
    candidateSha,
    changedPaths: git(repoRoot, ['diff', '--name-only', SOURCE_HEAD_SHA, candidateSha]).split('\n').filter(Boolean),
    commitCount: Number(git(repoRoot, ['rev-list', '--count', `${SOURCE_HEAD_SHA}..${candidateSha}`])),
    sourceIsAncestor: ancestor.status === 0,
  });
}
export function assertHeadContour(repoRoot = process.cwd()) {
  assert(git(repoRoot, ['rev-parse', `${SOURCE_HEAD_SHA}^{tree}`]) === SOURCE_TREE_SHA, 'E_SOURCE_TREE', SOURCE_TREE_SHA);
  const currentHead = git(repoRoot, ['rev-parse', 'HEAD']);
  const originMainSha = git(repoRoot, ['rev-parse', 'origin/main']);
  observeCandidateDelta(repoRoot, currentHead);
  observeCandidateDelta(repoRoot, originMainSha);
  for (const relativePath of statusPaths(repoRoot)) assert(WRITE_SET.includes(relativePath), 'E_DIRTY_PATH_OUTSIDE_WRITE_SET', relativePath);
  return { currentHead, originMainSha };
}

export function validateTransferPath(stageId, relativePath) {
  assert(relativePath === path.posix.normalize(relativePath) && !path.posix.isAbsolute(relativePath)
    && !relativePath.startsWith('../') && !relativePath.includes('\\'), 'E_TRANSFER_PATH_NORMALIZATION', relativePath);
  const currentIndex = ENVELOPES.findIndex((entry) => entry.stageId === stageId);
  assert(currentIndex >= 0, 'E_TRANSFER_STAGE', stageId);
  if (relativePath === PATHS.inventory || relativePath === PATHS.activeApprovals) return true;
  for (const later of ENVELOPES.slice(currentIndex + 1)) {
    const stem = later.stageId.toLowerCase();
    if (relativePath.startsWith(`docs/OPS/R24/CORRECTIVE/${later.stageId}_`)
      || relativePath.startsWith(`scripts/ops/r24/corrective/${stem}-`)
      || relativePath.startsWith(`test/contracts/r24-${stem}-`)) return true;
  }
  fail('E_SEPARATED_ENVELOPE_DRIFT', `${stageId}:${relativePath}`);
}

function observeEnvelopeTransfer(repoRoot, envelope) {
  const ancestor = spawnSync('git', ['merge-base', '--is-ancestor', envelope.mergeSha, SOURCE_HEAD_SHA], { cwd: repoRoot });
  assert(ancestor.status === 0, 'E_ENVELOPE_NON_ANCESTOR', envelope.stageId);
  assert(git(repoRoot, ['rev-parse', `${envelope.mergeSha}^{tree}`]) === envelope.treeSha, 'E_ENVELOPE_TREE', envelope.stageId);
  const changedPaths = git(repoRoot, ['diff', '--name-only', envelope.mergeSha, SOURCE_HEAD_SHA]).split('\n').filter(Boolean);
  changedPaths.forEach((relativePath) => validateTransferPath(envelope.stageId, relativePath));
  return {
    commitCount: Number(git(repoRoot, ['rev-list', '--count', `${envelope.mergeSha}..${SOURCE_HEAD_SHA}`])),
    pathCount: changedPaths.length,
    pathListDigest: sha256(canonicalBytes(changedPaths)),
    sourceIsAncestor: true,
  };
}

export function assertPathlessPublicEvidence(value) {
  const visit = (candidate) => {
    if (typeof candidate === 'string') assert(!candidate.includes('/Users/') && !candidate.includes('/Volumes/') && !candidate.includes('/private/') && !candidate.includes('\\'), 'E_PUBLIC_PATH_LEAK', candidate);
    else if (Array.isArray(candidate)) candidate.forEach(visit);
    else if (candidate && typeof candidate === 'object') Object.values(candidate).forEach(visit);
  };
  visit(value);
  return true;
}

function validateBindings(repoRoot) {
  const fixed = [
    [PATHS.program, PROGRAM_TEMPLATE_DIGEST], [PATHS.registry, STAGE_REGISTRY_DIGEST],
    [PATHS.trust, TRUST_MODEL_DIGEST], [PATHS.standing, OWNER_BINDING_DIGEST],
    [PATHS.stageInstance, STAGE_INSTANCE_DIGEST], [PATHS.stageAdmission, STAGE_ADMISSION_DIGEST],
  ];
  for (const [relativePath, digest] of fixed) assert(readJsonBytes(repoRoot, relativePath, true).digest === digest, 'E_FIXED_BINDING', relativePath);
  const instance = readJsonBytes(repoRoot, PATHS.stageInstance, true).value;
  const admission = readJsonBytes(repoRoot, PATHS.stageAdmission, true).value;
  assert(instance.stageId === STAGE_ID && instance.baseSha === SOURCE_HEAD_SHA && instance.treeSha === SOURCE_TREE_SHA, 'E_STAGE_BINDING', STAGE_ID);
  assert(instance.predecessorTerminalDigest === PREDECESSOR_TERMINAL_DIGEST
    && instance.predecessorCertifiedDoneReceiptDigest === PREDECESSOR_CERTIFIED_DONE_RECEIPT_DIGEST
    && instance.predecessorLeaseReleaseDigest === PREDECESSOR_LEASE_RELEASE_DIGEST, 'E_PREDECESSOR_BINDING', STAGE_ID);
  assert(admission.status === 'ADMITTED' && admission.stageInstanceDigest === STAGE_INSTANCE_DIGEST
    && admission.acceptanceSignalsDigest === ACCEPTANCE_SIGNALS_DIGEST
    && admission.writeSetDigest === WRITE_SET_DIGEST, 'E_ADMISSION_BINDING', STAGE_ID);
  assert(sameArray(instance.writeSet.paths, WRITE_SET), 'E_WRITE_SET', STAGE_ID);
  const leaseBytes = fs.readFileSync(LOCAL_LEASE);
  const fenceBytes = fs.readFileSync(LOCAL_FENCE);
  const lease = JSON.parse(leaseBytes);
  const fence = JSON.parse(fenceBytes);
  assert(sha256(leaseBytes) === LEASE_DIGEST && sha256(fenceBytes) === FENCE_DIGEST, 'E_LEASE_FENCE_DIGEST', STAGE_ID);
  assert(lease.status === 'ACTIVE' && fence.status === 'ACTIVE' && lease.fencingCounter === FENCE_COUNTER && fence.fencingCounter === FENCE_COUNTER
    && lease.stageAdmissionDigest === STAGE_ADMISSION_DIGEST && fence.stageAdmissionDigest === STAGE_ADMISSION_DIGEST, 'E_LEASE_FENCE_STATE', STAGE_ID);
  for (const envelope of ENVELOPES) {
    for (const [relativePath, digest] of envelope.artifacts) {
      const bytes = fs.readFileSync(path.join(repoRoot, relativePath));
      if (relativePath.endsWith('.json')) assert(bytes.equals(canonicalBytes(JSON.parse(bytes))), 'E_NON_CANONICAL_ENVELOPE_ARTIFACT', relativePath);
      assert(sha256(bytes) === digest, 'E_ENVELOPE_ARTIFACT_DRIFT', relativePath);
    }
    assert(isHex64(envelope.terminalDigest) && isHex64(envelope.receiptDigest) && isHex64(envelope.releaseDigest)
      && isHex64(envelope.artifactDigest), 'E_ENVELOPE_EXTERNAL_BINDING', envelope.stageId);
  }
  return { admission, instance };
}

function publicEnvelope(repoRoot, envelope) {
  const transfer = observeEnvelopeTransfer(repoRoot, envelope);
  return {
    artifacts: envelope.artifacts.map(([, digest, role], index) => ({
      capabilityId: `CAP_R24_${envelope.stageId}_IMMUTABLE_${index + 1}`,
      role,
      sha256: digest,
    })),
    certification: {
      artifactDigest: envelope.artifactDigest,
      artifactId: envelope.artifactId,
      receiptDigest: envelope.receiptDigest,
      releaseDigest: envelope.releaseDigest,
      runId: envelope.runId,
      status: 'VERIFIED',
      terminalAttestationBytesDigest: envelope.terminalDigest,
    },
    exactIdentity: {
      implementationCandidateSha: envelope.candidateSha,
      implementationMergeSha: envelope.mergeSha,
      treeSha: envelope.treeSha,
    },
    stageId: envelope.stageId,
    status: 'CURRENT_HEAD_RECERTIFIED',
    transfer,
  };
}

function inventorySummary(repoRoot) {
  const inventory = buildInventory(repoRoot);
  assert(inventory.totals.requiredSkips === 0 && inventory.totals.unexplainedSkips === 0, 'E_TEST_INVENTORY_SKIPS', JSON.stringify(inventory.totals));
  return { all: inventory.totals.all, requiredSkips: 0, unexplainedSkips: 0 };
}

export function buildContract(repoRoot = process.cwd()) {
  validateBindings(repoRoot);
  assertHeadContour(repoRoot);
  const envelopes = ENVELOPES.map((entry) => publicEnvelope(repoRoot, entry));
  const contract = {
    acceptanceContract: {
      ALL_C8_ENVELOPES_CURRENT_HEAD: true,
      C8A_THROUGH_C8E_TERMINAL_CHAIN_BOUND: true,
      C8E_CERTIFIED_DEPENDENCY: true,
      FIXED_AUTHORITY_BINDING: true,
      NO_SKIPPED_REQUIRED_ENVELOPE: true,
      SEPARATED_ENVELOPE_DELTA_TRANSFER_PASS: true,
      TYPED_NOT_READY_WITHOUT_FALSE_DONE: true,
      UMBRELLA_CURRENT_HEAD_RECERTIFIED: true,
    },
    claimCeiling: {
      envelopeCount: 5,
      profileVerdict: 'NOT_READY',
      productionReleaseReady: false,
      programDone: false,
      programVerdict: 'NEEDS_MORE_EVIDENCE',
      recursiveClosurePrUsed: false,
      signingNotarizationDistribution: false,
    },
    envelopes,
    externalTerminalAttestation: { required: true, status: 'AWAITING_POST_MERGE_EXTERNAL_C8Z_ATTESTATION' },
    observedAtUtc: OBSERVED_AT_UTC,
    schemaVersion: 'YALKEN_R24_C8Z_UMBRELLA_CURRENT_HEAD_CONTRACT_V1',
    sourceBindings: {
      acceptanceSignalsDigest: ACCEPTANCE_SIGNALS_DIGEST,
      fenceCounter: FENCE_COUNTER,
      fenceDigest: FENCE_DIGEST,
      leaseDigest: LEASE_DIGEST,
      ownerBindingDigest: OWNER_BINDING_DIGEST,
      predecessorCertifiedDoneReceiptDigest: PREDECESSOR_CERTIFIED_DONE_RECEIPT_DIGEST,
      predecessorLeaseReleaseDigest: PREDECESSOR_LEASE_RELEASE_DIGEST,
      predecessorTerminalDigest: PREDECESSOR_TERMINAL_DIGEST,
      programTemplateDigest: PROGRAM_TEMPLATE_DIGEST,
      sourceHeadSha: SOURCE_HEAD_SHA,
      sourceTreeSha: SOURCE_TREE_SHA,
      stageAdmissionDigest: STAGE_ADMISSION_DIGEST,
      stageInstanceDigest: STAGE_INSTANCE_DIGEST,
      stageRegistryDigest: STAGE_REGISTRY_DIGEST,
      trustModelDigest: TRUST_MODEL_DIGEST,
      writeSetDigest: WRITE_SET_DIGEST,
    },
    stageId: STAGE_ID,
    status: 'CURRENT_HEAD_EVALUATED_PENDING_EXTERNAL_TERMINAL_ATTESTATION',
  };
  validateContract(contract);
  return contract;
}

export function validateContract(contract) {
  assert(contract.schemaVersion === 'YALKEN_R24_C8Z_UMBRELLA_CURRENT_HEAD_CONTRACT_V1' && contract.stageId === STAGE_ID, 'E_CONTRACT_SCHEMA', STAGE_ID);
  assert(contract.envelopes?.length === 5 && sameArray(contract.envelopes.map((entry) => entry.stageId), ENVELOPES.map((entry) => entry.stageId)), 'E_ENVELOPE_SET', STAGE_ID);
  for (const envelope of contract.envelopes) {
    assert(envelope.status === 'CURRENT_HEAD_RECERTIFIED' && envelope.certification?.status === 'VERIFIED', 'E_ENVELOPE_STATUS', envelope.stageId);
    assert(envelope.transfer?.sourceIsAncestor === true && isHex64(envelope.transfer?.pathListDigest), 'E_TRANSFER_PROOF', envelope.stageId);
    assert(envelope.artifacts?.length === 6 && envelope.artifacts.every((entry) => isHex64(entry.sha256)), 'E_ARTIFACT_BINDING', envelope.stageId);
  }
  assert(Object.values(contract.acceptanceContract || {}).every((value) => value === true), 'E_ACCEPTANCE_CONTRACT', STAGE_ID);
  assert(contract.claimCeiling?.profileVerdict === 'NOT_READY' && contract.claimCeiling?.programVerdict === 'NEEDS_MORE_EVIDENCE'
    && contract.claimCeiling?.productionReleaseReady === false && contract.claimCeiling?.programDone === false
    && contract.claimCeiling?.signingNotarizationDistribution === false && contract.claimCeiling?.recursiveClosurePrUsed === false, 'E_FALSE_DONE', STAGE_ID);
  assert(contract.externalTerminalAttestation?.required === true
    && contract.externalTerminalAttestation?.status === 'AWAITING_POST_MERGE_EXTERNAL_C8Z_ATTESTATION', 'E_TERMINAL_STATE', STAGE_ID);
  assertPathlessPublicEvidence(contract);
  return true;
}

export function buildEvaluation(repoRoot = process.cwd(), contract = buildContract(repoRoot)) {
  const testInventory = inventorySummary(repoRoot);
  const evaluation = {
    acceptanceSignals: {
      ALL_C8_ENVELOPES_CURRENT_HEAD: 'PASS',
      C8A_THROUGH_C8E_TERMINAL_CHAIN_BOUND: 'PASS',
      C8E_CERTIFIED_DEPENDENCY: 'PASS',
      EXTERNAL_TERMINAL_ATTESTATION_VERIFIED: 'PENDING_POST_MERGE_EXTERNAL_C8Z_ATTESTATION',
      FIXED_AUTHORITY_BINDING: 'PASS',
      NO_SKIPPED_REQUIRED_ENVELOPE: 'PASS',
      SEPARATED_ENVELOPE_DELTA_TRANSFER_PASS: 'PASS',
      TYPED_NOT_READY_WITHOUT_FALSE_DONE: 'PASS',
      UMBRELLA_CURRENT_HEAD_RECERTIFIED: 'PASS',
    },
    claim: {
      envelopeCount: 5,
      envelopePassCount: 5,
      profileVerdict: 'NOT_READY',
      productionReleaseReady: false,
      programDone: false,
      programVerdict: 'NEEDS_MORE_EVIDENCE',
    },
    contractDigest: sha256(canonicalBytes(contract)),
    envelopeEvaluations: contract.envelopes.map((entry) => ({
      artifactCount: entry.artifacts.length,
      pathCount: entry.transfer.pathCount,
      stageId: entry.stageId,
      status: entry.status,
      terminalStatus: entry.certification.status,
    })),
    evidenceStampIds: [CONTROL_PLANE_EVIDENCE_STAMP_ID],
    externalTerminalAttestation: { required: true, status: 'AWAITING_POST_MERGE_EXTERNAL_C8Z_ATTESTATION' },
    observedAtUtc: OBSERVED_AT_UTC,
    schemaVersion: 'YALKEN_R24_C8Z_CURRENT_HEAD_EVALUATION_V1',
    sourceHeadSha: SOURCE_HEAD_SHA,
    sourceTreeSha: SOURCE_TREE_SHA,
    stageId: STAGE_ID,
    status: 'CURRENT_HEAD_EVALUATED_PENDING_EXTERNAL_TERMINAL_ATTESTATION',
    testInventory,
  };
  validateEvaluation(evaluation, contract);
  return evaluation;
}

export function validateEvaluation(evaluation, contract) {
  assert(evaluation.schemaVersion === 'YALKEN_R24_C8Z_CURRENT_HEAD_EVALUATION_V1' && evaluation.stageId === STAGE_ID, 'E_EVALUATION_SCHEMA', STAGE_ID);
  assert(evaluation.contractDigest === sha256(canonicalBytes(contract)), 'E_CONTRACT_DIGEST', STAGE_ID);
  assert(evaluation.envelopeEvaluations?.length === 5 && evaluation.envelopeEvaluations.every((entry) => entry.status === 'CURRENT_HEAD_RECERTIFIED'
    && entry.terminalStatus === 'VERIFIED' && entry.artifactCount === 6), 'E_EVALUATION_ENVELOPES', STAGE_ID);
  assert(evaluation.testInventory?.requiredSkips === 0 && evaluation.testInventory?.unexplainedSkips === 0, 'E_EVALUATION_SKIPS', STAGE_ID);
  assert(evaluation.claim?.envelopeCount === 5 && evaluation.claim?.envelopePassCount === 5
    && evaluation.claim?.profileVerdict === 'NOT_READY' && evaluation.claim?.programVerdict === 'NEEDS_MORE_EVIDENCE'
    && evaluation.claim?.productionReleaseReady === false && evaluation.claim?.programDone === false, 'E_EVALUATION_FALSE_DONE', STAGE_ID);
  assert(evaluation.acceptanceSignals?.EXTERNAL_TERMINAL_ATTESTATION_VERIFIED === 'PENDING_POST_MERGE_EXTERNAL_C8Z_ATTESTATION', 'E_EVALUATION_TERMINAL', STAGE_ID);
  assertPathlessPublicEvidence(evaluation);
  return true;
}

export function buildLedger(contract, evaluation) {
  const ledger = {
    appendOnly: true,
    currentCertificationSet: contract.envelopes.map((entry) => ({
      implementationMergeSha: entry.exactIdentity.implementationMergeSha,
      receiptDigest: entry.certification.receiptDigest,
      stageId: entry.stageId,
      status: 'CURRENT_HEAD_RECERTIFIED',
      terminalAttestationBytesDigest: entry.certification.terminalAttestationBytesDigest,
    })),
    historicalReceiptsRemainImmutable: true,
    observedAtUtc: OBSERVED_AT_UTC,
    schemaVersion: 'YALKEN_R24_C8Z_RECERTIFICATION_LEDGER_V1',
    sourceContractDigest: evaluation.contractDigest,
    sourceEvaluationDigest: sha256(canonicalBytes(evaluation)),
    stageId: STAGE_ID,
  };
  validateLedger(ledger);
  return ledger;
}

export function validateLedger(ledger) {
  assert(ledger.appendOnly === true && ledger.historicalReceiptsRemainImmutable === true, 'E_LEDGER_IMMUTABILITY', STAGE_ID);
  assert(ledger.currentCertificationSet?.length === 5 && sameArray(ledger.currentCertificationSet.map((entry) => entry.stageId), ENVELOPES.map((entry) => entry.stageId)), 'E_LEDGER_SET', STAGE_ID);
  assert(ledger.currentCertificationSet.every((entry) => entry.status === 'CURRENT_HEAD_RECERTIFIED'
    && isHex64(entry.receiptDigest) && isHex64(entry.terminalAttestationBytesDigest)), 'E_LEDGER_BINDING', STAGE_ID);
  assertPathlessPublicEvidence(ledger);
  return true;
}

function approvalEntry(filePath, bytes) {
  return {
    approvedAtUtc: OBSERVED_AT_UTC,
    approvedBy: `owner-standing-authority:${OWNER_BINDING_DIGEST}`,
    filePath,
    rationale: `C8Z umbrella current-head recertification under StageInstance ${STAGE_INSTANCE_DIGEST}; five separated C8 envelopes, immutable terminal chain and successor-only delta transfer are bound while NOT_READY, NEEDS_MORE_EVIDENCE, no release, signing, notarization, distribution, profile transfer, recursive closure PR or Program DONE remain fail-closed.`,
    sha256: sha256(bytes),
  };
}
function buildApprovals(repoRoot, artifacts) {
  const entries = [
    [PATHS.inventory, artifacts.inventoryBytes], [PATHS.contract, artifacts.contractBytes],
    [PATHS.evaluation, artifacts.evaluationBytes], [PATHS.ledger, artifacts.ledgerBytes],
    [PATHS.stageAdmission, fs.readFileSync(path.join(repoRoot, PATHS.stageAdmission))],
    [PATHS.stageInstance, fs.readFileSync(path.join(repoRoot, PATHS.stageInstance))],
    [PATHS.script, fs.readFileSync(path.join(repoRoot, PATHS.script))],
    [PATHS.test, fs.readFileSync(path.join(repoRoot, PATHS.test))],
  ].map(([filePath, bytes]) => approvalEntry(filePath, bytes)).sort((left, right) => LEXICAL(left.filePath, right.filePath));
  return { approvals: entries, evidenceStampIds: [CONTROL_PLANE_EVIDENCE_STAMP_ID], version: 'v1.0' };
}
function buildActiveApprovals(repoRoot, artifacts) {
  const active = readJsonBytes(repoRoot, PATHS.activeApprovals, true).value;
  const currentPaths = new Set([PATHS.inventory, PATHS.approvals, PATHS.contract, PATHS.evaluation, PATHS.ledger, PATHS.stageAdmission, PATHS.stageInstance, PATHS.script, PATHS.test]);
  const retained = (active.approvals || []).filter((entry) => !currentPaths.has(entry.filePath));
  const additions = [
    [PATHS.inventory, artifacts.inventoryBytes], [PATHS.approvals, artifacts.approvalsBytes],
    [PATHS.contract, artifacts.contractBytes], [PATHS.evaluation, artifacts.evaluationBytes], [PATHS.ledger, artifacts.ledgerBytes],
    [PATHS.stageAdmission, fs.readFileSync(path.join(repoRoot, PATHS.stageAdmission))],
    [PATHS.stageInstance, fs.readFileSync(path.join(repoRoot, PATHS.stageInstance))],
    [PATHS.script, fs.readFileSync(path.join(repoRoot, PATHS.script))],
    [PATHS.test, fs.readFileSync(path.join(repoRoot, PATHS.test))],
  ].map(([filePath, bytes]) => approvalEntry(filePath, bytes));
  return { ...active, approvals: [...retained, ...additions] };
}

function buildArtifacts(repoRoot) {
  validateBindings(repoRoot);
  assertHeadContour(repoRoot);
  const inventoryBytes = canonicalBytes(buildInventory(repoRoot));
  const contract = buildContract(repoRoot);
  const contractBytes = canonicalBytes(contract);
  const evaluation = buildEvaluation(repoRoot, contract);
  const evaluationBytes = canonicalBytes(evaluation);
  const ledgerBytes = canonicalBytes(buildLedger(contract, evaluation));
  const provisional = { contractBytes, evaluationBytes, inventoryBytes, ledgerBytes };
  const approvalsBytes = canonicalBytes(buildApprovals(repoRoot, provisional));
  const activeApprovalsBytes = canonicalBytes(buildActiveApprovals(repoRoot, { ...provisional, approvalsBytes }));
  return { ...provisional, activeApprovalsBytes, approvalsBytes };
}
function writeArtifacts(repoRoot, artifacts) {
  for (const [relativePath, bytes] of [
    [PATHS.inventory, artifacts.inventoryBytes], [PATHS.contract, artifacts.contractBytes],
    [PATHS.evaluation, artifacts.evaluationBytes], [PATHS.ledger, artifacts.ledgerBytes],
    [PATHS.approvals, artifacts.approvalsBytes], [PATHS.activeApprovals, artifacts.activeApprovalsBytes],
  ]) fs.writeFileSync(path.join(repoRoot, relativePath), bytes);
}
function checkArtifacts(repoRoot, artifacts) {
  for (const [relativePath, bytes] of [
    [PATHS.inventory, artifacts.inventoryBytes], [PATHS.contract, artifacts.contractBytes],
    [PATHS.evaluation, artifacts.evaluationBytes], [PATHS.ledger, artifacts.ledgerBytes],
    [PATHS.approvals, artifacts.approvalsBytes], [PATHS.activeApprovals, artifacts.activeApprovalsBytes],
  ]) assert(fs.readFileSync(path.join(repoRoot, relativePath)).equals(bytes), 'E_GENERATED_DRIFT', relativePath);
  return true;
}

export function runProbe(repoRoot = process.cwd()) {
  const contract = buildContract(repoRoot);
  const evaluation = buildEvaluation(repoRoot, contract);
  const ledger = buildLedger(contract, evaluation);
  const mutants = [
    ['CONTRACT_DROP_ENVELOPE', contract, (candidate) => { candidate.envelopes.pop(); }, (candidate) => validateContract(candidate)],
    ['CONTRACT_SKIP_ENVELOPE', contract, (candidate) => { candidate.envelopes[0].status = 'SKIPPED'; }, (candidate) => validateContract(candidate)],
    ['CONTRACT_FALSE_RELEASE', contract, (candidate) => { candidate.claimCeiling.productionReleaseReady = true; }, (candidate) => validateContract(candidate)],
    ['CONTRACT_FALSE_DONE', contract, (candidate) => { candidate.claimCeiling.programDone = true; }, (candidate) => validateContract(candidate)],
    ['CONTRACT_TERMINAL_MISSING', contract, (candidate) => { candidate.envelopes[1].certification.status = 'MISSING'; }, (candidate) => validateContract(candidate)],
    ['EVALUATION_SKIP', evaluation, (candidate) => { candidate.testInventory.requiredSkips = 1; }, (candidate) => validateEvaluation(candidate, contract)],
    ['EVALUATION_PROGRAM_PASS', evaluation, (candidate) => { candidate.claim.programVerdict = 'PASS'; }, (candidate) => validateEvaluation(candidate, contract)],
    ['LEDGER_DROP', ledger, (candidate) => { candidate.currentCertificationSet.pop(); }, (candidate) => validateLedger(candidate)],
    ['LEDGER_MUTABLE', ledger, (candidate) => { candidate.appendOnly = false; }, (candidate) => validateLedger(candidate)],
  ];
  const probeResults = mutants.map(([id, original, mutate, validate]) => {
    const candidate = structuredClone(original);
    mutate(candidate);
    try { validate(candidate); return { id, killed: false }; }
    catch { return { id, killed: true }; }
  });
  assert(probeResults.every((entry) => entry.killed), 'E_MUTANT_SURVIVED', JSON.stringify(probeResults));
  return { mutantsKilled: probeResults.length, mutantsTotal: probeResults.length, probeResults };
}

function main() {
  const repoRoot = process.cwd();
  const mode = process.argv[2] || '--check';
  if (mode === '--probe') {
    process.stdout.write(`${JSON.stringify({ decision: 'C8Z_MUTATION_PROBE_PASS', ...runProbe(repoRoot) })}\n`);
    return;
  }
  const artifacts = buildArtifacts(repoRoot);
  if (mode === '--write') writeArtifacts(repoRoot, artifacts);
  else if (mode !== '--check') fail('E_MODE', mode);
  checkArtifacts(repoRoot, mode === '--write' ? buildArtifacts(repoRoot) : artifacts);
  process.stdout.write(`${JSON.stringify({
    contractDigest: sha256(artifacts.contractBytes),
    decision: mode === '--write' ? 'C8Z_ARTIFACTS_WRITTEN' : 'C8Z_ARTIFACTS_CURRENT',
    evaluationDigest: sha256(artifacts.evaluationBytes),
    ledgerDigest: sha256(artifacts.ledgerBytes),
    stageId: STAGE_ID,
  })}\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) main();
