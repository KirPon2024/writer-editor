TASK_ID: YALKEN_ATLAS_V6_A3_BOUNDED_REPAIR
MILESTONE: ATLAS_V6_A3_INDEPENDENT_AUDIT_REPAIR
TYPE: CORE
STATUS: AUTONOMOUS_WRITE_DELIVERY
CANON_VERSION: v3.13a-final
CHECKS_BASELINE_VERSION: v1.3
EXACT_AUDITED_BASE: 45be0d254160d7ed85ce8717c8851909458d8739
DELIVERY_POLICY: COMMIT_REQUIRED_PUSH_REQUIRED_PR_REQUIRED_MERGE_REQUIRED
DESIGN_TOOL_ROUTER: NO_DESIGN_CONTRACT_CHANGE_BACKEND_PERSISTENCE_ONLY
GOVERNANCE_CHANGE_APPROVAL: OWNER_EXPLICIT_A3_REPAIR_AND_PRODUCTION_NEGATIVE_REQUIREMENT

## MICRO_GOAL
Close only the independently confirmed Atlas A3 HOLD findings: preserve exclusive Stage-10 authority across slow durable writes with monotonic fencing, and replace lossy project-id path aliases with an injective reversible binding plus atomic collision-aware legacy migration.

## ARTIFACT
- docs/tasks/YALKEN_ATLAS_V6_A3_BOUNDED_REPAIR.md
- docs/OPS/GOVERNANCE_APPROVALS/GOVERNANCE_CHANGE_APPROVALS.json
- package.json
- scripts/ops/sector-m-scope-map.json
- scripts/ops/yalken-atlas-v6-production-lifecycle.mjs
- src/product/stage10ProjectIdentityKey.mjs
- src/product/projectLease.mjs
- src/product/stage10MainPersistenceAdapter.mjs
- test/contracts/yalken-atlas-v6-a3-bounded-repair.contract.test.js
- test/contracts/yalken-atlas-v6-production-negative.contract.test.js
- test/contracts/yalken-atlas-v5-stage10-pr1391-audit-repair.contract.test.js

## ALLOWLIST
- docs/tasks/YALKEN_ATLAS_V6_A3_BOUNDED_REPAIR.md
- docs/OPS/GOVERNANCE_APPROVALS/GOVERNANCE_CHANGE_APPROVALS.json
- package.json
- scripts/ops/sector-m-scope-map.json
- scripts/ops/yalken-atlas-v6-production-lifecycle.mjs
- src/product/stage10ProjectIdentityKey.mjs
- src/product/projectLease.mjs
- src/product/stage10MainPersistenceAdapter.mjs
- test/contracts/yalken-atlas-v6-a3-bounded-repair.contract.test.js
- test/contracts/yalken-atlas-v6-production-negative.contract.test.js
- test/contracts/yalken-atlas-v5-stage10-pr1391-audit-repair.contract.test.js

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
- featureId: atlas.stage10.a3FencedPersistenceAndProjectIdentity
- featureVersion: 1
- integrationMode: EXISTING_SEAM
- domainOwner: Stage-10 Product Core and main-owned persistence adapter
- authoritativeData: canonical project truth, session, authority store, integrity anchor, pending transaction, and recovery snapshot
- derivedData: lease diagnostics and migration diagnostics only
- commandIds: unchanged existing Stage-10 Command Kernel catalog
- eventTypes: unchanged immutable command and domain event history
- queryIds: unchanged Stage-10 revision-bound projections
- productProjectionIds: unchanged selected-project and replay projections
- capabilityIds: unchanged node-local Stage-10 persistence capabilities
- authorityMap: Product Core owns truth; Command Kernel owns mutation admission; main persistence adapter owns filesystem effects; Design OS is not changed
- identityKeys: original projectId, reversible v2 path key, lifecycleId, current revision, authority head digest, lease owner token digest, and monotonic fencing generation
- revisionPolicy: lock-held revision and authority CAS plus fence validation before and after every durable publication
- writePath: existing command intent to Command Kernel to Stage-10 transaction to main-owned lease to fenced atomic writes to readback to recovery and publication
- readPath: existing main-owned bundle read and validated replay path
- requiredProductPorts: existing Stage-10 persistence port, project lease manager, atomic writer, and recovery validator
- requiredDesignOsPorts: NONE_BECAUSE_NO_INTERFACE_PLANE_CHANGE
- adapterRequirements: main-owned local filesystem only; PID liveness and durable fence record remain infrastructure details
- surfaceManifests: NONE_BECAUSE_NO_SURFACE_CHANGE
- slotRequirements: NONE_BECAUSE_NO_SURFACE_CHANGE
- supportedWorkspaces: existing selected local project only
- platformAvailability: current node desktop adapter only
- accessibilityRequirements: NONE_BECAUSE_NO_UI_CHANGE
- fallbacks: malformed identity, ambiguous legacy root, active legacy lease, stale fence, collision, and lost ownership fail closed with typed errors
- stateClasses: project truth remains authoritative; lease and fence are infrastructure coordination; recovery remains integrity-bound project safety evidence
- persistenceClass: project files and Stage-10 state remain canonical; fence record coordinates writers and is not a journal or product truth
- migrations: reversible v2 key is domain-separated from accepted project IDs; matching legacy roots move atomically; different identity roots never move; duplicate or ambiguous roots fail closed
- recovery: prior-generation pending transactions are recovered only by a currently fenced holder; delayed writes and killpoints converge through the existing transaction
- rollback: revert this bounded commit series before merge; after merge use a new explicit corrective contour without rewriting project truth
- performanceBudget: heartbeat and fencing checks are bounded to transaction paths and never enter typing hot path
- securityBoundary: original projectId is validated before path derivation; path key is injective; no renderer path or token authority
- lifecycle: acquire, heartbeat, fenced publications, recovery, finalize, release
- negativeBypassChecks: alias collision, active-holder expiry reclaim, stale-holder publication, stale fence, delayed atomic rename, readback delay, and crash recovery
- evidenceBindings: focused contracts, two-process product negatives, strict ops, doctrine, OSS, maintained RTK and Atlas graphs, renderer build, promotion, Electron, and affected packaged lifecycle
- currentReality: repairs exactly one P1 lease finding and one P2 project-id binding finding; no broader Atlas acceptance claim

