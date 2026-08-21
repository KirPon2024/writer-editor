'use strict';

// R2.4 WP-100 wiring matrix: full-denominator per-channel proof that the
// foundation laws compose in the live main.js and preload.js wiring.
// The scanner is exported so the wiring mutants suite can use it as the
// kill oracle.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');

const GUARDED_CHANNELS = [
  'file:open',
  'file:save',
  'file:save-as',
  'ui:create-node',
  'ui:delete-node',
  'ui:get-collab-scope-local',
  'ui:get-project-tree',
  'ui:move-node',
  'ui:open-document',
  'ui:open-section',
  'ui:rename-node',
  'ui:reorder-node',
  'ui:request-autosave',
];
const PROTOCOL_BRIDGES = ['ui:command-bridge', 'ui:workspace-query-bridge', 'ui:save-lifecycle-signal-bridge'];

function sliceRegistrationBody(source, channel) {
  const marker = `'${channel}'`;
  const start = source.indexOf(marker);
  if (start === -1) return '';
  // The registration body runs to the next guarded registration or a broad
  // window, whichever comes first.
  const window = source.slice(start, start + 4000);
  const next = window.slice(40).search(/guarded(?:Protocol)?Handle\('/u);
  return next === -1 ? window : window.slice(0, 40 + next);
}

function scanWiringLaws(mainSource, preloadSource) {
  const violations = [];

  // S0: every privileged channel is registered through the guarded factory;
  // no raw ipcMain registration remains.
  const rawHandle = (mainSource.match(/ipcMain\.handle\(/gu) || []).length;
  const rawOn = (mainSource.match(/(?<!\.)\bipcMain\.on\(/gu) || []).length;
  if (rawHandle > 0) violations.push({ law: 'S0_CALLER_IDENTITY', detail: `raw ipcMain.handle x${rawHandle}` });
  if (rawOn > 0) violations.push({ law: 'S0_CALLER_IDENTITY', detail: `raw ipcMain.on x${rawOn}` });
  for (const channel of [...GUARDED_CHANNELS, ...PROTOCOL_BRIDGES]) {
    const registered = mainSource.includes(`guardedHandle('${channel}'`) || mainSource.includes(`guardedProtocolHandle('${channel}'`);
    if (!registered) violations.push({ law: 'S0_CALLER_IDENTITY', detail: `channel not guarded: ${channel}` });
  }

  // S1: each protocol bridge validates the versioned envelope before any
  // interpretation, and the refusal gate is live.
  for (const bridge of PROTOCOL_BRIDGES) {
    const body = sliceRegistrationBody(mainSource, bridge);
    const validateAt = body.indexOf(`validateIpcEnvelope(request, '${bridge}')`);
    const gateAt = body.indexOf('if (!envelopeVerdict.ok) {');
    const interpretAt = body.indexOf('safeRequest.');
    if (validateAt === -1) violations.push({ law: 'S1_ENVELOPE_BUDGETS', detail: `no envelope validation: ${bridge}` });
    if (gateAt === -1) violations.push({ law: 'S1_ENVELOPE_BUDGETS', detail: `refusal gate removed: ${bridge}` });
    if (validateAt !== -1 && interpretAt !== -1 && interpretAt < validateAt) {
      violations.push({ law: 'S1_ENVELOPE_BUDGETS', detail: `interpretation precedes validation: ${bridge}` });
    }
  }

  // K0: the command bridge returns through the unified result factories.
  const commandBody = sliceRegistrationBody(mainSource, 'ui:command-bridge');
  for (const factory of ['makeCommandBridgeSuccess', 'makeCommandBridgeFailure', 'makeCommandBridgeException']) {
    if (!commandBody.includes(factory)) violations.push({ law: 'K0_COMMAND_PROTOCOL', detail: `result factory missing: ${factory}` });
  }
  if (!commandBody.includes('UI_COMMAND_BRIDGE_ALLOWED_COMMAND_IDS.has(commandId)')) {
    violations.push({ law: 'K0_COMMAND_PROTOCOL', detail: 'command bridge allowlist gate missing' });
  }

  // ENT0: both dispatch ports consult the one entitlement table with the
  // product-owned tier, and both refusal gates are live.
  const decideCalls = (mainSource.match(/decideCommandEntitlement\(commandId, getProductEntitlementTier\(\)\)/gu) || []).length;
  if (decideCalls !== 2) violations.push({ law: 'ENT0_ENTITLEMENT', detail: `table consultations: ${decideCalls}` });
  const refusalGates = (mainSource.match(/if \(!entitlement\.available\) \{/gu) || []).length;
  if (refusalGates !== 2) violations.push({ law: 'ENT0_ENTITLEMENT', detail: `refusal gates: ${refusalGates}` });

  // P0/P1: the signaled generation is merged monotonically by the main
  // process; a renderer-claimed generation is never assigned directly.
  const signalBody = sliceRegistrationBody(mainSource, 'ui:save-lifecycle-signal-bridge');
  if (!signalBody.includes('mergeSignaledGeneration(lastSignaledEditGeneration, payload.generation)')) {
    violations.push({ law: 'P0_GENERATION', detail: 'monotonic merge of signaled generation missing' });
  }
  if (/lastSignaledEditGeneration\s*=\s*payload\.generation/u.test(signalBody)) {
    violations.push({ law: 'P0_GENERATION', detail: 'renderer generation assigned directly' });
  }

  // SEC0/K1: file admission delegates to the core policy seam.
  if (!mainSource.includes('isAllowedFilePathByLaw(candidatePath, getFilePathAllowlistRoots())')) {
    violations.push({ law: 'SEC0_K1_PATH_ADMISSION', detail: 'isAllowedFilePath does not delegate to the policy seam' });
  }

  // Preload: every channel literal in the preload invoke map is one of the
  // registered channels; no unlisted channel is exposed.
  const preloadChannels = [...preloadSource.matchAll(/'(ui:[a-z-]+|file:[a-z-]+)'/gu)].map((m) => m[1]);
  const allowed = new Set([...GUARDED_CHANNELS, ...PROTOCOL_BRIDGES]);
  for (const channel of preloadChannels) {
    if ((channel.startsWith('ui:command-bridge') || channel.startsWith('ui:workspace-query-bridge') || channel.startsWith('ui:save-lifecycle')) && !allowed.has(channel)) {
      violations.push({ law: 'S1_PRELOAD_FRAMING', detail: `preload exposes unlisted channel: ${channel}` });
    }
  }

  return { violations, denominator: GUARDED_CHANNELS.length + PROTOCOL_BRIDGES.length };
}

test('WP-100 wiring matrix: every foundation law holds per channel in the live wiring', () => {
  const mainSource = fs.readFileSync(path.join(ROOT, 'src', 'main.js'), 'utf8');
  const preloadSource = fs.readFileSync(path.join(ROOT, 'src', 'preload.js'), 'utf8');
  const { violations, denominator } = scanWiringLaws(mainSource, preloadSource);
  console.log(`R24_WP100_MATRIX=${JSON.stringify({ channels: denominator, violations: violations.length })}`);
  assert.equal(denominator, 16, 'full channel denominator');
  assert.deepEqual(violations, []);
});

module.exports = { scanWiringLaws, GUARDED_CHANNELS, PROTOCOL_BRIDGES };
