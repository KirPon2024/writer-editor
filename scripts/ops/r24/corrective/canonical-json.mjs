import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

export function canonicalize(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalize(value[key])}`).join(",")}}`;
}

export function canonicalBytes(value) {
  return Buffer.from(`${canonicalize(value)}\n`, "utf8");
}

export function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

export function readCanonicalJson(filename) {
  const bytes = readFileSync(filename);
  const value = JSON.parse(bytes.toString("utf8"));
  if (!bytes.equals(canonicalBytes(value))) {
    const error = new Error(`E_NON_CANONICAL_INPUT: ${filename}`);
    error.code = "E_NON_CANONICAL_INPUT";
    throw error;
  }
  return { bytes, value, digest: sha256(bytes) };
}
