TASK_ID: YALKEN_ATLAS_V6_A7_FALSE_GREEN_BOUNDED_REPAIR
MILESTONE: ATLAS_V6_A7_INDEPENDENT_AUDIT_REPAIR
TYPE: OPS_WRITE
STATUS: AUTONOMOUS_WRITE_DELIVERY
CANON_VERSION: v3.13a-final
CHECKS_BASELINE_VERSION: v1.3
BINDING_BASE_SHA: 197fb1ca84e344f8c22885deb5cb78c058923e43
DELIVERY_POLICY: COMMIT_REQUIRED_PUSH_REQUIRED_PR_REQUIRED_MERGE_REQUIRED
DESIGN_TOOL_ROUTER: NO_DESIGN_CONTRACT_CHANGE_BACKEND_RELEASE_EVIDENCE_ONLY
GOVERNANCE_CHANGE_APPROVAL: OWNER_EXPLICIT_A7_FALSE_GREEN_REPAIR

## MICRO_GOAL
Close only the independently confirmed Atlas A7 false-green: replace aggregate child-exit certification with strict named test evidence for every one of the 17 production-negative matrix rows, and make required CI independently execute the coverage guard.

## ARTIFACT
- docs/tasks/YALKEN_ATLAS_V6_A7_FALSE_GREEN_BOUNDED_REPAIR.md
- docs/OPS/GOVERNANCE_APPROVALS/GOVERNANCE_CHANGE_APPROVALS.json
- .github/workflows/rtk-required.yml
- package.json
- scripts/ops/sector-m-scope-map.json
- scripts/ops/yalken-atlas-v6-production-lifecycle.mjs
- test/contracts/yalken-atlas-v6-a7-false-green-bounded-repair.contract.test.js

## ALLOWLIST
- docs/tasks/YALKEN_ATLAS_V6_A7_FALSE_GREEN_BOUNDED_REPAIR.md
- docs/OPS/GOVERNANCE_APPROVALS/GOVERNANCE_CHANGE_APPROVALS.json
- .github/workflows/rtk-required.yml
- package.json
- scripts/ops/sector-m-scope-map.json
- scripts/ops/yalken-atlas-v6-production-lifecycle.mjs
- test/contracts/yalken-atlas-v6-a7-false-green-bounded-repair.contract.test.js

## DENYLIST
- CANON.md, active canon, COREX, BIBLE, CONTEXT, PROCESS, HANDOFF, and canon replacement
- product runtime semantics, project truth, Command Kernel behavior, persistence, recovery, renderer, HTML, CSS, visual tokens, layouts, and UI behavior
- product network, cloud, account, authentication, secret, payment, or production impact
- new dependencies, second test registry, second truth, fixture-only certification, or aggregate exit-code certification
- reduced test or performance thresholds, skipped tests, malformed report acceptance, or source-only acceptance
- force-push, rebase, amend, stash, reset, checkout, clean, protection bypass, or irreversible deletion
- mutation of owner checkout, active Word C5V2 worktree, Word N4 worktree, or frozen old R1-C checkpoint
- unrelated Atlas expansion, capability promotion, program completion claim, or self-PASS

