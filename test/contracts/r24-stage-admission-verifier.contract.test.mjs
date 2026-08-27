import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  canonicalBytes,
  verifyStageAdmission
} from "../../scripts/ops/r24/corrective/stage-admission-verifier.mjs";

const parse = (path) => {
  const bytes = readFileSync(path);
  return { bytes, value: JSON.parse(bytes) };
};

const base = () => ({
  instanceFile: parse("docs/OPS/R24/CORRECTIVE/B0_STAGE_INSTANCE_V1.json"),
  registryFile: parse("docs/OPS/R24/CORRECTIVE/STAGE_REGISTRY_V1.json"),
  programFile: parse("docs/OPS/R24/CORRECTIVE/PROGRAM_TEMPLATE_V1_1.json")
});

const verify = ({ instanceFile, registryFile, programFile }) => verifyStageAdmission({
  instanceBytes: instanceFile.bytes,
  instance: instanceFile.value,
  registryBytes: registryFile.bytes,
  registry: registryFile.value,
  programBytes: programFile.bytes,
  program: programFile.value
});

const mutateInstance = (mutation) => {
  const files = base();
  mutation(files.instanceFile.value);
  files.instanceFile.bytes = canonicalBytes(files.instanceFile.value);
  return files;
};

test("admits exact B0 StageInstance subset", () => {
  assert.equal(verify(base()).status, "ADMITTED");
});

test("rejects write scope expansion", () => {
  assert.throws(
    () => verify(mutateInstance((value) => value.writeSet.paths.push("src/main.js"))),
    /E_WRITE_SCOPE_EXPANSION/
  );
});

test("rejects weakened acceptance", () => {
  assert.throws(
    () => verify(mutateInstance((value) => value.acceptanceSignals.pop())),
    /E_ACCEPTANCE_WEAKENED/
  );
});

test("rejects absolute paths", () => {
  assert.throws(
    () => verify(mutateInstance((value) => { value.writeSet.paths[0] = "/tmp/escape"; })),
    /E_PATH_ABSOLUTE/
  );
});

test("rejects wrong program digest", () => {
  assert.throws(
    () => verify(mutateInstance((value) => { value.programTemplateDigest = "0".repeat(64); })),
    /E_PROGRAM_DIGEST_MISMATCH/
  );
});

test("rejects missing global stop", () => {
  assert.throws(
    () => verify(mutateInstance((value) => value.stopConditions.shift())),
    /E_STOP_CONDITION_MISSING/
  );
});
