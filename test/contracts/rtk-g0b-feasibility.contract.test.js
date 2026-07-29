const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { pathToFileURL } = require('node:url');

const CONTRACTS_PATH = 'src/io/revisionBridge/reviewTransportContracts.mjs';
const ORACLE_PATH = 'src/io/revisionBridge/reviewTransportOracle.mjs';
const TEST_PATH = 'test/contracts/rtk-g0b-feasibility.contract.test.js';
const SCHEMA_PATH = 'docs/OPS/RTK/G0B_NORMATIVE_SCHEMA_V2.json';
const CORPUS_PATH = 'docs/OPS/RTK/G0B_SUPPORTED_CORPUS_V1.json';
const WORD_SETTINGS_PATH = 'docs/OPS/RTK/G0B_WORD_SETTINGS_CAPSULE_CONTRACT_V1.json';
const RECEIPT_PATH = 'docs/OPS/RTK/G0B_FEASIBILITY_RECEIPT.json';
const GOVERNANCE_APPROVALS_PATH = 'docs/OPS/GOVERNANCE_APPROVALS/GOVERNANCE_CHANGE_APPROVALS.json';
const ALLOWLIST = [
  CONTRACTS_PATH,
  ORACLE_PATH,
  TEST_PATH,
  SCHEMA_PATH,
  CORPUS_PATH,
  WORD_SETTINGS_PATH,
  RECEIPT_PATH,
  GOVERNANCE_APPROVALS_PATH,
];

async function loadContracts() {
  return import(pathToFileURL(path.join(process.cwd(), CONTRACTS_PATH)).href);
}

async function loadOracle() {
  return import(pathToFileURL(path.join(process.cwd(), ORACLE_PATH)).href);
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(path.join(process.cwd(), filePath), 'utf8'));
}

function baseTransport(overrides = {}) {
  return {
    roundId: 'round-1',
    returnMode: 'TRACKED',
    secretKey: 'test-secret',
    blocks: [
      {
        blockId: 'block-1',
        text: 'Alpha beta gamma.',
      },
    ],
    changes: [],
    comments: [
      {
        commentId: 'comment-1',
        body: 'Conserve this comment.',
        replies: [{ body: 'Conserve this reply.' }],
      },
    ],
    ...overrides,
  };
}

function changedFilesFromGitStatus(statusText) {
  return statusText
    .split('\n')
    .filter(Boolean)
    .map((line) => line.slice(3).replace(/^"|"$/gu, ''));
}

test('G0B exports normative schema constants and reason catalog', async () => {
  const contracts = await loadContracts();
  const schema = readJson(SCHEMA_PATH);

  assert.equal(
    contracts.REVISION_BRIDGE_G0B_TRANSPORT_CONTRACT_SCHEMA,
    'revision-bridge.g0b-transport-contract.v1',
  );
  assert.deepEqual(contracts.REVISION_BRIDGE_G0B_RETURN_MODES, ['TRACKED', 'CLEAN', 'MIXED']);
  assert.equal(Object.isFrozen(contracts.REVISION_BRIDGE_G0B_REASON_CODES), true);
  for (const reasonCode of schema.reasonCodes) {
    assert.equal(contracts.REVISION_BRIDGE_G0B_REASON_CODES.includes(reasonCode), true, reasonCode);
  }
});

test('G0B no-edit and duplicate text evidence produce zero exact operations', async () => {
  const contracts = await loadContracts();
  const result = contracts.analyzeG0BTransportContract(baseTransport({
    changes: [
      {
        changeId: 'no-edit-1',
        blockId: 'block-1',
        kind: 'noEdit',
      },
      {
        changeId: 'duplicate-1',
        blockId: 'block-2',
        kind: 'textExact',
        oldText: 'aa',
        newText: 'bb',
      },
    ],
    blocks: [
      { blockId: 'block-1', text: 'No change here.' },
      { blockId: 'block-2', text: 'aa aa' },
    ],
  }));

  assert.equal(result.localContractStatus, 'PASS');
  assert.equal(result.externalWordStatus, 'DEFERRED_EXTERNAL_WORD_EVIDENCE');
  assert.deepEqual(result.exactOperations, []);
  assert.equal(result.reasons.some((reason) => reason.code === 'G0B_NO_TEXT_CANDIDATE'), true);
  assert.equal(result.reasons.some((reason) => reason.code === 'G0B_DUPLICATE_TEXT_CANDIDATE'), true);
});

