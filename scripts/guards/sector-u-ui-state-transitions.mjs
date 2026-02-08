#!/usr/bin/env node
import fs from 'node:fs';

const RULE_ID = 'U4-RULE-001';
const DEFAULT_MODE = 'BLOCKING';
const VALID_MODES = new Set(['DETECT_ONLY', 'BLOCKING', 'DROPPED']);
const DEFAULT_TRANSITIONS_PATH = 'docs/OPS/STATUS/UI_STATE_TRANSITIONS.json';

function parseArgs(argv) {
  const out = {
    mode: '',
    transitionsPath: DEFAULT_TRANSITIONS_PATH,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--mode') {
      out.mode = String(argv[i + 1] || '').toUpperCase();
      i += 1;
      continue;
    }
    if (arg === '--transitions-path') {
      out.transitionsPath = String(argv[i + 1] || DEFAULT_TRANSITIONS_PATH);
      i += 1;
    }
  }
  return out;
}

function readJson(pathname) {
  try {
    const raw = fs.readFileSync(pathname, 'utf8');
    return { ok: true, data: JSON.parse(raw) };
  } catch (error) {
    return { ok: false, error: error && error.message ? error.message : 'JSON_READ_FAILED' };
  }
}

function uniqueSortedStrings(values) {
  return [...new Set(values.filter((v) => typeof v === 'string'))].sort();
}

function evaluateTransitions(doc) {
  const violations = [];
  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) {
    violations.push('TOP_LEVEL_NOT_OBJECT');
    return { transitionsCount: 0, violations };
  }

  if (doc.schemaVersion !== 'ui-state-transitions.v1') {
    violations.push('SCHEMA_VERSION_INVALID');
  }

  const states = Array.isArray(doc.states) ? doc.states : [];
  const events = Array.isArray(doc.events) ? doc.events : [];
  const transitions = Array.isArray(doc.transitions) ? doc.transitions : [];
  const stateSet = new Set(states);
  const eventSet = new Set(events);

  const uniqueStates = uniqueSortedStrings(states);
  if (states.length !== uniqueStates.length) {
    violations.push('STATES_DUPLICATED_OR_INVALID');
  }
  const uniqueEvents = uniqueSortedStrings(events);
  if (events.length !== uniqueEvents.length) {
    violations.push('EVENTS_DUPLICATED_OR_INVALID');
  }

  const seenKeys = new Set();
  let previousSortKey = '';
  for (const transition of transitions) {
    if (!transition || typeof transition !== 'object' || Array.isArray(transition)) {
      violations.push('TRANSITION_ITEM_INVALID');
      continue;
    }
    const from = transition.from;
    const event = transition.event;
    const to = transition.to;
    if (typeof from !== 'string' || typeof event !== 'string' || typeof to !== 'string') {
      violations.push('TRANSITION_FIELDS_INVALID');
      continue;
    }
    if (!stateSet.has(from)) {
      violations.push(`UNKNOWN_FROM_STATE:${from}`);
    }
    if (!eventSet.has(event)) {
      violations.push(`UNKNOWN_EVENT:${event}`);
    }
    if (!stateSet.has(to)) {
      violations.push(`UNKNOWN_TO_STATE:${to}`);
    }
    const key = `${from}::${event}`;
    if (seenKeys.has(key)) {
      violations.push(`DUPLICATE_TRANSITION_KEY:${key}`);
    }
    seenKeys.add(key);

    const sortKey = `${from}::${event}`;
    if (previousSortKey !== '' && sortKey < previousSortKey) {
      violations.push('TRANSITIONS_NOT_SORTED');
    }
    previousSortKey = sortKey;
  }

  return {
    transitionsCount: transitions.length,
    violations: uniqueSortedStrings(violations),
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const mode = VALID_MODES.has(args.mode) ? args.mode : DEFAULT_MODE;

  if (mode === 'DROPPED') {
    console.log(`RULE_ID=${RULE_ID}`);
    console.log(`MODE=${mode}`);
    console.log(`TRANSITIONS_PATH=${args.transitionsPath}`);
    console.log('TRANSITIONS_COUNT=0');
    console.log('VIOLATIONS_COUNT=0');
    process.exit(0);
  }

  const parsed = readJson(args.transitionsPath);
  let transitionsCount = 0;
  let violations = [];
  if (!parsed.ok) {
    violations = [`TRANSITIONS_READ_FAILED:${parsed.error}`];
  } else {
    const evaluated = evaluateTransitions(parsed.data);
    transitionsCount = evaluated.transitionsCount;
    violations = evaluated.violations;
  }

  console.log(`RULE_ID=${RULE_ID}`);
  console.log(`MODE=${mode}`);
  console.log(`TRANSITIONS_PATH=${args.transitionsPath}`);
  console.log(`TRANSITIONS_COUNT=${transitionsCount}`);
  console.log(`VIOLATIONS_COUNT=${violations.length}`);
  for (const violation of violations) {
    console.log(`VIOLATION ${violation}`);
  }

  if (mode === 'BLOCKING' && violations.length > 0) {
    process.exit(2);
  }
  process.exit(0);
}

main();
