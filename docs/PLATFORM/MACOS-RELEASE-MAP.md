# macOS Release Map

## Purpose
- Provide a boundary-focused map of what “release-ready” means in this context.
- Keep expectations explicit while staying implementation-neutral.

## Scope
- Applies only to the macOS release boundary.
- Describes constraints, interfaces, and minimal expectations.

## Required Adapters
- A small set of adapters that connect the platform boundary to CORE via contracts.
- Adapters remain thin translation layers rather than feature logic holders.
- Each adapter responsibility is expressed as inputs/outputs, not as implementation steps.

## Forbidden Dependencies
- Platform-specific concerns do not leak into CORE.
- Public contracts remain independent of platform concerns.
- Release mapping does not introduce new runtime dependencies.

## Release Prerequisites
- Stable public contract surface for cross-layer shapes.
- CORE behavior remains platform-neutral and free of effectful tokens by policy.
- Minimal adapter set is identified and scoped to the release boundary.

## Signing and Notarization (Placeholder)
- Placeholder for compliance requirements at the macOS release boundary.
- Details are intentionally not specified here.
- The map records that the topic exists without prescribing execution.

## Minimal UX Surface
- A minimal, coherent UX surface that exercises the release boundary.
- UX scope is defined by user-facing expectations, not by internal structure.
- UX does not redefine contracts or CORE responsibilities.

## Non-Goals
- This document is not an implementation guide.
- It does not define platform-specific build pipelines.
- It does not commit to future contours or future delivery plans.
