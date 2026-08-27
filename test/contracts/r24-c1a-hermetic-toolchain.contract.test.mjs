import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { canonicalBytes, sha256 } from "../../scripts/ops/r24/corrective/canonical-json.mjs";
import { buildDependencyInventory, evaluateAudit, evaluateBuildMetafiles, evaluateC1A } from "../../scripts/ops/r24/corrective/c1a-hermetic-toolchain.mjs";

const workflows = [
  ".github/workflows/lockfile-node20.yml",
  ".github/workflows/oss-policy.yml",
  ".github/workflows/r24-c1a-hermetic.yml",
  ".github/workflows/rtk-required.yml",
  ".github/workflows/x1-runtime-parity.yml"
];

function fixture() {
  const container = mkdtempSync(path.join(tmpdir(), "yalken-c1a-test-"));
  const root = path.join(container, "worktree");
  mkdirSync(root);
  const lock = {
    lockfileVersion: 3,
    name: "fixture",
    packages: {
      "": { name: "fixture", version: "1.0.0" },
      "node_modules/esbuild": { dev: true, version: "0.28.1" }
    },
    requires: true,
    version: "1.0.0"
  };
  const lockBytes = Buffer.from(`${JSON.stringify(lock, null, 2)}\n`);
  const inventory = buildDependencyInventory(lockBytes);
  const contract = {
    auditPolicy: { baselineObservation: { critical: 0, high: 2 } },
    dependencyInventory: { entryCount: inventory.entryCount, packagesMapDigest: inventory.packagesMapDigest },
    lockfile: {
      baseSha256: sha256(lockBytes),
      expectedSha256: sha256(lockBytes),
      forbidden: ["pnpm-lock.yaml", "pnpm-workspace.yaml", "yarn.lock", "bun.lock", "bun.lockb"],
      lockfileVersion: 3
    },
    runtime: {
      nodeEnginesRange: ">=20.19.0 <21.0.0",
      nodeExact: "20.19.5",
      nodeVersionFile: ".node-version",
      npmEnginesRange: ">=10.0.0 <11.0.0",
      npmExact: "10.8.2",
      packageManagerField: "npm@10.8.2"
    },
    workflows: { setupNodeAction: "actions/setup-node@v4", workflowPaths: workflows }
  };
  writeFileSync(path.join(root, ".node-version"), "20.19.5\n");
  writeFileSync(path.join(root, "package.json"), JSON.stringify({ engines: { node: contract.runtime.nodeEnginesRange, npm: contract.runtime.npmEnginesRange }, packageManager: contract.runtime.packageManagerField }));
  writeFileSync(path.join(root, "package-lock.json"), lockBytes);
  mkdirSync(path.join(root, "node_modules/esbuild/lib"), { recursive: true });
  writeFileSync(path.join(root, "node_modules/esbuild/lib/main.js"), "");
  for (const relativePath of workflows) {
    const filename = path.join(root, relativePath);
    mkdirSync(path.dirname(filename), { recursive: true });
    writeFileSync(filename, "steps:\n  - uses: actions/setup-node@v4\n    with:\n      node-version-file: \".node-version\"\n");
  }
  return { container, contract, inventory, inventoryFile: { bytes: canonicalBytes(inventory), value: inventory }, root };
}

function evaluate(state, overrides = {}) {
  return evaluateC1A(state.root, {
    contract: state.contract,
    buildEvidence: { inputCount: 2, status: "PASS", writeMode: "MEMORY_ONLY" },
    currentNodeVersion: "20.19.5",
    currentNpmVersion: "10.8.2",
    esbuildResolvedPath: path.join(state.root, "node_modules/esbuild/lib/main.js"),
    inventoryFile: state.inventoryFile,
    ...overrides
  });
}

test("complete canonical inventory is deterministic and binds every lock record", () => {
  const state = fixture();
  try {
    const first = buildDependencyInventory(readFileSync(path.join(state.root, "package-lock.json")));
    const second = buildDependencyInventory(readFileSync(path.join(state.root, "package-lock.json")));
    assert.deepEqual(first, second);
    assert.equal(first.entryCount, 2);
    assert.equal(first.entries.every((entry) => /^[0-9a-f]{64}$/u.test(entry.recordSha256)), true);
    assert.equal(evaluate(state).status, "PASS");
  } finally {
    rmSync(state.container, { recursive: true });
  }
});

