#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

const SEMGREP_CONFIGS = ["p/javascript", "p/nodejs"];

function discoverSemgrep() {
  const candidates = [];
  if (process.env.SEMGREP_BIN) {
    candidates.push(process.env.SEMGREP_BIN);
  }

  const pathProbe = spawnSync("bash", ["-lc", "command -v semgrep"], {
    encoding: "utf8",
  });
  if (pathProbe.status === 0 && pathProbe.stdout.trim()) {
    candidates.push(pathProbe.stdout.trim());
  }

  if (process.env.HOME) {
    const userLocal = join(process.env.HOME, "Library", "Python", "3.9", "bin", "semgrep");
    if (existsSync(userLocal)) {
      candidates.push(userLocal);
    }
  }

  const deduped = [...new Set(candidates.filter(Boolean))];
  for (const candidate of deduped) {
    const check = spawnSemgrep(candidate, ["--version"]);
    if (check.status === 0) {
      return candidate;
    }
  }
  return null;
}

function spawnSemgrep(bin, args) {
  const hasPathPart = bin.includes("/");
  const env = { ...process.env };
  if (hasPathPart) {
    const parts = bin.split("/");
    parts.pop();
    const binDir = parts.join("/") || "/";
    env.PATH = env.PATH ? `${binDir}:${env.PATH}` : binDir;
  }
  return spawnSync(bin, args, { encoding: "utf8", env });
}

function run() {
  const semgrepBin = discoverSemgrep();
  if (!semgrepBin) {
    console.error("GENERIC_SAST_STATUS: STOP");
    console.error("GENERIC_SAST_REASON: semgrep_not_discovered");
    process.exit(2);
  }

  const args = [];
  for (const config of SEMGREP_CONFIGS) {
    args.push("--config", config);
  }
  args.push("--timeout", "30", "--timeout-threshold", "0");
  args.push("--json", ".");

  const scan = spawnSemgrep(semgrepBin, args);
  if (scan.error) {
    console.error("GENERIC_SAST_STATUS: STOP");
    console.error(`GENERIC_SAST_REASON: semgrep_spawn_error_${scan.error.message}`);
    process.exit(2);
  }

  const stdout = scan.stdout || "";
  let report;
  try {
    report = JSON.parse(stdout);
  } catch {
    console.error("GENERIC_SAST_STATUS: STOP");
    console.error("GENERIC_SAST_REASON: semgrep_json_parse_failed");
    if (scan.stderr) {
      process.stderr.write(scan.stderr);
    }
    process.exit(2);
  }

  const findings = (report.results || []).length;
  const errors = report.errors || [];
  const timeouts = errors.filter((entry) => entry.type === "Timeout");
  const nonTimeoutErrors = errors.filter((entry) => entry.type !== "Timeout");

  console.log(`GENERIC_SAST_RUNNER: ${semgrepBin}`);
  console.log(`GENERIC_SAST_CONFIG: ${SEMGREP_CONFIGS.join(",")}`);
  console.log(`GENERIC_SAST_FINDINGS: ${findings}`);
  console.log(`GENERIC_SAST_TIMEOUTS: ${timeouts.length}`);
  console.log(`GENERIC_SAST_NON_TIMEOUT_ERRORS: ${nonTimeoutErrors.length}`);

  if (nonTimeoutErrors.length > 0) {
    console.error("GENERIC_SAST_STATUS: STOP");
    console.error("GENERIC_SAST_REASON: non_timeout_errors_present");
    process.exit(3);
  }

  if (timeouts.length > 0) {
    console.error("GENERIC_SAST_STATUS: STOP");
    console.error("GENERIC_SAST_REASON: timeouts_present");
    process.exit(4);
  }

  if (findings > 0) {
    console.error("GENERIC_SAST_STATUS: STOP");
    console.error("GENERIC_SAST_REASON: findings_present");
    process.exit(1);
  }

  console.log("GENERIC_SAST_STATUS: PASS");
  process.exit(0);
}

run();
