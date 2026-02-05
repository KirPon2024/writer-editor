import { spawnSync } from "node:child_process";

function runNodeScript(scriptPath, extraEnv) {
  const env = { ...process.env, ...(extraEnv ?? {}) };
  const result = spawnSync(process.execPath, [scriptPath], {
    env,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });

  const stdout = typeof result.stdout === "string" ? result.stdout : "";
  const stderr = typeof result.stderr === "string" ? result.stderr : "";
  const exitCode = typeof result.status === "number" ? result.status : 1;

  return { exitCode, stdout, stderr };
}

function parseDoctorStrictTokens(stdout) {
  const class01 = stdout.match(/^STRICT_LIE_CLASS_01_VIOLATIONS_COUNT=(\d+)$/m);
  const class02 = stdout.match(/^STRICT_LIE_CLASS_02_VIOLATIONS_COUNT=(\d+)$/m);
  const ok = stdout.match(/^STRICT_LIE_CLASSES_OK=(0|1)$/m);

  if (!class01 || !class02 || !ok) {
    return { class01Count: 0, class02Count: 0, strictOk: "0", tokensPresent: 0 };
  }

  return {
    class01Count: Number(class01[1]),
    class02Count: Number(class02[1]),
    strictOk: ok[1],
    tokensPresent: 1,
  };
}

const boundary = runNodeScript("scripts/guards/ops-mvp-boundary.mjs", null);
const strictDoctor = runNodeScript("scripts/doctor.mjs", {
  CHECKS_BASELINE_VERSION: "v1.3",
  EFFECTIVE_MODE: "STRICT",
});

const parsed = parseDoctorStrictTokens(strictDoctor.stdout);

const stopOk =
  boundary.exitCode === 0 &&
  strictDoctor.exitCode === 0 &&
  parsed.tokensPresent === 1 &&
  parsed.strictOk === "1" &&
  parsed.class01Count === 0 &&
  parsed.class02Count === 0;

const outLines = [
  "CURRENT_WAVE_GUARD_RAN=1",
  `BOUNDARY_GUARD_EXIT=${boundary.exitCode}`,
  `STRICT_DOCTOR_EXIT=${strictDoctor.exitCode}`,
  `STRICT_LIE_CLASS_01_VIOLATIONS_COUNT=${parsed.class01Count}`,
  `STRICT_LIE_CLASS_02_VIOLATIONS_COUNT=${parsed.class02Count}`,
  `STRICT_LIE_CLASSES_OK=${parsed.tokensPresent === 1 ? parsed.strictOk : "0"}`,
  `CURRENT_WAVE_STOP_CONDITION_OK=${stopOk ? 1 : 0}`,
];

process.stdout.write(outLines.join("\n") + "\n");
process.exit(stopOk ? 0 : 1);
