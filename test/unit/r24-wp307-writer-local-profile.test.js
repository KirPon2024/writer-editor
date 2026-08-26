const test = require('node:test');
const assert = require('node:assert/strict');

const {
  WRITER_LOCAL_PROFILE_ID,
  WRITER_LOCAL_OPTIONAL_SYSTEM_DISABLED,
  OPTIONAL_PRODUCT_DOMAINS,
  OPTIONAL_QUERY_IDS,
  createWriterLocalProfileProjection,
  isActiveWriterLocalProfile,
  evaluateWriterLocalCommandAccess,
  evaluateWriterLocalQueryAccess,
} = require('../../src/core/writer-local-profile-v1.cjs');

test('WP307 activates WRITER_LOCAL_V1 only for an exact packaged macOS runtime', () => {
  const profile = createWriterLocalProfileProjection({ isPackaged: true, platform: 'darwin' });
  assert.equal(profile.profileId, WRITER_LOCAL_PROFILE_ID);
  assert.equal(profile.active, true);
  assert.equal(profile.optionalSystemsEnabled, false);
  assert.equal(profile.localPackagingAndCertificationOnly, true);
  assert.equal(profile.signing, false);
  assert.equal(profile.notarization, false);
  assert.equal(profile.publicDistribution, false);
  assert.equal(profile.dependencyAdoption, false);
  assert.equal(profile.cloudAuthority, false);
  assert.equal(profile.userDataMutation, false);
  assert.equal(Object.isFrozen(profile), true);
  assert.equal(isActiveWriterLocalProfile(profile), true);

  for (const inactive of [
    createWriterLocalProfileProjection({ isPackaged: false, platform: 'darwin' }),
    createWriterLocalProfileProjection({ isPackaged: true, platform: 'win32' }),
    createWriterLocalProfileProjection({ isPackaged: true, platform: 'linux' }),
  ]) {
    assert.equal(inactive.active, false);
    assert.equal(inactive.profileId, '');
    assert.equal(inactive.optionalSystemsEnabled, true);
    assert.equal(isActiveWriterLocalProfile(inactive), false);
  }
});

test('WP307 denies every optional product domain and Review command at dispatch', () => {
  const profile = createWriterLocalProfileProjection({ isPackaged: true, platform: 'darwin' });
  for (const domain of OPTIONAL_PRODUCT_DOMAINS) {
    const commandId = `fixture.${domain}.command`;
    const decision = evaluateWriterLocalCommandAccess({
      profile,
      commandId,
      productCommandRecord: { id: commandId, domain },
    });
    assert.equal(decision.allowed, false, domain);
    assert.equal(decision.reason, WRITER_LOCAL_OPTIONAL_SYSTEM_DISABLED);
  }
  assert.equal(evaluateWriterLocalCommandAccess({
    profile,
    commandId: 'cmd.project.review.applyExactTextChange',
  }).allowed, false);
  assert.equal(evaluateWriterLocalCommandAccess({
    profile,
    commandId: 'cmd.project.plan.switchMode',
  }).allowed, false);
  assert.equal(evaluateWriterLocalCommandAccess({
    profile,
    commandId: 'cmd.project.save',
  }).allowed, true);
  assert.equal(evaluateWriterLocalCommandAccess({
    profile: createWriterLocalProfileProjection({ isPackaged: false, platform: 'darwin' }),
    commandId: 'cmd.project.review.applyExactTextChange',
  }).allowed, true);
});

test('WP307 denies optional queries while Writer, local history and interchange survive', () => {
  const profile = createWriterLocalProfileProjection({ isPackaged: true, platform: 'darwin' });
  for (const queryId of OPTIONAL_QUERY_IDS) {
    const decision = evaluateWriterLocalQueryAccess({ profile, queryId });
    assert.equal(decision.allowed, false, queryId);
    assert.equal(decision.reason, WRITER_LOCAL_OPTIONAL_SYSTEM_DISABLED);
  }
  for (const queryId of [
    'query.projectTree',
    'query.projectLibrary',
    'query.selectedScenesTxtExportScope',
    'query.metadataInspector',
    'query.projectNotes',
    'query.projectSearch',
    'query.sceneHistory',
  ]) {
    assert.equal(evaluateWriterLocalQueryAccess({ profile, queryId }).allowed, true, queryId);
  }
});

test('WP307 rejects forged profile objects and preserves Unicode/IME authoring as opaque state', () => {
  const forged = {
    schemaVersion: 'writer-local-profile.v1',
    profileId: WRITER_LOCAL_PROFILE_ID,
    active: true,
    packaged: false,
    platform: 'darwin',
    optionalSystemsEnabled: false,
  };
  assert.equal(isActiveWriterLocalProfile(forged), false);
  assert.equal(evaluateWriterLocalQueryAccess({ profile: forged, queryId: 'query.atlasOverview' }).allowed, true);

  const authorText = 'English אבג العربية İß e\u0301 👩🏽‍💻';
  const profile = createWriterLocalProfileProjection({ isPackaged: true, platform: 'darwin' });
  assert.equal(evaluateWriterLocalQueryAccess({ profile, queryId: 'query.sceneHistory' }).allowed, true);
  assert.equal(authorText, 'English אבג العربية İß e\u0301 👩🏽‍💻');
});
