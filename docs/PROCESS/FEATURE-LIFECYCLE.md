# Feature Lifecycle (Canon)

Rules:
- Stages MUST NOT be skipped.
- Rollback is allowed only to the previous stage.
- SCN is required before introducing any new abstractions or contracts.

## SCN
- **Purpose**: Describe the user-visible scenario that anchors the work.
- **Entry condition**: DONE when the scenario is written and scoped (no implementation).
- **Exit artifact**: Scenario document section(s) describing SCN-IDs and expected observables.

## Contracts
- **Purpose**: Define stable public shapes needed by the scenario.
- **Entry condition**: DONE when contracts are declared and centrally exported.
- **Exit artifact**: Contract files in `src/contracts/*.contract.ts` with complete re-export surface in `src/contracts/index.ts`.

## CORE
- **Purpose**: Implement the scenario logic in a platform-neutral core.
- **Entry condition**: DONE when core APIs align with declared contracts.
- **Exit artifact**: CORE changes satisfying the scenario with no platform coupling.

## Adapters
- **Purpose**: Connect CORE to external IO via thin translation layers.
- **Entry condition**: DONE when adapter boundaries are defined by contracts.
- **Exit artifact**: Adapter implementations mapping IO to contracts and CORE ports.

## UI
- **Purpose**: Provide user interaction that drives the scenario via contracts.
- **Entry condition**: DONE when UI flows are mapped to commands/events.
- **Exit artifact**: UI behavior that emits commands and reacts to events.

## Smoke
- **Purpose**: Run repeatable sanity checks to prevent drift.
- **Entry condition**: DONE when checks are executable and pass on a clean tree.
- **Exit artifact**: Passing smoke check result demonstrating invariants hold.

## Release
- **Purpose**: Package the current state as a releasable milestone.
- **Entry condition**: DONE when smoke checks pass and artifacts are consistent.
- **Exit artifact**: A recorded release outcome for the milestone.
