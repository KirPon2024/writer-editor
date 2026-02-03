# OPS TEST-CONTOUR

## Purpose
TEST-CONTOUR describes a lightweight testing mode used to prevent drift while keeping infrastructure minimal.
It complements the main contour by providing repeatable confidence signals when changes warrant them.

## Scope
- Node-only execution.
- Focus on repeatability and fast feedback.
- Applies when a change impacts contracts, scenarios, or CORE/adapter boundaries.

## Non-Goals
- Heavy infrastructure.
- Full system verification.
- Always-on enforcement for every change.

## Test Classes
- SMOKE
- CONTRACT_SHAPE
- SCENARIO_REPLAY

## Activation Rules
- Activated when a change increases drift risk or touches cross-layer boundaries.
- Not always-on; it is enabled when needed to regain confidence.

## Outputs
- A clear PASS/FAIL outcome.
- Minimal diagnostics sufficient to localize the failing class.
- A stable record that the testing mode was applied when required.
