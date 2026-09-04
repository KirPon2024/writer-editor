#!/usr/bin/env node
// R2.4 E0 — docs claim linter for the R2.4 mission surface.
// Law: within docs/OPS/R24, any file carrying a claim term (PASS, DONE,
// READY, CLOSED, SAFE, COMPLETE) must reference at least one evidence stamp
// id that exists as a stamped artifact in docs/OPS/R24/EVIDENCE.
// Claim text without a resolvable stamp fails closed.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { readJsonBounded, sha256hex } from './canonical-json.mjs';
import { buildEvidenceStamp } from './terminal-receipt.mjs';
import { buildClaimBinding } from './claim-binding.mjs';

const CLAIM_TERMS = ['PASS', 'DONE', 'READY', 'CLOSED', 'SAFE', 'COMPLETE'];
const CLAIM_RE = new RegExp(`\\b(${CLAIM_TERMS.join('|')})\\b`);

// Immutable node carriers that included the mutable inventory remain exact
// historical evidence, never coverage of today's inventory. No arbitrary
// stamp, path, digest or future-head fallback is allowed.
export const HISTORICAL_INVENTORY_CLAIM_PINS_V1 = Object.freeze([
  Object.freeze({ stampId: 'ES-R24-WP-703-DOCX-PROFILE-CLAIM-BINDINGS', stampSha256: '82f1e92a55570f31bb04049efe5bfaa87f3c4ce4bf16cb8f7196fd6adc589143',
    evaluationSha: '5a6c46b3c6a8a8e1f945e1d72c0302cb78d4763f', evaluationTree: '0731572227f0a63598f1cd57c6cc9453c22b47e3', targetSha256: '7f315e0a188cabc597d60f5e11180ed7bde828d1d495b88e27d73e0b47859d0f' }),
  Object.freeze({ stampId: 'ES-R24-WP-601-LOCAL-AUTOMATION-CLAIM-BINDINGS', stampSha256: 'dee1e05585eacbeab2f392a517f1ebc1ace03276769cba35620d9991a1b48628',
    evaluationSha: '91dd652595d2d9ea47d74cbf9edfa6a21b7f277e', evaluationTree: '689c5ea5449c42ba6af5402a75b9930a9e85e7d4', targetSha256: 'bd6d7f4b8abebf9db7e0ff097c3d0b8656e5f0db9140c57ac31f2d78f3f3786e' }),
]);
// Append-only WP705 successor: the two newly pinned carriers retain their
// introduction identities. V1 and all original stamps remain unchanged.
export const HISTORICAL_INVENTORY_CLAIM_PINS_V2 = Object.freeze([
  ...HISTORICAL_INVENTORY_CLAIM_PINS_V1,
  Object.freeze({ stampId: 'ES-R24-WP-704-PDF-ARCHIVE-REVIEW-CLAIM-BINDINGS', stampSha256: '36af1952abd36d8d9e4fb783f4e994f7de48f34f2f206974a98595180dba2d95',
    evaluationSha: '25f485f2d8a3c3b6f62db862bd68e61523918eab', evaluationTree: '8bd8522088018d75f0935fe2c1d389b467b30881', targetSha256: 'd2fb096e242d00b68a821136c68cc441f0dd76f72d126998f9307bafff781d2e' }),
  Object.freeze({ stampId: 'ES-R24-WP-705-NEGOTIATION-CORPUS-CLAIM-BINDINGS', stampSha256: '8a115fc86172547d9d39c04bb357778533f47d4290dac0c570fc7dcf6c23318b',
    evaluationSha: '50d298b2538d5a5303c80330479577016e56c17a', evaluationTree: '65d663d297d1cc5acec9f093e1e026d0d625d5e5', targetSha256: 'fd5708bbe764edb3dbf3d99a9ca5c38a7fa49334b776e68dc34369f0468ee782' }),
]);
// P01 delivery compatibility: WP602 is historical at its completed merge.
// This extra pin does not satisfy coverage of the current test inventory.
export const HISTORICAL_INVENTORY_CLAIM_PINS_V3 = Object.freeze([
  ...HISTORICAL_INVENTORY_CLAIM_PINS_V2,
  Object.freeze({ stampId: 'ES-R24-WP-602-PROPOSAL-WORKFLOW-CLAIM-BINDINGS', stampSha256: 'ef55a2e1647dc330de04bd5f9e50a93b19c980f9add1d606dbb56055e7e54b3c',
    evaluationSha: 'dd2e7925715b3a8a16b7b226d8c305371ae431c7', evaluationTree: 'ca85eca9303d0da3b4ed6fc421baba746b1461a8', targetSha256: 'aa27bde53c1705191956fcbcf3f96f3b922ec502e132780cea1188a7057880e7' }),
]);
// WP603 recovery compatibility: preserve the original merged inventory binding
// at the exact PR1823 merge identity while a successor binds today's inventory.
export const HISTORICAL_INVENTORY_CLAIM_PINS_V4 = Object.freeze([
  ...HISTORICAL_INVENTORY_CLAIM_PINS_V3,
  Object.freeze({ stampId: 'ES-R24-WP-603-WSE-STATE-EVIDENCE-CLAIM-BINDINGS', stampSha256: 'aa2de25e282a70b50c46a21d929d528ffc34be40075beac85ca94a19bb1b0a7c',
    evaluationSha: 'ace5488721423d1542515ce16c092054511a31ee', evaluationTree: '860ff112568115851c25505fd7c563cc9ad84df1', targetSha256: '4cf523c0956b5ba02810b76c47bc949f060ee31ebcfe70ff4c85b3dd85922232' }),
]);
// WP604 successor compatibility: the WP603 packaged-recovery binding was the
// current inventory proof at the exact WP603 terminal merge. Preserve those
// bytes as historical evidence when WP604 refreshes the exhaustive inventory.
export const HISTORICAL_INVENTORY_CLAIM_PINS_V5 = Object.freeze([
  ...HISTORICAL_INVENTORY_CLAIM_PINS_V4,
  Object.freeze({ stampId: 'ES-R24-WP-603-PACKAGED-RECOVERY-CLAIM-BINDINGS', stampSha256: '49a0c6d820d9110158050298d193604759e484109f37fcf457cb804fc74a317f',
    evaluationSha: 'bf3b3c3c57e8f2268dc5f0be213c27de0002e5ff', evaluationTree: 'cfe9d94520d922a04c333be358875988dd15eb2e', targetSha256: '0f1e2c9ca3f5e0d1f59b5a1d9e1dbdf1282f5ea281398e62dd3ab4cb9126301a' }),
]);
// WP605 successor compatibility: retain the WP604 inventory binding at the
// exact WP604 terminal merge while WP605 publishes the current inventory.
export const HISTORICAL_INVENTORY_CLAIM_PINS_V6 = Object.freeze([
  ...HISTORICAL_INVENTORY_CLAIM_PINS_V5,
  Object.freeze({ stampId: 'ES-R24-WP-604-WSE-THREADS-EXPLANATION-CLAIM-BINDINGS', stampSha256: '85baf335f693b427e15621259149b7ae9e9604d9a752b1ae33c5cc6503491426',
    evaluationSha: '250fa6533776556a6f98c07b03ef6d179fb62c79', evaluationTree: 'fc4fa5757cdbeddc188420fad1382559ed11043a', targetSha256: 'ed1f50c0265e6dc52b685ad160b4a0f491b2e9726e586f9e8526442f0ca0848c' }),
]);
const INVENTORY_PATH = 'docs/OPS/R24/CORRECTIVE/C1B_TEST_INVENTORY_V1.json';
const historicalGit = (rootDir, args) => execFileSync('git', args, { cwd: rootDir, encoding: null, maxBuffer: 4 * 1024 * 1024, timeout: 15000, stdio: ['ignore','pipe','pipe'] });
export function verifyHistoricalInventoryClaim({ rootDir, stamp, stampBytes, binding, git = historicalGit }) {
  const pin = HISTORICAL_INVENTORY_CLAIM_PINS_V6.find(item => item.stampId === stamp.stampId);
  if (!pin || binding.filePath !== INVENTORY_PATH) return null;
  const fail = () => { const error = new Error('E_HISTORICAL_INVENTORY_BINDING'); error.code = error.message; throw error; };
  if (sha256hex(stampBytes) !== pin.stampSha256 || binding.sha256 !== pin.targetSha256) fail();
  const stampPath = `docs/OPS/R24/EVIDENCE/${pin.stampId}.json`;
  try {
    const head = git(rootDir, ['rev-parse','HEAD']).toString().trim();
    if (!/^[a-f0-9]{40}$/.test(head)) fail();
    if (git(rootDir, ['rev-parse',`${pin.evaluationSha}^{tree}`]).toString().trim() !== pin.evaluationTree) fail();
    git(rootDir, ['merge-base','--is-ancestor',pin.evaluationSha,head]);
    if (sha256hex(git(rootDir, ['show',`${pin.evaluationSha}:${stampPath}`])) !== pin.stampSha256) fail();
    if (sha256hex(git(rootDir, ['show',`${pin.evaluationSha}:${INVENTORY_PATH}`])) !== pin.targetSha256) fail();
  } catch { fail(); }
  return Object.freeze({ stampId: pin.stampId, targetPath: INVENTORY_PATH, evaluationSha: pin.evaluationSha,
    evaluationTree: pin.evaluationTree, stampSha256: pin.stampSha256, targetSha256: pin.targetSha256,
    status: 'VERIFIED_HISTORICAL_BYTES', currentFileCoverage: false });
}

