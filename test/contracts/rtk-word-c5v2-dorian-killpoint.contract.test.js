'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync, spawn } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..', '..');

function digest(value) {
  return `sha256:${crypto.createHash('sha256').update(Buffer.from(String(value), 'utf8')).digest('hex')}`;
}

function formattingOperation({ id, sceneId, paragraphOrdinal, selectedText, kind }) {
  return {
    id,
    family: 'formatting',
    round: 4,
    sceneId,
    expectedOutcome: 'SAFE_APPLY',
    anchor: {
      paragraphId: `${id}-paragraph`,
      paragraphOrdinal,
      selectedText,
    },
    semanticIntent: { kind, spanType: 'inline' },
  };
}

test('C5V2 Dorian killpoint input binds distinct real scenes, grapheme-safe ranges and physical artifact identity', async () => {
  const harness = await import(path.join(ROOT, 'scripts', 'ops', 'rtk-word-c5v2-dorian-killpoint.mjs'));
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'yalken-c5v2-dorian-killpoint-input-'));
  const scenes = [
    { file: 'dorian-00-preface.txt', text: 'First real Dorian paragraph carries Alpha anchor.\n\nSecond real Dorian paragraph.' },
    { file: 'dorian-01-chapter-i.txt', text: 'Chapter paragraph carries Beta anchor.\n\nAnother chapter paragraph.' },
  ];
  const sceneIds = ['roman/01_dorian-00-preface.txt', 'roman/02_dorian-01-chapter-i.txt'];
  const masterLedger = {
    sceneProfiles: scenes.map((scene, index) => ({
      sceneId: sceneIds[index],
      sceneOrdinal: index,
      rawSha256: digest(scene.text),
    })),
    operations: [
      formattingOperation({ id: 'format-alpha', sceneId: sceneIds[0], paragraphOrdinal: 0, selectedText: 'Alpha', kind: 'bold' }),
      formattingOperation({ id: 'format-beta', sceneId: sceneIds[1], paragraphOrdinal: 0, selectedText: 'Beta', kind: 'italic' }),
    ],
  };
  const scenePathBySceneId = Object.fromEntries(sceneIds.map((sceneId, index) => [
    sceneId,
    path.join(tempRoot, `${index + 1}.txt`),
  ]));
  const input = harness.buildC5V2DorianKillpointInput({
    masterLedger,
    scenes,
    projectRoot: tempRoot,
    scenePathBySceneId,
    returnArtifactSha256: digest('physical-word-artifact'),
    requestId: 'dorian-killpoint-request',
    maxRound: 4,
    operationSceneCount: 2,
  });

  assert.equal(input.commandPayload.operations.length, 2);
  assert.deepEqual(input.commandPayload.operations.map((operation) => operation.sceneId), sceneIds);
  assert.deepEqual(input.commandPayload.operations.map((operation) => operation.paragraphOrdinal), [0, 0]);
  assert.deepEqual(input.commandPayload.operations.map((operation) => operation.selectedText), ['Alpha', 'Beta']);
  assert.deepEqual(input.commandPayload.operations.map((operation) => operation.inline), [
    { bold: { action: 'set', value: true } },
    { italic: { action: 'set', value: true } },
  ]);
  assert.equal(input.commandPayload.operations.every((operation) => operation.sourceRawSha256.startsWith('sha256:')), true);
  assert.equal(input.startupScope.startupSingleInstanceAuthority, true);
  assert.match(input.inputDigest, /^sha256:[a-f0-9]{64}$/u);
});

test('C5V2 Dorian killpoint harness uses a real SIGKILL boundary and shipped startup recovery', () => {
  const parentSource = fs.readFileSync(path.join(ROOT, 'scripts', 'ops', 'rtk-word-c5v2-dorian-killpoint.mjs'), 'utf8');
  const childSource = fs.readFileSync(path.join(ROOT, 'scripts', 'ops', 'rtk-word-c5v2-dorian-killpoint-child.mjs'), 'utf8');

  assert.match(parentSource, /child\.kill\('SIGKILL'\)/u);
  assert.match(parentSource, /pre-kill-checkpoint\.json/u);
  assert.match(parentSource, /recoveryOutcome === 'rolled-back'/u);
  assert.match(parentSource, /wordRoundOracleDigest/u);
  assert.match(childSource, /createRtkFormattingReturnCommandHandler/u);
  assert.match(childSource, /reconcileFormattingReturnRuntimeAtStartup/u);
  assert.match(childSource, /inspectFormattingReturnRuntimeState/u);
  assert.match(childSource, /setInterval\(\(\) => \{\}, 1000\)/u);
  assert.doesNotMatch(childSource, /simulateAbruptFailureAtSceneIndex|simulateFailureAtSceneIndex/u);
});