test('G0B paragraph marks, split, merge and move revisions are structural blocked', async () => {
  const contracts = await loadContracts();
  const result = contracts.analyzeG0BTransportContract(baseTransport({
    changes: [
      { changeId: 'paragraph-1', blockId: 'block-1', kind: 'paragraphMark' },
      { changeId: 'move-1', blockId: 'block-1', kind: 'move' },
      { changeId: 'split-1', blockId: 'block-1', kind: 'split' },
      { changeId: 'merge-1', blockId: 'block-1', kind: 'merge' },
    ],
  }));
  const reasonCodes = result.reasons.map((reason) => reason.code);

  assert.deepEqual(result.exactOperations, []);
  assert.equal(reasonCodes.includes('G0B_STRUCTURAL_PARAGRAPH_MARK'), true);
  assert.equal(reasonCodes.includes('G0B_STRUCTURAL_MOVE_REVISION'), true);
  assert.equal(reasonCodes.filter((code) => code === 'G0B_STRUCTURAL_SPLIT_MERGE').length, 2);
});

test('G0B TRACKED CLEAN and MIXED conserve comments without manuscript authority', async () => {
  const contracts = await loadContracts();

  for (const returnMode of contracts.REVISION_BRIDGE_G0B_RETURN_MODES) {
    const result = contracts.analyzeG0BTransportContract(baseTransport({
      returnMode,
      changes: [
        {
          changeId: 'exact-1',
          blockId: 'block-1',
          kind: 'textExact',
          oldText: 'beta',
          newText: 'BETA',
        },
      ],
    }));

    assert.equal(result.returnMode, returnMode);
    assert.equal(result.exactOperations.length, 1);
    assert.equal(result.exactOperations[0].returnMode, returnMode);
    assert.equal(result.commentsLane[0].body, 'Conserve this comment.');
    assert.equal(result.commentsLane[0].replies[0].body, 'Conserve this reply.');
    assert.equal(result.reasons.some((reason) => reason.code === 'G0B_COMMENT_LANE_CONSERVED'), true);
  }
});

test('G0B cross-round locators never bind and HMAC anchors detect tamper', async () => {
  const contracts = await loadContracts();
  const input = baseTransport({
    changes: [
      {
        changeId: 'cross-round-1',
        blockId: 'block-1',
        kind: 'textExact',
        oldText: 'beta',
        newText: 'BETA',
        locator: { roundId: 'round-0' },
      },
    ],
  });
  const result = contracts.analyzeG0BTransportContract(input);
  const validAnchor = contracts.verifyG0BAnchor(result.anchors[0], input.blocks[0], input.secretKey);
  const tamperedAnchor = contracts.verifyG0BAnchor(
    { ...result.anchors[0], textDigest: 'sha256:tampered' },
    input.blocks[0],
    input.secretKey,
  );

  assert.deepEqual(result.exactOperations, []);
  assert.equal(result.reasons.some((reason) => reason.code === 'G0B_CROSS_ROUND_LOCATOR_BLOCKED'), true);
  assert.equal(validAnchor.ok, true);
  assert.equal(validAnchor.code, 'G0B_ANCHOR_HMAC_VALID');
  assert.equal(tamperedAnchor.ok, false);
  assert.equal(tamperedAnchor.code, 'G0B_ANCHOR_HMAC_TAMPERED');
});