## CONTRACT / SHAPES
### FEATURE_INTEGRATION_MANIFEST_V1
- featureId: atlas.v6.a7ProductionNegativeEvidenceBinding
- featureVersion: 1
- integrationMode: EXISTING_SEAM
- domainOwner: Atlas release validation and required CI
- authoritativeData: fresh child test results, exact named top-level assertions, strict TAP counts, and the fixed 17-row evidence map
- derivedData: per-row executed and pass verdicts plus aggregate coverage diagnostics
- commandIds: NONE_BECAUSE_NO_PRODUCT_COMMAND_CHANGE
- eventTypes: NONE_BECAUSE_NO_PRODUCT_EVENT_CHANGE
- queryIds: NONE_BECAUSE_NO_PRODUCT_QUERY_CHANGE
- productProjectionIds: NONE_BECAUSE_NO_PRODUCT_PROJECTION_CHANGE
- capabilityIds: NONE_BECAUSE_NO_CAPABILITY_CHANGE
- authorityMap: node test runner owns execution facts; strict parser owns report admission; fixed evidence map owns row coverage; required CI owns merge enforcement
- identityKeys: matrix row id, exact test name, sequential TAP test number, source file list, child exit code, and report schema
- revisionPolicy: only current invocation output is accepted; no receipt, cache, prior SHA, aggregate exit code, or caller-supplied pass flag can certify a row
- writePath: no product write; required CI invokes focused guard and production matrix commands
- readPath: child process output to strict TAP parser to named evidence lookup to per-row verdict to aggregate report
- requiredProductPorts: NONE_BECAUSE_RELEASE_EVIDENCE_ONLY
- requiredDesignOsPorts: NONE_BECAUSE_NO_INTERFACE_PLANE_CHANGE
- adapterRequirements: existing local Node test runner only
- surfaceManifests: NONE_BECAUSE_NO_SURFACE_CHANGE
- slotRequirements: NONE_BECAUSE_NO_SURFACE_CHANGE
- supportedWorkspaces: repository test execution only
- platformAvailability: local Node and required Ubuntu CI; existing runtime parity jobs remain unchanged
- accessibilityRequirements: NONE_BECAUSE_NO_UI_CHANGE
- fallbacks: zero tests, skip or todo, malformed or inconsistent TAP, nonzero exit, missing or duplicate row, missing or duplicate named evidence, unmapped evidence, and wrong row mapping all fail closed with typed diagnostics
- stateClasses: execution report is transient evidence only; no project, authoring, derived product, or shell state changes
- persistenceClass: no product persistence and no new journal
- migrations: NONE_BECAUSE_NO_STORED_SCHEMA_CHANGE
- recovery: rerun the deterministic current-head gate; stale results are never recovered as fresh evidence
- rollback: revert this bounded commit series before merge; after merge use a new explicit corrective contour
- performanceBudget: preserve existing thresholds; strict parsing is linear in bounded test output and outside product hot paths
- securityBoundary: child stdout and stderr are untrusted until strict report validation; no shell interpolation or product network
- lifecycle: spawn exact file set, parse complete report, validate counts and row definition, bind named evidence, reject uncovered output, publish report, enforce CI
- negativeBypassChecks: zero-test TAP, skipped test, missing row, duplicate row, missing named evidence, duplicate evidence, wrong-row mapping, unmapped evidence, malformed TAP, and exit-zero-without-coverage
- evidenceBindings: focused A7 contract, maintained Atlas event and release graphs, production matrix, RTK, performance, strict ops, OSS, renderer build, promotion, Electron, packaged lifecycle, PR CI, and exact merged-head checks
- currentReality: repairs only A7 production-negative gate truth; shipped Atlas runtime semantics and capability claims remain unchanged

### PRECHECK_RECORD
- CHECK_01_PRE_EXACT_BASE_AND_CLEAN_ISOLATION: PASS at 197fb1ca84e344f8c22885deb5cb78c058923e43 with an empty isolated T7 worktree
- CHECK_02_PRE_CANON_RESOLUTION: PASS for active canon v3.13a-final and active Atlas plan binding
- CHECK_03_PRE_FOCUSED_BASELINE: PASS with Atlas event 76 of 76, release truth 30 of 30, and production child graph 23 of 23
- CONTROLLER_RUNTIME_AUTHORITY: exact-main immutable reproduction returned pass true, rows 17, allCertified true for child stdout TAP 1..0
- T7_STORAGE: PASS for writable APFS FileVault volume UUID D1F2E2C1-3210-4A39-A4E0-0AA0AD5110E2
- PRESERVATION_RECEIPTS: owner checkout, frozen R1-C, active Word C5V2, and Word N4 heads and statuses captured before task writes

