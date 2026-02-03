# CORE

CORE is the source of truth.

## Scope
- Owns product rules and state transitions.
- Does not depend on UI, platform, or persistence.

## Boundaries
- Everything outside CORE is replaceable (UI, platform, persistence, IO).

## Bootstrap (A4)
- No logic, implementations, dependencies, or architectural commitments in this layer yet.
