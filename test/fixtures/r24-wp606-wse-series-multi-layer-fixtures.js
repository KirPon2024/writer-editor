const crypto = require('node:crypto');

const sha = (value) => crypto.createHash('sha256').update(String(value)).digest('hex');
const WP606_PROJECT_ID = 'project-wp606-fixture';
const WP606_SERIES_ID = 'series:project-wp606-fixture';

function bookRef(bookId, projectId, role, currentProject) {
  return {
    schemaVersion: 'derived.atlas.seriesPackageBookRef.v1',
    projectId,
    bookId,
    title: bookId,
    role,
    sourceKind: currentProject ? 'currentProjectCoreState' : 'externalPathlessBookReference',
    currentProject,
    sourceHash: sha(`source:${bookId}`),
    authorTruthHash: sha(`truth:${bookId}`),
    languageTagsHash: sha(`language:${bookId}`),
    evidenceIdentityHash: sha(`evidence:${bookId}`),
    unknownFieldsHash: sha(`unknown:${bookId}`),
    pathless: true,
    containsPrivatePath: false,
    embeddedBookContent: false,
    packageRequiredToOpen: false,
    bookRefId: `series-book:${sha(bookId)}`,
  };
}

function makeWp606Input(overrides = {}) {
  const currentIdentity = {
    projectId: WP606_PROJECT_ID,
    entityId: WP606_SERIES_ID,
    sourceRevision: 'revision-wp606-current',
    generation: 9,
  };
  return {
    currentIdentity,
    expectedIdentity: { ...currentIdentity },
    seriesManifest: {
      schemaVersion: 'derived.atlas.seriesPackageManifest.v1',
      state: 'ready',
      projectId: WP606_PROJECT_ID,
      seriesId: WP606_SERIES_ID,
      title: 'Fixture series',
      bookRefs: [
        bookRef(WP606_PROJECT_ID, WP606_PROJECT_ID, 'current', true),
        bookRef('book-two', 'project-book-two', 'external', false),
      ],
      autonomyProof: { eachBookOpensWithoutSeriesPackage: true },
      authority: { readModelOnly: true },
      privacy: { pathless: true },
      summary: { bookCount: 2 },
      meta: { packageHash: sha('package') },
    },
    identityLinks: {
      'link-ava': {
        id: 'link-ava',
        seriesId: WP606_SERIES_ID,
        localProjectId: WP606_PROJECT_ID,
        localEntityId: 'entity-ava',
        sharedIdentityId: 'series-person-ava',
        externalBookRefIds: ['book-two'],
        aliases: ['Ava'],
        evidenceIdentityHashes: [sha('ava-evidence')],
        expectedEntityHash: sha('ava'),
        source: 'author-confirmed',
        authorConfirmed: true,
        manuscriptMutation: false,
        projectTruthMutation: false,
        silentMerge: false,
        previewHash: sha('preview'),
        appliedByCommandSeq: 4,
        updatedByCommandSeq: 4,
      },
    },
    layers: [
      { layerId: 'atlas-facts', label: 'Continuity facts', state: 'ready', projectionDigest: sha('facts'), recordCount: 11 },
      { layerId: 'atlas-findings', label: 'Continuity findings', state: 'ready', projectionDigest: sha('findings'), recordCount: 3 },
      { layerId: 'wse-state-evidence', label: 'State evidence', state: 'ready', projectionDigest: sha('state'), recordCount: 11 },
      { layerId: 'wse-threads-explanation', label: 'Threads and explanation', state: 'ready', projectionDigest: sha('threads'), recordCount: 7 },
      { layerId: 'wse-revision-time-object', label: 'Revision, time and objects', state: 'emptyOrUnknown', projectionDigest: sha('revision'), recordCount: 11 },
    ],
    rowLimit: 32,
    ...overrides,
  };
}

module.exports = { WP606_PROJECT_ID, WP606_SERIES_ID, makeWp606Input, sha };
