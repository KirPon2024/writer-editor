# CONTOUR-C — Runtime Execution & Causality

Mode: TRANSITIONAL
Governance changes: FORBIDDEN in v1.2; allowed only via OPS_CANON v1.3+ pack

## GLOBAL RULES (BINDING)
- OPS ≠ SRC: OPS/docs tasks MUST NOT mix with `src/**` changes.
- Scripts (doctor/guards) MUST NOT mix with `src/**` changes.
- Canon path (single allowed sequence): Spec (docs) → OPS artifacts → doctor visibility/checks → src implementation → self-check → exit.
- Any ambiguity or conflict → STOP.
- Determinism constraint (runtime scope): all runtime-visible decisions (queue ordering, overflow outcomes, effect attempt accounting, trace emission) MUST be deterministic with respect to scenario inputs, orderingKey, and runtime policy configuration.

## VERSION COMPARE RULE (STRICT) — MUST
### Canonical version token
- Version format MUST be `v<major>.<minor>` with `major` and `minor` as base-10 non-negative integers.
- Examples: `v1.2`, `v1.3`, `v2.0`

### Parse + compare (authoritative)
- Comparison MUST be numeric, lexicographic over `(major, minor)`.
- String comparison is FORBIDDEN.

### Rules
- `vA.B > vC.D` iff `A > C` OR (`A == C` AND `B > D`)
- Equality MUST match both numbers.

### Applicability gating (introducedIn)
- An item with `introducedIn = vX.Y` is applicable iff `introducedIn <= targetBaselineVersion` using the numeric compare above.

## SUPPORTED VERSIONS POLICY (DOCTOR) — MUST
### Single-version support rule
- `scripts/doctor.mjs` MUST support exactly one OPS canon version at a time:
  - `SUPPORTED_OPS_CANON_VERSION = "<vX.Y>"`

### targetBaselineVersion selection (authoritative)
Doctor MUST compute `targetBaselineVersion` as follows:
- If `CHECKS_BASELINE_VERSION` is provided by the caller AND is a valid `vX.Y` token: `targetBaselineVersion = CHECKS_BASELINE_VERSION`.
- Otherwise: `targetBaselineVersion = docs/OPS/INVARIANTS_REGISTRY.json.opsCanonVersion`.

`CHECKS_BASELINE_VERSION` MUST be considered REQUIRED for task-runs. Absence MUST be treated as a standalone-run.

### Compatibility rule
- Doctor MUST FAIL if `targetBaselineVersion != SUPPORTED_OPS_CANON_VERSION`.

### Migration/upgrade rule
- Any bump of OPS canon version MUST be done by an atomic pack:
  - canonical inputs (OPS JSON artifacts) + doctor bump + any required scripts/guards
  - intermediate states where doctor and canonical inputs disagree are FORBIDDEN.

## FREEZE BOUNDARY (OPS v1.2) — MUST
- OPS v1.2 is considered FROZEN by `docs/OPERATIONS/OPS-V12-GOVERNANCE-FROZEN.md`.
- FROZEN set = only canonical artifacts explicitly listed in that marker document.
- Any file in the FROZEN set MUST NOT be edited during CONTOUR-C work except as part of an explicit OPS_CANON v1.3+ atomic pack, where doctor and canonical inputs are updated together.
- Files outside the FROZEN set MUST NOT change OPS v1.2 governance semantics.

### Semantics-change definition (governance)
A change is considered a governance semantics change if it alters any of:
- version selection (`targetBaselineVersion`) rules
- version compatibility rules
- invariant applicability logic
- debt matching semantics
- aggregation and exit-code semantics
- inventory emptiness semantics
- checkId resolvability rules

If unsure whether a change alters semantics: STOP.

## VERSIONING / MIGRATION RULE (v1.3) — MUST
- Any new CONTOUR-C invariants, inventories, or new checkId entries MUST be introduced via an OPS_CANON v1.3+ pack.
- OPS_CANON v1.3 bootstrap MUST be atomic:
  - canonical inputs and doctor MUST be compatible at all times
  - intermediate states where doctor is invalid against canonical inputs are FORBIDDEN

## PHASE 0 — PRECONDITIONS (MUST)
### 0.1 Repo state
- Worktree MUST be clean (`git status --porcelain` empty).
- `node scripts/doctor.mjs` MUST run deterministically (`DOCTOR_OK` or `DOCTOR_WARN` allowed in TRANSITIONAL).

### 0.2 Canon lock
- `docs/OPERATIONS/OPS-V12-GOVERNANCE-FROZEN.md` MUST exist.
- No edits to v1.2 FROZEN set are allowed (except Phase 2 atomic pack).

