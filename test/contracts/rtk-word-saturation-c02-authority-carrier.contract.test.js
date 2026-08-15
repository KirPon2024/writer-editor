const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const PARSER_PATH = 'src/io/revisionBridge/reviewTransportPackageParserV2.mjs';
const CLASSIFIER_PATH = 'src/io/revisionBridge/reviewTransportClassifierV2.mjs';
const INDEX_PATH = 'src/io/revisionBridge/index.mjs';
const RECEIPT_PATH = 'docs/OPS/RTK/WORD_LATEST_SEMANTIC_ROUNDTRIP_V2_C02_AUTHORITY_CARRIER_RECEIPT.json';
const W_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const SECRET = 'c02-local-secret-not-embedded';

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map((item) => stableJson(item)).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

const cryptoPort = {
  sha256Text(value) {
    return crypto.createHash('sha256').update(Buffer.from(String(value || ''), 'utf8')).digest('hex');
  },
  sha256Json(value) {
    return `sha256:${this.sha256Text(stableJson(value))}`;
  },
  hmacSha256Json(value, secret) {
    return `hmac-sha256:${crypto.createHmac('sha256', Buffer.from(String(secret || ''), 'utf8')).update(Buffer.from(stableJson(value), 'utf8')).digest('hex')}`;
  },
  byteLength(value) {
    return Buffer.byteLength(String(value || ''), 'utf8');
  },
};

const expectedAuthority = Object.freeze({
  sceneId: 'scene-c02-alpha',
  sceneRevision: 'scene-revision-c02-alpha-0001',
  rawSha256: 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  blockId: 'block-c02-target',
  roundId: 'round-c02-authority',
  exportId: 'export-c02-authority',
});

async function load(relativePath) {
  return import(pathToFileURL(path.join(process.cwd(), relativePath)).href);
}

function base64UrlEncode(value) {
  return Buffer.from(String(value), 'utf8')
    .toString('base64')
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/u, '');
}

function envelope(overrides = {}) {
  const payload = {
    schemaVersion: 'yalken.rtk.locator-authority-envelope.c01.v1',
    taskId: 'YALKEN_RTK_WORD_LATEST_SEMANTIC_ROUNDTRIP_V2',
    profileId: 'word-mac-latest-observed-16.111.x-semantic-v2-c02',
    caseId: 'C02-001',
    ...expectedAuthority,
    ...overrides.payload,
  };
  const body = {
    schemaVersion: 'yalken.rtk.locator-authority-envelope.c01.v1',
    payload,
    payloadDigest: cryptoPort.sha256Json(payload),
    signature: overrides.signature || cryptoPort.hmacSha256Json(payload, overrides.secret || SECRET),
    keyId: 'c02-local-secret',
    secretEmbeddedInDocx: overrides.secretEmbeddedInDocx === true ? true : false,
  };
  return `YRTK1.${base64UrlEncode(JSON.stringify(body))}`;
}

function documentXml(body = '<w:p><w:ins w:id="1"><w:r><w:t>inserted</w:t></w:r></w:ins></w:p>') {
  return `<w:document xmlns:w="${W_NS}"><w:body>${body}</w:body></w:document>`;
}

function customPropsXml(encoded, extra = '') {
  return `<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/custom-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">
    <property fmtid="{D5CDD505-2E9C-101B-9397-08002B2CF9AE}" pid="2" name="YRTK_C01_AUTH"><vt:lpwstr>${encoded}</vt:lpwstr></property>
    ${extra}
  </Properties>`;
}

function parts(encoded = envelope(), extraCustomProps = '') {
  return {
    '[Content_Types].xml': '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/docProps/custom.xml" ContentType="application/vnd.openxmlformats-officedocument.custom-properties+xml"/></Types>',
    '_rels/.rels': '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rC02" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/custom-properties" Target="docProps/custom.xml"/></Relationships>',
    'word/document.xml': documentXml(),
    'docProps/custom.xml': customPropsXml(encoded, extraCustomProps),
  };
}

