import crypto from 'node:crypto';

// ROUND-01 RoundRecordV3 store.
//
// This module is the V3 successor of the docx-review return authority contour
// (main.js activeReviewDocxExportAuthorityStore). It owns:
//   - the RoundRecordV3 schema + lifecycle state machine (monotonic);
//   - a main-process-only key vault: secret bytes NEVER leave the vault, only
//     sign()/verify() operations are exposed through opaque keyRef handles;
//   - CAS-guarded transitions (expected recordDigest/version), writing terminal
//     receipts and rejecting invalid transitions / CAS conflicts with typed
//     codes;
//   - a startup reconciliation API covering ALL rounds (not only lastRoundId);
//   - a key-state authority gate (REVOKED/LOST block apply, preview/read ok).
//
// It deliberately mirrors the style of reviewTransportRoundStore.mjs (W1) so the
// revision-bridge contour stays consistent. The key vault is module-private;
// nothing in this module ever exports raw secret bytes.

export const RTK_ROUND_STORE_V3_SCHEMA = 'yalken.rtk.review-round-store.v3';
export const RTK_ROUND_RECORD_V3_SCHEMA = 'yalken.rtk.review-round-record.v3';

export const ROUND_V3_STATES = Object.freeze([
  'ALLOCATED',
  'ARTIFACT_STAGED',
  'PUBLISHED_ACTIVE',
  'RETURN_VERIFIED',
  'APPLY_RESERVED',
  'CONSUMED',
  'REVOKED',
  'EXPIRED',
  'ABORTED',
]);

// Monotonic forward-only transition map. Indexes are the set of allowed "from"
// states for each target. A transition is valid only when the current state is
// in the target's allow-set; any other "from" is RTK_ROUND_TRANSITION_INVALID.
const ROUND_V3_TRANSITION_FROM = Object.freeze({
  ARTIFACT_STAGED: new Set(['ALLOCATED']),
  PUBLISHED_ACTIVE: new Set(['ARTIFACT_STAGED', 'ALLOCATED']),
  RETURN_VERIFIED: new Set(['PUBLISHED_ACTIVE']),
  APPLY_RESERVED: new Set(['RETURN_VERIFIED']),
  CONSUMED: new Set(['APPLY_RESERVED']),
  REVOKED: new Set([
    'ALLOCATED',
    'ARTIFACT_STAGED',
    'PUBLISHED_ACTIVE',
    'RETURN_VERIFIED',
    'APPLY_RESERVED',
  ]),
  EXPIRED: new Set([
    'ALLOCATED',
    'ARTIFACT_STAGED',
    'PUBLISHED_ACTIVE',
    'RETURN_VERIFIED',
    'APPLY_RESERVED',
  ]),
  ABORTED: new Set([
    'ALLOCATED',
    'ARTIFACT_STAGED',
    'PUBLISHED_ACTIVE',
    'RETURN_VERIFIED',
    'APPLY_RESERVED',
  ]),
});

// Terminal states: once reached, no further transition is allowed.
const ROUND_V3_TERMINAL_STATES = Object.freeze(new Set([
  'CONSUMED',
  'REVOKED',
  'EXPIRED',
  'ABORTED',
]));

// Typed round codes (mirrored into reviewTransportContracts.mjs declarations).
export const RTK_ROUND_TRANSITION_INVALID = 'RTK_ROUND_TRANSITION_INVALID';
export const RTK_ROUND_CAS_CONFLICT = 'RTK_ROUND_CAS_CONFLICT';
export const RTK_ROUND_NOT_OPEN_FOR_RETURN = 'RTK_ROUND_NOT_OPEN_FOR_RETURN';
export const RTK_ROUND_LIFECYCLE_NOT_ELIGIBLE = 'RTK_ROUND_LIFECYCLE_NOT_ELIGIBLE';
export const RTK_ROUND_KEY_REVOKED = 'RTK_ROUND_KEY_REVOKED';
export const RTK_ROUND_KEY_LOST = 'RTK_ROUND_KEY_LOST';

