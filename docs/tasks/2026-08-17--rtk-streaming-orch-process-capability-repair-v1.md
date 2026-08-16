TASK_ID: RTK_STREAMING_AND_ORCH_PROCESS_CAPABILITY_REPAIR_V1
MILESTONE: POST_R4_REQUIRED_TEST_INFRA_REPAIR
TYPE: OPS_WRITE
STATUS: AUTONOMOUS_WRITE_DELIVERY
CANON_VERSION: v3.13a-final
CHECKS_BASELINE_VERSION: v1.3
BINDING_BASE_SHA: 62df8ac34b2980a6f12934cafb4f5b478fef33d4
BINDING_BASE_TREE: 46cae5b878a6934c56917d213a341ec479ca50c9
DELIVERY_POLICY: COMMIT_REQUIRED_PUSH_REQUIRED_PR_REQUIRED_MERGE_REQUIRED
DESIGN_TOOL_ROUTER: NO_DESIGN_CONTRACT_CHANGE_BACKEND_TEST_INFRA_ONLY
GOVERNANCE_CHANGE_APPROVAL: OWNER_EXPLICIT_RTK_STREAMING_AND_PROCESS_CAPABILITY_REPAIR
DIFF_BUDGET: AT_MOST_10_ALLOWLISTED_FILES_AND_2600_CHANGED_LINES_WITHOUT_UNRELATED_FORMATTING_OR_REFACTOR

## MICRO_GOAL
Repair exactly one required-test-infrastructure contour: make the maintained RTK runner publish live TAP and progress heartbeats with hard wall and no-progress deadlines plus deterministic child and lease cleanup, and make the terminal orchestrator represent process-inspection capability explicitly so hidden or indeterminate PIDs cannot become a zero-survivor PASS.

## ARTIFACT
- docs/tasks/2026-08-17--rtk-streaming-orch-process-capability-repair-v1.md
- docs/OPS/RTK/YALKEN_R4_POSTMERGE_VERIFICATION_RECEIPT_V1.json
- docs/OPS/RTK/YALKEN_RTK_STREAMING_ORCH_PROCESS_CAPABILITY_REPAIR_V1_RECEIPT.json
- docs/OPS/RTK/RTK_TEST_GRAPH_CATALOG_V1.json
- docs/OPS/GOVERNANCE_APPROVALS/GOVERNANCE_CHANGE_APPROVALS.json
- scripts/run-rtk-tests.mjs
- scripts/ops/rtk-word-c5v2-terminal-orchestrator.mjs
- test/contracts/rtk-test-graph-catalog.contract.test.js
- test/contracts/rtk-word-c5v2-terminal-orchestrator.contract.test.js
- .github/workflows/rtk-required.yml

## ALLOWLIST
- docs/tasks/2026-08-17--rtk-streaming-orch-process-capability-repair-v1.md
- docs/OPS/RTK/YALKEN_R4_POSTMERGE_VERIFICATION_RECEIPT_V1.json
- docs/OPS/RTK/YALKEN_RTK_STREAMING_ORCH_PROCESS_CAPABILITY_REPAIR_V1_RECEIPT.json
- docs/OPS/RTK/RTK_TEST_GRAPH_CATALOG_V1.json
- docs/OPS/GOVERNANCE_APPROVALS/GOVERNANCE_CHANGE_APPROVALS.json
- scripts/run-rtk-tests.mjs
- scripts/ops/rtk-word-c5v2-terminal-orchestrator.mjs
- test/contracts/rtk-test-graph-catalog.contract.test.js
- test/contracts/rtk-word-c5v2-terminal-orchestrator.contract.test.js
- .github/workflows/rtk-required.yml