test('C02 parser verifies custom document property authority carrier and binds expected baseline without granting apply', async () => {
  const parser = await load(PARSER_PATH);
  const result = parser.parseReviewTransportPackageV2({
    parts: parts(),
    hmacSecret: SECRET,
    expectedAuthority,
  }, { cryptoPort });

  assert.equal(result.ok, true);
  assert.equal(result.canApply, false);
  assert.equal(result.canWriteManuscript, false);
  assert.equal(result.authorityCarrier.status, 'verified-baseline-bound');
  assert.equal(result.authorityCarrier.selectedCarrier.carrier, 'customDocumentProperty');
  assert.equal(result.authorityCarrier.selectedCarrier.propertyName, 'YRTK_C01_AUTH');
  assert.equal(result.authorityCarrier.selectedCarrier.verified, true);
  assert.equal(result.authorityCarrier.selectedCarrier.validSignedLocator, true);
  assert.equal(result.exactAuthority.validSignedLocator, true);
  assert.equal(result.exactAuthority.sceneRevisionUnchanged, true);
  assert.equal(result.exactAuthority.rawSha256Unchanged, true);
  assert.equal(result.exactAuthority.uniqueTarget, false);
  assert.equal(result.exactAuthority.nonOverlapping, false);
  assert.equal(result.exactAuthority.allRelevantXmlSemanticsAccounted, false);
  assert.equal(result.parserProfile.semanticFeatureFlags.includes('custom-document-property-authority-carrier'), true);
  assert.equal(result.packageInventory.opaqueUnsupported.some((item) => item.partName === 'docProps/custom.xml'), false);
});

test('C02 verified carrier still cannot make text exact until negative oracles prove target uniqueness and semantics', async () => {
  const parser = await load(PARSER_PATH);
  const classifier = await load(CLASSIFIER_PATH);
  const parsed = parser.parseReviewTransportPackageV2({
    parts: parts(),
    hmacSecret: SECRET,
    expectedAuthority,
  }, { cryptoPort });
  const classified = classifier.classifyReviewTransportIrV2({
    reviewIr: parsed.reviewIr,
    exactAuthority: parsed.exactAuthority,
  }, { cryptoPort });

  assert.equal(classified.ok, true);
  assert.equal(classified.summary.exactAutomaticCandidates, 0);
  assert.equal(classified.classifications.text[0].disposition, 'MANUAL_REVIEW');
  assert.equal(classified.reasons.some((reason) => reason.code === 'RTK_BLOCKED_AMBIGUOUS_TEXT'), true);
  assert.equal(classified.falseExactGuards.fuzzyMatchAuthority, false);
});

test('C02 parser blocks tampered HMAC and missing local secret from signed locator authority', async () => {
  const parser = await load(PARSER_PATH);
  const tampered = parser.parseReviewTransportPackageV2({
    parts: parts(envelope({ signature: 'hmac-sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' })),
    hmacSecret: SECRET,
    expectedAuthority,
  }, { cryptoPort });
  const missingSecret = parser.parseReviewTransportPackageV2({
    parts: parts(),
    expectedAuthority,
  }, { cryptoPort });

  assert.equal(tampered.authorityCarrier.status, 'present-not-authoritative');
  assert.equal(tampered.exactAuthority.validSignedLocator, false);
  assert.equal(tampered.reasons.some((reason) => reason.field === 'authorityCarrier.signature'), true);
  assert.equal(missingSecret.exactAuthority.validSignedLocator, false);
  assert.equal(missingSecret.reasons.some((reason) => reason.field === 'authorityCarrier.hmacSecret'), true);
});

test('C02 parser rejects stale local baseline and duplicate carrier ambiguity before exact authority', async () => {
  const parser = await load(PARSER_PATH);
  const stale = parser.parseReviewTransportPackageV2({
    parts: parts(),
    hmacSecret: SECRET,
    expectedAuthority: {
      ...expectedAuthority,
      sceneRevision: 'scene-revision-stale',
      rawSha256: 'sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc',
    },
  }, { cryptoPort });
  const duplicate = parser.parseReviewTransportPackageV2({
    parts: parts(envelope(), '<property fmtid="{D5CDD505-2E9C-101B-9397-08002B2CF9AE}" pid="3" name="YRTK_C01_AUTH"><vt:lpwstr>YRTK1.invalid</vt:lpwstr></property>'),
    hmacSecret: SECRET,
    expectedAuthority,
  }, { cryptoPort });

  assert.equal(stale.exactAuthority.validSignedLocator, false);
  assert.equal(stale.reasons.some((reason) => reason.code === 'RTK_BLOCKED_STALE_REVISION'), true);
  assert.equal(stale.reasons.some((reason) => reason.code === 'RTK_BLOCKED_STALE_BYTES'), true);
  assert.equal(duplicate.authorityCarrier.status, 'present-not-authoritative');
  assert.equal(duplicate.exactAuthority.ambiguousDuplicate, true);
  assert.equal(duplicate.exactAuthority.validSignedLocator, false);
});

