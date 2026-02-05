VIEW_ONLY: CONTOUR_C_PHASE_1

# Runtime trace sinks and replay boundary

This note describes the boundary between producing structured runtime trace records and using those records for replay-style validation in tests without UI involvement.

## What is a trace sink

A trace sink is a storage location where structured trace records are written. The sink can be a directory tree or a file set that groups trace artifacts by scenario, execution lane, or other stable identifiers.

In this context, the sink is treated as an evidence-bearing location: it holds trace artifacts that can be inspected and used as inputs to automated validation.

## Headless production

Headless production refers to producing trace records as part of running logic without relying on UI rendering, user interaction, or GUI-driven flows. In practice, headless production is associated with running runtime code paths in tests, scripts, or process runs that do not require a windowed environment.

## Replay and validation without UI

Replay refers to taking stored trace artifacts and using them to validate ordering, outcomes, and boundary facts in a repeatable way. Validation without UI means the checks focus on structured records and their relationships rather than screen state or user-visible rendering.

Typical validation reads trace records, groups them by `orderingKey` and `executionId`, and compares observed sequences and terminal outcomes across repeated runs.

## Examples of evidence-bearing paths

Examples of repository paths that can hold trace artifacts or trace-derived evidence:
- `test/**`
- `test/fixtures/**`
- `docs/OPS/*.json`
- `src/**` (tests and test utilities)

