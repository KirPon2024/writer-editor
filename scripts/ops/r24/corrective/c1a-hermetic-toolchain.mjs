import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, realpathSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";
import { canonicalBytes, canonicalize, sha256 } from "./canonical-json.mjs";

const CONTRACT_PATH = "docs/OPS/R24/CORRECTIVE/C1A_TOOLCHAIN_CONTRACT_V1.json";
const INVENTORY_PATH = "docs/OPS/R24/CORRECTIVE/C1A_DEPENDENCY_INVENTORY_V1.json";
const MAX_JSON_BYTES = 8 * 1024 * 1024;

function fail(code, detail) {
  const error = new Error(`${code}: ${detail}`);
  error.code = code;
  throw error;
}

function assert(condition, code, detail) {
  if (!condition) fail(code, detail);
}

function readBoundedJson(filename, maxBytes = MAX_JSON_BYTES) {
  const stats = statSync(filename);
  assert(stats.isFile() && stats.size <= maxBytes, "E_INPUT_BOUNDS", path.basename(filename));
  const bytes = readFileSync(filename);
  return { bytes, value: JSON.parse(bytes.toString("utf8")) };
}

function packageName(packagePath, record) {
  if (packagePath === "") return record.name ?? ".";
  return packagePath.split("node_modules/").at(-1);
}

export function buildDependencyInventory(lockBytes) {
  const lock = JSON.parse(Buffer.from(lockBytes).toString("utf8"));
  assert(lock.lockfileVersion === 3, "E_LOCKFILE_VERSION", lock.lockfileVersion);
  assert(lock.packages && typeof lock.packages === "object" && !Array.isArray(lock.packages), "E_LOCK_PACKAGES", "missing");
  const entries = Object.entries(lock.packages)
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
    .map(([packagePath, record]) => ({
      name: packageName(packagePath, record),
      packagePath: packagePath || ".",
      recordSha256: sha256(canonicalBytes(record)),
      version: record.version ?? lock.version
    }));
  return {
    entries,
    entryCount: entries.length,
    lockfileSha256: sha256(lockBytes),
    packagesMapDigest: sha256(canonicalBytes(lock.packages)),
    schemaVersion: "YALKEN_R24_C1A_DEPENDENCY_INVENTORY_V1"
  };
}