## DENYLIST
- active canon, CANON.md, COREX, BIBLE, CONTEXT, PROCESS, HANDOFF, architecture doctrine, status resolver, and canon replacement
- package.json, package-lock.json, pnpm-lock.yaml, pnpm-workspace.yaml, dependencies, runtime network, cloud, Google Drive, provider state, secrets, private documents, and user data
- product runtime, Product Core, Command Kernel, Design OS, renderer, persistence, project truth, shell state, HTML, CSS, visual tokens, and UI behavior
- new test registry, second process supervisor, synthetic success, aggregate exit-only success, silent capability fallback, skip, todo, zero-test acceptance, stale receipt, or self-PASS
- weakened deadlines, unbounded output retention, shell interpolation, PID reuse trust, path authority from child output, or cleanup success inferred from absence alone
- force-push, rebase, amend, stash, reset, checkout, clean, protection bypass, destructive cleanup outside an exact owned lease or process identity, or mutation of canonical checkout and unrelated worktrees
- unrelated R4 claim change, Desktop V1.1 canonization, next-contour mutation, capability promotion, release saturation, final program verdict, or scope expansion

## CONTRACT / SHAPES
### FEATURE_INTEGRATION_MANIFEST_V1
- featureId: rtk.streamingAndOrchProcessCapabilityRepair.v1
- featureVersion: 1
- integrationMode: EXISTING_SEAM
- materialization: EXISTING_SEAM
- productPlane: unchanged; no product data, Command, Query, Event, persistence, or runtime capability is added or changed
- interfacePlane: repository-local process execution and evidence publication only; no product surface or Design OS contribution
- domainOwner: maintained RTK graph runner, terminal orchestrator process supervisor, and required CI
- authoritativeData: current child spawn identity, streamed stdout and stderr bytes, TAP inventory, monotonic progress timestamps, deadline events, signal and exit facts, exact owned TMPDIR lease, verified process-inspection capability, survivor rows, and cleanup observations
- derivedData: transient progress heartbeat, bounded diagnostic tail, TAP verdict, process-capability verdict, timeout verdict, cleanup verdict, and exact-head receipt
- commandIds: NONE_BECAUSE_NO_PRODUCT_COMMAND_CHANGE
- eventTypes: RTK_GRAPH_STARTED, RTK_GRAPH_PROGRESS, RTK_GRAPH_TIMEOUT, RTK_GRAPH_EXITED, RTK_GRAPH_CLEANUP, ORCH_PROCESS_INSPECTION_PROBED, ORCH_PROCESS_SURVIVOR_OBSERVED
- queryIds: NONE_BECAUSE_NO_PRODUCT_QUERY_CHANGE
- effectIds: RTK_TEST_CHILD_PROCESS_EFFECT, RTK_OWNED_TMPDIR_EFFECT, ORCH_PROCESS_INSPECTION_EFFECT, ORCH_OWNED_PROCESS_TERMINATION_EFFECT
- productProjectionIds: NONE_BECAUSE_NO_PRODUCT_PROJECTION_CHANGE
- capabilityIds: OPS_PROCESS_INSPECTION_DESCENDANTS, OPS_PROCESS_INSPECTION_PROCESS_GROUP, OPS_PROCESS_INSPECTION_CWD
- authorityMap: child exit is only process evidence; strict TAP parser owns test admission; monotonic supervisor owns deadlines; exact lease owns filesystem cleanup; verified host-specific inspection strategies own zero-survivor evidence; required CI owns merge enforcement
- identityKeys: runner invocation id, child pid, process group id, process start identity, executable, cwd, owned lease realpath, stream sequence, monotonic progress timestamp, catalog file set, exact source SHA, and CI run identity
- processInspectionShape: each descendants, process-group, and cwd dimension reports AVAILABLE with a verified strategy and rows, DEGRADED with a verified complete alternate strategy, or INDETERMINATE with typed reasons; INDETERMINATE cannot certify zero survivors or cleanup
- processInspectionPolicy: normal host succeeds only with complete required coverage; hidden or denied PID visibility fails closed; duplicate or conflicting rows fail closed; PID identity is revalidated before signaling; empty rows without capability proof never mean PASS
- streamingPolicy: invoke Node with explicit TAP reporter, forward stdout and stderr chunks as received, emit a machine-readable start heartbeat immediately and a progress heartbeat at most every 15000 ms while alive, and retain only bounded diagnostic output sufficient for strict final TAP evaluation and typed failure evidence
- deadlinePolicy: production defaults are wall timeout 1800000 ms, no-progress timeout 300000 ms, TERM grace 5000 ms, and KILL grace 5000 ms; tests inject smaller deterministic values; deadline expiry must terminate the owned process group and wait for exit plus cleanup proof
- outputPolicy: backpressure is honored; stdout and stderr ordering is sequence-bound per stream; no chunk, heartbeat, timeout, signal, cleanup, or duplicate diagnostic is silently swallowed
- revisionPolicy: only the current invocation and exact source head can publish evidence; cached, prior-run, count-only, stale, skipped, self-authored, or different-head evidence cannot pass
- writePath: no product write; process supervisor publishes transient evidence and writes only the exact owned lease before deterministic removal
- readPath: child process events and host inspection adapters to validated transient observations to strict verdict to required CI and exact-head receipt
- requiredProductPorts: NONE_BECAUSE_TEST_INFRA_ONLY
- requiredDesignOsPorts: NONE_BECAUSE_NO_INTERFACE_PLANE_CHANGE
- adapterRequirements: existing Node child-process, filesystem, monotonic timer, ps, pgrep, lsof, and Linux proc seams only; no dependency addition
- surfaceManifests: NONE_BECAUSE_NO_SURFACE_CHANGE
- slotRequirements: NONE_BECAUSE_NO_SURFACE_CHANGE
- supportedWorkspaces: repository test execution on normal macOS host and required Ubuntu CI
- platformAvailability: host-specific verified alternates are allowed only when they completely cover the required dimension; unavailable, denied, malformed, ambiguous, or contradictory inspection remains INDETERMINATE and fails closed
- accessibilityRequirements: NONE_BECAUSE_NO_UI_CHANGE
- fallbacks: typed STOP with streamed diagnostics, bounded TERM then KILL, deterministic lease cleanup, and no PASS when TAP, deadline, inspection, exit, or cleanup evidence is incomplete
- stateClasses: all runner and inspection facts are transient repository evidence; project, authoring working, derived product, shell, and UI transient state remain unchanged
- persistenceClass: exact owned temporary lease only; no product storage, journal, migration, or durable runtime truth
- migrations: NONE_BECAUSE_NO_STORED_SCHEMA_CHANGE
- recovery: rerun the deterministic exact-head gate after all owned processes and lease residue are proven absent; stale output is never promoted
- rollback: revert this bounded commit before merge; after merge use one new explicit corrective contour
- performanceBudget: heartbeat latency at most 15000 ms, bounded output memory, no product hot-path work, and no material regression to the maintained RTK graph runtime
- securityBoundary: child output and host command output are untrusted until parsed and bounded; exact PID start identity, process group, cwd root, lease realpath, and no-follow cleanup are required before effects
- lifecycle: spawn exact catalog with explicit TAP, stream and heartbeat, enforce monotonic deadlines, revalidate identity, TERM then KILL owned group, await terminal state, inspect survivors with explicit capability, clean exact lease, parse complete TAP, and publish verdict
- negativeBypassChecks: normal host, hidden PID, denied inspection, malformed inspection, timeout, no-progress timeout, orphan, duplicate process row, PID reuse, cleanup failure, zero tests, skip, todo, malformed TAP, spawn error, and exit-zero-without-complete-evidence
- evidenceBindings: red-first focused contracts, normal-host integration, deterministic timeout and orphan fixtures, replay, stress, complete maintained RTK, strict governance, OSS policy, PR required CI, expected-head merge, and exact merged-head postmerge rerun
- currentReality: repairs only repository-local required-test execution and process-evidence truth; R4 scope and all product, provider, release, Desktop V1.1, and program-verdict claims remain unchanged