test('G0B supported corpus digest is deterministic and mutation-sensitive', async () => {
  const contracts = await loadContracts();
  const corpus = readJson(CORPUS_PATH);
  const digest = contracts.createSupportedCorpusDigest(corpus);
  const repeatDigest = contracts.createSupportedCorpusDigest(readJson(CORPUS_PATH));
  const frozen = contracts.freezeSupportedCorpus(corpus, digest);
  const mutated = JSON.parse(JSON.stringify(corpus));
  mutated.fixtures[0].text = 'Mutated.';
  const rejected = contracts.freezeSupportedCorpus(mutated, digest);

  assert.equal(digest, repeatDigest);
  assert.equal(frozen.ok, true);
  assert.equal(frozen.code, 'G0B_CORPUS_DIGEST_FROZEN');
  assert.equal(rejected.ok, false);
  assert.equal(rejected.code, 'G0B_CORPUS_DIGEST_MISMATCH');
});

test('G0B parser bake-off selects dependency-free tokenizer before new dependency', async () => {
  const contracts = await loadContracts();
  const accepted = contracts.compareParserCandidates([
    {
      id: 'existing-tokenizer',
      correctness: 'pass',
      boundedAuditability: true,
      generalXmlPlatform: false,
      requiresDependency: false,
    },
    {
      id: 'maintained-sax',
      correctness: 'pass',
      boundedAuditability: true,
      requiresDependency: true,
    },
  ]);
  const blocked = contracts.compareParserCandidates([
    {
      id: 'existing-tokenizer',
      correctness: 'fail',
      boundedAuditability: true,
      generalXmlPlatform: false,
      requiresDependency: false,
    },
    {
      id: 'maintained-sax',
      correctness: 'pass',
      boundedAuditability: true,
      requiresDependency: true,
    },
  ]);

  assert.equal(accepted.ok, true);
  assert.equal(accepted.selected, 'existing-tokenizer');
  assert.equal(accepted.ownerDecisionRequired, false);
  assert.equal(blocked.ok, false);
  assert.equal(blocked.code, 'G0B_PARSER_DEPENDENCY_OWNER_DECISION_REQUIRED');
  assert.equal(blocked.ownerDecisionRequired, true);
});

test('G0B oracle and receipt separate local PASS from deferred external Word evidence', async () => {
  const oracle = await loadOracle();
  const contracts = await loadContracts();
  const corpus = readJson(CORPUS_PATH);
  const digest = contracts.createSupportedCorpusDigest(corpus);
  const result = oracle.runG0BLocalOracle({
    transport: baseTransport(),
    supportedCorpus: corpus,
    expectedCorpusDigest: digest,
    parserCandidates: [
      {
        id: 'existing-tokenizer',
        correctness: 'pass',
        boundedAuditability: true,
        generalXmlPlatform: false,
        requiresDependency: false,
      },
    ],
  });
  const receipt = readJson(RECEIPT_PATH);
  const wordSettings = readJson(WORD_SETTINGS_PATH);

  assert.equal(result.status, 'PASS');
  assert.equal(result.externalWordStatus, 'DEFERRED_EXTERNAL_WORD_EVIDENCE');
  assert.equal(receipt.local_contract_status, 'PASS');
  assert.equal(receipt.external_word_status, 'DEFERRED_EXTERNAL_WORD_EVIDENCE');
  assert.equal(wordSettings.externalWordEvidencePolicy.falsePassForbidden, true);
  assert.equal(wordSettings.externalWordEvidencePolicy.blocksFinalDone, true);
});

test('G0B stage keeps changes inside the frozen ActionEnvelope', () => {
  const status = execFileSync('git', ['status', '--short'], {
    cwd: process.cwd(),
    encoding: 'utf8',
  });
  const changedFiles = changedFilesFromGitStatus(status);
  const outside = changedFiles.filter((filePath) => !ALLOWLIST.includes(filePath));

  assert.deepEqual(outside, []);
});
