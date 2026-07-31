const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const MODULE_PATH = 'src/io/revisionBridge/reviewTransportYrtk2Core.mjs';
const INDEX_PATH = 'src/io/revisionBridge/index.mjs';
const RECEIPT_PATH = 'docs/OPS/RTK/WORD_SAFE_SEMANTIC_ROUNDTRIP_V4_E03_COREMANIFEST_YRTK2_RECEIPT.json';

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map((item) => stableJson(item)).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

const cryptoPort = {
  sha256Json(value) {
    return `sha256:${crypto.createHash('sha256').update(Buffer.from(stableJson(value), 'utf8')).digest('hex')}`;
  },
  hmacSha256Text(value, secret) {
    return `hmac-sha256:${crypto.createHmac('sha256', Buffer.from(String(secret || ''), 'utf8')).update(Buffer.from(String(value || ''), 'utf8')).digest('hex')}`;
  },
};

async function loadCore() {
  return import(pathToFileURL(path.join(REPO_ROOT, MODULE_PATH)).href);
}

function digest(seed) {
  return `sha256:${crypto.createHash('sha256').update(Buffer.from(seed, 'utf8')).digest('hex')}`;
}

function manifestInput(overrides = {}) {
  return {
    profileId: 'word-mac-latest-safe-semantic-roundtrip-v4',
    projectId: 'project-e03',
    roundId: 'round-e03',
    exportArtifactId: 'export-e03',
    semanticReturnId: 'semantic-return-e03',
    createdAtUtc: '2026-07-31T04:55:00.000Z',
    compileIrDigest: digest('compile-ir'),
    actualBaselineDigest: digest('actual-baseline'),
    parserProfileDigest: digest('parser-profile'),
    capabilityProfileDigest: digest('capability-profile'),
    artifactIdentities: {
      provisionalDocxSha256: digest('provisional-docx'),
      returnArtifactId: 'return-e03',
      applyId: 'apply-e03',
      effectIds: ['effect-b', 'effect-a'],
    },
    exportMap: {
      exportMapId: 'export-map-e03',
      profileId: 'word-mac-latest-safe-semantic-roundtrip-v4',
      roundId: 'round-e03',
      scenes: [
        {
          sceneId: 'scene-e03',
          sceneRevision: 'scene-revision-e03',
          rawSha256: digest('scene-text'),
          blocks: [
            {
              blockId: 'block-e03',
              paragraphId: 'paragraph-e03',
              canonicalTextSha256: digest('block-text'),
              canonicalMarksSha256: digest('block-marks'),
              wordSignals: [
                {
                  kind: 'w14ParaIdTextId',
                  value: { paraId: '00aa00bb', textId: '11cc11dd' },
                  applyAuthority: false,
                },
              ],
            },
          ],
        },
      ],
    },
    hashTree: {
      rootDigest: digest('root'),
      sceneDigests: [{ sceneId: 'scene-e03', digest: digest('scene') }],
      blockDigests: [{ sceneId: 'scene-e03', blockId: 'block-e03', digest: digest('block') }],
    },
    ...overrides,
  };
}

test('V4 E03 creates CoreManifest and fixed-length YRTK2 token through CryptoPort', async () => {
  const core = await loadCore();
  const created = core.createWordV4CoreManifest(manifestInput(), { cryptoPort });
  const token = core.createYrtk2RoundLocatorToken({
    keyIdHex: '00112233445566778899aabbccddeeff',
    roundIdHex: 'ffeeddccbbaa99887766554433221100',
    coreManifestDigest: created.coreManifestDigest,
    hmacSecret: 'secret-e03',
  }, { cryptoPort });
  const verified = core.verifyYrtk2RoundLocatorToken({
    token: token.token,
    hmacSecret: 'secret-e03',
    expectedKeyIdHex: '00112233445566778899aabbccddeeff',
    expectedRoundIdHex: 'ffeeddccbbaa99887766554433221100',
    expectedCoreManifestDigest: created.coreManifestDigest,
  }, { cryptoPort });
  const doubleSelfParse = core.evaluateWordV4DoubleSelfParse({
    coreManifest: created.manifest,
    provisionalSelfParse: { actualBaselineDigest: created.manifest.actualBaselineDigest },
    finalSelfParse: { coreManifestDigest: created.coreManifestDigest, semanticEquivalent: true },
    yrtk2Verification: verified,
  });

  assert.equal(created.ok, true);
  assert.equal(created.manifest.schemaVersion, core.RTK_WORD_V4_CORE_MANIFEST_SCHEMA);
  assert.equal(created.manifest.artifactIdentities.finalDocxSha256, '');
  assert.equal(token.ok, true);
  assert.equal(token.token.length, core.RTK_WORD_V4_YRTK2_TOKEN_LENGTH);
  assert.equal(token.secretEmbeddedInDocx, false);
  assert.equal(verified.ok, true);
  assert.equal(verified.exactAuthority, true);
  assert.equal(doubleSelfParse.ok, true);
  assert.equal(doubleSelfParse.publishAllowed, true);
});