test('C02 parser rejects profile transplant even when HMAC and baseline bytes match', async () => {
  const parser = await load(PARSER_PATH);
  const matching = parser.parseReviewTransportPackageV2({
    parts: parts(),
    hmacSecret: SECRET,
    expectedAuthority: {
      ...expectedAuthority,
      profileId: 'word-mac-latest-observed-16.111.x-semantic-v2-c02',
    },
  }, { cryptoPort });
  const transplanted = parser.parseReviewTransportPackageV2({
    parts: parts(),
    hmacSecret: SECRET,
    expectedAuthority: {
      ...expectedAuthority,
      profileId: 'word-mac-16.112-26081010',
    },
  }, { cryptoPort });

  assert.equal(matching.authorityCarrier.status, 'verified-baseline-bound');
  assert.equal(matching.exactAuthority.validSignedLocator, true);
  assert.equal(matching.authorityCarrier.selectedCarrier.baselineBinding.profileIdMatches, true);
  assert.equal(transplanted.authorityCarrier.status, 'present-not-authoritative');
  assert.equal(transplanted.exactAuthority.validSignedLocator, false);
  assert.equal(transplanted.authorityCarrier.selectedCarrier.baselineBinding.profileIdMatches, false);
  assert.equal(transplanted.reasons.some((reason) => (
    reason.code === 'RTK_BLOCKED_PROFILE_MISMATCH'
    && reason.field === 'authorityCarrier.expectedAuthority.profileId'
  )), true);
  const mainSideVerify = parser.verifyAuthorityCarrierSignatureWithSecret(
    matching.authorityCarrier.selectedCarrier,
    {
      hmacSecret: SECRET,
      expectedAuthority: {
        ...expectedAuthority,
        profileId: 'word-mac-16.112-26081010',
      },
    },
    cryptoPort,
  );
  assert.equal(mainSideVerify.verified, false);
  assert.equal(mainSideVerify.validSignedLocator, false);
  assert.equal(mainSideVerify.baselineBinding.profileIdMatches, false);
  assert.equal(mainSideVerify.reasons.some((reason) => (
    reason.code === 'RTK_BLOCKED_PROFILE_MISMATCH'
    && reason.field === 'authorityCarrier.expectedAuthority.profileId'
  )), true);
});

test('C02 public export receipt and core boundaries preserve local-first no-writer authority', async () => {
  const bridge = await load(INDEX_PATH);
  const receipt = JSON.parse(fs.readFileSync(path.join(process.cwd(), RECEIPT_PATH), 'utf8'));
  const parserSource = fs.readFileSync(path.join(process.cwd(), PARSER_PATH), 'utf8');

  assert.equal(bridge.RTK_REVIEW_TRANSPORT_AUTHORITY_CARRIER_V2_SCHEMA, 'yalken.rtk.review-transport-authority-carrier.v2');
  assert.deepEqual(bridge.RTK_REVIEW_TRANSPORT_AUTHORITY_CUSTOM_PROPERTY_NAMES, ['YRTK_C01_AUTH']);
  assert.equal(receipt.status, 'C02_AUTHORITY_CARRIER_PARSER_READY_NOT_APPLY_EXPANDED');
  assert.equal(receipt.selectedAuthorityCarrier, 'customDocumentProperty');
  assert.equal(receipt.nonClaims.automaticApplyExpanded, false);
  assert.equal(receipt.nonClaims.googleDocsCertified, false);
  assert.equal(receipt.zeroFalseExactPolicy.falseExact, 0);
  for (const forbidden of ['node:', 'Buffer', 'child_process', 'fetch(', 'XMLHttpRequest', 'WebSocket', 'new RegExp', '.match(', '.matchAll(']) {
    assert.equal(parserSource.includes(forbidden), false, forbidden);
  }
});
