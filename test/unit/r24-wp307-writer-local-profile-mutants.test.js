const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const MODULE_PATH = path.resolve(__dirname, '..', '..', 'src', 'core', 'writer-local-profile-v1.cjs');

function loadFresh(modulePath) {
  delete require.cache[require.resolve(modulePath)];
  return require(modulePath);
}

test('WP307 independent oracles kill activation and optional-system mutants', (t) => {
  const source = fs.readFileSync(MODULE_PATH, 'utf8');
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'r24-wp307-mutants-'));
  t.after(() => fs.rmSync(tempRoot, { recursive: true, force: true }));

  const mutants = [
    {
      id: 'unpackaged-activation',
      transform: (value) => value.replace(
        "const active = isPackaged === true && normalizedPlatform === 'darwin';",
        "const active = normalizedPlatform === 'darwin';",
      ),
      oracle: (module) => assert.equal(
        module.createWriterLocalProfileProjection({ isPackaged: false, platform: 'darwin' }).active,
        false,
      ),
    },
    {
      id: 'non-mac-activation',
      transform: (value) => value.replace(
        "const active = isPackaged === true && normalizedPlatform === 'darwin';",
        'const active = isPackaged === true;',
      ),
      oracle: (module) => assert.equal(
        module.createWriterLocalProfileProjection({ isPackaged: true, platform: 'win32' }).active,
        false,
      ),
    },
    {
      id: 'optional-command-admitted',
      transform: (value) => value.replace(
        '&& isOptionalWriterLocalCommand(commandId, productCommandRecord);',
        '&& false;',
      ),
      oracle: (module) => {
        const profile = module.createWriterLocalProfileProjection({ isPackaged: true, platform: 'darwin' });
        assert.equal(module.evaluateWriterLocalCommandAccess({
          profile,
          commandId: 'atlas.entity.create',
          productCommandRecord: { id: 'atlas.entity.create', domain: 'atlas' },
        }).allowed, false);
      },
    },
    {
      id: 'optional-query-admitted',
      transform: (value) => value.replace(
        '&& OPTIONAL_QUERY_ID_SET.has(normalizeIdentity(queryId));',
        '&& false;',
      ),
      oracle: (module) => {
        const profile = module.createWriterLocalProfileProjection({ isPackaged: true, platform: 'darwin' });
        assert.equal(module.evaluateWriterLocalQueryAccess({
          profile,
          queryId: 'query.atlasOverview',
        }).allowed, false);
      },
    },
    {
      id: 'review-prefix-admitted',
      transform: (value) => value.replace(
        '    return true;\n  }\n  if (!isPlainObject(productCommandRecord)',
        '    return false;\n  }\n  if (!isPlainObject(productCommandRecord)',
      ),
      oracle: (module) => {
        const profile = module.createWriterLocalProfileProjection({ isPackaged: true, platform: 'darwin' });
        assert.equal(module.evaluateWriterLocalCommandAccess({
          profile,
          commandId: 'cmd.project.review.applyExactTextChange',
        }).allowed, false);
      },
    },
    {
      id: 'history-denied',
      transform: (value) => value.replace(
        "  'query.projectionInspector',\n]);",
        "  'query.projectionInspector',\n  'query.sceneHistory',\n]);",
      ),
      oracle: (module) => {
        const profile = module.createWriterLocalProfileProjection({ isPackaged: true, platform: 'darwin' });
        assert.equal(module.evaluateWriterLocalQueryAccess({
          profile,
          queryId: 'query.sceneHistory',
        }).allowed, true);
      },
    },
  ];

  let killed = 0;
  for (const mutant of mutants) {
    const transformed = mutant.transform(source);
    assert.notEqual(transformed, source, `missing mutation target: ${mutant.id}`);
    const mutantPath = path.join(tempRoot, `${mutant.id}.cjs`);
    fs.writeFileSync(mutantPath, transformed, 'utf8');
    const module = loadFresh(mutantPath);
    try {
      mutant.oracle(module);
    } catch {
      killed += 1;
    }
  }
  assert.equal(killed, mutants.length);
  console.log(`R24_WP307_IMPLEMENTATION_MUTANTS=${killed}/${mutants.length}`);
});
