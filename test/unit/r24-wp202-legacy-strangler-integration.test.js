'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { durableSaveTransaction } = require('../../src/core/save-coordinator-v1.cjs');
const { bindSaveReceiptToAck } = require('../../src/core/save-receipt-ack-v1.cjs');
const { commitProjectTransaction } = require('../../src/core/project-transaction-v1.cjs');
const {
  OBSERVER_IDS,
  SAVE_AUTHORITY_ROUTES,
  createAuthorityObservation,
  executeWriterSaveThroughStranglerGateway,
} = require('../../src/core/legacy-strangler-v1.cjs');

function observations(route) {
  return {
    observeLegacy: async (identity) => createAuthorityObservation({
      observerId: OBSERVER_IDS.LEGACY,
      requestDigest: identity.identityDigest,
      route,
    }),
    observeGateway: async (identity) => createAuthorityObservation({
      observerId: OBSERVER_IDS.GATEWAY,
      requestDigest: identity.identityDigest,
      route,
    }),
  };
}

test('WP202 delegates opaque Unicode bytes to WP200 and preserves receipt acknowledgement', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'r24-wp202-durable-'));
  const filePath = path.join(root, 'scene.txt');
  const content = 'A\u0301 Привет 👩🏽‍💻\n';
  fs.writeFileSync(filePath, 'old');
  let projectCalls = 0;
  const receipt = await executeWriterSaveThroughStranglerGateway({
    request: {
      filePath,
      content,
      revision: 12,
      projectBound: false,
      projectAuthorityPath: null,
    },
    ...observations(SAVE_AUTHORITY_ROUTES.DURABLE_SAVE_V1),
    executors: {
      [SAVE_AUTHORITY_ROUTES.DURABLE_SAVE_V1]: async () => durableSaveTransaction({
        filePath,
        content,
        revision: 12,
      }),
      [SAVE_AUTHORITY_ROUTES.PROJECT_TRANSACTION_V1]: async () => {
        projectCalls += 1;
        return { success: true };
      },
    },
  });
  assert.equal(fs.readFileSync(filePath, 'utf8'), content);
  assert.equal(projectCalls, 0);
  assert.equal(receipt.legacyStrangler.executedAuthorityCount, 1);
  const bound = bindSaveReceiptToAck({
    receipt,
    capturedContent: content,
    capturedGeneration: 12,
    latestEditGeneration: 12,
  });
  assert.equal(bound.receipt.receiptKind, 'DURABLE_SAVE_V1');
  assert.equal(bound.ack.kind, 'SAVED');
});

test('WP202 delegates one project-bound save to WP201 with no durable fallback', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'r24-wp202-project-'));
  const scenePath = path.join(root, 'scenes', 'scene.txt');
  const manifestPath = path.join(root, 'project.json');
  fs.mkdirSync(path.dirname(scenePath), { recursive: true });
  fs.writeFileSync(scenePath, 'old scene');
  fs.writeFileSync(manifestPath, '{"revision":1}');
  let durableFallbackCalls = 0;
  const receipt = await executeWriterSaveThroughStranglerGateway({
    request: {
      filePath: scenePath,
      content: 'new scene',
      revision: 2,
      projectBound: true,
      projectAuthorityPath: manifestPath,
    },
    ...observations(SAVE_AUTHORITY_ROUTES.PROJECT_TRANSACTION_V1),
    executors: {
      [SAVE_AUTHORITY_ROUTES.DURABLE_SAVE_V1]: async () => {
        durableFallbackCalls += 1;
        return { success: true };
      },
      [SAVE_AUTHORITY_ROUTES.PROJECT_TRANSACTION_V1]: async () => commitProjectTransaction({
        scenePath,
        sceneContent: 'new scene',
        expectedSceneContent: 'old scene',
        manifestPath,
        manifestContent: '{"revision":2}',
        expectedManifestContent: '{"revision":1}',
        revision: 2,
        publishManifest: async ({ expectedText, nextText }) => {
          assert.equal(fs.readFileSync(manifestPath, 'utf8'), expectedText);
          await durableSaveTransaction({ filePath: manifestPath, content: nextText, revision: 2 });
        },
      }),
    },
  });
  assert.equal(durableFallbackCalls, 0);
  assert.equal(fs.readFileSync(scenePath, 'utf8'), 'new scene');
  assert.equal(fs.readFileSync(manifestPath, 'utf8'), '{"revision":2}');
  assert.equal(receipt.legacyStrangler.selectedRoute, SAVE_AUTHORITY_ROUTES.PROJECT_TRANSACTION_V1);
  const bound = bindSaveReceiptToAck({
    receipt,
    capturedContent: 'new scene',
    capturedGeneration: 2,
    latestEditGeneration: 2,
  });
  assert.equal(bound.receipt.receiptKind, 'PROJECT_TRANSACTION_V1');
});

test('live Writer save wiring has one WP202 gateway and retains both closed executors', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'main.js'), 'utf8');
  assert.equal(source.split('async function commitWriterProjectSnapshot(').length - 1, 1);
  assert.match(source, /executeWriterSaveThroughStranglerGateway\(\{/u);
  assert.match(source, /SAVE_AUTHORITY_ROUTES\.DURABLE_SAVE_V1/u);
  assert.match(source, /SAVE_AUTHORITY_ROUTES\.PROJECT_TRANSACTION_V1/u);
  assert.match(source, /commitProjectTransaction\(\{/u);
  assert.match(source, /durableSaveTransaction\(\{/u);
});

test('WP202 observation work is constant and has no renderer or accessibility surface', async () => {
  let observationsCount = 0;
  const makeObserver = (observerId) => async (identity) => {
    observationsCount += 1;
    return createAuthorityObservation({
      observerId,
      requestDigest: identity.identityDigest,
      route: SAVE_AUTHORITY_ROUTES.DURABLE_SAVE_V1,
    });
  };
  await executeWriterSaveThroughStranglerGateway({
    request: {
      filePath: '/isolated/large.txt',
      content: 'x'.repeat(1024 * 1024),
      revision: 1,
      projectBound: false,
      projectAuthorityPath: null,
    },
    observeLegacy: makeObserver(OBSERVER_IDS.LEGACY),
    observeGateway: makeObserver(OBSERVER_IDS.GATEWAY),
    executors: {
      [SAVE_AUTHORITY_ROUTES.DURABLE_SAVE_V1]: async () => ({ success: true }),
    },
  });
  assert.equal(observationsCount, 2);
});