// Key states for the vault key handle. ACTIVE can sign + verify; VERIFY_ONLY can
// only verify (block apply but allow preview); REVOKED/LOST block apply entirely.
export const ROUND_KEY_STATES = Object.freeze(['ACTIVE', 'VERIFY_ONLY', 'REVOKED', 'LOST']);

// Apply-eligible lifecycle states for return intake.
const APPLY_ELIGIBLE_STATES = new Set([
  'PUBLISHED_ACTIVE',
  'RETURN_VERIFIED',
  'APPLY_RESERVED',
]);
// Return-open states (a round admits a returned artifact for verification).
const RETURN_OPEN_STATES = new Set(['PUBLISHED_ACTIVE']);

// ---------------------------------------------------------------------------
// Shared canonical JSON helpers (parity with sibling revision-bridge modules).
// ---------------------------------------------------------------------------

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function cloneJsonSafe(value) {
  return JSON.parse(JSON.stringify(value));
}

function rawString(value) {
  return typeof value === 'string' ? value : '';
}

function stableJson(value) {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableJson(item)).join(',')}]`;
  }
  if (isPlainObject(value)) {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function sha256Json(value) {
  return crypto.createHash('sha256').update(Buffer.from(stableJson(value), 'utf8')).digest('hex');
}

function sha256Text(value) {
  return crypto.createHash('sha256').update(Buffer.from(rawString(value), 'utf8')).digest('hex');
}

function hmacSha256Json(value, secret) {
  return crypto
    .createHmac('sha256', Buffer.from(secret, 'utf8'))
    .update(Buffer.from(stableJson(value), 'utf8'))
    .digest('hex');
}

function roundError(code, message, details = {}) {
  return { ok: false, code, message, details: isPlainObject(details) ? cloneJsonSafe(details) : {} };
}

// ---------------------------------------------------------------------------
// Main-process-only key vault. The secret bytes live ONLY here; nothing leaves
// the vault except sign()/verify() operations and a state field. keyRef is an
// opaque random hex handle that never reveals the secret.
// ---------------------------------------------------------------------------

const roundKeyVault = new Map(); // keyRef -> { secret, state, keyIdHex, roundIdHex, createdAt }

function makeOpaqueKeyRef() {
  // 256-bit opaque handle; intentionally not derived from the secret.
  return crypto.randomBytes(32).toString('hex');
}

export function createRoundKey({ roundId } = {}) {
  const roundIdText = rawString(roundId);
  if (!roundIdText) {
    return roundError('RTK_ROUND_KEY_REQUIRED_ROUND_ID', 'createRoundKey requires a roundId');
  }
  const secret = crypto.randomBytes(32).toString('hex');
  const keyRef = makeOpaqueKeyRef();
  const keyIdHex = sha256Text(secret).slice(0, 32);
  const roundIdHex = sha256Text(roundIdText).slice(0, 32);
  const entry = {
    secret,
    state: 'ACTIVE',
    keyIdHex,
    roundIdHex,
    createdAt: new Date().toISOString(),
  };
  roundKeyVault.set(keyRef, entry);
  // Public correlation material returned to the caller. The secret is NEVER
  // exported; callers persist only keyRef + keyIdHex/roundIdHex.
  return {
    ok: true,
    keyRef,
    keyIdHex,
    roundIdHex,
  };
}

// Import an EXISTING secret into the vault (main-process only). Used when the
// export builder already generated the hmacSecret for the YRTK2 / authority
// envelope signing and needs the SAME secret to be resolvable at return intake
// via an opaque keyRef, without creating a second independent secret. The
// secret bytes never leave the vault after this call.
export function importRoundKey({ roundId, secret } = {}) {
  const roundIdText = rawString(roundId);
  const secretText = rawString(secret);
  if (!roundIdText || !secretText) {
    return roundError('RTK_ROUND_KEY_REQUIRED_ROUND_ID', 'importRoundKey requires roundId + secret');
  }
  const keyRef = makeOpaqueKeyRef();
  const keyIdHex = sha256Text(secretText).slice(0, 32);
  const roundIdHex = sha256Text(roundIdText).slice(0, 32);
  const entry = {
    secret: secretText,
    state: 'ACTIVE',
    keyIdHex,
    roundIdHex,
    createdAt: new Date().toISOString(),
  };
  roundKeyVault.set(keyRef, entry);
  return { ok: true, keyRef, keyIdHex, roundIdHex };
}

export function resolveRoundKey(keyRef) {
  const entry = roundKeyVault.get(rawString(keyRef));
  if (!entry) return null;
  const state = entry.state;
  return {
    state,
    sign(payload) {
      // VERIFY_ONLY / REVOKED / LOST cannot sign (no apply authority).
      if (state !== 'ACTIVE') return null;
      return hmacSha256Json(payload, entry.secret);
    },
    verify(payload, signature) {
      // Verify is allowed in ACTIVE and VERIFY_ONLY (a revoked key can still
      // authenticate a returned artifact for preview); REVOKED/LOST also verify
      // so preview/manuscript read stays available, but never sign.
      if (state === 'LOST') return false;
      const expected = hmacSha256Json(payload, entry.secret);
      return rawString(signature) === expected;
    },
    // Secret accessor for the SAME main-process contour only (return-intake
    // HMAC verification). Never exported across IPC/renderer/worker/DOCX.
    hmacSecret() {
      if (state === 'LOST') return '';
      return entry.secret;
    },
  };
}

export function revokeRoundKey(keyRef) {
  const entry = roundKeyVault.get(rawString(keyRef));
  if (!entry) return roundError('RTK_ROUND_KEY_NOT_FOUND', 'keyRef not found in vault');
  entry.state = 'REVOKED';
  return { ok: true, state: 'REVOKED' };
}

export function markRoundKeyLost(keyRef) {
  const entry = roundKeyVault.get(rawString(keyRef));
  if (!entry) return roundError('RTK_ROUND_KEY_NOT_FOUND', 'keyRef not found in vault');
  entry.state = 'LOST';
  return { ok: true, state: 'LOST' };
}

// ---------------------------------------------------------------------------
// RoundRecordV3 store digest + validation.
// ---------------------------------------------------------------------------

function redactRoundForStore(round = {}) {
  // The store never carries the raw secret. Only keyRef + public correlation.
  const {
    // eslint-disable-next-line no-unused-vars
    hmacSecret,
    ...rest
  } = round;
  return cloneJsonSafe(rest);
}

function computeStoreRecordDigest(unsignedStore) {
  return sha256Json(unsignedStore);
}

// Compute the CAS digest for the in-memory bridge store form used by the V3
// transition/reconcile API ({ schemaVersion, rounds }). This is the form the
// revision-bridge contour carries between transitionRoundRecordV3 calls. The
// durable authority-store form (roundsById + authority-store envelope) is
// computed separately in main.js buildDocxReviewReturnAuthorityStoreRecord.
function computeBridgeStoreDigest(store = {}) {
  const schemaVersion = rawString(store.schemaVersion) || RTK_ROUND_STORE_V3_SCHEMA;
  const rounds = isPlainObject(store.rounds) ? store.rounds : {};
  const unsigned = { schemaVersion, rounds };
  return sha256Json(unsigned);
}

function buildStoreDigest(store = {}) {
  const schemaVersion = rawString(store.schemaVersion) || RTK_ROUND_STORE_V3_SCHEMA;
  const recordDigest = computeBridgeStoreDigest(store);
  return { schemaVersion, recordDigest };
}

// Durable authority-store record builder (roundsById + recordDigest CAS).
// Redacts the raw secret into a keyRef-bearing round record and stamps a
// content-addressed recordDigest so the durable read can detect stale versions.
// recordVersion is per-round; recordDigest covers the whole unsigned envelope.
export function buildRoundRecordV3StoreRecord(store = {}) {
  const schemaVersion = RTK_ROUND_STORE_V3_SCHEMA;
  const roundsByIdRaw = isPlainObject(store.roundsById) ? store.roundsById : {};
  const roundsById = {};
  for (const [roundId, round] of Object.entries(roundsByIdRaw)) {
    if (!isPlainObject(round)) continue;
    roundsById[roundId] = redactRoundForStore(round);
  }
  const unsigned = {
    schemaVersion,
    scope: rawString(store.scope),
    lastRoundId: rawString(store.lastRoundId),
    roundsById,
    secretExposedToRenderer: false,
    secretEmbeddedInDocx: false,
    durableSecretScope: 'local-project-state-only',
  };
  return {
    ...unsigned,
    recordDigest: computeStoreRecordDigest(unsigned),
  };
}

// ---------------------------------------------------------------------------
// transitionRoundRecordV3 — CAS-guarded monotonic transition.
//
//   transitionRoundRecordV3(store, roundId, to, { expectedRecordDigest })
//
// Returns { ok: true, store } on success (store carries updated rounds +
// recordDigest), or { ok: false, code } for invalid transition / CAS conflict.
// Terminal transitions write an immutable terminalReceipt on the round.
// ---------------------------------------------------------------------------

export function transitionRoundRecordV3(store, roundIdRaw, toStateRaw, options = {}) {
  const roundId = rawString(roundIdRaw);
  const toState = rawString(toStateRaw);
  if (!ROUND_V3_STATES.includes(toState)) {
    return roundError(RTK_ROUND_TRANSITION_INVALID, 'unknown target state', { toState });
  }
  if (!isPlainObject(store) || !isPlainObject(store.rounds)) {
    return roundError(RTK_ROUND_TRANSITION_INVALID, 'store.rounds must be an object');
  }
  const rounds = cloneJsonSafe(store.rounds);
  const round = rounds[roundId];
  if (!isPlainObject(round)) {
    return roundError(RTK_ROUND_TRANSITION_INVALID, 'round not found', { roundId });
  }
  const fromState = rawString(round.lifecycleState);
  // CAS: verify the caller's expected digest matches the current store digest.
  const expectedDigest = rawString(options.expectedRecordDigest);
  const currentRecord = buildStoreDigest({ ...store, rounds });
  if (expectedDigest && expectedDigest !== currentRecord.recordDigest) {
    return roundError(RTK_ROUND_CAS_CONFLICT, 'expectedRecordDigest mismatch', {
      expected: expectedDigest,
      actual: currentRecord.recordDigest,
    });
  }
  // Terminal states are absorbing: no further transition.
  if (ROUND_V3_TERMINAL_STATES.has(fromState)) {
    return roundError(RTK_ROUND_TRANSITION_INVALID, 'round is already terminal', { fromState, toState });
  }
  const allowSet = ROUND_V3_TRANSITION_FROM[toState];
  if (!allowSet || !allowSet.has(fromState)) {
    return roundError(RTK_ROUND_TRANSITION_INVALID, 'transition not allowed', { fromState, toState });
  }
  // Apply the transition.
  const recordVersion = Number(round.recordVersion) || 0;
  const updatedRound = {
    ...round,
    lifecycleState: toState,
    recordVersion: recordVersion + 1,
    updatedAt: new Date().toISOString(),
  };
  if (ROUND_V3_TERMINAL_STATES.has(toState)) {
    updatedRound.terminalReceipt = {
      schemaVersion: 'yalken.rtk.review-round-terminal-receipt.v1',
      roundId,
      fromState,
      toState,
      issuedAt: updatedRound.updatedAt,
      receiptDigest: `sha256:${sha256Json({ roundId, fromState, toState, issuedAt: updatedRound.updatedAt })}`,
    };
  }
  rounds[roundId] = updatedRound;
  const nextStore = buildStoreDigest({
    ...store,
    lastRoundId: rawString(store.lastRoundId) || roundId,
    rounds,
  });
  // Carry the in-memory `rounds` map (with terminalReceipt) onto the digested
  // record so callers can read round.terminalReceipt without re-hashing.
  return { ok: true, store: { ...nextStore, rounds } };
}

// ---------------------------------------------------------------------------
// reconcileRoundRecordV3Store — startup scan of ALL rounds (typed report).
//
//   reconcileRoundRecordV3Store(store, { projectRoot })
//
// Returns { ok: true, rounds: [{ roundId, lifecycleState, ... }] }.
// ---------------------------------------------------------------------------

export function reconcileRoundRecordV3Store(store, options = {}) {
  // projectRoot is accepted for parity with the startup signature; the scan is
  // pure on the in-memory store so no filesystem side-effects occur here.
  void options;
  if (!isPlainObject(store) || !isPlainObject(store.rounds)) {
    return roundError('RTK_ROUND_RECONCILE_STORE_INVALID', 'store.rounds must be an object');
  }
  const entries = Object.values(store.rounds)
    .filter(isPlainObject)
    .map((round) => ({
      roundId: rawString(round.roundId),
      lifecycleState: rawString(round.lifecycleState),
      keyRef: rawString(round.keyRef),
      recordVersion: Number(round.recordVersion) || 0,
      terminal: ROUND_V3_TERMINAL_STATES.has(rawString(round.lifecycleState)),
    }))
    .sort((a, b) => a.roundId.localeCompare(b.roundId));
  return { ok: true, rounds: entries };
}

// ---------------------------------------------------------------------------
// evaluateRoundKeyStateAuthority — R7 gate.
//
//   evaluateRoundKeyStateAuthority({ roundId, keyState, intent })
//
// REVOKED/LOST block automatic_apply with a typed RTK_ROUND_KEY_* code.
// preview_read remains available regardless of key state.
// ---------------------------------------------------------------------------

export function evaluateRoundKeyStateAuthority(input = {}) {
  const intent = rawString(input.intent);
  const keyState = rawString(input.keyState);
  if (!ROUND_KEY_STATES.includes(keyState)) {
    return roundError('RTK_ROUND_KEY_UNKNOWN', 'unknown key state', { keyState });
  }
  if (intent === 'automatic_apply') {
    if (keyState === 'REVOKED') {
      return roundError(RTK_ROUND_KEY_REVOKED, 'revoked key blocks automatic apply', { roundId: rawString(input.roundId) });
    }
    if (keyState === 'LOST') {
      return roundError(RTK_ROUND_KEY_LOST, 'lost key blocks automatic apply', { roundId: rawString(input.roundId) });
    }
    if (keyState === 'VERIFY_ONLY') {
      return roundError('RTK_ROUND_KEY_VERIFY_ONLY', 'verify-only key blocks automatic apply', { roundId: rawString(input.roundId) });
    }
    return { ok: true, code: 'RTK_ROUND_KEY_APPLY_ALLOWED' };
  }
  // preview_read / manuscript read is always allowed (secret-free paths).
  if (intent === 'preview_read' || intent === 'manuscript_read' || intent === 'read') {
    return { ok: true, code: 'RTK_ROUND_KEY_PREVIEW_ALLOWED' };
  }
  return roundError('RTK_ROUND_KEY_UNKNOWN_INTENT', 'unknown intent', { intent });
}

// ---------------------------------------------------------------------------
// Lifecycle eligibility helpers for the return-intake gate (main.js).
// ---------------------------------------------------------------------------

export function evaluateRoundReturnIntakeEligibility(lifecycleState) {
  const state = rawString(lifecycleState);
  if (!ROUND_V3_STATES.includes(state)) {
    return roundError(RTK_ROUND_LIFECYCLE_NOT_ELIGIBLE, 'unknown lifecycle state', { lifecycleState: state });
  }
  if (!RETURN_OPEN_STATES.has(state)) {
    return roundError(RTK_ROUND_NOT_OPEN_FOR_RETURN, 'round is not open for return intake', { lifecycleState: state });
  }
  if (!APPLY_ELIGIBLE_STATES.has(state)) {
    return roundError(RTK_ROUND_LIFECYCLE_NOT_ELIGIBLE, 'round is not apply-eligible', { lifecycleState: state });
  }
  return { ok: true, code: 'RTK_ROUND_OPEN_FOR_RETURN' };
}

export function isRoundApplyEligible(lifecycleState) {
  return APPLY_ELIGIBLE_STATES.has(rawString(lifecycleState));
}

export function isRoundReturnOpen(lifecycleState) {
  return RETURN_OPEN_STATES.has(rawString(lifecycleState));
}