function listFiles(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) listFiles(full, out);
    else if (entry.isFile()) out.push(full);
  }
  return out;
}

function safeSurfaceRelative(value) {
  if (typeof value !== 'string' || value.length === 0) return false;
  if (path.isAbsolute(value)) return false;
  const normalized = value.replaceAll('\\', '/');
  return normalized.startsWith('docs/OPS/R24/')
    && !normalized.includes('../')
    && /\.(md|json)$/.test(normalized);
}

function addBinding({ rootDir, evidenceDir, stamp, file, bindingsByFile, historicalBindings, failures }) {
  if (!Array.isArray(stamp.claimBindings)) return;
  for (const binding of stamp.claimBindings) {
    const relativePath = binding?.filePath || binding?.path || '';
    if (!safeSurfaceRelative(relativePath)) {
      failures.push(`E_CLAIM_BINDING_UNSAFE_PATH:${path.relative(rootDir, file)}`);
      continue;
    }
    if (relativePath.startsWith('docs/OPS/R24/EVIDENCE/')) {
      failures.push(`E_CLAIM_BINDING_EVIDENCE_SELF_REFERENCE:${path.relative(rootDir, file)}`);
      continue;
    }
    const target = path.join(rootDir, relativePath);
    const normalizedTarget = path.resolve(target);
    if (!normalizedTarget.startsWith(path.resolve(rootDir, 'docs', 'OPS', 'R24') + path.sep)) {
      failures.push(`E_CLAIM_BINDING_OUTSIDE_SURFACE:${path.relative(rootDir, file)}`);
      continue;
    }
    if (normalizedTarget.startsWith(path.resolve(evidenceDir) + path.sep)) {
      failures.push(`E_CLAIM_BINDING_EVIDENCE_SELF_REFERENCE:${path.relative(rootDir, file)}`);
      continue;
    }
    if (!fs.existsSync(normalizedTarget)) {
      failures.push(`E_CLAIM_BINDING_TARGET_MISSING:${relativePath}`);
      continue;
    }
    if (typeof binding.sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(binding.sha256)) {
      failures.push(`E_CLAIM_BINDING_DIGEST_REQUIRED:${relativePath}`);
      continue;
    }
    const actual = sha256hex(fs.readFileSync(normalizedTarget));
    if (actual !== binding.sha256 && relativePath === INVENTORY_PATH
      && HISTORICAL_INVENTORY_CLAIM_PINS_V6.some(pin => pin.stampId === stamp.stampId)) {
      try {
        const historical = verifyHistoricalInventoryClaim({ rootDir, stamp, stampBytes: fs.readFileSync(file), binding });
        if (historical) { historicalBindings.push(historical); continue; }
      } catch (error) { failures.push(`${error.code || 'E_HISTORICAL_INVENTORY_BINDING'}:${relativePath}`); continue; }
    }
    if (actual !== binding.sha256) {
      failures.push(`E_CLAIM_BINDING_DIGEST_MISMATCH:${relativePath}`);
      continue;
    }
    const set = bindingsByFile.get(relativePath) || new Set();
    set.add(stamp.stampId);
    bindingsByFile.set(relativePath, set);
  }
}

