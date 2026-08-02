const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { ALLOWED_COMMAND_IDS, createCommandSurfaceKernel } = require('../../src/command/commandSurfaceKernel.js');

test('donor port command surface kernel: allowlist is fixed to minimal non-ui command ids', () => {
  assert.deepEqual(ALLOWED_COMMAND_IDS, [
    'cmd.project.open',
    'cmd.project.save',
    'cmd.project.saveAs',
    'cmd.project.exportCurrentSceneTxtV1',
    'cmd.project.exportSelectedScenesTxtV1',
    'cmd.project.exportAllScenesTxtV1',
    'cmd.project.exportPdfV1',
    'cmd.project.exportFullArchiveV1',
    'cmd.project.importFullArchiveV1',
    'cmd.project.importMarkdownV1',
    'cmd.project.exportMarkdownV1',
    'cmd.project.review.exportFullManuscriptDocxReviewPacket',
    'cmd.project.releaseClaim.admit',
    'cmd.project.releaseClaim.execute',
    'cmd.rtk.reviewSession.importComments',
    'cmd.rtk.review.applyNonOverlapTrackedReplacements',
    'cmd.rtk.review.applyMultiSceneNonOverlapTrackedReplacements',
    'cmd.rtk.review.applyRootCommentReturn',
    'cmd.rtk.review.applyCommentLifecycleReturn',
  ]);
});

test('donor port command surface kernel: rejects unknown command ids with typed envelope', async () => {
  const kernel = createCommandSurfaceKernel({});
  const result = await kernel.dispatch('cmd.project.unknown', {});
  assert.equal(result.ok, false);
  assert.equal(result.error.code, 'E_COMMAND_ID_NOT_ALLOWED');
  assert.equal(result.error.reason, 'COMMAND_ID_NOT_ALLOWED');
});

test('donor port command surface kernel: rejects non-object payloads with typed envelope', async () => {
  const kernel = createCommandSurfaceKernel({
    'cmd.project.open': async () => ({ ok: true }),
  });
  const result = await kernel.dispatch('cmd.project.open', null);
  assert.equal(result.ok, false);
  assert.equal(result.error.code, 'E_PAYLOAD_CONTRACT_VALIDATION_MISSING');
  assert.equal(result.error.reason, 'ARGS_OBJECT_REQUIRED');
});

test('donor port command surface kernel: preserves typed accepted results with code and reason', async () => {
  const expected = {
    ok: true,
    type: 'revisionBridge.releaseClaimPublicationEffect',
    status: 'accepted',
    code: 'REVISION_BRIDGE_RELEASE_CLAIM_PUBLICATION_EFFECT_ACCEPTED',
    reason: 'REVISION_BRIDGE_RELEASE_CLAIM_PUBLICATION_EFFECT_ACCEPTED',
    reasons: [],
    binding: { mode: 'RELEASE_MODE' },
    summary: {
      claimSurface: 'USER_FACING',
      packetId: 'packet-1',
      attestationId: 'attestation-1',
      commandId: 'cmd.project.releaseClaim.execute',
      admissionClass: 'USER_FACING_CLAIM_READY',
      publicationEffectOnly: true,
    },
  };
  const kernel = createCommandSurfaceKernel({
    'cmd.project.releaseClaim.execute': async () => expected,
  });
  const result = await kernel.dispatch('cmd.project.releaseClaim.execute', {});
  assert.deepEqual(result, expected);
});

test('donor port command surface kernel: typed passthrough stays limited to bounded release-claim command ids', async () => {
  const kernel = createCommandSurfaceKernel({
    'cmd.project.open': async () => ({
      ok: false,
      type: 'runtime.openResult',
      status: 'blocked',
      code: 'E_OPEN_BLOCKED',
      reason: 'OPEN_BLOCKED',
    }),
  });
  const result = await kernel.dispatch('cmd.project.open', {});
  assert.equal(result.ok, false);
  assert.equal(result.error.code, 'E_OPEN_BLOCKED');
  assert.equal(result.error.reason, 'OPEN_BLOCKED');
});

test('donor port command surface kernel: normalizes thrown handler errors', async () => {
  const kernel = createCommandSurfaceKernel({
    'cmd.project.save': async () => {
      throw Object.assign(new Error('save exploded'), {
        code: 'E_SAVE_FAIL',
        reason: 'SAVE_FAILED',
        details: { phase: 'write' },
      });
    },
  });
  const result = await kernel.dispatch('cmd.project.save', {});
  assert.equal(result.ok, false);
  assert.equal(result.error.code, 'E_SAVE_FAIL');
  assert.equal(result.error.op, 'cmd.project.save');
  assert.equal(result.error.reason, 'SAVE_FAILED');
  assert.deepEqual(result.error.details, { phase: 'write' });
});

