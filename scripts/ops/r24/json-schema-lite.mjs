#!/usr/bin/env node
// R2.4 E0 — recursive JSON Schema (2020-12 subset) validator.
// Semantics ported one-to-one from the sealed package verifier so that the
// same keyword set and the same rejection behavior apply in the repository.
import { R24Error } from './canonical-json.mjs';

const SUPPORTED_KEYWORDS = new Set([
  '$schema', '$id', '$defs', '$ref', 'type', 'const', 'enum', 'required', 'properties',
  'additionalProperties', 'items', 'minItems', 'maxItems', 'uniqueItems', 'contains',
  'minContains', 'maxContains', 'minLength', 'maxLength', 'pattern', 'minimum', 'maximum',
  'exclusiveMinimum', 'exclusiveMaximum', 'minProperties', 'maxProperties', 'allOf',
  'anyOf', 'oneOf', 'not', 'if', 'then', 'else', 'dependentRequired', 'description', 'title',
]);

export function inspectSchema(schema, at = '#') {
  if (typeof schema === 'boolean') return;
  if (!schema || typeof schema !== 'object' || Array.isArray(schema)) {
    throw new R24Error('E_SCHEMA_NODE_INVALID', at);
  }
  for (const key of Object.keys(schema)) {
    if (!SUPPORTED_KEYWORDS.has(key)) throw new R24Error('E_SCHEMA_KEYWORD_UNSUPPORTED', `${at}/${key}`);
  }
  if (schema.properties) for (const [k, v] of Object.entries(schema.properties)) inspectSchema(v, `${at}/properties/${k}`);
  if (schema.$defs) for (const [k, v] of Object.entries(schema.$defs)) inspectSchema(v, `${at}/$defs/${k}`);
  for (const key of ['items', 'contains', 'not', 'if', 'then', 'else', 'additionalProperties']) {
    if (schema[key] && typeof schema[key] === 'object') inspectSchema(schema[key], `${at}/${key}`);
  }
  for (const key of ['allOf', 'anyOf', 'oneOf']) {
    if (schema[key]) schema[key].forEach((v, i) => inspectSchema(v, `${at}/${key}/${i}`));
  }
}

function resolveRef(schemaRoot, ref) {
  if (typeof ref !== 'string' || !ref.startsWith('#/')) throw new R24Error('E_SCHEMA_REF_EXTERNAL', String(ref));
  return ref.slice(2).split('/').reduce((cur, part) => {
    if (!cur || typeof cur !== 'object') throw new R24Error('E_SCHEMA_REF_BROKEN', ref);
    return cur[part.replaceAll('~1', '/').replaceAll('~0', '~')];
  }, schemaRoot);
}

function jsonEqual(a, b) {
  return canonicalJsonString(a) === canonicalJsonString(b);
}

const canonicalJsonString = (value) => {
  if (Array.isArray(value)) return `[${value.map(canonicalJsonString).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((k) => `${JSON.stringify(k)}:${canonicalJsonString(value[k])}`).join(',')}}`;
  }
  return JSON.stringify(value);
};

function isType(value, type) {
  if (type === 'null') return value === null;
  if (type === 'array') return Array.isArray(value);
  if (type === 'object') return value !== null && typeof value === 'object' && !Array.isArray(value);
  if (type === 'integer') return Number.isInteger(value);
  if (type === 'number') return typeof value === 'number' && Number.isFinite(value);
  return typeof value === type;
}

