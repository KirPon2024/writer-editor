'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

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
  assert.doesNotMatch(childSource, /simulateAbruptFailureAtSceneIndex|simulateFailureAtSceneIndex/u);
});