### PRECHECK_RECORD
- CHECK_01_PRE_EXACT_BASE_AND_CLEAN_ISOLATION: PASS at 62df8ac34b2980a6f12934cafb4f5b478fef33d4 tree 46cae5b878a6934c56917d213a341ec479ca50c9 in a fresh empty T7 technical worktree
- CHECK_02_PRE_CANON_RESOLUTION: PASS for active canon v3.13a-final, repository architecture doctrine, process contract, and exact affected code, tests, catalog, workflow, and evidence
- CHECK_03_PRE_R4_POSTMERGE: PASS for GitHub Actions run 31972356485, workflow rtk-required, conclusion success, event push, exact head 62df8ac34b2980a6f12934cafb4f5b478fef33d4, terminal completion 2026-08-16T21:19:15Z
- CHECK_04_PRE_FOCUSED_BASELINE: terminal orchestrator contract PASS 65 of 65 in 241275 ms; runner catalog contract on local Node 24.19.0 is 7 of 9 with exactly two reporter-format failures because the child runner does not select TAP explicitly; exact R4 Node 20 required CI is independently green
- T7_STORAGE: PASS for mounted writable APFS FileVault volume UUID D1F2E2C1-3210-4A39-A4E0-0AA0AD5110E2 immediately before the first task write
- CANONICAL_CHECKOUT: preserved without writes; startup-generated untracked pnpm lock and workspace files remain uncommitted and outside this contour

