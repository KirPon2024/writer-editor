function normalizeLineEndings(value) {
  return String(value ?? '').replaceAll('\r\n', '\n').replaceAll('\r', '\n');
}

function escapeTitle(title) {
  return String(title ?? '').replaceAll('\n', ' ').trim();
}

function normalizeSceneCount(sceneCount) {
  if (!Number.isInteger(sceneCount) || sceneCount < 0) return 0;
  return sceneCount;
}

export function sceneMarker(index, title) {
  return `---[ SCENE ${index}: ${escapeTitle(title) || 'Untitled'} ]---`;
}

export function composeFlowDocument(scenes = []) {
  const normalizedScenes = Array.isArray(scenes) ? scenes : [];
  const lines = [];
  for (let i = 0; i < normalizedScenes.length; i += 1) {
    const scene = normalizedScenes[i] && typeof normalizedScenes[i] === 'object' ? normalizedScenes[i] : {};
    lines.push(sceneMarker(i + 1, scene.title));
    lines.push(normalizeLineEndings(scene.content || '').trimEnd());
    if (i < normalizedScenes.length - 1) lines.push('');
  }
  return `${lines.join('\n').trimEnd()}\n`;
}

export function buildFlowModeStatus(kind, sceneCount) {
  const count = normalizeSceneCount(sceneCount);
  const label = kind === 'save' ? 'saved' : 'opened';
  return `Flow mode ${label} (${count}) · Shift+S save · ArrowUp/ArrowDown jump scenes`;
}

export function buildFlowModeKickoffStatus(kind, sceneCount, options = {}) {
  const base = buildFlowModeStatus(kind, sceneCount);
  if (!options || options.m8Kickoff !== true) return base;
  return `${base} · M8 kickoff`;
}

export function buildFlowModeCoreStatus(sceneCount, options = {}) {
  const count = normalizeSceneCount(sceneCount);
  const dirty = options && options.dirty === true;
  return dirty
    ? `Flow mode core (${count}) · unsaved changes · Shift+S save`
    : `Flow mode core (${count}) · synced`;
}

export function buildFlowModeReopenBlockedStatus(sceneCount) {
  const count = normalizeSceneCount(sceneCount);
  return `Flow mode core (${count}) · unsaved changes blocked reopen · Shift+S save`;
}

export function buildFlowModeM9KickoffStatus(kind, sceneCount, options = {}) {
  const base = buildFlowModeKickoffStatus(kind, sceneCount, options);
  if (!options || options.m9Kickoff !== true) return base;
  return `${base} · M9 kickoff`;
}

function parseSceneMarker(line) {
  const match = /^---\[ SCENE (\d+): .* \]---$/.exec(String(line || '').trim());
  if (!match) return null;
  const index = Number.parseInt(match[1], 10);
  if (!Number.isInteger(index) || index <= 0) return null;
  return { index };
}

function splitFlowScenes(flowText, expectedCount) {
  const text = normalizeLineEndings(flowText);
  const lines = text.split('\n');
  const markers = [];
  for (let i = 0; i < lines.length; i += 1) {
    const parsed = parseSceneMarker(lines[i]);
    if (parsed) markers.push({ markerIndex: parsed.index, line: i });
  }

  if (markers.length !== expectedCount) {
    return {
      ok: false,
      code: 'M7_FLOW_MARKER_COUNT_MISMATCH',
      reason: 'flow_marker_count_mismatch',
      details: { expectedCount, foundCount: markers.length },
    };
  }

  const scenes = [];
  for (let i = 0; i < markers.length; i += 1) {
    if (markers[i].markerIndex !== i + 1) {
      return {
        ok: false,
        code: 'M7_FLOW_MARKER_SEQUENCE_INVALID',
        reason: 'flow_marker_sequence_invalid',
        details: { expected: i + 1, found: markers[i].markerIndex },
      };
    }
    const contentStart = markers[i].line + 1;
    const contentEnd = i + 1 < markers.length ? markers[i + 1].line : lines.length;
    const content = lines.slice(contentStart, contentEnd).join('\n').replace(/\n+$/u, '');
    scenes.push(content);
  }

  return { ok: true, scenes };
}

export function buildFlowSavePayload(flowText, sceneRefs = []) {
  const refs = Array.isArray(sceneRefs) ? sceneRefs : [];
  const split = splitFlowScenes(flowText, refs.length);
  if (!split.ok) {
    return { ok: false, error: { code: split.code, reason: split.reason, details: split.details } };
  }

  const scenes = refs.map((ref, idx) => ({
    path: String(ref && ref.path ? ref.path : ''),
    title: String(ref && ref.title ? ref.title : ''),
    kind: String(ref && ref.kind ? ref.kind : 'scene'),
    content: split.scenes[idx],
  }));

  if (scenes.some((scene) => scene.path.length === 0)) {
    return {
      ok: false,
      error: {
        code: 'M7_FLOW_SCENE_PATH_MISSING',
        reason: 'flow_scene_path_missing',
      },
    };
  }

  return { ok: true, scenes };
}

function sceneContentRanges(flowText) {
  const text = normalizeLineEndings(flowText);
  const markerRegex = /^---\[ SCENE (\d+): .* \]---$/gmu;
  const markers = [];
  let match = markerRegex.exec(text);
  while (match) {
    markers.push({
      markerOffset: match.index,
      markerLength: match[0].length,
    });
    match = markerRegex.exec(text);
  }
  if (!markers.length) return [];

  const ranges = [];
  for (let i = 0; i < markers.length; i += 1) {
    const markerEnd = markers[i].markerOffset + markers[i].markerLength;
    let start = markerEnd;
    if (text[start] === '\n') start += 1;
    const end = i + 1 < markers.length ? Math.max(start, markers[i + 1].markerOffset - 1) : text.length;
    ranges.push({ start, end });
  }
  return ranges;
}

export function nextSceneCaretAtBoundary(flowText, caret) {
  const ranges = sceneContentRanges(flowText);
  if (!ranges.length) return null;
  for (let i = 0; i < ranges.length - 1; i += 1) {
    if (caret >= ranges[i].end) {
      return ranges[i + 1].start;
    }
  }
  return null;
}

export function previousSceneCaretAtBoundary(flowText, caret) {
  const ranges = sceneContentRanges(flowText);
  if (!ranges.length) return null;
  for (let i = 1; i < ranges.length; i += 1) {
    if (caret <= ranges[i].start) {
      return ranges[i - 1].end;
    }
  }
  return null;
}