export function lintDocsClaims(rootDir) {
  const surface = path.join(rootDir, 'docs', 'OPS', 'R24');
  const evidenceDir = path.join(surface, 'EVIDENCE');
  const stampIds = new Set();
  const bindingsByFile = new Map();
  const historicalBindings = [];
  const failures = [];
  for (const file of listFiles(evidenceDir)) {
    if (!file.endsWith('.json')) continue;
    try {
      const artifact = readJsonBounded(file);
      if (artifact?.schemaVersion === 'EvidenceStampV2') {
        const stamp = buildEvidenceStamp(artifact);
        stampIds.add(stamp.stampId);
      } else if (artifact?.schemaVersion === 'ClaimBindingV1') {
        const binding = buildClaimBinding(artifact);
        stampIds.add(binding.stampId);
        addBinding({ rootDir, evidenceDir, stamp: binding, file, bindingsByFile, historicalBindings, failures });
      } else if (artifact && (Object.hasOwn(artifact, 'stampId') || Object.hasOwn(artifact, 'claimBindings'))) {
        failures.push('E_EVIDENCE_ARTIFACT_SCHEMA:' + path.relative(rootDir, file) + ':UNSUPPORTED_SCHEMA_VERSION');
      }
    } catch (error) {
      if (['E_R24_READ_MISSING', 'E_R24_READ_NOT_A_FILE', 'E_R24_READ_TOO_LARGE', 'E_R24_JSON_PARSE'].includes(error?.code)) {
        return { ok: false, failures: ['E_EVIDENCE_STAMP_UNREADABLE:' + path.relative(rootDir, file)] };
      }
      failures.push('E_EVIDENCE_ARTIFACT_SCHEMA:' + path.relative(rootDir, file) + ':' + (error?.code || 'E_UNKNOWN'));
    }
  }
  let filesWithClaims = 0;
  for (const file of listFiles(surface)) {
    if (file.startsWith(evidenceDir)) continue;
    if (!/\.(md|json)$/.test(file)) continue;
    const text = fs.readFileSync(file, 'utf8');
    if (!CLAIM_RE.test(text)) continue;
    filesWithClaims += 1;
    const relativePath = path.relative(rootDir, file).split(path.sep).join('/');
    const resolved = new Set([
      ...[...stampIds].filter((id) => text.includes(id)),
      ...[...(bindingsByFile.get(relativePath) || [])],
    ]);
    if (resolved.size === 0) failures.push(`E_CLAIM_WITHOUT_EVIDENCE:${path.relative(rootDir, file)}`);
  }
  return { ok: failures.length === 0, failures, filesWithClaims, stampCount: stampIds.size, historicalBindings };
}

export function main(argv = process.argv.slice(2)) {
  const rootDir = path.resolve(argv[0] || process.cwd());
  const result = lintDocsClaims(rootDir);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (!result.ok) process.exitCode = 1;
  return result;
}

const invokedAsScript = process.argv[1] && path.resolve(process.argv[1]).endsWith('docs-claim-lint.mjs');
if (invokedAsScript) main();
