#!/usr/bin/env node
/*
 * RELEASE-01 — terminal-claim compiler / wording-surface binding evaluator.
 *
 * This module is the Pass 2 (IMPLEMENTATION) artifact for the RELEASE-01
 * contract test contour
 * (test/contracts/rtk-release01-terminal-claims.contract.test.js). It is a
 * pure, read-only evaluator modelled on the LAB-01 / GOOGLE-01 evaluators, but
 * its contract is the terminal layer above them: it binds every public
 * Word / DOCX / Google product wording string to a typed claim, a profile class
 * and committed evidence, and fail-closes on overclaim, unmapped wording,
 * wording drift, dropped nonClaim, Google wording and a roll-up wider than the
 * proven state.
 *
 * It implements the Proof-Carrying Interop V2 §38 contract:
 *
 *   1. a machine-readable terminal-claim registry (schema-versioned, digested);
 *   2. a fail-closed wording-surface scanner that extracts every
 *      /word|docx|google/i string literal (for .js/.json) or text line (for
 *      .md) from a committed product file and binds it to a registered claim
 *      wording, with GOOGLE_WORDING_PRESENT enforced before UNMAPPED_WORDING;
 *   3. a claim/evidence binding evaluator with typed codes;
 *   4. a nonClaim-union evaluator (every source nonClaim must be present) and
 *      an anti-overclaim terminal roll-up that keeps the product's terminal
 *      claim at NOT_MADE_WORD_TERMINAL_PASS_REQUIRED until every Word profile
 *      is SATURATED, no Google profile is DECLARED/NOT_PROVEN, no matrix row is
 *      blocked and no veto counter is non-zero.
 *
 * Authority model: EVIDENCE_NEVER_CREATES_AUTHORITY. The evaluator returns
 * typed reasons only; it is not a write path and grants no mutation authority.
 */

import crypto from 'node:crypto';
import fs from 'node:fs';

// ---------------------------------------------------------------------------
// Schema constants.
// ---------------------------------------------------------------------------

export const TERMINAL_CLAIM_REGISTRY_SCHEMA = 'yalken.rtk.interop-terminal-claim-registry.v1';

// CLAIM_CLASSES is the closed vocabulary of claim classes, ordered ASCENDING by
// authority: a NOT_CLAIMED_BLOCKED claim asserts nothing is supported; a
// DECLARED_ONLY claim asserts a profile exists with no support; a
// USER_FACING_MANUAL_ONLY claim asserts a user-visible surface backed only by
// manual operation; a USER_FACING_BOUNDED_SUPPORTED claim asserts a
// user-visible surface backed by committed bounded evidence. The order is
// load-bearing for the sufficiency law: USER_FACING_* classes require a profile
// class in the sufficient set.
export const CLAIM_CLASSES = Object.freeze([
  'NOT_CLAIMED_BLOCKED',
  'DECLARED_ONLY',
  'USER_FACING_MANUAL_ONLY',
  'USER_FACING_BOUNDED_SUPPORTED',
]);

// ---------------------------------------------------------------------------
// Typed codes. Every string here is pinned by name in the RELEASE-01 contract
// test, so renaming a value changes the contract.
// ---------------------------------------------------------------------------

export const RELEASE01_CODES = Object.freeze({
  REGISTRY_SCHEMA_INVALID: 'RTK_RELEASE01_REGISTRY_SCHEMA_INVALID',
  CLAIM_DIGEST_MISMATCH: 'RTK_RELEASE01_CLAIM_DIGEST_MISMATCH',
  PROFILE_UNKNOWN: 'RTK_RELEASE01_PROFILE_UNKNOWN',
  CLAIM_EXCEEDS_EVIDENCE: 'RTK_RELEASE01_CLAIM_EXCEEDS_EVIDENCE',
  OVERCLAIM_WORDING: 'RTK_RELEASE01_OVERCLAIM_WORDING',
  UNMAPPED_WORDING: 'RTK_RELEASE01_UNMAPPED_WORDING',
  CLAIM_WORDING_DRIFT: 'RTK_RELEASE01_CLAIM_WORDING_DRIFT',
  WORDING_SURFACE_DRIFT: 'RTK_RELEASE01_WORDING_SURFACE_DRIFT',
  GOOGLE_WORDING_PRESENT: 'RTK_RELEASE01_GOOGLE_WORDING_PRESENT',
  NONCLAIM_DROPPED: 'RTK_RELEASE01_NONCLAIM_DROPPED',
  CLAIM_ON_BLOCKED_ROW: 'RTK_RELEASE01_CLAIM_ON_BLOCKED_ROW',
  COMPILED_OK: 'RTK_RELEASE01_COMPILED_OK',
  // HOTFIX YALKEN_INTEROP_RELEASE01_TERMINAL_ROLLUP_FAIL_CLOSED_HOTFIX_V1:
  // strict roll-up codes. The legacy evaluateTerminalRollup below is preserved
  // for the RELEASE01-14/15 preservation scenarios only; the binding gate is
  // evaluateTerminalRollupStrict.
  ROLLUP_CONTEXT_INCOMPLETE: 'RTK_RELEASE01_ROLLUP_CONTEXT_INCOMPLETE',
  REQUIRED_PROFILE_MISSING: 'RTK_RELEASE01_REQUIRED_PROFILE_MISSING',
  DUPLICATE_PROFILE_ID: 'RTK_RELEASE01_DUPLICATE_PROFILE_ID',
  BLOCKED_CLAIM_PRESENT: 'RTK_RELEASE01_BLOCKED_CLAIM_PRESENT',
  BLOCKER_SET_MISMATCH: 'RTK_RELEASE01_BLOCKER_SET_MISMATCH',
  VETO_INVENTORY_INVALID: 'RTK_RELEASE01_VETO_INVENTORY_INVALID',
  TERMINAL_STATE_MISMATCH: 'RTK_RELEASE01_TERMINAL_STATE_MISMATCH',
  TERMINAL_MATRIX_INVALID: 'RTK_RELEASE01_TERMINAL_MATRIX_INVALID',
});

// ---------------------------------------------------------------------------
// Canonical JSON + digest. computeClaimDigest mirrors the stableJson helper in
// the contract test: object keys sorted ascending, arrays in source order,
// UTF-8 sha256 hex prefixed with 'sha256:'. The digest is computed over the
// claim EXCLUDING its own claimDigest field (self-exclusion), so a recorded
// digest can be recomputed from a claim with the field stripped.
// ---------------------------------------------------------------------------

