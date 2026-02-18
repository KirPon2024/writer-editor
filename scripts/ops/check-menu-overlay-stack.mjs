#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  normalizeMenuConfigPipeline,
} = require('../../src/menu/menu-config-normalizer.js');
const {
  normalizePluginOverlays,
} = require('../../src/menu/plugin-overlays-loader.js');

const MODE_RELEASE = 'release';
const MODE_PROMOTION = 'promotion';
const RESULT_PASS = 'PASS';
const RESULT_WARN = 'WARN';
const RESULT_FAIL = 'FAIL';
const FAIL_SIGNAL_STACK = 'E_MENU_OVERLAY_STACK_DRIFT';
const FAIL_SIGNAL_PLUGIN_POLICY = 'E_PLUGIN_MENU_OVERLAY_POLICY_VIOLATION';
const OVERLAY_STACK_CANON_PATH = 'docs/OPS/STATUS/MENU_OVERLAY_STACK_CANON_v1.json';
const PLUGIN_POLICY_PATH = 'docs/OPS/STATUS/PLUGIN_MENU_OVERLAY_POLICY_v1.json';

function normalizeString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function parseBooleanish(value) {
  const normalized = normalizeString(value).toLowerCase();
  if (!normalized) return false;
  return normalized === '1'
    || normalized === 'true'
    || normalized === 'yes'
    || normalized === 'on';
}

function normalizeMode(value) {
  const normalized = normalizeString(value).toLowerCase();
  if (normalized === MODE_PROMOTION) return MODE_PROMOTION;
  return MODE_RELEASE;
}

function resolveMode(value) {
  if (normalizeString(value)) return normalizeMode(value);
  if (parseBooleanish(process.env.promotionMode)
    || parseBooleanish(process.env.PROMOTION_MODE)
    || parseBooleanish(process.env.WAVE_PROMOTION_MODE)) {
    return MODE_PROMOTION;
  }
  return MODE_RELEASE;
}

function parseArgs(argv = process.argv.slice(2)) {
  const out = {
    json: false,
    mode: '',
    simulateViolation: '',
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = normalizeString(argv[i]);
    if (!arg) continue;
    if (arg === '--json') {
      out.json = true;
      continue;
    }
    if (arg === '--mode' && i + 1 < argv.length) {
      out.mode = normalizeString(argv[i + 1]);
      i += 1;
      continue;
    }
    if (arg.startsWith('--mode=')) {
      out.mode = normalizeString(arg.slice('--mode='.length));
      continue;
    }
    if (arg === '--simulate-violation' && i + 1 < argv.length) {
      out.simulateViolation = normalizeString(argv[i + 1]);
      i += 1;
      continue;
    }
    if (arg.startsWith('--simulate-violation=')) {
      out.simulateViolation = normalizeString(arg.slice('--simulate-violation='.length));
    }
  }
  return out;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function arraysEqual(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b)) return false;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

function buildBaseConfigFixture() {
  return {
    version: 'v2',
    fonts: [
      {
        id: 'font-default',
        label: 'Serif',
        value: 'serif',
      },
    ],
    menus: [
      {
        id: 'file',
        label: 'File',
        items: [
          {
            id: 'save',
            label: 'Save',
            command: 'cmd.project.save',
            enabledWhen: { op: 'all', args: [] },
            mode: ['offline'],
            profile: ['minimal', 'pro', 'guru'],
            stage: ['X1', 'X2', 'X3', 'X4'],
          },
        ],
      },
    ],
  };
}