## PHASE 1 — CONTOUR-C SPECIFICATION (DOCS-ONLY)
### 1.1 Canonical scope
- `docs/OPS/CONTOUR-C-SCOPE.md` defines scope and OUT OF SCOPE.

### 1.2 Runtime boundary invariants (conceptual)
- `docs/OPS/OPS-CONTOUR-C-INVARIANTS.md` defines minimal declarative invariants for runtime causality and boundary.

### 1.3 Runtime vocabulary (exact terms)
- `docs/OPS/OPS-RUNTIME-GLOSSARY.md` defines canonical terms.

### 1.4 Runtime trace minimum canon
- `docs/OPS/OPS-RUNTIME-TRACE-MIN-CANON.md` defines minimal trace and diagnostics canon.

## PHASE 2 — OPS_CANON v1.3 BOOTSTRAP (OPS + SCRIPTS ONLY, ATOMIC)
This phase is REQUIRED before any registry/index/check updates for CONTOUR-C.

### 2.0 Canonical inputs set (v1.3) — MUST
All v1.3 canonical inputs MUST live under:
- `docs/OPS/**` (machine-readable JSON artifacts)
- `docs/OPERATIONS/**` (normative markdown views, when required)

They MUST be indexed by `docs/OPS/INVENTORY_INDEX.json` (v1.3).

### 2.1 New OPS artifacts (v1.3)
The v1.3 pack MUST introduce (as OPS inventories/specs):
- `docs/OPS/RUNTIME_QUEUE_INVENTORY.json`
- `docs/OPS/RUNTIME_EFFECTS_INVENTORY.json`
- `docs/OPS/RUNTIME_SIGNALS.json` (machine-readable mirror of runtime trace canon)
- `docs/OPS/CONTOUR-C-ENFORCEMENT.json` (initial enforcement and maturity plan per invariant)

### 2.2 Registry extension (v1.3)
The v1.3 pack MUST extend `docs/OPS/INVARIANTS_REGISTRY.json` with CONTOUR-C invariants:
- `introducedIn: "v1.3"`
- `maturity: placeholder` initially is allowed
- `enforcementMode: soft` initially

### 2.3 CheckId container update (v1.3)
The v1.3 pack MUST keep checkId resolvability consistent:
- any checkId referenced by `maturity=implemented` invariants MUST be resolvable via `docs/OPS/AUDIT_CHECKS.json`.

### 2.4 Inventory index update (v1.3)
The v1.3 pack MUST include all new inventories in `docs/OPS/INVENTORY_INDEX.json`.

### 2.5 Doctor bump (v1.3)
The v1.3 pack MUST update `scripts/doctor.mjs` to:
- `SUPPORTED_OPS_CANON_VERSION = "v1.3"`
- v1.3 canonical semantics for:
  - strict version compare
  - inventory emptiness enforcement
  - exact-match debt matching inputs
  - dangling checkId handling
  - coverage output

### 2.6 Atomicity rule (MUST)
Phase 2 MUST land as an atomic change-set: v1.3 canonical inputs and v1.3 doctor together.
Any PR that makes doctor invalid against canonical inputs is FORBIDDEN.

## DEBT MATCHING INPUTS (CANON) — MUST
Debt matching MUST use ONLY:
- `invariantIds` (exact invariantId string equality), and/or
- `artifactPaths` (exact repo-relative POSIX path equality).

Globs, prefixes, substrings, regex, and case-insensitive matching are FORBIDDEN.

If an invariant is downgraded by debt, the matching debt MUST include at least one evidence-bearing `artifactPaths` entry relevant to the violation.

## INVENTORY EMPTINESS RULES (CANON) — MUST
### Inventory classification (authoritative)
- An inventory file is any JSON file listed as an item in `docs/OPS/INVENTORY_INDEX.json`.

### Case rules (authoritative)
Case A — `allowEmpty=false`:
- inventory `items` MUST NOT be empty
- `declaredEmpty` MUST NOT exist

Case B — `allowEmpty=true` AND `requiresDeclaredEmpty=false`:
- inventory `items` is permitted to be empty without debt
- `declaredEmpty` MUST NOT exist, except for `docs/OPS/DEBT_REGISTRY.json` as defined below

Case C — `allowEmpty=true` AND `requiresDeclaredEmpty=true`:
- inventory `items` is permitted to be empty only if:
  - root contains `declaredEmpty: true`
  - there exists a matching active, non-expired debt where `artifactPaths` contains the inventory file path (exact match)

