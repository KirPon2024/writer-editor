import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import {
  AUTHORING_SURFACES_FEATURE_INTEGRATION_MANIFEST_V1,
  AUTHORING_SURFACES_SURFACE_ID,
  buildAuthoringSurfacesProjection,
  countAuthoringSurfaceWords,
  validateAuthoringSurfacesFeatureManifest,
} from '../../src/core/authoring-surfaces-projection-v1.mjs';

const repoRoot = new URL('../..', import.meta.url).pathname;

function readRepoFile(pathname) {
  return readFileSync(join(repoRoot, pathname), 'utf8');
}

test('WP301 builds a pathless authoring surfaces projection bound to existing actions', () => {
  const projection = buildAuthoringSurfacesProjection({
    projectId: 'project-1',
    activeDocumentId: 'scene-42',
    activeDocumentKind: 'chapter-file',
    activeDocumentTitle: '/Volumes/T7-Secure/private/Draft One.md',
    mode: 'write',
    leftTab: 'project',
    rightTab: 'comments',
    flowModeActive: false,
    localDirty: true,
    wordCount: 128,
    toolbarVisibleItemCount: 9,
    notesState: 'ready',
    notesCounts: { inbox: 2, total: 4 },
    searchState: 'ready',
    searchCounts: { returned: 3, total: 12 },
    reviewState: 'ready',
  });

  assert.equal(projection.surfaceId, AUTHORING_SURFACES_SURFACE_ID);
  assert.equal(projection.schemaVersion, 1);
  assert.equal(projection.transient, true);
  assert.equal(projection.evidence.directPersistence, false);
  assert.equal(projection.evidence.runtimeNetwork, false);
  assert.equal(projection.evidence.featureId, 'yalken.writer.authoringSurfaces.v1');
  assert.equal(projection.evidence.slotId, 'workspace.write.editor.authoringSurfaces');
  assert.equal(projection.summary.sheetState, 'dirty');
  assert.equal(projection.summary.wordCount, 128);
  assert.equal(projection.surfaces.length, 5);
  assert.equal(projection.postures.length, 3);
  assert.equal(JSON.stringify(projection).includes('/Volumes/T7-Secure'), false);
  assert.equal(Object.isFrozen(projection), true);
  assert.equal(Object.isFrozen(projection.surfaces[0]), true);

  const surfaceById = new Map(projection.surfaces.map((surface) => [surface.id, surface]));
  assert.equal(surfaceById.get('editorial-sheet')?.action?.action, 'open-current-scene');
  assert.equal(surfaceById.get('toolbar')?.action?.action, 'toggle-configurator');
  assert.equal(surfaceById.get('notes')?.action?.queryId, 'query.projectNotes');
  assert.equal(surfaceById.get('project-search')?.action?.queryId, 'query.projectSearch');
  assert.equal(surfaceById.get('comments-review')?.action?.commandId, 'cmd.project.review.openComments');
});

test('WP301 rejects unsafe ids and unknown command or query authority', () => {
  const projection = buildAuthoringSurfacesProjection({
    projectId: '/Users/local/project',
    activeDocumentId: '../scene',
    activeDocumentTitle: 'Draft',
    extraSurfaces: [
      {
        id: 'unsafe/surface',
        label: 'Bad',
        action: 'open-authoring-search',
        queryId: 'query.projectSearch',
      },
      {
        id: 'safe-extra',
        label: 'Safe',
        action: 'open-authoring-search',
        commandId: 'cmd.project.deleteEverything',
        queryId: 'query.secret',
      },
    ],
  });

  assert.equal(projection.projectId, '');
  assert.equal(projection.activeDocumentId, '');
  assert.equal(projection.surfaces.some((surface) => surface.id === 'unsafe/surface'), false);
  const safeExtra = projection.surfaces.find((surface) => surface.id === 'safe-extra');
  assert.ok(safeExtra);
  assert.equal(safeExtra.action.commandId, '');
  assert.equal(safeExtra.action.queryId, 'query.projectSearch');
  assert.equal(projection.surfaces.find((surface) => surface.id === 'notes')?.enabled, true);
});

