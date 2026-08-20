#!/usr/bin/env node
// R2.4 E0 — environment flag registry. Every process.env flag read under
// scripts/ must be registered with semantics; unregistered, incomplete or
// stale entries fail closed. This is the no-unregistered-bypass law.
import fs from 'node:fs';
import path from 'node:path';
import { readJsonBounded, R24Error } from './canonical-json.mjs';

export const REGISTRY_RELATIVE_PATH = path.join('docs', 'OPS', 'R24', 'ENV_FLAG_REGISTRY_V1.json');

const ENV_READ_RE = /process\.env\.([A-Z][A-Z0-9_]+)|process\.env\[['"]([A-Z][A-Z0-9_]+)['"]\]/g;
const REGISTRY_REQUIRED_FIELDS = Object.freeze(['name', 'flagClass', 'semantics', 'defaultEffect', 'registeredBy']);
const FLAG_CLASSES = new Set(['BYPASS', 'BEHAVIOR', 'CI']);
// Flags whose presence can weaken, skip, reroute or force a validation
// outcome. These require individual semantics; everything else is census.
const BYPASS_NAME_RE = /SKIP|DISABLE|SUPPRESS|OVERRIDE|FORCE_|_FORCE|ALLOW_|DETECT_ONLY|_ENFORCE|_MODE$|^MODE$|_TIER$|(^|_)DEBUG|ADVISORY_PROBE|REQUIRE_EVIDENCE|_APPROVED$|CLEAN_HEAD/;

function listSourceFiles(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
      listSourceFiles(full, out);
    } else if (entry.isFile() && /\.(mjs|cjs|js)$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

export function scanEnvFlags(rootDir) {
  const scriptsDir = path.join(rootDir, 'scripts');
  const files = listSourceFiles(scriptsDir);
  const found = new Map();
  for (const file of files) {
    const text = fs.readFileSync(file, 'utf8');
    for (const match of text.matchAll(ENV_READ_RE)) {
      const name = match[1] || match[2];
      if (!name) continue;
      if (!found.has(name)) found.set(name, []);
      found.get(name).push(path.relative(rootDir, file).split(path.sep).join('/'));
    }
  }
  return found;
}

export function checkEnvFlagRegistry(rootDir) {
  const registryPath = path.join(rootDir, REGISTRY_RELATIVE_PATH);
  const registry = readJsonBounded(registryPath);
  if (registry.schemaVersion !== 'yalken.env-flag-registry.v1') throw new R24Error('E_ENV_FLAG_REGISTRY_SCHEMA');
  if (!Array.isArray(registry.flags) || !Array.isArray(registry.census)) throw new R24Error('E_ENV_FLAG_REGISTRY_SHAPE');
  const failures = [];
  const registered = new Map();
  for (const [index, entry] of registry.flags.entries()) {
    for (const field of REGISTRY_REQUIRED_FIELDS) {
      if (typeof entry?.[field] !== 'string' || entry[field].trim() === '') {
        failures.push(`E_ENV_FLAG_REGISTRY_INCOMPLETE:${index}:${field}`);
      }
    }
    if (entry && typeof entry.name === 'string') {
      if (registered.has(entry.name)) failures.push(`E_ENV_FLAG_REGISTRY_DUPLICATE:${entry.name}`);
      if (entry.flagClass && !FLAG_CLASSES.has(entry.flagClass)) failures.push(`E_ENV_FLAG_CLASS_UNKNOWN:${entry.name}:${entry.flagClass}`);
      registered.set(entry.name, entry);
    }
  }
  const census = new Set();
  for (const name of registry.census) {
    if (typeof name !== 'string' || name.length === 0) {
      failures.push('E_ENV_FLAG_CENSUS_SHAPE');
      continue;
    }
    if (census.has(name)) failures.push(`E_ENV_FLAG_CENSUS_DUPLICATE:${name}`);
    census.add(name);
    if (BYPASS_NAME_RE.test(name)) failures.push(`E_ENV_FLAG_MISCLASSIFIED:${name}`);
  }
  const found = scanEnvFlags(rootDir);
  for (const name of found.keys()) {
    if (BYPASS_NAME_RE.test(name)) {
      if (!registered.has(name)) failures.push(`E_ENV_FLAG_UNREGISTERED:${name}`);
    } else if (!registered.has(name) && !census.has(name)) {
      failures.push(`E_ENV_FLAG_UNREGISTERED:${name}`);
    }
  }
  for (const name of registered.keys()) {
    if (!found.has(name)) failures.push(`E_ENV_FLAG_STALE:${name}`);
  }
  for (const name of census) {
    if (!found.has(name)) failures.push(`E_ENV_FLAG_STALE:${name}`);
  }
  return { ok: failures.length === 0, failures, foundCount: found.size, registeredCount: registered.size, censusCount: census.size };
}

export function main(argv = process.argv.slice(2)) {
  const rootDir = path.resolve(argv[0] || process.cwd());
  const result = checkEnvFlagRegistry(rootDir);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (!result.ok) {
    process.exitCode = 1;
  }
  return result;
}

const invokedAsScript = process.argv[1] && path.resolve(process.argv[1]).endsWith('env-flag-registry.mjs');
if (invokedAsScript) main();