function buildOverlayInputFixture() {
  const commandByLayer = {
    platform: 'cmd.project.open',
    profile: 'cmd.project.saveAs',
    workspace: 'cmd.project.close',
    user: 'cmd.project.new',
    pluginA: 'cmd.project.export.docxMin',
    pluginB: 'cmd.project.save',
  };

  return {
    platformOverlay: {
      config: {
        menus: [{ id: 'file', items: [{ id: 'save', command: commandByLayer.platform }] }],
      },
      sourceRef: 'layer:platform',
    },
    profileOverlay: {
      config: {
        menus: [{ id: 'file', items: [{ id: 'save', command: commandByLayer.profile }] }],
      },
      sourceRef: 'layer:profile',
    },
    workspaceOverlay: {
      config: {
        menus: [{ id: 'file', items: [{ id: 'save', command: commandByLayer.workspace }] }],
      },
      sourceRef: 'layer:workspace',
    },
    userOverlay: {
      config: {
        menus: [{ id: 'file', items: [{ id: 'save', command: commandByLayer.user }] }],
      },
      sourceRef: 'layer:user',
    },
    pluginOverlays: [
      {
        pluginId: 'plugin.zeta',
        pluginVersion: '1.0.0',
        overlayId: 'overlay-b',
        signatureStatus: 'signed',
        sourceRef: 'plugin:zeta',
        inserts: [{ id: 'file', items: [{ id: 'save', command: commandByLayer.pluginB }] }],
      },
      {
        pluginId: 'plugin.alpha',
        pluginVersion: '2.0.0',
        overlayId: 'overlay-a',
        signatureStatus: 'signed',
        sourceRef: 'plugin:alpha',
        inserts: [{ id: 'file', items: [{ id: 'save', command: commandByLayer.pluginA }] }],
      },
    ],
    context: {
      platform: 'mac',
      mode: 'offline',
      profile: 'minimal',
      stage: 'X2',
      hasDocument: true,
    },
  };
}

function uniqueOriginsInOrder(overlayStackApplied = []) {
  const seen = new Set();
  const out = [];
  for (const row of overlayStackApplied) {
    const origin = normalizeString(row && row.origin).toLowerCase();
    if (!origin || seen.has(origin)) continue;
    seen.add(origin);
    out.push(origin);
  }
  return out;
}

