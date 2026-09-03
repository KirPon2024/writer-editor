#!/usr/bin/env node
import {
  buildContextPacket,
  parseArgs,
  resolveRepoRoot,
} from './agent-guardrails-lib.mjs';
import {restoreContextPacket} from './agent-context-restoration.mjs';

const args = parseArgs(process.argv.slice(2));
try {
  let result = buildContextPacket({
    repoRoot: resolveRepoRoot(),
    objective: args.objective,
  });
  const contextKeys = ['context-request', 'context-request-sha256', 'checkpoint', 'checkpoint-sha256'];
  if (contextKeys.some(key => Object.hasOwn(args, key))) {
    if (!result.ok) throw new Error('E_CONTEXT_REPOSITORY_GUARDRAILS');
    const raw = process.argv.slice(2);
    const optionNames = raw.filter(token => token.startsWith('--')).map(token => token.slice(2).split('=')[0]);
    if (contextKeys.some(key => typeof args[key] !== 'string') || new Set(optionNames).size !== optionNames.length || optionNames.some(key => ![...contextKeys, 'objective', 'json'].includes(key))) throw new Error('E_CONTEXT_ARGUMENTS');
    result = {ok: true, packet: restoreContextPacket({repoRoot: resolveRepoRoot(), objective: args.objective, requestPath: args['context-request'], requestDigest: args['context-request-sha256'], checkpointPath: args.checkpoint, checkpointDigest: args['checkpoint-sha256']})};
  }
  if (args.json === true) {
    process.stdout.write(`${JSON.stringify(result.ok ? result.packet : result, null, 2)}\n`);
  } else if (result.ok) {
    const packet = result.packet;
    process.stdout.write('AGENT_BOOTSTRAP_STATUS=READY_FOR_READ_AND_DECLARATION\n');
    process.stdout.write(`OBJECTIVE=${packet.objective}\n`);
    process.stdout.write(`HEAD_SHA=${packet.headSha}\n`);
    process.stdout.write(`ORIGIN_MAIN_SHA=${packet.originMainSha}\n`);
    process.stdout.write(`BRANCH=${packet.branch}\n`);
    process.stdout.write(`WORKTREE_DIRTY=${packet.worktreeDirty}\n`);
    process.stdout.write(`ACTIVE_CANON=${packet.activeCanon.path}\n`);
    process.stdout.write(`CURRENT_COREX=${packet.currentCorex}\n`);
    process.stdout.write('READING_ORDER_BEGIN\n');
    packet.readingOrder.forEach((item, index) => process.stdout.write(`${index + 1}:${item}\n`));
    process.stdout.write('READING_ORDER_END\n');
    if (packet.contextRestoration) process.stdout.write(`CONTEXT_RESTORATION=${JSON.stringify(packet.contextRestoration)}\n`);
    process.stdout.write(`NEXT_ACTION=${packet.nextAction}\n`);
  } else {
    process.stderr.write('AGENT_BOOTSTRAP_STATUS=STOP\n');
    for (const error of result.errors || []) process.stderr.write(`${error.code}:${error.message}\n`);
  }
  if (!result.ok) process.exitCode = 1;
} catch (error) {
  process.stderr.write(`AGENT_BOOTSTRAP_STATUS=STOP\nE_AGENT_BOOTSTRAP_UNHANDLED:${error.message}\n`);
  process.exitCode = 1;
}
