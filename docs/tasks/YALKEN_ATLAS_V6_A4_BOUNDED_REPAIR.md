TASK_ID: YALKEN_ATLAS_V6_A4_BOUNDED_REPAIR
MILESTONE: ATLAS_V6_A4_INDEPENDENT_AUDIT_REPAIR
TYPE: CORE
STATUS: AUTONOMOUS_WRITE_DELIVERY
CANON_VERSION: v3.13a-final
CHECKS_BASELINE_VERSION: v1.3
EXACT_AUDITED_BASE: 671015c1e00ff852f76731c2b5f881a085041455
DELIVERY_POLICY: COMMIT_REQUIRED_PUSH_REQUIRED_PR_REQUIRED_MERGE_REQUIRED
DESIGN_TOOL_ROUTER: NO_DESIGN_CONTRACT_CHANGE_BACKEND_PERSISTENCE_ONLY
GOVERNANCE_CHANGE_APPROVAL: OWNER_EXPLICIT_A4_REPAIR_AND_PRODUCTION_NEGATIVE_REQUIREMENT

## MICRO_GOAL
Close only the independently confirmed Atlas A4 HOLD findings: make every main-owned project-manifest publication participate in one lock-held CAS authority, make external JSON and SVG publication reserve the exact target without overwriting concurrent bytes, admit the full valid Unicode project-id domain with injective path binding, fail closed on foreign legacy aliases, and bind lease liveness to the current process instance rather than a reusable PID.

## ARTIFACT
- docs/tasks/YALKEN_ATLAS_V6_A4_BOUNDED_REPAIR.md
- docs/OPS/GOVERNANCE_APPROVALS/GOVERNANCE_CHANGE_APPROVALS.json
- package.json
- scripts/ops/sector-m-scope-map.json
- scripts/ops/yalken-atlas-v6-production-lifecycle.mjs
- src/main.js
- src/product/mainProjectManifestAuthority.mjs
- src/product/projectIdDomain.cjs
- src/product/projectLease.mjs
- src/product/projectLeaseHeartbeatWorker.mjs
- src/product/stage10CommandReceiptAuthorityHead.mjs
- src/product/stage10MainPersistenceAdapter.mjs
- src/product/stage10ProjectIdentityKey.mjs
- test/contracts/yalken-atlas-v6-a4-bounded-repair.contract.test.js
- test/contracts/yalken-atlas-v6-a3-bounded-repair.contract.test.js
- test/contracts/yalken-atlas-v6-production-negative.contract.test.js
- test/unit/sector-m-s38-pro-free-pro-roundtrip.test.js

## ALLOWLIST
- docs/tasks/YALKEN_ATLAS_V6_A4_BOUNDED_REPAIR.md
- docs/OPS/GOVERNANCE_APPROVALS/GOVERNANCE_CHANGE_APPROVALS.json
- package.json
- scripts/ops/sector-m-scope-map.json
- scripts/ops/yalken-atlas-v6-production-lifecycle.mjs
- src/main.js
- src/product/mainProjectManifestAuthority.mjs
- src/product/projectIdDomain.cjs
- src/product/projectLease.mjs
- src/product/projectLeaseHeartbeatWorker.mjs
- src/product/stage10CommandReceiptAuthorityHead.mjs
- src/product/stage10MainPersistenceAdapter.mjs
- src/product/stage10ProjectIdentityKey.mjs
- test/contracts/yalken-atlas-v6-a4-bounded-repair.contract.test.js
- test/contracts/yalken-atlas-v6-a3-bounded-repair.contract.test.js
- test/contracts/yalken-atlas-v6-production-negative.contract.test.js
- test/unit/sector-m-s38-pro-free-pro-roundtrip.test.js

## DENYLIST
- CANON.md, active canon, COREX, BIBLE, CONTEXT, PROCESS, HANDOFF, and canon replacement
- renderer, HTML, CSS, visual tokens, layouts, and UI behavior
- product network, cloud, account, authentication, secret, payment, or production impact
- new dependencies, second journal, second truth, renderer-owned persistence, or direct reducer mutation
- force-push, rebase, amend, stash, reset, checkout, clean, protection bypass, or irreversible deletion
- mutation of owner checkout, active Word C5V2 worktree, or frozen old R1-C checkpoint
- unrelated Atlas expansion, fixture-only promotion, or self-PASS