test('donor port command surface kernel: main routes minimal command family through kernel', () => {
  const mainText = fs.readFileSync(path.join(process.cwd(), 'src', 'main.js'), 'utf8');
  assert.match(mainText, /createCommandSurfaceKernel/);
  assert.match(mainText, /open:\s*COMMAND_SURFACE_KERNEL_COMMAND_IDS\.PROJECT_OPEN/);
  assert.match(mainText, /save:\s*COMMAND_SURFACE_KERNEL_COMMAND_IDS\.PROJECT_SAVE/);
  assert.match(mainText, /saveAs:\s*COMMAND_SURFACE_KERNEL_COMMAND_IDS\.PROJECT_SAVE_AS/);
  assert.match(
    mainText,
    /\[EXPORT_CURRENT_SCENE_TXT_COMMAND_ID\]: async \(payload = \{\}\) => \{\s*const result = await dispatchCommandSurfaceKernel\(\s*COMMAND_SURFACE_KERNEL_COMMAND_IDS\.PROJECT_EXPORT_CURRENT_SCENE_TXT_V1,\s*payload,\s*\);\s*return normalizeUiBridgeMenuResult\(result\);/m,
  );
  assert.match(
    mainText,
    /\[EXPORT_SELECTED_SCENES_TXT_COMMAND_ID\]: async \(payload = \{\}\) => \{\s*const confirmed = payload && payload\.confirmed === true;[\s\S]*sendCanonicalRuntimeCommand\(\s*EXPORT_SELECTED_SCENES_TXT_COMMAND_ID,[\s\S]*COMMAND_SURFACE_KERNEL_COMMAND_IDS\.PROJECT_EXPORT_SELECTED_SCENES_TXT_V1[\s\S]*return normalizeUiBridgeMenuResult\(result\);/m,
  );
  assert.match(
    mainText,
    /\[EXPORT_ALL_SCENES_TXT_COMMAND_ID\]: async \(payload = \{\}\) => \{\s*const result = await dispatchCommandSurfaceKernel\(\s*COMMAND_SURFACE_KERNEL_COMMAND_IDS\.PROJECT_EXPORT_ALL_SCENES_TXT_V1,\s*payload,\s*\);\s*return normalizeUiBridgeMenuResult\(result\);/m,
  );
  assert.match(mainText, /dispatchCommandSurfaceKernel\(COMMAND_SURFACE_KERNEL_COMMAND_IDS\.PROJECT_IMPORT_MARKDOWN_V1/);
  assert.match(mainText, /dispatchCommandSurfaceKernel\(COMMAND_SURFACE_KERNEL_COMMAND_IDS\.PROJECT_EXPORT_MARKDOWN_V1/);
  assert.match(mainText, /'cmd\.project\.releaseClaim\.admit':\s*async\s*\(payload\s*=\s*\{\}\)\s*=>\s*\{\s*return dispatchCommandSurfaceKernel\(COMMAND_SURFACE_KERNEL_COMMAND_IDS\.PROJECT_RELEASE_CLAIM_ADMIT,\s*payload\);/);
  assert.match(mainText, /'cmd\.project\.releaseClaim\.execute':\s*async\s*\(payload\s*=\s*\{\}\)\s*=>\s*\{\s*return dispatchCommandSurfaceKernel\(COMMAND_SURFACE_KERNEL_COMMAND_IDS\.PROJECT_RELEASE_CLAIM_EXECUTE,\s*payload\);/);
  assert.match(mainText, /UI_COMMAND_BRIDGE_ALLOWED_COMMAND_IDS\s*=\s*new Set\(\[[\s\S]*EXPORT_CURRENT_SCENE_TXT_COMMAND_ID/);
  assert.match(mainText, /UI_COMMAND_BRIDGE_ALLOWED_COMMAND_IDS\s*=\s*new Set\(\[[\s\S]*EXPORT_SELECTED_SCENES_TXT_COMMAND_ID/);
  assert.match(mainText, /UI_COMMAND_BRIDGE_ALLOWED_COMMAND_IDS\s*=\s*new Set\(\[[\s\S]*EXPORT_ALL_SCENES_TXT_COMMAND_ID/);
  assert.match(mainText, /UI_COMMAND_BRIDGE_ALLOWED_COMMAND_IDS\s*=\s*new Set\(\[[\s\S]*'cmd\.project\.releaseClaim\.admit'/);
  assert.match(mainText, /UI_COMMAND_BRIDGE_ALLOWED_COMMAND_IDS\s*=\s*new Set\(\[[\s\S]*'cmd\.project\.releaseClaim\.execute'/);
});
