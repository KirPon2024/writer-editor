# OPS-RUNTIME-GLOSSARY (CONTOUR-C)

## STATUS
Draft glossary for CONTOUR-C Phase 1.

## PURPOSE
Define runtime and causality terms for CONTOUR-C using repository-oriented definitions.

## TERMS

### command
Definition: a request sent to Core to compute a domain transition.

### intent
Definition: a structured runtime request that describes an action to perform and its policy-relevant inputs, without embedding domain decision rules.

### execution
Definition: the runtime process that takes a command and produces an observable result and diagnostics under deterministic ordering rules.

### orderingKey
Definition: a stable key that defines a single-writer execution lane for causality and deterministic ordering.

### executionQueue
Definition: a runtime queue associated with one orderingKey lane that enforces ordering, backpressure, and overflow outcomes.

### causality
Definition: deterministic rules that define which runtime-visible outcomes can follow which inputs for a given orderingKey.

### logicalTimestamp
Definition: a non-wall-clock ordering token sufficient to deterministically order runtime trace records within one orderingKey.

### effect
Definition: an external action invoked by runtime as part of executing a command outcome, executed outside Core policy.

### effect attempt
Definition: a single try of executing an effect, identified by a monotonically increasing counter starting at 1.

### terminalStatus
Definition: the terminal outcome classification of a command or effect execution: success, failure, or abandoned.

### backpressure
Definition: deterministic runtime behavior that limits work in flight by enforcing queue capacity and explicit overflow outcomes.

### overflow
Definition: the condition where a runtime queue cannot accept more work and must produce an explicit and deterministic overflow outcome.

### retry
Definition: an explicit runtime decision to schedule a subsequent attempt for a failed effect under deterministic policy rules.

### drop
Definition: an explicit overflow outcome where a unit of work is not executed and the drop is recorded as diagnostics.

### reject
Definition: an explicit overflow outcome where a unit of work is refused and the rejection is recorded as diagnostics.

### diagnostics
Definition: structured, machine-checkable records that describe execution outcomes and boundary-relevant facts without UI dependency.

### trace
Definition: a structured sequence of runtime diagnostic records that is sufficient to reconstruct execution ordering and outcomes for one orderingKey.

### idempotency key
Definition: a stable key used to deduplicate non-idempotent effects across replays, retries, or crashes.

## NON-GOALS
- Define UI/UX behavior.
- Define schema evolution or public contract versioning beyond declared Phase-4 runtime contracts.
- Define storage format evolution beyond declared inventories.
