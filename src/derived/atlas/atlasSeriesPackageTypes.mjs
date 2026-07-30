export const ATLAS_SERIES_PACKAGE_MANIFEST_SCHEMA_VERSION = 'derived.atlas.seriesPackageManifest.v1';
export const ATLAS_SERIES_PACKAGE_BOOK_REF_SCHEMA_VERSION = 'atlas.seriesPackage.bookRef.v1';
export const ATLAS_SERIES_PACKAGE_AUTONOMY_PROOF_SCHEMA_VERSION = 'atlas.seriesPackage.autonomyProof.v1';

function compareText(a, b) {
  return String(a || '').localeCompare(String(b || ''), 'en', { sensitivity: 'variant' });
}

export function sortAtlasSeriesPackageBookRefs(bookRefs) {
  return [...(Array.isArray(bookRefs) ? bookRefs : [])].sort((a, b) => {
    if (a?.currentProject === true && b?.currentProject !== true) return -1;
    if (a?.currentProject !== true && b?.currentProject === true) return 1;
    const project = compareText(a?.projectId, b?.projectId);
    if (project !== 0) return project;
    const book = compareText(a?.bookId, b?.bookId);
    if (book !== 0) return book;
    return compareText(a?.bookRefId, b?.bookRefId);
  });
}