export function validateJson(value, schema, schemaRoot = schema, at = '$', errors = []) {
  if (typeof schema === 'boolean') {
    if (!schema) errors.push(`${at}: false schema`);
    return errors;
  }
  if (schema.$ref) return validateJson(value, resolveRef(schemaRoot, schema.$ref), schemaRoot, at, errors);
  if (schema.const !== undefined && !jsonEqual(value, schema.const)) errors.push(`${at}: const mismatch`);
  if (schema.enum && !schema.enum.some((x) => jsonEqual(x, value))) errors.push(`${at}: enum mismatch`);
  if (schema.type) {
    const types = Array.isArray(schema.type) ? schema.type : [schema.type];
    if (!types.some((t) => isType(value, t))) {
      errors.push(`${at}: expected ${types.join('|')}`);
      return errors;
    }
  }
  if (schema.allOf) schema.allOf.forEach((s) => validateJson(value, s, schemaRoot, at, errors));
  if (schema.anyOf && !schema.anyOf.some((s) => validateJson(value, s, schemaRoot, at, []).length === 0)) errors.push(`${at}: anyOf failed`);
  if (schema.oneOf && schema.oneOf.filter((s) => validateJson(value, s, schemaRoot, at, []).length === 0).length !== 1) errors.push(`${at}: oneOf failed`);
  if (schema.not && validateJson(value, schema.not, schemaRoot, at, []).length === 0) errors.push(`${at}: not failed`);
  if (schema.if) {
    const branch = validateJson(value, schema.if, schemaRoot, at, []).length === 0 ? schema.then : schema.else;
    if (branch) validateJson(value, branch, schemaRoot, at, errors);
  }
  if (typeof value === 'string') {
    if (schema.minLength !== undefined && value.length < schema.minLength) errors.push(`${at}: minLength`);
    if (schema.maxLength !== undefined && value.length > schema.maxLength) errors.push(`${at}: maxLength`);
    if (schema.pattern !== undefined && !new RegExp(schema.pattern).test(value)) errors.push(`${at}: pattern`);
  }
  if (typeof value === 'number') {
    if (schema.minimum !== undefined && value < schema.minimum) errors.push(`${at}: minimum`);
    if (schema.maximum !== undefined && value > schema.maximum) errors.push(`${at}: maximum`);
    if (schema.exclusiveMinimum !== undefined && value <= schema.exclusiveMinimum) errors.push(`${at}: exclusiveMinimum`);
    if (schema.exclusiveMaximum !== undefined && value >= schema.exclusiveMaximum) errors.push(`${at}: exclusiveMaximum`);
  }
  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) errors.push(`${at}: minItems`);
    if (schema.maxItems !== undefined && value.length > schema.maxItems) errors.push(`${at}: maxItems`);
    if (schema.uniqueItems && new Set(value.map(canonicalJsonString)).size !== value.length) errors.push(`${at}: uniqueItems`);
    if (schema.items) value.forEach((v, i) => validateJson(v, schema.items, schemaRoot, `${at}[${i}]`, errors));
    if (schema.contains) {
      const count = value.filter((v, i) => validateJson(v, schema.contains, schemaRoot, `${at}[${i}]`, []).length === 0).length;
      if (count < (schema.minContains ?? 1)) errors.push(`${at}: minContains`);
      if (schema.maxContains !== undefined && count > schema.maxContains) errors.push(`${at}: maxContains`);
    }
  }
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const keys = Object.keys(value);
    if (schema.minProperties !== undefined && keys.length < schema.minProperties) errors.push(`${at}: minProperties`);
    if (schema.maxProperties !== undefined && keys.length > schema.maxProperties) errors.push(`${at}: maxProperties`);
    for (const key of schema.required || []) if (!(key in value)) errors.push(`${at}: missing ${key}`);
    if (schema.properties) {
      for (const [key, child] of Object.entries(schema.properties)) if (key in value) validateJson(value[key], child, schemaRoot, `${at}.${key}`, errors);
      if (schema.additionalProperties === false) for (const key of keys) if (!(key in schema.properties)) errors.push(`${at}: extra ${key}`);
      else if (schema.additionalProperties && typeof schema.additionalProperties === 'object') {
        for (const key of keys) if (!(key in schema.properties)) validateJson(value[key], schema.additionalProperties, schemaRoot, `${at}.${key}`, errors);
      }
    }
    if (schema.dependentRequired) {
      for (const [key, required] of Object.entries(schema.dependentRequired)) {
        if (key in value) for (const dep of required) if (!(dep in value)) errors.push(`${at}: ${key} requires ${dep}`);
      }
    }
  }
  return errors;
}

export function assertValidJson(value, schema, code = 'E_R24_SCHEMA_INVALID') {
  inspectSchema(schema);
  const errors = validateJson(value, schema);
  if (errors.length > 0) throw new R24Error(code, errors.slice(0, 12).join('; '));
  return value;
}
