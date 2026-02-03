# ADR-ROADMAP-SUPERSEDED

## Status
Accepted

## Context
Historically, the project accumulated roadmap documents (M1–M11 and similar) that described intended directions and sequences.
These roadmaps are not shaped as executable artifacts and do not provide enforceable constraints for day-to-day work.
This creates drift: different readers may treat them as requirements even when the operating constraints have moved on.

## Decision
Legacy roadmaps (M1–M11 and similar) are treated as historical context only and are not executable artifacts.
The current executable canon for work is expressed through CONTOUR-A and HARD-TZ tasks.

## Consequences
- Roadmap documents remain as reference for past intent, but they are not used as inputs for execution.
- Work is driven by executable, allowlist-bounded tasks and contour constraints, reducing ambiguity.
- Canon is separated from historical notes, lowering the chance of accidental drift.