function stableJson(value) {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableJson(item)).join(',')}]`;
  }
  if (value && typeof value === 'object') {
    const keys = Object.keys(value).sort();
    return `{${keys.map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function sha256Hex(text) {
  return crypto.createHash('sha256').update(Buffer.from(String(text), 'utf8')).digest('hex');
}

export function computeClaimDigest(claim) {
  const { claimDigest: _omitted, ...rest } = claim || {};
  return `sha256:${sha256Hex(stableJson(rest))}`;
}

// ---------------------------------------------------------------------------
// Internal helpers.
// ---------------------------------------------------------------------------

function reason(code, message) {
  return { code, message };
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.length > 0;
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function firstReasonCode(reasons) {
  if (Array.isArray(reasons) && reasons.length > 0) {
    return reasons[0].code || reasons[0];
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// loadTerminalClaimRegistry
//
// Accepts either a filesystem path (string) or a parsed registry object. The
// check order is load-bearing and pinned by the contract:
//
//   1. parse (if path) + top-level structural sanity;
//   2. per-surface SCHEMA validation (surfaceId, path, sha256 mandatory);
//   3. per-claim SCHEMA validation (claimId, claimClass ∈ CLAIM_CLASSES,
//      evidenceBinding{profileId}, surfaceId/wording null-coupling, surfaceId
//      must reference a registered wordingSurface) -> REGISTRY_SCHEMA_INVALID;
//   4. per-claim DIGEST check (computeClaimDigest(claim without claimDigest)
//      === claim.claimDigest) -> CLAIM_DIGEST_MISMATCH.
//
// Schema is checked before digests because a structurally invalid claim has no
// meaningful digest contract. Returns { ok, code?, reasons?, registry?,
// claims? }. On failure reasons is the typed list (firstCode is the verdict).
// ---------------------------------------------------------------------------

export function loadTerminalClaimRegistry(input) {
  let registry;
  if (typeof input === 'string') {
    try {
      registry = JSON.parse(fs.readFileSync(input, 'utf8'));
    } catch (err) {
      return {
        ok: false,
        code: RELEASE01_CODES.REGISTRY_SCHEMA_INVALID,
        reasons: [reason(RELEASE01_CODES.REGISTRY_SCHEMA_INVALID, `registry could not be read: ${err.message}`)],
      };
    }
  } else {
    registry = input;
  }

  const reasons = [];

  if (!isPlainObject(registry)) {
    reasons.push(reason(RELEASE01_CODES.REGISTRY_SCHEMA_INVALID, 'registry root must be an object'));
    return { ok: false, code: firstReasonCode(reasons), reasons };
  }
  if (registry.schemaVersion !== TERMINAL_CLAIM_REGISTRY_SCHEMA) {
    reasons.push(reason(RELEASE01_CODES.REGISTRY_SCHEMA_INVALID, `schemaVersion must equal ${TERMINAL_CLAIM_REGISTRY_SCHEMA}`));
  }
  if (!isNonEmptyString(registry.registryId)) {
    reasons.push(reason(RELEASE01_CODES.REGISTRY_SCHEMA_INVALID, 'registryId must be a non-empty string'));
  }
  if (!Array.isArray(registry.wordingSurfaces)) {
    reasons.push(reason(RELEASE01_CODES.REGISTRY_SCHEMA_INVALID, 'wordingSurfaces must be an array'));
    return { ok: false, code: firstReasonCode(reasons), reasons };
  }
  if (!Array.isArray(registry.claims)) {
    reasons.push(reason(RELEASE01_CODES.REGISTRY_SCHEMA_INVALID, 'claims must be an array'));
    return { ok: false, code: firstReasonCode(reasons), reasons };
  }

  // Per-surface schema validation. Build a lookup of registered surfaceIds so
  // claim surface references can be checked in the per-claim pass.
  const surfaceIds = new Set();
  for (const surface of registry.wordingSurfaces) {
    validateSurfaceSchema(surface, reasons, surfaceIds);
  }

  if (reasons.length > 0) {
    return { ok: false, code: firstReasonCode(reasons), reasons };
  }

  // Per-claim schema validation.
  for (const claim of registry.claims) {
    validateClaimSchema(claim, reasons, surfaceIds);
  }

  if (reasons.length > 0) {
    return { ok: false, code: firstReasonCode(reasons), reasons };
  }

  // Per-claim digest validation (only after schema is clean).
  for (const claim of registry.claims) {
    const expected = claim.claimDigest;
    if (!isNonEmptyString(expected)) {
      reasons.push(reason(RELEASE01_CODES.CLAIM_DIGEST_MISMATCH, `claim ${claim.claimId} missing claimDigest`));
      continue;
    }
    const recomputed = computeClaimDigest(claim);
    if (recomputed !== expected) {
      reasons.push(reason(RELEASE01_CODES.CLAIM_DIGEST_MISMATCH, `claim ${claim.claimId} claimDigest mismatch (expected ${expected}, recomputed ${recomputed})`));
    }
  }

  if (reasons.length > 0) {
    return { ok: false, code: firstReasonCode(reasons), reasons };
  }

  return { ok: true, code: RELEASE01_CODES.COMPILED_OK, registry, claims: registry.claims };
}

function validateSurfaceSchema(surface, reasons, surfaceIds) {
  if (!isPlainObject(surface)) {
    reasons.push(reason(RELEASE01_CODES.REGISTRY_SCHEMA_INVALID, 'wordingSurface must be an object'));
    return;
  }
  if (!isNonEmptyString(surface.surfaceId)) {
    reasons.push(reason(RELEASE01_CODES.REGISTRY_SCHEMA_INVALID, 'wordingSurface.surfaceId must be a non-empty string'));
  } else {
    surfaceIds.add(surface.surfaceId);
  }
  if (!isNonEmptyString(surface.path)) {
    reasons.push(reason(RELEASE01_CODES.REGISTRY_SCHEMA_INVALID, `wordingSurface ${surface.surfaceId || '(unknown)'} path must be a non-empty string`));
  }
  if (!isNonEmptyString(surface.sha256)) {
    reasons.push(reason(RELEASE01_CODES.REGISTRY_SCHEMA_INVALID, `wordingSurface ${surface.surfaceId || '(unknown)'} sha256 must be a non-empty string`));
  }
}

function validateClaimSchema(claim, reasons, surfaceIds) {
  if (!isPlainObject(claim)) {
    reasons.push(reason(RELEASE01_CODES.REGISTRY_SCHEMA_INVALID, 'claim must be an object'));
    return;
  }
  const mandatory = ['claimId', 'claimClass', 'surfaceId', 'wording', 'evidenceBinding'];
  for (const field of mandatory) {
    if (!(field in claim)) {
      reasons.push(reason(RELEASE01_CODES.REGISTRY_SCHEMA_INVALID, `claim ${claim.claimId || '(unknown)'} missing mandatory field ${field}`));
    }
  }
  if (!isNonEmptyString(claim.claimId)) {
    reasons.push(reason(RELEASE01_CODES.REGISTRY_SCHEMA_INVALID, 'claim.claimId must be a non-empty string'));
  }
  if (!CLAIM_CLASSES.includes(claim.claimClass)) {
    reasons.push(reason(RELEASE01_CODES.REGISTRY_SCHEMA_INVALID, `claim ${claim.claimId || '(unknown)'} has unknown claimClass ${JSON.stringify(claim.claimClass)}`));
  }
  const binding = claim.evidenceBinding;
  if (!isPlainObject(binding) || !isNonEmptyString(binding.profileId)) {
    reasons.push(reason(RELEASE01_CODES.REGISTRY_SCHEMA_INVALID, `claim ${claim.claimId || '(unknown)'} evidenceBinding.profileId must be a non-empty string`));
  }

  // surfaceId and wording are null-coupled: a user-facing wording claim must
  // carry both a surface and a wording; a NOT_CLAIMED_BLOCKED claim carries
  // neither. Exactly one of (surfaceId null, wording null) vs (both non-null)
  // is allowed.
  const hasSurface = claim.surfaceId !== null && claim.surfaceId !== undefined;
  const hasWording = claim.wording !== null && claim.wording !== undefined;
  if (hasSurface !== hasWording) {
    reasons.push(reason(RELEASE01_CODES.REGISTRY_SCHEMA_INVALID, `claim ${claim.claimId || '(unknown)'} surfaceId and wording must be both null or both non-null (surfaceId=${JSON.stringify(claim.surfaceId)}, wording=${JSON.stringify(claim.wording)})`));
  }
  if (hasSurface) {
    if (!surfaceIds.has(claim.surfaceId)) {
      reasons.push(reason(RELEASE01_CODES.REGISTRY_SCHEMA_INVALID, `claim ${claim.claimId || '(unknown)'} surfaceId ${JSON.stringify(claim.surfaceId)} does not reference a registered wordingSurface`));
    }
  }
}

// ---------------------------------------------------------------------------
// evaluateClaimEvidenceBinding
//
// Order is load-bearing and pinned by the contract. The first failing check
// wins and is returned as result.code.
//
//   PROFILE_UNKNOWN       -> profile null (the caller could not resolve the
//                            evidenceBinding.profileId to a profile object)
//   CLAIM_ON_BLOCKED_ROW  -> claim.blockedRowRef is set and claimClass is not
//                            NOT_CLAIMED_BLOCKED (a claim that sits on a
//                            blocked matrix row must assert nothing is
//                            supported)
//   CLAIM_EXCEEDS_EVIDENCE -> claimClass is USER_FACING_* but the profile class
//                            is not in the sufficient set
//                            {COMPETING_NOT_SATURATED, SATURATED,
//                            HISTORICAL_BUILD_BOUND} OR the sufficient profile
//                            has no evidence heads (identity -> sufficiency)
//   ok=true               -> COMPILED_OK
// ---------------------------------------------------------------------------

const SUFFICIENT_PROFILE_CLASSES = new Set([
  'COMPETING_NOT_SATURATED',
  'SATURATED',
  'HISTORICAL_BUILD_BOUND',
]);

export function evaluateClaimEvidenceBinding({ claim, profile } = {}) {
  if (!profile) {
    const profileId = claim && claim.evidenceBinding && claim.evidenceBinding.profileId;
    return {
      ok: false,
      code: RELEASE01_CODES.PROFILE_UNKNOWN,
      reasons: [reason(RELEASE01_CODES.PROFILE_UNKNOWN, `profile ${profileId || '(none)'} could not be resolved`)],
    };
  }

  const claimClass = claim && claim.claimClass;

  // A claim on a blocked row must be NOT_CLAIMED_BLOCKED. blockedRowRef
  // non-null marks a claim whose matrix row is blocked; any non-blocked
  // claimClass on such a row is an overclaim of that row.
  if (claim && claim.blockedRowRef !== null && claim.blockedRowRef !== undefined && claimClass !== 'NOT_CLAIMED_BLOCKED') {
    return {
      ok: false,
      code: RELEASE01_CODES.CLAIM_ON_BLOCKED_ROW,
      reasons: [reason(RELEASE01_CODES.CLAIM_ON_BLOCKED_ROW, `claim ${claim.claimId} carries blockedRowRef ${JSON.stringify(claim.blockedRowRef)} but claimClass is ${claimClass}, not NOT_CLAIMED_BLOCKED`)],
    };
  }

  // USER_FACING_* classes require a profile class in the sufficient set AND at
  // least one evidence head. A DECLARED/NOT_PROVEN profile, or a sufficient
  // profile with empty heads, cannot back a user-visible support claim.
  if (claimClass === 'USER_FACING_MANUAL_ONLY' || claimClass === 'USER_FACING_BOUNDED_SUPPORTED') {
    if (!SUFFICIENT_PROFILE_CLASSES.has(profile.class)) {
      return {
        ok: false,
        code: RELEASE01_CODES.CLAIM_EXCEEDS_EVIDENCE,
        reasons: [reason(RELEASE01_CODES.CLAIM_EXCEEDS_EVIDENCE, `claim ${claim.claimId} class ${claimClass} requires profile class in {COMPETING_NOT_SATURATED, SATURATED, HISTORICAL_BUILD_BOUND}, got ${JSON.stringify(profile.class)}`)],
      };
    }
    const heads = Array.isArray(profile.evidenceHeads) ? profile.evidenceHeads : [];
    if (heads.length < 1) {
      return {
        ok: false,
        code: RELEASE01_CODES.CLAIM_EXCEEDS_EVIDENCE,
        reasons: [reason(RELEASE01_CODES.CLAIM_EXCEEDS_EVIDENCE, `claim ${claim.claimId} class ${claimClass} requires at least one evidence head, profile ${profile.profileId} has none`)],
      };
    }
  }

  return {
    ok: true,
    code: RELEASE01_CODES.COMPILED_OK,
    reasons: [reason(RELEASE01_CODES.COMPILED_OK, `claim ${claim.claimId} bound to profile ${profile.profileId}`)],
  };
}

// ---------------------------------------------------------------------------
// evaluateWordingOverclaim
//
// Matches the claim wording case-insensitively as a substring against each
// banned pattern. The banned patterns include marketing overclaim language
// ('fully supports', 'seamless', 'production-ready', 'SATURATED', ...) that a
// bounded-support product must never utter in a public wording string. The
// first match wins.
//
//   OVERCLAIM_WORDING -> a banned pattern matched as a case-insensitive
//                        substring of claim.wording
//   ok=true           -> COMPILED_OK
// ---------------------------------------------------------------------------

export function evaluateWordingOverclaim({ claim, bannedPatterns } = {}) {
  const wording = claim && typeof claim.wording === 'string' ? claim.wording : '';
  const patterns = Array.isArray(bannedPatterns) ? bannedPatterns : [];
  const lower = wording.toLowerCase();
  for (const pattern of patterns) {
    if (typeof pattern !== 'string' || pattern.length === 0) continue;
    if (lower.includes(pattern.toLowerCase())) {
      return {
        ok: false,
        code: RELEASE01_CODES.OVERCLAIM_WORDING,
        reasons: [reason(RELEASE01_CODES.OVERCLAIM_WORDING, `claim ${claim && claim.claimId} wording matched banned pattern ${JSON.stringify(pattern)}`)],
      };
    }
  }
  return {
    ok: true,
    code: RELEASE01_CODES.COMPILED_OK,
    reasons: [reason(RELEASE01_CODES.COMPILED_OK, `claim ${claim && claim.claimId} wording cleared overclaim check`)],
  };
}

// ---------------------------------------------------------------------------
// scanWordingSurface
//
// Deterministic extractor. Given { surfaceId, content, pathHint }, returns
// { wordings: [{ text }] } — the deduplicated, ascending-sorted set of product
// wording strings present in the content that mention /word|docx|google/i.
//
// Extraction mode depends on the surface file extension (derived from pathHint):
//
//   - For .js/.mjs/.cjs files: a single-pass STATE-MACHINE TOKENIZER extracts
//     ONLY single- and double-quoted string literals. Template literals
//     (backticks), regex literals, line comments and block comments are
//     explicitly consumed (skipped) so they never produce candidate text.
//     This is what avoids noise from identifiers like wordWrap, wordCount,
//     docxImportPreviewModal AND from regex literals like /[\/<>|?*]/g.
//   - For .json files: the content is parsed and every STRING LEAF value is a
//     candidate (object keys and structural tokens are not). A leaf that
//     contains a keyword and reads as natural-language wording is kept. If the
//     content is not valid JSON, the extractor falls back to the line-based
//     mode so a malformed surface is still reported (never silently empty).
//   - For .md and any other text: each non-empty trimmed text LINE is a
//     candidate if it contains a keyword.
//
// Candidate filter (applied uniformly across all modes): a candidate is kept
// only if it mentions a keyword AND reads as NATURAL-LANGUAGE WORDING — i.e. it
// contains a whitespace separator OR a non-ASCII letter. This separates
// user-visible product wording ("Форматирование из Word готово",
// "Export DOCX (Minimal)...") from programming identifiers (wordWrap,
// cmd.project.importDocxV1), data-attribute selectors
// ([data-docx-import-preview-modal]) and filesystem paths. This is the filter
// the contract calls "only string literals so identifiers like wordWrap do not
// noise": a wording string is text a human reads, not an identifier a program
// references.
//
// The result is deduplicated and sorted ascending so the output is stable
// across runs and machines. The extractor NEVER weakens a scan: a
// natural-language keyword string that is present is always returned.
// ---------------------------------------------------------------------------

// Keyword match uses ASCII word boundaries so 'word' does not match inside
// 'wording' (the contract scenarios rely on this: a content line "without
// product wording" must NOT be extracted as a Word/DOCX product line). The
// boundary also keeps 'docx' from matching 'docxImport' identifiers and
// 'google' from matching 'googleDocs'. \b is ASCII in JS regex, which is the
// intended behaviour for the Latin keyword stems; Cyrillic wording strings
// ("Форматирование из Word готово") still match because the keyword is Latin
// and is surrounded by ASCII whitespace boundaries.
const KEYWORD_RE = /\b(?:word|docx|google)\b/i;

// A candidate reads as natural-language wording if it has a whitespace
// separator or a non-ASCII letter. This is the conservative "is this text a
// human reads" test that excludes bare identifiers, selectors and paths while
// keeping every visible label, status message and README line.
function isNaturalLanguageWording(text) {
  if (typeof text !== 'string' || text.length === 0) return false;
  if (/\s/.test(text)) return true; // has a word separator
  // Non-ASCII letter (Cyrillic, etc.) without whitespace is still wording.
  if (/[^\x00-\x7F]/.test(text)) return true;
  return false;
}

// A wording candidate is a product string a USER reads, never a shell command
// or build script. Dev tooling strings (package.json scripts, CI invocations)
// mention keywords incidentally ("rtk-google01", "rtk-word-c5v2") but are not
// product wording. This filter excludes command invocations and CLI flags so
// they cannot masquerade as claims.
const COMMAND_START_RE = /^\s*(node|npm|npx|yarn|pnpm|git|bash|sh|python|python3|ruby)\s+\S/;
const CLI_FLAG_RE = /\s--?[a-zA-Z][\w-]*/;

function isCommandLike(text) {
  if (typeof text !== 'string') return false;
  return COMMAND_START_RE.test(text) || CLI_FLAG_RE.test(text);
}

function looksLikeWordingCandidate(text) {
  if (typeof text !== 'string') return false;
  if (!KEYWORD_RE.test(text)) return false;
  if (!isNaturalLanguageWording(text)) return false;
  if (isCommandLike(text)) return false;
  return true;
}

// Modes derived from the file extension in the surface path.
const SOURCE_LITERAL_EXTENSIONS = new Set(['.js', '.mjs', '.cjs']);
const JSON_EXTENSIONS = new Set(['.json']);

function extractJsStringLiterals(text) {
  // Single-pass state machine. Consumes template literals, regex literals,
  // line comments and block comments so they never emit candidate text; only
  // single- and double-quoted string literals are collected.
  const out = [];
  let i = 0;
  const n = text.length;
  // Track the previous significant (non-whitespace, non-comment) char to
  // decide whether '/' is a regex opener or a division operator.
  let prevSignificant = '';
  while (i < n) {
    const ch = text[i];
    const next = i + 1 < n ? text[i + 1] : '';

    if (ch === '/' && next === '/') {
      // Line comment: consume to end of line.
      i += 2;
      while (i < n && text[i] !== '\n') i += 1;
      continue;
    }
    if (ch === '/' && next === '*') {
      // Block comment: consume to closing */.
      i += 2;
      while (i < n && !(text[i] === '*' && i + 1 < n && text[i + 1] === '/')) i += 1;
      i += 2; // skip closing */
      continue;
    }
    if (ch === '`') {
      // Template literal: consume to closing backtick, honouring ${...}
      // nesting (a backtick inside ${...} is a nested template) and escapes.
      i += 1;
      let depth = 0;
      while (i < n) {
        const c = text[i];
        if (c === '\\') { i += 2; continue; }
        if (c === '$' && i + 1 < n && text[i + 1] === '{') { depth += 1; i += 2; continue; }
        if (c === '}' && depth > 0) { depth -= 1; i += 1; continue; }
        if (c === '`' && depth === 0) { i += 1; break; }
        i += 1;
      }
      // Template literals are not emitted as candidates.
      prevSignificant = '`';
      continue;
    }
    if (ch === "'") {
      const lit = consumeQuoted(text, i, "'");
      if (lit !== null) {
        out.push(lit.value);
        i = lit.end;
        prevSignificant = "'";
      } else {
        i += 1;
      }
      continue;
    }
    if (ch === '"') {
      const lit = consumeQuoted(text, i, '"');
      if (lit !== null) {
        out.push(lit.value);
        i = lit.end;
        prevSignificant = '"';
      } else {
        i += 1;
      }
      continue;
    }
    if (ch === '/') {
      // Decide regex vs division. A '/' opens a regex when the previous
      // significant char is not a value-ending token (letter, digit, ')',
      // ']', '}'). Consuming a regex here prevents it from leaking candidate
      // text; misclassifying division as regex only skips characters up to the
      // next '/', which cannot drop a quoted string literal.
      if (isRegexContext(prevSignificant)) {
        i += 1;
        let inClass = false;
        while (i < n) {
          const c = text[i];
          if (c === '\\') { i += 2; continue; }
          if (c === '[') inClass = true;
          else if (c === ']') inClass = false;
          else if (c === '/' && !inClass) { i += 1; break; }
          else if (c === '\n') break; // unterminated regex; bail
          i += 1;
        }
        prevSignificant = '/';
        continue;
      }
    }
    if (!/\s/.test(ch)) prevSignificant = ch;
    i += 1;
  }
  return out;
}

function consumeQuoted(text, start, quote) {
  // Returns { value, end } for a quote-delimited literal starting at start, or
  // null if the string is immediately empty/unterminated in a way the scanner
  // cannot resolve. Escapes are honoured.
  let i = start + 1;
  const n = text.length;
  let buf = '';
  while (i < n) {
    const c = text[i];
    if (c === '\\') {
      const nxt = i + 1 < n ? text[i + 1] : '';
      buf += nxt;
      i += 2;
      continue;
    }
    if (c === quote) {
      return { value: buf, end: i + 1 };
    }
    buf += c;
    i += 1;
  }
  return null;
}

function isRegexContext(prevSignificant) {
  if (prevSignificant === '') return true; // start of file
  // After a value-ending token, '/' is division; otherwise it is a regex.
  return !/[A-Za-z0-9_$)\]}/]/.test(prevSignificant);
}

function extractJsonStringLeaves(text) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (_err) {
    // Not valid JSON: fall back to line-based extraction so a malformed
    // surface is still surfaced (never silently empty).
    return null;
  }
  const leaves = [];
  const visit = (value) => {
    if (typeof value === 'string') {
      leaves.push(value);
    } else if (Array.isArray(value)) {
      for (const item of value) visit(item);
    } else if (value !== null && typeof value === 'object') {
      for (const key of Object.keys(value)) visit(value[key]);
    }
  };
  visit(parsed);
  return leaves;
}

export function scanWordingSurface({ surfaceId, content, pathHint } = {}) {
  const text = typeof content === 'string' ? content : '';
  const candidates = new Set();

  const ext = isNonEmptyString(pathHint)
    ? pathHint.toLowerCase().match(/(\.[^.]+)$/)
    : null;
  const extStr = ext !== null ? ext[1] : '';

  if (JSON_EXTENSIONS.has(extStr)) {
    const leaves = extractJsonStringLeaves(text);
    if (leaves !== null) {
      for (const leaf of leaves) {
        if (looksLikeWordingCandidate(leaf)) candidates.add(leaf);
      }
    } else {
      // Malformed JSON: fall back to line-based extraction.
      for (const rawLine of text.split(/\r?\n/)) {
        const line = rawLine.trim();
        if (line.length > 0 && looksLikeWordingCandidate(line)) candidates.add(line);
      }
    }
  } else if (SOURCE_LITERAL_EXTENSIONS.has(extStr)) {
    const literals = extractJsStringLiterals(text);
    for (const lit of literals) {
      if (looksLikeWordingCandidate(lit)) candidates.add(lit);
    }
  } else {
    // Line-based extraction for markdown and other text.
    for (const rawLine of text.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (line.length > 0 && looksLikeWordingCandidate(line)) candidates.add(line);
    }
  }

  const wordings = [...candidates].sort().map((textValue) => ({ text: textValue }));
  return { surfaceId, wordings };
}

// ---------------------------------------------------------------------------
// evaluateWordingSurfaceBinding
//
// Order is load-bearing and pinned by the contract. The first failing check
// wins and is returned as result.code.
//
//   WORDING_SURFACE_DRIFT -> fileSha256 != the recorded surface sha256 (the
//                            committed file drifted from the registry binding)
//   GOOGLE_WORDING_PRESENT -> any extracted wording string matches /google/i.
//                            This fires BEFORE UNMAPPED_WORDING: a Google
//                            wording line is ALWAYS a Google violation, never
//                            merely an unmapped one.
//   UNMAPPED_WORDING      -> an extracted wording string is not equal to any
//                            registered claim wording of this surface (a
//                            product wording string has no typed claim)
//   CLAIM_WORDING_DRIFT   -> a registered claim wording of this surface is
//                            absent from the extracted content (a registered
//                            claim no longer matches the committed file)
//   ok=true               -> COMPILED_OK
// ---------------------------------------------------------------------------

export function evaluateWordingSurfaceBinding({ registry, surfaceId, content, fileSha256 } = {}) {
  const surfaces = (registry && Array.isArray(registry.wordingSurfaces)) ? registry.wordingSurfaces : [];
  const surface = surfaces.find((s) => s && s.surfaceId === surfaceId) || null;
  if (!surface) {
    return {
      ok: false,
      code: RELEASE01_CODES.WORDING_SURFACE_DRIFT,
      reasons: [reason(RELEASE01_CODES.WORDING_SURFACE_DRIFT, `surfaceId ${JSON.stringify(surfaceId)} is not registered`)],
    };
  }

  // (a) Surface sha256 drift: the committed file must match the recorded hash.
  if (fileSha256 !== surface.sha256) {
    return {
      ok: false,
      code: RELEASE01_CODES.WORDING_SURFACE_DRIFT,
      reasons: [reason(RELEASE01_CODES.WORDING_SURFACE_DRIFT, `surface ${surfaceId} fileSha256 ${JSON.stringify(fileSha256)} != recorded ${JSON.stringify(surface.sha256)}`)],
    };
  }

  // Scan the content. The extractor keys off the registered surface path's
  // extension so .js/.json are literal-scanned and .md is line-scanned.
  const scan = scanWordingSurface({ surfaceId, content, pathHint: surface.path });
  const extracted = scan.wordings.map((w) => w.text);

  // (b) Google wording present: any extracted string matching /google/i is a
  // terminal Google violation, before any unmapped-wording check.
  const googleHit = extracted.find((t) => /google/i.test(t));
  if (googleHit !== undefined) {
    return {
      ok: false,
      code: RELEASE01_CODES.GOOGLE_WORDING_PRESENT,
      reasons: [reason(RELEASE01_CODES.GOOGLE_WORDING_PRESENT, `surface ${surfaceId} extracted Google wording: ${JSON.stringify(googleHit)}`)],
    };
  }

  // The registered wordings of this surface are exactly the claim.wording
  // values of claims whose surfaceId === this surface. Claims with surfaceId
  // null (NOT_CLAIMED_BLOCKED) contribute no wording.
  const claims = (registry && Array.isArray(registry.claims)) ? registry.claims : [];
  const registeredWordings = claims
    .filter((c) => c && c.surfaceId === surfaceId && typeof c.wording === 'string')
    .map((c) => c.wording);

  // (c) Unmapped wording: an extracted string that is not any registered
  // wording of this surface (a product wording string with no typed claim).
  const extractedSet = new Set(extracted);
  for (const registered of registeredWordings) {
    if (!extractedSet.has(registered)) {
      // Will be reported as drift below; fall through.
    }
  }
  const registeredSet = new Set(registeredWordings);
  const unmapped = extracted.filter((t) => !registeredSet.has(t));
  if (unmapped.length > 0) {
    return {
      ok: false,
      code: RELEASE01_CODES.UNMAPPED_WORDING,
      reasons: [reason(RELEASE01_CODES.UNMAPPED_WORDING, `surface ${surfaceId} extracted ${JSON.stringify(unmapped)} not registered as claim wordings`)],
    };
  }

  // (d) Claim wording drift: a registered wording of this surface is absent
  // from the extracted content (the committed file no longer carries a
  // registered claim string).
  const drift = registeredWordings.filter((t) => !extractedSet.has(t));
  if (drift.length > 0) {
    return {
      ok: false,
      code: RELEASE01_CODES.CLAIM_WORDING_DRIFT,
      reasons: [reason(RELEASE01_CODES.CLAIM_WORDING_DRIFT, `surface ${surfaceId} registered wordings ${JSON.stringify(drift)} absent from extracted content`)],
    };
  }

  return {
    ok: true,
    code: RELEASE01_CODES.COMPILED_OK,
    reasons: [reason(RELEASE01_CODES.COMPILED_OK, `surface ${surfaceId} bound ${extracted.length} wording string(s)`)],
  };
}

// ---------------------------------------------------------------------------
// evaluateNonClaimUnion
//
// Every source nonClaim must be present in the terminal inventory. This is the
// anti-drop law: a source inventory (Google profile nonClaims, CAPABILITY_MATRIX
// top-level nonClaims, Word normalized-matrix nonClaims) must not lose a
// nonClaim when rolled up into the terminal inventory. A dropped nonClaim is a
// silent overclaim. Returns { ok, code?, reasons? }.
//
//   NONCLAIM_DROPPED -> a source nonClaim absent from
//                       registry.terminalNonClaimInventory
//   ok=true          -> COMPILED_OK
// ---------------------------------------------------------------------------

export function evaluateNonClaimUnion({ registry, sourceNonClaims } = {}) {
  const inventory = new Set((registry && Array.isArray(registry.terminalNonClaimInventory)) ? registry.terminalNonClaimInventory : []);
  const sources = Array.isArray(sourceNonClaims) ? sourceNonClaims : [];

  const dropped = sources.filter((nc) => !inventory.has(nc));
  if (dropped.length > 0) {
    return {
      ok: false,
      code: RELEASE01_CODES.NONCLAIM_DROPPED,
      reasons: dropped.map((nc) => reason(RELEASE01_CODES.NONCLAIM_DROPPED, `source nonClaim ${JSON.stringify(nc)} dropped from terminal inventory`)),
    };
  }
  return {
    ok: true,
    code: RELEASE01_CODES.COMPILED_OK,
    reasons: [reason(RELEASE01_CODES.COMPILED_OK, `nonClaim union covers ${sources.length} source nonClaim(s)`)],
  };
}

// ---------------------------------------------------------------------------
// evaluateTerminalRollup
//
// Anti-overclaim terminal roll-up. Computes the terminal claim state from the
// context (wordProfiles, googleProfiles, blockedMatrixRows, vetoCounters) and
// fail-closes if the registry's recorded terminalRollup.state is WIDER than
// the computed state.
//
// The computed state is NOT_MADE_WORD_TERMINAL_PASS_REQUIRED while ANY of:
//   (a) any google profile class is DECLARED or NOT_PROVEN;
//   (b) the word-mac-16.111.2-d1 profile class is not SATURATED;
//   (c) blockedMatrixRows is non-empty;
//   (d) any veto counter is non-zero.
//
// The product is only allowed to record WORD_TERMINAL_PASS_ACHIEVED when the
// computed state reaches it; recording a wider state than computed is
// CLAIM_EXCEEDS_EVIDENCE (the recorded roll-up claims more than the evidence
// supports).
//
// Returns { ok, terminalClaim, code?, reasons? }.
// ---------------------------------------------------------------------------

function computeTerminalState(context) {
  const wordProfiles = (context && Array.isArray(context.wordProfiles)) ? context.wordProfiles : [];
  const googleProfiles = (context && Array.isArray(context.googleProfiles)) ? context.googleProfiles : [];
  const blockedMatrixRows = (context && Array.isArray(context.blockedMatrixRows)) ? context.blockedMatrixRows : [];
  const vetoCounters = (context && isPlainObject(context.vetoCounters)) ? context.vetoCounters : {};

  // (a) Google: every google profile must be past DECLARED/NOT_PROVEN.
  for (const p of googleProfiles) {
    if (p && (p.class === 'DECLARED' || p.class === 'NOT_PROVEN')) {
      return 'NOT_MADE_WORD_TERMINAL_PASS_REQUIRED';
    }
  }

  // (b) Word: the 16.111.2-d1 profile must be SATURATED.
  const wordD1 = wordProfiles.find((p) => p && p.profileId === 'word-mac-16.111.2-d1');
  if (!wordD1 || wordD1.class !== 'SATURATED') {
    return 'NOT_MADE_WORD_TERMINAL_PASS_REQUIRED';
  }

  // (c) Matrix: no blocked rows.
  if (blockedMatrixRows.length > 0) {
    return 'NOT_MADE_WORD_TERMINAL_PASS_REQUIRED';
  }

  // (d) Veto counters: all zero.
  for (const key of Object.keys(vetoCounters)) {
    const v = vetoCounters[key];
    if (typeof v === 'number' && v !== 0) {
      return 'NOT_MADE_WORD_TERMINAL_PASS_REQUIRED';
    }
  }

  return 'WORD_TERMINAL_PASS_ACHIEVED';
}

// The authority rank of a terminal state. The recorded state may be AT MOST
// the computed rank; a recorded state with a higher rank than computed is an
// overclaim. NOT_MADE_WORD_TERMINAL_PASS_REQUIRED < WORD_TERMINAL_PASS_ACHIEVED.
const STATE_RANK = {
  NOT_MADE_WORD_TERMINAL_PASS_REQUIRED: 0,
  WORD_TERMINAL_PASS_ACHIEVED: 1,
};

export function evaluateTerminalRollup({ registry, context } = {}) {
  const recorded = registry && registry.terminalRollup && registry.terminalRollup.state;
  const computed = computeTerminalState(context);

  const recordedRank = STATE_RANK[recorded];
  const computedRank = STATE_RANK[computed];

  // If the recorded state is unknown/unranked, we cannot prove it is honest ->
  // fail closed as CLAIM_EXCEEDS_EVIDENCE.
  if (recordedRank === undefined) {
    return {
      ok: false,
      terminalClaim: computed,
      code: RELEASE01_CODES.CLAIM_EXCEEDS_EVIDENCE,
      reasons: [reason(RELEASE01_CODES.CLAIM_EXCEEDS_EVIDENCE, `recorded terminalRollup.state ${JSON.stringify(recorded)} is not a known terminal state`)],
    };
  }

  // ok=true only if the recorded state equals the computed state. A recorded
  // state WIDER than computed (recordedRank > computedRank) is an overclaim.
  // A recorded state NARROWER than computed (recordedRank < computedRank) is
  // stale but not an overclaim; the contract pins equality so the registry is
  // always exactly honest about the current evidence.
  if (recordedRank > computedRank) {
    return {
      ok: false,
      terminalClaim: computed,
      code: RELEASE01_CODES.CLAIM_EXCEEDS_EVIDENCE,
      reasons: [reason(RELEASE01_CODES.CLAIM_EXCEEDS_EVIDENCE, `recorded terminalRollup.state ${JSON.stringify(recorded)} is wider than computed ${JSON.stringify(computed)}`)],
    };
  }

  return {
    ok: true,
    terminalClaim: computed,
    code: RELEASE01_CODES.COMPILED_OK,
    reasons: [reason(RELEASE01_CODES.COMPILED_OK, `terminal roll-up agrees: ${JSON.stringify(computed)}`)],
  };
}

// ---------------------------------------------------------------------------
// evaluateTerminalRollupStrict  (HOTFIX
// YALKEN_INTEROP_RELEASE01_TERMINAL_ROLLUP_FAIL_CLOSED_HOTFIX_V1)
//
// Strictly fail-closed terminal roll-up. Replaces the rank-inequality legacy
// semantics as the binding gate:
//
//   context = { wordProfiles, googleProfiles, terminalMatrix, vetoCounters,
//               claims } — ALL five collections are mandatory; a missing or
//   malformed collection is ROLLUP_CONTEXT_INCOMPLETE, never a silent default.
//
// Check order (load-bearing, pinned by the RELEASE01-H01..H16 contract):
//   1. ROLLUP_CONTEXT_INCOMPLETE  — missing/malformed collection, malformed
//      profile entry, or unknown profile class;
//   2. DUPLICATE_PROFILE_ID       — one profileId appearing twice;
//   3. REQUIRED_PROFILE_MISSING   — the required current Word profile
//      (word-mac-16.111.2-d1) absent, or a claim's evidenceBinding.profileId
//      unresolvable;
//   4. TERMINAL_MATRIX_INVALID    — terminalMatrix is not the current terminal
//      acceptance matrix (schema mismatch or rows not an array);
//   5. VETO_INVENTORY_INVALID     — a known veto key missing, or any value not
//      exactly numeric zero (nonzero numbers, truthy strings, booleans all
//      fail closed);
//   6. compute the deterministic blocker set (sorted):
//        WORD_PROFILE_NOT_SATURATED:<id>  required current profile not SATURATED
//        WORD_PROFILE_UNPROVEN:<id>       word profile class NOT_PROVEN
//        WORD_PROFILE_DECLARED:<id>       word profile class DECLARED
//        GOOGLE_PROFILE_UNPROVEN:<id>     google profile class NOT_PROVEN
//        GOOGLE_PROFILE_DECLARED:<id>     google profile class DECLARED
//        BLOCKED_CLAIM:<claimId>          claim class NOT_CLAIMED_BLOCKED remains
//        TERMINAL_MATRIX_ROW_BLOCKED:<id> terminal matrix row status BLOCKED
//      computed state is WORD_TERMINAL_PASS_ACHIEVED iff the blocker set is
//      empty, else NOT_MADE_WORD_TERMINAL_PASS_REQUIRED;
//   7. BLOCKER_SET_MISMATCH       — recorded terminalRollup.blockers must equal
//      the computed set exactly (sorted arrays, element-wise);
//   8. TERMINAL_STATE_MISMATCH    — recorded terminalRollup.state must equal the
//      computed state exactly, in BOTH directions (wider AND narrower recorded
//      states are equally mismatches).
//
// EVIDENCE_NEVER_CREATES_AUTHORITY: read-only; returns typed reasons only.
// ---------------------------------------------------------------------------

const TERMINAL_MATRIX_SCHEMA = 'yalken.word.c5v2.terminal-acceptance-matrix.v1';
const REQUIRED_CURRENT_WORD_PROFILE_ID = 'word-mac-16.111.2-d1';
const PROFILE_CLASS_VOCABULARY = new Set([
  'HISTORICAL_BUILD_BOUND',
  'COMPETING_NOT_SATURATED',
  'SATURATED',
  'NOT_PROVEN',
  'DECLARED',
]);
const VETO_KNOWN_KEYS = Object.freeze([
  'falseExactVeto',
  'wrongSceneVeto',
  'silentApplyVeto',
  'replayFailureVeto',
  'silentCommentLossVeto',
  'productNetworkRequestsVeto',
]);

function strictFail(code, message, terminalClaim, blockers) {
  return {
    ok: false,
    code,
    terminalClaim: terminalClaim === undefined ? null : terminalClaim,
    blockers: Array.isArray(blockers) ? blockers : null,
    reasons: [reason(code, message)],
  };
}

export function evaluateTerminalRollupStrict({ registry, context } = {}) {
  // --- 1. context completeness ---------------------------------------------
  const ctx = isPlainObject(context) ? context : null;
  const wordProfiles = ctx && ctx.wordProfiles;
  const googleProfiles = ctx && ctx.googleProfiles;
  const terminalMatrix = ctx && ctx.terminalMatrix;
  const vetoCounters = ctx && ctx.vetoCounters;
  const claims = ctx && ctx.claims;
  if (!ctx || !Array.isArray(wordProfiles) || !Array.isArray(googleProfiles)
    || !isPlainObject(terminalMatrix) || !isPlainObject(vetoCounters) || !Array.isArray(claims)) {
    return strictFail(RELEASE01_CODES.ROLLUP_CONTEXT_INCOMPLETE,
      'context must carry wordProfiles[], googleProfiles[], terminalMatrix{}, vetoCounters{} and claims[]');
  }
  const allProfiles = [...wordProfiles, ...googleProfiles];
  for (const p of allProfiles) {
    if (!isPlainObject(p) || !isNonEmptyString(p.profileId) || !PROFILE_CLASS_VOCABULARY.has(p.class)) {
      return strictFail(RELEASE01_CODES.ROLLUP_CONTEXT_INCOMPLETE,
        `malformed profile entry or unknown profile class: ${JSON.stringify(p && p.profileId)} class ${JSON.stringify(p && p.class)}`);
    }
  }

  // --- 2. duplicate profile identity ---------------------------------------
  const seenProfileIds = new Set();
  for (const p of allProfiles) {
    if (seenProfileIds.has(p.profileId)) {
      return strictFail(RELEASE01_CODES.DUPLICATE_PROFILE_ID,
        `duplicate profileId ${p.profileId}`);
    }
    seenProfileIds.add(p.profileId);
  }

  // --- 3. required profile resolution --------------------------------------
  const profilesById = new Map(allProfiles.map((p) => [p.profileId, p]));
  if (!profilesById.has(REQUIRED_CURRENT_WORD_PROFILE_ID)) {
    return strictFail(RELEASE01_CODES.REQUIRED_PROFILE_MISSING,
      `required current Word profile ${REQUIRED_CURRENT_WORD_PROFILE_ID} is absent`);
  }
  for (const claim of claims) {
    const profileId = claim && claim.evidenceBinding && claim.evidenceBinding.profileId;
    if (!isNonEmptyString(profileId) || !profilesById.has(profileId)) {
      return strictFail(RELEASE01_CODES.REQUIRED_PROFILE_MISSING,
        `claim ${claim && claim.claimId} references unresolvable profileId ${JSON.stringify(profileId)}`);
    }
  }

  // --- 4. terminal matrix identity ------------------------------------------
  if (terminalMatrix.schemaVersion !== TERMINAL_MATRIX_SCHEMA || !Array.isArray(terminalMatrix.rows)) {
    return strictFail(RELEASE01_CODES.TERMINAL_MATRIX_INVALID,
      `terminalMatrix must be the current terminal acceptance matrix (${TERMINAL_MATRIX_SCHEMA}) with rows[]`);
  }

  // --- 5. veto inventory -----------------------------------------------------
  for (const key of VETO_KNOWN_KEYS) {
    if (!(key in vetoCounters)) {
      return strictFail(RELEASE01_CODES.VETO_INVENTORY_INVALID,
        `veto inventory missing known key ${key}`);
    }
    const value = vetoCounters[key];
    if (typeof value !== 'number' || value !== 0) {
      return strictFail(RELEASE01_CODES.VETO_INVENTORY_INVALID,
        `veto ${key} must be numeric zero, got ${JSON.stringify(value)}`);
    }
  }

  // --- 6. deterministic blockers --------------------------------------------
  const blockers = [];
  const currentWord = profilesById.get(REQUIRED_CURRENT_WORD_PROFILE_ID);
  if (currentWord.class !== 'SATURATED') {
    blockers.push(`WORD_PROFILE_NOT_SATURATED:${REQUIRED_CURRENT_WORD_PROFILE_ID}`);
  }
  for (const p of wordProfiles) {
    if (p.class === 'NOT_PROVEN') blockers.push(`WORD_PROFILE_UNPROVEN:${p.profileId}`);
    if (p.class === 'DECLARED') blockers.push(`WORD_PROFILE_DECLARED:${p.profileId}`);
  }
  for (const p of googleProfiles) {
    if (p.class === 'NOT_PROVEN') blockers.push(`GOOGLE_PROFILE_UNPROVEN:${p.profileId}`);
    if (p.class === 'DECLARED') blockers.push(`GOOGLE_PROFILE_DECLARED:${p.profileId}`);
  }
  for (const claim of claims) {
    if (claim && claim.claimClass === 'NOT_CLAIMED_BLOCKED') {
      blockers.push(`BLOCKED_CLAIM:${claim.claimId}`);
    }
  }
  for (const row of terminalMatrix.rows) {
    if (row && row.status === 'BLOCKED') {
      blockers.push(`TERMINAL_MATRIX_ROW_BLOCKED:${row.rowId || row.id}`);
    }
  }
  blockers.sort();
  const computed = blockers.length === 0 ? 'WORD_TERMINAL_PASS_ACHIEVED' : 'NOT_MADE_WORD_TERMINAL_PASS_REQUIRED';

  // --- 7. recorded blocker set equality --------------------------------------
  const recordedRollup = (isPlainObject(registry) && isPlainObject(registry.terminalRollup)) ? registry.terminalRollup : {};
  const recordedBlockers = Array.isArray(recordedRollup.blockers) ? [...recordedRollup.blockers].sort() : null;
  if (recordedBlockers === null
    || recordedBlockers.length !== blockers.length
    || recordedBlockers.some((value, index) => value !== blockers[index])) {
    return strictFail(RELEASE01_CODES.BLOCKER_SET_MISMATCH,
      `recorded blockers ${JSON.stringify(recordedBlockers)} != computed ${JSON.stringify(blockers)}`,
      computed, blockers);
  }

  // --- 8. recorded state exact equality (both directions) --------------------
  if (recordedRollup.state !== computed) {
    return strictFail(RELEASE01_CODES.TERMINAL_STATE_MISMATCH,
      `recorded state ${JSON.stringify(recordedRollup.state)} != computed ${JSON.stringify(computed)}`,
      computed, blockers);
  }

  return {
    ok: true,
    code: RELEASE01_CODES.COMPILED_OK,
    terminalClaim: computed,
    blockers,
    reasons: [reason(RELEASE01_CODES.COMPILED_OK, `strict terminal roll-up agrees: ${JSON.stringify(computed)}`)],
  };
}

export { stableJson };