### Shape consistency (declaredEmpty)
- If `declaredEmpty: true` and `items.length > 0`: doctor MUST FAIL.
- If `declaredEmpty` exists and is not boolean: doctor MUST FAIL.

### Special-case: `docs/OPS/DEBT_REGISTRY.json`
- If `docs/OPS/DEBT_REGISTRY.json.items` is empty, root MUST contain `declaredEmpty: true`.
- No debt is required to justify `docs/OPS/DEBT_REGISTRY.json` emptiness.
- `declaredEmpty: true` means there are no active debts and downgrade via debt is impossible at that baseline.

### Index completeness rule
- Any OPS inventory JSON intended for doctor consumption MUST be present in `INVENTORY_INDEX.json`; otherwise doctor MUST emit WARN diagnostics and MUST NOT emit OK for that unmanaged inventory.

## PHASE 3 — DOCTOR CHECKS (SCRIPTS-ONLY)
### 3.1 Placeholder visibility (TRANSITIONAL)
- Active placeholder and no_source invariants MUST produce explicit WARN signals.
- DOCTOR_FAIL remains possible for governance violations (version mismatch, invalid shapes, hard invariant failures).

### 3.2 Effective enforcement function (MUST)
Doctor MUST compute an effective enforcement result per invariant based on:
- `effectiveMode` ceiling (TRANSITIONAL or STRICT)
- `enforcementMode` (off, soft, hard)
- `maturity` (implemented, placeholder, no_source)
- `introducedIn` gating by targetBaselineVersion
- `checkId` resolvability via `docs/OPS/AUDIT_CHECKS.json`
- exact-match debt coverage per `invariantIds` and `artifactPaths`

Active placeholder and active no_source invariants MUST never produce OK.

In TRANSITIONAL:
- debt downgrade of hard invariant failures is permitted only when `maturity=implemented`
- debt MUST NOT produce OK

In STRICT:
- hard invariant failures are always FAIL regardless of debt

### 3.3 Exit threshold for implemented checks
By CONTOUR-C exit, at least 3 runtime P0 invariants MUST be `maturity=implemented` and have resolvable checkId.

## PHASE 4 — RUNTIME CONTRACTS (SPLIT TASKS)
### 4.1 Docs-only contracts
Docs-only contracts MUST define:
- execution request and result shapes
- terminal statuses and error codes
- runtime trace shapes aligned with runtime trace minimum canon
- effect idempotency key requirement for non-idempotent effects

### 4.2 Src-only contracts
`src/contracts/runtime/*` MUST be mechanically aligned with docs contracts.
Divergence MUST be introduced via ADR and versioned.

## PHASE 5 — SRC RUNTIME IMPLEMENTATION (SRC-ONLY)
### 5.1 Execution queues
- One sequential execution stream per orderingKey.
- Parallelism across different orderingKey is allowed only if it does not violate single-writer assumptions.

### 5.2 Core ↔ Runtime boundary (clarification)
- Runtime MUST NOT implement domain policy.
- Runtime MUST NOT mutate domain state directly.
- Domain state changes MUST occur only via Core transitions invoked by runtime.
- Forbidden: bypass Core, concurrent apply of Core transitions for the same orderingKey, domain mutation outside Core boundaries.

### 5.3 Effect execution
- Effects MUST be invoked via platform ports (no direct domain policy).
- Non-idempotent effects MUST require idempotency keys.
- Effect attempts MUST be tracked and emitted as structured trace records.

### 5.4 Backpressure handling
- Overflow outcome MUST be explicit and deterministic.
- Silent drops MUST NOT exist.
- Overflow and reject MUST emit structured diagnostics.

## PHASE 6 — SELF-CHECK & EXIT (DOCS-ONLY)
### 6.1 Self-check (checkable)
The self-check artifact MUST define verifiable facts:
- which invariants are implemented (invariantId + checkId)
- which artifacts prove trace shapes and inventories
- locator for at least 1 execution-trace replay test (repo path evidence)

### 6.2 Exit marker (checkable)
Exit MUST be satisfied by checkable facts:
- OPS artifacts for C exist and are indexed
- registry contains C invariants with correct introducedIn
- doctor output confirms at least 3 implemented runtime P0 checks
- replay test locator exists in repo
- no-bypass-Core boundary rule is enforced or guarded with referenced evidence

## FINAL RULE
CONTOUR-C is considered ACTIVE only when:
- Phase 1 specs exist
- OPS_CANON v1.3 bootstrap landed (atomic)
- doctor observes C invariants (at least as placeholder)
- runtime work proceeds in isolated SRC-only tasks

No UI work is permitted before CONTOUR-C exit.

