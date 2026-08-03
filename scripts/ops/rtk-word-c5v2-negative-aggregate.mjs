#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  aggregateC5V2NegativeCampaignChunks,
  buildC5V2NegativeProbePlan,
  writeC5V2NegativeAggregateAtomicDurable,
} from './rtk-word-c5v2-negative-forks.mjs';

function parseArgs(argv) {
  const options = {
    masterLedgerPath: '',
    expectedHeadSha: '',
    outputPath: '',
    evidencePaths: [],
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--master-ledger') {
      options.masterLedgerPath = argv[index + 1] || '';
      index += 1;
    } else if (arg === '--head') {
      options.expectedHeadSha = argv[index + 1] || '';
      index += 1;
    } else if (arg === '--output') {
      options.outputPath = argv[index + 1] || '';
      index += 1;
    } else if (arg === '--evidence') {
      options.evidencePaths.push(argv[index + 1] || '');
      index += 1;
    } else {
      throw new Error(`C5V2_NEGATIVE_AGGREGATE_ARGUMENT_UNKNOWN:${arg}`);
    }
  }
  return options;
}

export function runC5V2NegativeAggregateCli(argv) {
  const options = parseArgs(argv);
  if (!options.masterLedgerPath || !options.outputPath) {
    throw new Error('C5V2_NEGATIVE_AGGREGATE_REQUIRED_PATH_MISSING');
  }
  const masterLedgerPath = path.resolve(options.masterLedgerPath);
  if (!fs.existsSync(masterLedgerPath)) {
    throw new Error(`C5V2_NEGATIVE_AGGREGATE_MASTER_LEDGER_MISSING:${masterLedgerPath}`);
  }
  const masterLedger = JSON.parse(fs.readFileSync(masterLedgerPath, 'utf8'));
  const plan = buildC5V2NegativeProbePlan(masterLedger);
  const aggregate = aggregateC5V2NegativeCampaignChunks({
    plan,
    evidencePaths: options.evidencePaths,
    expectedHeadSha: options.expectedHeadSha,
  });
  const written = writeC5V2NegativeAggregateAtomicDurable(options.outputPath, aggregate);
  process.stdout.write(`${JSON.stringify({
    ok: true,
    headSha: aggregate.headSha,
    operationCount: aggregate.operationCount,
    rejectedCount: aggregate.rejectedCount,
    failedCount: aggregate.failedCount,
    aggregateDigest: aggregate.aggregateDigest,
    outputPath: written.path,
    outputSha256: written.sha256,
  }, null, 2)}\n`);
  return { aggregate, written };
}

const isMain = process.argv[1]
  && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  try {
    runC5V2NegativeAggregateCli(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`${error && error.stack ? error.stack : String(error)}\n`);
    process.exitCode = 1;
  }
}