function isInside(candidate, parent) {
  const relative = path.relative(parent, candidate);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

export function evaluateBuildMetafiles(rootDir, metafiles) {
  const root = path.resolve(rootDir);
  const failures = [];
  let inputCount = 0;
  for (const metafile of metafiles) {
    for (const inputPath of Object.keys(metafile.inputs ?? {})) {
      inputCount += 1;
      const normalized = inputPath.replaceAll("\\", "/");
      const absolute = path.isAbsolute(inputPath) ? path.resolve(inputPath) : path.resolve(root, inputPath);
      const repoRelative = path.relative(root, absolute).replaceAll("\\", "/");
      if (!isInside(absolute, root) || normalized.startsWith("../") || normalized.includes("/../")) {
        failures.push({ code: "E_BUILD_INPUT_OUTSIDE_WORKTREE", capabilityId: path.basename(inputPath) });
      }
      if (repoRelative.includes("node_modules/") && !repoRelative.startsWith("node_modules/")) {
        failures.push({ code: "E_SIBLING_MODULE_RESOLUTION", capabilityId: path.basename(inputPath) });
      }
    }
  }
  return {
    failures,
    inputCount,
    schemaVersion: "YALKEN_R24_C1A_HERMETIC_BUILD_EVIDENCE_V1",
    status: failures.length === 0 && inputCount > 0 ? "PASS" : "FAIL",
    writeMode: "MEMORY_ONLY"
  };
}

async function executeHermeticBuild(rootDir, esbuildResolvedPath) {
  const esbuild = await import(pathToFileURL(esbuildResolvedPath).href);
  const shared = {
    absWorkingDir: rootDir,
    bundle: true,
    logLevel: "silent",
    metafile: true,
    nodePaths: [],
    write: false
  };
  const [renderer, preload] = await Promise.all([
    esbuild.build({
      ...shared,
      entryPoints: ["src/renderer/editor.js"],
      format: "iife",
      minify: true,
      platform: "browser",
      target: ["es2018"]
    }),
    esbuild.build({
      ...shared,
      entryPoints: ["src/preload.js"],
      external: ["electron"],
      format: "cjs",
      minify: false,
      platform: "node",
      target: ["node20"]
    })
  ]);
  return evaluateBuildMetafiles(rootDir, [renderer.metafile, preload.metafile]);
}

function workflowFailures(rootDir, contract) {
  const failures = [];
  for (const relativePath of contract.workflows.workflowPaths) {
    const filename = path.join(rootDir, relativePath);
    if (!existsSync(filename)) {
      failures.push({ code: "E_WORKFLOW_MISSING", capabilityId: path.basename(relativePath) });
      continue;
    }
    const source = readFileSync(filename, "utf8");
    if (!source.includes(`uses: ${contract.workflows.setupNodeAction}`)) {
      failures.push({ code: "E_SETUP_NODE_ACTION", capabilityId: path.basename(relativePath) });
    }
    if (!/node-version-file:\s*["']?\.node-version["']?/u.test(source)) {
      failures.push({ code: "E_NODE_VERSION_FILE", capabilityId: path.basename(relativePath) });
    }
    if (/^\s*node-version:/mu.test(source)) {
      failures.push({ code: "E_NODE_VERSION_RANGE", capabilityId: path.basename(relativePath) });
    }
  }
  return failures;
}

export function evaluateC1A(rootDir, options = {}) {
  const root = realpathSync(rootDir);
  const contract = options.contract ?? readBoundedJson(path.join(root, CONTRACT_PATH)).value;
  const inventoryFile = options.inventoryFile ?? readBoundedJson(path.join(root, INVENTORY_PATH));
  const packageFile = readBoundedJson(path.join(root, "package.json"));
  const lockBytes = readFileSync(path.join(root, "package-lock.json"));
  const packageJson = packageFile.value;
  const lock = JSON.parse(lockBytes.toString("utf8"));
  const expectedInventory = buildDependencyInventory(lockBytes);
  const failures = [];
  const reject = (condition, code, detail) => {
    if (!condition) failures.push({ code, detail });
  };

  reject(readFileSync(path.join(root, contract.runtime.nodeVersionFile), "utf8") === `${contract.runtime.nodeExact}\n`, "E_NODE_VERSION_PIN", contract.runtime.nodeVersionFile);
  reject(packageJson.packageManager === contract.runtime.packageManagerField, "E_PACKAGE_MANAGER_PIN", packageJson.packageManager);
  reject(packageJson.engines?.node === contract.runtime.nodeEnginesRange, "E_NODE_ENGINE", packageJson.engines?.node);
  reject(packageJson.engines?.npm === contract.runtime.npmEnginesRange, "E_NPM_ENGINE", packageJson.engines?.npm);
  reject(options.currentNodeVersion === contract.runtime.nodeExact, "E_NODE_RUNTIME", options.currentNodeVersion);
  reject(options.currentNpmVersion === contract.runtime.npmExact, "E_NPM_RUNTIME", options.currentNpmVersion);
  reject(lock.lockfileVersion === contract.lockfile.lockfileVersion, "E_LOCKFILE_VERSION", lock.lockfileVersion);
  reject(sha256(lockBytes) === contract.lockfile.expectedSha256, "E_LOCKFILE_DIGEST", sha256(lockBytes));
  reject(expectedInventory.entryCount === contract.dependencyInventory.entryCount, "E_INVENTORY_COUNT", expectedInventory.entryCount);
  reject(expectedInventory.packagesMapDigest === contract.dependencyInventory.packagesMapDigest, "E_PACKAGES_MAP_DIGEST", expectedInventory.packagesMapDigest);
  reject(inventoryFile.bytes.equals(canonicalBytes(inventoryFile.value)), "E_INVENTORY_NON_CANONICAL", "dependency-inventory");
  reject(inventoryFile.bytes.equals(canonicalBytes(expectedInventory)), "E_INVENTORY_STALE", sha256(inventoryFile.bytes));
  reject(options.buildEvidence?.status === "PASS", "E_HERMETIC_BUILD", options.buildEvidence?.status ?? "MISSING");
  failures.push(...(options.buildEvidence?.failures ?? []));

  for (const forbiddenPath of contract.lockfile.forbidden) {
    reject(!existsSync(path.join(root, forbiddenPath)), "E_FORBIDDEN_LOCKFILE", path.basename(forbiddenPath));
  }
  failures.push(...workflowFailures(root, contract));

  const parent = path.dirname(root);
  reject(!existsSync(path.join(parent, "node_modules")), "E_PARENT_NODE_MODULES", "WORKTREE_PARENT_NODE_MODULES");
  reject(!existsSync(path.join(parent, "esbuild")), "E_PARENT_ESBUILD", "WORKTREE_PARENT_ESBUILD");
  if (options.requireInstalledResolution !== false) {
    const resolved = options.esbuildResolvedPath;
    reject(typeof resolved === "string" && isInside(realpathSync(resolved), path.join(root, "node_modules")), "E_ESBUILD_RESOLUTION", "OUTSIDE_CURRENT_WORKTREE");
  }

  const status = failures.length === 0 ? "PASS" : "FAIL";
  return {
    acceptanceSignals: {
      BUILD_HERMETIC_PASS: status,
      FULL_DEPENDENCY_INVENTORY: failures.some((entry) => entry.code.includes("INVENTORY") || entry.code.includes("PACKAGES_MAP")) ? "FAIL" : "PASS",
      NODE_20_19_5_PINNED: failures.some((entry) => entry.code.includes("NODE_")) ? "FAIL" : "PASS",
      ONLY_PACKAGE_LOCK_PRESENT: failures.some((entry) => entry.code.includes("LOCKFILE")) ? "FAIL" : "PASS",
      NO_NEW_OR_WORSE_HIGH_VULNERABILITY: sha256(lockBytes) === contract.lockfile.baseSha256 ? "PASS" : "FAIL",
      NO_SIBLING_NODE_MODULES_OR_ESBUILD: failures.some((entry) => entry.code.includes("PARENT_") || entry.code.includes("SIBLING_") || entry.code.includes("BUILD_INPUT_OUTSIDE") || entry.code === "E_ESBUILD_RESOLUTION") ? "FAIL" : "PASS",
      APPROVED_NPM_10_PINNED: failures.some((entry) => entry.code.includes("NPM_") || entry.code === "E_PACKAGE_MANAGER_PIN") ? "FAIL" : "PASS"
    },
    dependencyInventoryDigest: sha256(inventoryFile.bytes),
    failures,
    hermeticBuild: options.buildEvidence,
    lockfileSha256: sha256(lockBytes),
    runtime: { node: options.currentNodeVersion, npm: options.currentNpmVersion },
    schemaVersion: "YALKEN_R24_C1A_HERMETIC_CHECK_V1",
    status
  };
}

export function evaluateAudit(audit, contract) {
  const counts = audit?.metadata?.vulnerabilities;
  assert(counts && Number.isInteger(counts.high) && Number.isInteger(counts.critical), "E_AUDIT_SCHEMA", "metadata.vulnerabilities");
  const baseline = contract.auditPolicy.baselineObservation;
  const failures = [];
  if (counts.critical > baseline.critical) failures.push({ code: "E_AUDIT_CRITICAL_WORSE", observed: counts.critical, ceiling: baseline.critical });
  if (counts.high > baseline.high) failures.push({ code: "E_AUDIT_HIGH_WORSE", observed: counts.high, ceiling: baseline.high });
  return {
    baseline: { critical: baseline.critical, high: baseline.high },
    decision: failures.length === 0 ? "NO_NEW_OR_WORSE_HIGH_VULNERABILITY" : "AUDIT_CEILING_EXCEEDED",
    failures,
    observed: { critical: counts.critical, high: counts.high },
    schemaVersion: "YALKEN_R24_C1A_AUDIT_CHECK_V1",
    status: failures.length === 0 ? "PASS" : "FAIL"
  };
}

function npmVersion() {
  return execFileSync("npm", ["--version"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

function runExactChild(argv) {
  execFileSync("npm", ["exec", "--yes", "--package=node@20.19.5", "--package=npm@10.8.2", "--", "node", process.argv[1], ...argv, "--exact-child"], {
    cwd: process.cwd(),
    env: process.env,
    stdio: "inherit"
  });
}

function parseCli(argv) {
  const args = [...argv];
  const exactIndex = args.indexOf("--exact-child");
  const exactChild = exactIndex !== -1;
  if (exactChild) args.splice(exactIndex, 1);
  return { args, exactChild };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    const { args, exactChild } = parseCli(process.argv.slice(2));
    if (args[0] === "--print-inventory") {
      const lockPath = args[1] ?? "package-lock.json";
      assert(lockPath === "package-lock.json", "E_PATH_NOT_ADMITTED", path.basename(lockPath));
      process.stdout.write(canonicalBytes(buildDependencyInventory(readFileSync(lockPath))));
    } else if (args[0] === "--check-audit") {
      assert(args[2] === CONTRACT_PATH, "E_PATH_NOT_ADMITTED", path.basename(args[2] ?? ""));
      const audit = readBoundedJson(args[1], 2 * 1024 * 1024).value;
      const contract = readBoundedJson(args[2]).value;
      const result = evaluateAudit(audit, contract);
      process.stdout.write(canonicalBytes(result));
      if (result.status !== "PASS") process.exitCode = 1;
    } else if (args[0] === "--check") {
      assert(args[1] === CONTRACT_PATH && args[2] === INVENTORY_PATH, "E_PATH_NOT_ADMITTED", "contract-or-inventory");
      const currentNodeVersion = process.version.replace(/^v/u, "");
      const currentNpmVersion = npmVersion();
      if (!exactChild && (currentNodeVersion !== "20.19.5" || currentNpmVersion !== "10.8.2")) {
        runExactChild(args);
      } else {
        let esbuildResolvedPath = "";
        try {
          const require = createRequire(path.join(process.cwd(), "package.json"));
          esbuildResolvedPath = require.resolve("esbuild", { paths: [process.cwd()] });
        } catch {
          fail("E_ESBUILD_UNAVAILABLE", "CURRENT_WORKTREE_NODE_MODULES");
        }
        const buildEvidence = await executeHermeticBuild(process.cwd(), esbuildResolvedPath);
        const result = evaluateC1A(process.cwd(), { buildEvidence, currentNodeVersion, currentNpmVersion, esbuildResolvedPath });
        process.stdout.write(canonicalBytes(result));
        if (result.status !== "PASS") process.exitCode = 1;
      }
    } else {
      fail("E_USAGE", "--print-inventory | --check | --check-audit");
    }
  } catch (error) {
    process.stderr.write(`${canonicalize({ code: error.code ?? "E_UNTYPED", message: error.message })}\n`);
    process.exitCode = 1;
  }
}