export function evaluateMenuOverlayStackState(input = {}) {
  const repoRoot = process.cwd();
  const mode = resolveMode(input.mode);
  const violations = [];
  const stackOrderExpected = [];
  let stackOrderDetected = [];
  let determinismHashA = '';
  let determinismHashB = '';

  const overlayCanonAbs = path.resolve(repoRoot, OVERLAY_STACK_CANON_PATH);
  const pluginPolicyAbs = path.resolve(repoRoot, PLUGIN_POLICY_PATH);

  if (!fs.existsSync(overlayCanonAbs)) {
    violations.push({
      code: 'OVERLAY_STACK_CANON_MISSING',
      message: `Missing SSOT: ${OVERLAY_STACK_CANON_PATH}`,
      failSignalCode: FAIL_SIGNAL_STACK,
    });
  } else {
    try {
      const canon = readJson(overlayCanonAbs);
      if (!Array.isArray(canon.stackOrder) || canon.stackOrder.length === 0) {
        violations.push({
          code: 'OVERLAY_STACK_CANON_INVALID',
          message: 'stackOrder must be a non-empty array.',
          failSignalCode: FAIL_SIGNAL_STACK,
        });
      } else {
        stackOrderExpected.push(
          ...canon.stackOrder.map((entry) => normalizeString(entry).toLowerCase()).filter(Boolean),
        );
      }
    } catch (error) {
      violations.push({
        code: 'OVERLAY_STACK_CANON_UNREADABLE',
        message: `Cannot read overlay stack canon: ${error.message}`,
        failSignalCode: FAIL_SIGNAL_STACK,
      });
    }
  }

  if (!fs.existsSync(pluginPolicyAbs)) {
    violations.push({
      code: 'PLUGIN_OVERLAY_POLICY_MISSING',
      message: `Missing SSOT: ${PLUGIN_POLICY_PATH}`,
      failSignalCode: FAIL_SIGNAL_PLUGIN_POLICY,
    });
  }

  const fixture = buildOverlayInputFixture();
  const baseConfig = buildBaseConfigFixture();
  const stateA = normalizeMenuConfigPipeline({
    ...fixture,
    baseConfig,
    baseSourceRef: 'fixture:base',
    mode,
  });

  if (!stateA.ok || !stateA.normalizedConfig) {
    violations.push({
      code: 'OVERLAY_STACK_NORMALIZER_FAILED',
      message: 'Normalizer failed on deterministic overlay fixture.',
      failSignalCode: FAIL_SIGNAL_STACK,
      diagnostics: stateA.diagnostics,
    });
  } else {
    stackOrderDetected = uniqueOriginsInOrder(stateA.overlayStackApplied);
    determinismHashA = normalizeString(stateA.normalizedHashSha256);
  }

  const pluginReordered = [...fixture.pluginOverlays].reverse();
  const stateB = normalizeMenuConfigPipeline({
    ...fixture,
    pluginOverlays: pluginReordered,
    baseConfig: buildBaseConfigFixture(),
    baseSourceRef: 'fixture:base',
    mode,
  });
  if (!stateB.ok || !stateB.normalizedConfig) {
    violations.push({
      code: 'OVERLAY_STACK_NORMALIZER_SECOND_PASS_FAILED',
      message: 'Normalizer failed on second deterministic pass.',
      failSignalCode: FAIL_SIGNAL_STACK,
      diagnostics: stateB.diagnostics,
    });
  } else {
    determinismHashB = normalizeString(stateB.normalizedHashSha256);
  }

  if (stackOrderExpected.length > 0 && !arraysEqual(stackOrderDetected, stackOrderExpected)) {
    violations.push({
      code: 'OVERLAY_STACK_ORDER_MISMATCH',
      message: 'Detected overlay stack order differs from SSOT stackOrder.',
      failSignalCode: FAIL_SIGNAL_STACK,
      stackOrderDetected,
      stackOrderExpected,
    });
  }

  if (determinismHashA && determinismHashB && determinismHashA !== determinismHashB) {
    violations.push({
      code: 'OVERLAY_STACK_DETERMINISM_MISMATCH',
      message: 'Plugin overlay permutation changed normalized hash.',
      failSignalCode: FAIL_SIGNAL_STACK,
      hashA: determinismHashA,
      hashB: determinismHashB,
    });
  }

  const pluginPolicyProbe = normalizePluginOverlays([
    {
      pluginId: 'plugin.probe',
      pluginVersion: '1.0.0',
      overlayId: 'probe',
      signatureStatus: 'signed',
      inserts: [],
      handler: 'forbidden',
    },
  ]);
  if (!Array.isArray(pluginPolicyProbe.violations) || pluginPolicyProbe.violations.length === 0) {
    violations.push({
      code: 'PLUGIN_OVERLAY_POLICY_GUARD_INACTIVE',
      message: 'Plugin overlay policy guard did not reject executable-like field.',
      failSignalCode: FAIL_SIGNAL_PLUGIN_POLICY,
    });
  }

  const simulateViolation = normalizeString(input.simulateViolation).toLowerCase();
  if (simulateViolation) {
    const failSignalCode = simulateViolation === 'plugin-policy'
      ? FAIL_SIGNAL_PLUGIN_POLICY
      : FAIL_SIGNAL_STACK;
    violations.push({
      code: 'SIMULATED_VIOLATION',
      message: `Simulated violation requested: ${simulateViolation}`,
      failSignalCode,
    });
  }

  const hasViolations = violations.length > 0;
  const result = !hasViolations
    ? RESULT_PASS
    : (mode === MODE_PROMOTION ? RESULT_FAIL : RESULT_WARN);
  const failSignalCode = !hasViolations
    ? ''
    : (violations.some((entry) => entry.failSignalCode === FAIL_SIGNAL_PLUGIN_POLICY)
      ? FAIL_SIGNAL_PLUGIN_POLICY
      : FAIL_SIGNAL_STACK);

  return {
    ok: result !== RESULT_FAIL,
    mode,
    result,
    failSignalCode,
    stackOrderExpected,
    stackOrderDetected,
    determinismHashA,
    determinismHashB,
    violations,
  };
}

function printHuman(state) {
  console.log(`MENU_OVERLAY_STACK_CHECK_RESULT=${state.result}`);
  console.log(`MENU_OVERLAY_STACK_CHECK_MODE=${state.mode}`);
  console.log(`MENU_OVERLAY_STACK_CHECK_OK=${state.ok ? 1 : 0}`);
  console.log(`MENU_OVERLAY_STACK_CHECK_EXPECTED=${JSON.stringify(state.stackOrderExpected)}`);
  console.log(`MENU_OVERLAY_STACK_CHECK_DETECTED=${JSON.stringify(state.stackOrderDetected)}`);
  console.log(`MENU_OVERLAY_STACK_CHECK_VIOLATIONS=${state.violations.length}`);
  if (state.failSignalCode) console.log(`MENU_OVERLAY_STACK_CHECK_FAIL_SIGNAL=${state.failSignalCode}`);
}

const args = parseArgs(process.argv.slice(2));
const state = evaluateMenuOverlayStackState({
  mode: args.mode,
  simulateViolation: args.simulateViolation,
});
if (args.json) process.stdout.write(`${JSON.stringify(state, null, 2)}\n`);
else printHuman(state);
process.exit(state.result === RESULT_FAIL ? 1 : 0);