test('V4 E03 blocks hash-cycle final DOCX identity and Word signal apply authority', async () => {
  const core = await loadCore();
  const hashCycle = core.createWordV4CoreManifest(manifestInput({
    artifactIdentities: {
      provisionalDocxSha256: digest('provisional-docx'),
      finalDocxSha256: digest('final-docx'),
    },
  }), { cryptoPort });
  const wordSignalAuthority = manifestInput();
  wordSignalAuthority.exportMap.scenes[0].blocks[0].wordSignals[0].applyAuthority = true;
  const signalResult = core.createWordV4CoreManifest(wordSignalAuthority, { cryptoPort });

  assert.equal(hashCycle.ok, false);
  assert.equal(hashCycle.reasons.some((item) => item.code === 'RTK_V4_CORE_MANIFEST_HASH_CYCLE_FORBIDDEN'), true);
  assert.equal(signalResult.ok, false);
  assert.equal(signalResult.reasons.some((item) => item.code === 'RTK_V4_EXPORT_MAP_WORD_SIGNAL_AUTHORITY_FORBIDDEN'), true);
});

test('V4 E03 blocks missing secret tampered token stale round and digest mismatch', async () => {
  const core = await loadCore();
  const created = core.createWordV4CoreManifest(manifestInput(), { cryptoPort });
  const token = core.createYrtk2RoundLocatorToken({
    keyIdHex: '00112233445566778899aabbccddeeff',
    roundIdHex: 'ffeeddccbbaa99887766554433221100',
    coreManifestDigest: created.coreManifestDigest,
    hmacSecret: 'secret-e03',
  }, { cryptoPort });
  const missingSecret = core.verifyYrtk2RoundLocatorToken({ token: token.token }, { cryptoPort });
  const wrongRound = core.verifyYrtk2RoundLocatorToken({
    token: token.token,
    hmacSecret: 'secret-e03',
    expectedRoundIdHex: '00000000000000000000000000000000',
  }, { cryptoPort });
  const tampered = `${token.token.slice(0, -1)}${token.token.endsWith('A') ? 'B' : 'A'}`;
  const tamperedResult = core.verifyYrtk2RoundLocatorToken({
    token: tampered,
    hmacSecret: 'secret-e03',
  }, { cryptoPort });
  const digestMismatch = core.evaluateWordV4DoubleSelfParse({
    coreManifest: created.manifest,
    provisionalSelfParse: { actualBaselineDigest: created.manifest.actualBaselineDigest },
    finalSelfParse: { coreManifestDigest: digest('other-core'), semanticEquivalent: true },
    yrtk2Verification: { ok: true, coreManifestDigest: created.coreManifestDigest },
  });

  assert.equal(missingSecret.ok, false);
  assert.equal(missingSecret.reasons.some((item) => item.code === 'RTK_V4_YRTK2_SECRET_REQUIRED'), true);
  assert.equal(wrongRound.ok, false);
  assert.equal(wrongRound.reasons.some((item) => item.code === 'RTK_V4_YRTK2_ROUND_ID_MISMATCH'), true);
  assert.equal(tamperedResult.ok, false);
  assert.equal(tamperedResult.reasons.some((item) => item.code === 'RTK_V4_YRTK2_HMAC_MISMATCH'), true);
  assert.equal(digestMismatch.ok, false);
  assert.equal(digestMismatch.reasons.some((item) => item.code === 'RTK_V4_DOUBLE_SELF_PARSE_FINAL_CORE_MISMATCH'), true);
});

test('V4 E03 public barrel and receipt keep runtime claims narrow', async () => {
  const bridge = await import(pathToFileURL(path.join(REPO_ROOT, INDEX_PATH)).href);
  const receipt = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, RECEIPT_PATH), 'utf8'));
  const source = fs.readFileSync(path.join(REPO_ROOT, MODULE_PATH), 'utf8');

  assert.equal(bridge.RTK_WORD_V4_YRTK2_TOKEN_LENGTH, 135);
  assert.equal(typeof bridge.createWordV4CoreManifest, 'function');
  assert.equal(typeof bridge.createYrtk2RoundLocatorToken, 'function');
  assert.equal(receipt.status, 'LOCAL_VERIFIED_READY_FOR_DELIVERY_CHAIN');
  assert.equal(receipt.vetoMetrics.falseExact, 0);
  assert.equal(receipt.runtimeClaims.automaticApplyExpanded, false);
  assert.equal(receipt.runtimeClaims.productRuntimeChanged, false);
  for (const forbidden of ['node:', 'Buffer', 'child_process', 'fetch(', 'XMLHttpRequest', 'WebSocket']) {
    assert.equal(source.includes(forbidden), false, forbidden);
  }
});