## CONTRACT / SHAPES
### FEATURE_INTEGRATION_MANIFEST_V1
- featureId: atlas.stage10.a4AtomicCasUnicodeAndProcessInstanceLease
- featureVersion: 1
- integrationMode: EXISTING_SEAM
- domainOwner: Stage-10 Product Core and main-owned persistence adapter
- authoritativeData: canonical project manifest, Stage-10 session, authority store, integrity anchor, pending transaction, recovery snapshot, and accepted external artifact bytes
- derivedData: lease heartbeat, fencing, reservation, migration, and conflict diagnostics only
- commandIds: unchanged existing Stage-10 Command Kernel catalog
- eventTypes: unchanged immutable command and domain event history
- queryIds: unchanged Stage-10 revision-bound projections
- productProjectionIds: unchanged selected-project and replay projections
- capabilityIds: unchanged node-local Stage-10 persistence capabilities
- authorityMap: Product Core owns truth; Command Kernel owns mutation admission; main process owns one filesystem transaction authority; Design OS is unchanged
- identityKeys: original Unicode projectId, reversible v2 path key, lifecycleId, current revision, authority head digest, process-instance owner token digest, and monotonic fencing generation
- revisionPolicy: lock-held exact-source-byte CAS and authority CAS before durable publication; every post-reservation publication is fenced
- writePath: existing command intent to Command Kernel to Stage-10 transaction to main-owned lease to reserved CAS publication to fsync and readback to recovery and final publication
- readPath: existing main-owned bundle and manifest reads followed by validated replay
- requiredProductPorts: existing Stage-10 persistence port, shared project-manifest authority, project lease manager, atomic writer, and recovery validator
- requiredDesignOsPorts: NONE_BECAUSE_NO_INTERFACE_PLANE_CHANGE
- adapterRequirements: local filesystem only; process-instance heartbeat, target reservation, and fence records are coordination data, not author truth
- surfaceManifests: NONE_BECAUSE_NO_SURFACE_CHANGE
- slotRequirements: NONE_BECAUSE_NO_SURFACE_CHANGE
- supportedWorkspaces: existing selected local project only
- platformAvailability: current node desktop adapter only
- accessibilityRequirements: NONE_BECAUSE_NO_UI_CHANGE
- fallbacks: stale manifest bytes, external target drift, malformed Unicode, alias collision, duplicate roots, expired heartbeat, stale generation, and lost ownership fail closed with typed errors
- stateClasses: manifest and Stage-10 project data remain authoritative; leases, reservations, and fences are infrastructure coordination; recovery remains integrity-bound project safety evidence
- persistenceClass: no new journal or truth; the existing pending Stage-10 transaction binds artifact reservation and recovery phases
- migrations: existing ASCII v2 keys stay byte-compatible; accepted Unicode uses the same reversible encoding; matching legacy roots move atomically while foreign occupancy fails before canonical lineage creation
- recovery: current fenced holder reconciles the existing transaction, reserved target, prior bytes, and intended bytes deterministically before publication
- rollback: revert this bounded commit series before merge; after merge use a new explicit corrective contour without rewriting project truth
- performanceBudget: heartbeat worker and CAS checks are bounded to persistence paths and never enter the typing hot path
- securityBoundary: validated project identity precedes path derivation; reservation paths remain sibling-local; no renderer path or token authority
- lifecycle: validate, acquire, heartbeat, compare, reserve, publish, fsync, readback, recover, finalize, release
- negativeBypassChecks: manifest precheck race, absent and existing artifact race, delayed rename, crash recovery, composed and decomposed Unicode, foreign alias in both creation orders, PID reuse, blocked event loop, clock edge, stale-holder publication, and fencing recovery
- evidenceBindings: focused contracts, child-process production negatives, strict ops, doctrine, OSS, maintained RTK and Atlas graphs, renderer build, promotion, Electron, and affected packaged lifecycle
- currentReality: repairs exactly the five A4 findings; no broader Atlas acceptance claim

### PRECHECK_RECORD
- CHECK_01_PRE_EXACT_BASE_AND_CLEAN_ISOLATION: PASS at 671015c1e00ff852f76731c2b5f881a085041455 with empty task worktree
- CHECK_02_PRE_CANON_RESOLUTION: PASS for v3.13a-final and active Atlas plus Word extensions
- CHECK_03_PRE_FOCUSED_BASELINE: PASS with Atlas event contract 70 of 70 and Atlas release truth 24 of 24
- CONTROLLER_RUNTIME_AUTHORITY: exact 671015c1 disposable harness exited 0; evidence archive SHA256 750d17750e58702434578595ddddb2032955a9f7427bdf6f456a3655594b1bb8 and independently reproduced all five bounded findings
- T7_STORAGE: PASS for writable APFS FileVault volume UUID D1F2E2C1-3210-4A39-A4E0-0AA0AD5110E2
- PRESERVATION_RECEIPTS: frozen R1-C HEAD and diff hash captured; active Word C5V2 HEAD and clean status captured; owner checkout status and tracked diff hashes captured

