# CODEX_RUNNER_PROFILE

## PURPOSE
- Зафиксировать фактами профиль запуска Codex для режима `prompt_disabled`.

## PROFILE MODE
- `promptMode`: `prompt_disabled` (target mode для PR-1).
- Этот PR фиксирует конфигурацию и проверки.
- Synthetic proof для реального write-flow выполняется в PR-2.

## OBSERVABLE SIGNALS
- `markerRegex` из policy:
  - `(permission|allowlist|approve|apply\\s+changes)`
- `exitCodeOnPrompt`:
  - `97`
- Признак блокировки:
  - при появлении prompt выполнение считается проваленным (`PROMPT_MODE_UNPROVEN`/`PROMPT_NOT_ELIMINATED`).

## EXECUTION NOTE (PR-1)
- Разрешена только bootstrap-проверка конфигурации.
- Ручной выбор кнопок в UI не является штатным механизмом.
- Если prompt остаётся неизбежным на этапе synthetic проверок, режим должен переходить в stop-state, а не в операторский выбор.

## CONSTRAINTS
- Никаких `src/**` изменений.
- Никаких `.github/**` изменений.
- Никаких CI/gate реформ в этом PR.
