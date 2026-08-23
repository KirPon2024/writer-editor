#!/usr/bin/env node
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readJsonBounded, R24Error } from './canonical-json.mjs';
import { assertValidJson } from './json-schema-lite.mjs';

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));
export const CLAIM_BINDING_SCHEMA_PATH = path.join(MODULE_DIR, 'schemas', 'claim-binding-v1.schema.json');

export function buildClaimBinding(input) {
  const binding = structuredClone(input);
  const schema = readJsonBounded(CLAIM_BINDING_SCHEMA_PATH);
  assertValidJson(binding, schema, 'E_CLAIM_BINDING_SCHEMA');
  const paths = binding.claimBindings.map((entry) => entry.filePath);
  if (new Set(paths).size !== paths.length) throw new R24Error('E_CLAIM_BINDING_DUPLICATE_TARGET');
  if (!Number.isFinite(Date.parse(binding.generatedAtUtc))) throw new R24Error('E_CLAIM_BINDING_CLOCK');
  return binding;
}