## IMPLEMENTATION_STEPS
0) Run OPS-GATE E0 on this artifact before code, contract, workflow, catalog, approval, or receipt edits.
1) Add focused red-first runner contracts for immediate stream visibility, periodic progress, explicit TAP selection, wall timeout, no-progress timeout, TERM-to-KILL escalation, orphan cleanup, bounded diagnostics, duplicate event rejection, and cleanup failure.
2) Add focused red-first orchestrator contracts for normal-host positive capability and hidden, denied, malformed, orphan, duplicate, conflicting, stale-identity, and timeout negatives; capture base-code RED before implementation.
3) Replace synchronous buffered RTK execution with one async streaming supervisor using existing Node APIs, injectable monotonic deadlines, explicit TAP, bounded retention, exact child identity, deterministic signal escalation, terminal wait, and owned lease cleanup.
4) Replace empty-array and null process-inspection fallbacks with explicit typed capability observations; require complete verified coverage before zero-survivor or cleanup PASS and preserve platform-specific alternate strategies only when complete.
5) Add a hard required-CI job deadline and bind the repaired truth plus exact R4 postmerge receipt in the maintained catalog without changing product or release claims.
6) Run focused, replay, stress, complete RTK, governance, policy, guardrail, and diff checks; update exact governed hashes and the repair receipt only from executed evidence.
7) Commit explicit scope, push, open draft PR, diagnose and correct only this contour's required CI, mark ready, merge only with expected head, fetch exact origin main, and rerun exact merged-head postmerge gates.

## CHECKS
CHECK_01_PRE_EXACT_BASE_AND_CLEAN_ISOLATION
CMD: verify task HEAD, origin main, tree, full non-shallow history, T7 identity, protected worktrees, and empty task status
PASS: task HEAD and origin main equal binding base, tree equals binding tree, T7 identity is exact, protected worktrees are unchanged, and task worktree was empty before this artifact

CHECK_02_PRE_CANON_RESOLUTION
CMD: run repository bootstrap and read resolved active canon, repository canon, COREX, BIBLE, architecture, glossary, documentation constitution, context, process, handoff, doctrine, declaration schema, affected code, tests, catalog, workflow, and evidence
PASS: one backend test-infrastructure repair is admitted with no product, UI, dependency, provider, release-claim, or next-contour mutation

CHECK_03_PRE_R4_POSTMERGE
CMD: inspect GitHub Actions run 31972356485 and PR 1573 identities
PASS: exact R4 merge SHA and terminal successful postmerge required run are independently bound before this contour

CHECK_04_PRE_FOCUSED_BASELINE
CMD: execute both affected contract files on the unchanged binding base and capture runtime identity plus terminal summary
PASS: orchestrator baseline is green; the explicit local Node 24 reporter mismatch is recorded as pre-existing contour evidence and is not represented as a product regression

CHECK_05_PRE_OPS_GATE
CMD: node scripts/ops-gate.mjs --task docs/tasks/2026-08-17--rtk-streaming-orch-process-capability-repair-v1.md
PASS: exit 0 before code, contract, workflow, catalog, approval, or receipt edits