## IMPLEMENTATION_STEPS
0) Run OPS-GATE E0 on this artifact before production edits.
1) Define one fixed 17-row mapping from matrix identity to exact named product test assertions.
2) Parse the complete Node TAP report strictly and reject zero tests, skips, todos, malformed plans or summaries, duplicate test identity, missing counts, and exit mismatch.
3) Derive each row's executed and pass status only from its required named assertions; reject missing, duplicate, wrong-row, and unmapped evidence.
4) Add focused positive and decisive negative contracts without invoking the production matrix recursively.
5) Add an independent required-CI coverage-guard step and maintained release binding without changing product runtime or thresholds.
6) Update governance approvals and scope mapping for the exact changed bytes.
7) Run focused and complete required checks, commit semantic steps promptly, push, open PR, wait for required CI, merge normally, verify exact merged head, and remove only this task worktree and branch.

## CHECKS
CHECK_01_PRE_EXACT_BASE_AND_CLEAN_ISOLATION
CMD: verify task HEAD, origin main, T7 identity, protected worktrees, and empty isolated status
PASS: task HEAD and origin main equal binding base; T7 identity is exact; protected worktrees are unchanged; task worktree is clean

CHECK_02_PRE_CANON_RESOLUTION
CMD: resolve CANON_STATUS and read active canon, repo canon, COREX, BIBLE, CONTEXT, PROCESS, HANDOFF, doctrine, and relevant Atlas plan gates
PASS: A7 repair is admitted as one backend release-evidence contour with no UI route or product semantic change

CHECK_03_PRE_FOCUSED_BASELINE
CMD: run maintained Atlas event, release truth, and the current production child graph
PASS: current shipped behavior is recorded without treating aggregate green as repaired coverage

CHECK_04_PRE_OPS_GATE
CMD: node scripts/ops-gate.mjs --task docs/tasks/YALKEN_ATLAS_V6_A7_FALSE_GREEN_BOUNDED_REPAIR.md
PASS: exit 0 before production or contract edits

CHECK_05_POST_ALLOWED_DELTA_ONLY
CMD: verify every changed path belongs to ALLOWLIST
PASS: no unrelated delta exists

CHECK_06_POST_FOCUSED_A7
CMD: npm run test:atlas-v6-production-coverage
PASS: positive map binding and zero-test, skip, missing-row, duplicate-row, wrong-row, unmapped, malformed-report, and missing-evidence negatives are green

CHECK_07_POST_ATLAS_PRODUCT
CMD: npm run test:atlas-event-contract and npm run test:atlas-release-truth and npm run test:atlas-v6-production
PASS: maintained graphs and all 17 production rows bind fresh named passing evidence with nonzero tests and zero skips

CHECK_08_POST_STRICT_GOVERNANCE
CMD: GOVERNANCE_CHANGE_APPROVED=1 npm run test:ops and npm run design-os:doctrine and npm run oss:policy and npm run build:renderer
PASS: all commands exit 0

CHECK_09_POST_MAINTAINED_PRODUCT
CMD: npm run test:rtk and npm run test:atlas-graph and npm run test:performance
PASS: maintained RTK, Atlas graph, and unchanged performance thresholds are green

CHECK_10_POST_PROMOTION_AND_PACKAGED
CMD: npm run promotion:check and npm run test:electron and affected packaged Atlas lifecycle
PASS: promotion and production-equivalent packaged lifecycle remain green

CHECK_11_POST_DELIVERY
CMD: clean commits, push, PR checks, normal merge, fetch origin main, exact-tree verification, exact-head focused gates, and cleanup
PASS: all delivery flags complete without bypass and exact merged main contains the task commits

## STOP_CONDITION
- Stop with STOP_NOT_DONE on canon contradiction, wrong T7 identity, protected worktree mutation, dependency addition, product runtime change, UI expansion, reduced threshold, incomplete row evidence, unrepairable base drift, failed required check, or delivery step that cannot complete normally.
- Stop with STOP_NOT_DONE rather than accepting aggregate exit success, fixture-only evidence, skips, malformed reports, stale results, branch-protection bypass, or self-certification.
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
- Do not widen Atlas scope, product semantics, interface scope, dependencies, network scope, thresholds, or delivery authority.
- Do not claim PASS; the next authority is a fresh independent exact-head audit.
