import { execSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const fail = (code, details) => {
  console.log("SMOKE_A4: FAIL");
  console.log(`REASON: ${code}`);
  if (details) {
    if (Array.isArray(details)) {
      for (const line of details) console.log(line);
    } else {
      console.log(details);
    }
  }
  process.exit(1);
};

const run = (cmd) => execSync(cmd, { encoding: "utf8" });

const stripEnd = (text) => text.replace(/[\s﻿ ]+$/g, "");

const escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

let statusOut = "";
try {
  statusOut = run("git status --porcelain --untracked-files=all");
} catch (err) {
  const out = err && err.stdout ? String(err.stdout) : "";
  const errText = err && err.stderr ? String(err.stderr) : "";
  statusOut = out + (out && errText ? "\n" : "") + errText;
}

const statusClean = stripEnd(statusOut);
if (statusClean !== "") {
  const lines = statusClean.split("\n").filter(Boolean);

  fail("CLEAN_WORKTREE_REQUIRED", lines);
}

try {
  run("node scripts/ops-gate.mjs");
} catch (err) {
  const out = err && err.stdout ? String(err.stdout) : "";
  const errText = err && err.stderr ? String(err.stderr) : "";
  const details = out + (out && errText ? "\n" : "") + errText;

  fail("OPS_GATE_FAILED", details || "ops-gate failed");
}

const dir = "src/contracts";
const idxPath = join(dir, "index.ts");
if (!existsSync(idxPath)) {
  fail("INDEX_MISSING", idxPath);
}
const idxText = readFileSync(idxPath, "utf8");
const files = readdirSync(dir).filter((f) => f.endsWith(".contract.ts")).sort();
if (files.length === 0) {
  fail("NO_CONTRACT_FILES", dir);
}

const missing = [];
for (const file of files) {
  const base = "./" + file.replace(/\.ts$/, "");
  const re = new RegExp("from\\s+[\"'`]" + escapeRegExp(base) + "[\"'`]");
  if (!re.test(idxText)) missing.push(file);
}

if (missing.length) {
  fail("MISSING_REEXPORTS", missing);
}

console.log("SMOKE_A4: PASS");