CHECK_06_POST_RED_FIRST
CMD: run the new focused regression selections against unchanged base behavior before implementation
PASS: streamed progress, deadline cleanup, and hidden-process capability tests fail for the predicted reasons with no unrelated failure

CHECK_07_POST_FOCUSED
CMD: run the complete runner catalog and terminal orchestrator contract files after implementation
PASS: normal host, hidden PID, denied and malformed inspection, wall and no-progress timeout, orphan, duplicate, stale identity, TAP, streaming, heartbeat, deterministic cleanup, and strict false-green negatives pass with zero skip and zero todo

CHECK_08_POST_REPLAY_AND_STRESS
CMD: replay focused contracts at least twice and execute deterministic reduced-deadline stress iterations
PASS: every iteration terminates, emits progress, leaves zero owned processes and lease residue under proven inspection capability, and preserves stable typed outcomes

CHECK_09_POST_MAINTAINED_RTK
CMD: node scripts/run-rtk-tests.mjs
PASS: complete maintained catalog emits live TAP and heartbeat, terminates within hard deadlines, reports nonzero tests with zero fail, cancelled, skipped, and todo, proves cleanup, and exits 0

CHECK_10_POST_GOVERNANCE_AND_POLICY
CMD: run governance change detection with exact approvals, strict OPS, OSS policy, agent guardrails, diff check, allowlist check, and dependency-delta check
PASS: every mandatory command exits 0, exact governed hashes match, no dependency or scope drift exists, and no stale, skipped, or self-authored evidence is promoted

CHECK_11_POST_REQUIRED_CI_AND_DELIVERY
CMD: clean commit, push, draft PR, required CI, ready transition, expected-head normal merge, fetch origin main, exact-head verification, postmerge required CI, and exact merged-head relevant gates
PASS: all delivery flags complete without bypass, merge consumes the expected PR head, origin main contains the exact contour, and postmerge evidence binds the exact merged SHA and tree

## STOP_CONDITION
- Stop with STOP_NOT_DONE on canon contradiction, wrong base or tree, T7 identity mismatch, protected or canonical checkout mutation, dependency addition, product or UI change, output or process identity ambiguity, incomplete inspection capability, unowned target, survivor, cleanup residue, reduced deadline, skip, todo, zero-test result, stale evidence, unrepairable base drift, failed required gate, or delivery step that cannot complete normally.
- Stop with STOP_NOT_DONE rather than accepting absence as process proof, exit zero as test proof, a hidden PID as no PID, an empty process list without capability, aggregate counts without TAP inventory, a timeout without terminal cleanup, a fixture-only success, or self-certification.
- On success stop this contour only after exact merged-head postmerge gates and then re-resolve current main, active canon, and Desktop V1.1 DAG before selecting exactly one next bounded contour.

## REPORT_FORMAT
- TASK_ID
- HEAD_SHA_BEFORE
- HEAD_SHA_AFTER
- MERGED_SHA
- MERGED_TREE
- COMMIT_SHA
- CHANGED_BASENAMES
- STAGED_SCOPE_MATCH
- COMMIT_OUTCOME
- PUSH_RESULT
- PR_RESULT
- CI_RESULT
- MERGE_RESULT
- POSTMERGE_RESULT
- DESIGN_TOOL_ROUTER
- CHECKS_RESULT
- INVARIANTS_RESULT
- RESIDUAL_RISK
- NEXT_STEP

## FAIL_PROTOCOL
- Preserve all scoped work and exact terminal evidence; report the typed blocker, expected observation, actual observation, exact head, runtime, seed or deadline values, and one next hypothesis.
- Do not reset, stash, clean, checkout, rebase, amend, force-push, bypass protection, kill an unverified process identity, remove a non-owned path, mutate canonical or unrelated worktrees, or silently relax tests, deadlines, process capability, TAP, cleanup, CI, or delivery.
- After three repetitions of the same failure signature stop the loop; do not widen product, UI, dependency, network, provider, R4, Desktop V1.1, release, program-verdict, or next-contour scope.