test('C5V2 Dorian killpoint child remains alive after first commit until SIGKILL and recovers on a fresh process', async () => {
  const harness = await import(path.join(ROOT, 'scripts', 'ops', 'rtk-word-c5v2-dorian-killpoint.mjs'));
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'yalken-c5v2-dorian-killpoint-child-'));
  const romanRoot = path.join(projectRoot, 'roman');
  fs.mkdirSync(romanRoot);
  const scenes = [
    { file: 'dorian-00-preface.txt', text: 'First real Dorian paragraph carries Alpha anchor.\n\nSecond real Dorian paragraph.' },
    { file: 'dorian-01-chapter-i.txt', text: 'Chapter paragraph carries Beta anchor.\n\nAnother chapter paragraph.' },
  ];
  const sceneIds = ['roman/01_dorian-00-preface.txt', 'roman/02_dorian-01-chapter-i.txt'];
  const scenePathBySceneId = Object.fromEntries(sceneIds.map((sceneId, index) => {
    const scenePath = path.join(projectRoot, sceneId);
    fs.writeFileSync(scenePath, scenes[index].text, 'utf8');
    return [sceneId, scenePath];
  }));
  const masterLedger = {
    sceneProfiles: scenes.map((scene, index) => ({ sceneId: sceneIds[index], sceneOrdinal: index, rawSha256: digest(scene.text) })),
    operations: [
      formattingOperation({ id: 'format-alpha-live', sceneId: sceneIds[0], paragraphOrdinal: 0, selectedText: 'Alpha', kind: 'bold' }),
      formattingOperation({ id: 'format-beta-live', sceneId: sceneIds[1], paragraphOrdinal: 0, selectedText: 'Beta', kind: 'italic' }),
    ],
  };
  const input = harness.buildC5V2DorianKillpointInput({
    masterLedger,
    scenes,
    projectRoot,
    scenePathBySceneId,
    returnArtifactSha256: digest('physical-word-artifact-live'),
    requestId: 'dorian-killpoint-live-request',
    maxRound: 4,
    operationSceneCount: 2,
  });
  const inputPath = path.join(projectRoot, 'input.json');
  fs.writeFileSync(inputPath, JSON.stringify(input), 'utf8');
  const childPath = path.join(ROOT, 'scripts', 'ops', 'rtk-word-c5v2-dorian-killpoint-child.mjs');
  const child = spawn(process.execPath, [childPath, '--mode', 'kill', '--input', inputPath], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  await new Promise((resolve, reject) => {
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => reject(new Error(`killpoint marker timeout: ${stderr}`)), 10_000);
    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString('utf8');
      if (stdout.includes('YALKEN_C5V2_DORIAN_AFTER_FIRST_SCENE ')) {
        clearTimeout(timer);
        resolve();
      }
    });
    child.stderr.on('data', (chunk) => { stderr += chunk.toString('utf8'); });
    child.on('error', reject);
  });
  await new Promise((resolve) => setTimeout(resolve, 100));
  assert.equal(child.exitCode, null);
  assert.equal(child.signalCode, null);
  const close = new Promise((resolve) => child.once('close', (code, signal) => resolve({ code, signal })));
  assert.equal(child.kill('SIGKILL'), true);
  assert.deepEqual(await close, { code: null, signal: 'SIGKILL' });

  const recoveryOutput = execFileSync(process.execPath, [childPath, '--mode', 'recover', '--input', inputPath], {
    encoding: 'utf8',
    timeout: 10_000,
  });
  const recoveryLine = recoveryOutput.split(/\r?\n/u).find((line) => line.startsWith('YALKEN_C5V2_DORIAN_KILLPOINT_RESULT '));
  const recovery = JSON.parse(recoveryLine.slice('YALKEN_C5V2_DORIAN_KILLPOINT_RESULT '.length));
  assert.equal(recovery.result.recoveryOutcome, 'rolled-back');
  assert.equal(recovery.result.staleLeaseRecovered, true);
  assert.equal(fs.readFileSync(scenePathBySceneId[sceneIds[0]], 'utf8'), scenes[0].text);
  assert.equal(fs.readFileSync(scenePathBySceneId[sceneIds[1]], 'utf8'), scenes[1].text);
});