test("stale or non-canonical inventory fails closed", () => {
  const state = fixture();
  try {
    const stale = structuredClone(state.inventory);
    stale.entries[1].version = "0.0.0";
    assert.equal(evaluate(state, { inventoryFile: { bytes: canonicalBytes(stale), value: stale } }).status, "FAIL");
    assert.equal(evaluate(state, { inventoryFile: { bytes: Buffer.from(JSON.stringify(state.inventory)), value: state.inventory } }).status, "FAIL");
  } finally {
    rmSync(state.container, { recursive: true });
  }
});

test("runtime and package manager pins reject drift", () => {
  const state = fixture();
  try {
    assert.equal(evaluate(state, { currentNodeVersion: "20.19.4" }).acceptanceSignals.NODE_20_19_5_PINNED, "FAIL");
    assert.equal(evaluate(state, { currentNpmVersion: "10.9.0" }).acceptanceSignals.APPROVED_NPM_10_PINNED, "FAIL");
  } finally {
    rmSync(state.container, { recursive: true });
  }
});

test("forbidden PNPM files and parent capabilities fail closed", () => {
  const state = fixture();
  try {
    writeFileSync(path.join(state.root, "pnpm-lock.yaml"), "lockfileVersion: 9\n");
    assert.equal(evaluate(state).acceptanceSignals.ONLY_PACKAGE_LOCK_PRESENT, "FAIL");
    rmSync(path.join(state.root, "pnpm-lock.yaml"));
    mkdirSync(path.join(state.container, "node_modules"));
    assert.equal(evaluate(state).acceptanceSignals.NO_SIBLING_NODE_MODULES_OR_ESBUILD, "FAIL");
  } finally {
    rmSync(state.container, { recursive: true });
  }
});

test("workflow ranges and esbuild resolution outside the worktree fail closed", () => {
  const state = fixture();
  try {
    mkdirSync(path.join(state.container, "outside/esbuild/lib"), { recursive: true });
    writeFileSync(path.join(state.container, "outside/esbuild/lib/main.js"), "");
    writeFileSync(path.join(state.root, workflows[0]), "steps:\n  - uses: actions/setup-node@v4\n    with:\n      node-version: 20.19.x\n");
    assert.equal(evaluate(state).status, "FAIL");
    assert.equal(evaluate(state, { esbuildResolvedPath: path.join(state.container, "outside/esbuild/lib/main.js") }).acceptanceSignals.NO_SIBLING_NODE_MODULES_OR_ESBUILD, "FAIL");
  } finally {
    rmSync(state.container, { recursive: true });
  }
});

test("hermetic build evidence rejects every sibling module input", () => {
  const state = fixture();
  try {
    const positive = evaluateBuildMetafiles(state.root, [{ inputs: { "node_modules/esbuild/lib/main.js": {}, "src/renderer/editor.js": {} } }]);
    const negative = evaluateBuildMetafiles(state.root, [{ inputs: { "../sibling/node_modules/esbuild/lib/main.js": {} } }]);
    assert.equal(positive.status, "PASS");
    assert.equal(negative.status, "FAIL");
    assert.equal(evaluate(state, { buildEvidence: negative }).acceptanceSignals.BUILD_HERMETIC_PASS, "FAIL");
    assert.equal(evaluate(state, { buildEvidence: negative }).acceptanceSignals.NO_SIBLING_NODE_MODULES_OR_ESBUILD, "FAIL");
  } finally {
    rmSync(state.container, { recursive: true });
  }
});

test("audit policy permits only the unchanged high ceiling and zero critical", () => {
  const contract = { auditPolicy: { baselineObservation: { critical: 0, high: 2 } } };
  assert.equal(evaluateAudit({ metadata: { vulnerabilities: { critical: 0, high: 2 } } }, contract).status, "PASS");
  assert.equal(evaluateAudit({ metadata: { vulnerabilities: { critical: 0, high: 3 } } }, contract).status, "FAIL");
  assert.equal(evaluateAudit({ metadata: { vulnerabilities: { critical: 1, high: 2 } } }, contract).status, "FAIL");
});