test('WP301 manifests bind only canonical command and query authority', () => {
  assert.deepEqual(validateAuthoringSurfacesFeatureManifest(), {
    ok: true,
    code: 'WP301_MANIFEST_VALID',
    featureId: 'yalken.writer.authoringSurfaces.v1',
    surfaceId: AUTHORING_SURFACES_SURFACE_ID,
  });

  const queryMutant = structuredClone(AUTHORING_SURFACES_FEATURE_INTEGRATION_MANIFEST_V1);
  queryMutant.queryIds.push('query.privateStorage');
  assert.equal(validateAuthoringSurfacesFeatureManifest(queryMutant).code, 'E_WP301_MANIFEST_QUERY_BOUNDARY');

  const authorityMutant = structuredClone(AUTHORING_SURFACES_FEATURE_INTEGRATION_MANIFEST_V1);
  authorityMutant.surfaceManifests[0].directProductMutation = true;
  assert.equal(validateAuthoringSurfacesFeatureManifest(authorityMutant).code, 'E_WP301_SURFACE_AUTHORITY');

  const bindingMutant = structuredClone(AUTHORING_SURFACES_FEATURE_INTEGRATION_MANIFEST_V1);
  bindingMutant.surfaceManifests[0].slotId = 'random.dom.container';
  assert.equal(validateAuthoringSurfacesFeatureManifest(bindingMutant).code, 'E_WP301_SURFACE_BINDING');
});

test('WP301 renderer and DOM integration are injection-safe and mounted once', () => {
  const renderer = readRepoFile('src/renderer/authoringSurfacesSurface.mjs');
  const html = readRepoFile('src/renderer/index.html');
  const styles = readRepoFile('src/renderer/styles.css');

  assert.equal(renderer.includes('innerHTML'), false);
  assert.match(renderer, /createElement/u);
  assert.match(renderer, /createTextNode/u);
  assert.match(html, /data-authoring-surfaces/u);
  assert.equal((html.match(/data-authoring-surfaces/gu) || []).length, 1);
  assert.match(html, /aria-label="Поверхности письма"/u);
  assert.match(styles, /\.authoring-surface/u);
  assert.match(styles, /@media \(max-width: 899px\)/u);
});

test('WP301 editor routes authoring surface actions through existing UI dispatcher', () => {
  const editor = readRepoFile('src/renderer/editor.js');
  const bundle = readRepoFile('src/renderer/editor.bundle.js');

  assert.match(editor, /buildAuthoringSurfacesProjection/u);
  assert.match(editor, /renderAuthoringSurfacesSurface/u);
  assert.match(editor, /case 'open-authoring-write':/u);
  assert.match(editor, /case 'open-authoring-notes':/u);
  assert.match(editor, /applyLeftTab\('notes'\)/u);
  assert.match(editor, /case 'open-authoring-search':/u);
  assert.match(editor, /applyLeftTab\('search'\)/u);
  assert.match(editor, /EXTRA_COMMAND_IDS\.INSERT_FLOW_OPEN/u);
  assert.match(editor, /EXTRA_COMMAND_IDS\.REVIEW_OPEN_COMMENTS/u);
  assert.match(bundle, /authoring\.surfaces\.v1/u);
  assert.match(bundle, /yalken\.writer\.authoringSurfaces\.v1/u);
});

test('WP301 word counter handles multiline Unicode authoring text', () => {
  assert.equal(countAuthoringSurfaceWords('  Привет, сцена\nnew line\tслово  '), 5);
  assert.equal(countAuthoringSurfaceWords('Привет 👩🏽‍💻 مرحبا e\u0301'), 4);
  assert.equal(countAuthoringSurfaceWords('   '), 0);

  const editor = readRepoFile('src/renderer/editor.js');
  assert.match(editor, /event\.isComposing/u);
  assert.match(editor, /insertCompositionText/u);
  assert.match(editor, /compositionstart/u);
  assert.match(editor, /compositionend/u);
});

test('WP301 recovery rebuild is deterministic and surface count stays bounded', () => {
  const input = {
    projectId: 'project-recovery',
    activeDocumentId: 'scene-recovery',
    activeDocumentTitle: 'Восстановленная сцена',
    localDirty: true,
    extraSurfaces: Array.from({ length: 1000 }, (_, index) => ({
      id: `extra-${index}`,
      label: `Surface ${index}`,
      action: 'open-authoring-search',
    })),
  };
  const beforeCrash = buildAuthoringSurfacesProjection(input);
  const afterRestart = buildAuthoringSurfacesProjection(structuredClone(input));

  assert.deepEqual(afterRestart, beforeCrash);
  assert.equal(afterRestart.surfaces.length, 8);
  assert.equal(afterRestart.evidence.directPersistence, false);
  assert.equal(afterRestart.evidence.runtimeNetwork, false);
});