## IMPLEMENTATION_STEPS
0) Run OPS-GATE E0 on this artifact before production edits.
1) Centralize project-id admission and preserve the valid Unicode domain without normalization or path aliasing.
2) Fail closed when a foreign project occupies the requested legacy key before any canonical root is created or migrated.
3) replace PID liveness with a process-instance heartbeat that survives a blocked main event loop, expires after crash, and uses a monotonic clock.
4) Route every main-owned project-manifest writer through the shared Stage-10 lease plus exact source-byte CAS, durable write, readback, and typed conflict boundary.
5) Bind external-artifact reservation, prior bytes, intended bytes, publication, fsync, readback, rollback, crash reconciliation, and cleanup to the existing pending transaction and fence generation.
6) Add decisive same-process and child-process tests for the two races, Unicode parity, legacy collision orders, PID reuse, slow writes, stale ownership, interruption, and deterministic recovery.
7) Add the focused contract to maintained Atlas and required CI entrypoints without dependencies or capability claims.
8) Run all required checks, commit promptly, push, open PR, wait for required CI, merge normally, verify exact merged head, and remove only this task worktree and branch when safe.

## CHECKS
CHECK_01_PRE_EXACT_BASE_AND_CLEAN_ISOLATION
CMD: git rev-parse HEAD and git rev-parse origin/main and git status --porcelain --untracked-files=all
PASS: both SHAs equal 671015c1e00ff852f76731c2b5f881a085041455 and task worktree is clean before this artifact

CHECK_02_PRE_CANON_RESOLUTION
CMD: validate CANON_STATUS active document and feature extensions
PASS: active canon v3.13a-final resolves and both Atlas and Word extensions are present

CHECK_03_PRE_FOCUSED_BASELINE
CMD: npm run test:atlas-event-contract and npm run test:atlas-release-truth
PASS: baseline is recorded without treating existing green as repaired capability

CHECK_04_PRE_OPS_GATE
CMD: node scripts/ops-gate.mjs --task docs/tasks/YALKEN_ATLAS_V6_A4_BOUNDED_REPAIR.md
PASS: exit 0 before product code edits

CHECK_05_POST_ALLOWED_DELTA_ONLY
CMD: verify every changed path belongs to ALLOWLIST
PASS: no unrelated delta exists

CHECK_06_POST_FOCUSED_A4
CMD: node --test test/contracts/yalken-atlas-v6-a4-bounded-repair.contract.test.js and maintained A3 plus production negative contracts
PASS: manifest and artifact races, Unicode parity, legacy collisions, process-instance liveness, stale ownership, and recovery positives and negatives pass

CHECK_07_POST_ATLAS_PRODUCT
CMD: npm run test:atlas-event-contract and npm run test:atlas-release-truth and node scripts/ops/yalken-atlas-v6-production-lifecycle.mjs --negative-matrix
PASS: focused Atlas maintained graphs and production negative matrix pass

CHECK_08_POST_STRICT_GOVERNANCE
CMD: GOVERNANCE_CHANGE_APPROVED=1 npm run test:ops and npm run design-os:doctrine and npm run oss:policy and npm run build:renderer
PASS: all commands exit 0

CHECK_09_POST_MAINTAINED_PRODUCT
CMD: npm run test:rtk and npm run test:atlas-graph and npm run test:performance
PASS: maintained RTK, Atlas graph, and performance checks pass

CHECK_10_POST_PROMOTION_AND_PACKAGED
CMD: npm run promotion:check and npm run test:electron and affected packaged Stage-10 lifecycle
PASS: promotion and production-equivalent packaged lifecycle remain green

CHECK_11_POST_DELIVERY
CMD: clean commit, push, PR checks, merge, fetch origin main, and exact-tree verification
PASS: all delivery flags complete without bypass and merged head contains the task commit

## STOP_CONDITION
- Stop with STOP_NOT_DONE on canon contradiction, wrong T7 identity, protected worktree mutation, dependency addition, UI expansion, second truth, lossy identity, unfenced publication, unpreserved concurrent bytes, unrepairable merge-base drift, failed required check, or required delivery step that cannot complete normally.
- Stop with STOP_NOT_DONE rather than bypassing branch protection, CI, capability admission, lease ownership, recovery, or exact-head verification.
- On success stop only at READY_FOR_FRESH_INDEPENDENT_EXACT_HEAD_AUDIT with no self-PASS.

## REPORT_FORMAT
- TASK_ID
- HEAD_SHA_BEFORE
- HEAD_SHA_AFTER
- COMMIT_SHA
- CHANGED_BASENAMES
- STAGED_SCOPE_MATCH
- COMMIT_OUTCOME
- PUSH_RESULT
- PR_RESULT
- MERGE_RESULT
- DESIGN_TOOL_ROUTER
- CHECKS_RESULT
- INVARIANTS_RESULT
- NEXT_STEP

## FAIL_PROTOCOL
- Preserve scoped work and report the exact typed blocker.
- Do not reset, stash, clean, checkout, rebase, amend, force-push, mutate protected worktrees, or modify owner checkout files.
- Do not widen Atlas scope, interface scope, dependencies, network scope, or delivery authority.
- Do not claim PASS; the next authority is a fresh independent exact-head audit.
