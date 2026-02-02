Назначение: зафиксировать расхождения между docs/CANON.md и текущими декларативными документами (COREX/BIBLE) фактами.

GAP-ENTRY
Invariant: "The UI Runtime MUST NOT be a source of truth." (docs/CANON.md — GLOBAL LAWS)
Current_State: docs/corex/COREX.v1.md — 5.1 "Инвариант (неподвижно)"; 6.5 "UI Runtime"
Gap: Invariant states UI Runtime MUST NOT be a source of truth; Current_State does not explicitly state this prohibition for UI Runtime.
Planned_Task_ID: TBD

GAP-ENTRY
Invariant: "The Core MUST NOT depend on UI, platform, or persistence mechanisms." (docs/CANON.md — GLOBAL LAWS)
Current_State: docs/corex/COREX.v1.md — 3) "Законы системы (не нарушаются)"; 6) "Слои системы"
Gap: Current_State states Core↔UI separation, but does not explicitly state Core independence from platform and persistence mechanisms.
Planned_Task_ID: TBD

GAP-ENTRY
Invariant: "All observable consequences SHOULD be represented as Events." (docs/CANON.md — GLOBAL LAWS)
Current_State: docs/corex/COREX.v1.md — 6.3 "Boundary / Ports" (includes "Event Bus")
Gap: Current_State names an Event Bus component, but does not explicitly state that observable consequences are represented as Events.
Planned_Task_ID: TBD

GAP-ENTRY
Invariant: "Architecture MUST be expressible as data and compiled deterministically." (docs/CANON.md — GLOBAL LAWS)
Current_State: docs/corex/COREX.v1.md — 10) "Архитектура изменения (ключевой слой)"
Gap: Current_State states architecture is described as data, but does not explicitly state compilation into registries or deterministic compilation.
Planned_Task_ID: TBD

GAP-ENTRY
Invariant: "YALKEN v1.1 is a deterministic Core with explicit Ports, Commands, and Events; everything outside the Core (platform, UI, plugins, and modes) is replaceable and MUST not become a source of truth." (docs/CANON.md — FINAL INVARIANT)
Current_State: docs/corex/COREX.v1.md — 2) "Манифест-формула (канон)"; docs/BIBLE.md — 17) "ФИНАЛЬНЫЙ СТАТУС"
Gap: Current_State documents layering and process determinism, but does not explicitly state determinism as a required property of the Core.
Planned_Task_ID: TBD