### PRECHECK_RECORD
- CHECK_01_PRE_EXACT_BASE_AND_CLEAN_ISOLATION: PASS at 45be0d254160d7ed85ce8717c8851909458d8739 with empty task worktree
- CHECK_02_PRE_CANON_RESOLUTION: PASS for v3.13a-final and active Atlas plus Word extensions
- CHECK_03_PRE_FOCUSED_BASELINE: PASS with Atlas event contract 66 of 66 and Atlas release truth 20 of 20
- T7_STORAGE: PASS for writable APFS FileVault volume UUID D1F2E2C1-3210-4A39-A4E0-0AA0AD5110E2
- PRESERVATION_RECEIPTS: old R1-C HEAD and diff hash captured; active Word C5V2 HEAD and clean status captured

## IMPLEMENTATION_STEPS
0) Run OPS-GATE E0 on this artifact before production edits.
1) Add one pure Stage-10 project identity key module with strict validation, reversible domain-separated encoding, and legacy-key evidence helpers.
2) Upgrade the main-owned lease to a monotonic durable fencing generation, owner-token digest, PID-liveness-aware expiry, heartbeat, and fenced publication API.
3) Resolve legacy anchor roots before lease acquisition; atomically migrate only roots whose embedded immutable project identity matches, and fail closed on active, ambiguous, conflicting, or duplicate roots.
4) Bind pending transactions to fencing generation and owner proof while preserving legacy transaction recovery.
5) Fence project truth, external artifact, authority, session, anchor, recovery, readback-finalization, and transaction removal across the complete Stage-10 transaction.
6) Add decisive same-process and two-process tests for slow writes, contender denial, genuine ownership loss, injective IDs, migration collision handling, delayed rename and readback, and crash convergence.
7) Add the focused contract to maintained Atlas and required CI entrypoints without adding dependencies or claims.
8) Run all required checks, commit promptly, push, open PR, wait for required CI, merge normally, verify exact merged head, and clean only this task worktree and refs.

## CHECKS
CHECK_01_PRE_EXACT_BASE_AND_CLEAN_ISOLATION
CMD: git rev-parse HEAD and git rev-parse origin/main and git status --porcelain --untracked-files=all
PASS: both SHAs equal 45be0d254160d7ed85ce8717c8851909458d8739 and task worktree is clean before this artifact

CHECK_02_PRE_CANON_RESOLUTION
CMD: validate CANON_STATUS active document and feature extensions
PASS: active canon v3.13a-final resolves and both Atlas and Word extensions are present

CHECK_03_PRE_FOCUSED_BASELINE
CMD: npm run test:atlas-event-contract and npm run test:atlas-release-truth
PASS: baseline is recorded without treating existing green as repaired capability

CHECK_04_PRE_OPS_GATE
CMD: node scripts/ops-gate.mjs --task docs/tasks/YALKEN_ATLAS_V6_A3_BOUNDED_REPAIR.md
PASS: exit 0 before product code edits

CHECK_05_POST_ALLOWED_DELTA_ONLY
CMD: verify every changed path belongs to ALLOWLIST
PASS: no unrelated delta exists

CHECK_06_POST_FOCUSED_A3
CMD: node --test test/contracts/yalken-atlas-v6-a3-bounded-repair.contract.test.js and node --test test/contracts/yalken-atlas-v6-production-negative.contract.test.js
PASS: injective identity, two-process fencing, delayed I O, stale ownership, and crash recovery positives and negatives pass

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
- Stop with STOP_NOT_DONE on canon contradiction, wrong T7 identity, protected worktree mutation, dependency addition, UI expansion, second truth, non-injective binding, unfenced publication, unrepairable merge-base drift, failed required check, or required delivery step that cannot complete normally.
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
