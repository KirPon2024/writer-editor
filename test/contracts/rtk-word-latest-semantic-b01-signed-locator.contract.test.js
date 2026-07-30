const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const { pathToFileURL } = require('node:url');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const MANIFEST_CORE_PATH = path.join(REPO_ROOT, 'src/io/revisionBridge/reviewTransportManifestCore.mjs');
const BRIDGE_INDEX_PATH = path.join(REPO_ROOT, 'src/io/revisionBridge/index.mjs');
const LAB_PATH = path.join(REPO_ROOT, 'scripts/ops/rtk-word-latest-signed-locator-lab.mjs');
const RECEIPT_PATH = path.join(REPO_ROOT, 'docs/OPS/RTK/WORD_LATEST_SEMANTIC_ROUNDTRIP_V2_B01_LOCATOR_SURVIVAL_RECEIPT.json');

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map((item) => stableJson(item)).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => (
      `${JSON.stringify(key)}:${stableJson(value[key])}`
    )).join(',')}}`;
  }
  return JSON.stringify(value);
}

function sha256Text(value) {
  return crypto.createHash('sha256').update(Buffer.from(String(value), 'utf8')).digest('hex');
}

function hmacText(value, secret) {
  return crypto.createHmac('sha256', Buffer.from(String(secret), 'utf8'))
    .update(Buffer.from(String(value), 'utf8'))
    .digest('hex');
}

function cryptoPort() {
  return {
    sha256Json(value) {
      return `sha256:${sha256Text(stableJson(value))}`;
    },
    hmacSha256Json(value, secret) {
      return `hmac-sha256:${hmacText(stableJson(value), secret)}`;
    },
  };
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

async function loadManifestCore() {
  return import(pathToFileURL(MANIFEST_CORE_PATH).href);
}

async function loadBridgeIndex() {
  return import(pathToFileURL(BRIDGE_INDEX_PATH).href);
}

async function loadLab() {
  return import(pathToFileURL(LAB_PATH).href);
}

function manifestInput(core, overrides = {}) {
  const rawDigest = `sha256:${sha256Text('raw-scene')}`;
  const textDigest = `sha256:${sha256Text('block text')}`;
  const marksDigest = `sha256:${sha256Text('marks')}`;
  return {
    profileId: 'word-mac-latest-16.111.2-semantic-v2',
    manifestId: 'manifest-contract',
    projectId: 'project-contract',
    roundId: 'round-contract',
    exportId: 'export-contract',
    exportedAtUtc: '2026-07-30T14:10:00.000Z',
    sceneSnapshots: [
      {
        sceneId: 'scene-a',
        sceneRevision: 'rev-1',
        rawSha256: rawDigest,
        blocks: [
          {
            blockId: 'block-a',
            paragraphId: 'p-a',
            canonicalTextSha256: textDigest,
            canonicalMarksSha256: marksDigest,
            locatorSignals: [
              {
                signalId: 'signed',
                kind: core.RTK_TRANSPORT_MANIFEST_AUTHORITY_SIGNAL,
                authority: 'required-apply-authority',
                value: { sceneId: 'scene-a', blockId: 'block-a', rawSha256: rawDigest },
              },
              {
                signalId: 'bookmark',
                kind: 'word-bookmark-scene-boundary-v1',
                authority: 'placement-signal-only',
                value: { bookmarkName: 'YALKEN_TEST' },
              },
              core.createManualOnlyLocatorSignal({
                signalId: 'fingerprint',
                value: { prefixSha256: rawDigest },
              }),
            ],
          },
        ],
      },
    ],
    hmacSecret: 'contract-secret',
    ...overrides,
  };
}

test('B01 manifest core creates and verifies signed locator authority through CryptoPort only', async () => {
  const core = await loadManifestCore();
  const created = core.createReviewTransportManifestV2(manifestInput(core), { cryptoPort: cryptoPort() });

  assert.equal(created.ok, true);
  assert.equal(created.exactAuthority, true);
  assert.equal(created.manifest.signature.alg, core.RTK_TRANSPORT_MANIFEST_SIGNATURE_ALG);
  assert.equal(created.manifest.signature.secretEmbedded, false);
  assert.match(created.manifest.signature.value, /^hmac-sha256:[a-f0-9]{64}$/u);

  const verified = core.verifyReviewTransportManifestV2(created.manifest, {
    cryptoPort: cryptoPort(),
    hmacSecret: 'contract-secret',
  });

  assert.equal(verified.ok, true);
  assert.equal(verified.exactAuthority, true);
  assert.equal(verified.status, 'verified');
});

test('B01 manifest core blocks tamper missing secret and missing signed authority', async () => {
  const core = await loadManifestCore();
  const created = core.createReviewTransportManifestV2(manifestInput(core), { cryptoPort: cryptoPort() });
  const tampered = JSON.parse(JSON.stringify(created.manifest));
  tampered.sceneSnapshots[0].blocks[0].blockId = 'block-tampered';
  const tamperedResult = core.verifyReviewTransportManifestV2(tampered, {
    cryptoPort: cryptoPort(),
    hmacSecret: 'contract-secret',
  });
  const missingSecret = core.verifyReviewTransportManifestV2(created.manifest, { cryptoPort: cryptoPort() });
  const missingAuthority = core.createReviewTransportManifestV2(manifestInput(core, {
    sceneSnapshots: [
      {
        sceneId: 'scene-a',
        sceneRevision: 'rev-1',
        rawSha256: `sha256:${sha256Text('raw-scene')}`,
        blocks: [
          {
            blockId: 'block-a',
            paragraphId: 'p-a',
            canonicalTextSha256: `sha256:${sha256Text('block text')}`,
            canonicalMarksSha256: `sha256:${sha256Text('marks')}`,
            locatorSignals: [
              core.createManualOnlyLocatorSignal({ signalId: 'fingerprint' }),
            ],
          },
        ],
      },
    ],
  }), { cryptoPort: cryptoPort() });

  assert.equal(tamperedResult.ok, false);
  assert.equal(tamperedResult.reasons.some((reason) => reason.code === 'RTK_TRANSPORT_MANIFEST_HMAC_MISMATCH'), true);
  assert.equal(missingSecret.ok, false);
  assert.equal(missingSecret.exactAuthority, false);
  assert.equal(missingAuthority.ok, false);
  assert.equal(missingAuthority.reasons.some((reason) => reason.code === 'RTK_TRANSPORT_MANIFEST_SIGNED_LOCATOR_REQUIRED'), true);
});

test('B01 manifest exports are visible through the Revision Bridge public barrel', async () => {
  const bridge = await loadBridgeIndex();

  assert.equal(bridge.RTK_TRANSPORT_MANIFEST_V2_SCHEMA, 'yalken.rtk.transport-manifest.v2');
  assert.equal(typeof bridge.createReviewTransportManifestV2, 'function');
  assert.equal(typeof bridge.verifyReviewTransportManifestV2, 'function');
  assert.equal(bridge.RTK_TRANSPORT_MANIFEST_PLACEMENT_SIGNAL_AUTHORITIES.includes('manual-recovery-signal-only'), true);
});

test('B01 physical receipt records survival evidence only and never certifies latest Word', async () => {
  const lab = await loadLab();
  const receipt = readJson(RECEIPT_PATH);
  const evaluation = lab.evaluateB01LocatorReceipt(receipt);

  assert.equal(evaluation.ok, true);
  assert.equal(receipt.profile.statusAfterB01, 'SURVIVAL_EVIDENCE_ONLY_NOT_CERTIFIED');
  assert.equal(receipt.profile.physicalRoundTripsClaimedAsCertification, false);
  assert.equal(receipt.profile.oldD1Profile.notReboundByB01, true);
  assert.equal(receipt.commentNoopPassClaimed, false);
  assert.equal(receipt.wordDocumentSafety.syntheticOnly, true);
  assert.equal(receipt.wordDocumentSafety.closeNonLabDocuments, false);
  assert.equal(receipt.runtimeClaims.productRuntimeChanged, false);
  assert.equal(receipt.runtimeClaims.uiChanged, false);
  assert.equal(receipt.runtimeClaims.networkDependencyAdded, false);
  assert.ok(receipt.cases.length >= 5);
  assert.equal(receipt.totals.falseExact, 0);
  assert.equal(receipt.totals.silentApply, 0);
  assert.equal(receipt.totals.wrongSceneRouting, 0);
});

test('B01 physical receipt binds customXml survival limits and keeps placement signals non-authoritative', async () => {
  const receipt = readJson(RECEIPT_PATH);
  const noEditCase = receipt.cases.find((round) => round.caseId === 'b01-no-edit-save-reopen');
  const mutatingCases = receipt.cases.filter((round) => round.caseId !== 'b01-no-edit-save-reopen');

  assert.equal(noEditCase.packageInspection.signals.customXmlManifest.exactAuthority, true);
  assert.equal(receipt.signedLocatorAuthority.customXmlNoEditSaveVerified, true);
  assert.equal(receipt.signedLocatorAuthority.customXmlUsableForMutatingWordReturn, false);
  assert.equal(receipt.signedLocatorAuthority.customXmlMutationLimitation, 'CUSTOM_XML_DROPPED_AFTER_TRACKED_OR_COMMENTED_WORD_SAVE_ON_OBSERVED_WORD_PROFILE');
  assert.equal(mutatingCases.some((round) => round.packageInspection.signals.customXmlManifest.exactAuthority === false), true);
  for (const round of receipt.cases) {
    assert.equal(round.packageInspection.packageZipOk, true, round.caseId);
    assert.equal(round.packageInspection.signals.sceneBookmark.exactAuthority, false, round.caseId);
    assert.equal(round.packageInspection.signals.sdtTag.exactAuthority, false, round.caseId);
    assert.equal(round.packageInspection.signals.w14ParaId.exactAuthority, false, round.caseId);
    assert.equal(round.packageInspection.signals.w14TextId.exactAuthority, false, round.caseId);
    assert.equal(round.packageInspection.signals.modernCommentPackage.status, 'NOT_CERTIFIED_IN_B01');
  }
  assert.equal(receipt.cases.some((round) => round.wordNativeClassicCommentVisible === true), true);
  assert.equal(receipt.signedLocatorAuthority.secretEmbeddedInDocx, false);
});

test('B01 verifier rejects false certification no-op comment support and user document risk', async () => {
  const lab = await loadLab();
  const receipt = readJson(RECEIPT_PATH);
  const certified = JSON.parse(JSON.stringify(receipt));
  certified.profile.statusAfterB01 = 'CERTIFIED';
  const noOp = JSON.parse(JSON.stringify(receipt));
  noOp.commentNoopPassClaimed = true;
  const risky = JSON.parse(JSON.stringify(receipt));
  risky.wordDocumentSafety.closeNonLabDocuments = true;
  const falseCustomXml = JSON.parse(JSON.stringify(receipt));
  falseCustomXml.signedLocatorAuthority.customXmlUsableForMutatingWordReturn = true;

  assert.equal(lab.evaluateB01LocatorReceipt(certified).ok, false);
  assert.equal(lab.evaluateB01LocatorReceipt(certified).issues.some((issue) => issue.code === 'B01_FALSE_CERTIFICATION'), true);
  assert.equal(lab.evaluateB01LocatorReceipt(noOp).issues.some((issue) => issue.code === 'B01_COMMENT_NOOP_FALSE_PASS'), true);
  assert.equal(lab.evaluateB01LocatorReceipt(risky).issues.some((issue) => issue.code === 'B01_USER_DOC_RISK'), true);
  assert.equal(lab.evaluateB01LocatorReceipt(falseCustomXml).issues.some((issue) => issue.code === 'B01_CUSTOM_XML_MUTATION_LIMITATION_NOT_BOUND'), true);
});

test('B01 verifier CLI is CI-safe and manifest core remains platform-neutral', () => {
  const output = execFileSync(process.execPath, [LAB_PATH, '--json'], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  });
  const parsed = JSON.parse(output);

  assert.equal(parsed.ok, true);
  assert.equal(parsed.cases >= 5, true);

  const coreSource = fs.readFileSync(MANIFEST_CORE_PATH, 'utf8');
  assert.equal(/from 'node:/u.test(coreSource), false);
  assert.equal(/\bBuffer\b/u.test(coreSource), false);
  assert.equal(/\bElectron\b/u.test(coreSource), false);
  assert.equal(/\bfetch\s*\(/u.test(coreSource), false);

  const labSource = fs.readFileSync(LAB_PATH, 'utf8');
  assert.equal(/close every document/u.test(labSource), false);
  assert.equal(/\bfetch\s*\(/u.test(labSource), false);
  assert.equal(/\bXMLHttpRequest\b/u.test(labSource), false);
});
